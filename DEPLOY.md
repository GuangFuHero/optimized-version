# 島嶼守望：雲端部署與維運指南（Deployment Guide）

本文件說明如何將「島嶼守望」全端系統（後端 FastAPI、民眾前台 `demo`、管理後台 `admin`、資料庫與 Cloudflare Tunnel）部署至 GCP 雲端環境，以及從零架設新環境、日常備份還原、金鑰輪替與故障排解流程。

> ⚠️ **黃金鐵律**：在雲端 VM 上部署時，**永遠只執行 `./scripts/deploy.sh`**，切勿直接手動執行 `docker compose up`（手動執行會跳過資料庫備份、Migration、環境變數生成與失敗自動回滾機制，甚至可能誤讀本機開發用的 `docker-compose.yml`）。

---

## 🧭 請依你的情境選擇閱讀起點

| 你的身分與目標 | 建議閱讀順序 |
| :--- | :--- |
| **A. 團隊成員：部署更新至現有雲端環境（Staging）** | 直接從 **[第 2 節：日常部署速查](#2-日常部署速查tldr)** 開始（首次連線請先看 2-A「開始之前」安裝 `gcloud` 與開通權限） |
| **B. 廠商／維運人員：在 GCP 從零架設一套全新雲端環境** | 請先從 **[第 10 節：從零架設雲端環境（One-Time Bootstrap）](#10-從零架設雲端環境one-time-bootstrap)** 依序完成外部服務申請、GCP 基建與首次部署；架設完成後的日常更新再回到 **[第 2 節](#2-日常部署速查tldr)** |
| **C. 廠商：在自己的電腦（Ubuntu 24.04 LTS＋Docker）架設（僅供測試使用）** | 正式環境請走 B。測試用請先讀 **[第 10 節開頭「在自己的電腦上架設要先知道的事」](#在自己的電腦上架設要先知道的事)**，再照第 10 節的步驟做（Step 2 改做「Step 2 替代做法」）；日常更新同樣是到那台電腦上執行第 2 節的 `deploy.sh` |

---

## 目錄

1. [雲端架構一覽](#1-雲端架構一覽)
2. [日常部署速查（TL;DR）](#2-日常部署速查tldr)
3. [從本機連線雲端除錯（SSH Tunnel）](#3-從本機連線雲端除錯ssh-tunnel)
4. [雲端環境規格與設定總覽](#4-雲端環境規格與設定總覽)
5. [`deploy.sh` 自動化部署 9 步驟與回滾機制](#5-deploysh-自動化部署-9-步驟與回滾機制)
6. [環境變數、Cookie、Cloudflare Tunnel 與第三方服務設定](#6-環境變數cookiecloudflare-tunnel-與第三方服務設定)
7. [資料庫備份、還原與資料安全（Backup & Restore）](#7-資料庫備份還原與資料安全backup--restore)
8. [背景排程：通知清理服務（`retention`）](#8-背景排程通知清理服務retention)
9. [金鑰輪替（Secret Rotation）與管理員密碼設定](#9-金鑰輪替secret-rotation與管理員密碼設定)
10. [從零架設雲端環境（One-Time Bootstrap）](#10-從零架設雲端環境one-time-bootstrap)
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

### A. 開始之前（本機第一次連線前置準備）

如果你是第一次在自己的電腦上連線雲端 VM，請先完成以下 3 步：

1. **安裝 Google Cloud SDK（`gcloud` CLI）**：
   - macOS：`brew install --cask google-cloud-sdk`
   - 其他作業系統請見 [Google Cloud SDK 官方安裝指南](https://cloud.google.com/sdk/docs/install)。
2. **向專案管理員申請 GCP 權限**：
   - 請提供你的 Google 帳號信箱給雲端管理員，開通 GCP 專案（Staging 為 `wanguard-250923`）的 **`roles/compute.instanceAdmin.v1`** 與 **`roles/iam.serviceAccountUser`** 角色（這樣才能透過 `gcloud compute ssh` 連入 VM）。
3. **在本機登入並綁定 GCP 專案**：
   ```bash
   gcloud auth login
   gcloud config set project wanguard-250923   # 若為自建環境，請換成你的 GCP Project ID
   ```

### B. 執行部署指令

> 情境 C（主機是自己的電腦）：略過下面第 1 行的 SSH，直接在那台電腦上執行第 2 行。

```bash
# 1. SSH 登入雲端 VM（透過 gcloud 自動解析認證與外部 IP）
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

- **何時使用 `NEXT_APPS`？** 因為 VM 記憶體為 4 GB，兩個 Next.js App 會排隊依序建置（完整建置約需 10～15 分鐘）。若你的變更只動到後端 Python 程式碼，可用 `NEXT_APPS="" ./scripts/deploy.sh` 大幅縮短部署時間；若不確定是否有影響共用套件，請維持預設（不帶 `NEXT_APPS`）讓兩個前端都重建。

### C. 部署完成後如何確認成功（驗收清單）

1. **檢查終端機結尾訊息**：
   - 依序印出 `[1/9] preflight` ～ `[9/9]`，最後顯示 **`DEPLOY OK — <sha> in <N>s`** 與退版提示。
   - 確認結尾**沒有**印出 `WARN: https://... not reachable yet`（若有出現，代表對應的前台或後台容器尚未就緒或 Cloudflare Tunnel 路由未設妥）。
2. **實際打開網站並登入驗證**：
   - 打開民眾前台（`https://staging.wan-guard.com`）確認地圖與列表正常載入，並測試登入一次。
   - 打開管理後台（`https://admin-staging.wan-guard.com`），使用管理員帳號登入確認儀表板與案件列表正常顯示。
3. **（選用）若有新增或輪替 TGOS 金鑰，確認金鑰已載入後端容器**：
   ```bash
   docker compose -f docker-compose.staging.yml exec backend python -c \
     "from app.core.config import settings as s; print(all([s.TGOS_ADDR_APP_ID, s.TGOS_ADDR_API_KEY, s.TGOS_GEO_APP_ID, s.TGOS_GEO_API_KEY]))"
   ```
   最後一行印出 `True` 即代表 4 組 TGOS 金鑰皆已正常載入（不會在畫面印出金鑰明文）。

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

> 💡 若廠商或團隊要自建另一套獨立環境，下表中的 GCP 專案、VM 名稱、固定 IP 與 GCS Bucket 名稱皆可替換為自己的資源名稱（詳見 [第 10 節](#10-從零架設雲端環境one-time-bootstrap)）。

| 項目 | 目前 Staging 設定值與說明 |
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

## 6. 環境變數、Cookie、Cloudflare Tunnel 與第三方服務設定

### A. 各環境設定對照表

雲端的非機密公開設定存放於 [`Backend/scripts/deploy-config.staging.env`](Backend/scripts/deploy-config.staging.env)（隨 Git 追蹤）；機密金鑰則存放於 GCP Secret Manager，每次部署由 `deploy.sh` 的 `gen_env()` 動態寫入（**切勿在 VM 上手動編輯 `.env`**，下次部署會被覆蓋）。

| 設定變數 | Production（正式環境範例） | Staging（目前線上環境） | Local（本機開發） |
| :--- | :--- | :--- | :--- |
| **民眾前台網址 (`SITE_APP_URL`)** | `https://wan-guard.com` | `https://staging.wan-guard.com` | `http://localhost:3000` |
| **管理後台網址 (`ADMIN_APP_URL`)** | `https://admin.wan-guard.com` | `https://admin-staging.wan-guard.com` | `http://localhost:3001` |
| **登入 Cookie 前綴 (`AUTH_COOKIE_PREFIX`)** | `wg` | `wgstg` | `wgdev` |
| **Cookie 網域 (`AUTH_COOKIE_DOMAIN`)** | `.wan-guard.com` | `.wan-guard.com` | 留空（僅綁定 `localhost`） |
| **強制 HTTPS Cookie (`AUTH_COOKIE_SECURE`)** | `true` | `true` | `false`（本機為純 HTTP） |
| **允許寫入來源 (`AUTH_ALLOWED_ORIGINS`)** | `https://wan-guard.com,https://admin.wan-guard.com` | `https://staging.wan-guard.com,https://admin-staging.wan-guard.com` | `http://localhost:3000,http://localhost:3001` |
| **OAuth Callback 基底 (`OAUTH_REDIRECT_BASE_URL`)** | `https://wan-guard.com` | `https://staging.wan-guard.com` | `http://localhost:3000` |

> 💡 **為什麼後台網址叫 `admin-staging.wan-guard.com` 而不是 `admin.staging.wan-guard.com`？**
> 因為 Cloudflare 免費通用 SSL 憑證僅涵蓋 `*.wan-guard.com`（一層子網域），若用兩層子網域（`admin.staging.*`）會無法通過憑證驗證。也因為 Staging 與 Production 共用上層網域 `.wan-guard.com`，系統透過不同的 `AUTH_COOKIE_PREFIX`（`wgstg` vs `wg`）確保兩邊的 Cookie 不會互相干擾。

### B. Cloudflare Tunnel 公開網域路由表（Public Hostnames）

在 Cloudflare Zero Trust 後台（**Networks → Tunnels → Public Hostname**）需設定以下兩條轉發規則，將外部網址導向 Docker 內部網路的對應容器：

| 對外公開網域（Public Hostname） | 內部服務網址（Service URL） | 對應容器與功能 |
| :--- | :--- | :--- |
| `staging.wan-guard.com`（正式環境：`wan-guard.com`） | `http://frontend:3000` | 民眾前台（`Frontend/apps/demo`） |
| `admin-staging.wan-guard.com`（正式環境：`admin.wan-guard.com`） | `http://admin:3000` | 管理後台（`Frontend/apps/admin`） |

> 註：瀏覽器對後端 API（`/api/v1/*` 與 `/api/graphql`）的所有請求，都會經由這兩個 Next.js 容器內建的 BFF Proxy 在 Docker 內網轉發至 `http://backend:8000`，因此**不需要**在 Cloudflare Tunnel 公開暴露 `backend:8000`。

### C. GCP Secret Manager 金鑰清單

所有機密金鑰皆存放在 GCP 專案的 Secret Manager 中：

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

### D. Google 與 LINE OAuth 後台需註冊的 Redirect URI

- **Google Cloud Console**（Client ID `717563375943-pibc1j3t…` → Authorized redirect URIs）：
  - `https://staging.wan-guard.com/api/v1/auth/oauth/google/callback`（正式環境改為對應的前台網域）
  - `http://localhost:3000/api/v1/auth/oauth/google/callback`
- **LINE Developers Console**（Channel ID `2010287145` → LINE Login → Callback URL）：
  - `https://staging.wan-guard.com/api/v1/auth/oauth/line/callback`（正式環境改為對應的前台網域）
  - `http://localhost:3000/api/v1/auth/oauth/line/callback`

---

## 7. 資料庫備份、還原與資料安全（Backup & Restore）

### A. 自動備份機制
- **備份時機**：每次執行 `./scripts/deploy.sh` 的第 7 步（執行 Migration 之前）都會自動備份一次。
- **儲存位置**：`gs://wanguard-250923-db-backups/pre-deploy-<YYYYMMDD-HHMMSS>.sql.gz`。
- **保存期限**：GCS Bucket 設有 30 天 Lifecycle 規則，滿 30 天的備份檔會自動清除（無數量上限）。若某份備份需要永久保存，請手動複製到其他 Bucket。

### B. 災難還原 SOP（當錯誤的 Migration 破壞資料時）

> ⚠️ **重要警告**：
> 1. **以下第 3 步會直接覆寫（OVERWRITES）資料庫目前的所有資料**，執行前請務必再次確認目標備份檔時間點！
> 2. **備份檔是不含 `--clean` 的純 SQL**：若直接匯入已經有資料表（或卡在半套 Migration）的資料庫會發生表格／主鍵衝突。因此**還原前必須先執行 `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` 清空結構**，再匯入備份檔。

```bash
# 1. 查看可用的備份檔清單（自建環境請把 Bucket 換成你自己的，第 3b 行也一樣）
gsutil ls gs://wanguard-250923-db-backups/

# 2. 先停止 backend 與 retention 容器，避免還原期間有新寫入
cd /opt/wanguard/Backend
docker compose -f docker-compose.staging.yml stop backend retention

# 3a. 清空現有 public schema（⚠️ 警告：這會清除目前資料庫內所有資料表與資料，請務必確認！）
docker compose -f docker-compose.staging.yml exec -T db psql -U postgres -d postgres \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3b. 下載備份並還原至乾淨的資料庫（OVERWRITES current data — be sure）
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

## 10. 從零架設雲端環境（One-Time Bootstrap）

若廠商或團隊需要從零架設一套環境（例如建立正式 Production 環境或獨立測試環境），請依序完成以下 **7 個步驟**。主機可以是 GCP VM（情境 B），也可以是自己的電腦（情境 C，僅供測試使用，先讀下面這段）。

### 在自己的電腦上架設要先知道的事

> ⚠️ **在自己的電腦上架設僅供測試使用。** 正式環境請架在雲端主機（情境 B）。

主機換成自己的電腦時，網站一樣透過 Cloudflare Tunnel 對外，**路由器不需要開任何 Port**。和 GCP VM 不同的地方有四件：

| 項目 | 要求 |
| :--- | :--- |
| **硬體** | 最低 2 核心、4 GB 記憶體（必須做 Step 4 的 Swap，建置一次約 10～15 分鐘）；**建議 8 GB**。可用磁碟空間至少 30 GB |
| **一直開機** | 網站跑在這台電腦上，關機或休眠網站就會停。請關閉休眠（見 Step 4）；電腦重開機後容器會自動啟動 |
| **固定 IP** | 簡訊王與 TGOS 都只接受**事先登記的固定 IP**。家用網路多半是浮動 IP，請先向網路業者（ISP）申請固定 IP。查目前對外 IP：`curl -4 -s https://ifconfig.me` |
| **仍需要一個 GCP 專案** | `deploy.sh` 會從 GCP Secret Manager 讀金鑰、把資料庫備份上傳到 GCS，執行前也會檢查 `gcloud`、`gsutil` 是否已登入。所以即使主機是自己的電腦，仍要建一個 GCP 專案（**不用建 VM**），只用來放金鑰和備份。專案需要綁定付款方式，用量很小 |

> ⚠️ 若完全不想使用 GCP，目前的 `deploy.sh` 無法執行，需要先調整腳本的金鑰來源與備份位置，請洽後端維護者。

### Step 1：事前申請外部第三方服務（需提前準備）

由於部分政府與電信服務需人工審核並綁定主機的**固定外部 IP**，請先拿到固定 IP（情境 B：執行 Step 2 的「保留固定外部 IP」；情境 C：向 ISP 申請），再拿該 IP 申請以下服務：

| 外部服務 | 用途 | 需取得的憑證 / 設定 | 申請注意事項與預估時間 |
| :--- | :--- | :--- | :--- |
| **0. 網域** | 民眾前台與管理後台的網址 | 一個自己的網域（例如 `example.org`） | 向任一網域註冊商購買，再到 Cloudflare 新增這個網域，並把註冊商那邊的 Nameserver 改成 Cloudflare 提供的兩組（生效約數小時到一天）。前台用主網域、後台用一層子網域（例如 `admin.example.org`），原因見 [第 6-A 節](#a-各環境設定對照表) |
| **1. 簡訊王（KotSMS）** | 發送手機 OTP 驗證碼簡訊 | 會員帳號（`KOTSMS_USERNAME`）、密碼（`KOTSMS_PASSWORD`） | 1. 需完成企業／組織**實名制簽名審核**（程式碼預設簽名為 `【島嶼守望】`，若簽名與核准名稱不符會被電信商攔截）。<br>2. 需在簡訊王後台將 **VM 固定外部 IP** 加入 API 白名單（未加會回傳 `statuscode=k`）。 |
| **2. 內政部 TGOS 門牌定位服務** | 地址正規化與坐標回傳門牌 | 兩項服務各自的 `APPID` 與 `API KEY`（共 4 組值） | 需向內政部 TGOS 申請 **「全國門牌位置比對服務」** 與 **「坐標回傳門牌服務」**，並填寫 IP 申請／異動表（**需蓋組織大小章用印**）綁定 **VM 固定外部 IP**，審核約需數個工作天。未設定時仍可儲存地址，僅無法自動定位。 |
| **3. SMTP2GO** | 寄送 Email 驗證碼與系統通知信 | API Key（`SMTP2GO_API_KEY`）與已驗證的寄件網域（`EMAIL_FROM`） | 需在 DNS 設定 SPF / DKIM 驗證寄件網域，線上即可完成。 |
| **4. Google Cloud OAuth 2.0** | Google 帳號一鍵登入 | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 在 Google Cloud Console 建立 Web 應用程式憑證，並將 `https://<前台網域>/api/v1/auth/oauth/google/callback` 加入 Authorized redirect URIs。 |
| **5. LINE Developers** | LINE 帳號一鍵登入 | `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET` | 建立 LINE Login Channel（狀態需設為 **Published** 才能讓一般民眾登入），Callback URL 填 `https://<前台網域>/api/v1/auth/oauth/line/callback`。 |
| **6. Cloudflare Zero Trust** | 網站 HTTPS 憑證與免開埠安全通道 | Tunnel Token（`TUNNEL_TOKEN`） | 將網域託管至 Cloudflare，於 Zero Trust 後台（Networks → Tunnels）建立一條 Cloudflared Tunnel 並複製 Token，再照 [第 6-B 節](#b-cloudflare-tunnel-公開網域路由表public-hostnames) 設定前台與後台兩筆 Public Hostnames。 |

---

### Step 2：定義環境名稱變數、保留固定 IP 並建立 GCP VM

> 主機是自己的電腦（情境 C）？跳過這一步，改做下面的 [Step 2 替代做法](#step-2-替代做法用自己的電腦當主機情境-c)。

在本機終端機先設定你的環境變數（**若為廠商自建環境，請將以下 6 個變數換成你自己的名稱**）：

```bash
# 👇 請換成你自己的 GCP 專案 ID、VM 名稱與備份 Bucket 名稱
export PROJECT_ID="wanguard-250923"
export ZONE="asia-east1-a"
export REGION="asia-east1"
export VM_NAME="wanguard-test-01"
export STATIC_IP_NAME="wanguard-prod-external-ip"
export GCS_BUCKET="gs://wanguard-250923-db-backups"

gcloud config set project "$PROJECT_ID"
```

接著保留固定外部 IP 並建立 VM（推薦規格：`e2-medium` 2 vCPU / 4 GB RAM，磁碟至少 30 GB，並直接賦予 `cloud-platform` 存取範圍）：

```bash
# 1. 保留固定外部 IP，並印出該 IP（請拿這個 IP 去簡訊王與 TGOS 登記白名單）
gcloud compute addresses create "$STATIC_IP_NAME" --region="$REGION"
STATIC_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --format='value(address)')
echo "VM 固定外部 IP 為: $STATIC_IP"

# 2. 建立 Ubuntu 24.04 LTS VM（掛載固定 IP，並開啟 cloud-platform API scope 以存取 Secret Manager 與 GCS）
gcloud compute instances create "$VM_NAME" \
  --zone="$ZONE" \
  --machine-type=e2-medium \
  --address="$STATIC_IP" \
  --scopes=cloud-platform \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-balanced

# 3. 查詢這台 VM 使用的 Service Account Email（下一步授權 Secret Manager 會用到）
VM_SA_EMAIL=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='value(serviceAccounts[0].email)')
echo "VM Service Account Email 為: $VM_SA_EMAIL"

# 4. 之後要授權讀金鑰、寫備份的對象就是這個 Service Account
export DEPLOY_MEMBER="serviceAccount:${VM_SA_EMAIL}"
```

> 💡 **若 VM 是事先建好的，怎麼查 `<vm-service-account-email>` 與調整 Scope？**
> - 查詢 Service Account Email：執行上方第 3 行 `gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='value(serviceAccounts[0].email)'`（或到 GCP Console → Compute Engine → VM 執行個體詳情頁查看「服務帳戶」）。
> - 若現有 VM 預設 Scope 沒有開 `cloud-platform`（會導致無法讀取 Secret Manager 或無法寫入 GCS），請先停機再修改：
>   ```bash
>   gcloud compute instances stop "$VM_NAME" --zone="$ZONE"
>   gcloud compute instances set-service-account "$VM_NAME" --zone="$ZONE" --scopes=cloud-platform
>   gcloud compute instances start "$VM_NAME" --zone="$ZONE"
>   ```

---

### Step 2 替代做法：用自己的電腦當主機（情境 C）

在那台 Ubuntu 24.04 電腦上安裝 `gcloud`，並登入一個可以管理這個 GCP 專案的 Google 帳號（之後 `deploy.sh` 也是用這個帳號讀金鑰、寫備份）：

```bash
# 1. 安裝 Google Cloud CLI（內含 gcloud 與 gsutil），裝完確認兩個指令都有版本號
sudo snap install google-cloud-cli --classic
gcloud --version && gsutil version

# 2. 登入（這台電腦沒有瀏覽器時，改用 gcloud auth login --no-launch-browser）
gcloud auth login

# 3. 👇 換成你自己的 GCP 專案 ID 與備份 Bucket 名稱
export PROJECT_ID="<你的-gcp-專案-id>"
export REGION="asia-east1"
export GCS_BUCKET="gs://<你的備份-bucket-名稱>"
gcloud config set project "$PROJECT_ID"

# 4. 之後要授權讀金鑰、寫備份的對象就是剛登入的帳號
export DEPLOY_MEMBER="user:$(gcloud config get-value account)"
echo "部署帳號為: $DEPLOY_MEMBER"
```

接著照 Step 3 做（Step 3 的指令同樣在這台電腦上執行）。

---

### Step 3：建立 GCP Secret Manager 金鑰與 GCS 備份儲存桶

```bash
# 1. 啟用 Secret Manager API 並建立 12 把 Secrets（資料庫與 JWT 密鑰自動隨機產生，其餘填入 Step 1 取得的憑證）
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

# 2. 授權部署用的身分（Step 2 或其替代做法設定的 $DEPLOY_MEMBER）讀取上述 12 把 Secrets
for s in staging-backend-postgres-password staging-backend-jwt-signing-key \
         staging-backend-smtp2go-api-key staging-backend-kotsms-username staging-backend-kotsms-password \
         staging-backend-google-client-secret staging-backend-line-channel-secret \
         staging-backend-tgos-addr-app-id staging-backend-tgos-addr-api-key \
         staging-backend-tgos-geo-app-id staging-backend-tgos-geo-api-key \
         staging-cloudflared-tunnel-token; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="$DEPLOY_MEMBER" \
    --role="roles/secretmanager.secretAccessor"
done

# 3. 建立資料庫備份 GCS Bucket 並設定 30 天自動刪除規則，同時授權部署身分寫入
gsutil mb -l "$REGION" "$GCS_BUCKET"
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/lc.json
gsutil lifecycle set /tmp/lc.json "$GCS_BUCKET"
gsutil iam ch "${DEPLOY_MEMBER}:objectAdmin" "$GCS_BUCKET"
```

---

### Step 4：進入主機設定 Swap、安裝 Docker 並下載專案

情境 B：SSH 連入剛建好的 VM（`gcloud compute ssh "$VM_NAME" --zone="$ZONE"`），在 VM 內執行。情境 C：直接在你的電腦上執行。

```bash
# 1. 設定 2 GB Swap（防止 4 GB 記憶體在建置 Next.js 時觸發 OOM Killer；8 GB 以上的電腦可略過）
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl -p /etc/sysctl.d/99-swappiness.conf

# 2.（僅情境 C）關閉休眠，避免電腦睡著後網站中斷
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# 3. 安裝 Docker Engine 與 Docker Compose Plugin（並將目前使用者加入 docker 群組）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker

# 4. 建立 /opt/wanguard 目錄並 clone 專案
#    自建環境（情境 B、C）請 clone「你自己的 fork」，原因見 Step 5；團隊重建自己的 Staging 才直接 clone GuangFuHero
sudo mkdir -p /opt/wanguard && sudo chown "$USER":"$USER" /opt/wanguard
git clone https://github.com/<你的帳號或組織>/optimized-version.git /opt/wanguard
```

---

### Step 5：（僅限自建新環境）在你的 fork 調整網域與 Bucket 名稱

**為什麼要 fork：** `deploy.sh` 每次都會切到 `origin/main` 再部署。如果直接 clone GuangFuHero 的專案、只在主機上 commit 修改，部署時會切回 GuangFuHero 的 `main`，你的網域與 Bucket 設定不會生效。所以請先在 GitHub 上把專案 fork 到你的帳號或組織，Step 4 clone 的是你的 fork，修改也 push 到你的 fork。

首次部署前，請在你的 fork 修改以下兩個檔案：
1. **[`Backend/scripts/deploy.sh`](Backend/scripts/deploy.sh)**
   - 第 22 行：`GCS_BUCKET="gs://<你的備份-bucket-名稱>"`
   - 第 273 行：部署完成後檢查的兩個網址，改成你的前台與後台網址（不改的話，第 2 節驗收清單（2-C）檢查到的會是團隊 Staging 的網址）
2. **[`Backend/scripts/deploy-config.staging.env`](Backend/scripts/deploy-config.staging.env)**：將 `SITE_APP_URL`、`ADMIN_APP_URL`、`APP_BASE_URL`、`OAUTH_REDIRECT_BASE_URL`、`AUTH_ALLOWED_ORIGINS`、`AUTH_COOKIE_DOMAIN`、`GOOGLE_CLIENT_ID`、`LINE_CHANNEL_ID` 改為你自己的網域與 Client ID，`EMAIL_FROM` 改成你在 SMTP2GO 驗證過的寄件信箱

最簡單的改法是直接在 GitHub 網頁上編輯你 fork 裡的這兩個檔案並 commit 到 `main`。主機不用另外設定 GitHub 帳號，`deploy.sh` 部署時會自己抓到最新版。**不要在主機上直接改檔案**：`deploy.sh` 會檢查 Git 工作目錄是否乾淨，有未 commit 的修改就會停止。

> 之後要拿光復超人的新版：在 GitHub 你的 fork 頁面按 **Sync fork**，再到主機執行 `./scripts/deploy.sh`。如果光復超人那邊也改過這兩個檔案，Sync fork 會提示衝突，要先手動合併。

---

### Step 6：執行第一次部署

在 VM 上執行：

```bash
cd /opt/wanguard/Backend

# 正式環境（乾淨資料庫，不載入測試假資料）
./scripts/deploy.sh

# 測試／展示環境（同時載入光復救災測試情境與假帳號）
SEED_MOCK=true ./scripts/deploy.sh
```

> 註：第一次部署時會看到 `WARNING: no existing backend container — image rollback unavailable for this first deploy`，這是正常現象（因為還沒有上一版容器可標記為 `:prev`），從第二次部署起就會啟用自動回滾保護。

---

### Step 7：建立第一個超級管理員帳號（`super_admin`）

依你在 Step 6 選擇的是正式環境還是測試環境，建立管理員的方式不同：

#### 正式環境（未載入 `SEED_MOCK` 假資料）
正式環境的資料庫一開始只有 RBAC 角色定義（由 `seed_rbac.py` 自動建立），沒有任何使用者帳號。請按以下 2 步建立第一位超級管理員：
1. 先打開你的民眾前台網址（例如 `https://wan-guard.com`），用你自己的真實信箱（或手機）**註冊一個帳號並完成驗證碼驗證**。
2. 回到 VM 終端機，執行 [`Backend/scripts/bootstrap_admin.py`](Backend/scripts/bootstrap_admin.py) 將該帳號指派為全站第一位 `super_admin`：
   ```bash
   cd /opt/wanguard/Backend
   sudo docker compose -f docker-compose.staging.yml run --rm -e PYTHONPATH=/app backend \
     python -m scripts.bootstrap_admin email <你剛註冊並驗證的信箱>
   # 若用手機註冊，則改為：python -m scripts.bootstrap_admin phone <你的手機號碼>
   ```
   看到印出 `Granted super_admin to ...` 後，重新整理管理後台網址即可進入管理平台（此腳本預設只允許建立第一位 `super_admin` 以防誤觸；若日後需額外指派可加 `--force` 參數，或直接由第一位管理員在後台介面指派）。

#### 測試／展示環境（有載入 `SEED_MOCK=true`）
測試種子已預先建立 `asuper01@mock.test`（超級管理員）與 `aaudit01@mock.test`（資料檢核員），但基於安全考量預設未設密碼。請在 VM 上執行以下指令為它們設定密碼即可登入後台：
```bash
cd /opt/wanguard/Backend
sudo docker compose -f docker-compose.staging.yml run --rm -e PYTHONPATH=/app backend \
  python -m scripts.set_password asuper01@mock.test
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
| **（自己的電腦）手機收不到簡訊驗證碼、門牌定位失敗** | 多半是對外 IP 和簡訊王、TGOS 登記的不一樣（家用網路的浮動 IP 會變）。執行 `curl -4 -s https://ifconfig.me` 對照登記的 IP；不一樣就要向 ISP 申請固定 IP，或重新登記。 |
| **（自己的電腦）重開機後網站沒有回來** | 執行 `sudo systemctl enable --now docker` 確認 Docker 會隨開機啟動，再到 `/opt/wanguard/Backend` 執行 `docker compose -f docker-compose.staging.yml ps` 看容器狀態。 |
