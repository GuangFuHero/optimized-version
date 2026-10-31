# Staging Deployment Guide (deploy.sh)

One-command deploy of the backend and the two Next apps (the site and the back office) to the GCP staging VM:
backup → migrate → seed → restart → readiness check, with automatic rollback of the backend on failure. First
validated on the real VM on 2026-06-12.

---

## TL;DR — day-to-day deploys

```bash
# SSH into the VM (resolves the current IP automatically)
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a

# Deploy latest origin/main
cd /opt/wanguard/Backend && ./scripts/deploy.sh

# Deploy a specific tag/SHA (this is also how you manually roll back)
./scripts/deploy.sh <git-ref>

# Additionally (re)build the mock scenario data (demo environments only)
SEED_MOCK=true ./scripts/deploy.sh

# Rebuild only the back office; the site keeps the image it runs. NEXT_APPS="" rebuilds neither Next app.
NEXT_APPS=admin ./scripts/deploy.sh
```

Success looks like `[1/9] preflight` → … → `DEPLOY OK — <sha> in <N>s`, followed by a rollback hint.
A full deploy took 851 s on 2026-10-22, before the back office was added; most of it is the image builds.

`NEXT_APPS` names the Next apps to rebuild: `frontend` (the site) and `admin` (the back office). Unset, it
rebuilds both: everything runs the commit you deploy. Leave an app out only when the commit changes nothing
under `Frontend/` that it uses (its `apps/<app>/`, the `libs/` it imports, the lockfile, the Dockerfile).
When unsure, rebuild both.

## Accessing the backend from your machine (SSH tunnel)

Firewall keeps :8000 closed to the internet; use an SSH tunnel for local frontend testing:

```bash
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a -- -N -L 8000:localhost:8000
```

While that runs, `http://localhost:8000` on your machine IS the staging backend
(`curl http://localhost:8000/readyz` → `{"status":"ready"}`). Point the local frontend's API base
URL at it. `-N` keeps a forward-only session; drop it if you also want a shell.

### Inspecting the DB from your machine (DBeaver / psql)

Postgres is published on the VM's **loopback only** at `127.0.0.1:5432` (never on the public
interface). Tunnel it — pick any free LOCAL port; 5433 is handy if your local dev DB already
occupies 5432 on your machine:

```bash
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a -- -N -L 5433:localhost:5432
```

Then connect your DB client to `localhost:5433`, user `postgres`, database `postgres`. The password
is no longer the dev default — fetch it from Secret Manager:

```bash
gcloud secrets versions access latest --secret=staging-backend-postgres-password
```

---

## Environment facts (staging VM)

| Item | Value |
|------|-------|
| GCP project / VM | `wanguard-250923` / `wanguard-test-01` (asia-east1-a), e2-medium: 2 vCPU, 4 GB RAM |
| Repo path on VM | `/opt/wanguard` |
| Compose file | `docker-compose.staging.yml`, compose project name pinned to `backend` |
| Data | Named volumes `backend_pgdata` / `backend_redisdata` — **survive all deploys** |
| Published ports | Backend `:8000`; Postgres on **loopback only** (`127.0.0.1:5432`, for SSH-tunnel inspection); Redis internal-only |
| GCP firewall | Only 22/SSH open. **8000 is NOT open** — access via SSH tunnel until a firewall rule (or Caddy/HTTPS) is added for the frontend |
| External IP | Static `34.80.0.121` (reserved as `wanguard-prod-external-ip`). 簡訊王 and TGOS only accept API calls from this registered IP — releasing it breaks SMS (`statuscode=k`) and address lookups. Still connect via `gcloud compute ssh` |
| Secrets | GCP Secret Manager: `staging-backend-{jwt-signing-key,postgres-password,smtp2go-api-key,kotsms-username,kotsms-password,google-client-secret,line-channel-secret,tgos-addr-app-id,tgos-addr-api-key,tgos-geo-app-id,tgos-geo-api-key}`, `staging-cloudflared-tunnel-token`. The Next apps hold no secret. `staging-frontend-{nextauth-secret,google-client-secret,line-client-secret}` are read by nothing once the back office has deployed (see [Deploying the back office](#deploying-the-back-office)) |
| SMS | 簡訊王 (KotSMS), `SMS_PROVIDER=kotsms` written by `gen_env`. Messages are signed 島嶼守望, the 實名制 identity the account is approved for; a mismatch is dropped by the carrier while the API still answers `statuscode=1`. **Takes two deploys to switch on**: a running `deploy.sh` keeps the `gen_env` it parsed before checkout, so the first deploy that ships the KotSMS lines still writes the old `.env` (SMS stays on `console`); the next deploy writes them |
| Backups | `gs://wanguard-250923-db-backups` |
| Swap | 2 GB `/swapfile`, `vm.swappiness=10` — prevents the OOM killer hitting Postgres during image builds. With the stack idle, about 1 GB of it was in use on 2026-10-23, so the two Next apps build one at a time |
| Disk | Before each deploy, `deploy.sh` prunes build cache older than 7 days and stops if less than 5 GB is then free under Docker's root. 22 GB was free on 2026-10-23 |

---

## What deploy.sh actually does (9 steps)

```
1. preflight    docker daemon up; gcloud/gsutil/curl installed; GCS bucket configured;
                active gcloud identity; git working tree clean; NEXT_APPS names only frontend/admin;
                prune build cache older than 7 days, then stop if under 5 GB is free
2. baseline     record current HEAD; tag the RUNNING container's image as disaster-backend:prev
                (this is the image rollback target — taken from reality, not from tags)
3. checkout     git fetch + checkout of the target ref (default origin/main)
4. .env         generated from Secret Manager + scripts/deploy-config.staging.env (mode 0600);
                regenerated on EVERY deploy — never edit .env by hand on the VM
5. build        docker compose build db backend, then each Next app in NEXT_APPS (default: frontend,
                admin) one at a time
6. infra up     start db + redis, wait until healthy
7. backup       pg_dump | gzip | upload to GCS — if the backup fails, migration is NOT attempted
8. migrate+seed alembic upgrade head → seed_rbac.py (idempotent) → mock seed (only if SEED_MOCK=true)
9. restart+gate start the new backend + frontend + admin + tunnel + retention → curl /readyz,
                retried 12 × 5s (60s budget) — only a passing readiness check counts as a
                successful deploy (the Next apps and the retention loop are not part of the
                readiness gate); then a warn-only curl of both public hostnames
```

Design rules baked into the script:
- Every compose call goes through a wrapper pinned to `COMPOSE_FILE=docker-compose.staging.yml` and
  `COMPOSE_PROJECT_NAME=backend`. Never run bare `docker compose` in `Backend/` on the VM — it would
  pick up the dev compose file (published DB ports, `--reload`, hardcoded dev credentials).
- Migrations and seeds run in **one-off containers from the freshly built image** (`compose run --rm`),
  not in the old running container (which doesn't contain the new files).
- In-container Python scripts need `-e PYTHONPATH=/app` (the local `PYTHONPATH=.` convention doesn't
  exist inside the image; without it `import app.*` fails).
- Concurrency: a flock on `/var/lock/disaster-deploy.lock` makes a second concurrent deploy fail
  immediately with "another deploy is already in progress". The lock is released when the process
  exits (including crashes) — there are no stale-lock cleanup steps to run.
- One `Frontend/Dockerfile` builds either Next app, picked by the `APP` build arg (`demo` is the site,
  `admin` the back office). The `pnpm install` layer comes before `APP`, so the second app's build reuses
  the first one's install. The two builds never run at once: on 4 GB they could wake the OOM killer.
- The Next apps are not part of the rollback. A Next app that fails to start still ends in `DEPLOY OK`, and
  the warn-only check at the end says which host did not answer. To roll one back, deploy the previous ref.
- The prune at preflight removes build cache only. Images stay, `disaster-backend:prev` (the rollback
  target) included.

---

## Sign-in (cookie session and OAuth)

The backend signs browsers in itself (`Spec/023-backend-session-login`, ADR-325 to ADR-331). It sets the
session cookies on the parent domain of the site and the back office, so one sign-in covers both, and it runs
the Google and LINE sign-in with the client secrets. The browser never talks to the backend directly: it goes
through the Next app's proxy (`/api/v1/*`), so the provider calls back to the site's host.

### Settings

Staging's values are in `scripts/deploy-config.staging.env`. `gen_env` appends it to `.env` (the backend) and
`.env.frontend` (the site), and the back office's container reads it as it is. Both Next apps read
`AUTH_COOKIE_PREFIX`, `SITE_APP_URL` and `ADMIN_APP_URL` too. The back office reads `SITE_APP_URL` at request
time for its links to the site's map: 回到前台 in the sidebar, and the way back on the page it shows an account
with no back-office identity; without it neither link shows. The site reads it at request time too, as the
origin of the links and the link-preview card its pages hand out; without it, it takes the host the request
names, which any client can forge, so a deployed site must have it. The OAuth secrets are written to the
backend's `.env` only. Production does not exist yet; its column is the plan.

| Setting | Production | Staging | Local |
|---------|------------|---------|-------|
| `AUTH_COOKIE_PREFIX` | `wg` | `wgstg` | `wgdev` (default) |
| `AUTH_COOKIE_DOMAIN` | `.wan-guard.com` | `.wan-guard.com` | empty (default): the cookie stays on `localhost` |
| `AUTH_COOKIE_SECURE` | `true` | `true` | `false`, set in `docker-compose.yml`; a browser drops a `Secure` cookie over http |
| `AUTH_ALLOWED_ORIGINS` | `https://wan-guard.com,https://admin.wan-guard.com` | `https://staging.wan-guard.com,https://admin-staging.wan-guard.com` | `http://localhost:3000,http://localhost:3001` (default) |
| `SITE_APP_URL` | `https://wan-guard.com` | `https://staging.wan-guard.com` | `http://localhost:3000` (default) |
| `ADMIN_APP_URL` | `https://admin.wan-guard.com` | `https://admin-staging.wan-guard.com` | `http://localhost:3001` (default) |
| `OAUTH_REDIRECT_BASE_URL` | `https://wan-guard.com` | `https://staging.wan-guard.com` | `http://localhost:3000` (default) |
| `GOOGLE_CLIENT_SECRET`, `LINE_CHANNEL_SECRET` | Secret Manager | `staging-backend-google-client-secret`, `staging-backend-line-channel-secret`, written by `gen_env` | `Backend/.env` |
| `REFRESH_REUSE_GRACE_SECONDS` | `30` (default) | `30` (default) | `30` (default) |

- **Why `admin-staging` and not `admin.staging`**: Cloudflare's free certificate covers `wan-guard.com` and
  one level of subdomain below it. `admin.staging.wan-guard.com` is two levels deep and would get no
  certificate.
- **What that costs**: staging's cookies now sit on `.wan-guard.com` like production's, so each
  environment's cookies reach the other's hosts. The prefixes keep them apart: a backend reads only its own
  prefix, and each has its own signing key. The frontend servers still receive the other environment's
  cookies (ADR-326). Separating the two completely takes a separate registrable domain for staging, to be
  decided before production launches.
- A provider whose secret is empty refuses to start a sign-in: the browser lands on
  `/login?error=oauth_request_invalid`.
- An environment that forgets `AUTH_ALLOWED_ORIGINS` refuses every cookie-authenticated write with 403
  `origin_not_allowed` (ADR-327).

### Cloudflare Tunnel hostnames

| Hostname | Service |
|----------|---------|
| `staging.wan-guard.com` (was `demo.wan-guard.com`) | `http://frontend:3000` |
| `admin-staging.wan-guard.com` | `http://admin:3000` |

Both are public hostnames of the staging tunnel, set in the Cloudflare Zero Trust dashboard.

`APP_BASE_URL`, the base of the links in emails and SMS, moved to `https://staging.wan-guard.com` too.

### Redirect URIs to register

Register these before the first deploy, or that provider's sign-in fails at the provider with a
redirect URI mismatch:

- Google Cloud console, OAuth client `717563375943-pibc1j3t…` → Authorized redirect URIs:
  - `https://staging.wan-guard.com/api/v1/auth/oauth/google/callback`
  - `http://localhost:3000/api/v1/auth/oauth/google/callback`
- LINE Developers, channel `2010287145` → LINE Login → Callback URL:
  - `https://staging.wan-guard.com/api/v1/auth/oauth/line/callback`
  - `http://localhost:3000/api/v1/auth/oauth/line/callback`: registered on 2026-10-20. LINE accepts a plain
    `http://localhost` URL; one that is not registered gets a 400 from LINE's authorize page.

The LINE channel is published (2026-10-20), so any LINE account can sign in, not only the channel's testers.

Production adds the same paths on `https://wan-guard.com`. The back office signs in through the same
callbacks on the site's host, so it registers nothing of its own. Neither app uses NextAuth any more, so the
old NextAuth callback URLs (`…/api/auth/callback/google`, `…/api/auth/callback/line`) can be removed.

### Deploying the change that moved sign-in to the backend

The backend and site changes are merged together, and the back office's after them. The backend removed
`/auth/sso/google` and `/auth/sso/line`, so until the back office moves off NextAuth its Google and LINE
sign-in answer 404. Staging does not run the back office yet, so nothing deployed is affected. Do not deploy
a `main` that holds the change before steps 1 and 2 below are done.

1. Before deploying, create `staging-backend-google-client-secret` and `staging-backend-line-channel-secret`
   (same values as the `staging-frontend-*` pair) and their IAM bindings (see
   [One-time setup](#one-time-setup-already-done-2026-06-12--recorded-for-reproducibility)). The second run
   below fails at step 4 without them. Developers who test Google or LINE sign-in locally
   (`Backend/.env.example`) need read access to these two secrets as well. Grant it on each secret, never on
   the project: `roles/secretmanager.secretAccessor` there reads every secret, the JWT signing key included.

   ```bash
   for s in staging-backend-google-client-secret staging-backend-line-channel-secret; do
     gcloud secrets add-iam-policy-binding $s \
       --member="user:<developer-email>" --role="roles/secretmanager.secretAccessor"
   done
   ```
2. Point the Tunnel hostnames and register the redirect URIs above.
3. **Run `deploy.sh` twice in a row.** This change edits `gen_env`, and a running `deploy.sh` keeps the
   `gen_env` it parsed before checkout. The first run therefore writes a `.env` without the OAuth secrets:
   Google and LINE sign-in answer `oauth_request_invalid` and password sign-in works. The second run writes
   them. The KotSMS switch behaved the same way (see Environment facts).
4. Everyone is signed out once: the frontend stops reading NextAuth's cookie. Tell the testers on Discord
   first.
5. No migration and no seed change. Redis gains `oauth_state:*` keys, which expire after 10 minutes.
6. To roll back, deploy the previous ref. Sessions started under the new sign-in stop working, and everyone
   signs in again.

### Deploying the back office

The back office (`Frontend/apps/admin`, 管理平台) runs as the `admin` service at `admin-staging.wan-guard.com`.
It is built from the same `Frontend/Dockerfile` as the site, with `APP=admin`. It signs in through the
backend's cookies like the site, so it holds no secret and reads `scripts/deploy-config.staging.env` as it
is, not a generated file.

The site's 前往管理平台 opens `/admin` on the site, which redirects `/admin/*` to `ADMIN_APP_URL`. Next works
that redirect out at build time (`Frontend/apps/demo/next.config.js`), so `docker-compose.staging.yml`
passes `ADMIN_APP_URL` to the site's build as a build arg. Setting it on the running container changes
nothing.

The first deploy:

1. Merge it only after the back office has moved off NextAuth: the `admin` container gets no NextAuth secret.
2. **Run `deploy.sh` twice in a row.** The first run is still the old script (see above): it neither builds
   nor starts `admin`, but it does rebuild the site, whose `/admin` then already points at
   `admin-staging.wan-guard.com`. The second run builds and starts `admin`. Run them back to back, both
   without `SEED_MOCK`: nothing in this change needs the mock data rebuilt. The first run applies one
   migration, `facf37b5c79d` (ADR-393): three "who did it" columns may now be NULL, which only the mock seed's
   cleanup writes (see "What does SEED_MOCK touch?" below). The backup step runs before it.
   The second run ends with `WARN: https://admin-staging.wan-guard.com not reachable yet`. That is expected:
   the hostname is added in step 4. Until then the site's 前往管理平台 also ends on Cloudflare's error page.
3. Give the two back-office test accounts, `asuper01@mock.test` (super_admin) and `aaudit01@mock.test`
   (data_auditor), a password of their own, as in
   [The back-office test accounts' password](#the-back-office-test-accounts-password). Do it before the next
   step. Both were added by hand with the mock password, which is published in the seed header, and a deploy
   without `SEED_MOCK` leaves them as they are.
4. In the Cloudflare Zero Trust dashboard, add the staging tunnel's public hostname
   `admin-staging.wan-guard.com` → `http://admin:3000`.
5. After the second run, delete the secrets nothing reads any more. The first run still needs them: its old
   `gen_env` reads them.

   ```bash
   for s in staging-frontend-nextauth-secret staging-frontend-google-client-secret \
            staging-frontend-line-client-secret; do
     gcloud secrets delete $s
   done
   ```
6. Sign in at `admin-staging.wan-guard.com` twice. `asuper01@mock.test`, with the password from step 3, gets the
   dashboard. A volunteer, such as `avol01@mock.test`, has no back-office identity and gets 這個帳號還沒有管理權限,
   with a 回到公開地圖 button that opens `https://staging.wan-guard.com/map`. No button means the container has
   no `SITE_APP_URL`.
7. To roll back, deploy the previous ref. A ref from before this change defines no `admin` service:
   `deploy.sh` skips it, and the site's `/admin` goes back to its placeholder page. The `admin` container
   that is already running is left alone, because that ref's compose file no longer knows it. Stop it by
   name if it should go: `docker stop backend-admin-1`.

---

## Notification retention (the `retention` container)

- **What:** soft-deletes notifications that were read more than 30 days ago, or created more than
  90 days ago regardless of read state — the Q4 policy from the notification PRD. It sets
  `delete_at`; nothing is physically removed.
- **How it runs:** a `retention` service in `docker-compose.staging.yml`, started by step 9. It reuses
  `disaster-backend:latest` (no separate build) and runs
  `python scripts/run_retention_cleanup.py` in a `while true; sleep 86400` loop.
- **Why a loop and not cron:** the schedule then lives in the repo and ships with the code, and there
  is no VM-local crontab to recreate when the box is rebuilt. Trade-off: the timer restarts with the
  container, so the daily run drifts to whenever the last deploy happened. That is fine for an
  age-based policy measured in days — it is not a "runs at 03:00" guarantee, and nothing depends on
  it being one.
- **First run is immediate:** the loop cleans once at container start, so every deploy triggers a
  cleanup pass. The UPDATE is idempotent — a second run right after the first affects 0 rows.
- **Failures are non-fatal:** a failed run logs `[retention] run failed, retrying next cycle` and the
  loop continues. It is deliberately NOT part of the readiness gate — retention falling over must
  never roll back a good backend deploy.

```bash
# Did it run? (look for the 清理完成 line)
docker compose logs retention | tail -20

# Force a pass right now without waiting for the cycle
docker compose exec retention python scripts/run_retention_cleanup.py

# How many rows are currently soft-deleted
docker compose exec -T db psql -U postgres -d postgres \
  -c "SELECT count(*) FILTER (WHERE delete_at IS NOT NULL) AS deleted, count(*) AS total FROM notifications;"
```

**Caveat:** `delete_at` grows forever — this policy hides rows from the API, it does not reclaim
space. If the table gets large, a separate hard-delete/partition step is a different piece of work.

---

## DB backups: how many, how long, what happens when

- **When:** one backup is taken automatically before EVERY migration (step 7). No backup → no migrate.
- **Where / naming:** `gs://wanguard-250923-db-backups/pre-deploy-<YYYYMMDD-HHMMSS>.sql.gz`
  (full `pg_dump` of the `postgres` database, gzipped).
- **Retention:** the bucket has a GCS lifecycle rule that **deletes objects older than 30 days**.
  Retention is age-based, not count-based — there is no "max N backups": deploy 50 times in a week
  and you'll have 50 backups; each disappears 30 days after it was created.
- **"What if we exceed it":** nothing to exceed — there is no cap to hit and old files clean
  themselves up. Cost is negligible (staging dumps are KB–MB scale; storage is ~$0.02/GB-month).
- **Caveat:** if you need a backup for longer than 30 days (e.g. evidence before a risky data
  migration), copy it elsewhere before it ages out:
  `gsutil cp gs://wanguard-250923-db-backups/pre-deploy-<ts>.sql.gz gs://<somewhere-permanent>/`

### Restoring a backup (last resort after a bad migration)

```bash
# 1. List available backups
gsutil ls gs://wanguard-250923-db-backups/

# 2. Stop the backend so nothing writes during the restore
cd /opt/wanguard/Backend
docker compose -f docker-compose.staging.yml stop backend

# 3. Restore (OVERWRITES current data — be sure)
gsutil cp gs://wanguard-250923-db-backups/pre-deploy-<ts>.sql.gz - | gunzip | \
  docker compose -f docker-compose.staging.yml exec -T db psql -U postgres -d postgres

# 4. Deploy the code version that matches the restored schema
./scripts/deploy.sh <sha-from-before-the-bad-migration>
```

Note: the dump is plain SQL without `--clean`; restoring on top of a half-migrated schema can
conflict. For a clean restore, drop and recreate the database first (or restore into a scratch DB
and verify), then replay the dump.

---

## Failure behaviour (what happens when a step fails)

| Failing step | Behaviour | Live service |
|--------------|-----------|--------------|
| preflight | stops immediately; nothing touched but build cache older than 7 days | old version keeps running ✅ |
| checkout / secrets / build | stops; worktree auto-restored to the pre-deploy SHA | old version keeps running ✅ |
| DB backup | stops, migration NOT attempted | old version keeps running ✅ |
| migrate / seed | stops; new version never started; backup path printed | old version keeps running ⚠️ schema may have advanced — see below |
| readiness check (new version) | **automatic rollback**: previous image retagged + restarted in seconds, worktree restored | rolled back to old version ✅ |
| a Next app does not start | not detected by the script: `DEPLOY OK`, and the closing check warns that its host did not answer | that app is down until fixed or rolled back ⚠️ |
| rollback itself fails | diagnostic commands printed, manual intervention | 🔴 extremely rare |

A failed migration is transactional in Postgres: the failing migration rolls back entirely and the
DB stays at the last successful migration — never half-applied within one migration.

---

## Schema changes & data safety (FAQ)

**"A new PR changes the schema — will deploy keep the data safe?"**

Guaranteed by the machinery:
- Data lives in named volumes; deploys recreate containers only — **data survives every deploy**.
- `alembic upgrade head` applies only the migrations not yet applied (incremental).
- A GCS backup is taken before every migration; backup failure aborts the deploy.
- A failed migration rolls back (transactional DDL) and the running service is never replaced.

Still on the humans (migration-writing discipline):
- A migration that **succeeds but does the wrong thing** (e.g. `DROP COLUMN` with data, lossy type
  change) is not detectable by the script — **review migrations for data impact**; the backup is the
  recovery path.
- **Rollback is asymmetric**: `deploy.sh <old-sha>` rolls back code, NOT schema. Write migrations
  expand-contract style (add first, remove later in a separate release) so the previous code version
  always runs against the current schema.
- The backend restart has a few seconds of downtime (acceptable for staging; zero-downtime is a
  future-work item).

**"What does SEED_MOCK touch?"**
The rows with the fixed mock UUID prefixes (users `c…`, scenario-A stations `a…`, scenario-B `b…`, tickets
`d…`, tasks `e…`, assignments `f…`), and what testers made with the mock accounts: it deletes those and
re-inserts the seed (idempotent). The two back-office test accounts are kept, with the password set on the VM;
their roles are handed out again and what they did is cleared like any mock account's. A password of theirs
that is still the published mock one is dropped, so they sign in only once one is set on the VM.
Real data stays: rows a real person made are kept, and where a mock account reviewed, published or audited
them, that reference is set to NULL. Without the flag, the seed step is skipped entirely.

### The back-office test accounts' password

`asuper01@mock.test` (super_admin) and `aaudit01@mock.test` (data_auditor) sign in to a public back office
with the widest rights there are, so they get no password from the seed: the mock password is in its header.
Their `@mock.test` addresses receive no mail, so forgot-password cannot reach them either. Set each one on the
VM:

```bash
cd /opt/wanguard/Backend
sudo docker compose -f docker-compose.staging.yml run --rm -e PYTHONPATH=/app backend \
  python scripts/set_password.py asuper01@mock.test
```

It asks for the password twice, without echoing it, and signs the account out everywhere. The password needs
at least 8 characters, as on the login page. Keep it out of the repo and out of public channels; the
person who looks after staging hands it to testers.

`SEED_MOCK=true` keeps both accounts and a password set this way, so this is done once. It drops one that is
still the published mock password, which the hand-added staging copies carried: that hash has the seed's
fixed salt, `mockdata12345678`, while this script and the login page always use a random one. Only a
database rebuilt from empty needs the password set again; until then the two accounts cannot sign in.

---

## TGOS address keys

The backend looks addresses up in two TGOS services, each with its own APPID and API KEY. The four values
are in Secret Manager with the other staging secrets, readable by the VM's service account (so from any
shell on the VM) and by project owners. `gen_env` writes them into `.env` on every deploy, so the `backend`
container has them (and `retention`, which shares `.env`); the Next apps and the tunnel do not. A deploy
stops at step 4 if one of them is empty or holds a line break, as it does for the OAuth secrets.

| Variable | Secret | TGOS service |
|---|---|---|
| `TGOS_ADDR_APP_ID` / `TGOS_ADDR_API_KEY` | `staging-backend-tgos-addr-app-id` / `-addr-api-key` | 全國門牌位置比對服務 |
| `TGOS_GEO_APP_ID` / `TGOS_GEO_API_KEY` | `staging-backend-tgos-geo-app-id` / `-geo-api-key` | 坐標回傳門牌服務 |

After a key change, add the new version and deploy, then check the backend has all four:

```bash
# read -rs takes the key without echoing it or leaving it in the shell history
read -rs v && printf '%s' "$v" \
  | gcloud secrets versions add staging-backend-tgos-addr-api-key --data-file=- && unset v
cd /opt/wanguard/Backend && ./scripts/deploy.sh
docker compose -f docker-compose.staging.yml exec backend python -c \
  "from app.core.config import settings as s; print(all([s.TGOS_ADDR_APP_ID, s.TGOS_ADDR_API_KEY, s.TGOS_GEO_APP_ID, s.TGOS_GEO_API_KEY]))"
```

The last line prints `True` without showing any value. With the keys missing, every lookup answers
`unavailable`; saving an address still works.

TGOS accepts the keys from the registered IP above only. A new IP needs TGOS's IP change form, stamped
with the organisation's seal (用印), and then new keys.

### Moving the keys off `.env.tgos` (once)

Until this change the keys sat in a hand-written `Backend/.env.tgos` on the VM, which compose gave to the
backend. The change edits `gen_env`, and a running `deploy.sh` keeps the `gen_env` it parsed before
checkout (see SMS in Environment facts):

1. **Before deploying**, create the four `staging-backend-tgos-*` secrets with the values in `.env.tgos`,
   and give the VM's service account read access to each (see One-time setup below). The second run stops
   at step 4 without them. On staging they were created on 2026-10-26;
   `gcloud secrets list --filter='name~staging-backend-tgos'` lists all four.
2. **Run `deploy.sh` twice in a row.** The first run already has the new compose file, which no longer reads
   `.env.tgos`, but still writes a `.env` without the keys: until the second run finishes, every lookup
   answers `unavailable`. The second run writes them. Only `.env` changes between the two, so the second can
   be `NEXT_APPS= ./scripts/deploy.sh`, which skips both Next builds and shortens that window; the first run
   has already built both apps from the same ref.
3. Check for `True` as above.
4. Delete the old file: `rm /opt/wanguard/Backend/.env.tgos`.

---

## Secret rotation

```bash
# SMTP key, KotSMS password or JWT SECRET_KEY: add a new version; next deploy picks it up automatically
printf '%s' '<new-value>' | gcloud secrets versions add staging-backend-smtp2go-api-key --data-file=-
# (rotating staging-backend-jwt-signing-key invalidates ALL existing logins — users just sign in again)
# (a KotSMS password change in the 簡訊王 console takes effect at once, so every SMS fails from then
#  until the deploy that carries the new secret version — add the version and deploy right away)
# (a Google or LINE client secret reissued in its console: add the new version to
#  staging-backend-google-client-secret or staging-backend-line-channel-secret, then deploy)
# (a TGOS key reissued: add the new version to its staging-backend-tgos-* secret, then deploy)

# DB password: the postgres volume is already initialized, so changing the secret alone does NOT
# change the actual DB password. Do both, in this order:
#   1. inside the db container: ALTER USER postgres PASSWORD '<new-value>';
#   2. gcloud secrets versions add staging-backend-postgres-password ... with the same value
#   3. deploy (regenerates .env)
# Values must match ^[A-Za-z0-9_-]+$ (the script validates; use `openssl rand -hex 32`).
```

---

## One-time setup (already done 2026-06-12 — recorded for reproducibility)

If this environment ever needs to be rebuilt from scratch:

```bash
# Enable the API, create secrets (hex values are dotenv/DSN/shell-safe)
gcloud services enable secretmanager.googleapis.com
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create staging-backend-postgres-password --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create staging-backend-jwt-signing-key --data-file=-
printf '%s' '<smtp2go-key>' | gcloud secrets create staging-backend-smtp2go-api-key --data-file=-
# 簡訊王 member login (the API authenticates with it); also register the static IP above in its console
printf '%s' '<kotsms-username>' | gcloud secrets create staging-backend-kotsms-username --data-file=-
printf '%s' '<kotsms-password>' | gcloud secrets create staging-backend-kotsms-password --data-file=-
# Google and LINE sign-in (ADR-331): the OAuth client's secret, and the LINE Login channel's secret
printf '%s' '<google-secret>' | gcloud secrets create staging-backend-google-client-secret --data-file=-
printf '%s' '<line-secret>' | gcloud secrets create staging-backend-line-channel-secret --data-file=-
# TGOS address lookups (added 2026-10-26): each service's APPID and API KEY
printf '%s' '<addr-app-id>' | gcloud secrets create staging-backend-tgos-addr-app-id --data-file=-
printf '%s' '<addr-api-key>' | gcloud secrets create staging-backend-tgos-addr-api-key --data-file=-
printf '%s' '<geo-app-id>' | gcloud secrets create staging-backend-tgos-geo-app-id --data-file=-
printf '%s' '<geo-api-key>' | gcloud secrets create staging-backend-tgos-geo-api-key --data-file=-

# Grant the VM's service account read access (least privilege: one binding per secret). The
# staging-cloudflared-tunnel-token secret needs the same binding.
for s in staging-backend-postgres-password staging-backend-jwt-signing-key \
         staging-backend-smtp2go-api-key staging-backend-kotsms-username staging-backend-kotsms-password \
         staging-backend-google-client-secret staging-backend-line-channel-secret \
         staging-backend-tgos-addr-app-id staging-backend-tgos-addr-api-key \
         staging-backend-tgos-geo-app-id staging-backend-tgos-geo-api-key; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:<vm-service-account-email>" \
    --role="roles/secretmanager.secretAccessor"
done

# Backup bucket + 30-day lifecycle
gsutil mb -l asia-east1 gs://wanguard-250923-db-backups
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/lc.json
gsutil lifecycle set /tmp/lc.json gs://wanguard-250923-db-backups

# VM access scopes (REQUIRED: default scopes block Secret Manager and make GCS read-only;
# IAM alone is not enough — effective access = IAM ∩ scopes). Needs a stop/start, and the
# ephemeral external IP may change.
gcloud compute instances stop wanguard-test-01 --zone=asia-east1-a
gcloud compute instances set-service-account wanguard-test-01 --zone=asia-east1-a --scopes=cloud-platform
gcloud compute instances start wanguard-test-01 --zone=asia-east1-a

# Swap on the VM (build OOM protection)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
```

Low-sensitivity config (EMAIL_FROM, client IDs, …) lives in `scripts/deploy-config.staging.env`
(committed). Secrets never go in that file.

---

## Troubleshooting (from real incidents)

**`ModuleNotFoundError: No module named 'app'` when a script runs in the container**
No PYTHONPATH inside the image. deploy.sh already passes `-e PYTHONPATH=/app` for the seed; do the
same for any new in-container `python scripts/...` invocation.

**You fixed deploy.sh, re-ran it, and the behaviour didn't change**
The script executes whatever was on disk when it STARTED, and after a failure the repo is left in
detached HEAD — where `git pull` fails (and piping it through `| tail` etc. swallows the error).
Before re-running:
```bash
cd /opt/wanguard && git checkout <branch> && git pull --ff-only
grep -n "<your fix>" Backend/scripts/deploy.sh   # verify the fix is on disk, THEN run
```

**`another deploy is already in progress`**
Someone else's deploy holds the flock. Wait for it; the lock auto-releases when their process ends
(even on crash). `ps aux | grep deploy.sh` to see who.

**First-ever deploy warns "no existing backend container"**
Expected: there is no previous image to use as a rollback target on the very first run. Image-level
rollback becomes available from the second deploy onward.

**Build is slow / VM feels frozen during build**
Cold builds compile native deps; the 2 GB swap absorbs the memory spike (Postgres may slow down for
a minute but won't be OOM-killed). Cached rebuilds are fast. The two Next apps build one at a time for the
same reason. A build the OOM killer stopped ends in `exit code: 137`. If that happens, the VM needs a larger
swap file or a larger machine type (e2-standard-2 has 8 GB, at about twice the price).

**`under 5G free: clear space first`**
Preflight had already pruned build cache older than 7 days and still found under 5 GB free, so it stopped
before touching anything. See what holds the space with `docker system df`. Then, in this order:
`docker builder prune -f` drops all build cache (the next deploy reinstalls and rebuilds everything, a few
minutes slower), and `docker image ls` shows images to remove: keep every `disaster-*:latest` and
`disaster-backend:prev`, the rollback target.

---

## Future work (not covered by this doc)

- CI/CD (push-to-deploy): GitHub Actions builds the image → Artifact Registry → VM pulls
  (no more building on the VM)
- Frontend access: open firewall :8000, or add Caddy for HTTPS/443
- Zero-downtime production: Caddy blue-green on the VM, or Cloud Run + managed DB/Redis
  (prerequisite either way: expand-contract migrations)
- Terraform once the infra surface grows
