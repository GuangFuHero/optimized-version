"""Service-level tests for briefing generation (app/services/briefing.py).

The template-seeding rule moved from the repository to the service (ADR-AB-04), so its logic
is exercised here against real Role/Permission grants — require_scope runs first, then the
generate-from-template resolution.

Note on expire_on_commit: the function-scoped `db` fixture expires all objects on commit, so
after any repo call that commits we `db.refresh(actor)` before passing it to a service (whose
require_scope reads actor.uuid), and re-read persisted rows fresh for assertions.
"""

import pytest
from fastapi import HTTPException

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.repositories.briefings_repository import (
    briefing_repository as briefings,
)
from app.repositories.briefings_repository import (
    briefing_template_repository as templates,
)
from app.services import briefing as briefing_service


async def _actor(db, *, with_create: bool = True) -> User:
    """Create a user; when with_create, grant it briefing.create at 'all'."""
    user = User(name="briefer")
    db.add(user)
    await db.flush()
    if with_create:
        perm = Permission(key=Perm.BRIEFING_CREATE.value)
        db.add(perm)
        await db.flush()
        role = Role(name="briefing-maker", kind="platform")
        db.add(role)
        await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=perm.uuid, scope="all"))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
        await db.flush()
    return user


@pytest.mark.asyncio
async def test_generate_copies_from_template(db):
    """Common: omitted fields are seeded from the referenced live template."""
    actor = await _actor(db)
    t = await templates.create(db, obj_in={
        "content": "supply list", "tags": ["supply"], "state": "in_field",
        "created_by": str(actor.uuid),
    })
    tpl_uuid = str(t.uuid)
    await db.refresh(actor)  # reload actor expired by the template create's commit
    b = await briefing_service.generate(
        db, actor=actor, template_uuid=t.uuid, content=None, tags=None, state=None
    )
    got = await briefings.get_by_uuid_active(db, b.uuid)
    assert got.content == "supply list"
    assert got.tags == ["supply"]
    assert got.state == "in_field"
    assert str(got.template_uuid) == tpl_uuid


@pytest.mark.asyncio
async def test_generate_ad_hoc_uses_defaults(db):
    """Common: with no template and no fields, an ad-hoc briefing defaults to empty/'briefing'."""
    actor = await _actor(db)
    b = await briefing_service.generate(
        db, actor=actor, template_uuid=None, content=None, tags=None, state=None
    )
    got = await briefings.get_by_uuid_active(db, b.uuid)
    assert got.template_uuid is None
    assert got.content == ""
    assert got.tags == []
    assert got.state == "briefing"


@pytest.mark.asyncio
async def test_generate_override_wins_over_template(db):
    """Edge: an explicit field overrides the template; omitted fields still inherit."""
    actor = await _actor(db)
    t = await templates.create(db, obj_in={
        "content": "base", "tags": ["t"], "state": "debrief", "created_by": str(actor.uuid),
    })
    await db.refresh(actor)  # reload actor expired by the template create's commit
    b = await briefing_service.generate(
        db, actor=actor, template_uuid=t.uuid, content="override", tags=None, state=None
    )
    got = await briefings.get_by_uuid_active(db, b.uuid)
    assert got.content == "override"   # explicit wins
    assert got.tags == ["t"]           # inherited from template
    assert got.state == "debrief"      # inherited from template


@pytest.mark.asyncio
async def test_generate_without_permission_is_403(db):
    """Abnormal: an actor lacking briefing.create is refused at checkpoint 1."""
    actor = await _actor(db, with_create=False)
    with pytest.raises(HTTPException) as exc:
        await briefing_service.generate(
            db, actor=actor, template_uuid=None, content="x", tags=None, state=None
        )
    assert exc.value.status_code == 403
