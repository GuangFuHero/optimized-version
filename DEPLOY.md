# 島嶼守望：雲端部署與維運指南（Deployment Guide）

本文件說明如何將「島嶼守望」全端系統（後端 FastAPI、民眾前台 `demo`、管理後台 `admin`、資料庫與 Cloudflare Tunnel）部署至 GCP 雲端環境，以及日常備份還原、金鑰輪替與故障排解流程。

> ⚠️ **黃金鐵律**：在雲端 VM 上部署時，**永遠只執行 `./scripts/deploy.sh`**，切勿直接手動執行 `docker compose up`（手動執行會跳過資料庫備份、Migration、環境變數生成與失敗自動回滾機制，甚至可能誤讀本機開發用的 `docker-compose.yml`）。

---

## 目錄

1. [雲端架構一覽](#1-雲端架構一覽)
2. [日常部署速查（TL;DR）](#2-日常部署速查tldr)
3. [從本機連線雲端除錯（SSH Tunnel）](#3-從本機連線雲端除錯ssh-tunnel)
4. [雲端環境規格與設定總覽](#4-雲端環境規格與設定總覽)
5. [`deploy.sh` 自動化部署 9 步驟與回滾機制](#5-deploysh-自動化部署-9-步驟與回滾機制)
6. [環境變數、Cookie 與第三方服務設定](#6-環境變數cookie-與第三方服務設定)
7. [資料庫備份、還原與資料安全（Backup & Restore）](#7-資料庫備份還原與資料安全backup--restore)
8. [背景排程：通知清理服務（`retention`）](#8-背景排程通知清理服務retention)
9. [金鑰輪替（Secret Rotation）與管理員密碼設定](#9-金鑰輪替secret-rotation與管理員密碼設定)
10. [從零重建雲端環境（One-Time Bootstrap）](#10-從零重建雲端環境one-time-bootstrap)
11. [常見問題與疑難排解（Troubleshooting）](#11-常見問題與疑難排解troubleshooting)

---

## 1. 雲端架構一覽

雲端環境透過 **Cloudflare Tunnel（`cloudflared`）** 對外提供 HTTPS 服務，VM 本身不對公網開放 HTTP/HTTPS 入站 Port（GCP 防火牆僅開放 `22/SSH`）：

```text
網際網路使用者
  ├─ https://staging.wan-guard.com ───────┐
  └─ https://admin-staging.wan-guard.com ─┤  Cloudflare Edge (HTTPS)
                                          ▼
                            Cloudflare Tunnel (outbound-only)
  ┌─────────────────────────────── GCP VM (wanguard-test-01) ───────────────────────────────┐
  │  cloudflared 容器                                                                       │
  │    ├─ 轉發至 frontend 容器 (:3000, APP=demo)  ─┐                                         │
  │    └─ 轉發至 admin 容器    (:3000, APP=admin) ─┤ Next.js BFF Proxy (http://backend:8000) │
  │                                                ▼                                         │
  │                                  backend 容器 (:8000, FastAPI)                          │
  │                                    ├─ db 容器    (PostGIS + H3, named volume: pgdata)   │
  │                                    ├─ redis 容器 (AOF 持久化, named volume: redisdata)   │
  │                                    └─ retention 容器 (每日自動軟刪除過期通知)             │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 日常部署速查（TL;DR）

```bash
# 1. SSH 登入雲端 VM（透過 gcloud 自動解析認證）
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a

# 2. 部署最新的 origin/main（預設會重新建置後端 + 前台 frontend + 後台 admin）
cd /opt/wanguard/Backend && ./scripts/deploy.sh

# 【選用】部署指定的 Git Tag 或 Commit SHA（手動退版 Rollback 也是用這行）
./scripts/deploy.sh <git-ref>

# 【選用】只重建特定前端 App（當本次 commit 沒動到某個前端時，可省下一半建置時間）
NEXT_APPS=admin ./scripts/deploy.sh      # 只重建後台 admin，前台保留現有 image
NEXT_APPS=frontend ./scripts/deploy.sh   # 只重建前台 frontend，後台保留現有 image
NEXT_APPS="" ./scripts/deploy.sh         # 只重建後端，兩個前端都不重建

# 【選用】部署同時重設測試情境假資料（僅限測試環境需要重置 mock 任務時使用）
SEED_MOCK=true ./scripts/deploy.sh
```

- **部署成功畫面**：依序印出 `[1/9] preflight` ～ `[9/9]`，最後顯示 `DEPLOY OK — <sha> in <N>s` 與退版提示。
- **何時使用 `NEXT_APPS`？** 因為 VM 記憶體為 4 GB，兩個 Next.js App 會排隊依序建置。若你的變更只動到後端 Python 程式碼，可用 `NEXT_APPS="" ./scripts/deploy.sh` 大幅縮短部署時間；若不確定是否有影響共用套件，請維持預設（不帶 `NEXT_APPS`）讓兩個前端都重建。

---

## 3. 從本機連線雲端除錯（SSH Tunnel）

由於 GCP 防火牆未對公網開放 `:8000` 與 `:5432`，若需從個人電腦直接連上雲端後端或資料庫，請使用 SSH Port Forwarding：

### A. 將雲端後端 API 映射至本機 `:8000`
```bash
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a -- -N -L 8000:localhost:8000
```
保持此終端機開啟，你本機的 `http://localhost:8000` 就會直接連向雲端後端（可執行 `curl http://localhost:8000/readyz` 驗證回傳 `{"status":"ready"}`）。

### B. 用資料庫工具（DBeaver / psql）查看雲端資料庫
雲端 PostgreSQL 僅綁定在 VM 的 `127.0.0.1:5432`。為避免與本機開發的 `5432` 衝突，建議映射至本機的 **`5433`**：

```bash
# 1. 建立 SSH Tunnel（本機 5433 -> 雲端 VM 127.0.0.1:5432）
gcloud compute ssh wanguard-test-01 --zone=asia-east1-a -- -N -L 5433:localhost:5432

# 2. 取得雲端資料庫密碼（存於 GCP Secret Manager）
gcloud secrets versions access latest --project=wanguard-250923 --secret=staging-backend-postgres-password
```
接著即可用 DBeaver 或 `psql` 連線至 `localhost:5433`（帳號 `postgres`、資料庫 `postgres`）。

---

## 4. 雲端環境規格與設定總覽

| 項目 | 設定值與說明 |
| :--- | :--- |
| **GCP 專案 / VM** | 專案：`wanguard-250923`｜VM：`wanguard-test-01`（`asia-east1-a`，`e2-medium`：2 vCPU、4 GB RAM） |
| **VM 專案路徑** | `/opt/wanguard`（部署腳本工作目錄為 `/opt/wanguard/Backend`） |
| **Compose 編排檔** | [`Backend/docker-compose.staging.yml`](Backend/docker-compose.staging.yml)（Project Name 固定為 `backend`） |
| **資料持久化** | Docker Named Volumes：`backend_pgdata`（PostgreSQL）與 `backend_redisdata`（Redis），跨部署永久保留 |
| **對外固定 IP** | `34.80.0.121`（資源名稱：`wanguard-prod-external-ip`）。**切勿釋放此 IP**：簡訊王（KotSMS）與內政部 TGOS 門牌 API 皆綁定此固定 IP 白名單 |
| **防火牆與開放埠** | GCP 防火牆僅開放 `22/SSH`；網站流量一律走 Cloudflare Tunnel |
| **資料庫自動備份** | GCS Bucket：`gs://wanguard-250923-db-backups`（每次部署自動備份，保留 30 天） |
| **記憶體保護（Swap）** | 配置 2 GB `/swapfile`（`vm.swappiness=10`），防止 `docker build` 高峰期觸發 Linux OOM Killer 誤殺資料庫 |
| **磁碟空間門檻** | 每次部署前自動清理超過 7 天的 Docker build cache；若清理後可用空間仍低於 **5 GB**，腳本會安全中止 |

---

## 5. `deploy.sh` 自動化部署 9 步驟與回滾機制

執行 `./scripts/deploy.sh` 時，腳本會透過 `/var/lock/disaster-deploy.lock` 檔案鎖防止多人同時部署，並依序執行以下 9 個步驟：

| 步驟 | 階段名稱 | 執行內容 | 若此步驟失敗時的系統行為 |
| :---: | :--- | :--- | :--- |
| **1** | **Preflight** | 檢查 Docker、gcloud、gsutil、Git 工作目錄乾淨、清理 7 天前快取並確認剩餘磁碟 `>= 5 GB` | 立即中止，線上服務**完全不受影響** ✅ |
| **2** | **Baseline** | 記錄當前 Git SHA，並將正在運行的後端容器 Image 標記為 `disaster-backend:prev` 作為回滾目標 | 立即中止，線上服務**完全不受影響** ✅ |
| **3** | **Checkout** | `git fetch` 並切換（detached HEAD）至目標 Commit 或 `origin/main` | 自動還原 Git 工作目錄，線上服務**完全不受影響** ✅ |
| **4** | **Generate `.env`** | 從 GCP Secret Manager 讀取機密金鑰，結合 `scripts/deploy-config.staging.env` 產生 `.env` 與 `.env.frontend`（權限 `0600`） | 自動還原 Git 工作目錄，線上服務**完全不受影響** ✅ |
| **5** | **Build Images** | 建置 `db` 與 `backend` image，再依序建置 `NEXT_APPS` 中的前端 image（一次建置一個以避免 4 GB 記憶體爆掉） | 自動還原 Git 工作目錄，線上服務**完全不受影響** ✅ |
| **6** | **Infra Up** | 啟動或更新 `db` 與 `redis` 容器，等待 Healthcheck 通過 | 自動還原 Git 工作目錄，舊版後端繼續運行 ✅ |
| **7** | **DB Backup** | 執行 `pg_dump \| gzip` 並上傳至 `gs://wanguard-250923-db-backups/pre-deploy-<timestamp>.sql.gz` | **備份失敗則絕不執行 Migration**，立即中止 ✅ |
| **8** | **Migrate & Seed** | 使用新 image 啟動一次性容器執行 `alembic upgrade head` 與 `seed_rbac.py`（若帶 `SEED_MOCK=true` 則重灌測試情境） | PostgreSQL 交易自動回滾失敗的單一 Migration，印出備份路徑並中止 ⚠️ |
| **9** | **Restart & Gate** | 啟動新版 `backend`、`frontend`、`admin`、`cloudflared`、`retention`，並連續輪詢 `http://localhost:8000/readyz`（最多 60 秒） | **觸發自動回滾（Auto-Rollback）**：自動將 `disaster-backend:prev` 換回 `:latest` 重啟舊版後端，並還原 Git 工作目錄 ✅ |

---

## 6. 環境變數、Cookie 與第三方服務設定

### A. 各環境設定對照表

雲端的非機密公開設定存放於 [`Backend/scripts/deploy-config.staging.env`](Backend/scripts/deploy-config.staging.env)（隨 Git 追蹤）；機密金鑰則存放於 GCP Secret Manager，每次部署由 `deploy.sh` 的 `gen_env()` 動態寫入（**切勿在 VM 上手動編輯 `.env`**，下次部署會被覆蓋）。

| 設定變數 | Production（規劃中） | Staging（目前線上環境） | Local（本機開發） |
| :--- | :--- | :--- | :--- |
| **民眾前台網址 (`SITE_APP_URL`)** | `https://wan-guard.com` | `https://staging.wan-guard.com` | `http://localhost:3000` |
| **管理後台網址 (`ADMIN_APP_URL`)** | `https://admin.wan-guard.com` | `https://admin-staging.wan-guard.com` | `http://localhost:3001` |
| **登入 Cookie 前綴 (`AUTH_COOKIE_PREFIX`)** | `wg` | `wgstg` | `wgdev` |
| **Cookie 網域 (`AUTH_COOKIE_DOMAIN`)** | `.wan-guard.com` | `.wan-guard.com` | 留空（僅綁定 `localhost`） |
| **強制 HTTPS Cookie (`AUTH_COOKIE_SECURE`)** | `true` | `true` | `false`（本機為純 HTTP） |
| **允許寫入來源 (`AUTH_ALLOWED_ORIGINS`)** | `https://wan-guard.com,https://admin.wan-guard.com` | `https://staging.wan-guard.com,https://admin-staging.wan-guard.com` | `http://localhost:3000,http://localhost:3001` |
| **OAuth Callback 基底 (`OAUTH_REDIRECT_BASE_URL`)** | `https://wan-guard.com` | `https://staging.wan-guard.com` | `http://localhost:3000` |

> 💡 **為什麼後台網址叫 `admin-staging.wan-guard.com` 而不是 `admin.staging.wan-guard.com`？**
> 因為 Cloudflare 免費通用 SSL 憑證僅涵蓋 `*.wan-guard.com`（一層子網域），若用兩層子網域（`admin.staging.*`）會無法通過憑證驗證。也因為 Staging 與未來的 Production 共用上層網域 `.wan-guard.com`，系統透過不同的 `AUTH_COOKIE_PREFIX`（`wgstg` vs `wg`）確保兩邊的 Cookie 絕對不會互相干擾。

### B. GCP Secret Manager 金鑰清單

所有機密金鑰皆存放在 GCP 專案 `wanguard-250923` 的 Secret Manager 中：

| Secret 名稱 | 對應環境變數 | 用途說明 |
| :--- | :--- | :--- |
| `staging-backend-postgres-password` | `POSTGRES_PASSWORD` | PostgreSQL 資料庫密碼 |
| `staging-backend-jwt-signing-key` | `SECRET_KEY` | 後端簽發 Session JWT 的簽章密鑰 |
| `staging-backend-smtp2go-api-key` | `SMTP2GO_API_KEY` | SMTP2GO 寄送驗證碼與通知信金鑰 |
| `staging-backend-kotsms-username` / `-password` | `KOTSMS_USERNAME` / `KOTSMS_PASSWORD` | 簡訊王（KotSMS）API 帳號密碼（綁定 VM 固定 IP `34.80.0.121`） |
| `staging-backend-google-client-secret` | `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `staging-backend-line-channel-secret` | `LINE_CHANNEL_SECRET` | LINE Login Channel Secret |
| `staging-backend-tgos-addr-app-id` / `-api-key` | `TGOS_ADDR_APP_ID` / `TGOS_ADDR_API_KEY` | 內政部 TGOS 全國門牌位置比對服務（綁定 VM 固定 IP） |
| `staging-backend-tgos-geo-app-id` / `-api-key` | `TGOS_GEO_APP_ID` / `TGOS_GEO_API_KEY` | 內政部 TGOS 坐標回傳門牌服務（綁定 VM 固定 IP） |
| `staging-cloudflared-tunnel-token` | `TUNNEL_TOKEN` | Cloudflare Tunnel 連線憑證（僅寫入 `.env.frontend`） |

> 🔒 **最小權限原則**：
> - `deploy.sh` 會產生兩份檔案：`.env`（供 `backend` 與 `retention` 使用，含資料庫與 JWT 密鑰）與 `.env.frontend`（僅含公開設定與 `TUNNEL_TOKEN`），確保前端與 Tunnel 容器永遠碰不到後端機密。
> - 若前端或後端開發者需要在本機測試 Google / LINE OAuth，請針對**單一 Secret** 授權給該開發者，**切勿授予整個 GCP Project 的 `secretAccessor`**（否則該員可讀取正式 JWT 簽章密鑰與 Tunnel Token）：
>   ```bash
>   for s in staging-backend-google-client-secret staging-backend-line-channel-secret; do
>     gcloud secrets add-iam-policy-binding $s \
>       --project=wanguard-250923 \
>       --member="user:<developer-email>" \
>       --role="roles/secretmanager.secretAccessor"
>   done
>   ```

### C. Google 與 LINE OAuth 後台需註冊的 Redirect URI

- **Google Cloud Console**（Client ID `717563375943-pibc1j3t…`）：
  - `https://staging.wan-guard.com/api/v1/auth/oauth/google/callback`
  - `http://localhost:3000/api/v1/auth/oauth/google/callback`
- **LINE Developers Console**（Channel ID `2010287145`）：
  - `https://staging.wan-guard.com/api/v1/auth/oauth/line/callback`
  - `http://localhost:3000/api/v1/auth/oauth/line/callback`

---

## 7. 資料庫備份、還原與資料安全（Backup & Restore）

### A. 自動備份機制
- **備份時機**：每次執行 `./scripts/deploy.sh` 的第 7 步（執行 Migration 之前）都會自動備份一次。
- **儲存位置**：`gs://wanguard-250923-db-backups/pre-deploy-<YYYYMMDD-HHMMSS>.sql.gz`。
- **保存期限**：GCS Bucket 設有 30 天 Lifecycle 規則，滿 30 天的備份檔會自動清除（無數量上限）。若某份備份需要永久保存，請手動複製到其他 Bucket。

### B. 災難還原 SOP（當錯誤的 Migration 破壞資料時）

```bash
# 1. 查看可用的備份檔清單
gsutil ls gs://wanguard-250923-db-backups/

# 2. 先停止 backend 與 retention 容器，避免還原期間有新寫入
cd /opt/wanguard/Backend
docker compose -f docker-compose.staging.yml stop backend retention

# 3. 下載備份並還原至資料庫（注意：若資料表結構已改變，建議先重建乾淨的 public schema 再匯入）
gsutil cp gs://wanguard-250923-db-backups/pre-deploy-<timestamp>.sql.gz - | gunzip | \
  docker compose -f docker-compose.staging.yml exec -T db psql -U postgres -d postgres

# 4. 部署對應舊版 Schema 的程式碼 Commit SHA
./scripts/deploy.sh <sha-from-before-the-bad-migration>
```

### C. 撰寫 Migration 的安全守則（Expand-Contract）
- `./scripts/deploy.sh <old-sha>` 只會回滾「程式碼映像檔」，**不會自動執行 `alembic downgrade`**。
- 因此撰寫資料庫變更時，請遵循 **Expand-Contract（先擴充、後收斂）** 原則：先新增可為 NULL 的欄位讓新舊版程式碼都能跑，等確認穩定後的下一個版本再移除舊欄位。

---

## 8. 背景排程：通知清理服務（`retention`）

`docker-compose.staging.yml` 中的 `retention` 服務負責定期清理過期通知：
- **清理規則**：將「已讀超過 30 天」或「建立超過 90 天（不論已讀與否）」的通知標記為軟刪除（寫入 `delete_at` 欄位，不會實體 `DELETE` 資料列）。
- **運作方式**：直接重用 `disaster-backend:latest` 映像檔，以 `while true; do python scripts/run_retention_cleanup.py; sleep 86400; done` 每 24 小時執行一次（容器啟動時會立即執行第一次）。

常用檢查指令：
```bash
# 查看最近一次清理紀錄（尋找「清理完成」字樣）
docker compose -f docker-compose.staging.yml logs retention | tail -20

# 手動立即觸發一次清理
docker compose -f docker-compose.staging.yml exec retention python scripts/run_retention_cleanup.py
```

---

## 9. 金鑰輪替（Secret Rotation）與管理員密碼設定

### A. 設定雲端高權限測試帳號密碼（`asuper01` / `aaudit01`）
`seed_mock_scenarios.sql` 中的 `asuper01@mock.test`（超級管理員）與 `aaudit01@mock.test`（資料檢核員）基於安全考量預設不帶密碼。在 VM 上設定密碼的方式如下（設定後即使重跑 `SEED_MOCK=true` 也會保留此密碼）：

```bash
cd /opt/wanguard/Backend
sudo docker compose -f docker-compose.staging.yml run --rm -e PYTHONPATH=/app backend \
  python -m scripts.set_password asuper01@mock.test
```

### B. 輪替一般 API 金鑰（SMTP2GO / KotSMS / OAuth / TGOS / JWT）
直接新增一版 Secret Version，再執行 `./scripts/deploy.sh` 即可自動生效：

```bash
# 使用 read -rs 避免金鑰留在 bash history
read -rs v && printf '%s' "$v" \
  | gcloud secrets versions add <secret-name> --project=wanguard-250923 --data-file=- && unset v

cd /opt/wanguard/Backend && ./scripts/deploy.sh
```
> ⚠️ **注意**：輪替 `staging-backend-jwt-signing-key` 會讓所有已登入的使用者強制登出，需重新登入。

### C. 輪替 PostgreSQL 資料庫密碼
因為 PostgreSQL Volume 已經初始化過，只改 Secret Manager 不會改變資料庫內的實際密碼，**必須按以下順序執行**：
1. 先進入 `db` 容器執行 SQL：`ALTER USER postgres PASSWORD '<new-password>';`（密碼僅限英數與 `_-`）。
2. 更新 Secret Manager：`gcloud secrets versions add staging-backend-postgres-password --data-file=-`。
3. 立即執行 `./scripts/deploy.sh` 重新產生 `.env` 並重啟後端。

---

## 10. 從零重建雲端環境（One-Time Bootstrap）

若未來需要在全新的 GCP VM（例如建立正式 Production 環境或重建 Staging）從零初始化，請依序執行：

```bash
# 1. 啟用 Secret Manager API 並建立所有 Secrets
gcloud services enable secretmanager.googleapis.com
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create staging-backend-postgres-password --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create staging-backend-jwt-signing-key --data-file=-
printf '%s' '<smtp2go-key>'   | gcloud secrets create staging-backend-smtp2go-api-key --data-file=-
printf '%s' '<kotsms-user>'   | gcloud secrets create staging-backend-kotsms-username --data-file=-
printf '%s' '<kotsms-pass>'   | gcloud secrets create staging-backend-kotsms-password --data-file=-
printf '%s' '<google-secret>' | gcloud secrets create staging-backend-google-client-secret --data-file=-
printf '%s' '<line-secret>'   | gcloud secrets create staging-backend-line-channel-secret --data-file=-
printf '%s' '<addr-app-id>'   | gcloud secrets create staging-backend-tgos-addr-app-id --data-file=-
printf '%s' '<addr-api-key>'  | gcloud secrets create staging-backend-tgos-addr-api-key --data-file=-
printf '%s' '<geo-app-id>'    | gcloud secrets create staging-backend-tgos-geo-app-id --data-file=-
printf '%s' '<geo-api-key>'   | gcloud secrets create staging-backend-tgos-geo-api-key --data-file=-
printf '%s' '<tunnel-token>'  | gcloud secrets create staging-cloudflared-tunnel-token --data-file=-

# 2. 授權 VM 的 Service Account 讀取上述 Secrets
for s in staging-backend-postgres-password staging-backend-jwt-signing-key \
         staging-backend-smtp2go-api-key staging-backend-kotsms-username staging-backend-kotsms-password \
         staging-backend-google-client-secret staging-backend-line-channel-secret \
         staging-backend-tgos-addr-app-id staging-backend-tgos-addr-api-key \
         staging-backend-tgos-geo-app-id staging-backend-tgos-geo-api-key \
         staging-cloudflared-tunnel-token; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:<vm-service-account-email>" \
    --role="roles/secretmanager.secretAccessor"
done

# 3. 建立資料庫備份 GCS Bucket 並設定 30 天自動刪除規則
gsutil mb -l asia-east1 gs://wanguard-250923-db-backups
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/lc.json
gsutil lifecycle set /tmp/lc.json gs://wanguard-250923-db-backups

# 4. 調整 VM Cloud API Access Scopes（預設 scope 會擋 Secret Manager 與 GCS 寫入）
gcloud compute instances stop wanguard-test-01 --zone=asia-east1-a
gcloud compute instances set-service-account wanguard-test-01 --zone=asia-east1-a --scopes=cloud-platform
gcloud compute instances start wanguard-test-01 --zone=asia-east1-a

# 5. 在 VM 內設定 2 GB Swap（防止前端建置時 OOM）
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
```

---

## 11. 常見問題與疑難排解（Troubleshooting）

| 狀況 / 錯誤訊息 | 可能原因與處理方式 |
| :--- | :--- |
| **`another deploy is already in progress`** | 有另一位工程師正在執行 `deploy.sh`（握有 `/var/lock/disaster-deploy.lock`）。可執行 `ps aux \| grep deploy.sh` 查看，等待對方跑完即會自動釋放鎖。 |
| **`under 5G free: clear space first`** | 清理 7 天前快取後磁碟仍不足 5 GB。請先執行 `docker system df` 檢查，接著執行 `docker builder prune -f` 清空所有建置快取（注意保留 `disaster-*:latest` 與 `disaster-backend:prev` 映像檔）。 |
| **建置到一半失敗，出現 `exit code: 137`** | 記憶體不足觸發 Linux OOM Killer。請確認 `free -h` 中 2 GB Swap 是否有啟用，或改用 `NEXT_APPS=frontend`、`NEXT_APPS=admin` 分開建置。 |
| **修改了 `deploy.sh` 裡面的 `gen_env()`，部署一次卻沒生效** | Bash 在腳本啟動時已將舊版 `deploy.sh` 函式讀入記憶體，第 3 步 `git checkout` 後當次執行的仍是記憶體裡的舊版 `gen_env()`。只要**再執行第二次 `./scripts/deploy.sh`**（可加 `NEXT_APPS=""` 跳過前端重建）就會用新版邏輯寫入 `.env`。 |
| **修好了 `deploy.sh` 想在 VM 上測試，卻 `git pull` 失敗** | `deploy.sh` 執行後會讓 `/opt/wanguard` 處於 detached HEAD 狀態。若要在 VM 上拉分支，請先 `cd /opt/wanguard && git checkout main && git pull --ff-only`。 |
| **在容器內手動跑 `python scripts/xxx.py` 報 `No module named 'app'`** | 正式映像檔未預設 `PYTHONPATH=/app`，請改用 `python -m scripts.xxx` 或在 `docker compose run` 加上 `-e PYTHONPATH=/app`。 |
| **首次在新機器部署出現 `WARNING: no existing backend container`** | 正常現象。第一次部署時還沒有舊版容器可標記為 `:prev`，從第二次部署開始就會有自動回滾映像檔。 |
