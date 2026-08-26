"""Import the address reference datasets from published open data.

Run detached, NOT as part of a deploy — the OSM extract alone is 326 MB, and deploy.sh's
readiness gate is 60 seconds (see DEPLOY.md step 8):

    docker compose run -d --rm -e PYTHONPATH=/app backend python scripts/import_reference_data.py

Progress is written to `reference_datasets` as it goes, which is what the `referenceData`
GraphQL query reads, because a detached container outlives the deploy that started it and its
logs are nobody's dashboard.

    pending ──► downloading ──► importing ──► ready
                     │              │           (row_count, source_version, finished_at)
                     └──────┬───────┘
                            ▼
                         failed  (error preserved; just re-run)

Order matters: `ref_villages` must load before `osm_address_points`, because the OSM points get
their 縣市/鄉鎮市區/村里 from a spatial join against those polygons rather than from OSM's own
tags. That is deliberate — OSM tags Taiwanese admin levels inconsistently (the same reverse
geocode returns 村里 as `neighbourhood` in Taipei and `city_district` in Hualien), while the
government shapefile has clean COUNTYNAME/TOWNNAME/VILLNAME.

Every text value is written through `app.core.address.fold`, the same function the query path
applies to user input. Skipping it here would break matching silently: the published data
contains both 臺北市 and 台中路, and full-width digits (新群３路, 竹田１巷).

Usage:
    python scripts/import_reference_data.py                     # all, skipping ones already ready
    python scripts/import_reference_data.py --only ref_roads    # one dataset
    python scripts/import_reference_data.py --force             # re-import even if ready
"""

import argparse
import asyncio
import csv
import io
import json
import logging
import sys
import tempfile
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import httpx
import shapefile
from shapely.geometry import MultiPolygon, shape
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.address import fold, parse_tw_address
from app.core.config import settings

log = logging.getLogger("import_reference_data")

# One 64-bit key, so two concurrent runs cannot interleave TRUNCATE and COPY. Held on a single
# session for the whole run and released when that connection closes, including on a crash.
_ADVISORY_LOCK_KEY = 0x0ADD_2E55

_DATA_GOV_API = "https://data.gov.tw/api/v2/rest/dataset/{dataset_id}"
_ROADS_DATASET_ID = "35321"  # 全國路名資料 (內政部戶政司)
_VILLAGES_DATASET_ID = "7438"  # 村里界圖 TWD97經緯度 (內政部)
_OSM_EXTRACT_URL = "https://download.geofabrik.de/asia/taiwan-latest.osm.pbf"

_DOWNLOAD_TIMEOUT = httpx.Timeout(60.0, read=900.0)

# Government file hosts whose TLS certificates omit the Subject Key Identifier extension, which
# Python's SSL stack rejects outright:
#     httpx.ConnectError: [SSL: CERTIFICATE_VERIFY_FAILED] ... Missing Subject Key Identifier
# Exactly the defect app/services/tile_proxy.py already carries `verify_ssl=False` for on the
# NLSC tile source. Verification is disabled per HOST, never globally: data.gov.tw (which serves
# the metadata that decides *which* file to fetch) verifies normally and stays verified. What is
# downloaded here is published open data, and a corrupted payload fails loudly at parse time.
_TLS_LENIENT_HOSTS = frozenset({"tgos.tw", "www.tgos.tw", "opdadm.moi.gov.tw"})


class Fetcher:
    """Two httpx clients, chosen per host, so lenient TLS never leaks to other requests."""

    def __init__(self) -> None:
        """Open a verifying client and a lenient one for the hosts listed above."""
        self._strict = httpx.AsyncClient(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True)
        self._lenient = httpx.AsyncClient(timeout=_DOWNLOAD_TIMEOUT, follow_redirects=True, verify=False)  # noqa: S501

    def _client(self, url: str) -> httpx.AsyncClient:
        return self._lenient if httpx.URL(url).host in _TLS_LENIENT_HOSTS else self._strict

    async def get(self, url: str) -> httpx.Response:
        """GET, raising for any non-2xx."""
        resp = await self._client(url).get(url)
        resp.raise_for_status()
        return resp

    async def head(self, url: str) -> httpx.Response:
        """HEAD, used only to read a Last-Modified as the source version."""
        return await self._client(url).head(url)

    def stream(self, url: str):
        """Streaming GET context manager, for payloads too large to hold in memory."""
        return self._client(url).stream("GET", url)

    async def aclose(self) -> None:
        """Close both clients."""
        await self._strict.aclose()
        await self._lenient.aclose()


# --------------------------------------------------------------------------- status tracking


async def _set_status(engine, name: str, status: str, **fields) -> None:
    """Upsert one reference_datasets row. Its own connection, so it survives a failed import txn."""
    columns = {"name": name, "status": status, **fields}
    assignments = ", ".join(f"{k} = :{k}" for k in columns if k != "name")
    async with engine.begin() as conn:
        await conn.execute(
            text(
                f"INSERT INTO reference_datasets ({', '.join(columns)}) "
                f"VALUES ({', '.join(':' + k for k in columns)}) "
                f"ON CONFLICT (name) DO UPDATE SET {assignments}"
            ),
            columns,
        )


async def _current_version(engine, name: str) -> str | None:
    """Return the source_version of a dataset that is already `ready`, else None."""
    async with engine.connect() as conn:
        return await conn.scalar(
            text("SELECT source_version FROM reference_datasets WHERE name = :n AND status = 'ready'"),
            {"n": name},
        )


# --------------------------------------------------------------------------- loading helpers


async def _copy_csv(conn, table: str, columns: list[str], rows: Iterator[tuple]) -> int:
    """Replace `table`'s contents with `rows`, via a staging table and one short swap.

    COPY runs into an UNLOGGED staging table so the (slow) load never holds a lock on the live
    table. Only the final TRUNCATE + INSERT does, and that is measured in seconds — important
    because `normalizeAddress` reads these tables while an import is running.

    CSV rather than asyncpg's binary `copy_records_to_table`: geometry values are EWKT strings
    and asyncpg has no codec for PostGIS types, so text COPY (which goes through the column's
    own input function) is what makes one code path work for all three datasets.
    """
    staging = f"{table}_staging"
    await conn.exec_driver_sql(f"DROP TABLE IF EXISTS {staging}")
    await conn.exec_driver_sql(f"CREATE UNLOGGED TABLE {staging} (LIKE {table})")

    buf = io.StringIO()
    writer = csv.writer(buf)
    count = 0
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
        count += 1
    payload = buf.getvalue().encode()

    raw = await conn.get_raw_connection()
    await raw.driver_connection.copy_to_table(
        staging, source=io.BytesIO(payload), columns=columns, format="csv", null=""
    )
    await conn.exec_driver_sql(f"TRUNCATE {table}")
    await conn.exec_driver_sql(
        f"INSERT INTO {table} ({', '.join(columns)}) SELECT {', '.join(columns)} FROM {staging}"
    )
    await conn.exec_driver_sql(f"DROP TABLE {staging}")
    return count


async def _resource_url(client: Fetcher, dataset_id: str, *, latest_year: bool) -> tuple[str, str]:
    """Resolve a data.gov.tw dataset to (download_url, version) for its newest distribution."""
    resp = await client.get(_DATA_GOV_API.format(dataset_id=dataset_id))
    distributions = json.loads(resp.text)["result"]["distribution"]
    if latest_year:
        # Resources are named "115全國路名資料"; the leading ROC year is the only ordering key,
        # and resourceAmount is 0 for the newest ones so it cannot be used to pick.
        def year(d):
            digits = d["resourceDescription"][:3]
            return int(digits) if digits.isdigit() else 0

        chosen = max(distributions, key=year)
    else:
        chosen = distributions[0]
    return chosen["resourceDownloadUrl"], chosen["resourceDescription"]


# --------------------------------------------------------------------------- ref_roads


async def import_roads(engine, client: Fetcher) -> int:
    """Load 全國路名資料 — every published road name, ~35.8k rows over 361 towns."""
    url, version = await _resource_url(client, _ROADS_DATASET_ID, latest_year=True)
    await _set_status(engine, "ref_roads", "downloading", source_version=version)
    resp = await client.get(url)

    await _set_status(engine, "ref_roads", "importing", source_version=version)
    # utf-8-sig: the published file carries a BOM, and without this the first column name comes
    # back as "﻿city" and every row's county reads as None.
    reader = csv.DictReader(io.StringIO(resp.content.decode("utf-8-sig")))
    seen: set[tuple[str, str, str]] = set()
    rows = []
    for record in reader:
        county = fold(record.get("city"))
        road = fold(record.get("road"))
        site_id = fold(record.get("site_id"))
        if not (county and road and site_id):
            continue
        # site_id is the FULL "花蓮縣光復鄉", not "光復鄉". Strip the county to get the town, or
        # every lookup keyed on town silently matches nothing.
        town = site_id[len(county) :] if site_id.startswith(county) else site_id
        key = (county, town, road)
        if key in seen:  # the published file has exact duplicates
            continue
        seen.add(key)
        rows.append(key)

    async with engine.begin() as conn:
        count = await _copy_csv(conn, "ref_roads", ["county", "town", "road"], iter(rows))
    return count


# --------------------------------------------------------------------------- ref_villages


def _read_village_shapefile(blob: bytes) -> Iterator[tuple]:
    """Yield (villcode, county, town, village, EWKT) from every shapefile in the 村里界圖 zip.

    The archive holds MORE THAN ONE shapefile, and reading only one silently loses data: the
    current publication ships `VILLAGE_NLSC_*` (7,986 villages) alongside `Village_Sanhe`
    (1 — 屏東縣瑪家鄉三和村, published separately). Both carry identical fields, so every
    basename with a .shp is read and concatenated.

    pyshp is pure Python — deliberately, so this does not drag GDAL into the backend image for a
    job that runs once per release.
    """
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        members = {n.lower(): n for n in z.namelist()}
        basenames = sorted(
            Path(n).with_suffix("").as_posix() for n in z.namelist() if n.lower().endswith(".shp")
        )
        if not basenames:
            raise ValueError(f"village archive contains no .shp: {z.namelist()[:10]}")

        def member(base: str, ext: str) -> io.BytesIO | None:
            """Read one sidecar of `base` from the archive, or None when it is absent."""
            name = members.get(f"{base}{ext}".lower())
            return io.BytesIO(z.read(name)) if name else None

        for base in basenames:
            dbf = member(base, ".dbf")
            if dbf is None:
                raise ValueError(f"village shapefile {base} has no .dbf")
            # The sidecar .CPG declares the DBF encoding (UTF-8 in the current publication;
            # Big5 was used historically). `encodingErrors` keeps one stray byte from aborting
            # an 8k-row import.
            cpg = member(base, ".cpg")
            encoding = cpg.read().decode("ascii", "ignore").strip() if cpg else "utf-8"
            reader = shapefile.Reader(
                shp=member(base, ".shp"),
                dbf=dbf,
                shx=member(base, ".shx"),
                encoding=encoding or "utf-8",
                encodingErrors="replace",
            )
            for record in reader.iterShapeRecords():
                fields = record.record.as_dict()
                geometry = shape(record.shape.__geo_interface__)
                if geometry.geom_type == "Polygon":
                    geometry = MultiPolygon([geometry])
                yield (
                    fields.get("VILLCODE"),
                    fold(fields.get("COUNTYNAME")),
                    fold(fields.get("TOWNNAME")),
                    fold(fields.get("VILLNAME")),
                    f"SRID=4326;{geometry.wkt}",
                )


async def import_villages(engine, client: Fetcher) -> int:
    """Load 村里界圖 — every 村里 polygon, the only source with complete positional coverage."""
    url, version = await _resource_url(client, _VILLAGES_DATASET_ID, latest_year=False)
    await _set_status(engine, "ref_villages", "downloading", source_version=version)
    resp = await client.get(url)

    await _set_status(engine, "ref_villages", "importing", source_version=version)
    rows = [r for r in _read_village_shapefile(resp.content) if r[0] and r[1]]
    async with engine.begin() as conn:
        count = await _copy_csv(
            conn, "ref_villages", ["villcode", "county", "town", "village", "geom"], iter(rows)
        )
    return count


# --------------------------------------------------------------------------- osm_address_points


def _osm_rows(pbf_path: Path) -> Iterator[tuple]:
    """Yield (id, EWKT, road, section, lane, alley, no) for OSM nodes carrying a house number.

    Nodes only. Taiwanese addresses in OSM are predominantly standalone `place=house` nodes, and
    including building ways would require osmium's node-location index — hundreds of MB of RAM on
    a VM with 2 GB of swap, for a minority of the data.

    Admin columns are left NULL here; `_fill_admin_from_villages` sets them from the government
    polygons afterwards, which is more reliable than OSM's inconsistent addr:* tagging.
    """
    import osmium

    class _Handler(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.rows: list[tuple] = []

        def node(self, n):
            number = n.tags.get("addr:housenumber")
            street = n.tags.get("addr:street")
            if not number:
                return
            # Reuse the production parser so stored values are identical in form to what a query
            # produces — including 段/巷/弄 split out of a street string like "文化路二段".
            try:
                parts = parse_tw_address(f"{street or ''}{number}")
            except ValueError:
                return
            if not parts.no:
                return
            self.rows.append(
                (
                    n.id,
                    f"SRID=4326;POINT({n.location.lon} {n.location.lat})",
                    parts.road,
                    parts.section,
                    parts.lane,
                    parts.alley,
                    parts.no,
                )
            )

    handler = _Handler()
    handler.apply_file(str(pbf_path))
    return iter(handler.rows)


async def _fill_admin_from_villages(conn) -> None:
    """Stamp 縣市/鄉鎮市區/村里 onto every address point from the government polygons."""
    await conn.exec_driver_sql(
        "UPDATE osm_address_points p "
        "SET county = v.county, town = v.town, village = v.village "
        "FROM ref_villages v WHERE ST_Contains(v.geom, p.geom)"
    )


async def import_osm(engine, client: Fetcher) -> int:
    """Load OSM address points from the Geofabrik Taiwan extract (326 MB)."""
    async with engine.connect() as conn:
        ready = await conn.scalar(
            text("SELECT count(*) FROM reference_datasets WHERE name='ref_villages' AND status='ready'")
        )
    if not ready:
        raise ValueError("ref_villages must be imported first — it supplies the admin columns")

    head = await client.head(_OSM_EXTRACT_URL)
    version = head.headers.get("last-modified", "unknown")[:64]
    await _set_status(engine, "osm_address_points", "downloading", source_version=version)

    with tempfile.TemporaryDirectory() as tmp:
        pbf = Path(tmp) / "taiwan-latest.osm.pbf"
        # Streamed to disk, not held in memory: the extract is 326 MB and osmium reads from a path.
        with pbf.open("wb") as fh:
            async with client.stream(_OSM_EXTRACT_URL) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=1 << 20):
                    fh.write(chunk)

        await _set_status(engine, "osm_address_points", "importing", source_version=version)
        rows = _osm_rows(pbf)
        async with engine.begin() as conn:
            count = await _copy_csv(
                conn,
                "osm_address_points",
                ["id", "geom", "road", "section", "lane", "alley", "no"],
                rows,
            )
            await _fill_admin_from_villages(conn)
    return count


# --------------------------------------------------------------------------- driver

# Order is load-order, not alphabetical: villages before OSM (see the module docstring).
IMPORTERS = {
    "ref_villages": import_villages,
    "ref_roads": import_roads,
    "osm_address_points": import_osm,
}


async def run(names: list[str], *, force: bool) -> int:
    """Import each named dataset; returns the number that failed."""
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL)
    failures = 0
    try:
        # Held for the whole run on one dedicated connection, so a second container exits
        # immediately instead of racing this one's TRUNCATE.
        async with engine.connect() as lock_conn:
            if not await lock_conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": _ADVISORY_LOCK_KEY}):
                log.error("another import is already running; exiting")
                return 1

            client = Fetcher()
            try:
                for name in names:
                    if not force and await _current_version(engine, name):
                        log.info("%s already ready; skipping (use --force to reload)", name)
                        continue
                    started = datetime.now(UTC)
                    await _set_status(engine, name, "pending", started_at=started, error=None)
                    try:
                        count = await IMPORTERS[name](engine, client)
                    except Exception as err:  # noqa: BLE001 — recorded, not swallowed
                        failures += 1
                        log.exception("%s failed", name)
                        await _set_status(
                            engine,
                            name,
                            "failed",
                            row_count=None,
                            finished_at=datetime.now(UTC),
                            error=f"{type(err).__name__}: {err}"[:2000],
                        )
                        continue
                    await _set_status(
                        engine,
                        name,
                        "ready",
                        row_count=count,
                        finished_at=datetime.now(UTC),
                        error=None,
                    )
                    log.info("%s ready: %d rows", name, count)
            finally:
                await client.aclose()
    finally:
        await engine.dispose()
    return failures


def main() -> int:
    """Parse arguments and run the requested imports."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help=f"comma-separated subset of: {', '.join(IMPORTERS)}")
    parser.add_argument("--force", action="store_true", help="re-import datasets already marked ready")
    args = parser.parse_args()

    names = list(IMPORTERS)
    if args.only:
        requested = [n.strip() for n in args.only.split(",")]
        unknown = set(requested) - set(IMPORTERS)
        if unknown:
            parser.error(f"unknown dataset(s): {', '.join(sorted(unknown))}")
        names = [n for n in IMPORTERS if n in requested]  # keep dependency order
    return asyncio.run(run(names, force=args.force))


if __name__ == "__main__":
    sys.exit(main())
