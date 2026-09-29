"""The ADR-304 contract: the backend sends drafts, the engine returns suspects (Spec 020 §2~§4)."""

import dataclasses
import inspect

import pytest

from app.dedup_engine import contract
from app.dedup_engine.contract import (
    CONTRACT_VERSION,
    DedupEngine,
    GeoPoint,
    NewStation,
    NewTask,
    NewTicket,
    StationDraft,
    Suspect,
    TaskDraft,
    TicketDraft,
    kind_of_ref,
    task_ref,
)

HERE = GeoPoint(121.5601, 23.6701)
TICKET = TicketDraft(location=HERE, title="淹水")
TASK = TaskDraft(task_type="rescue", task_name="抽水")
STATION = StationDraft(location=HERE)

REQUIRED = {
    TicketDraft: {"location", "title"},
    TaskDraft: {"task_type", "task_name"},
    StationDraft: {"location"},
    NewTicket: {"ticket"},
    NewTask: {"ticket_uuid", "task"},
    NewStation: {"station"},
    Suspect: {"draft_ref", "related_kind", "related_uuid", "similarity", "evidence"},
}
# Never handed to the engine (ADR-304 keeps ADR-289's whitelist for drafts).
EXCLUDED = {"contact_name", "contact_email", "review_note", "visibility", "team_uuid", "created_by"}


def test_contract_version():
    """Snapshots were version 1; drafts replace them (ADR-304)."""
    assert CONTRACT_VERSION == 2


@pytest.mark.parametrize("cls", list(REQUIRED), ids=lambda c: c.__name__)
def test_only_the_core_fields_are_required(cls):
    """Everything else has a default, so fields are added without breaking callers."""
    required = {
        f.name
        for f in dataclasses.fields(cls)
        if f.default is dataclasses.MISSING and f.default_factory is dataclasses.MISSING
    }
    assert required == REQUIRED[cls]


@pytest.mark.parametrize(
    "instance",
    [
        TICKET,
        TASK,
        STATION,
        NewTicket(ticket=TICKET, tasks=(TASK,)),
        NewTask(ticket_uuid="t1", task=TASK),
        NewStation(station=STATION),
        Suspect("task:0", "ticket_task", "u1", 0.9, {}),
    ],
    ids=lambda i: type(i).__name__,
)
def test_contract_types_are_immutable(instance):
    """Neither side can mutate what the other handed over."""
    with pytest.raises(dataclasses.FrozenInstanceError):
        setattr(instance, dataclasses.fields(instance)[0].name, None)


@pytest.mark.parametrize("cls", [TicketDraft, TaskDraft, StationDraft], ids=lambda c: c.__name__)
def test_drafts_carry_no_personal_or_internal_fields(cls):
    """Names, emails and internal bookkeeping stay on the backend side."""
    assert not {f.name for f in dataclasses.fields(cls)} & EXCLUDED


def test_draft_refs_name_the_part_and_its_kind():
    """`draft_ref` is how a suspect points back at what was submitted."""
    assert task_ref(2) == "task:2"
    assert kind_of_ref("ticket") == "ticket"
    assert kind_of_ref("task:2") == "ticket_task"
    assert kind_of_ref("station") == "station"
    with pytest.raises(ValueError):
        kind_of_ref("photo:1")


@pytest.mark.parametrize("name", ["check", "score"])
def test_engine_methods_are_async_and_take_the_session(name):
    """The engine queries the database itself (ADR-304), so both calls are coroutines taking `db`."""
    method = getattr(DedupEngine, name)
    assert inspect.iscoroutinefunction(method)
    assert list(inspect.signature(method).parameters)[1] == "db"


def test_suspect_names_the_ticket_of_a_matched_task():
    """A matched task carries its ticket, for display; other kinds leave it empty."""
    assert Suspect("ticket", "ticket", "t1", 0.9, {}).related_ticket_uuid is None
    assert (
        Suspect("task:0", "ticket_task", "k1", 0.9, {}, related_ticket_uuid="t1").related_ticket_uuid == "t1"
    )


def test_the_contract_module_exports_what_the_spec_lists():
    """A typo in a name here would only surface in whichever file imports it first."""
    for name in ("Submission", "NewTicket", "NewTask", "NewStation", "Suspect", "DedupEngine"):
        assert hasattr(contract, name)
