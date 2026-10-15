"""GraphQL queries for role requests. Thin per ADR-014; see app/services/role_request.py."""

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.role_requests.types import MyRoleRequestsType, RoleRequestType
from app.services import role_request as role_request_service


@strawberry.type
class RoleRequestQuery:
    """Queries for the caller's own applications."""

    @strawberry.field
    async def my_role_requests(self, info: strawberry.types.Info) -> MyRoleRequestsType:
        """The caller's applications, newest first, and whether the entry should offer to apply."""
        state = await role_request_service.my_role_requests(
            info.context["db"], actor=require_authenticated(info)
        )
        return MyRoleRequestsType(
            has_backoffice_identity=state.has_backoffice_identity,
            can_apply=state.can_apply,
            requests=[RoleRequestType.from_model(request) for request in state.requests],
        )
