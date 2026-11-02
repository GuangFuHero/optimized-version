"""List rows whose stored address parts differ from a re-parse: `python -m scripts.check_address_drift`.

The parts of `secondary_locations` are derived from `user_input_address` by the parser, and the database
cannot check that (it needs Python). Read-only; exits 1 when any row differs, so it can run in a check.
Fix a drifted row with `python -m scripts.resplit_addresses --apply`. A row with parts but no line has
nothing to compare with, so it is listed as parts-only and does not count as drift.
"""

import asyncio
import sys

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from scripts.resplit_addresses import report, survey


async def _survey() -> tuple[dict[str, dict[str, tuple]], list[str]]:
    """The drifted rows and the rows with parts but no line, read in one session."""
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=False)
    try:
        async with sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as db:
            return await survey(db)
    finally:
        await engine.dispose()


async def check() -> dict[str, dict[str, tuple]]:
    """The drifted rows."""
    return (await _survey())[0]


def main() -> int:
    """Print the drifted and parts-only rows; 1 when a row drifted, else 0."""
    return finish(*asyncio.run(_survey()))


def finish(found: dict[str, dict[str, tuple]], parts_only: list[str]) -> int:
    """Print both lists; 1 when a row drifted, 0 otherwise (parts-only rows are informational)."""
    print("\n".join(report(found)))
    print(f"{len(found)} rows differ from a re-parse of their user_input_address.")
    if parts_only:
        print(f"{len(parts_only)} parts-only rows (no user_input_address, nothing to compare; not drift):")
        print("\n".join(parts_only))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
