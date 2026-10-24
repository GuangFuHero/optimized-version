"""Tests for BriefingTemplateRepository and BriefingRepository.

Uses the function-scoped `db` fixture (tests/conftest.py), which drops/creates a fresh
schema per test against the dedicated PostgreSQL test DB. The session uses
expire_on_commit=True, so UUIDs are captured eagerly and state is re-read via list/get
immediately before asserting.
"""

import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.repositories.briefings_repository import (
    briefing_repository as briefings,
)
from app.repositories.briefings_repository import (
    briefing_template_repository as templates,
)


async def _user(db) -> str:
    """Create a user (for the created_by FK) and return its UUID string."""
    u = User(name="admin")
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return str(u.uuid)


@pytest.mark.asyncio
async def test_create_template_defaults(db):
    """A template created without tags/state gets an empty tag list and 'briefing' state."""
    uid = await _user(db)
    t = await templates.create(db, obj_in={"content": "pre-trip checklist", "created_by": uid})
    items = await templates.list_templates(db)
    assert len(items) == 1
    assert items[0].content == "pre-trip checklist"
    assert items[0].tags == []
    assert items[0].state == "briefing"
    assert str(items[0].uuid) == str(t.uuid)


@pytest.mark.asyncio
async def test_generate_briefing_copies_template(db):
    """generate_briefing copies content/tags/state from the template and stamps template_uuid."""
    uid = await _user(db)
    t = await templates.create(
        db,
        obj_in={
            "content": "supply list",
            "tags": ["supply"],
            "state": "in_field",
            "created_by": uid,
        },
    )
    tpl_uuid = str(t.uuid)
    b = await briefings.generate_briefing(db, created_by=uid, template_uuid=tpl_uuid)
    items = await briefings.list_briefings(db, status="all")
    assert len(items) == 1
    got = items[0]
    assert got.content == "supply list"
    assert got.tags == ["supply"]
    assert got.state == "in_field"
    assert str(got.template_uuid) == tpl_uuid
    assert str(got.uuid) == str(b.uuid)


@pytest.mark.asyncio
async def test_generate_briefing_ad_hoc(db):
    """generate_briefing with no template produces a standalone briefing (template_uuid NULL)."""
    uid = await _user(db)
    await briefings.generate_briefing(
        db, created_by=uid, content="ad-hoc note", tags=["misc"], state="debrief"
    )
    items = await briefings.list_briefings(db, status="all")
    assert len(items) == 1
    assert items[0].template_uuid is None
    assert items[0].content == "ad-hoc note"
    assert items[0].state == "debrief"


@pytest.mark.asyncio
async def test_list_filters_by_state_and_tag(db):
    """list_* filters by state equality and by JSONB tag containment."""
    uid = await _user(db)
    await templates.create(
        db, obj_in={"content": "a", "tags": ["medical"], "state": "briefing", "created_by": uid}
    )
    await templates.create(
        db, obj_in={"content": "b", "tags": ["supply"], "state": "in_field", "created_by": uid}
    )
    by_state = await templates.list_templates(db, state="in_field")
    assert [t.content for t in by_state] == ["b"]
    by_tag = await templates.list_templates(db, tag="medical")
    assert [t.content for t in by_tag] == ["a"]


@pytest.mark.asyncio
async def test_soft_delete_hides_row(db):
    """soft_delete sets delete_at and removes the row from list results."""
    uid = await _user(db)
    created = await templates.create(db, obj_in={"content": "doomed", "created_by": uid})
    tpl_uuid = str(created.uuid)
    # Re-fetch fresh before deleting, mirroring how a resolver operates.
    t = await templates.get_by_uuid_active(db, tpl_uuid)
    await templates.soft_delete(db, db_obj=t)
    assert await templates.list_templates(db) == []
    assert await templates.get_by_uuid_active(db, tpl_uuid) is None


@pytest.mark.asyncio
async def test_generated_briefing_is_a_draft(db):
    """A generated briefing is a draft its creator last edited, so only the draft list has it."""
    uid = await _user(db)
    b = await briefings.generate_briefing(db, created_by=uid, content="draft")
    b_uuid = str(b.uuid)
    assert await briefings.list_briefings(db, status="published") == []
    drafts = await briefings.list_briefings(db, status="draft")
    assert [str(d.uuid) for d in drafts] == [b_uuid]
    assert drafts[0].published_at is None and str(drafts[0].updated_by) == uid


@pytest.mark.asyncio
async def test_list_puts_drafts_first_then_newest_published(db):
    """Drafts lead, then the rest by publish time, whatever order they were created in."""
    uid = await _user(db)
    contents = ["published last", "published first", "draft"]
    uuids = {
        c: str((await briefings.generate_briefing(db, created_by=uid, content=c)).uuid) for c in contents
    }
    for content in ("published first", "published last"):
        await briefings.publish(db, uuid=uuids[content], actor_uuid=uid)

    listed = await briefings.list_briefings(db, status="all")
    assert [(b.content, b.status) for b in listed] == [
        ("draft", "draft"),
        ("published last", "published"),
        ("published first", "inactive"),
    ]
    published = await briefings.list_briefings(db, status="published")
    assert [b.content for b in published] == ["published last"]


@pytest.mark.asyncio
async def test_publish_replaces_only_the_live_version_of_its_state(db):
    """Publishing takes down the version live in the same state and leaves other states alone."""
    uid = await _user(db)
    uuids = {}
    for content, state in (("old", "briefing"), ("field", "in_field"), ("new", "briefing")):
        b = await briefings.generate_briefing(db, created_by=uid, content=content, state=state)
        uuids[content] = str(b.uuid)
        await briefings.publish(db, uuid=uuids[content], actor_uuid=uid)

    statuses = {b.content: b.status for b in await briefings.list_briefings(db, status="all")}
    assert statuses == {"old": "inactive", "field": "published", "new": "published"}
    with pytest.raises(ValueError, match="Only a draft can be published"):
        await briefings.publish(db, uuid=uuids["old"], actor_uuid=uid)

    # Deleting the live version empties its state rather than bringing the replaced one back.
    await briefings.soft_delete(db, db_obj=await briefings.get_by_uuid_active(db, uuids["new"]))
    assert await briefings.list_briefings(db, status="published", state="briefing") == []


@pytest.mark.asyncio
async def test_concurrent_publishes_in_one_state_leave_the_later_one_live(db):
    """Two sessions publishing into one state at once both succeed, and exactly one row stays live."""
    uid = await _user(db)
    a, b = [str((await briefings.generate_briefing(db, created_by=uid, content=c)).uuid) for c in "ab"]
    async with AsyncSession(db.bind) as one, AsyncSession(db.bind) as two:
        await asyncio.gather(
            briefings.publish(one, uuid=a, actor_uuid=uid), briefings.publish(two, uuid=b, actor_uuid=uid)
        )

    assert sorted(x.status for x in await briefings.list_briefings(db, status="all")) == [
        "inactive",
        "published",
    ]


@pytest.mark.asyncio
async def test_schema_refuses_a_second_live_version_or_a_status_at_odds_with_published_at(db):
    """The unique index and checks hold even for writes that skip publish."""
    uid = await _user(db)
    now = datetime.now(UTC)
    live = await briefings.generate_briefing(db, created_by=uid, content="live")
    await briefings.publish(db, uuid=str(live.uuid), actor_uuid=uid)
    for obj_in in (
        {"status": "published", "published_at": now},
        {"status": "inactive"},
        {"status": "draft", "published_at": now},
    ):
        b = await briefings.generate_briefing(db, created_by=uid, content="x")
        with pytest.raises(IntegrityError):
            await briefings.update(db, db_obj=b, obj_in=obj_in)
        await db.rollback()


@pytest.mark.asyncio
async def test_generate_from_a_source_briefing_copies_it_and_leaves_it_alone(db):
    """A copy carries the source's content, tags, state and template link into a new draft."""
    uid = await _user(db)
    t = await templates.create(db, obj_in={"content": "tpl", "created_by": uid})
    tpl_uuid = str(t.uuid)
    src = await briefings.generate_briefing(
        db, created_by=uid, template_uuid=tpl_uuid, content="meet at the station", tags=["x"], state="debrief"
    )
    src_uuid = str(src.uuid)
    await briefings.publish(db, uuid=src_uuid, actor_uuid=uid)

    copy = await briefings.generate_briefing(db, created_by=uid, source_uuid=src_uuid)
    copy_uuid = str(copy.uuid)
    got = {str(b.uuid): b for b in await briefings.list_briefings(db, status="all")}
    assert copy_uuid != src_uuid and got[copy_uuid].status == "draft"
    assert (got[copy_uuid].content, got[copy_uuid].tags, got[copy_uuid].state) == (
        "meet at the station",
        ["x"],
        "debrief",
    )
    assert str(got[copy_uuid].template_uuid) == tpl_uuid
    assert got[src_uuid].status == "published"

    with pytest.raises(ValueError, match="not both"):
        await briefings.generate_briefing(db, created_by=uid, template_uuid=tpl_uuid, source_uuid=src_uuid)
    await briefings.soft_delete(db, db_obj=await briefings.get_by_uuid_active(db, src_uuid))
    with pytest.raises(ValueError, match="Briefing not found"):
        await briefings.generate_briefing(db, created_by=uid, source_uuid=src_uuid)


@pytest.mark.asyncio
async def test_locked_fetch_sees_a_publish_committed_elsewhere(db):
    """The locked read the draft-only writes check against reflects a concurrent publish."""
    uid = await _user(db)
    b_uuid = str((await briefings.generate_briefing(db, created_by=uid, content="x")).uuid)
    stale = await briefings.get_by_uuid_active(db, b_uuid)
    assert stale.status == "draft"
    async with AsyncSession(db.bind) as other:
        await briefings.publish(other, uuid=b_uuid, actor_uuid=uid)

    locked = await briefings.get_by_uuid_active(db, b_uuid, for_update=True)
    assert locked.status == "published"
