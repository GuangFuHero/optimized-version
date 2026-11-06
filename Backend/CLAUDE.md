# Backend — agent 守則

## 測試（pytest）

測試資料庫來自 alembic：每次 run 先用 `alembic upgrade head` 建一個 template DB，
每個 xdist worker 複製一份；每個用 `db`／`db_session` 的測試開始前，所有資料表會被 TRUNCATE，
再放回 migration 插入的資料（baseline）。細節在 `tests/db_reset.py`。

- **不要**再寫 `drop_all`／`create_all` 或自己建 schema 的 fixture，用 `tests/conftest.py` 的 `db`、`db_session`。
- 改 model 要先寫 migration，測試才看得到新欄位。migration 還沒寫、只想在本機試 model 時，
  用 `TEST_SCHEMA=models pytest …`（template 改用 `Base.metadata.create_all`）；CI 一律走 alembic。
- 會改 schema 的測試（`ALTER TABLE`、`CREATE TRIGGER`、`DROP INDEX`…）要加 `@pytest.mark.own_db`，
  拿到一份自己的 DB 副本，測完就丟。沒加的話 DB 會直接擋下並告訴你要加這個 marker；暫存表（`CREATE TEMP TABLE`）不受限。
- 不要假設 DB 是空的：migration 會先放 permissions、disaster types、動態欄位設定、audit log 等資料。
  - 種資料用 insert-if-missing 的 helper（`seed_disaster_types`、`ensure_role`），不要直接 `add` 可能已存在的 row。
  - 數 row 的斷言要相對於 baseline（先數一次、或只數自己建的），不要假設總數。
  - audit trigger 一直開著，setup 也會寫進 `audit_logs`；要自己手寫 audit row 的測試，先呼叫 `clear_audit_trail(db)`。
- `@pytest.mark.empty_db` 會清空資料表但不放回 baseline，只給「本來就假設空 DB、改起來不小」的舊測試用，新測試不要用。
- 新增資料 migration（插入 row）不用改任何測試：baseline 會自動從 `upgrade head` 後所有非空的表抓。
- 開跑前會先檢查 alembic heads；兩個 head 或 `upgrade head` 失敗時，pytest 只印一次原因就停。
  若 migration 和 model 的表名／欄位名不一致，開頭會印一段 WARNING。
- 完整跑一次：`pytest -n 4`。review 的人只跑自己動到的部分相關的測試。
- 測試 DB 帳號要是 superuser（event trigger 和 reset 需要）；本機 docker 與 CI 的 `postgres` 都是。

## 相依套件（uv.lock）

`uv.lock` 有 commit：CI（`uv sync --locked`）和 Docker image（`uv sync --frozen`）都只裝 lock 裡的版本。
加或升級套件：改 `pyproject.toml`，跑 `uv lock`（升級單一套件用 `uv lock --upgrade-package <名稱>`），兩個檔一起 commit；lock 跟 pyproject 對不上時 CI 會失敗。
