# Disaster Rescue — Backend

FastAPI + Strawberry GraphQL + SQLAlchemy (async, asyncpg) + PostgreSQL/PostGIS + Redis. Python 3.13.

## Local run

```bash
cd Backend
docker compose up -d
docker compose exec backend alembic upgrade head
```

Services on default ports: PostgreSQL 5432, Redis 6379, FastAPI 8000.

## Testing

```bash
cd Backend
PYTHONPATH=. ENV=testing .venv/bin/python -m pytest tests -q
```

**Prerequisites** — Redis on `localhost:6379` and Postgres on `localhost:5432` running
(`docker compose up -d db redis`).

- Tests use a **dedicated test database** `disaster_rescue_test`, auto-created on first run with its
  extensions (PostGIS, pg_trgm, h3, h3_postgis) in a schema of their own, `extensions` — the Postgres role
  needs `CREATE DATABASE` + `CREATE EXTENSION` privilege. Tests **do not touch** the dev `postgres` database.
- The `db` / `db_session` fixtures drop and rebuild the `public` schema for every test; the extensions stay
  where they are. A test database made before that (extensions in `public`) is dropped and made again on
  the next run, once.
- Tests use Redis **db index 15**, flushed per test — do not keep dev data there.
- Overridable via env: `TEST_DB_URL`, `TEST_REDIS_URL` (must be a non-0 db index), `TEST_ADMIN_DB_URL`.

### Running in parallel

`pytest-xdist` (in the `dev` group) spreads the tests over several processes:

```bash
PYTHONPATH=. ENV=testing .venv/bin/python -m pytest tests -q -n 4
```

Measured on an Apple Silicon laptop, 1,424 tests, the PostGIS + h3 image under emulation: about 9 minutes
serially, under 3 minutes with `-n 4`. `-n 8` saves only another half-minute and brings Postgres close to
its default lock table (`max_locks_per_transaction` 64 × `max_connections` 100): for each test, every
worker drops and recreates the schema's 35 tables and 85 indexes, and locks each one.

- Each worker gets its own database — `disaster_rescue_test_gw0`, `_gw1`, … — created on first use
  like the default one.
- Each worker gets its own Redis db, counting down from the `TEST_REDIS_URL` index: with the default
  `/15`, `-n 4` uses dbs 15 down to 12. db 0 is never used; a run with more workers than fit stops at
  startup and says so.
- Without `-n`, nothing changes: one database, one Redis db.

> Two runs at the same time must not share a test database name or a Redis db — each run's tests flush
> Redis and drop the schema, and the other run's tests fail with `401 Could not validate credentials`
> or missing tables. Give each run its own `TEST_DB_URL`, and either a `TEST_REDIS_URL` whose range does
> not overlap or its own Redis instance (e.g. `docker run -d -p 6390:6379 redis:7-alpine` with
> `TEST_REDIS_URL=redis://localhost:6390/15`).
