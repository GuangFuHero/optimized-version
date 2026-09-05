"""GraphQL queries for address normalization and reference-data status.

Both fields use the same gate: `require_authenticated` plus `map.view`. The precedent is
`app/graphql/suggestions/queries.py` — reuse a capability that is already in `PUBLIC_PERMS`, but
additionally demand a real actor for a surface that should not be anonymous.

Authenticated rather than public because every genuine caller already is: `createTicket` goes
through `require_authenticated` and `createStation` through `station.add`. Nothing anonymous
needs to normalize an address, and excluding Guest costs no functionality while removing a free
reverse-geocoding service running on our infrastructure — which matters, because GraphQL has no
rate limiting (it is REST-only, app/api/v1/endpoints/auth/deps.py).

There is no checkpoint 2 here. The reference tables have no `created_by` and no owning team, so
there is no resource to scope-check: the `Scope` that `check_permission` returns is discarded on
purpose, and `scope_filter` is deliberately not called.
"""

import strawberry

from app.core.permissions import Perm
from app.graphql.address.types import (
    NormalizeAddressInput,
    NormalizedAddressType,
    ReferenceDatasetType,
)
from app.graphql.context import check_permission, require_authenticated
from app.repositories import address_repository
from app.services import address as address_service


@strawberry.type
class AddressQuery:
    """Queries for normalizing addresses and checking reference-data readiness."""

    @strawberry.field
    async def normalize_address(
        self, info: strawberry.types.Info, input: NormalizeAddressInput
    ) -> NormalizedAddressType:
        """Normalize an address from text, from a coordinate, or from both.

        Returns `normalizable: false` with the reason in `issues` for input that cannot be
        resolved — that is a result, not an error, so a client can show "we could not resolve
        this" without handling a failed request. It errors only on a malformed *request*
        (neither input given, half a coordinate, a coordinate off the globe).

        Requires map.view and a logged-in caller.
        """
        require_authenticated(info)  # MAP_VIEW is in PUBLIC_PERMS; address lookup is not public
        await check_permission(info, Perm.MAP_VIEW)
        result = await address_service.normalize_address(
            info.context["db"], raw=input.raw, lat=input.lat, lng=input.lng, limit=input.limit
        )
        return NormalizedAddressType.from_service(result)

    @strawberry.field
    async def reference_data(self, info: strawberry.types.Info) -> list[ReferenceDatasetType]:
        """Import status of each address reference dataset.

        The import is detached from the deploy, so datasets are legitimately absent for the
        first minutes of a release. Read this to decide whether to offer address suggestions.

        Requires map.view and a logged-in caller.
        """
        require_authenticated(info)  # same reasoning as normalizeAddress above
        await check_permission(info, Perm.MAP_VIEW)
        rows = await address_repository.dataset_statuses(info.context["db"])
        return [ReferenceDatasetType.from_model(r) for r in rows]
