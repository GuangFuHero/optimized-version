"""Turn a reviewer's resolve request into what to write, or refuse it (Spec 028 §3.3–3.4).

Pure: given the request, the card's kind, both whole tickets as the reviewer saw them and who is
on each need, `build_plan` returns a `ResolvePlan` or raises `ResolveRefused` (REST answers 422).
Nothing here reads or writes the database; `dedup_resolve.resolve` loads the inputs under its locks
and writes the plan. The vocabulary check on `disaster_types` needs the database and is left to it.

The rules, each from decisions.md:
- one primary ticket; the other is always cancelled (ADR-367, 371);
- every live need of both tickets is named exactly once — kept, cancelled, absorbed or moved — and
  so is every live item of a kept or moved need (ADR-368, 380);
- a need only absorbs needs of the other ticket of its own kind (ADR-370);
- no need ends with more people than its quantity, a person on two merged needs counting once
  (ADR-369, 370).
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace

from app.services.dedup_review_tickets import TicketForReview
from app.services.ticket import TICKET_TITLE_MAX_LENGTH, _check_disaster_detail_size, _validate_need_size

RESOLVABLE_KINDS = ("ticket", "ticket_task")


class ResolveRefused(ValueError):
    """The request cannot be carried out as sent. REST answers 422."""


@dataclass(frozen=True)
class KeptTask:
    """A need that stays on the primary ticket, its own or moved over, with its new values."""

    uuid: str
    task_type: str
    changes: dict
    absorbed: tuple[str, ...]
    headcount: int
    moved: bool = False


@dataclass(frozen=True)
class ResolvePlan:
    """Everything a resolve writes, decided before anything is written."""

    primary_uuid: str
    secondary_uuid: str
    ticket_changes: dict
    kept_tasks: tuple[KeptTask, ...]
    canceled_tasks: tuple[str, ...]
    absorbed: dict[str, str]
    property_changes: dict[str, dict]
    property_moves: dict[str, str]
    canceled_properties: tuple[str, ...]
    dropped_assignments: tuple[tuple[str, str], ...] = field(default=())
    moved_photos: tuple[str, ...] = ()
    canceled_photos: tuple[str, ...] = ()
    disaster_details: dict[str, list[str]] | None = None


# The primary ticket's fields a resolve may set (Spec 028 §3.2): not its status, not its place.
TICKET_FIELDS = (
    "title",
    "description",
    "priority",
    "task_type",
    "disaster_types",
    "person_trapped_reported",
    "immediate_danger_reported",
    "contact_name",
    "contact_phone",
    "contact_email",
)
TASK_FIELDS = ("task_name", "task_description", "quantity")
# tickets.priority is String(20), tickets.task_type String(50); the values are not checked (ADR-126).
_COLUMN_LIMITS = {"priority": 20, "task_type": 50}
PROPERTY_FIELDS = ("property_value", "quantity", "comment")


def build_plan(
    request,
    *,
    pair_kind: str,
    low: TicketForReview,
    high: TicketForReview,
    claimants: Mapping[str, set[str]],
) -> ResolvePlan:
    """The plan for `request` on a card between `low` and `high`, or ResolveRefused.

    `request` is a `ResolveRequest` (app/schemas/duplicate_pair.py); only the fields it set are
    changes. `claimants` maps each live need's uuid to the people on it.
    """
    if pair_kind not in RESOLVABLE_KINDS:
        raise ResolveRefused("Only ticket and need cards can be resolved")
    if low.uuid == high.uuid:
        raise ResolveRefused("Both sides are needs of the same ticket: there are no two tickets to merge")
    primary, secondary = (low, high) if request.primary == "low" else (high, low)
    draft = _Draft(primary, secondary, claimants)
    for entry in request.primary_tasks:
        draft.primary_entry(entry)
    for entry in request.secondary_tasks:
        draft.secondary_entry(entry)
    moved_photos, canceled_photos = _plan_photos(request.photos, primary, secondary)
    return replace(
        draft.finish(_ticket_changes(request.ticket)),
        moved_photos=moved_photos,
        canceled_photos=canceled_photos,
        disaster_details=_disaster_details(request.disaster_details, secondary),
    )


class _Draft:
    """The plan as `build_plan` walks the request; refuses as soon as an entry cannot be carried out."""

    def __init__(self, primary: TicketForReview, secondary: TicketForReview, claimants) -> None:
        self.primary, self.secondary, self.claimants = primary, secondary, claimants
        self.primary_tasks = {task.uuid: task for task in primary.tasks}
        self.secondary_tasks = {task.uuid: task for task in secondary.tasks}
        self.named: set[str] = set()
        self.kept: list[KeptTask] = []
        self.canceled: list[str] = []
        self.absorbed: dict[str, str] = {}
        self.items = _Items()
        self.dropped: list[tuple[str, str]] = []

    def _name(self, task_uuid: str) -> None:
        if task_uuid in self.named:
            raise ResolveRefused(f"Need {task_uuid} is named more than once")
        self.named.add(task_uuid)

    def _take(self, entry, tasks: dict, where: str):
        """The need `entry` names, from `tasks`; a cancelled one is recorded and None returned."""
        uuid = str(entry.task)
        if uuid not in tasks:
            raise ResolveRefused(f"Need {uuid} is not on the {where} ticket")
        self._name(uuid)
        if entry.action == "cancel":
            _no_payload(entry, uuid)
            self.canceled.append(uuid)
            return None
        return tasks[uuid]

    def primary_entry(self, entry) -> None:
        """A need of the primary ticket: cancelled, or kept with the needs it absorbs."""
        task = self._take(entry, self.primary_tasks, "primary")
        if task is None:
            return
        sources = [task, *(self._absorb(task, str(other)) for other in entry.absorb)]
        people, duplicates = _headcount(task.uuid, sources, self.claimants)
        self.dropped += duplicates
        self._keep(entry, task, sources, people, absorbed=tuple(str(a) for a in entry.absorb))

    def _absorb(self, into, other_uuid: str):
        other = self.secondary_tasks.get(other_uuid)
        if other is None:
            raise ResolveRefused(f"Need {other_uuid} is not on the other ticket")
        if other.task_type != into.task_type:
            raise ResolveRefused(
                f"Need {other_uuid} is a {other.task_type} need; it cannot merge into a {into.task_type} need"
            )
        self._name(other_uuid)
        self.absorbed[other_uuid] = into.uuid
        return other

    def secondary_entry(self, entry) -> None:
        """A need of the other ticket not absorbed: cancelled, or moved over with its own people."""
        task = self._take(entry, self.secondary_tasks, "other")
        if task is None:
            return
        people = len(self.claimants.get(task.uuid, set()))
        self._keep(entry, task, [task], people, absorbed=(), moved=True)

    def _keep(self, entry, task, sources, people: int, *, absorbed: tuple, moved: bool = False) -> None:
        changes = _task_changes(entry, task)
        _check_size(task, changes, people)
        self.items.plan(entry, task.uuid, sources)
        self.kept.append(
            KeptTask(
                uuid=task.uuid,
                task_type=task.task_type,
                changes=changes,
                absorbed=absorbed,
                headcount=people,
                moved=moved,
            )
        )

    def finish(self, ticket_changes: dict) -> ResolvePlan:
        missing = sorted((set(self.primary_tasks) | set(self.secondary_tasks)) - self.named)
        if missing:
            raise ResolveRefused(f"Every need of both tickets must be named; missing: {', '.join(missing)}")
        if not self.kept:
            raise ResolveRefused("The primary ticket must keep at least one need")
        return ResolvePlan(
            primary_uuid=self.primary.uuid,
            secondary_uuid=self.secondary.uuid,
            ticket_changes=ticket_changes,
            kept_tasks=tuple(self.kept),
            canceled_tasks=tuple(self.canceled),
            absorbed=dict(self.absorbed),
            property_changes=dict(self.items.changes),
            property_moves=dict(self.items.moves),
            canceled_properties=tuple(self.items.canceled),
            dropped_assignments=tuple(self.dropped),
        )


def _no_payload(entry, uuid: str) -> None:
    if getattr(entry, "absorb", None):
        raise ResolveRefused(f"Need {uuid} is cancelled: it cannot absorb other needs")
    if entry.values is not None or entry.properties is not None:
        raise ResolveRefused(f"Need {uuid} is cancelled: it takes no values or items")


def _headcount(uuid: str, sources, claimants) -> tuple[int, list[tuple[str, str]]]:
    """People on the kept need once its absorbed needs move over; someone on two counts once.

    The second assignment of such a person, the one on an absorbed need, is dropped (ADR-369).
    """
    seen = set(claimants.get(uuid, set()))
    dropped = []
    for other in sources[1:]:
        for person in sorted(claimants.get(other.uuid, set())):
            if person in seen:
                dropped.append((other.uuid, person))
            else:
                seen.add(person)
    return len(seen), dropped


def _task_changes(entry, task) -> dict:
    values = entry.values
    if values is None:
        return {}
    return {name: getattr(values, name) for name in TASK_FIELDS if name in values.model_fields_set}


def _check_size(task, changes: dict, people: int) -> None:
    """The need's name and quantity after the changes, against its kind and its people (ADR-370).

    The kind's rules are create's own (`ticket._validate_need_size`); only the headcount is new.
    """
    task_name = changes.get("task_name", task.task_name)
    quantity = changes.get("quantity", task.quantity)
    if not task_name or not task_name.strip():
        raise ResolveRefused(f"Need {task.uuid}: task_name is required")
    try:
        _validate_need_size(task.task_type, task_name, quantity)
    except ValueError as err:
        raise ResolveRefused(f"Need {task.uuid}: {err}") from err
    if quantity is not None and people > quantity:
        raise ResolveRefused(
            f"Need {task.uuid}: {people} people are on it, more than the quantity {quantity}"
        )


def _plan_photos(listed, primary: TicketForReview, secondary: TicketForReview) -> tuple[tuple, tuple]:
    """Every live photo of both tickets kept or cancelled; the other's kept ones move over (ADR-384)."""
    owner = {photo.uuid: ticket.uuid for ticket in (primary, secondary) for photo in ticket.photos}
    if not owner and listed is None:
        return (), ()
    named = [str(item.photo) for item in (listed or [])]
    if len(named) != len(set(named)):
        raise ResolveRefused("A photo is named more than once")
    unknown = sorted(set(named) - set(owner))
    if unknown:
        raise ResolveRefused(f"Photos not on either ticket: {', '.join(unknown)}")
    missing = sorted(set(owner) - set(named))
    if missing:
        raise ResolveRefused(f"Every photo must be named; missing: {', '.join(missing)}")
    kept = {str(item.photo) for item in listed if item.action == "keep"}
    moved = tuple(p for p in named if p in kept and owner[p] == secondary.uuid)
    canceled = tuple(p for p in named if p not in kept)
    return moved, canceled


def _disaster_details(sent, secondary: TicketForReview) -> dict[str, list[str]] | None:
    """The primary's full answers to set, or None to leave them (ADR-385).

    The other ticket's answers would otherwise vanish with it, so when it has any the request
    must say what the primary ends with.
    """
    if sent is None:
        if secondary.disaster_details:
            raise ResolveRefused("The other ticket has disaster_details: send the primary's full answers")
        return None
    try:
        _check_disaster_detail_size(sent)
    except ValueError as err:
        raise ResolveRefused(str(err)) from err
    return {name: list(values) for name, values in sent.items()}


class _Items:
    """What happens to every live item of the kept and moved needs (ADR-380)."""

    def __init__(self) -> None:
        self.changes: dict[str, dict] = {}
        self.moves: dict[str, str] = {}
        self.canceled: list[str] = []

    def plan(self, entry, uuid: str, sources: Sequence) -> None:
        """Every live item of need `uuid` and of the needs it absorbs, kept (maybe moved) or cancelled."""
        owner = {prop.uuid: source.uuid for source in sources for prop in source.properties}
        _check_listed(uuid, [str(item.property) for item in (entry.properties or [])], set(owner))
        for item in entry.properties or []:
            prop = str(item.property)
            if item.action == "cancel":
                if item.values is not None:
                    raise ResolveRefused(f"Item {prop} is cancelled: it takes no values")
                self.canceled.append(prop)
                continue
            if owner[prop] != uuid:
                self.moves[prop] = uuid
            changes = _property_changes(prop, item.values)
            if changes:
                self.changes[prop] = changes


def _check_listed(uuid: str, listed: list[str], owned: set[str]) -> None:
    if len(listed) != len(set(listed)):
        raise ResolveRefused(f"Need {uuid}: an item is named more than once")
    unknown = sorted(set(listed) - owned)
    if unknown:
        raise ResolveRefused(f"Need {uuid}: items not on it or the needs it absorbs: {', '.join(unknown)}")
    missing = sorted(owned - set(listed))
    if missing:
        raise ResolveRefused(f"Need {uuid}: every item must be named; missing: {', '.join(missing)}")


def _property_changes(prop: str, values) -> dict:
    if values is None:
        return {}
    changes = {name: getattr(values, name) for name in PROPERTY_FIELDS if name in values.model_fields_set}
    if "property_value" in changes and changes["property_value"] is None:
        raise ResolveRefused(f"Item {prop}: property_value cannot be empty")
    return changes


def _ticket_changes(values) -> dict:
    """The primary ticket's fields the request set, checked like a new ticket's (Spec 028 §3.2)."""
    if values is None:
        return {}
    changes = {name: getattr(values, name) for name in TICKET_FIELDS if name in values.model_fields_set}
    if "title" in changes:
        title = changes["title"]
        if not title or not title.strip():
            raise ResolveRefused("title is required")
        if len(title) > TICKET_TITLE_MAX_LENGTH:
            raise ResolveRefused(f"title must be at most {TICKET_TITLE_MAX_LENGTH} characters")
    for required in ("priority", "contact_name"):
        if required in changes and not (changes[required] or "").strip():
            raise ResolveRefused(f"{required} is required")
    for name, limit in _COLUMN_LIMITS.items():
        # Past the column the database raises, and REST would answer 500 (ADR-381).
        if changes.get(name) is not None and len(changes[name]) > limit:
            raise ResolveRefused(f"{name} must be at most {limit} characters")
    return changes
