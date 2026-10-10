"""Shared helpers for the Spec 020 service and submission tests."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from tests.conftest import acting_as, seed_disaster_types


async def actor_with(db, *perms: Perm) -> User:
    """A committed user acting as one platform role holding `perms` at scope `all`."""
    user = User(name=f"dedup-{'-'.join(p.value for p in perms) or 'none'}")
    db.add(user)
    role = Role(name=f"role-{user.name}", kind="platform")
    db.add(role)
    await db.flush()
    for perm in perms:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, role_kind="platform"))
    acting_as(user, role)  # before the commit expires `role`
    seed_disaster_types(db)
    await db.commit()
    await db.refresh(user)
    return user


@dataclass
class AsyncStubEngine:
    """An ADR-304 engine whose answers the test decides.

    `suspects` is returned by `check` (a callable receives the submission); `delay_s` sleeps
    first; `fail` raises; `write` adds a row before answering, to exercise the read-only guard.
    `scored` is what `score` returns (None = the related entity is gone).
    """

    version: str = "stub-v2"
    suspects: Sequence | Callable = ()
    delay_s: float = 0.0
    fail: bool = False
    write: bool = False
    scored: object = "default"
    fail_score: bool = False
    check_calls: list = field(default_factory=list)
    score_calls: list = field(default_factory=list)

    async def check(self, db, submission, now):
        """The configured suspects, after the configured misbehaviour."""
        import asyncio

        self.check_calls.append(submission)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.fail:
            raise RuntimeError("engine exploded")
        if self.write:
            db.add(User(name="engine-was-here"))
            await db.flush()
        return list(self.suspects(submission) if callable(self.suspects) else self.suspects)

    async def score(self, db, submission, draft_ref, related_kind, related_uuid, now):
        """A fixed score for any pair, or the configured failure."""
        from app.dedup_engine.contract import Suspect

        self.score_calls.append((draft_ref, related_kind, related_uuid))
        if self.fail_score:
            raise RuntimeError("engine exploded")
        if self.scored != "default":
            return self.scored
        return Suspect(draft_ref, related_kind, related_uuid, 0.91, {"stub": True})
