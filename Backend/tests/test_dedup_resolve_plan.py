"""The resolve plan (Spec 028 §3.3–3.4): what a request means, or why it is refused. No database."""

from dataclasses import replace

import pytest

from app.schemas.duplicate_pair import ResolveRequest
from app.services.dedup_resolve_plan import ResolveRefused, build_plan
from app.services.dedup_review_tickets import (
    PhotoForReview,
    PropertyForReview,
    TaskForReview,
    TicketForReview,
)


def _task(uuid, task_type="hr", quantity=2, properties=(), name="清淤") -> TaskForReview:
    return TaskForReview(
        uuid=uuid,
        task_type=task_type,
        task_name=name,
        task_description=None,
        quantity=quantity,
        status="pending",
        claim_count=0,
        recruiting_stopped=False,
        properties=tuple(properties),
    )


def _prop(uuid, name="鏟子") -> PropertyForReview:
    return PropertyForReview(
        uuid=uuid, property_name=name, property_value="5", quantity=5, status=None, comment=None
    )


def _ticket(uuid, *tasks) -> TicketForReview:
    return TicketForReview(
        uuid=uuid,
        version=f"v-{uuid}",
        title=f"求助 {uuid}",
        description=None,
        priority="high",
        task_type=None,
        disaster_types=("flood",),
        person_trapped_reported=None,
        immediate_danger_reported=None,
        contact_name="李",
        contact_phone=None,
        contact_email=None,
        longitude=121.4,
        latitude=23.6,
        status="pending",
        audit_status="no_audit",
        created_by="owner",
        created_at=None,
        tasks=tuple(tasks),
        photos=(),
        disaster_details={},
    )


# A: human 2 (with an item), water 1. B: human 5 (with an item), water 5, food 3.
A = _ticket(
    "A",
    _task("a1", "hr", 2, [_prop("pa1", "手套")]),
    _task("a2", "supply", 1, name="飲用水"),
)
B = _ticket(
    "B",
    _task("b1", "hr", 5, [_prop("pb1", "鏟子")]),
    _task("b2", "supply", 5, name="飲用水"),
    _task("b3", "supply", 3, name="便當"),
)
NOBODY: dict[str, set[str]] = {}
UUIDS = {
    key: f"00000000-0000-0000-0000-{n:012d}"
    for n, key in enumerate(["A", "B", "a1", "a2", "b1", "b2", "b3", "pa1", "pb1"], start=1)
}


def _u(key: str) -> str:
    return UUIDS[key]


def _with_uuids(ticket: TicketForReview) -> TicketForReview:
    """The same ticket with real uuid strings, since the request parses them as UUIDs."""
    return replace(
        ticket,
        uuid=_u(ticket.uuid),
        tasks=tuple(
            replace(t, uuid=_u(t.uuid), properties=tuple(replace(p, uuid=_u(p.uuid)) for p in t.properties))
            for t in ticket.tasks
        ),
    )


LOW, HIGH = _with_uuids(A), _with_uuids(B)


def _request(**overrides) -> ResolveRequest:
    """Example 1: B folds into A whole — human 2+5 → 7, water 1+5 → 6, food moves over."""
    body = {
        "primary": "low",
        "expected_versions": {"low": "v-A", "high": "v-B"},
        "primary_tasks": [
            {
                "task": _u("a1"),
                "action": "keep",
                "absorb": [_u("b1")],
                "values": {"quantity": 7},
                "properties": [
                    {"property": _u("pa1"), "action": "keep"},
                    {"property": _u("pb1"), "action": "keep", "values": {"quantity": 3}},
                ],
            },
            {
                "task": _u("a2"),
                "action": "keep",
                "absorb": [_u("b2")],
                "values": {"quantity": 6},
                "properties": [],
            },
        ],
        "secondary_tasks": [{"task": _u("b3"), "action": "move", "properties": []}],
    }
    body.update(overrides)
    return ResolveRequest.model_validate(body)


def _plan(request=None, *, claimants=NOBODY, kind="ticket_task", low=LOW, high=HIGH):
    return build_plan(request or _request(), pair_kind=kind, low=low, high=high, claimants=claimants)


# --- what a request means -----------------------------------------------------------------


def test_example_one_folds_b_into_a():
    """The two needs absorb B's, the food moves over, nothing is cancelled but B itself."""
    plan = _plan()

    assert (plan.primary_uuid, plan.secondary_uuid) == (_u("A"), _u("B"))
    assert plan.absorbed == {_u("b1"): _u("a1"), _u("b2"): _u("a2")}
    kept = {k.uuid: k for k in plan.kept_tasks}
    assert kept[_u("a1")].changes == {"quantity": 7}
    assert kept[_u("a2")].changes == {"quantity": 6}
    assert kept[_u("b3")].moved
    assert plan.canceled_tasks == ()


def test_items_of_an_absorbed_need_move_to_the_need_that_absorbs_it():
    """B's item under b1 hangs under a1 afterwards, with its new quantity."""
    plan = _plan()

    assert plan.property_moves == {_u("pb1"): _u("a1")}
    assert plan.property_changes == {_u("pb1"): {"quantity": 3}}
    assert plan.canceled_properties == ()


def test_example_two_keeps_part_of_b():
    """Only b1 folds in; b2 is cancelled, b3 moves; a2 is cancelled too."""
    request = _request(
        primary_tasks=[
            {
                "task": _u("a1"),
                "action": "keep",
                "absorb": [_u("b1")],
                "values": {"quantity": 7},
                "properties": [
                    {"property": _u("pa1"), "action": "keep"},
                    {"property": _u("pb1"), "action": "cancel"},
                ],
            },
            {"task": _u("a2"), "action": "cancel"},
        ],
        secondary_tasks=[
            {"task": _u("b2"), "action": "cancel"},
            {"task": _u("b3"), "action": "move", "properties": [], "values": {"quantity": 4}},
        ],
    )

    plan = _plan(request)

    assert plan.absorbed == {_u("b1"): _u("a1")}
    assert set(plan.canceled_tasks) == {_u("a2"), _u("b2")}
    assert {k.uuid: k.changes for k in plan.kept_tasks} == {
        _u("a1"): {"quantity": 7},
        _u("b3"): {"quantity": 4},
    }
    assert plan.canceled_properties == (_u("pb1"),)


def test_primary_high_keeps_the_high_side():
    """`primary: high` keeps B and cancels A."""
    request = _request(
        primary="high",
        primary_tasks=[
            {
                "task": _u("b1"),
                "action": "keep",
                "absorb": [_u("a1")],
                "properties": [
                    {"property": _u("pb1"), "action": "keep"},
                    {"property": _u("pa1"), "action": "keep"},
                ],
            },
            {"task": _u("b2"), "action": "keep", "absorb": [_u("a2")], "properties": []},
            {"task": _u("b3"), "action": "keep", "properties": []},
        ],
        secondary_tasks=[],
    )

    plan = _plan(request)

    assert (plan.primary_uuid, plan.secondary_uuid) == (_u("B"), _u("A"))


def test_only_the_ticket_fields_sent_are_changes():
    """A field left out stays; one sent as null clears."""
    plan = _plan(_request(ticket={"title": "A＋B 一樓淹水", "contact_phone": None}))

    assert plan.ticket_changes == {"title": "A＋B 一樓淹水", "contact_phone": None}


def test_a_person_on_both_merged_needs_counts_once():
    """Someone on a1 and b1 is one of the 7, and their b1 assignment is dropped (ADR-369)."""
    claimants = {_u("a1"): {"p1", "p2"}, _u("b1"): {"p2", "p3", "p4", "p5", "p6", "p7"}}

    plan = _plan(claimants=claimants)

    kept = {k.uuid: k for k in plan.kept_tasks}
    assert kept[_u("a1")].headcount == 7
    assert plan.dropped_assignments == ((_u("b1"), "p2"),)


def test_a_quantity_equal_to_the_headcount_passes():
    """Exactly as many people as asked for is full, not over."""
    claimants = {_u("a1"): {"p1", "p2"}, _u("b1"): {"p3", "p4", "p5", "p6", "p7"}}

    assert _plan(claimants=claimants)


def test_a_rescue_need_may_go_without_a_quantity():
    """Rescue alone may have no quantity, and then has no cap."""
    low = replace(LOW, tasks=(replace(LOW.tasks[0], task_type="rescue", quantity=None), LOW.tasks[1]))
    high = replace(HIGH, tasks=(replace(HIGH.tasks[0], task_type="rescue", quantity=None), *HIGH.tasks[1:]))
    request = _request()
    request.primary_tasks[0].values = None

    assert _plan(request, low=low, high=high, claimants={_u("a1"): {f"p{n}" for n in range(9)}})


# --- refusals (Spec 028 §3.4) -------------------------------------------------------------


def _refused(request=None, **kwargs) -> str:
    with pytest.raises(ResolveRefused) as caught:
        _plan(request, **kwargs)
    return str(caught.value)


def test_a_station_card_is_refused():
    """Stations are not resolved (ADR-377)."""
    assert "ticket and need cards" in _refused(kind="station")


def test_two_needs_of_one_ticket_are_refused():
    """Two needs of one ticket leave no second ticket to merge (ADR-377)."""
    assert "same ticket" in _refused(high=LOW)


def test_a_need_left_out_is_refused():
    """ADR-368: every need of both tickets is named."""
    request = _request(secondary_tasks=[])
    assert _u("b3") in _refused(request)


def test_a_need_named_twice_is_refused():
    """A need is handled one way only."""
    request = _request(
        secondary_tasks=[
            {"task": _u("b1"), "action": "cancel"},
            {"task": _u("b3"), "action": "move", "properties": []},
        ]
    )
    assert "more than once" in _refused(request)


def test_a_need_of_the_wrong_ticket_is_refused():
    """A primary need sent as the other ticket's is refused."""
    request = _request()
    request.secondary_tasks[0].task = request.primary_tasks[1].task
    assert "not on the other ticket" in _refused(request)


def test_absorbing_a_need_of_the_primary_ticket_is_refused():
    """Only the other ticket's needs can be absorbed."""
    request = _request()
    request.primary_tasks[0].absorb = [request.primary_tasks[1].task]
    assert "not on the other ticket" in _refused(request)


def test_absorbing_another_kind_of_need_is_refused():
    """ADR-370: water cannot fold into people."""
    request = _request()
    request.primary_tasks[0].absorb.append(request.secondary_tasks[0].task)
    request.secondary_tasks = []
    assert "cannot merge into" in _refused(request)


def test_a_cancelled_need_cannot_absorb():
    """A cancelled need cannot take other needs in."""
    request = _request()
    request.primary_tasks[0].action = "cancel"
    request.primary_tasks[0].values = None
    request.primary_tasks[0].properties = None
    assert "cannot absorb" in _refused(request)


def test_a_cancelled_need_takes_no_values():
    """Values sent with a cancelled need would be silently lost."""
    request = _request()
    request.primary_tasks[1].action = "cancel"
    request.primary_tasks[1].absorb = []
    assert "takes no values" in _refused(request)


def test_more_people_than_the_quantity_is_refused():
    """ADR-370: 8 people on a need of 7."""
    claimants = {_u("a1"): {"p1", "p2", "p3"}, _u("b1"): {"p4", "p5", "p6", "p7", "p8"}}
    assert "more than the quantity" in _refused(claimants=claimants)


def test_a_moved_need_is_held_to_its_own_headcount():
    """A moved need keeps its people: 4 on a need of 3 is refused."""
    request = _request()
    claimants = {_u("b3"): {"p1", "p2", "p3", "p4"}}
    assert "more than the quantity 3" in _refused(request, claimants=claimants)


@pytest.mark.parametrize("quantity", [None, 0])
def test_a_quantity_a_non_rescue_need_cannot_have_is_refused(quantity):
    """Only rescue may go without a quantity, and none may ask for zero."""
    request = _request()
    request.primary_tasks[0].values.quantity = quantity
    message = _refused(request)
    assert "quantity" in message


def test_a_blank_need_name_is_refused():
    """A need keeps a name."""
    request = _request()
    request.primary_tasks[0].values.task_name = "  "
    request.primary_tasks[0].values.model_fields_set.add("task_name")
    assert "task_name is required" in _refused(request)


def test_an_item_left_out_is_refused():
    """ADR-380: the absorbed need's item must be named too."""
    request = _request()
    request.primary_tasks[0].properties = request.primary_tasks[0].properties[:1]
    assert "every item must be named" in _refused(request)


def test_an_item_of_another_need_is_refused():
    """An item belongs to the kept need or one it absorbs."""
    request = _request()
    request.primary_tasks[1].properties = [request.primary_tasks[0].properties[0]]
    assert "items not on it" in _refused(request)


def test_an_item_named_twice_is_refused():
    """An item is handled one way only."""
    request = _request()
    request.primary_tasks[0].properties.append(request.primary_tasks[0].properties[0])
    assert "more than once" in _refused(request)


def test_a_kept_need_without_its_item_list_is_refused():
    """A kept need with items must list them (ADR-380)."""
    request = _request()
    request.primary_tasks[0].properties = None
    assert "every item must be named" in _refused(request)


def test_a_cancelled_item_takes_no_values():
    """Values sent with a cancelled item would be silently lost."""
    request = _request()
    request.primary_tasks[0].properties[1].action = "cancel"
    assert "takes no values" in _refused(request)


def test_cancelling_every_need_is_refused():
    """The primary ticket keeps at least one need (ADR-371)."""
    request = _request(
        primary_tasks=[{"task": _u("a1"), "action": "cancel"}, {"task": _u("a2"), "action": "cancel"}],
        secondary_tasks=[{"task": t, "action": "cancel"} for t in (_u("b1"), _u("b2"), _u("b3"))],
    )
    assert "at least one need" in _refused(request)


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ({"title": " "}, "title is required"),
        ({"title": "長" * 201}, "at most 200"),
        ({"contact_name": ""}, "contact_name is required"),
        ({"priority": None}, "priority is required"),
    ],
)
def test_ticket_fields_are_checked(values, expected):
    """The primary ticket's fields are checked like a new ticket's (Spec 028 §3.2)."""
    assert expected in _refused(_request(ticket=values))


def test_an_unknown_field_is_refused_by_the_schema():
    """A typo is a 422, not a change silently not made."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        _request(ticket={"titel": "錯字"})


# --- code review round (ADR-381, 383, 384) ------------------------------------------------


@pytest.mark.parametrize(("field", "limit"), [("priority", 20), ("task_type", 50)])
def test_ticket_fields_longer_than_their_column_are_refused(field, limit):
    """ADR-381: past the column the database would raise, and REST would answer 500."""
    assert f"at most {limit}" in _refused(_request(ticket={field: "x" * (limit + 1)}))
    assert _plan(_request(ticket={field: "x" * limit})).ticket_changes == {field: "x" * limit}


def _with_photos(ticket, *uuids):
    return replace(
        ticket, photos=tuple(PhotoForReview(uuid=u, url=f"https://x/{u}.jpg", created_at=None) for u in uuids)
    )


PH = {key: f"00000000-0000-0000-0000-0000000001{n:02d}" for n, key in enumerate(["pA", "pB", "pB2"])}


def test_photos_of_the_other_ticket_kept_move_and_the_rest_are_cancelled():
    """ADR-384: B's kept photo hangs under A; a cancelled one is soft-deleted; A's kept one stays."""
    low, high = _with_photos(LOW, PH["pA"]), _with_photos(HIGH, PH["pB"], PH["pB2"])
    request = _request(
        photos=[
            {"photo": PH["pA"], "action": "keep"},
            {"photo": PH["pB"], "action": "keep"},
            {"photo": PH["pB2"], "action": "cancel"},
        ]
    )

    plan = _plan(request, low=low, high=high)

    assert (plan.moved_photos, plan.canceled_photos) == ((PH["pB"],), (PH["pB2"],))


@pytest.mark.parametrize(
    ("photos", "expected"),
    [
        ([{"photo": PH["pA"], "action": "keep"}], "Every photo must be named"),
        (None, "Every photo must be named"),
        (
            [
                {"photo": PH["pA"], "action": "keep"},
                {"photo": PH["pA"], "action": "keep"},
                {"photo": PH["pB"], "action": "keep"},
            ],
            "more than once",
        ),
        (
            [
                {"photo": PH["pA"], "action": "keep"},
                {"photo": PH["pB"], "action": "keep"},
                {"photo": "00000000-0000-0000-0000-000000000999", "action": "keep"},
            ],
            "not on either ticket",
        ),
    ],
    ids=["one left out", "list missing", "named twice", "a stranger's photo"],
)
def test_photos_follow_the_need_rules(photos, expected):
    """ADR-384: every photo of both tickets is named once."""
    low, high = _with_photos(LOW, PH["pA"]), _with_photos(HIGH, PH["pB"])
    request = _request(photos=photos) if photos is not None else _request()

    assert expected in _refused(request, low=low, high=high)


def test_no_photos_needs_no_list():
    """Neither ticket has a photo: the request may leave `photos` out."""
    plan = _plan()

    assert (plan.moved_photos, plan.canceled_photos) == ((), ())


def test_the_disaster_answers_sent_replace_the_primarys():
    """ADR-385: the request gives the primary's full answers."""
    high = replace(HIGH, disaster_details={"power_outage": ("yes",)})

    plan = _plan(_request(disaster_details={"power_outage": ["yes"], "utility_hazards": ["gas"]}), high=high)

    assert plan.disaster_details == {"power_outage": ["yes"], "utility_hazards": ["gas"]}


def test_the_other_tickets_answers_cannot_be_left_unsaid():
    """ADR-385: B has answers, so the request must say what A ends with."""
    high = replace(HIGH, disaster_details={"power_outage": ("yes",)})

    assert "disaster_details" in _refused(high=high)


def test_answers_only_on_the_primary_may_be_left_alone():
    """Only A has answers and none are sent: A keeps them."""
    low = replace(LOW, disaster_details={"power_outage": ("no",)})

    assert _plan(low=low).disaster_details is None


def test_disaster_answers_past_the_size_limits_are_refused():
    """ADR-267's ceilings, as for setTicketDisasterDetails."""
    high = replace(HIGH, disaster_details={"power_outage": ("yes",)})

    assert "上限" in _refused(_request(disaster_details={"note": ["長" * 501]}), high=high)
