# 020 去重引擎介面 — Implementation Plan

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

- [ ] **開工前記基準**：`uv run pytest tests -q` 的 passed／failed／error 數寫進 PR 描述草稿，後面每個 Task 都對照它
- [ ] **RED**：`test_core_isolation.py`，掃 `app/dedup_engine/**/*.py` 的 import，禁止清單出現就失敗

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

- [ ] **GREEN**：寫 `contract.py`（內容即 spec §3、§4，下面是完整檔案）

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

- [ ] **RED → GREEN**：`test_contract_types.py`
  - [ ] 所有快照與 `Candidate`、`Match`、`RetrievalSpec` 都是 frozen（賦值拋 `FrozenInstanceError`）
  - [ ] 快照除必填欄位外全部有預設值（ADR-289 第 4 點「只加不改」的前提）：用 `dataclasses.fields` 檢查
  - [ ] 快照欄位不含 `contact_*`、`review_note`、`visibility`、`team_uuid`、`updated_by`、`search_text`
  - [ ] `FastEngine`（Task 3 之後）滿足 `DedupEngine` Protocol：先寫成 `@pytest.mark.skip(reason="Task 3")`，Task 3 拿掉
- [ ] `uv run pytest tests/dedup_engine -q` 綠

---

## Task 2: 文字相似度（Python，與 pg_trgm 對齊）

**Files:** Create `app/dedup_engine/text.py`, `tests/dedup_engine/test_text.py`, `tests/test_dedup_trgm_parity.py`

目標：fast-v1 的文字分數與 019 在 SQL 算的 **完全相同**，這樣「門檻要重跑回測」（ADR-288）的風險就縮到只剩欄位串接方式。

- [ ] **RED**：`test_text.py` 單元測試

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

- [ ] **RED**：`test_dedup_trgm_parity.py`（真 DB）：同一組字串，Python 與 `SELECT similarity(a, b)` 差距 < 1e-6

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

- [ ] **GREEN**：`text.py`

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

- [ ] parity 測試若有任何一組不等：**先查 pg_trgm 的斷詞規則（`t_isalnum` 依 DB locale），修 Python 端**，
  不要放寬容差。真的對不齊的案例寫進 `CHANGELOG.md` 的 fast-v1 條目

---

## Task 3: fast engine（由 `dedup_scoring.py` 搬入）

**Files:** Create `app/dedup_engine/fast.py`, `app/dedup_engine/registry.py`, `tests/dedup_engine/test_fast.py`；
Delete `app/services/dedup_scoring.py`, `tests/test_dedup_scoring.py`（內容搬進 `test_fast.py`）

- [ ] **RED**：把 `tests/test_dedup_scoring.py` 每一條改寫成吃快照的版本放進 `test_fast.py`。測試輔助：

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
  - [ ] 站點沒有 `time` 成分（`STATION_PARAMETERS.time_weight == 0`）
  - [ ] 任一邊文字為空 → 沒有 `text` 成分（不是 0 分）
  - [ ] `evidence` 裡不含 `title` / `description` 原文
  - [ ] `retrieval("ticket").radius_m == pytest.approx(147.4 * 1.1, abs=0.1)`；`retrieval("station")` ≈ 124.3 × 1.1

- [ ] **GREEN**：`fast.py`

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

- [ ] `registry.py`：後端取 engine 的唯一入口，測試用 monkeypatch 換掉

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

- [ ] **RED → GREEN**：`test_contract.py`，逐條對應 spec §8（1~9），對 `ENGINES = [FastEngine()]` 參數化

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

- [ ] `golden_cases.py`：約 20 組固定輸入（019 的 fixture 情境＋站點＋邊界：剛好在半徑上、文字為空、類別缺一邊）
- [ ] `scripts/regen_dedup_golden.py`：算出所有案例的 `rank` 與 `score` 結果寫進 `golden/fast.json`

```python
# 要點：輸出改了但版本號沒變 → 拒絕寫入。更新 golden 的唯一途徑是先升版（ADR-297）。
old = json.loads(GOLDEN.read_text()) if GOLDEN.exists() else None
new = {"version": engine.version, "cases": compute(engine)}
if old and old["version"] == new["version"] and old["cases"] != new["cases"]:
    sys.exit(f"outputs changed but version is still {engine.version}: bump FastEngine.version first")
GOLDEN.write_text(json.dumps(new, ensure_ascii=False, indent=2, sort_keys=True))
```

- [ ] golden 測試（spec §8 第 10 條）

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
- [ ] `CHANGELOG.md` 寫 fast-v1：參數表（照 019 spec §3）、與 019 的兩處差異、回測結果欄位先留「待 Chi 補」
- [ ] 跑一次 regen 產生第一份 golden，commit

---

## Task 5: Schema（改 #46 的 migration）

**Files:** Modify `app/models/dedup.py`, `alembic/versions/d4c8b1e07a92_dedup_fast_layer_tables.py`

- [ ] `AUDIT_EVENT_TYPES` 加 `"hint_shown"`
- [ ] `DuplicatePair.score_components` → `evidence: Mapped[dict | None]`（JSONB，comment：「engine 的 evidence，內容由 engine 版本決定」）
- [ ] `DuplicatePair.engine_version: Mapped[str] = mapped_column(Text)`（NOT NULL）
- [ ] `DedupAuditEvent.engine_version: Mapped[str | None] = mapped_column(Text, nullable=True)`
- [ ] migration 同步改：`sa.Column("evidence", ...)`、兩個 `engine_version` 欄、`ck_dedup_audit_events_type` 的值清單
- [ ] `uv run pytest tests/test_migrations_match_models.py -q` 綠
- [ ] `uv run alembic heads` 只有 `d4c8b1e07a92`
- [ ] 在全新 DB 上 `alembic upgrade head` → `downgrade -1` → `upgrade head` 都成功
- [ ] **RED → GREEN**：`tests/test_dedup_schema.py`（真 DB）
  - [ ] `duplicate_pairs` 不帶 `engine_version` 寫入 → `IntegrityError`（NOT NULL）
  - [ ] `dedup_audit_events` 寫 `event_type="hint_shown"` 成功；寫不在清單的值 → CHECK 失敗
  - [ ] `evidence` 存巢狀 dict 讀回相等（JSONB round-trip）
  - [ ] 表上已不存在 `score_components` 欄（查 `information_schema.columns`）

---

## Task 6: 拆 `create_ticket` / `create_station`（純重構，ADR-299）

**Files:** Modify `app/services/ticket.py`, `app/services/station.py`

- [ ] `ticket.py` 新增

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
- [ ] `station.py` 比照：`StationFields`、`validate_station`、`insert_station`、`create_station`
- [ ] **RED → GREEN**：`tests/test_create_split.py`（真 DB），ticket／station 各一組
  - [ ] `validate_*` 對無權限、非法 geometry、未知 `disaster_types`、過長聯絡欄位各自拋錯，**且 DB 無任何新列**
  - [ ] `validate_*` 成功時也**不寫任何列**
  - [ ] `insert_*` 之後 `rollback` → 單與地址都不存在（證明它不 commit）
  - [ ] `create_*` 的結果與拆分前逐欄相同（聯絡欄位是正規化後的值、`status="pending"`、地址有寫入）
  - [ ] `create_*` 的簽章沒變：`inspect.signature` 的參數名稱清單與拆分前相同（批次匯入靠它）
- [ ] **全套件**：`uv run pytest tests -q`，結果必須與分支起點相同（記下起點的 passed 數當基準）。
  特別看 `test_bulk_import_*`、`test_graphql/test_mutations.py`

---

## Task 7: snapshot builder

**Files:** Create `app/services/dedup_snapshot.py`, `tests/test_dedup_snapshot.py`

- [ ] **RED**：
  - [ ] 同一張工單，`ticket_submission(fields, now)` 與寫入後 `ticket_snapshot(row)` 的欄位除 `uuid`／`status`／`created_at` 外全相等
  - [ ] `dataclasses.fields(TicketSnapshot)` 不含任何 `contact_*`、`review_note`、`visibility`、`team_uuid`、`updated_by`、`search_text`
  - [ ] `same_contact_phone("0912-345-678", "+886912345678") is True`；`("0912345678", None) is None`；`("abc", "0912345678") is None`；不同號碼 `is False`
  - [ ] 站點 row 的 geometry 若不是 Point：取 centroid（防呆，ADR-298）
- [ ] **GREEN**：

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

- [ ] `list_nearby_open(db, *, kind, longitude, latitude, radius_m, now) -> list[tuple[Model, float]]`：
  移除 `query_text` 參數、`func.similarity`、`_to_candidate`、`has_text`、`age_min`
- [ ] `get_with_distance(db, *, kind, uuid, longitude, latitude) -> tuple[Model, float] | None`：
  取代 `get_candidate_features`，不套半徑與未結案過濾，**要套軟刪過濾**（spec §5 確認後送出第 4 點）
- [ ] `DedupEntity` 拿掉 `text_fields`、`type_field`、`texts()`、`type_of()`；保留 `model`、`use_centroid`、`open_filters`、`geometry()`
- [ ] 不再 import `app.services.dedup_scoring`
- [ ] 測試（真 DB，沿用 `test_graphql/test_dedup.py` 的 `_seed_ticket`，搬到 `tests/test_dedup_repository.py`）：
  - [ ] 半徑外、`completed`／`cancelled`、軟刪的不出現
  - [ ] 過期臨時站點、`permanently_closed` 站點不出現
  - [ ] 回傳距離與 `ST_Distance` 一致（±0.5 m）

---

## Task 9: dedup service

**Files:** Rewrite `app/services/dedup.py`, `tests/test_dedup_service.py`

公開兩個函式，其餘全刪（`find_duplicate_hints`、`record_hint_outcome`、`_KINDS`、`_rescore_pair`、`_evidence`、`_components_json`）。

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

- [ ] 用 stub engine（monkeypatch `registry._ENGINE`）驗證：半徑超過 1000 被截斷並記 warning
- [ ] engine `rank` 拋錯 → `find_match` 回 None、rollback 有被呼叫
- [ ] **真 DB**：engine 拋錯後，同一個 session 接著讀 `actor.uuid` 不拋 `MissingGreenlet`（已知陷阱 1）
- [ ] `record_acknowledged`：目標已軟刪 → None、無卡；`score` 拋錯 → 卡的 `similarity`／`evidence` 為 null
- [ ] 寫入的 audit / pair 的 JSON 內不含送出快照的標題、描述原文（ADR-295；用 MARK 字串驗）

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

- `submit_station` 比照（`validate_station` / `insert_station` / `station_submission`）
- 確認後送出**不跑 `find_match`**（ADR-296）

測試（真 DB，stub engine 控制命中與否）：

- [ ] 命中：不建單、`hint_shown` 一筆、回 `Suspected`
- [ ] 未命中：建單、無 audit、回 `Created`
- [ ] 確認後送出：建單＋配對卡＋`ignored_by_submitter` 同時存在；engine 的 `rank` 沒被呼叫
- [ ] **atomic**：讓 `record_acknowledged` 在寫卡後拋錯 → 單、卡、audit 全都不存在
- [ ] 驗證失敗（無 `ticket.add`、非法 geometry、未知 `disaster_types`）→ 在跑 dedup 之前就失敗，無任何 audit
- [ ] engine 拋錯 → 照常建單（fail-open，走真 DB，順便覆蓋陷阱 1）
- [ ] 確認的 uuid 不存在 → 照常建單、無卡
- [ ] 站點：上面前三條各一條

---

## Task 11: GraphQL

**Files:** Modify `app/graphql/tickets/types.py`, `app/graphql/tickets/mutations.py`, `app/graphql/geo/types.py`,
`app/graphql/geo/mutations.py`, `app/graphql/schema.py`；Delete `app/graphql/dedup/`

- [ ] 型別

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
- [ ] resolver：多一個參數 `acknowledged_duplicate_of: str | None = None`，改呼叫 `submit_ticket`，依回傳型別組 union。
  docstring 寫清楚兩段式（前端靠這段理解流程）
- [ ] `schema.py` 移除 `DedupQuery`、`DedupMutation`；刪 `app/graphql/dedup/`
- [ ] SDL 檢查：`print_schema` 裡不再有 `ticketDedupCandidates`、`stationDedupCandidates`、`recordDedupHintOutcome`、
  `DedupScoreComponent`、`TicketDedupHint`、`StationDedupHint`、`DedupEntityKind`、`DedupHintOutcome`
- [ ] 新測試 `tests/test_graphql/test_create_dedup.py`（取代 `test_dedup.py`、`test_dedup_station.py`）：
  - [ ] 真 engine、真 DB：在既有單旁送出同文字 → `__typename == "DuplicateSuspected"`、`relatedTicketUuid` 正確
  - [ ] 帶 `acknowledgedDuplicateOf` 再送 → `TicketCreated`，DB 有配對卡
  - [ ] 遠處、不同內容 → 直接 `TicketCreated`
  - [ ] 無權限 → 403，**不透露**是否有疑似重複（回應裡沒有 `DuplicateSuspected`）
  - [ ] 站點同上三條

---

## Task 12: 既有測試改用 union

**Files:** `tests/test_graphql/test_mutations.py`（18）、`test_suggestions.py`（10）、`test_query_rbac.py`（6）、
`test_edge_cases.py`（5）、`test_station_photo.py`（4）、`test_error_masking.py`（4）、`test_ticket_disaster_fields.py`（3）、
`test_delete_review.py`（2）、`tests/test_notifications_db_integration.py`（1）

- [ ] 查詢改成 `createTicket(input: $input) { __typename ... on TicketCreated { ticket { <原本的欄位> } } }`；
  斷言改讀 `data.createTicket.ticket`
- [ ] 這些測試的 fixture 可能在同一地點連建多張相似的單，會意外觸發 `DuplicateSuspected`。
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
- [ ] **RED → GREEN**：`tests/test_graphql/test_dedup_stub_fixture.py`
  - [ ] 沒標 marker 的測試裡 `get_engine().version == "stub-v1"`
  - [ ] 標了 `@pytest.mark.real_dedup` 的測試裡 `get_engine().version == "fast-v1"`（確保 `test_create_dedup.py` 不會默默測到 stub）
- [ ] 錯誤路徑測試（`test_error_masking.py`、`test_edge_cases.py`）：錯誤仍在 `errors`，`data.createTicket` 為 null，行為不變

---

## Task 13: 收尾

- [ ] 刪 `tests/test_graphql/test_dedup.py`、`tests/test_graphql/test_dedup_station.py`（內容已由 Task 8、11 取代）
- [ ] `Spec/019-dedup-fast-layer/spec.md` 開頭加註：§1 GraphQL、§3 計分位置、§4 的 GraphQL 已被 Spec 020 取代
- [ ] `grep -rn "dedup_scoring\|find_duplicate_hints\|record_hint_outcome\|score_components" app tests` 為零
- [ ] `ruff==0.11.0 check` 與 `ruff format --check` 在本票改動的檔案上乾淨
- [ ] **RED → GREEN**：`tests/test_dedup_legacy_removed.py`
  - [ ] `import app.services.dedup_scoring` 與 `import app.graphql.dedup` 都拋 `ModuleNotFoundError`
  - [ ] `print_schema(schema)` 不含 Task 11 列出的舊型別與舊欄位名稱
  - [ ] `app.services.dedup` 沒有 `find_duplicate_hints`、`record_hint_outcome` 屬性

---

## Task 14: Docker 完整驗證（整張票的完成條件）

在不動使用者現有 `backend-db-1` / `backend-redis-1` 的前提下，起一套獨立的 stack。
compose 檔、腳本都放 scratchpad，不進 repo。

### 14.1 本機收尾

- [ ] `uv run pytest tests -q`：與基準相比只多不少，無新紅燈
- [ ] `COVERAGE_CORE=sysmon uv run pytest --cov=app/dedup_engine --cov=app/services/dedup --cov=app/services/dedup_submission --cov=app/services/dedup_snapshot tests -q`：≥ 80%
- [ ] `uv run alembic heads` 單一 head

### 14.2 從零建立

- [ ] 建 image（`compose up --build` 會卡在 buildx，一律用這個）：
  `DOCKER_BUILDKIT=0 docker build -t dedup020-backend:verify .`
- [ ] 用 `-p dedup020verify` ＋ scratchpad 的 compose 檔起 db、redis、backend：
  - db 用 `disaster-postgres-h3:16-3.4`（`b3e8d1f4a6c2` 需要 h3）
  - backend 用 `image: dedup020-backend:verify`，不用 `build:`
  - db／redis 不對外開 port；backend 若要開，避開 8000／8001（常被佔），用 8011
- [ ] 全新 volume：`alembic upgrade head` 乾淨；`alembic downgrade -1` → `upgrade head` 再走一次
- [ ] seed：`docker exec -e PYTHONPATH=/app <backend> python scripts/seed_rbac.py`

### 14.3 容器裡跑全套件

- [ ] 在 backend 容器內對 stack 的 db 跑 `pytest tests -q`（`TEST_DB_URL` 指向容器網路內的 db），結果與 14.1 一致
- [ ] 注意：image 用 `uv pip install .`，不吃 `uv.lock`，套件版本可能與本機不同。兩邊結果不一致時先比 `pip freeze`

### 14.4 實際打 API

sandbox 從 host 打 published port 會失敗，一律 `docker cp` 腳本進 backend 容器、`docker exec <backend> python /tmp/x.py`
打 `localhost:8000`（image 內有 httpx）。測試帳號用 ORM 腳本直接建（比走註冊快）。

- [ ] 求助單：建一張 → 在旁邊送同內容 → `DuplicateSuspected`（`relatedTicketUuid` 正確、DB 沒有新單、有 `hint_shown`）
  → 帶 `acknowledgedDuplicateOf` 再送 → `TicketCreated`；`duplicate_pairs` 一筆 `dup_ignored`、`engine_version='fast-v1'`；
  `dedup_audit_events` 有 `ignored_by_submitter`
- [ ] 站點：同上一輪
- [ ] 遠處、不同內容 → 直接 `TicketCreated`，沒有任何 dedup 列
- [ ] 無 `ticket.add` 的帳號 → 403，回應不含 `DuplicateSuspected`
- [ ] 批次匯入一個含重複列的檔 → 全部照常建立，沒有任何 dedup 列（ADR-299）
- [ ] fail-open：暫時讓候選查詢失敗（例如 `ALTER TABLE base_geometries RENAME COLUMN geometry TO geometry_x` 前先
  確認建單路徑不讀它——**若會讀就改用 stub engine 拋錯的方式**）→ 建單成功、backend log 有 fail-open 訊息、無 `MissingGreenlet`
- [ ] 查 audit／pair 的 JSON：不含任何送出的標題、描述原文（ADR-295）
- [ ] `EXPLAIN` 候選查詢使用 `ix_base_geometries_geography`
- [ ] 並發：20 個請求同時對同一地點建單，無 500、無外洩 SQL 的錯誤訊息

### 14.5 清理與回報

- [ ] `docker compose -p dedup020verify -f <scratchpad compose> down -v`；手動起的容器 `docker rm -f`；`docker network rm dedup020verify_app-network`
- [ ] 確認使用者原本的 `backend-db-1`、`backend-redis-1` 仍在跑、沒被重建
- [ ] 把 14.1~14.4 的實際輸出（passed 數、SQL 查詢結果、HTTP 回應）整理成驗證報告，回報使用者。**不自行開 PR**

---

## Task 15: 前端跟進（#47，不在本分支）

- [ ] `tickets.graphql` 的 `CreateTicket`、`geo.graphql` 的 `CreateStation` 改成 union 選取
- [ ] `useDedupSubmitFlow`：拿掉 `findDuplicateCandidate` 與 `recordOutcome`；第一次送出依 `__typename` 進 `hint` 或 `done`，
  「照樣建立」帶 `acknowledgedDuplicateOf` 再送一次
- [ ] 刪 `dedup/dedup-check.ts`、`dedup/record-outcome.ts`、`tickets/dedup.graphql`
- [ ] `station-create-drawer.tsx` 比照（019 沒有做站點 UI，這是新增）
- [ ] 重新匯出 SDL、`pnpm codegen`
- [ ] 測試：`useDedupSubmitFlow` 的狀態轉移單元測試（`TicketCreated` → done；`DuplicateSuspected` → hint；
  「照樣建立」送出時帶 `acknowledgedDuplicateOf`；網路錯誤 → error）；`nx run-many -t build`、`lint` 不比 main 差
