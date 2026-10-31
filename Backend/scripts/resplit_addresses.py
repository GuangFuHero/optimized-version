"""Re-parse every stored address line into its parts: `python -m scripts.resplit_addresses [--apply]`.

The parts of `secondary_locations` come from `user_input_address` through `parse_tw_address`, and a
change to the parser does not reach rows saved before it. This prints what a new parse would change
and writes nothing unless `--apply` is given; `full_address` follows by itself, since the database
builds it from the parts. Rows from before the raw line was kept hold the parsed line in
`user_input_address`, so for them this re-parses that. The writes go through the audit trigger, with
no actor, as the other scripts' do. A row that holds parts but no line has nothing to re-parse, so it
is reported as parts-only and left untouched.
"""

import argparse
import asyncio

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.address import parse_tw_address
from app.core.config import settings
from app.models.secondary_location import SecondaryLocation

# The columns the parser fills from `user_input_address`; the units are left alone.
PARSED_COLUMNS = (
    "county",
    "town",
    "village",
    "neighborhood",
    "road",
    "section",
    "lane",
    "alley",
    "no",
    "remainder",
)


def _blank(line: str | None) -> bool:
    return not (line or "").strip()


async def _rows(db: AsyncSession):
    """Every row's uuid, `user_input_address` and stored parsed columns."""
    columns = [getattr(SecondaryLocation, name) for name in PARSED_COLUMNS]
    return (
        await db.execute(select(SecondaryLocation.uuid, SecondaryLocation.user_input_address, *columns))
    ).all()


async def drifted(db: AsyncSession) -> dict[str, dict[str, tuple]]:
    """Each row whose stored parts differ from a re-parse of its `user_input_address`.

    Maps the row's uuid to {column: (stored, re-parsed)} for the columns that differ. A row with parts
    but no line has nothing to re-parse, so it is not here; see `lineless`.
    """
    found = {}
    for uuid, line, *stored in await _rows(db):
        if _blank(line) and any(stored):
            continue
        parsed = parse_tw_address(line)
        expected = [getattr(parsed, name) for name in PARSED_COLUMNS]
        differing = {n: (s, e) for n, s, e in zip(PARSED_COLUMNS, stored, expected, strict=True) if s != e}
        if differing:
            found[str(uuid)] = differing
    return found


async def lineless(db: AsyncSession) -> list[str]:
    """The uuids of rows that hold address parts but no `user_input_address`; a re-split leaves them alone."""
    return [str(uuid) for uuid, line, *stored in await _rows(db) if _blank(line) and any(stored)]


async def survey(db: AsyncSession) -> tuple[dict[str, dict[str, tuple]], list[str]]:
    """The drifted rows and the rows with parts but no line."""
    return await drifted(db), await lineless(db)


def report(found: dict[str, dict[str, tuple]]) -> list[str]:
    """One line per drifted row, listing each column as stored → re-parsed."""
    return [
        f"{uuid}: "
        + ", ".join(f"{name} {stored!r} -> {expected!r}" for name, (stored, expected) in diff.items())
        for uuid, diff in found.items()
    ]


async def _run(*, apply: bool) -> tuple[dict[str, dict[str, tuple]], list[str]]:
    """Re-parse every row, writing the new parts with `apply`; returns what differs and the lineless rows."""
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=False)
    try:
        async with sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as db:
            found, unplaced = await survey(db)
            if apply:
                for uuid, diff in found.items():
                    values = {name: expected for name, (_, expected) in diff.items()}
                    await db.execute(
                        update(SecondaryLocation).where(SecondaryLocation.uuid == uuid).values(**values)
                    )
                await db.commit()
            return found, unplaced
    finally:
        await engine.dispose()


async def resplit(*, apply: bool) -> dict[str, dict[str, tuple]]:
    """Re-parse every row; with `apply`, write the new parts. Returns what differs."""
    return (await _run(apply=apply))[0]


def main() -> None:
    """Parse CLI args, run, and print the report."""
    parser = argparse.ArgumentParser(description="Re-parse stored address lines into their parts")
    parser.add_argument("--apply", action="store_true", help="write the new parts (default: report only)")
    args = parser.parse_args()
    found, unplaced = asyncio.run(_run(apply=args.apply))
    print("\n".join(report(found)))
    if unplaced:
        print(f"{len(unplaced)} parts-only rows (no user_input_address) were left as they are:")
        print("\n".join(unplaced))
    verb = "updated" if args.apply else "would change"
    print(
        f"{len(found)} rows {verb}."
        + ("" if args.apply else " Dry run: nothing written; add --apply to write.")
    )


if __name__ == "__main__":
    main()
