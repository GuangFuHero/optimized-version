"""List rows whose stored address parts differ from a re-parse: `python -m scripts.check_address_drift`.

The parts of `secondary_locations` are derived from `user_input_address` by the parser, and the database
cannot check that (it needs Python). Read-only; exits 1 when any row differs, so it can run in a check.
Fix a reported row with `python -m scripts.resplit_addresses --apply`.
"""

import asyncio
import sys

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from scripts.resplit_addresses import drifted, report


async def check() -> dict[str, dict[str, tuple]]:
    """The drifted rows, read in one session."""
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=False)
    try:
        async with sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as db:
            return await drifted(db)
    finally:
        await engine.dispose()


def main() -> int:
    """Print the drifted rows; 1 when there are any, else 0."""
    found = asyncio.run(check())
    print("\n".join(report(found)))
    print(f"{len(found)} rows differ from a re-parse of their user_input_address.")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
