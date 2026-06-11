#!/usr/bin/env bash
# One-command staging deploy. Design: docs/plans/2026-06-09-deploy-flow-design.md (rev 2).
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
GCS_BUCKET="gs://CHANGE_ME-db-backups"          # set once: the bucket from the bootstrap step
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

main() {
    cd "$BACKEND_DIR"
    local target_ref="${1:-origin/main}" start_ts
    start_ts=$(date +%s)

    exec 9>"$LOCK_FILE"
    flock -n 9 || die "another deploy is already in progress"

    log "[1/9] preflight"
    docker info >/dev/null 2>&1 || die "docker daemon not running"
    command -v gcloud >/dev/null || die "gcloud not installed"
    command -v curl >/dev/null || die "curl not installed"
    [[ "$GCS_BUCKET" != *CHANGE_ME* ]] || die "GCS_BUCKET not configured (see bootstrap)"
    gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
        || die "no active gcloud identity (VM service account?)"
    [ -z "$(git status --porcelain)" ] || die "git working tree not clean"

    log "[2/9] recording rollback baseline (from the RUNNING container, not tags)"
    OLD_SHA=$(git rev-parse HEAD)
    local running_ctr running_img
    running_ctr=$(compose ps -aq backend || true)
    if [ -n "$running_ctr" ]; then
        running_img=$(docker inspect --format '{{.Image}}' "$running_ctr")
        docker tag "$running_img" "$IMAGE:prev"
        log "baseline: sha=$OLD_SHA image=$running_img"
    else
        log "WARNING: no existing backend container (first deploy?) — image rollback unavailable"
    fi

    # ---- steps 3..9 appended in Tasks 6–7 ----
}

main "$@"
