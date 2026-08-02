#!/usr/bin/env bash
# One-command staging deploy. Runbook & design rationale: Backend/DEPLOY.md.
# Usage:
#   ./scripts/deploy.sh              deploy origin/main
#   ./scripts/deploy.sh <git-ref>    deploy a tag/SHA (also the manual-rollback path)
#   SEED_MOCK=true ./scripts/deploy.sh   additionally (re)apply the mock-scenario seed
#
# -E (errtrace) is REQUIRED: without it the ERR trap does not fire for failures inside
# functions (gen_env, compose wrapper) and the rollback would be silently skipped.
set -Eeuo pipefail

export COMPOSE_FILE=docker-compose.staging.yml
# Must match the project name of the ALREADY-RUNNING stack on the VM (dir name "Backend" → "backend"),
# so existing containers/volumes (backend_pgdata, backend_redisdata) are reused, not shadowed.
export COMPOSE_PROJECT_NAME=backend

IMAGE=disaster-backend
LOCK_FILE=/var/lock/disaster-deploy.lock
GCS_BUCKET="gs://wanguard-250923-db-backups"    # created by the one-time bootstrap (30-day lifecycle)
READYZ_URL=http://localhost:8000/readyz
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Globals shared with the failure trap
STAGE=pre            # pre -> worktree -> service
OLD_SHA=""
LAST_BACKUP="(none)"

compose() { docker compose "$@"; }               # NEVER call docker compose directly (C2)
log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

wait_ready() {
    local i
    for i in $(seq 1 12); do
        curl -fsS "$READYZ_URL" >/dev/null 2>&1 && return 0
        sleep 5
    done
    return 1
}

on_failure() {
    local rc=$?
    # Best-effort recovery: drop errexit and the trap so a failing recovery command
    # cannot abort the handler before the diagnostics are printed (review S2).
    trap - ERR
    set +e
    printf '\nDEPLOY FAILED (exit=%s, stage=%s)\n' "$rc" "$STAGE" >&2
    case "$STAGE" in
        worktree)   # failed before touching the running service: restore worktree only (C5)
            git checkout --detach "$OLD_SHA"
            printf 'Worktree restored to %s; running service was never touched.\n' "$OLD_SHA" >&2
            printf 'NOTE: DB schema may have advanced. Backup: %s\n' "$LAST_BACKUP" >&2
            ;;
        service)    # new version failed readiness: full rollback on the previous image
            printf 'Rolling back service to previous image...\n' >&2
            git checkout --detach "$OLD_SHA"
            if docker image inspect "$IMAGE:prev" >/dev/null 2>&1; then
                docker tag "$IMAGE:prev" "$IMAGE:latest"
                compose up -d --no-build --force-recreate backend
                if wait_ready; then
                    printf 'Rolled back to %s and healthy again.\n' "$OLD_SHA" >&2
                else
                    printf 'OLD VERSION ALSO UNHEALTHY — manual intervention required.\n' >&2
                    printf 'Inspect: docker compose logs backend ; docker compose ps\n' >&2
                fi
            else
                printf 'No %s:prev image (first deploy?) — manual intervention required.\n' "$IMAGE" >&2
            fi
            printf 'NOTE: DB schema may have advanced (migrations are forward-only).\n' >&2
            printf 'Backup: %s — restore manually if needed.\n' "$LAST_BACKUP" >&2
            ;;
        *)  printf 'Nothing was changed.\n' >&2 ;;
    esac
    exit "$rc"
}

gen_env() {     # .env is a deploy-time artifact: compose interpolation + container env share it (S7)
    log "generating .env from Secret Manager"
    local secret_key pg_pw smtp_key nextauth_secret google_secret line_secret tunnel_token
    secret_key=$(gcloud secrets versions access latest --secret=staging-backend-jwt-signing-key)
    pg_pw=$(gcloud secrets versions access latest --secret=staging-backend-postgres-password)
    smtp_key=$(gcloud secrets versions access latest --secret=staging-backend-smtp2go-api-key)
    # Frontend (Next.js) + Cloudflare Tunnel secrets — shared with the frontend/cloudflared containers.
    nextauth_secret=$(gcloud secrets versions access latest --secret=staging-frontend-nextauth-secret)
    google_secret=$(gcloud secrets versions access latest --secret=staging-frontend-google-client-secret)
    line_secret=$(gcloud secrets versions access latest --secret=staging-frontend-line-client-secret)
    tunnel_token=$(gcloud secrets versions access latest --secret=staging-cloudflared-tunnel-token)
    # Backend values are embedded unquoted in the .env AND the asyncpg DSN URL: restrict to a charset
    # safe for compose's .env parser, the URL, and shell.
    # NOT die: an explicit exit bypasses the ERR trap; `false` trips it so the worktree is restored.
    [[ "$pg_pw" =~ ^[A-Za-z0-9_-]+$ ]] \
        || { printf 'ERROR: postgres password has .env/DSN-unsafe characters\n' >&2; false; }
    [[ "$secret_key" =~ ^[A-Za-z0-9_-]+$ ]] \
        || { printf 'ERROR: backend jwt key has .env-unsafe characters\n' >&2; false; }
    [[ "$smtp_key" =~ ^[A-Za-z0-9_-]+$ ]] \
        || { printf 'ERROR: smtp2go key has .env-unsafe characters\n' >&2; false; }
    # Frontend secrets/token go into plain KEY=value (not a URL), so only newlines would corrupt the
    # dotenv file — OAuth secrets / tunnel tokens may legitimately contain + / = and are fine unquoted.
    for v in "$nextauth_secret" "$google_secret" "$line_secret" "$tunnel_token"; do
        [[ -n "$v" && "$v" != *$'\n'* ]] \
            || { printf 'ERROR: a frontend secret is empty or multi-line\n' >&2; false; }
    done
    # Two files for least privilege: backend secrets (DB password, JWT key) NEVER reach the
    # public-facing frontend/cloudflared containers. Non-secret config is shared (harmless).
    rm -f .env .env.frontend   # recreate under umask 177 so both are 0600
    umask 177
    {
        printf '# GENERATED by deploy.sh %s — do not edit; regenerated every deploy\n' \
            "$(date -u +%FT%TZ)"
        printf 'POSTGRES_PASSWORD=%s\n' "$pg_pw"
        printf 'SQLALCHEMY_DATABASE_URL=postgresql+asyncpg://postgres:%s@db:5432/postgres\n' "$pg_pw"
        printf 'REDIS_URL=redis://redis:6379\n'
        printf 'SECRET_KEY=%s\n' "$secret_key"
        printf 'SMTP2GO_API_KEY=%s\n' "$smtp_key"
        cat scripts/deploy-config.staging.env
    } > .env
    {
        printf '# GENERATED by deploy.sh %s — do not edit; regenerated every deploy\n' \
            "$(date -u +%FT%TZ)"
        printf 'NEXTAUTH_SECRET=%s\n' "$nextauth_secret"
        printf 'AUTH_SECRET=%s\n' "$nextauth_secret"
        printf 'GOOGLE_CLIENT_SECRET=%s\n' "$google_secret"
        printf 'LINE_CLIENT_SECRET=%s\n' "$line_secret"
        printf 'TUNNEL_TOKEN=%s\n' "$tunnel_token"
        cat scripts/deploy-config.staging.env
    } > .env.frontend
    umask 022
}

main() {
    cd "$BACKEND_DIR"
    local target_ref="${1:-origin/main}" start_ts
    start_ts=$(date +%s)

    exec 9>"$LOCK_FILE"
    flock -n 9 || die "another deploy is already in progress"

    log "[1/9] preflight"
    docker info >/dev/null 2>&1 || die "docker daemon not running"
    command -v gcloud >/dev/null || die "gcloud not installed"
    command -v gsutil >/dev/null || die "gsutil not installed"
    command -v curl >/dev/null || die "curl not installed"
    [[ "$GCS_BUCKET" != *CHANGE_ME* ]] || die "GCS_BUCKET not configured (see bootstrap)"
    gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
        || die "no active gcloud identity (VM service account?)"
    [ -z "$(git status --porcelain)" ] || die "git working tree not clean"

    log "[2/9] recording rollback baseline (from the RUNNING container, not tags)"
    OLD_SHA=$(git rev-parse HEAD)
    local running_ctr running_img
    # Prefer the RUNNING container; fall back to stopped ones (crashed backend still has the right image).
    running_ctr=$(compose ps -q backend | head -n1 || true)
    [ -n "$running_ctr" ] || running_ctr=$(compose ps -aq backend | head -n1 || true)
    if [ -n "$running_ctr" ]; then
        running_img=$(docker inspect --format '{{.Image}}' "$running_ctr")
        docker tag "$running_img" "$IMAGE:prev"
        log "baseline: sha=$OLD_SHA image=$running_img"
    else
        log "WARNING: no existing backend container (first deploy?) — image rollback unavailable"
    fi

    log "[3/9] checking out ${target_ref}"
    git fetch --all --tags --prune
    trap on_failure ERR
    STAGE=worktree                      # from here, any failure restores the worktree
    git checkout --detach "$target_ref"
    log "deploying $(git rev-parse --short HEAD): $(git log -1 --format=%s)"

    log "[4/9] generating .env (after checkout, so new refs can add variables)"   # S2
    gen_env

    log "[5/9] building backend + frontend images"
    compose build backend frontend

    log "[6/9] starting db + redis (waiting for healthy)"
    compose up -d --wait db redis

    log "[7/9] backing up DB to GCS before migrate"
    local ts
    ts=$(date +%Y%m%d-%H%M%S)
    LAST_BACKUP="$GCS_BUCKET/pre-deploy-$ts.sql.gz"
    compose exec -T db pg_dump -U postgres postgres | gzip | gsutil -q cp - "$LAST_BACKUP"
    log "backup done: $LAST_BACKUP"

    log "[8/9] migrate + seeds (in one-off backend containers — old container lacks new files)"  # C3
    compose run --rm backend alembic upgrade head
    # PYTHONPATH: the script imports `app.*`; WORKDIR is /app but `python scripts/x.py` puts only
    # scripts/ on sys.path (alembic is unaffected — its env.py resolves paths itself).
    compose run --rm -e PYTHONPATH=/app backend python scripts/seed_rbac.py
    if [ "${SEED_MOCK:-false}" = "true" ]; then
        log "applying mock-scenario seed (SEED_MOCK=true)"
        compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
            < scripts/seed_mock_scenarios.sql
    fi

    log "[9/9] starting new backend + frontend + tunnel, waiting for backend readiness"
    STAGE=service                       # from here, failure = full image rollback
    compose up -d backend frontend cloudflared
    wait_ready || false                 # backend readiness gates rollback (frontend/tunnel do not)

    trap - ERR
    # Frontend + tunnel are NOT part of the rollback gate (backend-only). Warn-only smoke check.
    if curl -fsS --max-time 10 https://demo.wan-guard.com >/dev/null 2>&1; then
        log "frontend reachable via tunnel: https://demo.wan-guard.com"
    else
        log "WARN: https://demo.wan-guard.com not reachable yet (frontend/tunnel may still be starting)"
    fi
    docker image prune -f >/dev/null || true    # dangling only; :latest/:prev survive; never fail a good deploy
    log "DEPLOY OK — $(git rev-parse --short HEAD) in $(( $(date +%s) - start_ts ))s"
    log "rollback hint: ./scripts/deploy.sh $OLD_SHA"
}

main "$@"
