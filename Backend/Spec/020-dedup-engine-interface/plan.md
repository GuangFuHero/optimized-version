# 020 去重引擎介面 — Implementation Plan

**進度（2026-09-29）**：Phase 1（Task 1~14）完成並通過 Docker 驗證（`Backend/DEDUP_ENGINE_020_VERIFICATION.md`，Phase 1 版）。合進 Chi 的任務層級更新與 main（merge `af2ca1d95`）。**Phase 2（ADR-304）Task 16~23 完成**，每個 commit 的全套件皆綠（T19 1655、T20 1661、T21 1676、T22 1676、T23 1610 passed，0 failed）。**剩 Task 24（Docker 完整驗證，情境改任務層級）與 Task 0（與 Chi 確認合約、效能門檻、逾時秒數）**。前端不在後端範圍，§「交給前端的 API 變更」為交接說明。

**Goal:** 把 Spec 019 的去重快層包成「演算法可獨立迭代」的後端服務：Chi 只動 `app/dedup_engine/`，
後端只依賴 `contract.py`；提示改由 `createTicket` / `createStation` 兩段式帶出，拿掉獨立的 dedup API。

**Architecture:** 純函式的 algorithm core（不做 I/O）＋後端的 snapshot builder / repository / service /
編排函式。engine 吃快照、回 `Match`；後端只讀 `candidate_uuid` 與 `similarity`，`evidence` 只存不讀。

**Tech Stack:** FastAPI, strawberry, SQLAlchemy async, PostgreSQL/PostGIS（pg_trgm 只剩對照測試用）,
pytest（`uv run pytest`）, ruff。無新依賴（文字相似度自己實作，見 Task 2）。

**Source spec:** `Spec/020-dedup-engine-interface/spec.md`（ADR-286~299）

**Branch:** `feat/dedup-engine-interface`（off `feat/dedup-station-fast-layer` #59 → `feat/dedup-fast-layer` #46）。
**合併必須排在 #46、#59 之後**；本分支會改 #46 的 migration，#46 若先合併，Task 5 要改成新開 migration。

---

## Global Constraints

- **core 不做 I/O。** `app/dedup_engine/` 底下不能 import `sqlalchemy`、`fastapi`、`strawberry`、`app.models`、
  `app.repositories`、`app.services`。Task 1 有一條守衛測試強制這件事。
- **fast-v1 的分數行為盡量不變。** 權重、門檻、公式、半徑解法照 019 搬。唯一刻意的差異是文字相似度改用
  Python（ADR-288），Task 2 用 pg_trgm 對照測試把差異壓到 0。
- **`create_ticket` / `create_station` 對外行為不變**（ADR-299）。批次匯入與既有測試不應該有任何紅燈。
- **不存重播用的輸入**（ADR-295）。任何 audit / pair 寫入都不能放快照或標題、描述原文。
- **不動未結案定義**（spec §10 延後）。`DEDUP_ENTITIES.open_filters` 原樣保留。
- **PR 範圍**：只放本票的東西；既有 lint、既有 baseline 失敗不在這裡修。

### 每個 Task 的完成條件（Definition of Done）

1. **有測試。** 每個會動到程式碼的 Task 都要有自己的新測試，先寫、先看它紅（RED），再實作到綠（GREEN）。
   純重構的 Task 也要有測試釘住「行為沒變」，不能只靠「全套件沒紅」。
2. **本 Task 的測試綠＋全套件不比基準差。** 基準在開工前記一次（Task 1 開頭），之後每個 Task 結束都跑
   `uv run pytest tests -q` 對照，只能多、不能少，不能有新紅燈。
3. **一個 Task 一個 commit**，訊息用 conventional commits，測試與實作同一個 commit。
4. **整張票完成後做 Task 14 的 Docker 完整驗證**：從零建 image、全新 DB、在容器裡跑全套件、實際打 API 走流程。
   沒通過 Task 14 不算完成，也不回報完成。

### 測試環境

`backend-db-1` 是 `postgis/postgis:16-3.4`，沒有 h3；測試的 session fixture 會 `CREATE EXTENSION h3`，所以整套測試在它上面
全部 error。本票另起一個只給測試用的容器（不動 `backend-db-1`）：

```
docker run -d --name dedup020-testdb -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5435:5432 disaster-postgres-h3:16-3.4
export TEST_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5435/disaster_rescue_test"
export TEST_ADMIN_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5435/postgres"
```

### 已知陷阱

1. **rollback 會 expire actor。** fail-open 的 `db.rollback()` 會讓所有已載入物件過期，之後讀 `actor.uuid`
   就是 async lazy load → `MissingGreenlet`。019 的 query 在 rollback 後直接 return，所以沒踩到；
   兩段式在 rollback 後還要建單，**一定要 `await refresh_actor(db, actor)`**（`app/services/authz.py`）。
   Task 9 有一條用真 DB 的測試專門抓這個，**不要用 fake session 或 `expire_on_commit=False` 的 fixture 繞過**。
2. **flush 後不要讀 server default 欄位。** `created_at` 是 `server_default`，flush 後屬性是 expired，
   讀它也是 lazy load。送出快照的 `created_at` 一律用請求開頭取的 `now`。
3. **測試 DB 汙染。** 切分支後 pytest 若在 `drop_all` 失敗，先 `DROP DATABASE disaster_rescue_test` 讓 conftest 重建。
4. **覆蓋率量測**：用 `COVERAGE_CORE=sysmon`，預設 tracer 量不到 ASGI client 路徑。
5. **git**：用 `/opt/homebrew/bin/git`；git root 是 `optimized-version/`，不要 `git add -A`／`git add .`。

---

## Task 順序的關鍵

**Task 0 是閘門。** `contract.py` 是雙方合約，Chi 沒確認之前寫下去的每一行都可能重工。

**Task 1~4 全在 core，不碰 DB。** 先把 engine 做成可以單獨跑、單獨測的東西，並用 contract test ＋ golden file
把 fast-v1 的行為釘住。之後後端怎麼接線，都有一個不會動的基準可以對照。

**Task 5（schema）在任何寫入路徑之前。** service 要寫的 `engine_version`、`hint_shown` 必須先存在。

**Task 6（拆 `create_*`）在編排之前，而且要先跑全套件確認零紅燈。** 這是純重構，之後的紅燈才有診斷價值。

**Task 7~10 照資料流**：快照 → 候選 → service → 編排。每一步都能獨立測，不需要 GraphQL 存在。

**Task 11~12（GraphQL 與既有測試）最後。** union 一上，約 53 處既有 `createTicket` / `createStation` 測試查詢都要改，
放最後才不會在中途整片紅。

---

## Task 0: 與 Chi 確認合約（閘門）

不寫程式，所以沒有測試；完成條件是 Chi 的確認寫回 spec §3／§4（有改就改、沒改就在 spec 註明確認日期）。

- [ ] 把 spec §3（快照欄位、`Candidate`）、§4（`Match`、`RetrievalSpec`、`DedupEngine`）給 Chi 看
- [ ] 確認他的離線 harness 能改吃 `TicketSnapshot` / `StationSnapshot` / `Candidate`（spec §2 第 5 條）
- [ ] 確認 contract test 的效能門檻 X（spec §10；本計畫先用暫定值 200 ms / 500 筆）
- [ ] 有任何欄位調整：先改 spec §3／§4 再往下做

---

## Task 1: `contract.py` 與 core 的 import 守衛

**Files:** Create `app/dedup_engine/__init__.py`, `app/dedup_engine/contract.py`, `tests/dedup_engine/__init__.py`,
`tests/dedup_engine/test_core_isolation.py`, `tests/dedup_engine/test_contract_types.py`

- [x] **開工前記基準**：`uv run pytest tests -q` 的 passed／failed／error 數寫進 PR 描述草稿，後面每個 Task 都對照它
- [x] **RED**：`test_core_isolation.py`，掃 `app/dedup_engine/**/*.py` 的 import，禁止清單出現就失敗

```python
"""app/dedup_engine is the algorithm owner's code: it must stay pure (ADR-287)."""

import ast
from pathlib import Path

CORE = Path(__file__).resolve().parents[2] / "app" / "dedup_engine"
FORBIDDEN = ("sqlalchemy", "geoalchemy2", "fastapi", "strawberry", "app.models", "app.repositories",
             "app.services", "app.graphql", "app.db")


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def test_core_does_no_io():
    offenders = {
        f"{path.name}: {name}"
        for path in CORE.rglob("*.py")
        for name in _imports(path)
        if name.startswith(FORBIDDEN)
    }
    assert not offenders, f"app/dedup_engine must not import I/O layers: {sorted(offenders)}"
```

- [x] **GREEN**：寫 `contract.py`（內容即 spec §3、§4，下面是完整檔案）

```python
"""The contract between the backend and the dedup algorithm (Spec 020, ADR-289~292).

Both sides depend on this module and nothing else of each other. Changing it needs both
owners to agree: add fields with defaults; renaming, removing or re-meaning a field bumps
SNAPSHOT_SCHEMA_VERSION.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol

SNAPSHOT_SCHEMA_VERSION = 1

EntityKind = Literal["ticket", "station"]


@dataclass(frozen=True)
class GeoPoint:
    lon: float
    lat: float


@dataclass(frozen=True)
class TicketSnapshot:
    """Facts about one ticket. `uuid`/`status` are None for the one being submitted."""

    uuid: str | None
    location: GeoPoint
    created_at: datetime
    title: str
    description: str | None = None
    task_type: str | None = None
    priority: str | None = None
    status: str | None = None
    disaster_types: tuple[str, ...] = ()
    person_trapped_reported: str | None = None
    immediate_danger_reported: str | None = None
    verification_status: str | None = None


@dataclass(frozen=True)
class StationSnapshot:
    """Facts about one station. Always a point (ADR-298)."""

    uuid: str | None
    location: GeoPoint
    created_at: datetime
    name: str | None = None
    description: str | None = None
    type: str | None = None
    operational_status: str | None = None
    is_temporary: bool = False
    expires_at: datetime | None = None
    is_official: bool = False
    op_hour: str | None = None
    level: int = 0
    source: str | None = None


Snapshot = TicketSnapshot | StationSnapshot


@dataclass(frozen=True)
class Candidate:
    """An existing entity plus the facts about its relation to the submission."""

    snapshot: Snapshot
    distance_m: float
    same_contact_phone: bool | None = None  # None: either side has no usable phone (ADR-293)


@dataclass(frozen=True)
class RetrievalSpec:
    radius_m: float


@dataclass(frozen=True)
class Match:
    candidate_uuid: str
    similarity: float  # 0–1
    evidence: Mapping[str, Any]  # opaque to the backend; JSON-serializable; no snapshot text


class DedupEngine(Protocol):
    version: str

    def retrieval(self, kind: EntityKind) -> RetrievalSpec: ...

    def rank(self, submission: Snapshot, candidates: Sequence[Candidate], now: datetime) -> Sequence[Match]: ...

    def score(self, submission: Snapshot, candidate: Candidate, now: datetime) -> Match: ...
```

- [x] **RED → GREEN**：`test_contract_types.py`
  - [x] 所有快照與 `Candidate`、`Match`、`RetrievalSpec` 都是 frozen（賦值拋 `FrozenInstanceError`）
  - [x] 快照除必填欄位外全部有預設值（ADR-289 第 4 點「只加不改」的前提）：用 `dataclasses.fields` 檢查
  - [x] 快照欄位不含 `contact_*`、`review_note`、`visibility`、`team_uuid`、`updated_by`、`search_text`
  - [x] `FastEngine`（Task 3 之後）滿足 `DedupEngine` Protocol：先寫成 `@pytest.mark.skip(reason="Task 3")`，Task 3 拿掉
- [x] `uv run pytest tests/dedup_engine -q` 綠

---

## Task 2: 文字相似度（Python，與 pg_trgm 對齊）

**Files:** Create `app/dedup_engine/text.py`, `tests/dedup_engine/test_text.py`, `tests/test_dedup_trgm_parity.py`

目標：fast-v1 的文字分數與 019 在 SQL 算的 **完全相同**，這樣「門檻要重跑回測」（ADR-288）的風險就縮到只剩欄位串接方式。

- [x] **RED**：`test_text.py` 單元測試

```python
from app.dedup_engine.text import trigram_similarity


def test_identical_text_is_one():
    assert trigram_similarity("民生街淹水", "民生街淹水") == 1.0


def test_empty_side_is_zero():
    assert trigram_similarity("", "民生街淹水") == 0.0


def test_case_and_punctuation_do_not_matter():
    assert trigram_similarity("Pump, NEEDED!", "pump needed") == 1.0


def test_symmetric():
    a, b = "民生街三段淹水需要抽水機", "民生街淹水 需要抽水"
    assert trigram_similarity(a, b) == trigram_similarity(b, a)
```

- [x] **RED**：`test_dedup_trgm_parity.py`（真 DB）：同一組字串，Python 與 `SELECT similarity(a, b)` 差距 < 1e-6

```python
PAIRS = [
    ("民生街三段淹水需要抽水機 一樓積水到膝蓋，需要抽水機", "民生街三段淹水需要抽水機"),
    ("需要志工幫忙搬物資 倉庫缺人手", "民生街三段淹水需要抽水機"),
    ("Shelter at Guangfu Elementary", "guangfu elementary shelter"),
    ("A-1 臨時收容所", "A1臨時收容所"),
    ("", "任何文字"),
]

@pytest.mark.asyncio
@pytest.mark.parametrize(("a", "b"), PAIRS)
async def test_python_trigram_matches_pg_trgm(a, b):
    async with test_db() as db:
        expected = (await db.execute(select(func.similarity(a, b)))).scalar_one()
    assert trigram_similarity(a, b) == pytest.approx(expected, abs=1e-6)
```

- [x] **GREEN**：`text.py`

```python
"""pg_trgm-compatible trigram similarity, in Python (ADR-288).

Mirrors pg_trgm's `similarity()`: lower-case, split into alphanumeric words, pad each word
with two spaces in front and one behind, take the set of 3-character windows, and return
|A ∩ B| / |A ∪ B|. CJK characters count as alphanumeric, so an unspaced Chinese sentence is
one word — the same as pg_trgm under a UTF-8 locale.
"""

import re

_WORD = re.compile(r"[^\W_]+")


def trigrams(text: str) -> frozenset[str]:
    grams: set[str] = set()
    for word in _WORD.findall(text.lower()):
        padded = f"  {word} "
        grams.update(padded[i : i + 3] for i in range(len(padded) - 2))
    return frozenset(grams)


def trigram_similarity(a: str, b: str) -> float:
    ga, gb = trigrams(a), trigrams(b)
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)
```

- [x] parity 測試若有任何一組不等：**先查 pg_trgm 的斷詞規則（`t_isalnum` 依 DB locale），修 Python 端**，
  不要放寬容差。真的對不齊的案例寫進 `CHANGELOG.md` 的 fast-v1 條目

---

## Task 3: fast engine（由 `dedup_scoring.py` 搬入）

**Files:** Create `app/dedup_engine/fast.py`, `app/dedup_engine/registry.py`, `tests/dedup_engine/test_fast.py`

> **實作時調整（2026-09-28）**：
> - `app/services/dedup_scoring.py` 與 `tests/test_dedup_scoring.py` **留到 Task 13 才刪**。舊的 service／repository
>   在 Task 8、9 之前仍 import 它，提早刪會讓全套件整片紅，違反「每個 Task 全套件不比基準差」。
> - 公式拆成 `measure()`（快照 → `Signals`）與 `combine()`（`Signals` → 分數與成分），019 對照 harness 的精確數字測試
>   改打 `combine()`；另用 4 萬組隨機輸入比對 019 的 `score_candidate` 與 `combine()`，最大差距 0.0。
> - `rank()` 只抽一次送出端的 trigram（`_Submission`），500 筆 2000 字候選從 132 ms 降到 68 ms。

- [x] **RED**：把 `tests/test_dedup_scoring.py` 每一條改寫成吃快照的版本放進 `test_fast.py`。測試輔助：

```python
NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)


def ticket(uuid=None, *, minutes_ago=0.0, **fields) -> TicketSnapshot:
    base = {"title": "民生街三段淹水需要抽水機", "description": "一樓積水到膝蓋", "task_type": "rescue"}
    return TicketSnapshot(uuid=uuid, location=HERE, created_at=NOW - timedelta(minutes=minutes_ago),
                          **(base | fields))


def near(uuid="c1", *, distance_m=8.0, minutes_ago=12.0, **fields) -> Candidate:
    return Candidate(snapshot=ticket(uuid, minutes_ago=minutes_ago, **fields), distance_m=distance_m)
```

  另外補 019 沒有的四條：
  - [x] 站點沒有 `time` 成分（`STATION_PARAMETERS.time_weight == 0`）
  - [x] 任一邊文字為空 → 沒有 `text` 成分（不是 0 分）
  - [x] `evidence` 裡不含 `title` / `description` 原文
  - [x] `retrieval("ticket").radius_m == pytest.approx(147.4 * 1.1, abs=0.1)`；`retrieval("station")` ≈ 124.3 × 1.1

- [x] **GREEN**：`fast.py`

```python
"""fast-v1: the rule-based fast layer, ported from Spec 019's dedup_scoring.py.

Signals (each 0–1), averaged by weight over the signals that are available:

    distance  = 2 ** (-distance_m / distance_half_m)
    time      = 2 ** (-age_min / time_half_min)        (skipped when time_weight is 0)
    task_type = 1.0 if both categories match else 0.0  (skipped if either side is unknown)
    text      = trigram similarity                      (skipped if either side has no text)

⚠️ 參數是暫定值：13 筆手寫 fixture 的 grid search 第一名，text_weight 與
component_baseline 沒跑過 grid。見 CHANGELOG.md。
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import datetime

from app.dedup_engine.contract import (
    Candidate, EntityKind, Match, RetrievalSpec, Snapshot, StationSnapshot, TicketSnapshot,
)
from app.dedup_engine.text import trigram_similarity

TITLE_MAX_CHARS = 200
DESCRIPTION_MAX_CHARS = 2000
RETRIEVAL_SAFETY_FACTOR = 1.1  # float rounding must not drop a candidate scoring exactly on the line


@dataclass(frozen=True)
class FastParameters:
    distance_half_m: float = 200.0
    time_half_min: float = 360.0
    distance_weight: float = 2.0
    time_weight: float = 0.5
    task_type_weight: float = 0.5
    text_weight: float = 1.0
    hint_threshold: float = 0.8
    component_baseline: float = 0.5


TICKET_PARAMETERS = FastParameters()
STATION_PARAMETERS = replace(TICKET_PARAMETERS, time_weight=0.0)  # a station's age says nothing


class FastEngine:
    version = "fast-v1"

    def __init__(self, parameters: dict[EntityKind, FastParameters] | None = None):
        self._parameters = parameters or {"ticket": TICKET_PARAMETERS, "station": STATION_PARAMETERS}

    def retrieval(self, kind: EntityKind) -> RetrievalSpec:
        return RetrievalSpec(radius_m=max_hint_distance_m(self._parameters[kind]) * RETRIEVAL_SAFETY_FACTOR)

    def score(self, submission: Snapshot, candidate: Candidate, now: datetime) -> Match:
        p = self._parameters[_kind(submission)]
        signals = _signals(submission, candidate, now, p)
        total = sum(weight for _, _, weight in signals)
        if total <= 0:
            raise ValueError("at least one available signal must have positive weight")
        similarity = sum(score * weight for _, score, weight in signals) / total
        components = [
            {"name": name, "score": round(score, 4), "weight": weight, "passed": score >= p.component_baseline}
            for name, score, weight in signals
        ]
        return Match(candidate.snapshot.uuid, similarity, {"components": components})

    def rank(self, submission: Snapshot, candidates: Sequence[Candidate], now: datetime) -> list[Match]:
        threshold = self._parameters[_kind(submission)].hint_threshold
        matches = (self.score(submission, c, now) for c in candidates)
        hits = [m for m in matches if m.similarity >= threshold]
        return sorted(hits, key=lambda m: (-m.similarity, m.candidate_uuid))


def _signals(submission, candidate, now, p) -> list[tuple[str, float, float]]:
    other = candidate.snapshot
    signals = [("distance", 2 ** (-candidate.distance_m / p.distance_half_m), p.distance_weight)]
    if p.time_weight > 0:
        age_min = max(0.0, (now - other.created_at).total_seconds() / 60)
        signals.append(("time", 2 ** (-age_min / p.time_half_min), p.time_weight))
    mine, theirs = _category(submission), _category(other)
    if mine is not None and theirs is not None:
        signals.append(("task_type", float(mine == theirs), p.task_type_weight))
    text_a, text_b = _text(submission), _text(other)
    if text_a and text_b:
        signals.append(("text", trigram_similarity(text_a, text_b), p.text_weight))
    return signals


def _kind(snapshot: Snapshot) -> EntityKind:
    return "ticket" if isinstance(snapshot, TicketSnapshot) else "station"


def _category(snapshot: Snapshot) -> str | None:
    return snapshot.task_type if isinstance(snapshot, TicketSnapshot) else snapshot.type


def _text(snapshot: Snapshot) -> str:
    first = snapshot.title if isinstance(snapshot, TicketSnapshot) else snapshot.name
    parts = ((first or "")[:TITLE_MAX_CHARS], (snapshot.description or "")[:DESCRIPTION_MAX_CHARS])
    return " ".join(part for part in parts if part).strip()


def max_hint_distance_m(p: FastParameters) -> float:
    """Distance past which no candidate can reach the threshold (every other signal at 1.0)."""
    total = p.distance_weight + p.time_weight + p.task_type_weight + p.text_weight
    if p.distance_weight <= 0 or total <= 0:
        return math.inf
    required = 1 + total * (p.hint_threshold - 1) / p.distance_weight
    if required <= 0:
        return math.inf
    if required >= 1:
        return 0.0
    return -p.distance_half_m * math.log2(required)
```

- [x] `registry.py`：後端取 engine 的唯一入口，測試用 monkeypatch 換掉

```python
from app.dedup_engine.contract import DedupEngine
from app.dedup_engine.fast import FastEngine

_ENGINE: DedupEngine = FastEngine()


def get_engine() -> DedupEngine:
    return _ENGINE
```

> **與 019 的兩處刻意差異**（寫進 CHANGELOG）：(1) 文字相似度由 Python 算（Task 2 已對齊 pg_trgm）；
> (2) 候選端文字也套 200／2000 截斷（019 只截送出端）。`same_contact_phone` 在 fast-v1 **不使用**，保持行為對等。

---

## Task 4: contract test、golden file、CHANGELOG

**Files:** Create `tests/dedup_engine/test_contract.py`, `tests/dedup_engine/golden_cases.py`,
`tests/dedup_engine/golden/fast.json`, `scripts/regen_dedup_golden.py`, `app/dedup_engine/CHANGELOG.md`

- [x] **RED → GREEN**：`test_contract.py`，逐條對應 spec §8（1~9），對 `ENGINES = [FastEngine()]` 參數化

```python
ENGINES = [FastEngine()]
PERF_BUDGET_MS = 200  # 暫定，spec §10 待 Task 0 確認
MARK = "⟦MARK-7f3a⟧"   # a string no evidence may echo back


@pytest.fixture(params=ENGINES, ids=lambda e: e.version)
def engine(request):
    return request.param


def test_similarity_in_unit_range_and_rank_descending(engine): ...
def test_deterministic(engine): ...                      # 同輸入跑兩次，Match 全等
def test_empty_candidates(engine): assert list(engine.rank(ticket(), [], NOW)) == []
def test_radius_finite_and_beyond_it_never_hints(engine):
    for kind, sub in (("ticket", ticket()), ("station", station())):
        radius = engine.retrieval(kind).radius_m
        assert 0 < radius < math.inf
        # every other signal maxed out: same text, same category, same instant, same phone
        far = Candidate(snapshot=replace(sub, uuid="far"), distance_m=radius * 1.01, same_contact_phone=True)
        assert engine.rank(sub, [far], NOW) == []
def test_evidence_is_json_and_echoes_no_text(engine):
    sub = ticket(title=f"{MARK}淹水", description=f"{MARK}一樓")
    m = engine.score(sub, near(title=f"{MARK}淹水", description=f"{MARK}一樓"), NOW)
    assert MARK not in json.dumps(m.evidence, ensure_ascii=False)
def test_all_optional_fields_empty(engine): ...          # None / "" / () / same_contact_phone=None 都不拋錯
def test_submission_without_uuid_and_status(engine): ...
def test_performance(engine): ...                        # 500 筆候選 < PERF_BUDGET_MS
def test_version_format(engine): assert re.fullmatch(r"[a-z]+-v[1-9][0-9]*", engine.version)
```

- [x] `golden_cases.py`：約 20 組固定輸入（019 的 fixture 情境＋站點＋邊界：剛好在半徑上、文字為空、類別缺一邊）
- [x] `scripts/regen_dedup_golden.py`：算出所有案例的 `rank` 與 `score` 結果寫進 `golden/fast.json`

```python
# 要點：輸出改了但版本號沒變 → 拒絕寫入。更新 golden 的唯一途徑是先升版（ADR-297）。
old = json.loads(GOLDEN.read_text()) if GOLDEN.exists() else None
new = {"version": engine.version, "cases": compute(engine)}
if old and old["version"] == new["version"] and old["cases"] != new["cases"]:
    sys.exit(f"outputs changed but version is still {engine.version}: bump FastEngine.version first")
GOLDEN.write_text(json.dumps(new, ensure_ascii=False, indent=2, sort_keys=True))
```

- [x] golden 測試（spec §8 第 10 條）

```python
def test_golden():
    golden = json.loads(GOLDEN.read_text())
    engine = get_engine()
    assert golden["version"] == engine.version, "version bumped: run scripts/regen_dedup_golden.py"
    assert compute(engine) == golden["cases"], (
        f"scoring changed under {engine.version}: bump the version, then regenerate the golden file"
    )
```

  similarity 在 golden 裡一律 `round(x, 6)`，避免浮點尾數讓測試不穩
- [x] `CHANGELOG.md` 寫 fast-v1：參數表（照 019 spec §3）、與 019 的兩處差異、回測結果欄位先留「待 Chi 補」
- [x] 跑一次 regen 產生第一份 golden，commit

---

## Task 5: Schema（改 #46 的 migration）

**Files:** Modify `app/models/dedup.py`, `alembic/versions/d4c8b1e07a92_dedup_fast_layer_tables.py`

- [x] `AUDIT_EVENT_TYPES` 加 `"hint_shown"`
- [x] `DuplicatePair.score_components` → `evidence: Mapped[dict | None]`（JSONB，comment：「engine 的 evidence，內容由 engine 版本決定」）
- [x] `DuplicatePair.engine_version: Mapped[str | None]`，CHECK `method = 'manual' OR engine_version IS NOT NULL`（ADR-294 修訂）
- [x] `DedupAuditEvent.engine_version: Mapped[str | None] = mapped_column(Text, nullable=True)`
- [x] migration 同步改：`sa.Column("evidence", ...)`、兩個 `engine_version` 欄、`ck_dedup_audit_events_type` 的值清單
- [x] `uv run pytest tests/test_migrations_match_models.py -q` 綠
- [x] `uv run alembic heads` 只有 `d4c8b1e07a92`
- [x] 在全新 DB 上 `alembic upgrade head` → `downgrade -1` → `upgrade head` 都成功
- [x] **RED → GREEN**：`tests/test_dedup_schema.py`（真 DB）
  - [x] `method='fast_rule'` 不帶 `engine_version` → `IntegrityError`；`method='manual'` 不帶 → 成功
  - [x] `dedup_audit_events` 寫 `event_type="hint_shown"` 成功；寫不在清單的值 → CHECK 失敗
  - [x] `evidence` 存巢狀 dict 讀回相等（JSONB round-trip）
  - [x] 表上已不存在 `score_components` 欄（查 `information_schema.columns`）

---

## Task 6: 拆 `create_ticket` / `create_station`（純重構，ADR-299）

**Files:** Modify `app/services/ticket.py`, `app/services/station.py`

- [x] `ticket.py` 新增

```python
@dataclass(frozen=True)
class TicketFields:
    """A ticket that passed authz and validation, not yet written."""

    point: dict                      # validated GeoJSON Point
    values: dict                     # normalized column values for ticket_repository.add
    secondary_location: dict | None


async def validate_ticket(db, *, actor, geometry, title, description, contact_name, contact_email,
                          contact_phone, priority, task_type, visibility, disaster_types=None,
                          person_trapped_reported=None, immediate_danger_reported=None,
                          secondary_location=None) -> TicketFields:
    await require_scope(actor, Perm.TICKET_ADD, db)
    disaster_types = await validate_disaster_types(db, disaster_types or [])
    validate_point(geometry, entity="Ticket")
    contacts = normalize_contact_fields({...}, required=frozenset({"contact_name"}))  # 原樣搬
    return TicketFields(point=geometry, values={"title": title, ..., **contacts}, secondary_location=secondary_location)


async def insert_ticket(db, *, actor, fields: TicketFields) -> Tickets:
    """Write the ticket (and its address) and flush. The caller owns the commit."""
    ticket = await ticket_repository.add(db, obj_in={
        "property_name": "request",
        "geometry": geojson_to_geom(fields.point),
        "created_by": str(actor.uuid),
        "status": "pending",
        **fields.values,
    })
    if fields.secondary_location:
        await secondary_location_repository.add(
            db, obj_in={"geometry_uuid": str(ticket.uuid), **fields.secondary_location}
        )
    return ticket


async def create_ticket(db, *, actor, **kwargs) -> Tickets:   # 簽章保持原本的具名參數，不要改成 **kwargs
    fields = await validate_ticket(db, actor=actor, ...)
    ticket = await insert_ticket(db, actor=actor, fields=fields)
    await db.commit()
    await db.refresh(ticket)
    return ticket
```

  原本 docstring 與註解（`contact_name` NOT NULL、`secondary_location` 的 joined-table 說明）跟著各自的段落搬，不要丟
- [x] `station.py` 比照：`StationFields`、`validate_station`、`insert_station`、`create_station`
- [x] **`create_station` commit 後會發 `resource_station_updated` 通知**：抽成 `announce_station_created(db, *, station, actor_uuid)`，
  `create_station` 與 Task 10 的 `submit_station` 都在 commit 後呼叫它，否則 GraphQL 建站點會少發通知
- [x] **RED → GREEN**：`tests/test_create_split.py`（真 DB），ticket／station 各一組
  - [x] `validate_*` 對無權限、非法 geometry、未知 `disaster_types`、過長聯絡欄位各自拋錯，**且 DB 無任何新列**
  - [x] `validate_*` 成功時也**不寫任何列**
  - [x] `insert_*` 之後 `rollback` → 單與地址都不存在（證明它不 commit）
  - [x] `create_*` 的結果與拆分前逐欄相同（聯絡欄位是正規化後的值、`status="pending"`、地址有寫入）
  - [x] `create_*` 的簽章沒變：`inspect.signature` 的參數名稱清單與拆分前相同（批次匯入靠它）
- [x] **全套件**：`uv run pytest tests -q`，結果必須與分支起點相同（記下起點的 passed 數當基準）。
  特別看 `test_bulk_import_*`、`test_graphql/test_mutations.py`

---

## Task 7: snapshot builder

**Files:** Create `app/services/dedup_snapshot.py`, `tests/test_dedup_snapshot.py`

- [x] **RED**：
  - [x] 同一張工單，`ticket_submission(fields, now)` 與寫入後 `ticket_snapshot(row)` 的欄位除 `uuid`／`status`／`created_at` 外全相等
  - [x] `dataclasses.fields(TicketSnapshot)` 不含任何 `contact_*`、`review_note`、`visibility`、`team_uuid`、`updated_by`、`search_text`
  - [x] `same_contact_phone("0912-345-678", "+886912345678") is True`；`("0912345678", None) is None`；`("abc", "0912345678") is None`；不同號碼 `is False`
  - [x] 站點 row 的 geometry 若不是 Point：取 centroid（防呆，ADR-298）
- [x] **GREEN**：

```python
"""Backend-side conversion into the dedup contract (Spec 020 §3). No scoring here."""

def ticket_submission(fields: TicketFields, *, now: datetime) -> TicketSnapshot:
    lon, lat = fields.point["coordinates"][:2]
    v = fields.values
    return TicketSnapshot(
        uuid=None, location=GeoPoint(lon, lat), created_at=now, status=None,
        title=v["title"], description=v.get("description"), task_type=v.get("task_type"),
        priority=v.get("priority"), disaster_types=tuple(v.get("disaster_types") or ()),
        person_trapped_reported=v.get("person_trapped_reported"),
        immediate_danger_reported=v.get("immediate_danger_reported"),
    )


def ticket_snapshot(row: Tickets) -> TicketSnapshot: ...     # location 由 geom_to_geojson 取點
def station_submission(fields: StationFields, *, now) -> StationSnapshot: ...
def station_snapshot(row: Station) -> StationSnapshot: ...


def same_contact_phone(a: str | None, b: str | None) -> bool | None:
    """Equality after normalize_phone. None when either side has no usable number (ADR-293).

    Stored phones are only stripped, not E.164, so both sides are normalized here.
    """
    try:
        return normalize_phone(a) == normalize_phone(b) if a and b else None
    except ValueError:
        return None


def to_candidate(kind, row, *, distance_m: float, submission_phone: str | None) -> Candidate:
    snapshot = ticket_snapshot(row) if kind == "ticket" else station_snapshot(row)
    return Candidate(snapshot, distance_m, same_contact_phone(submission_phone, row.contact_phone))
```

---

## Task 8: repository 只回事實

**Files:** Modify `app/repositories/dedup_repository.py`


> **實作時調整（2026-09-28）**：新方法取名 `nearby_open_rows(db, *, kind, longitude, latitude, radius_m, now)` 與
> `row_with_distance(db, *, kind, uuid, longitude, latitude)`，**與舊的 `list_nearby_open` / `get_candidate_features` 並存**。
> 舊 service／舊 GraphQL 仍呼叫它們，先刪會讓全套件整片紅；舊方法與 `DedupEntity.text_fields` 等欄位在 **Task 13** 與其他舊碼一併刪。
> `row_with_distance` 對格式錯誤的 uuid 回 None（它來自 client 的 `acknowledgedDuplicateOf`）。

- [x] `list_nearby_open(db, *, kind, longitude, latitude, radius_m, now) -> list[tuple[Model, float]]`：
  移除 `query_text` 參數、`func.similarity`、`_to_candidate`、`has_text`、`age_min`
- [x] `get_with_distance(db, *, kind, uuid, longitude, latitude) -> tuple[Model, float] | None`：
  取代 `get_candidate_features`，不套半徑與未結案過濾，**要套軟刪過濾**（spec §5 確認後送出第 4 點）
- [x] `DedupEntity` 拿掉 `text_fields`、`type_field`、`texts()`、`type_of()`；保留 `model`、`use_centroid`、`open_filters`、`geometry()`
- [x] 不再 import `app.services.dedup_scoring`
- [x] 測試（真 DB，沿用 `test_graphql/test_dedup.py` 的 `_seed_ticket`，搬到 `tests/test_dedup_repository.py`）：
  - [x] 半徑外、`completed`／`cancelled`、軟刪的不出現
  - [x] 過期臨時站點、`permanently_closed` 站點不出現
  - [x] 回傳距離與 `ST_Distance` 一致（±0.5 m）

---

## Task 9: dedup service

**Files:** Rewrite `app/services/dedup.py`, `tests/test_dedup_service.py`

新增三個函式。舊的 `find_duplicate_hints`、`record_hint_outcome`、`_KINDS`、`_rescore_pair`、`_evidence`、`_components_json`
**留到 Task 13 才刪**：舊 GraphQL resolver 到 Task 11 才移除，在那之前仍呼叫它們（2026-09-28 實作時調整）。

```python
MAX_CANDIDATE_RADIUS_M = 1000.0  # 後端防呆上限（ADR-292）


async def find_match(db, *, kind: EntityKind, submission: Snapshot, submission_phone: str | None,
                     actor: User, now: datetime) -> Match | None:
    """The best match, or None. Never raises (fail-open).

    On failure the session is rolled back — which expires every loaded object, the actor
    included — so the actor is reloaded before returning: the caller goes on to create.
    """
    engine = get_engine()
    try:
        radius = _clamp(engine.retrieval(kind).radius_m)
        rows = await dedup_candidate_repository.list_nearby_open(
            db, kind=kind, longitude=submission.location.lon, latitude=submission.location.lat,
            radius_m=radius, now=now,
        )
        candidates = [to_candidate(kind, row, distance_m=d, submission_phone=submission_phone) for row, d in rows]
        matches = engine.rank(submission, candidates, now)
        return matches[0] if matches else None
    except Exception:
        logger.exception("fast-layer dedup failed; creating without a hint (fail-open)")
        with contextlib.suppress(Exception):
            await db.rollback()
        await refresh_actor(db, actor)
        return None


async def record_hint_shown(db, *, kind, match: Match, actor_uuid: str) -> None:
    """Audit that a hint was shown. Only uuid, similarity, version and evidence (ADR-295)."""


async def record_acknowledged(db, *, kind, created: Snapshot, submission_phone, acknowledged_uuid: str,
                              actor_uuid: str, now) -> DuplicatePair | None:
    """Card the pair the submitter chose to file anyway. Does not commit.

    Missing/deleted target → log, return None. engine.score failure → card with null
    similarity/evidence (spec §5).
    """
```

- 配對卡：`status="dup_ignored"`、`rescan_needed=True`、`hint_outcome="ignored_hint"`、`method="fast_rule"`、
  `source_layer="fast"`、`engine_version=engine.version`、`evidence=match.evidence`、`similarity=Decimal(f"{s:.4f}")`
- 已有現行卡：沿用 019 的 `_upsert_fast_pair` 行為（就地改成 `dup_ignored` + `rescan_needed`），補寫 `engine_version`
- audit：`hint_shown`（`primary_uuid`=候選、`duplicate_uuid`=None）、`ignored_by_submitter`（`primary_uuid`=被確認的、
  `duplicate_uuid`=新建的）；`evidence={"similarity": round(s, 4), "engine": match.evidence}`；`engine_version` 必填

測試（`test_dedup_service.py`）：

- [x] 用 stub engine（monkeypatch `registry._ENGINE`）驗證：半徑超過 1000 被截斷並記 warning
- [x] engine `rank` 拋錯 → `find_match` 回 None、rollback 有被呼叫
- [x] **真 DB**：engine 拋錯後，同一個 session 接著讀 `actor.uuid` 不拋 `MissingGreenlet`（已知陷阱 1）
- [x] `record_acknowledged`：目標已軟刪 → None、無卡；`score` 拋錯 → 卡的 `similarity`／`evidence` 為 null
- [x] 寫入的 audit / pair 的 JSON 內不含送出快照的標題、描述原文（ADR-295；用 MARK 字串驗）

---

## Task 10: 編排：`submit_ticket` / `submit_station`

**Files:** Create `app/services/dedup_submission.py`, `tests/test_dedup_submission.py`

```python
@dataclass(frozen=True)
class Created:
    entity: Tickets | Station


@dataclass(frozen=True)
class Suspected:
    related_uuid: str


async def submit_ticket(db, *, actor: User, acknowledged_duplicate_of: str | None, **fields) -> Created | Suspected:
    now = datetime.now(UTC)
    validated = await ticket_service.validate_ticket(db, actor=actor, **fields)
    actor_uuid = str(actor.uuid)  # before anything can roll back (已知陷阱 1)
    submission = ticket_submission(validated, now=now)
    phone = validated.values.get("contact_phone")

    if acknowledged_duplicate_of is None:
        match = await dedup_service.find_match(db, kind="ticket", submission=submission,
                                               submission_phone=phone, actor=actor, now=now)
        if match is not None:
            await dedup_service.record_hint_shown(db, kind="ticket", match=match, actor_uuid=actor_uuid)
            await db.commit()
            return Suspected(match.candidate_uuid)

    ticket = await ticket_service.insert_ticket(db, actor=actor, fields=validated)
    if acknowledged_duplicate_of is not None:
        created = replace(submission, uuid=str(ticket.uuid), status="pending")  # 不讀 ticket.created_at（陷阱 2）
        await dedup_service.record_acknowledged(
            db, kind="ticket", created=created, submission_phone=phone,
            acknowledged_uuid=acknowledged_duplicate_of, actor_uuid=actor_uuid, now=now,
        )
    await db.commit()
    await db.refresh(ticket)
    return Created(ticket)
```

- `submit_station` 比照（`validate_station` / `insert_station` / `station_submission`）；**commit 後呼叫 `announce_station_created`**（建單路徑的 `create_ticket` 沒有通知，不需要）
- 確認後送出**不跑 `find_match`**（ADR-296）

測試（真 DB，stub engine 控制命中與否）：

- [x] 命中：不建單、`hint_shown` 一筆、回 `Suspected`
- [x] 未命中：建單、無 audit、回 `Created`
- [x] 確認後送出：建單＋配對卡＋`ignored_by_submitter` 同時存在；engine 的 `rank` 沒被呼叫
- [x] **atomic**：讓 `record_acknowledged` 在寫卡後拋錯 → 單、卡、audit 全都不存在
- [x] 驗證失敗（無 `ticket.add`、非法 geometry、未知 `disaster_types`）→ 在跑 dedup 之前就失敗，無任何 audit
- [x] engine 拋錯 → 照常建單（fail-open，走真 DB，順便覆蓋陷阱 1）
- [x] 確認的 uuid 不存在 → 照常建單、無卡
- [x] 站點：上面前三條各一條

---

## Task 11: GraphQL

> **實作時調整（2026-09-28）**：
> - **Task 11 與 Task 12 合成一個 commit**。union 一上，既有的 `createTicket` / `createStation` 測試查詢全部失效，
>   分開 commit 會讓中間那個 commit 全套件紅。
> - `tests/test_graphql/test_dedup.py`、`test_dedup_station.py` **在這裡刪**（原排 Task 13）：它們測的 `graphql/dedup/` 在這一步移除。
> - 既有測試實際要改的是 13 個查詢、19 個讀取點（原估 53 是 grep 行數），用平衡括號解析機械式改寫。

**Files:** Modify `app/graphql/tickets/types.py`, `app/graphql/tickets/mutations.py`, `app/graphql/geo/types.py`,
`app/graphql/geo/mutations.py`, `app/graphql/schema.py`；Delete `app/graphql/dedup/`

- [x] 型別

```python
@strawberry.type
class TicketCreated:
    ticket: TicketType


@strawberry.type
class DuplicateSuspected:
    related_ticket_uuid: str = strawberry.field(description="疑似重複的既有求助單 uuid")


CreateTicketResult = Annotated[TicketCreated | DuplicateSuspected, strawberry.union("CreateTicketResult")]
```

  站點：`StationCreated { station }`、`DuplicateStationSuspected { relatedStationUuid }`、`CreateStationResult`
- [x] resolver：多一個參數 `acknowledged_duplicate_of: str | None = None`，改呼叫 `submit_ticket`，依回傳型別組 union。
  docstring 寫清楚兩段式（前端靠這段理解流程）
- [x] `schema.py` 移除 `DedupQuery`、`DedupMutation`；刪 `app/graphql/dedup/`
- [x] SDL 檢查：`print_schema` 裡不再有 `ticketDedupCandidates`、`stationDedupCandidates`、`recordDedupHintOutcome`、
  `DedupScoreComponent`、`TicketDedupHint`、`StationDedupHint`、`DedupEntityKind`、`DedupHintOutcome`
- [x] 新測試 `tests/test_graphql/test_create_dedup.py`（取代 `test_dedup.py`、`test_dedup_station.py`）：
  - [x] 真 engine、真 DB：在既有單旁送出同文字 → `__typename == "DuplicateSuspected"`、`relatedTicketUuid` 正確
  - [x] 帶 `acknowledgedDuplicateOf` 再送 → `TicketCreated`，DB 有配對卡
  - [x] 遠處、不同內容 → 直接 `TicketCreated`
  - [x] 無權限 → 403，**不透露**是否有疑似重複（回應裡沒有 `DuplicateSuspected`）
  - [x] 站點同上三條

---

## Task 12: 既有測試改用 union

**Files:** `tests/test_graphql/test_mutations.py`（18）、`test_suggestions.py`（10）、`test_query_rbac.py`（6）、
`test_edge_cases.py`（5）、`test_station_photo.py`（4）、`test_error_masking.py`（4）、`test_ticket_disaster_fields.py`（3）、
`test_delete_review.py`（2）、`tests/test_notifications_db_integration.py`（1）

- [x] 查詢改成 `createTicket(input: $input) { __typename ... on TicketCreated { ticket { <原本的欄位> } } }`；
  斷言改讀 `data.createTicket.ticket`
- [x] 這些測試的 fixture 可能在同一地點連建多張相似的單，會意外觸發 `DuplicateSuspected`。
  **不要為此改 fixture 的座標或文字**；在 `tests/test_graphql/conftest.py` 加一個 autouse fixture，
  預設把 engine 換成永不命中的 stub，只有 `test_create_dedup.py` 用 marker 關掉它：

```python
class _NeverMatches:
    version = "stub-v1"
    def retrieval(self, kind): return RetrievalSpec(radius_m=1.0)
    def rank(self, submission, candidates, now): return []
    def score(self, submission, candidate, now): raise AssertionError("not expected")


@pytest.fixture(autouse=True)
def _no_dedup_hints(request, monkeypatch):
    if "real_dedup" not in request.keywords:
        monkeypatch.setattr(registry, "_ENGINE", _NeverMatches())
```

  （`real_dedup` marker 記得註冊到 `pyproject.toml` 的 `markers`）
- [x] **RED → GREEN**：`tests/test_graphql/test_dedup_stub_fixture.py`
  - [x] 沒標 marker 的測試裡 `get_engine().version == "stub-v1"`
  - [x] 標了 `@pytest.mark.real_dedup` 的測試裡 `get_engine().version == "fast-v1"`（確保 `test_create_dedup.py` 不會默默測到 stub）
- [x] 錯誤路徑測試（`test_error_masking.py`、`test_edge_cases.py`）：錯誤仍在 `errors`，`data.createTicket` 為 null，行為不變

---

## Task 13: 收尾

- [x] ~~刪 `tests/test_graphql/test_dedup.py`、`test_dedup_station.py`~~（已在 Task 11 刪）
- [x] `Spec/019-dedup-fast-layer/spec.md` 開頭加註：§1 GraphQL、§3 計分位置、§4 的 GraphQL 已被 Spec 020 取代
- [x] `grep -rn "dedup_scoring\|find_duplicate_hints\|record_hint_outcome\|score_components" app tests` 為零
- [x] `ruff==0.11.0 check` 與 `ruff format --check` 在本票改動的檔案上乾淨
- [x] **RED → GREEN**：`tests/test_dedup_legacy_removed.py`
  - [x] `import app.services.dedup_scoring` 與 `import app.graphql.dedup` 都拋 `ModuleNotFoundError`
  - [x] `print_schema(schema)` 不含 Task 11 列出的舊型別與舊欄位名稱
  - [x] `app.services.dedup` 沒有 `find_duplicate_hints`、`record_hint_outcome` 屬性

---

## Task 14: Docker 完整驗證（整張票的完成條件）

在不動使用者現有 `backend-db-1` / `backend-redis-1` 的前提下，起一套獨立的 stack。
compose 檔、腳本都放 scratchpad，不進 repo。

### 14.1 本機收尾

- [x] `uv run pytest tests -q`：與基準相比只多不少，無新紅燈
- [x] `COVERAGE_CORE=sysmon uv run pytest --cov=app/dedup_engine --cov=app/services/dedup --cov=app/services/dedup_submission --cov=app/services/dedup_snapshot tests -q`：≥ 80%
- [x] `uv run alembic heads` 單一 head

### 14.2 從零建立

- [x] 建 image（`compose up --build` 會卡在 buildx，一律用這個）：
  `DOCKER_BUILDKIT=0 docker build -t dedup020-backend:verify .`
- [x] 用 `-p dedup020verify` ＋ scratchpad 的 compose 檔起 db、redis、backend：
  - db 用 `disaster-postgres-h3:16-3.4`（`b3e8d1f4a6c2` 需要 h3）
  - backend 用 `image: dedup020-backend:verify`，不用 `build:`
  - db／redis 不對外開 port；backend 若要開，避開 8000／8001（常被佔），用 8011
- [x] 全新 volume：`alembic upgrade head` 乾淨；`alembic downgrade -1` → `upgrade head` 再走一次
- [x] seed：`docker exec -e PYTHONPATH=/app <backend> python scripts/seed_rbac.py`

### 14.3 容器裡跑全套件

- [x] 在 backend 容器內對 stack 的 db 跑 `pytest tests -q`（`TEST_DB_URL` 指向容器網路內的 db），結果與 14.1 一致
- [x] 注意：image 用 `uv pip install .`，不吃 `uv.lock`，套件版本可能與本機不同。兩邊結果不一致時先比 `pip freeze`

### 14.4 實際打 API

sandbox 從 host 打 published port 會失敗，一律 `docker cp` 腳本進 backend 容器、`docker exec <backend> python /tmp/x.py`
打 `localhost:8000`（image 內有 httpx）。測試帳號用 ORM 腳本直接建（比走註冊快）。

- [x] 求助單：建一張 → 在旁邊送同內容 → `DuplicateSuspected`（`relatedTicketUuid` 正確、DB 沒有新單、有 `hint_shown`）
  → 帶 `acknowledgedDuplicateOf` 再送 → `TicketCreated`；`duplicate_pairs` 一筆 `dup_ignored`、`engine_version='fast-v1'`；
  `dedup_audit_events` 有 `ignored_by_submitter`
- [x] 站點：同上一輪
- [x] 遠處、不同內容 → 直接 `TicketCreated`，沒有任何 dedup 列
- [x] 無 `ticket.add` 的帳號 → 403，回應不含 `DuplicateSuspected`
- [x] 批次匯入一個含重複列的檔 → 全部照常建立，沒有任何 dedup 列（ADR-299）
- [x] fail-open：暫時讓候選查詢失敗（例如 `ALTER TABLE base_geometries RENAME COLUMN geometry TO geometry_x` 前先
  確認建單路徑不讀它——**若會讀就改用 stub engine 拋錯的方式**）→ 建單成功、backend log 有 fail-open 訊息、無 `MissingGreenlet`
- [x] 查 audit／pair 的 JSON：不含任何送出的標題、描述原文（ADR-295）
- [x] `EXPLAIN` 候選查詢使用 `ix_base_geometries_geography`
- [x] 並發：20 個請求同時對同一地點建單，無 500、無外洩 SQL 的錯誤訊息

### 14.5 清理與回報

- [x] `docker compose -p dedup020verify -f <scratchpad compose> down -v`；手動起的容器 `docker rm -f`；`docker network rm dedup020verify_app-network`
- [x] 確認使用者原本的 `backend-db-1`、`backend-redis-1` 仍在跑、沒被重建
- [x] 把 14.1~14.4 的實際輸出（passed 數、SQL 查詢結果、HTTP 回應）整理成驗證報告，回報使用者。**不自行開 PR**

---

## Phase 2：engine 自己撈資料（ADR-304，2026-09-29）

取代原本的「任務層級」Phase 2 草案（ADR-300 的 `TaskSnapshot` 方案）。候選查詢與比對單位整個歸 engine；
後端只管三個觸發點、保護措施與寫入。前提：本分支已合進 #59 的新 head（`af2ca1d95`）。
完成條件同前：每個 Task 自己的測試（先紅後綠）＋全套件不比基準（1587）差；全部做完重跑 Docker 完整驗證。

## Task 16: contract 改為草稿／Suspect／async engine

**Files:** `app/dedup_engine/contract.py`、`tests/dedup_engine/test_contract_types.py`、`test_core_isolation.py`

- [x] `TicketDraft`、`TaskDraft`、`StationDraft`、`NewTicket`／`NewTask`／`NewStation`、`Suspect`、async `DedupEngine`（spec §2~§4）；`CONTRACT_VERSION = 2`
- [x] 移除 `TicketSnapshot`、`StationSnapshot`、`Candidate`、`Match`、`RetrievalSpec`
- [x] 隔離守衛改為：engine 可 import `sqlalchemy`、`geoalchemy2`、`app.models`；仍禁止 `app.services`、`app.graphql`、`app.api`、`app.repositories`
- [x] 測試：frozen、草稿必填欄位、草稿不含個資欄位（`contact_phone` 除外）

## Task 17: fast-v2（任務層級候選＋計分，搬進 engine）

**Files:** `app/dedup_engine/candidates.py`（新）、`fast.py`、`CHANGELOG.md`、`tests/dedup_engine/*`、golden

- [x] `candidates.py`：任務候選（019 條件：任務非 fulfilled／canceled、未刪；工單未刪、非 cancelled；距離取工單；`NewTask` 排除同單）、站點候選（019 條件）；由 `app/repositories/dedup_repository.py` 的 `nearby_open_rows` 移入並改寫
- [x] `fast.py`：`check` 對 `NewTicket` 的每個任務、`NewTask` 的任務、`NewStation` 各回最多一個 `Suspect`；`score` 算指定的一對；公式與參數不變（`measure`／`combine` 沿用）
- [x] `version = "fast-v2"`；CHANGELOG：比對單位改任務、候選查詢歸 engine
- [x] golden 改在測試 DB 上以固定資料產生；regen 腳本「輸出變了但沒升版就拒絕」的規則不變
- [x] 測試：Chi 的決定 1~3、completed／cancelled 工單、距離與 019 SQL 一致

## Task 18: contract test（DB 版）

**Files:** `tests/dedup_engine/test_contract.py`

- [x] spec §8 的 8 條，對 `FastEngine` 參數化；**唯讀**：呼叫前後 `pg_current_xact_id_if_assigned()` 皆為 NULL、`session.new／dirty／deleted` 皆空、SAVEPOINT rollback 後列數不變（只看 session 與列數抓不到 autoflush 後被 rollback 的寫入，實作時以突變測試確認）
- [x] 效能：500 筆鄰近候選（暫定 200 ms，待 Task 0）

## Task 19: 後端呼叫 engine 的保護措施

**Files:** `app/services/dedup.py`、`app/services/dedup_snapshot.py`、`app/repositories/dedup_repository.py`、`tests/test_dedup_engine_service.py`、`tests/test_dedup_snapshot.py`

- [x] `dedup_snapshot.py` 改為「驗證過的 input → 草稿」（電話 E.164 正規化，失敗給 None）
- [x] `check_submission(db, *, submission, acknowledged, actor, now)`：SAVEPOINT＋rollback、`wait_for(ENGINE_TIMEOUT_S=2)`、例外／逾時 fail-open 並 reload actor、丟掉種類不符與已確認草稿的結果；呼叫後 transaction id 從無變有 → 記 error、當作沒有疑似重複
- [x] `record_hint_shown(suspect)`、`record_acknowledged(draft_ref, created_uuid, related)`（用 `engine.score`）
- [x] ~~repository 移除候選查詢~~ → **延到 Task 23**：Phase 1 的 `find_match` 到 Task 21 前仍在用（2026-09-29 實作時調整）
- [x] ~~任務草稿（`task_draft`）~~ 移到 Task 20：它需要 Task 20 的 `TaskFields`
- [x] 測試：逾時、例外、會寫入的 stub 被 rollback、種類不符被丟、確認過濾、寫入不含送出原文

## Task 20: 任務的 validate／insert 拆分

**Files:** `app/services/ticket.py`、`tests/test_create_split.py`

- [x] `validate_ticket_task(...)`（不要求工單已存在，給新開單用）、`insert_ticket_task(db, *, actor, ticket_uuid, fields)`（flush 不 commit）
- [x] `create_ticket_task` 簽章與行為不變

## Task 21: 兩段式編排

**Files:** `app/services/dedup_submission.py`、`tests/test_dedup_submission_v2.py`

> **實作時調整（2026-09-29）**：新函式取名 `submit_new_ticket`／`submit_new_task`／`submit_new_station`，回傳
> `SubmissionCreated`／`SubmissionHeld`，與 Phase 1 的 `submit_ticket`／`submit_station` 並存到 Task 22 切換 GraphQL、
> Task 23 刪除舊的；任務以 `TaskSubmission`（含各自的 `acknowledged_duplicate_of`）傳入。

- [x] `submit_ticket(..., tasks, acknowledged)`：驗證全部 → `check_submission(NewTicket)` → 有疑似重複：各寫 `hint_shown`、回 `Suspected(suspects)`、零寫入；否則工單＋任務同一 transaction，確認的草稿各寫配對卡
- [x] `submit_ticket_task(..., ticket_uuid, draft, acknowledged_duplicate_of)`、`submit_station` 改走 `check_submission`
- [x] 測試：部分命中整筆不建；確認綁草稿（重排仍正確）；全放棄＝零寫入；atomic；無權限在比對前失敗；站點仍發通知

## Task 22: GraphQL

**Files:** `app/graphql/tickets/*`、`app/graphql/geo/*`、`app/graphql/shared.py`、`tests/test_graphql/*`

> **實作時調整（2026-09-29）**：通用的 `DuplicateSuspect`／`DuplicatesSuspected` 放在 `app/graphql/shared.py`（工單與站點共用，
> 避免 geo↔tickets 互相 import）；`createTicket` 的工單層確認改放在 `CreateTicketInput.acknowledgedDuplicateOf`（spec §5.1），
> 不再是 mutation 參數；GraphQL 測試的 stub 同時蓋掉 `_ENGINE` 與 `_SUBMISSION_ENGINE`。

- [x] 通用 `DuplicatesSuspected { suspects: [DuplicateSuspect] }`；`CreateTicketTaskDraft`、`CreateTicketInput.tasks`／`acknowledgedDuplicateOf`、`TicketCreated { ticket, tasks }`
- [x] `createTicketTask(input, acknowledgedDuplicateOf)` 回 `CreateTicketTaskResult`；`createStation` 改回通用型別
- [x] 既有 `createTicketTask` 測試改走 union；`test_create_dedup.py` 改為任務層級（真 engine）；SDL 守門更新

## Task 23: 收尾

- [x] 移除 Phase 1 殘留（快照型別、`SnapshotEngine`、`fast.py` 的 v1 engine（`measure`／`combine` 等公式保留）、`registry.get_engine`、`dedup_repository` 的候選查詢、`dedup_snapshot` 的快照 builder、Phase 1 service 函式、`DuplicateStationSuspected`、v1 golden 與 `scripts/regen_dedup_golden.py`）；`fast_v2.py` 併回 `fast.py`、`get_submission_engine` 改名 `get_engine`；legacy 守門補上
- [x] 改寫「交給前端的 API 變更」為最終版本
- [x] ruff、全套件、覆蓋率

## Task 24: Docker 完整驗證（重跑 Task 14，情境改為任務層級）

環境作法同 Task 14（獨立 stack、scratchpad compose、不動 `backend-db-1`／`backend-redis-1`）。
比對單位從工單改為任務：工單本身不比對，疑似重複的 `relatedKind` 是 `ticket_task` 或 `station`，
配對卡與 audit 的 `entity_kind` 相同，`engine_version='fast-v2'`。

### 24.1 本機收尾

- [ ] `uv run pytest tests -q`：不比 Task 23 的 1610 passed 少，0 failed
- [ ] `COVERAGE_CORE=sysmon uv run pytest --cov=app/dedup_engine --cov=app/services/dedup --cov=app/services/dedup_submission --cov=app/services/dedup_snapshot tests -q`：≥ 80%
- [ ] `uv run alembic heads` 單一 head
- [ ] `ruff==0.11.0 check` 與 `ruff format --check` 在本票改動的檔案上乾淨

### 24.2 從零建立

- [ ] `DOCKER_BUILDKIT=0 docker build -t dedup020-backend:verify2 .`（tag 與 Phase 1 分開，避免誤用舊 image）
- [ ] `-p dedup020verify2` ＋ scratchpad compose 起 db（`disaster-postgres-h3:16-3.4`）、redis、backend（`image:`，不用 `build:`；對外 port 用 8011）
- [ ] 全新 volume：`alembic upgrade head` 乾淨；`downgrade -1` → `upgrade head` 再走一次
- [ ] seed：`docker exec -e PYTHONPATH=/app <backend> python scripts/seed_rbac.py`

### 24.3 容器裡跑全套件

- [ ] backend 容器內對 stack 的 db 跑 `pytest tests -q`，結果與 24.1 一致；不一致先比 `pip freeze`（image 不吃 `uv.lock`）
- [ ] `TEST_REDIS_URL` 指向 stack 自己的 redis，不碰 host 的 6379（enerlyzer 的）

### 24.4 實際打 API

作法同 14.4：`docker cp` 腳本進 backend 容器、`docker exec` 打 `localhost:8000`，帳號以 ORM 腳本直接建。
每一條都記下 HTTP 回應與相關表的查詢結果（`tickets`、`ticket_tasks`、`stations`、`duplicate_pairs`、`dedup_audit_events` 的列數差）。

**新開單（`createTicket` ＋ `tasks`）**

- [ ] 先建工單 A 含任務 a1。在旁邊送工單 B，含兩個任務：b0 與 a1 內容相同、b1 內容無關
  → `DuplicatesSuspected`，只有一個 suspect：`draftRef="task:0"`、`relatedKind="ticket_task"`、`relatedUuid`=a1、`relatedTicketUuid`=A；
  DB 沒有新工單與新任務；`hint_shown` 一筆（`entity_kind='ticket_task'`）
- [ ] 同一份 input 在 b0 填 `acknowledgedDuplicateOf`=a1 再送 → `TicketCreated`，`tasks` 有兩個；
  `duplicate_pairs` 一筆（`entity_kind='ticket_task'`、`dup_ignored`、`engine_version='fast-v2'`）；audit 有 `ignored_by_submitter`
- [ ] 確認綁草稿：第二次送出時把 b0、b1 的順序對調（確認仍掛在 b0 上）→ 照樣建立，配對卡對到 b0 建出的任務
- [ ] 放棄單一任務：第二次送出拿掉 b0 → 只建工單＋b1，無配對卡
- [ ] 工單不含任務（`tasks=[]`）→ 直接 `TicketCreated`，無 dedup 列（engine 不比工單本身）

**替既有的單加任務（`createTicketTask`）**

- [ ] 對另一張單 C 加一個與 a1 相同的任務 → `DuplicatesSuspected`（`draftRef="task:0"`、`relatedUuid`=a1），無新任務
- [ ] 帶 `acknowledgedDuplicateOf`=a1 再送 → `TicketTaskCreated`，有配對卡
- [ ] 對工單 A 自己再加一個與 a1 相同的任務 → 直接建立（同一張單的任務不算重複）

**候選條件（019）**

- [ ] a1 改成 fulfilled／canceled，或工單 A 改成 cancelled／軟刪 → 同內容送出不再命中
- [ ] 工單 A 為 completed、任務仍開著 → 仍會命中（候選條件只排除 cancelled 工單）

**站點（`createStation`）**

- [ ] 同 14.4 站點一輪：`DuplicatesSuspected`（`draftRef="station"`、`relatedKind="station"`）→ 確認後 `StationCreated`、配對卡 `entity_kind='station'`、有發 `resource_station_updated` 通知

**權限、批次、fail-open、個資**

- [ ] 無 `ticket.add` 的帳號 → 403，回應不含 `DuplicatesSuspected`；`createTicketTask` 無權限同樣如此
- [ ] 批次匯入（工單、站點各一個含重複列的檔）→ 全部照常建立，無任何 dedup 列（ADR-299）
- [ ] fail-open（例外）：以 stub engine 在 `check` 拋錯 → 照常建立、log 有 fail-open 訊息、無 `MissingGreenlet`
- [ ] fail-open（逾時）：stub engine `check` 睡超過 `ENGINE_TIMEOUT_S` → 約 2 秒後照常建立
- [ ] engine 寫入防護：stub engine 在 `check` 裡 insert 一列 → 該列不存在（SAVEPOINT rollback）、log 有 error、照常建立
- [ ] 查 audit／pair 的 JSON：不含任何送出的標題、任務名稱、描述原文（ADR-295，用 MARK 字串驗）

stub engine 的三條：用環境變數或啟動腳本在容器內替換 `registry._ENGINE` 後起一個獨立的 uvicorn（port 8002），不改 image、不進 repo。

**效能與並發**

- [ ] `EXPLAIN ANALYZE` 任務候選查詢（`open_tasks_near`）與站點候選查詢：都使用 `ix_base_geometries_geography`
- [ ] 灌 500 筆鄰近開放任務，量 `createTicket`（含 1 個任務）的回應時間，記錄數字（門檻待 Task 0，這裡只記錄不判定）
- [ ] 並發：20 個請求同時對同一地點建單（各含任務），無 500、無外洩 SQL 的錯誤訊息

### 24.5 清理與回報

- [ ] `docker compose -p dedup020verify2 -f <scratchpad compose> down -v`；手動起的容器 `docker rm -f`；刪 `dedup020verify2_app-network`；刪 image `dedup020-backend:verify2`
- [ ] 確認 `backend-db-1`、`backend-redis-1` 仍在跑、沒被重建
- [ ] 改寫 `Backend/DEDUP_ENGINE_020_VERIFICATION.md` 為 Phase 2 版（24.1~24.4 的實際輸出：passed 數、SQL 查詢結果、HTTP 回應、效能數字），回報使用者。**不自行開 PR**

## 交給前端的 API 變更（後端不負責實作）

前端改動由前端負責，後端只提供合約。以下是本票（Phase 2 完成後的最終版）對 GraphQL 的變更，供前端與 #47 作者調整。

**移除**：`ticketDedupCandidates`、`stationDedupCandidates`、`recordDedupHintOutcome`，以及 `TicketDedupHint`、
`StationDedupHint`、`DedupScoreComponent`、`DedupEntityKind`、`DedupHintOutcome`。不需要前端自己查重或回報結果。

**共同的疑似重複型別**（三個建立 mutation 都用它）：

```graphql
type DuplicatesSuspected { suspects: [DuplicateSuspect!]! }
type DuplicateSuspect {
  draftRef: String!          # 送出的哪一部分："ticket"、"task:0"、"task:1"…、"station"
  relatedKind: String!       # 它像哪一種既有的東西："ticket"、"ticket_task"、"station"
  relatedUuid: String!       # 那個既有的東西
  relatedTicketUuid: String  # 像的是任務時，那個任務所屬的工單（顯示用）
}
```

**新開單：`createTicket` 連同任務一起送**

```graphql
createTicket(input: CreateTicketInput!): CreateTicketResult!   # TicketCreated | DuplicatesSuspected
# CreateTicketInput 新增：
#   tasks: [CreateTicketTaskDraft!]! = []
#   acknowledgedDuplicateOf: String = null      # 工單本身的確認（目前 engine 不比工單，通常不用）
# CreateTicketTaskDraft：taskType、taskName、taskDescription、quantity、source、visibility、routeUuid、
#   acknowledgedDuplicateOf（這個任務的確認）
type TicketCreated { ticket: TicketType!  tasks: [TicketTaskType!]! }
```

- 第一次送出：任一部分疑似重複 → `DuplicatesSuspected`，**工單與任務都沒有建立**。
- 使用者看過後：
  - **照樣建立**：同一份 input 再送一次，在那個任務草稿上填 `acknowledgedDuplicateOf = relatedUuid`；該任務不再被檢查，後端記錄配對。
  - **放棄某個任務（去看舊的）**：第二次送出時拿掉那個草稿即可，不需要呼叫任何 API。
  - **全部放棄**：不再送出，什麼都沒建立。
- 確認綁在各自的任務草稿上，草稿順序變了也沒關係；`draftRef` 只用來對應「這一次」回應是哪個草稿。
- 沒有疑似重複：第一次就建好，工單與所有任務一起出現。

**替既有的單加任務：`createTicketTask` 也是兩段式**

```graphql
createTicketTask(input: CreateTicketTaskInput!, acknowledgedDuplicateOf: String = null): CreateTicketTaskResult!
# TicketTaskCreated { task } | DuplicatesSuspected（draftRef 固定 "task:0"）
```

同一張單自己的任務不會被當成疑似重複。

**登記站點：`createStation`**

`createStation(input, acknowledgedDuplicateOf)` 回 `StationCreated { station }` 或 `DuplicatesSuspected`（`draftRef` 為 `"station"`）。
Phase 1 的 `DuplicateStationSuspected` 已移除。

**錯誤行為不變**：權限不足、輸入錯誤仍在 `errors` 裡、`data` 為 null（此時不會透露任何疑似重複）；去重本身出錯或逾時，
後端照常建立，前端不會看到差別。
