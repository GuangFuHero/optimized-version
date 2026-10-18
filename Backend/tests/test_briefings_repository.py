"""Tests for BriefingTemplateRepository and BriefingRepository.

Uses the function-scoped `db` fixture (tests/conftest.py), which drops/creates a fresh
schema per test against the dedicated PostgreSQL test DB. The session uses
expire_on_commit=True, so UUIDs are captured eagerly and state is re-read via list/get
immediately before asserting.
"""

from datetime import UTC, datetime, timedelta

import pytest
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
    """Drafts lead, then published rows by publish time, whatever order they were created in."""
    uid = await _user(db)
    now = datetime.now(UTC)
    contents = ["published first", "published last", "draft"]
    uuids = {
        c: str((await briefings.generate_briefing(db, created_by=uid, content=c)).uuid) for c in contents
    }
    for content, published_at in (("published last", now), ("published first", now - timedelta(hours=1))):
        row = await briefings.get_by_uuid_active(db, uuids[content])
        await briefings.update(db, db_obj=row, obj_in={"published_at": published_at, "published_by": uid})

    listed = await briefings.list_briefings(db, status="all")
    assert [b.content for b in listed] == ["draft", "published last", "published first"]
    published = await briefings.list_briefings(db, status="published")
    assert [b.content for b in published] == ["published last", "published first"]


@pytest.mark.asyncio
async def test_locked_fetch_sees_a_publish_committed_elsewhere(db):
    """The locked read the draft-only writes check against reflects a concurrent publish."""
    uid = await _user(db)
    b_uuid = str((await briefings.generate_briefing(db, created_by=uid, content="x")).uuid)
    stale = await briefings.get_by_uuid_active(db, b_uuid)
    assert stale.published_at is None
    async with AsyncSession(db.bind) as other:
        row = await briefings.get_by_uuid_active(other, b_uuid)
        await briefings.update(
            other, db_obj=row, obj_in={"published_at": datetime.now(UTC), "published_by": uid}
        )

    locked = await briefings.get_by_uuid_active(db, b_uuid, for_update=True)
    assert locked.published_at is not None
