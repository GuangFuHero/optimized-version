"""GraphQL mutations for role requests. Thin per ADR-014; see app/services/role_request.py."""

from uuid import UUID

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.role_requests.types import RoleRequestType, SubmitRoleRequestInput
from app.services import role_request as role_request_service


@strawberry.type
class RoleRequestMutation:
    """Mutations an applicant makes on their own application."""

    @strawberry.mutation
    async def submit_role_request(
        self, info: strawberry.types.Info, input: SubmitRoleRequestInput
    ) -> RoleRequestType:
        """Apply to join a team, found one, or become a data auditor. Stays pending until decided.

        Refused to anyone with an application still pending, to a member of the team asked for,
        to anyone holding a back-office identity who asks to be a data auditor, and to everyone
        while role_request.add is switched off.
        """
        request = await role_request_service.submit(
            info.context["db"],
            actor=require_authenticated(info),
            requested_role=input.requested_role.value,
            reason=input.reason,
            name=input.name,
            email=input.email,
            team_uuid=input.team_uuid,
            new_team_name=input.new_team_name,
        )
        return RoleRequestType.from_model(request)

    @strawberry.mutation
    async def withdraw_role_request(self, info: strawberry.types.Info, uuid: UUID) -> RoleRequestType:
        """Take back one's own pending application, so a different one can be sent at once.

        Anyone else's application is reported as not found; one already decided cannot be
        taken back. Nobody is notified.
        """
        request = await role_request_service.withdraw(
            info.context["db"], actor=require_authenticated(info), request_uuid=uuid
        )
        return RoleRequestType.from_model(request)
