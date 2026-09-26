"""GraphQL types for the dedup fast layer (送單前查重複).

`TicketDedupHint` / `StationDedupHint` carry the contract's `TicketDedupRelation` fields that
exist before the new entity does; there is no pair card yet, so no `pairUuid`/`pairStatus`.
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


@strawberry.enum
class DedupEntityKind(enum.Enum):
    """Which entity a hint outcome is about; written to `entity_kind` as-is."""

    ticket = "ticket"
    station = "station"


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
    """One existing ticket that looks like the one being filed."""

    related_ticket_uuid: str = strawberry.field(description="疑似重複的既有單 uuid")
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
            related_ticket_uuid=score.candidate.entity_uuid,
            similarity=score.similarity,
            score_components=_score_components(score),
        )


@strawberry.type
class StationDedupHint:
    """One existing station that looks like the one being registered."""

    related_station_uuid: str = strawberry.field(description="疑似重複的既有據點 uuid")
    similarity: float = strawberry.field(
        description="加權總分 0–1（各成分得分 × 權重加總，再除以可用成分的權重和）"
    )
    score_components: list[DedupScoreComponent] = strawberry.field(
        description="分數拆帳：每個訊號的得分、權重與過線燈號（沒有時間訊號 —— 據點不比時間）"
    )

    @classmethod
    def from_score(cls, score: CandidateScore) -> "StationDedupHint":
        """Build from the scoring module's CandidateScore."""
        return cls(
            related_station_uuid=score.candidate.entity_uuid,
            similarity=score.similarity,
            score_components=_score_components(score),
        )


def _score_components(score: CandidateScore) -> list[DedupScoreComponent]:
    return [
        DedupScoreComponent(name=c.name, score=c.score, weight=c.weight, passed=c.passed)
        for c in score.components
    ]


@strawberry.input
class TicketDedupCheckInput:
    """The scoring subset of CreateTicketInput. No `submittedAt`: time is the server's clock."""

    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Point for the location help is needed at — [longitude, latitude]"
    )
    title: str
    description: str | None = None
    task_type: str | None = strawberry.field(
        default=None, description="Type of help: 'rescue', 'supply', 'medical', or 'hr'"
    )


@strawberry.input
class StationDedupCheckInput:
    """The scoring subset of CreateStationInput. Stations have no time signal."""

    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Point for the location the station sits at — [longitude, latitude]"
    )
    type: str | None = strawberry.field(
        default=None, description="Station category, e.g. 'shelter', 'supply', 'medical'"
    )
    name: str | None = None
    description: str | None = None


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
    hint_outcome: str = strawberry.field(description="配對卡上的收斂值：'accepted_hint' 或 'ignored_hint'")
    pair_uuid: str | None = strawberry.field(
        default=None,
        description="配對卡 uuid；接受提示而沒有建立新單時為 null（沒有第二張單可以配對）",
    )
