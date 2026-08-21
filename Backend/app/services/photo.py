"""Attaching and removing photos.

Follows the same shape as station.py and ticket.py: plain module-level functions taking the
session first and everything else keyword-only, each one owning its own permission check,
input validation and persistence, so that GraphQL resolvers stay thin wrappers. Domain
failures are raised as ValueError.
"""

from types import SimpleNamespace
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.photo import Photo
from app.repositories.geo_repository import station_repository
from app.repositories.photo_repository import photo_repository
from app.services.authz import require_scope

_MAX_URL_LEN = 500  # matches app/models/photo.py: url = mapped_column(String(500))


def normalize_photo_url(url: str) -> str:
    """Return a photo url stripped, or raise if it is blank, too long, or not https.

    Length is checked here rather than left to the database because `photos.url` is a
    500-character column, and "must be at most 500 characters" is actionable where the
    driver's truncation error is not. The schema's `MaskErrors` keeps that error from leaking
    the statement, but only by replacing it with "Unexpected error." — it is the backstop for
    the columns nobody validated, not a substitute for a real 400 on the ones we did.

    Scheme is restricted to https because photo urls are read back by anonymous visitors. An
    allowlist keeps `javascript:` and `data:` payloads out of the table entirely, instead of
    trusting every present and future consumer to sanitize them before rendering. Widening
    the allowlist later is easy; purging rows already stored is not.

    Scheme and host come from `urlparse`, not a `startswith`: schemes are case-insensitive
    (RFC 3986 3.1), so `HTTPS://...` is a legitimate url that a literal prefix test refuses,
    and a bare `https://` passes a prefix test while being an empty `<img src>` downstream.
    The host test is `netloc` truthiness only — deliberately not a dotted-domain or TLD
    check, because single-label hosts are valid and already used (see test_loaders.py).

    Length is checked before parsing so an over-long url is reported as too long rather
    than as a malformed one.

    The stripped url is returned and the caller stores *that*, so the validated string and
    the stored string cannot drift apart. They used to be two independent `.strip()` calls
    that agreed by coincidence — the same split that leaked the contact-field INSERT when
    `normalize_contact_fields`' predecessor validated one string and stored another.
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("Photo url is required")
    if len(url) > _MAX_URL_LEN:
        raise ValueError(f"Photo url must be at most {_MAX_URL_LEN} characters")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("Photo url must be an https:// URL with a host")
    return url


async def attach_photo_to_geometry(
    db: AsyncSession, *, actor: User, base_geometry_uuid: str, url: str
) -> Photo:
    """Attach a photo to a station.

    Requires `station.contribute`, which every registered account holds, and there is no
    ownership check: station data is crowd-sourced, so anyone may add a photo to any
    station. Station properties and ratings are open in exactly the same way.

    The argument is called `base_geometry_uuid`, not `station_uuid`, because photos key off
    `base_geometries` — the parent table stations and tickets both extend. Only stations are
    wired up today.
    """
    await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
    url = normalize_photo_url(url)
    if not await station_repository.get_by_uuid_active(db, base_geometry_uuid):
        raise ValueError("Station not found")
    return await photo_repository.create(
        db,
        obj_in={
            "ref_uuid": base_geometry_uuid,
            # 'geometry' means "ref_uuid points at a base_geometries row" — a station here,
            # a ticket elsewhere. The other value in use is 'pole', for secondary locations.
            "ref_type": "geometry",
            "url": url,
            "created_by": str(actor.uuid),
        },
    )


async def detach_station_photo(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Soft-delete a station photo.

    Removing *someone else's* photo requires `station.review` (moderation), not the
    `station.contribute` that attaching uses. Attaching is deliberately open to every
    registered account, so sharing one capability between the two would let anybody delete
    anybody else's photos.

    Removing *your own* photo needs only the `station.contribute` that created it. Undoing a
    contribution should cost exactly what making it cost, and `station.review` is seeded only
    at super_admin/`all` and team admin/`zone` (seed_rbac.py:79,111) — without this branch an
    uploader could not fix their own mistake and had to find a moderator. This is the same
    `own` treatment the `user` role already gets on station.edit/station.delete. It is scoped
    narrowly on purpose: granting `station.review: own` instead would also reach
    `suggestion.py`, where `own` means "a station I created" and would let anyone
    self-approve suggestions on their own stations.

    Both lookups below run before the permission check, and both are load-bearing:

    1. The photo must really belong to a station. Stations and tickets share this table, and
       a row does not say which kind it is — both store a `base_geometries` uuid in
       `ref_uuid` under the same `ref_type`. Skipping this check would let a station
       moderator delete a *ticket's* photos, which a different capability governs. Both
       failure paths raise the same message, so the error cannot be used to probe whether
       some uuid belongs to a ticket.
    2. The parent station supplies the geometry the scope check needs. A photo has no
       location of its own, so a reviewer restricted to their team's work zone would match
       nothing without borrowing the station's coordinates. Station properties, which have
       the same problem, borrow theirs the same way (see station.py).
    """
    photo = await photo_repository.get_by_uuid_active(db, uuid)
    if not photo or photo.ref_type != "geometry":
        raise ValueError("Station photo not found")
    station = await station_repository.get_by_uuid_active(db, photo.ref_uuid)
    if not station:
        raise ValueError("Station photo not found")

    if str(photo.created_by) == str(actor.uuid):
        # Both sides stringified, matching in_scope's `own` branch (rbac_scopes.py:75):
        # photos.created_by is declared `Mapped[str]` but is a FK to a UUID column, so the
        # loaded attribute is a uuid.UUID and a bare `==` against a str is always False.
        # Self-removal, capability-only — the mirror of attach, which is capability-only too.
        # This check has to sit AFTER the active-station guard above, or a ticket photo's
        # uploader would delete it through a station mutation and reopen the boundary that
        # guard exists to close (ADR-068 [5]).
        await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
    else:
        await require_scope(
            actor,
            Perm.STATION_REVIEW,
            db,
            resource=SimpleNamespace(
                created_by=photo.created_by, team_uuid=None, geometry=station.geometry
            ),
        )
    await photo_repository.soft_delete(db, db_obj=photo)
