"""Response shapes for the change-timeline endpoints (feature 016)."""

from datetime import datetime

from pydantic import BaseModel, Field


class ActorResponse(BaseModel):
    """Who acted.

    `uuid` and `name` are both null for a system write — app.current_user_id is only set on
    HTTP requests, so seeds, migrations and background jobs land unattributed (ADR-136).
    There is no "unknown" state: users are soft-deleted, so a uuid here always resolves.
    """

    uuid: str | None = Field(description="操作者 UUID；系統寫入為 null")
    name: str | None = Field(description="操作者顯示名稱；系統寫入為 null")
    kind: str = Field(description="user / system / crawler / gov / ngo（後三者僅建立事件，ADR-137）")
    is_removed: bool = Field(description="該使用者是否已被移除（仍顯示姓名，ADR-136）")


class ChangeResponse(BaseModel):
    """One field that moved.

    `before` / `after` are null with `changed=true` when the caller may know that the value
    moved but not what it moved to — a withheld address, or any geometry (ADR-141/142).
    Values are raw; Chinese labels and status wording belong to the frontend (ADR-145).
    """

    field: str
    before: object | None = None
    after: object | None = None
    changed: bool | None = Field(
        default=None, description="true 代表有變更但不揭露值"
    )


class HistoryEventResponse(BaseModel):
    """One transaction, folded into a single event (ADR-134)."""

    event_type: str = Field(
        description="CREATED / UPDATED / DELETED / RESTORED / ASSIGNED / UNASSIGNED"
    )
    at: datetime
    entity: str
    actor: ActorResponse
    changes: list[ChangeResponse]
    raw: list[dict] | None = Field(
        default=None, description="原始 audit 負載；僅持有 audit.view 時附上（ADR-130）"
    )


class HistoryMeta(BaseModel):
    """Paging information. Slicing happens in the application layer (ADR-139)."""

    total: int = Field(description="合併後的事件總數")
    truncated: bool = Field(description="超過抓取上限而截斷（ADR-139）")
    limit: int
    offset: int


class HistoryResponse(BaseModel):
    """The project's standard envelope around a page of timeline events."""

    success: bool = True
    data: list[HistoryEventResponse]
    meta: HistoryMeta


class PublicNeedResponse(BaseModel):
    """A need as it stood right after the event: its name and how many are coming of how many asked."""

    name: str | None
    matched: int = Field(description="已承接人數")
    required: int | None = Field(description="需要人數；沒填為 null")


class PublicHistoryEventResponse(BaseModel):
    """What happened to a ticket, and in what role, with nobody's name (ADR-421)."""

    kind: str = Field(
        description=(
            "ticket_created / ticket_updated / need_added / need_updated / need_filled / need_stopped / "
            "need_reopened / need_removed / volunteer_joined / volunteer_left"
        )
    )
    at: datetime
    actor_role: str = Field(description="requester / volunteer / staff / system")
    need: PublicNeedResponse | None = Field(default=None, description="這個事件的需求（需求與承接事件）")
    needs: list[PublicNeedResponse] | None = Field(default=None, description="建單時的需求（ticket_created）")
    changes: list[ChangeResponse] = Field(
        default_factory=list,
        description=(
            "改了什麼。說明、地點、聯絡方式、受困／危險、進度備註、需求細項只有 changed=true；"
            "檢核不列（ADR-421）"
        ),
    )


class PublicHistoryResponse(BaseModel):
    """The standard envelope around a page of the public timeline."""

    success: bool = True
    data: list[PublicHistoryEventResponse]
    meta: HistoryMeta
