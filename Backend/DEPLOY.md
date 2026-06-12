# Staging Deployment Guide (deploy.sh)

One-command deploy of the backend to the GCP staging VM: backup → migrate → seed → restart →
readiness check, with automatic rollback on failure. First validated on the real VM on 2026-06-12.

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
```

Success looks like `[1/9] preflight` → … → `DEPLOY OK — <sha> in <N>s`, followed by a rollback hint.
A cold build takes ~5 minutes; cached rebuilds take well under a minute.

## Accessing the backend from your machine (SSH tunnel)

Firewall keeps :8000 closed to the internet; use an SSH tunnel for local frontend testing:

```bash
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a -- -N -L 8000:localhost:8000
```

While that runs, `http://localhost:8000` on your machine IS the staging backend
(`curl http://localhost:8000/readyz` → `{"status":"ready"}`). Point the local frontend's API base
URL at it. `-N` keeps a forward-only session; drop it if you also want a shell.

### Inspecting the DB from your machine (DBeaver / psql)

Postgres is published on the VM's **loopback only** at `127.0.0.1:5433` (never on the public
interface). Tunnel it:

```bash
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a -- -N -L 5433:localhost:5433
```

Then connect your DB client to `localhost:5433`, user `postgres`, database `postgres`. The password
is no longer the dev default — fetch it from Secret Manager:

```bash
gcloud secrets versions access latest --secret=app-postgres-password
```

---

## Environment facts (staging VM)

| Item | Value |
|------|-------|
| GCP project / VM | `wanguard-250923` / `wanguard-test-01` (asia-east1-a) |
| Repo path on VM | `/opt/wanguard` |
| Compose file | `docker-compose.staging.yml`, compose project name pinned to `backend` |
| Data | Named volumes `backend_pgdata` / `backend_redisdata` — **survive all deploys** |
| Published ports | Backend `:8000`; Postgres on **loopback only** (`127.0.0.1:5433`, for SSH-tunnel inspection); Redis internal-only |
| GCP firewall | Only 22/SSH open. **8000 is NOT open** — access via SSH tunnel until a firewall rule (or Caddy/HTTPS) is added for the frontend |
| External IP | Ephemeral (not reserved). It can change when the VM is stopped/started — always connect via `gcloud compute ssh`, don't hardcode the IP |
| Secrets | GCP Secret Manager: `app-postgres-password`, `app-secret-key`, `app-smtp2go-api-key` |
| Backups | `gs://wanguard-250923-db-backups` |
| Swap | 2 GB `/swapfile`, `vm.swappiness=10` — prevents the OOM killer hitting Postgres during image builds |

---

## What deploy.sh actually does (9 steps)

```
1. preflight    docker daemon up; gcloud/gsutil/curl installed; GCS bucket configured;
                active gcloud identity; git working tree clean
2. baseline     record current HEAD; tag the RUNNING container's image as disaster-backend:prev
                (this is the image rollback target — taken from reality, not from tags)
3. checkout     git fetch + checkout of the target ref (default origin/main)
4. .env         generated from Secret Manager + scripts/deploy-config.staging.env (mode 0600);
                regenerated on EVERY deploy — never edit .env by hand on the VM
5. build        docker compose build backend
6. infra up     start db + redis, wait until healthy
7. backup       pg_dump | gzip | upload to GCS — if the backup fails, migration is NOT attempted
8. migrate+seed alembic upgrade head → seed_rbac.py (idempotent) → mock seed (only if SEED_MOCK=true)
9. restart+gate start the new backend → curl /readyz, retried 12 × 5s (60s budget) —
                only a passing readiness check counts as a successful deploy
```

Design rules baked into the script:
- Every compose call goes through a wrapper pinned to `COMPOSE_FILE=docker-compose.staging.yml` and
  `COMPOSE_PROJECT_NAME=backend`. Never run bare `docker compose` in `Backend/` on the VM — it would
  pick up the dev compose file (published DB ports, `--reload`, hardcoded dev credentials).
- Migrations and seeds run in **one-off containers from the freshly built image** (`compose run --rm`),
  not in the old running container (which doesn't contain the new files).
- In-container Python scripts need `-e PYTHONPATH=/app` (the local `PYTHONPATH=.` convention doesn't
  exist inside the image; without it `import app.*` fails).
- Concurrency: an flock on `/var/lock/disaster-deploy.lock` makes a second concurrent deploy fail
  immediately with "another deploy is already in progress". The lock is released when the process
  exits (including crashes) — there are no stale-lock cleanup steps to run.

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
| preflight | stops immediately, nothing touched | old version keeps running ✅ |
| checkout / secrets / build | stops; worktree auto-restored to the pre-deploy SHA | old version keeps running ✅ |
| DB backup | stops, migration NOT attempted | old version keeps running ✅ |
| migrate / seed | stops; new version never started; backup path printed | old version keeps running ⚠️ schema may have advanced — see below |
| readiness check (new version) | **automatic rollback**: previous image retagged + restarted in seconds, worktree restored | rolled back to old version ✅ |
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
Only rows with the fixed mock UUID prefixes (users `c…`, scenario-A stations `a…`, scenario-B `b…`,
tickets `d…`, tasks `e…`, assignments `f…`): it deletes those and re-inserts them (idempotent).
Real (non-prefixed) data is untouched. Without the flag, the seed step is skipped entirely.

---

## Secret rotation

```bash
# SMTP key or JWT SECRET_KEY: add a new version; next deploy picks it up automatically
printf '%s' '<new-value>' | gcloud secrets versions add app-smtp2go-api-key --data-file=-
# (rotating app-secret-key invalidates ALL existing logins — users just sign in again)

# DB password: the postgres volume is already initialized, so changing the secret alone does NOT
# change the actual DB password. Do both, in this order:
#   1. inside the db container: ALTER USER postgres PASSWORD '<new-value>';
#   2. gcloud secrets versions add app-postgres-password ... with the same value
#   3. deploy (regenerates .env)
# Values must match ^[A-Za-z0-9_-]+$ (the script validates; use `openssl rand -hex 32`).
```

---

## One-time setup (already done 2026-06-12 — recorded for reproducibility)

If this environment ever needs to be rebuilt from scratch:

```bash
# Enable the API, create secrets (hex values are dotenv/DSN/shell-safe)
gcloud services enable secretmanager.googleapis.com
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create app-postgres-password --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create app-secret-key --data-file=-
printf '%s' '<smtp2go-key>' | gcloud secrets create app-smtp2go-api-key --data-file=-

# Grant the VM's service account read access (least privilege: these 3 secrets only)
for s in app-postgres-password app-secret-key app-smtp2go-api-key; do
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
a minute but won't be OOM-killed). Cached rebuilds are fast.

---

## Future work (not covered by this doc)

- CI/CD (push-to-deploy): GitHub Actions builds the image → Artifact Registry → VM pulls
  (no more building on the VM)
- Frontend access: open firewall :8000, or add Caddy for HTTPS/443
- Zero-downtime production: Caddy blue-green on the VM, or Cloud Run + managed DB/Redis
  (prerequisite either way: expand-contract migrations)
- Terraform once the infra surface grows
