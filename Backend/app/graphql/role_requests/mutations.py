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
        """Apply to become back-office staff. Stays pending until a super admin decides.

        Refused to anyone who already holds a back-office identity, to anyone with an
        application still pending, and to everyone while role_request.add is switched off.
        """
        request = await role_request_service.submit(
            info.context["db"],
            actor=require_authenticated(info),
            requested_role=input.requested_role.value,
            reason=input.reason,
            contact=input.contact,
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
