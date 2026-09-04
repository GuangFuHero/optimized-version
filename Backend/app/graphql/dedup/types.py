"""GraphQL types for the ticket dedup fast layer (送單前查重複).

Field names and value domains follow the frozen dedup contract (`DedupScoreComponent`,
`TicketDedupRelation`): the schema is snake_case in Python and camelCase online, because
`strawberry.Schema` leaves `auto_camel_case` on.

One deliberate departure from the frozen shape, flagged for the team: the contract's
`TicketDedupRelation` requires a non-null `pairUuid`/`pairStatus`, but the pre-submit check
runs *before* the ticket exists, and `ticket_duplicate_pairs` cannot hold a row whose FK
points at a ticket nobody has inserted. `TicketDedupHint` therefore carries the fields that
are meaningful at that moment — `relatedTicketUuid`, `similarity`, `scoreComponents` — with
the same names, and drops the two that cannot exist yet. The frozen relation shape is
untouched and still applies to the ticket read path (`TicketDedupInfo`), which is not in
this slice.
"""

import enum

import strawberry

from app.graphql.scalars import GeoJSON
from app.services.dedup_scoring import CandidateScore


@strawberry.enum
class DedupHintOutcome(enum.Enum):
    """What the submitter did with a duplicate hint.

    The first three are the "hint worked" branches and collapse to
    `ticket_duplicate_pairs.hint_outcome = 'accepted_hint'`; `submitted_anyway` is
    `'ignored_hint'`. The four-way distinction survives on the audit event's
    `decision_reason`. **Names proposed by this PR — the contract only froze the two-valued
    collapse, so they are on the list for the team to ratify.**
    """

    commented_on_original = "commented_on_original"
    suggested_edit_to_original = "suggested_edit_to_original"
    updated_own_ticket = "updated_own_ticket"
    submitted_anyway = "submitted_anyway"


@strawberry.type
class DedupScoreComponent:
    """One signal's contribution to the total score — the contract's component shape."""

    name: str = strawberry.field(
        description="成分名稱：'distance' / 'time' / 'task_type' / 'text'；慢層升級後可能新增"
    )
    score: float = strawberry.field(description="此成分的得分，0–1 正規化")
    weight: float = strawberry.field(description="此成分在總分中的權重（隨規則版本走）")
    passed: bool = strawberry.field(
        description="過線布林：得分 >= 該成分參考線即 true —— 成分燈號直接畫這顆"
    )


@strawberry.type
class TicketDedupHint:
    """A pre-submit duplicate warning: one existing ticket that looks like the one being filed."""

    related_ticket_uuid: str = strawberry.field(description="疑似重複的既有單 uuid")
    similarity: float = strawberry.field(description="加權總分 0–1（各成分得分 × 權重加總）")
    score_components: list[DedupScoreComponent] = strawberry.field(
        description="分數拆帳：每個訊號的得分、權重與過線燈號"
    )

    @classmethod
    def from_score(cls, score: CandidateScore) -> "TicketDedupHint":
        """Build from the scoring layer's CandidateScore."""
        return cls(
            related_ticket_uuid=score.candidate.ticket_uuid,
            similarity=score.similarity,
            score_components=[
                DedupScoreComponent(name=c.name, score=c.score, weight=c.weight, passed=c.passed)
                for c in score.components
            ],
        )


@strawberry.input
class TicketDedupCheckInput:
    """The about-to-be-submitted ticket's key fields — CreateTicketInput's scoring subset.

    Only the fields the four signals read are asked for, and nothing is persisted by the
    check. There is no `submittedAt`: the time signal is measured against the server's clock,
    which is the one scoring input a caller must not be able to set for themselves. Replays
    and tests pin it through the service's `submitted_at` argument instead.

    `title` and `description` are bounded before they reach pg_trgm (see
    app/services/dedup.py) — over-long text is truncated, not refused, because the check is
    advisory and refusing would drop the hint for exactly the wordiest reports.
    """

    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Point for the location help is needed at — [longitude, latitude]"
    )
    title: str
    description: str | None = None
    task_type: str | None = strawberry.field(
        default=None, description="Type of help: 'rescue', 'supply', 'medical', or 'hr'"
    )


@strawberry.input
class RecordDedupHintOutcomeInput:
    """What the submitter did about a hint, and which tickets it was about."""

    candidate_ticket_uuid: str = strawberry.field(description="提示指向的既有單 uuid")
    outcome: DedupHintOutcome = strawberry.field(description="使用者對提示的選擇")
    submitted_ticket_uuid: str | None = strawberry.field(
        default=None,
        description="照樣送出時新建的單 uuid；接受提示而沒有建單時省略（不會產生配對卡）",
    )


@strawberry.type
class RecordDedupHintOutcomeResult:
    """Receipt for a recorded hint outcome."""

    audit_event_uuid: str = strawberry.field(description="寫入的去重稽核事件 uuid")
    hint_outcome: str = strawberry.field(
        description="配對卡上的收斂值：'accepted_hint' 或 'ignored_hint'"
    )
    pair_uuid: str | None = strawberry.field(
        default=None,
        description="配對卡 uuid；接受提示而沒有建立新單時為 null（沒有第二張單可以配對）",
    )
