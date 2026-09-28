"""GraphQL types for the dedup fast layer (送單前查重複).

The check compares one task being filed against open tasks nearby. `TicketDedupHint` names
the matched ticket and task; it carries the contract's `TicketDedupRelation` fields that
exist before the new task does, so there is no `pairUuid`/`pairStatus` yet.
"""

import enum

import strawberry

from app.graphql.scalars import GeoJSON
from app.services.dedup_scoring import CandidateScore


@strawberry.enum
class DedupHintOutcome(enum.Enum):
    """What the submitter did with a hint; written to `duplicate_pairs.hint_outcome` as-is."""

    accepted_hint = "accepted_hint"
    ignored_hint = "ignored_hint"


@strawberry.type
class DedupScoreComponent:
    """One signal's contribution to the total score."""

    name: str = strawberry.field(
        description="成分名稱：'distance' / 'time' / 'task_type' / 'text'；慢層升級後可能新增"
    )
    score: float = strawberry.field(description="此成分的得分，0–1 正規化")
    weight: float = strawberry.field(description="此成分在總分中的權重（隨規則版本走）")
    passed: bool = strawberry.field(description="過線布林：得分 >= 該成分參考線即 true —— 成分燈號直接畫這顆")


@strawberry.type
class TicketDedupHint:
    """One existing ticket whose task looks like the task being filed."""

    related_ticket_uuid: str = strawberry.field(description="疑似重複的既有單 uuid")
    related_task_uuid: str = strawberry.field(description="該單底下比對到的 task uuid")
    similarity: float = strawberry.field(
        description="加權總分 0–1（各成分得分 × 權重加總，再除以可用成分的權重和）"
    )
    score_components: list[DedupScoreComponent] = strawberry.field(
        description="分數拆帳：每個訊號的得分、權重與過線燈號"
    )

    @classmethod
    def from_score(cls, score: CandidateScore) -> "TicketDedupHint":
        """Build from the scoring module's CandidateScore."""
        return cls(
            related_ticket_uuid=score.candidate.parent_uuid,
            related_task_uuid=score.candidate.entity_uuid,
            similarity=score.similarity,
            score_components=[
                DedupScoreComponent(name=c.name, score=c.score, weight=c.weight, passed=c.passed)
                for c in score.components
            ],
        )


@strawberry.input
class TicketDedupCheckInput:
    """The task about to be filed, and where. No `submittedAt`: time is the server's clock.

    Give `ticketUuid` when adding a task to an existing ticket, otherwise `geometry`.
    """

    task_type: str = strawberry.field(description="Type of help: 'rescue', 'supply', 'medical', or 'hr'")
    task_name: str | None = None
    task_description: str | None = None
    geometry: GeoJSON | None = strawberry.field(
        default=None,
        description="New ticket: GeoJSON Point for the location help is needed at — [longitude, latitude]",
    )
    ticket_uuid: str | None = strawberry.field(
        default=None,
        description="Existing ticket the task is added to: its location is used, `geometry` is ignored, "
        "and its own tasks are not candidates",
    )


@strawberry.input
class RecordDedupHintOutcomeInput:
    """What the submitter did about a hint, and which tasks it was about."""

    candidate_uuid: str = strawberry.field(description="提示指向的既有 task uuid（hint 的 relatedTaskUuid）")
    outcome: DedupHintOutcome = strawberry.field(description="使用者對提示的選擇")
    submitted_uuid: str | None = strawberry.field(
        default=None,
        description="照樣送出時新建的 task uuid；接受提示而沒有建立 task 時省略（不會產生配對卡）",
    )


@strawberry.type
class RecordDedupHintOutcomeResult:
    """Receipt for a recorded hint outcome."""

    audit_event_uuid: str = strawberry.field(description="寫入的去重稽核事件 uuid")
    hint_outcome: str = strawberry.field(
        description="配對卡上的 hint_outcome：'accepted_hint' 或 'ignored_hint'"
    )
    pair_uuid: str | None = strawberry.field(
        default=None,
        description="配對卡 uuid；接受提示而沒有建立新 task 時為 null（沒有第二個 task 可以配對）",
    )
