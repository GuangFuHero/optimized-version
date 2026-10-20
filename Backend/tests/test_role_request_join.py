"""Applying names a team, or a new one, and carries the applicant's details (Spec/026, Task 3).

Service-level, like tests/test_role_request.py. Rules from ADR-350 point 2 (what each identity
names), ADR-351 (one pending per account; who may apply), ADR-352 (team type and new names) and
ADR-355 (phone, email, name).
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select

from app.core.permissions import Perm
from app.models.auth import User, UserContact
from app.models.rbac import UserRoleAssign
from app.models.role_request import RoleRequest
from app.models.team import Team
from app.services import role_request
from app.services.authz import refresh_actor
from tests.conftest import acting_as
from tests.test_role_request import REASON, _role

PHONE = "+886912345678"


async def _team(db, name: str, type_: str = "gov", **columns) -> Team:
    team = Team(name=name, type=type_, status="active", **columns)
    db.add(team)
    await db.flush()
    return team


async def _applicant(db, *, phone: str | None = PHONE, email: str | None = None, name: str = "暱稱") -> User:
    """A signed-in account holding the platform `user`, with the verified contacts asked for."""
    user = User(name=name)
    db.add(user)
    await db.flush()
    role = await _role(db, "user", {Perm.ROLE_REQUEST_ADD: "all"})
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    for type_, value in (("phone", phone), ("email", email)):
        if value is not None:
            db.add(
                UserContact(
                    user_uuid=user.uuid, type=type_, value=value, verified=True, verified_at=datetime.now(UTC)
                )
            )
    await db.flush()
    return acting_as(user, role)


async def _join(db, user: User, team: Team) -> None:
    """Make `user` a member of `team`, as add_team_member leaves it."""
    member = await _role(db, "member", {}, kind="team")
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=member.uuid, team_uuid=team.uuid, role_kind="team"))
    await db.flush()


async def _submit(db, actor: User, **changes) -> RoleRequest:
    await refresh_actor(db, actor)
    application = {"requested_role": "government", "reason": REASON, "name": "王小明", **changes}
    return await role_request.submit(db, actor=actor, **application)


# --- what each identity names (ADR-350 point 2, ADR-352) ---


@pytest.mark.asyncio
async def test_a_government_applicant_asks_to_join_an_existing_government_team(db):
    """A member request names the team and no new name."""
    team_uuid = (await _team(db, "花蓮縣光復鄉公所")).uuid  # read now: submitting commits and expires it
    applicant = await _applicant(db)

    request = await _submit(db, applicant, team_uuid=team_uuid)

    assert (request.status, request.team_uuid, request.new_team_name) == ("pending", team_uuid, None)


@pytest.mark.asyncio
async def test_an_ngo_applicant_asks_to_found_a_new_team(db):
    """A new-team application keeps the trimmed name and names no existing team."""
    applicant = await _applicant(db)

    request = await _submit(db, applicant, requested_role="ngo", new_team_name="  光復在地互助協會 ")

    assert (request.team_uuid, request.new_team_name) == (None, "光復在地互助協會")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("changes", "message"),
    [
        pytest.param({}, "Pick a team or name a new one", id="neither"),
        pytest.param({"new_team_name": "   "}, "Pick a team or name a new one", id="blank new name"),
        pytest.param(
            {"team": True, "new_team_name": "新隊"}, "Pick a team or a new name, not both", id="both"
        ),
        pytest.param(
            {"requested_role": "data_auditor", "team": True},
            "A data auditor application names no team",
            id="auditor+team",
        ),
        pytest.param(
            {"requested_role": "data_auditor", "new_team_name": "新隊"},
            "A data auditor application names no team",
            id="auditor+new name",
        ),
        pytest.param(
            {"new_team_name": "隊" * 101}, "Team name must be at most 100 characters", id="long new name"
        ),
        pytest.param({"name": "  "}, "Name is required", id="blank name"),
        pytest.param({"name": "名" * 101}, "Name must be at most 100 characters", id="long name"),
        pytest.param({"email": "not-an-email", "team": True}, "Email is not valid", id="bad email"),
    ],
)
async def test_refusals_name_what_to_fix(db, changes, message):
    """Each refusal is a message the form can map to Chinese."""
    team = await _team(db, "某公所")
    applicant = await _applicant(db)
    changes = dict(changes)
    if changes.pop("team", False):
        changes["team_uuid"] = team.uuid

    with pytest.raises(ValueError, match=f"^{message}$"):
        await _submit(db, applicant, **changes)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "team_columns",
    [
        pytest.param({"type_": "ngo"}, id="wrong type"),
        pytest.param({"status": "suspended"}, id="suspended"),
        pytest.param({"status": "disbanded"}, id="disbanded"),
        pytest.param({"delete_at": datetime.now(UTC)}, id="deleted"),
    ],
)
async def test_a_team_that_cannot_be_joined_is_not_found(db, team_columns):
    """Wrong type, not active or deleted all read the same, as an unknown uuid does."""
    columns = dict(team_columns)
    status = columns.pop("status", "active")
    team = await _team(db, "不能加入", **columns)
    team.status = status
    await db.flush()
    applicant = await _applicant(db)

    with pytest.raises(ValueError, match="^Team not found$"):
        await _submit(db, applicant, team_uuid=team.uuid)


@pytest.mark.asyncio
async def test_an_unknown_team_is_not_found(db):
    """An unknown uuid reads like a team that cannot be joined."""
    applicant = await _applicant(db)
    import uuid

    with pytest.raises(ValueError, match="^Team not found$"):
        await _submit(db, applicant, team_uuid=uuid.uuid4())


@pytest.mark.asyncio
@pytest.mark.parametrize("taken", ["光復互助協會", "  光復互助協會  ", "光復互助協會".upper()])
async def test_a_new_team_name_already_in_use_is_refused(db, taken):
    """Trimmed and ignoring case (ADR-352 point 3); any team counts, whatever its type."""
    await _team(db, "光復互助協會", "ngo")
    applicant = await _applicant(db)

    with pytest.raises(ValueError, match="^A team with this name already exists$"):
        await _submit(db, applicant, new_team_name=taken)


@pytest.mark.asyncio
async def test_a_latin_name_differing_only_in_case_is_taken(db):
    """Case is ignored for Latin names too."""
    await _team(db, "Red Cross Hualien", "ngo")
    applicant = await _applicant(db)

    with pytest.raises(ValueError, match="^A team with this name already exists$"):
        await _submit(db, applicant, requested_role="ngo", new_team_name="red cross hualien")


# --- who may apply (ADR-351) ---


@pytest.mark.asyncio
async def test_a_member_of_one_team_may_ask_to_join_another(db):
    """ADR-351 point 2: other team identities do not count."""
    a, b = await _team(db, "A 隊"), await _team(db, "B 隊")
    applicant = await _applicant(db)
    await _join(db, applicant, a)

    request = await _submit(db, applicant, team_uuid=b.uuid)

    assert request.status == "pending"


@pytest.mark.asyncio
async def test_a_member_of_the_team_cannot_ask_to_join_it(db):
    """ADR-351 point 2: already in that team."""
    team = await _team(db, "B 隊")
    applicant = await _applicant(db)
    await _join(db, applicant, team)

    with pytest.raises(ValueError, match="^You are already a member of this team$"):
        await _submit(db, applicant, team_uuid=team.uuid)


@pytest.mark.asyncio
async def test_someone_removed_from_a_team_may_ask_again(db):
    """Membership is the grant (ADR-072); once removed they are not a member."""
    team = await _team(db, "B 隊")
    applicant = await _applicant(db)
    await _join(db, applicant, team)
    await db.execute(delete(UserRoleAssign).where(UserRoleAssign.team_uuid == team.uuid))
    await db.flush()

    request = await _submit(db, applicant, team_uuid=team.uuid)

    assert request.status == "pending"


@pytest.mark.asyncio
async def test_a_team_member_still_cannot_apply_to_be_a_data_auditor(db):
    """AC-RE-101 is unchanged for the platform role (ADR-351 point 3)."""
    applicant = await _applicant(db)
    await _join(db, applicant, await _team(db, "A 隊"))

    with pytest.raises(ValueError, match="^Only an account without a back-office identity can apply$"):
        await _submit(db, applicant, requested_role="data_auditor")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "second",
    [
        pytest.param({"requested_role": "data_auditor"}, id="then data auditor"),
        pytest.param({"requested_role": "ngo", "new_team_name": "另一隊"}, id="then new team"),
        pytest.param({"other_team": True}, id="then another team"),
    ],
)
async def test_one_pending_application_per_account(db, second):
    """Whatever the first asks for, a second waits for it (ADR-351 point 1)."""
    first_team, other_team = await _team(db, "第一隊"), await _team(db, "第二隊")
    other_team_uuid = other_team.uuid  # read now: submitting commits and expires it
    applicant = await _applicant(db)
    await _submit(db, applicant, team_uuid=first_team.uuid)
    second = dict(second)
    if second.pop("other_team", False):
        second["team_uuid"] = other_team_uuid

    with pytest.raises(ValueError, match="^You already have a pending request$"):
        await _submit(db, applicant, **second)


@pytest.mark.asyncio
async def test_a_team_member_without_a_pending_request_may_apply(db):
    """`canApply` no longer asks for no back-office identity (ADR-351 Consequences)."""
    applicant = await _applicant(db)
    await _join(db, applicant, await _team(db, "A 隊"))
    await refresh_actor(db, applicant)

    state = await role_request.my_role_requests(db, actor=applicant)

    assert (state.has_backoffice_identity, state.can_apply) == (True, True)


# --- the applicant's details (ADR-355) ---


@pytest.mark.asyncio
async def test_an_account_without_a_verified_phone_is_asked_for_one(db):
    """ADR-355 point 1: the site adds one through the contact flow first."""
    team = await _team(db, "某公所")
    applicant = await _applicant(db, phone=None)

    with pytest.raises(ValueError, match="^A verified phone number is required$"):
        await _submit(db, applicant, team_uuid=team.uuid)


@pytest.mark.asyncio
async def test_the_request_keeps_the_name_phone_and_typed_email(db):
    """Snapshots taken at submit, trimmed and normalized."""
    team = await _team(db, "某公所")
    applicant = await _applicant(db)

    request = await _submit(db, applicant, team_uuid=team.uuid, name=" 王小明 ", email=" Ming@Example.org ")

    assert (request.applicant_name, request.applicant_phone, request.applicant_email) == (
        "王小明",
        PHONE,
        "ming@example.org",
    )


@pytest.mark.asyncio
async def test_the_accounts_verified_email_wins_over_a_typed_one(db):
    """It is the login email, shown read-only on the form."""
    team = await _team(db, "某公所")
    applicant = await _applicant(db, email="login@example.org")

    request = await _submit(db, applicant, team_uuid=team.uuid, email="other@example.org")

    assert request.applicant_email == "login@example.org"


@pytest.mark.asyncio
async def test_email_is_optional(db):
    """No account email and none typed leaves it empty."""
    team = await _team(db, "某公所")
    applicant = await _applicant(db)

    request = await _submit(db, applicant, team_uuid=team.uuid)

    assert request.applicant_email is None


@pytest.mark.asyncio
async def test_applying_never_changes_the_accounts_nickname(db):
    """ADR-355 point 3: users.name stays the nickname."""
    team = await _team(db, "某公所")
    applicant = await _applicant(db, name="小明")
    applicant_uuid = applicant.uuid

    await _submit(db, applicant, team_uuid=team.uuid, name="王小明")

    nickname = (await db.execute(select(User.name).where(User.uuid == applicant_uuid))).scalar_one()
    assert nickname == "小明"


@pytest.mark.asyncio
async def test_a_data_auditor_application_still_works(db):
    """Spec 019's path, with the new details."""
    applicant = await _applicant(db)

    request = await _submit(db, applicant, requested_role="data_auditor")

    assert (request.requested_role, request.status, request.applicant_phone) == (
        "data_auditor",
        "pending",
        PHONE,
    )
