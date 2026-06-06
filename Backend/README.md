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

- Tests use a **dedicated test database** `disaster_rescue_test`, auto-created with the PostGIS extension on
  first run — the Postgres role needs `CREATE DATABASE` + `CREATE EXTENSION` privilege. Tests **do not touch**
  the dev `postgres` database.
- Tests use Redis **db index 15**, flushed per test — do not keep dev data there.
- Overridable via env: `TEST_DB_URL`, `TEST_REDIS_URL` (must be a non-0 db index), `TEST_ADMIN_DB_URL`.

> Note: CI / parallel runs must use isolated Redis + Postgres instances (the shared db-index 15 and the
> single test DB are flushed/recreated per test, so concurrent runs on the same instances would clobber
> each other).
