# 島嶼守望：後端（Backend）

FastAPI + Strawberry GraphQL + SQLAlchemy（async、asyncpg）+ PostgreSQL（PostGIS + H3）+ Redis，使用 **Python 3.13**。

> 動手修改後端程式碼或新增測試前，請務必閱讀 **[`Backend/CLAUDE.md`](CLAUDE.md)** 與根目錄 **[`CLAUDE.md`](../CLAUDE.md)**。

---

## 目錄

1. [事前準備](#事前準備)
2. [快速開始](#快速開始)
3. [兩種執行方式](#兩種執行方式)
4. [環境變數與本機注意事項](#環境變數與本機注意事項)
5. [Port 對照表](#port-對照表)
6. [資料庫、Migration 與種子資料](#資料庫migration-與種子資料)
7. [確認服務正常](#確認服務正常)
8. [給前端的資訊](#給前端的資訊)
9. [測試](#測試)
10. [程式碼品質與 CI](#程式碼品質與-ci)
11. [專案結構](#專案結構)
12. [疑難排解](#疑難排解)

---

## 事前準備

| 工具 | 用途 |
| :--- | :--- |
| **Docker Desktop** | 執行 PostgreSQL（含 PostGIS 與 H3 擴充套件）、Redis，以及容器版熱重載後端 |
| **Python 3.13 + [`uv`](https://docs.astral.sh/uv/)** | 在本機執行 `pytest` 測試套件、執行 `ruff` 檢查、匯出前端 GraphQL/OpenAPI schema |

---

## 快速開始

你可以直接在**專案根目錄**執行 `pnpm setup` 一鍵完成所有設定；若只想單獨操作後端，請在 `Backend/` 目錄執行：

```bash
cd Backend
cp -n .env.example .env
docker compose up -d --wait

# 1. 套用資料庫 Migration
docker compose exec backend alembic upgrade head

# 2. 建立 RBAC 角色權限與開發測試假資料（兩個災害情境與測試帳號）
docker compose exec backend python -m scripts.seed_rbac
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/seed_mock_scenarios.sql
```

完成後打開 <http://localhost:8000/docs>，看得到 Swagger API 文件就代表成功。

---

## 兩種執行方式

| 方式 | 適合情境 | 指令 |
| :--- | :--- | :--- |
| **A. 全部跑在 Docker（預設推薦）** | 日常前後端開發。`docker-compose.yml` 已掛載 `.:/app` 並開啟 `uvicorn --reload`，本機改 `.py` 檔容器內會自動熱重載 | `docker compose up -d` |
| **B. 只把 DB/Redis 放 Docker，後端跑在本機 `.venv`** | 需要在本機 IDE 掛載 Python debugger 逐步除錯時 | 見下方 |

**方式 B（本機直接跑 Uvicorn）：**

```bash
docker compose stop backend          # 先停掉容器版後端，避免搶 port 8000
docker compose up -d db redis        # 確保資料庫和 Redis 在跑
uv sync                              # 安裝 Python 套件與 dev 依賴至 .venv
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 環境變數與本機注意事項

設定檔位於 `Backend/.env`（由 [`app/core/config.py`](app/core/config.py) 的 `SettingsConfigDict(env_file=".env")` 讀取，**檔名必須是 `.env`，不可命名為 `.env.local`**）。

| 變數 | 說明 | 本機 `.env.example` 預設值 |
| :--- | :--- | :--- |
| `SQLALCHEMY_DATABASE_URL` | PostgreSQL 連線字串（Docker 容器內由 `docker-compose.yml` 自動覆寫為 `@db:5432`） | `postgresql+asyncpg://postgres:postgres@localhost:5432/postgres` |
| `REDIS_URL` | Redis 連線字串（Docker 容器內自動覆寫為 `redis://redis:6379`） | `redis://localhost:6379` |
| `SECRET_KEY` | JWT 簽章密鑰（本機任意字串皆可，勿使用雲端正式密鑰） | `your-secret-key-for-local-dev` |
| `AUTH_COOKIE_PREFIX` | 登入 Cookie 名稱前綴（產生 `wgdev_at`、`wgdev_rt`），**必須與前端 `.env.local` 一致** | `wgdev` |
| `AUTH_COOKIE_SECURE` | 是否限定 HTTPS 傳送 Cookie。程式碼預設為 `True`，**本機 HTTP 開發必須在 `.env` 設為 `false`** | `false` |
| `AUTH_ALLOWED_ORIGINS` | 允許帶 Cookie 寫入請求的前端來源清單（逗號分隔） | `http://localhost:3000,http://localhost:3001` |
| `EMAIL_PROVIDER` / `SMS_PROVIDER` | 信件與簡訊驗證碼發送方式。`console` 會直接把 6 位數驗證碼印在後端 log | `console` |
| `SITE_APP_URL` / `ADMIN_APP_URL` | 前台與後台的完整網址 | `http://localhost:3000` / `http://localhost:3001` |
| `GOOGLE_CLIENT_SECRET` / `LINE_CHANNEL_SECRET` | OAuth 登入密鑰（選填，留空時僅停用第三方登入，不影響 Email/密碼登入） | 空白 |
| `TGOS_*` | 內政部 TGOS 門牌定位金鑰（綁定 Staging 固定 IP，本機留空即可） | 空白 |

> 💡 **為什麼完全不需要 GCP 權限也能在本機開發？**
> 簡訊王（KotSMS）與 TGOS 門牌 API 在雲端有綁定 Staging VM 固定 IP 白名單，因此本機一律使用 `EMAIL_PROVIDER=console` 與 `SMS_PROVIDER=console`，註冊或綁定手機時的驗證碼直接執行 `docker compose logs -f backend` 即可看到。

---

## Port 對照表

| 服務 | Port | 備註 |
| :--- | :--- | :--- |
| **FastAPI（REST + GraphQL）** | `8000` | Swagger：`/docs`｜GraphQL：`/graphql` |
| **PostgreSQL + PostGIS + H3** | `5432` | 開發用 DB：`postgres`；測試自動建立 `disaster_rescue_test*` |
| **Redis** | `6379` | 開發用 db `0`；測試用 db `15` 往下遞減 |

> ⚠️ 若你的電腦本機已安裝並啟動了 Homebrew 的 PostgreSQL 或 Redis，會與 Docker 搶用 `5432` / `6379`。請先停止本機服務（例如 `brew services stop postgresql redis`）。

---

## 資料庫、Migration 與種子資料

```bash
# 套用最新 migration
docker compose exec backend alembic upgrade head

# 修改 app/models/ 後，產生新的 migration
docker compose exec backend alembic revision --autogenerate -m "describe change"

# 檢查是否有多個 Alembic head（CI 也會檢查）
docker compose exec backend alembic heads

# 重新灌入 RBAC 角色權限與測試情境假資料（可重複執行，具備 idempotent 特性）
docker compose exec backend python -m scripts.seed_rbac
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/seed_mock_scenarios.sql

# 完全重置本機資料庫（刪除 volume 重建）
docker compose down -v && docker compose up -d --wait
```

**本機測試帳號**（由 `scripts/seed_mock_scenarios.sql` 建立）：

| 角色 | 帳號 | 密碼 | 用途 |
| :--- | :--- | :--- | :--- |
| 一般民眾 / 志工 | `avol01@mock.test` ～ `avol04@mock.test` | `Mock1234!` | 登入前台 <http://localhost:3000> 測試建單、接單、申請入隊 |
| 團隊管理員（光復鄉公所） | `agov01@mock.test` | `Mock1234!` | 登入後台 <http://localhost:3001> 管理團隊成員與邀請碼 |
| 超級管理員（`super_admin`） | `asuper01@mock.test` | 執行下方指令設定 | 登入後台測試全平台最高權限與 `/users` 成員管理 |
| 資料檢核員（`data_auditor`） | `aaudit01@mock.test` | 執行下方指令設定 | 登入後台測試重複案件審核權限 |

設定 `asuper01@mock.test` 或 `aaudit01@mock.test` 的密碼：

```bash
docker compose exec backend python -m scripts.set_password asuper01@mock.test
```

---

## 確認服務正常

1. **Swagger UI（REST API）**：<http://localhost:8000/docs>
2. **GraphQL Endpoint**：<http://localhost:8000/graphql>
3. **根路由狀態檢查**：`curl http://localhost:8000/`（回傳 `{"message": "Welcome to Disaster Rescue System API"}`）

---

## 給前端的資訊

- **前端 Schema Codegen**：前端的 `pnpm schemas:generate` 會在 `ENV=testing` 下直接載入 FastAPI 與 Strawberry schema 匯出檔案（呼叫 `scripts/export_frontend_schemas.py`），**不需要啟動後端伺服器或資料庫**，但需要本機安裝 Python 3.13 與 `uv`。
- **修改 API 或 GraphQL 後**：只要改了路由、參數、Pydantic response schema、docstring 或 GraphQL 欄位，請務必到 `Frontend/` 執行 `pnpm schemas:generate` 並將產生的檔案一起 commit，否則 `frontend-ci.yaml` 會失敗。

---

## 測試

跑測試前，**必須先確保 Docker 的 `db`（PostGIS + H3）與 `redis` 容器正在運行**，並在本機安裝好 `uv` 虛擬環境：

```bash
cd Backend
docker compose up -d db redis
uv sync

# 建議使用 4 個 worker 平行執行
PYTHONPATH=. ENV=testing uv run python -m pytest tests -q -n 4
```

### 測試環境隔離機制

- **專用測試資料庫**：測試使用獨立的 `disaster_rescue_test` 資料庫。每次執行 `pytest` 時，`tests/db_reset.py` 會先跑 `alembic upgrade head` 建立好包含擴充套件（PostGIS、pg_trgm、h3、h3_postgis）的 template DB，再快速複製給各個 worker，**完全不會碰到開發用的 `postgres` 資料庫**。
- **修改 Model 後必建 Migration**：因為測試資料庫的結構來自 `alembic upgrade head`，如果你改了 `app/models/` 卻還沒產生 migration 檔，測試資料庫裡不會有新欄位！
- **專用 Redis DB**：測試預設使用 Redis **db 15**（平行執行時往下降：15、14、13、12），絕不使用開發環境所在的 db 0。

### 平行執行注意事項（`pytest-xdist`）

- Apple Silicon 筆電實測約 1,400+ 個測試：單執行緒約 9 分鐘，`-n 4` 不到 3 分鐘（不建議開到 `-n 8`，會逼近 PostgreSQL 預設 lock 上限）。
- **不可同時開兩個終端機跑 `pytest` 而共用預設設定**：兩組測試會互相清空對方的測試 DB 與 Redis，導致大量 `401 Could not validate credentials` 或找不到資料表。若需同時跑兩組，請為第二組指定不同的 `TEST_DB_URL` 與不重疊的 `TEST_REDIS_URL`。

---

## 程式碼品質與 CI

```bash
cd Backend
# Lint 檢查（設定位於 pyproject.toml）
uv run ruff check .

# 檢查排版格式
uv run ruff format --check .

# 自動修正格式
uv run ruff format .
```

GitHub Actions 後端相關 Workflows：
- `backend-tests.yml`：建置 `postgres-h3` image，並以 `pytest tests -q -n 4` 執行完整測試套件。
- `ruff-check.yml`：針對變更的 `.py` 檔案執行 `ruff check` 與 `ruff format --check`。
- `alembic-heads.yml`：確保 `Backend/alembic/versions/` 只有單一 head，沒有未合併的分支 migration。
- `frontend-ci.yaml`：當 `Backend/**` 有變更時也會觸發，檢查 `pnpm schemas:generate` 是否有未同步的前端型別合約。

---

## 專案結構

```text
Backend/
  app/
    main.py            # FastAPI 應用程式進入點、Middleware、CORS 與路由掛載
    api/v1/            # REST API 路由與 endpoints（auth, tickets, stations, map, admin...）
    core/              # 設定（config.py）、安全與 JWT、Cookie、Redis、RBAC 權限核心
    db/                # SQLAlchemy AsyncEngine 與 Session 管理
    graphql/           # Strawberry GraphQL schema、types、queries、mutations、dataloaders
    messaging/         # Email 與 SMS 發送介面（console / smtp2go / kotsms）
    models/            # SQLAlchemy ORM 資料表模型
    repositories/      # 資料存取層
    schemas/           # Pydantic 請求與回應綱要
    services/          # 核心業務邏輯（含 dedup_engine 重複查核引擎）
    sso/               # Google 與 LINE OAuth 驗證
  alembic/             # 資料庫 Migration 腳本
  docker/postgres-h3/  # 內建 PostGIS + h3-pg 的自訂 PostgreSQL Dockerfile
  scripts/             # 輔助腳本（seed_rbac.py、seed_mock_scenarios.sql、set_password.py、export_frontend_schemas.py）
  tests/               # Pytest 測試套件（含 conftest.py 與 db_reset.py）
  docker-compose.yml   # 本機開發環境容器編排
```

---

## 疑難排解

| 狀況 | 可能原因與處理 |
| :--- | :--- |
| `docker compose up` 失敗，顯示 port `5432` 或 `6379` 已被佔用 | 本機已有 PostgreSQL 或 Redis 服務在跑，請先停止本機服務（如 `brew services stop postgresql redis`） |
| 在本機 `http://localhost:3000` 登入成功卻立刻掉登入 / 401 | 1. 檢查是否有建立 `Backend/.env`（注意檔名是 `.env` 不是 `.env.local`），確保裡面有 `AUTH_COOKIE_SECURE=false`<br>2. 確認前後端的 `AUTH_COOKIE_PREFIX` 皆為 `wgdev` |
| 呼叫 API 出現找不到資料表（relation does not exist） | 尚未執行 `docker compose exec backend alembic upgrade head` |
| 新增了 Model 欄位，但跑 `pytest` 報錯找不到該欄位 | 測試 DB 是由 Alembic migration 建出來的，請先執行 `alembic revision --autogenerate` 產生 migration |
| 跑 `pytest` 時出現大量 `401` 或資料表消失 | 你同時開了兩個 `pytest` 程序共用同一個測試 DB / Redis，請一次只跑一組或分開指定 `TEST_DB_URL` |
| 前端呼叫後端出現 CORS / Origin 403 錯誤 | 確認 `Backend/.env` 的 `AUTH_ALLOWED_ORIGINS` 包含 `http://localhost:3000,http://localhost:3001` |
