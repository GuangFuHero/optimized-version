"""Script to seed initial RBAC v1 permissions, roles, and role-permission grants.

ADR-026 drop-and-replace: platform roles (kind="platform", one per account, ADR-019) and
team roles (kind="team", assigned per-team; resolved against the actor's own
`users.team_uuid` — see app/models/rbac.py:UserRoleAssign). Scope values follow
app/core/rbac_scopes.py:Scope (none/own/team/gov/ngo/zone/all).

Only capabilities with a real enforcement point today (station/map/ticket/dynamic_field/
user/team/audit/rbac/announcement) are actually granted below; the rest of the Perm
catalog (ticket.export/ai_duplicate/pre_departure) is registered as a Permission row so
it exists ahead of the feature that will enforce it, but isn't wired into any role yet.
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.permissions import Perm
from app.models.rbac import Permission, Role, RolePermissionAssign

# 資料庫連線配置
engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# scope 值: "none" | "own" | "team" | "zone" | "all"  (ADR-049 乙:gov/ngo scope 已退場)
#
# 角色 = 功能軸 × 組織軸(ADR-049)。功能角色住這裡(user_role_assign);組織(gov/ngo)是
# users.team_uuid → team.type,不進角色名。"政府協調員" = 團隊角色 admin + gov 型 team。
# 授權靠地理:geo 資源能不能被某 team 的人 edit/看 PII,看它的座標是否落在該 team 被指派的
# WorkZone polygon 內(zone scope);建立(make)是純 capability,任何人有能力就能建。
ROLES_DATA = [
    {
        # Default platform role every registered account gets (app/services/auth_account.py).
        # A plain citizen: sees everything (view is public), can create, but only touches
        # what they themselves created (own).
        "name": "user",
        "kind": "platform",
        "permissions": {
            Perm.MAP_VIEW: "all",
            Perm.STATION_VIEW: "all",
            Perm.STATION_ADD: "all",     # ADR-049: anyone (incl. citizens) can register a station
            Perm.STATION_CONTRIBUTE: "all",  # open crowd-sourcing: property/rating on any station
            Perm.STATION_EDIT: "own",
            Perm.STATION_DELETE: "own",
            Perm.TICKET_VIEW: "all",      # help-request board is public (ADR-027)
            Perm.TICKET_VIEW_PII: "own",  # only your own request's contact info; others masked
            Perm.TICKET_ADD: "all",
            Perm.TICKET_EDIT: "own",
            Perm.TICKET_DELETE: "own",
            Perm.TICKET_ASSIGN: "own",    # volunteer self-signup (see app/services/ticket.py)
        },
    },
    {
        # Oversight only — no edit/review/make (ADR-049 / Docs/rbac-permissions-design.md §2.4).
        # Sees all data incl. PII; reviews the audit trail (endpoint TBD, granted ahead).
        "name": "data_auditor",
        "kind": "platform",
        "permissions": {
            Perm.MAP_VIEW: "all",
            Perm.STATION_VIEW: "all",
            Perm.TICKET_VIEW: "all",
            Perm.TICKET_VIEW_PII: "all",
            Perm.USER_VIEW: "all",
            Perm.AUDIT_VIEW: "all",
        },
    },
    {
        "name": "super_admin",
        "kind": "platform",
        "permissions": dict.fromkeys(
            [
                Perm.MAP_VIEW, Perm.MAP_ADD, Perm.MAP_EDIT, Perm.MAP_DELETE,
                Perm.STATION_VIEW, Perm.STATION_ADD, Perm.STATION_CONTRIBUTE, Perm.STATION_EDIT,
                Perm.STATION_DELETE, Perm.STATION_REVIEW,
                Perm.TICKET_VIEW, Perm.TICKET_VIEW_PII, Perm.TICKET_ADD, Perm.TICKET_EDIT,
                Perm.TICKET_DELETE, Perm.TICKET_ASSIGN, Perm.TICKET_REVIEW,
                Perm.FIELD_VIEW, Perm.FIELD_ADD, Perm.FIELD_EDIT, Perm.FIELD_DELETE,
                Perm.ANN_VIEW, Perm.ANN_PUBLISH, Perm.ANN_EDIT, Perm.ANN_DELETE,
                Perm.USER_VIEW, Perm.USER_ADD, Perm.USER_EDIT, Perm.USER_DELETE,
                Perm.RBAC_VIEW, Perm.RBAC_ASSIGN, Perm.RBAC_EDIT, Perm.AUDIT_VIEW,
                Perm.TEAM_VIEW, Perm.TEAM_EDIT, Perm.TEAM_MEMBER_MANAGE,
                Perm.ZONE_VIEW, Perm.ZONE_ADD, Perm.ZONE_EDIT, Perm.ZONE_ASSIGN, Perm.ZONE_DELETE,
            ],
            "all",
        ),
    },
    # --- Team-kind functional roles (attached to a team via user_role_assign; org = the
    # team's team.type). "gov admin" = admin + gov team; "ngo admin" = admin + ngo team.
    # Operational data access is `zone` — the team edits resources geographically inside a
    # WorkZone assigned to it. Zone operations are gov-only: `_require_gov_zone_authority` in
    # app/services/work_zone.py enforces this. NGO admins hold these capabilities in the seed
    # but are rejected with 403 at the service layer. GOV_TEAM_ONLY_PERMS in
    # app/core/permissions.py mirrors this for display—keep in lockstep.
    {
        # Team coordinator: full operations within the team's zone + team-member management
        # + zone drawing/assignment.
        "name": "admin",
        "kind": "team",
        "permissions": {
            Perm.MAP_VIEW: "all",
            Perm.STATION_VIEW: "all",
            Perm.STATION_ADD: "all",
            Perm.STATION_EDIT: "zone",
            Perm.STATION_DELETE: "zone",
            Perm.STATION_REVIEW: "zone",
            Perm.TICKET_VIEW: "all",
            Perm.TICKET_VIEW_PII: "zone",
            Perm.TICKET_ADD: "all",
            Perm.TICKET_EDIT: "zone",
            Perm.TICKET_DELETE: "zone",
            Perm.TICKET_ASSIGN: "zone",
            Perm.TICKET_REVIEW: "zone",
            Perm.TEAM_VIEW: "team",
            Perm.TEAM_MEMBER_MANAGE: "team",
            Perm.ZONE_VIEW: "all",
            Perm.ZONE_ADD: "all",
            Perm.ZONE_EDIT: "all",
            Perm.ZONE_ASSIGN: "all",
            Perm.ZONE_DELETE: "all",
        },
    },
    {
        # Team field worker: works the team's zone, but no team management, no zone drawing,
        # and destructive/assign-others actions stay own-scoped.
        "name": "member",
        "kind": "team",
        "permissions": {
            Perm.MAP_VIEW: "all",
            Perm.STATION_VIEW: "all",
            Perm.STATION_ADD: "all",
            Perm.STATION_EDIT: "zone",
            Perm.STATION_DELETE: "own",
            Perm.TICKET_VIEW: "all",
            Perm.TICKET_VIEW_PII: "zone",
            Perm.TICKET_ADD: "all",
            Perm.TICKET_EDIT: "zone",
            Perm.TICKET_DELETE: "own",
            Perm.TICKET_ASSIGN: "own",
            Perm.TEAM_VIEW: "team",
        },
    },
]


async def ensure_role_grant(
    db: AsyncSession, *, role: Role, permission: Permission, scope: str
) -> bool:
    """Insert a role→permission grant only when it is missing (ADR-055 idempotent bootstrap).

    Never touches an existing grant: runtime edits made via /admin/rbac survive re-seeding.
    Returns True when a new grant was inserted, False when one already existed.
    """
    existing = (
        await db.execute(
            select(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role.uuid,
                RolePermissionAssign.permission_uuid == permission.uuid,
            )
        )
    ).scalars().first()
    if existing is not None:
        return False
    db.add(
        RolePermissionAssign(
            role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
        )
    )
    print(f"為角色 {role.name} 授予 {permission.key} ({scope})")
    return True


async def seed():
    """Create or bootstrap all RBAC v1 permissions, roles, and role-permission grants."""
    async with AsyncSessionLocal() as db:
        print("開始資料初始化 (Seeding RBAC v1)...")

        # 1. Register every capability key in the catalog (idempotent).
        perm_by_key: dict[str, Permission] = {}
        for perm in Perm:
            result = await db.execute(select(Permission).where(Permission.key == perm.value))
            permission = result.scalars().first()
            if not permission:
                permission = Permission(key=perm.value)
                db.add(permission)
                await db.flush()
                print(f"建立權限: {permission.key}")
            perm_by_key[perm.value] = permission

        # 2. Create roles and upsert their permission grants.
        for role_info in ROLES_DATA:
            result = await db.execute(select(Role).where(Role.name == role_info["name"]))
            role = result.scalars().first()
            if not role:
                role = Role(name=role_info["name"], kind=role_info["kind"])
                db.add(role)
                await db.flush()
                print(f"建立角色: {role.name} ({role.kind})")

            for perm, scope in role_info["permissions"].items():
                permission = perm_by_key[perm.value]
                await ensure_role_grant(db, role=role, permission=permission, scope=scope)

            # No sync-delete of undeclared grants (ADR-064, reverting PR #24 [7]): with runtime
            # matrix editing (ADR-055/ADR-056), the seed is a pure additive bootstrap that never
            # disturbs a grant added or narrowed via /admin/rbac — a sync-delete here would wipe
            # those on the next re-seed, exactly what ADR-055 promises it won't. Narrowing a
            # role's grant is a runtime action now (DELETE /admin/rbac/roles/{uuid}/permissions/{cap}),
            # not a re-seed. The original reviewer retracted the [7] request on this same ground.

        await db.commit()
        print("RBAC v1 資料初始化完成！")


if __name__ == "__main__":
    asyncio.run(seed())
