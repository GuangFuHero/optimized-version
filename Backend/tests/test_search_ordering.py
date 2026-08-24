"""The search/list ORDER BY must be a *total* order (ADR-153).

This is a structural test on purpose. The behavioural version — insert rows that tie on
every other key, then page through them — passes with or without the fix at test-suite
data volumes, because PostgreSQL happens to be deterministic for a six-row sort under one
plan. The property that actually matters ("the last sort key is unique") is only reliably
observable in the clause itself, so that is what is asserted here.
"""

import pytest

from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.repositories.geo_repository import StationRepository
from app.repositories.tickets_repository import TicketRepository, TicketTaskRepository
from tests.fakes import CapturingSession

# Both branches of _order_by: the standing order, and the relevance order used when the
# caller passed `q`. Neither may end on a non-unique key.
_TERMS = [None, "光復"]


def _rendered(clause) -> str:
    return str(clause.compile(compile_kwargs={"literal_binds": True}))


def _cases():
    for repo, model in ((StationRepository(), Station), (TicketRepository(), Tickets)):
        for term in _TERMS:
            yield repo, model, term


def test_order_by_ends_on_the_primary_key():
    """Without a unique final key, OFFSET/LIMIT pages can overlap and drop rows.

    Searching makes ties the common case rather than the exception: every row matched only
    through a related table ties on BOTH relevance keys (the ILIKE boolean is false and
    similarity() is 0 for a CJK mid-string match — ADR-147), `priority_score` is usually
    NULL, and `created_at` comes from `server_default=func.now()`, which is
    transaction-scoped — one bulk insert leaves a whole block sharing a timestamp.
    """
    for repo, model, term in _cases():
        clauses = repo._order_by(term)
        expected = _rendered(model.uuid.desc())
        assert _rendered(clauses[-1]) == expected, (
            f"{type(repo).__name__}._order_by(term={term!r}) ends on "
            f"{_rendered(clauses[-1])!r}, which is not unique — append the primary key "
            f"so the order is total (ADR-153)"
        )


def test_searching_only_prepends_relevance_keys():
    """The standing order must survive underneath the relevance keys, tiebreaker included.

    A search that replaced the standing order rather than prefixing it would silently
    change how equally-relevant rows are ranked — and drop the tiebreaker with it.
    """
    for repo, _model, _term in _cases():
        standing = [_rendered(c) for c in repo._order_by(None)]
        searching = [_rendered(c) for c in repo._order_by("光復")]
        assert searching[-len(standing):] == standing, (
            f"{type(repo).__name__}: searching does not end in the standing order\n"
            f"  standing:  {standing}\n  searching: {searching}"
        )
        assert len(searching) == len(standing) + 2, "expected exactly two relevance keys"


@pytest.mark.asyncio
async def test_list_by_ticket_also_ends_on_the_primary_key():
    """Same rule for the third paged list, which builds its ORDER BY inline.

    TicketTaskRepository has no _order_by() to inspect — the clause is attached where the
    statement is executed — so this asserts on the statement the repository actually
    hands the session. `TicketTask.created_at` is a server_default=func.now(), which is
    transaction-scoped: every task created for one ticket in one transaction shares a
    timestamp, so the tie this guards against is the normal case, not an edge case.
    """
    db = CapturingSession()
    await TicketTaskRepository().list_by_ticket(db, "00000000-0000-0000-0000-000000000000")

    last = list(db.statements[-1]._order_by_clauses)[-1]
    assert _rendered(last) == _rendered(TicketTask.uuid.desc()), (
        f"list_by_ticket ends on {_rendered(last)!r}, which is not unique — append the "
        f"primary key so the order is total (ADR-153)"
    )
