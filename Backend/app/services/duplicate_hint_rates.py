"""提示率 and 誤報率 of the dedup fast layer, for the back office (Spec 025, ADR-455).

Read-only. Everything comes from what the fast layer already records: a `hint_shown` event when a
hint is shown, an `ignored_by_submitter` event and its pair card when the submitter files anyway,
and the tasks and stations created in the window. Nothing records a hint the submitter took
(ADR-303), so a hint with no filing after it counts as a right one.

- 提示率 (`hint_rate`): hints over submissions, right or wrong alike. How often submitters are
  interrupted.
- 誤報率: the share of hints that were wrong (1 − precision). Two estimates, because reviewers may
  not get to every card:
  - `false_alarm_rate_without_auditors`: every "filed anyway" counts as a wrong hint.
  - `false_alarm_rate_with_auditors`: the share of reviewed "filed anyway" cards judged
    `not_duplicate`, applied to all of them. `review_coverage` says how many were reviewed.

One hint is one (submitter, old entity, Taipei day): going back to edit and sending again can show
the same hint twice. Batch-import hints count too, as imported rows count as submissions.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.services.authz import require_scope

KINDS = ("ticket_task", "station")

_COUNTS = text(
    """
    WITH hints AS (
        SELECT DISTINCT
               e.entity_kind,
               e.actor_uuid,
               e.primary_uuid,
               (e.created_at AT TIME ZONE 'Asia/Taipei')::date AS day_tw
        FROM dedup_audit_events e
        WHERE e.event_type = 'hint_shown'
          AND e.source_layer = 'fast'
          AND e.created_at >= :since AND e.created_at < :until
    ),
    overrides AS (
        SELECT DISTINCT ON (e.entity_kind, e.actor_uuid, e.primary_uuid,
                            (e.created_at AT TIME ZONE 'Asia/Taipei')::date)
               e.entity_kind,
               e.actor_uuid,
               e.primary_uuid,
               (e.created_at AT TIME ZONE 'Asia/Taipei')::date AS day_tw,
               c.status AS verdict
        FROM dedup_audit_events e
        LEFT JOIN duplicate_pairs c ON c.uuid = e.pair_uuid
        WHERE e.event_type = 'ignored_by_submitter'
          AND e.source_layer = 'fast'
          AND e.created_at >= :since AND e.created_at < :until
        ORDER BY e.entity_kind, e.actor_uuid, e.primary_uuid,
                 (e.created_at AT TIME ZONE 'Asia/Taipei')::date, e.created_at DESC
    ),
    outcomes AS (
        SELECT h.entity_kind, o.day_tw IS NOT NULL AS overridden, o.verdict
        FROM hints h
        LEFT JOIN overrides o
               ON o.entity_kind = h.entity_kind
              AND o.actor_uuid = h.actor_uuid
              AND o.primary_uuid = h.primary_uuid
              AND o.day_tw = h.day_tw
    ),
    created AS (
        SELECT 'ticket_task' AS entity_kind, t.uuid
        FROM ticket_tasks t
        WHERE t.created_at >= :since AND t.created_at < :until
        UNION ALL
        SELECT 'station', s.uuid
        FROM stations s
        JOIN base_geometries g ON g.uuid = s.uuid
        WHERE g.created_at >= :since AND g.created_at < :until
    )
    SELECT k.entity_kind,
           (SELECT count(*) FROM outcomes o WHERE o.entity_kind = k.entity_kind) AS hinted,
           (SELECT count(*) FROM outcomes o WHERE o.entity_kind = k.entity_kind AND o.overridden)
               AS overridden,
           (SELECT count(*) FROM outcomes o
             WHERE o.entity_kind = k.entity_kind
               AND o.verdict IN ('confirmed_duplicate', 'not_duplicate')) AS reviewed,
           (SELECT count(*) FROM outcomes o
             WHERE o.entity_kind = k.entity_kind AND o.verdict = 'not_duplicate') AS judged_not_duplicate,
           (SELECT count(*) FROM created c
             WHERE c.entity_kind = k.entity_kind
               AND NOT EXISTS (
                   SELECT 1 FROM dedup_audit_events e
                   WHERE e.event_type = 'ignored_by_submitter' AND e.duplicate_uuid = c.uuid
               )) AS created_without_hint
    FROM (VALUES ('ticket_task'), ('station')) AS k(entity_kind)
    """
)


def _ratio(part: int, whole: int) -> float | None:
    """`part / whole`, or None when nothing was counted (never a 0 that pretends to be a measurement)."""
    return part / whole if whole else None


@dataclass(frozen=True)
class HintRates:
    """One kind's counts over a window, and the rates worked from them."""

    entity_kind: str
    submissions: int
    hinted: int
    overridden: int
    reviewed: int
    judged_not_duplicate: int

    @property
    def hint_rate(self) -> float | None:
        """提示率: hints over submissions."""
        return _ratio(self.hinted, self.submissions)

    @property
    def false_alarm_rate_without_auditors(self) -> float | None:
        """誤報率 with every hint filed anyway counted as wrong."""
        return _ratio(self.overridden, self.hinted)

    @property
    def false_alarm_rate_with_auditors(self) -> float | None:
        """誤報率 with the reviewed cards' share of `not_duplicate` applied to every hint filed anyway."""
        if not self.reviewed or not self.hinted:
            return None
        return self.overridden * self.judged_not_duplicate / self.reviewed / self.hinted

    @property
    def review_coverage(self) -> float | None:
        """How many of the hints filed anyway have a reviewed card."""
        return _ratio(self.reviewed, self.overridden)


async def duplicate_hint_rates(
    db: AsyncSession, *, actor: User, since: datetime, until: datetime
) -> list[HintRates]:
    """提示率 and 誤報率 for tasks and stations over [since, until). Needs `ai_duplicate.view`."""
    await require_scope(actor, Perm.AI_DUP_VIEW, db)
    if since.tzinfo is None or until.tzinfo is None:
        raise ValueError("since and until need a time zone")
    if since >= until:
        raise ValueError("since must be before until")
    rows = (await db.execute(_COUNTS, {"since": since, "until": until})).mappings().all()
    return [
        HintRates(
            entity_kind=row["entity_kind"],
            submissions=row["hinted"] + row["created_without_hint"],
            hinted=row["hinted"],
            overridden=row["overridden"],
            reviewed=row["reviewed"],
            judged_not_duplicate=row["judged_not_duplicate"],
        )
        for row in rows
    ]
