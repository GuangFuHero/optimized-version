"""End-to-end verification against a real database with the audit triggers installed.

The unit tests build their schema from Base.metadata, which carries no triggers, so every
audit row there is hand-written. This script is the only place the real trigger path runs:
it drives the actual service functions and then reads back what the triggers actually wrote.
"""

import asyncio
import os
import sys

DB = "postgresql+asyncpg://postgres:postgres@localhost:5433/hist016"
os.environ["SQLALCHEMY_DATABASE_URL"] = DB
os.environ["ENV"] = "development"

# ruff: noqa: E402 — the imports below must follow the env setup above, since app.core.config
# reads SQLALCHEMY_DATABASE_URL at import time.
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.context import request_user_uuid
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.services import history  # noqa: E402
from app.services import ticket as ticket_service

engine = create_async_engine(DB, echo=False)
PASS, FAIL = [], []


def check(label, condition, detail=""):
    """Record and print one assertion."""
    (PASS if condition else FAIL).append(label)
    print(f"  {'✓' if condition else '✗'} {label}" + (f"  — {detail}" if detail else ""))


async def _grant(db, user, keys, scope="all"):
    """Give `user` each capability key at `scope`, creating the role and permission rows."""
    for key in keys:
        permission = (
            await db.execute(select(Permission).where(Permission.key == key))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=key)
            db.add(permission)
            await db.flush()
        role = Role(name=f"r-{user.name}-{key}", kind="platform")
        db.add(role)
        await db.flush()
        db.add(RolePermissionAssign(
            role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()


async def main():
    """Drive the real services, then read the timeline back and assert what it says."""
    async with AsyncSession(engine) as db:
        await db.execute(text("SELECT set_config('app.current_user_id', NULL, false)"))

        actor = User(name="驗證員")
        db.add(actor)
        await db.flush()
        # Captured before the commit: expire_on_commit is True in production, so reading
        # .uuid afterwards would try to lazily reload the row and raise MissingGreenlet.
        actor_uuid = str(actor.uuid)
        await db.commit()
        actor = (await db.execute(select(User).where(User.uuid == actor_uuid))).scalar_one()
        await _grant(db, actor, [
            "ticket.view_history", "station.view_history", "ticket.add", "ticket.edit",
            "ticket.delete", "ticket.assign", "ticket.view_pii", "audit.view",
        ])

    # Everything below runs as this user, exactly as an HTTP request would — which is what
    # makes the triggers record an actor at all (ADR-136).
    request_user_uuid.set(actor_uuid)

    # One session per operation, deliberately. Production gives every HTTP request its own
    # session, and a service commits inside it — so reusing one session across six calls
    # would expire the actor and blow up in require_scope with MissingGreenlet. That is a
    # property of this script's shape, not of the product, and papering over it with
    # stable_actor would also hand later reads a stale in-memory ticket.
    async def op(fn):
        async with AsyncSession(engine) as db:
            actor = (
                await db.execute(select(User).where(User.uuid == actor_uuid))
            ).scalar_one()
            return await fn(db, actor)

    print("\n--- 走真實 service，讓 trigger 自己寫 audit ---")

    ticket = await op(lambda db, actor: ticket_service.create_ticket(
        db, actor=actor,
        geometry={"type": "Point", "coordinates": [121.5, 25.0]},
        title="需要飲用水", description="三樓住戶行動不便",
        contact_name="王小姐", contact_email=None, contact_phone="0912345678",
        priority="high", task_type=None, visibility="public", disaster_type=None,
    ))
    ticket_uuid = str(ticket.uuid)
    print(f"  建立求助單 {ticket_uuid}")

    await op(lambda db, actor: ticket_service.update_ticket(
        db, actor=actor, uuid=ticket_uuid, status="in_progress", changes={}))
    print("  更新狀態 pending → in_progress")

    task = await op(lambda db, actor: ticket_service.create_ticket_task(
        db, actor=actor, ticket_uuid=ticket_uuid, task_type="cleanup",
        task_name="清淤", task_description=None, quantity=5,
        source="user", visibility="public", route_uuid=None))
    task_uuid = str(task.uuid)
    print(f"  新增任務 {task_uuid}")

    assignment = await op(lambda db, actor: ticket_service.assign_task_actor(
        db, actor=actor, task_uuid=task_uuid, actor_uuid=None, role="volunteer"))
    assignment_uuid = str(assignment.uuid)
    print(f"  指派任務 {assignment_uuid}")

    await op(lambda db, actor: ticket_service.unassign_task_actor(
        db, actor=actor, uuid=assignment_uuid))
    print("  取消指派（硬刪）")

    await op(lambda db, actor: ticket_service.delete_ticket(
        db, actor=actor, uuid=ticket_uuid))
    print("  軟刪除求助單")

    async with AsyncSession(engine) as db:
        actor = (await db.execute(select(User).where(User.uuid == actor_uuid))).scalar_one()

        print("\n--- 讀回時間軸 ---")
        timeline = await history.load_timeline(
            db, actor=actor, entity=history.TICKET, uuid=ticket_uuid, limit=50, offset=0)
        for event in timeline.events:
            fields = ", ".join(c["field"] for c in event["changes"]) or "(無)"
            print(f"  {event['at']:%m-%d %H:%M:%S}  {event['event_type']:<11} "
                  f"{event['actor']['name'] or event['actor']['kind']:<8} [{fields}]")

        types = [e["event_type"] for e in timeline.events]
        print("\n--- 驗收 ---")
        # Two CREATED events is correct: one for the ticket, one for the task under it.
        # What ADR-134 promises is that the ticket's own creation — which the trigger wrote
        # as two rows across base_geometries and tickets — arrives as a single event. So the
        # check is that one event carries fields from both tables, not that CREATED is rare.
        creations = [e for e in timeline.events if e["event_type"] == "CREATED"]
        merged = [
            e for e in creations
            if {"geometry", "title"} <= {c["field"] for c in e["changes"]}
        ]
        check("建立求助單合併成單一事件，含 base_geometries 與 tickets 兩表欄位（ADR-134）",
              len(merged) == 1,
              f"creations={[sorted(c['field'] for c in e['changes']) for e in creations]}")
        check("任務的建立是獨立事件（不同 row_id，不該被併入）",
              any("task_name" in {c["field"] for c in e["changes"]} for e in creations))
        check("軟刪除讀成 DELETED 而非 UPDATED（ADR-135）", "DELETED" in types)
        check("看得到 ASSIGNED", "ASSIGNED" in types)
        check("看得到 UNASSIGNED（該列已硬刪，只有 JSONB 反查撈得到，ADR-132）",
              "UNASSIGNED" in types)

        gone = await db.execute(text(
            "SELECT count(*) FROM task_assignments WHERE uuid = :u"), {"u": assignment_uuid})
        check("task_assignments 現況表確實已無該列", gone.scalar() == 0)

        check("操作者有解析出姓名（ADR-136）",
              all(e["actor"]["name"] == "驗證員" for e in timeline.events),
              str({e["actor"]["name"] for e in timeline.events}))

        check("持有 audit.view 時附上 RAW（ADR-130）",
              all("raw" in e for e in timeline.events))
        check("RAW 不含 password_hash（trigger 已剝除）",
              not any("password_hash" in str(e.get("raw")) for e in timeline.events))

        phones = [c for e in timeline.events for c in e["changes"] if c["field"] == "contact_phone"]
        check("持有 view_pii 時電話是明碼",
              all(c["after"] != "09*****678" for c in phones) if phones else True)

        excluded = {c["field"] for e in timeline.events for c in e["changes"]}
        check("uuid / created_at / delete_at 都不出現在欄位變更裡（ADR-143/135）",
              not (excluded & {"uuid", "created_at", "updated_at", "delete_at"}),
              str(sorted(excluded)))

    print("\n--- 同一條時間軸，換一個只有 view_history 的人來看 ---")
    async with AsyncSession(engine) as db:
        plain = User(name="一般工作人員")
        db.add(plain)
        await db.flush()
        plain_uuid = str(plain.uuid)
        await db.commit()
        plain = (await db.execute(select(User).where(User.uuid == plain_uuid))).scalar_one()
        await _grant(db, plain, ["ticket.view_history"])

    async with AsyncSession(engine) as db:
        plain = (await db.execute(select(User).where(User.uuid == plain_uuid))).scalar_one()
        limited = await history.load_timeline(
            db, actor=plain, entity=history.TICKET, uuid=ticket_uuid, limit=50, offset=0)

        changes = [c for e in limited.events for c in e["changes"]]
        phone = next((c for c in changes if c["field"] == "contact_phone"), None)
        print(f"  contact_phone -> {phone['after'] if phone else '(不存在)'}")

        check("無 view_pii 時電話被遮罩（ADR-130）",
              phone is not None and phone["after"] == "09*****678", str(phone))
        check("無 view_pii 時 geometry 變更完全不出現（ticket 的座標即住址，ADR-141）",
              not any(c["field"] == "geometry" for c in changes))
        check("無 audit.view 時沒有 RAW（ADR-130）",
              all(e.get("raw") is None for e in limited.events))
        check("無 audit.view 時看不到 moderation_status（稽核層，ADR-130）",
              not any(c["field"] == "moderation_status" for c in changes))
        check("事件數與稽核員看到的一樣多（過濾的是欄位，不是事件）",
              len(limited.events) == len(timeline.events),
              f"{len(limited.events)} vs {len(timeline.events)}")

    print("\n--- EXPLAIN：兩條查詢是否走索引 ---")
    async with AsyncSession(engine) as db:
        # A planner will rightly seq-scan a 20-row table, so the question is meaningless
        # without volume. Pad the ledger to a size where the choice actually says something.
        await db.execute(text("""
            INSERT INTO audit_logs (uuid, table_name, action, row_id, new_values, created_at)
            SELECT gen_random_uuid(), 'users', 'UPDATE', gen_random_uuid(),
                   jsonb_build_object('name', 'noise'), now()
            FROM generate_series(1, 60000)
        """))
        await db.commit()
        await db.execute(text("ANALYZE audit_logs"))
        rows = (await db.execute(text("SELECT count(*) FROM audit_logs"))).scalar()
        print(f"  （先灌到 {rows} 列，否則 planner 本來就該選 Seq Scan）")

        ids = await history.resolve_scope_ids(db, entity=history.TICKET, uuid=ticket_uuid)
        row_list = ",".join(f"'{u}'::uuid" for u in ids.row_ids)
        task_list = ",".join(f"'{u}'" for u in ids.task_uuids)

        plan_a = "\n".join(r[0] for r in (await db.execute(text(
            f"EXPLAIN SELECT * FROM audit_logs WHERE row_id IN ({row_list}) "
            f"ORDER BY created_at DESC LIMIT 2001"))).all())
        plan_b = "\n".join(r[0] for r in (await db.execute(text(
            "EXPLAIN SELECT * FROM audit_logs WHERE table_name = 'task_assignments' "
            "AND COALESCE(new_values->>'task_uuid', old_values->>'task_uuid') "
            f"IN ({task_list}) ORDER BY created_at DESC LIMIT 2001"))).all())

        check("聚合查詢走 ix_audit_logs_row_id_created_at",
              "ix_audit_logs_row_id_created_at" in plan_a,
              plan_a.splitlines()[0] if "Seq Scan" in plan_a else "")
        check("JSONB 反查走 ix_audit_logs_assign_task",
              "ix_audit_logs_assign_task" in plan_b,
              plan_b.splitlines()[0] if "Seq Scan" in plan_b else "")

    await engine.dispose()
    print(f"\n通過 {len(PASS)} 項，失敗 {len(FAIL)} 項")
    if FAIL:
        print("失敗：" + "; ".join(FAIL))
    sys.exit(1 if FAIL else 0)


asyncio.run(main())
