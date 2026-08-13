# Notification system - manual testing & verification guide
> 本手冊提供「通知中心後端系統」的端對端手動測試步驟、環境架設、假資料播種以及各情境之 `curl` 驗證指令與預期回傳。

---

## 1. 環境啟動與初始化 (Environment setup)

### 1.1 啟動資料庫與快取 (Podman / Docker)
確保 PostgreSQL (PostGIS) 與 Redis 容器於背景運行：

```bash
# 若使用 Podman (macOS 需先啟動 VM)
podman machine start
cd Backend && podman compose up db redis -d

# 若使用 Docker
cd Backend && docker compose up db redis -d
```

### 1.2 執行資料庫遷移 (Alembic migration)
在 `Backend/` 目錄下執行 Migration，建立 `notifications` 資料表與複合索引：

```bash
cd Backend
source .venv/bin/activate
alembic upgrade head
```

### 1.3 注入真實測試資料 (Seed fake data)
執行假資料播種腳本（具備自清重設機制，多次執行亦保持狀態乾淨）：

```bash
python3 scripts/seed_fake_notifications.py
```

執行後終端機將印出測試人員與預先生成的 JWT Access Token：
* 👤 **Alice (陳隊長 - NGO Admin)**：3 則未讀（含 1 則 Urgent ⚠️ 緊急分區指派）
* 👤 **Bob (林志工 - NGO Member)**：2 則未讀（含 1 則 Task 📌 任務派工）
* 👤 **Charlie (王專員 - Gov Admin)**：1 則未讀（含 1 則 🏢 站點物資狀態）

---

## 2. 啟動後端伺服器 (Start backend server)

```bash
cd Backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
> 後端服務將於 `http://localhost:8000` 啟動，可透過 Swagger 文件 `http://localhost:8000/docs` 查看完整 API 規格。

---

## 3. 手動測試步驟與 `curl` 指令 (Manual test scenarios)

### 測試 1：查詢 Alice（隊長）的未讀通知統計 (`GET /unread-count`)
驗證點：未讀數為 3，且 `has_urgent` 為 `true`（會觸發前端紅點與緊急 Toast 快訊）。

```bash
curl -s -X GET http://localhost:8000/api/v1/notifications/unread-count \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NThkMDk2MS1mNTUyLTQwYmItYjgwOC00MTk2M2Q3MGExYmQiLCJleHAiOjE3ODY0MzAwMzgsImlhdCI6MTc4NjQyOTEzOCwidHlwZSI6ImFjY2VzcyIsImp0aSI6IjgxZGEzOWIyNzAxODhkZmM5YTIyOGM0NmUyMTYxOGEzIiwic2lkIjpudWxsfQ.irMKzyncDO70ZzDBZpF8G501YxBcen-3DRPl2vn-M-c" | json_pp
```

**預期回傳 (Expected output)**:
```json
{
   "has_urgent" : true,
   "unread_count" : 3
}
```

---

### 測試 2：查詢 Alice 的分頁未讀通知清單 (`GET /notifications`)
驗證點：依建立時間降序回傳，包含緊急工作分區指派、物資站更新、全站公告。

```bash
curl -s -X GET "http://localhost:8000/api/v1/notifications?unread_only=true" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NThkMDk2MS1mNTUyLTQwYmItYjgwOC00MTk2M2Q3MGExYmQiLCJleHAiOjE3ODY0MzAwMzgsImlhdCI6MTc4NjQyOTEzOCwidHlwZSI6ImFjY2VzcyIsImp0aSI6IjgxZGEzOWIyNzAxODhkZmM5YTIyOGM0NmUyMTYxOGEzIiwic2lkIjpudWxsfQ.irMKzyncDO70ZzDBZpF8G501YxBcen-3DRPl2vn-M-c" | json_pp
```

**預期回傳 (Expected output)**:
```json
{
   "has_more" : false,
   "items" : [
      {
         "priority" : "urgent",
         "read" : false,
         "ref_type" : "work_zone",
         "title" : "⚠️ 【緊急】新工作分區指派通知",
         "type" : "zone_assigned"
      },
      {
         "priority" : "medium",
         "read" : false,
         "ref_type" : "station",
         "title" : "🏢 責任區物資站狀態更新：花蓮體育館",
         "type" : "resource_station_updated"
      },
      {
         "priority" : "medium",
         "read" : false,
         "ref_type" : "announcement",
         "title" : "📢 全站公告：中央災害應變中心二級開設",
         "type" : "announcement_published"
      }
   ],
   "page" : 1,
   "page_size" : 20,
   "total" : 3
}
```

---

### 測試 3：單筆通知標記為已讀 (`PATCH /notifications/{uuid}/read`)
模擬使用者在畫面上點擊某則通知：

```bash
# 取得第一筆緊急通知的 UUID
TARGET_UUID=$(curl -s -X GET "http://localhost:8000/api/v1/notifications?page=1&page_size=1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NThkMDk2MS1mNTUyLTQwYmItYjgwOC00MTk2M2Q3MGExYmQiLCJleHAiOjE3ODY0MzAwMzgsImlhdCI6MTc4NjQyOTEzOCwidHlwZSI6ImFjY2VzcyIsImp0aSI6IjgxZGEzOWIyNzAxODhkZmM5YTIyOGM0NmUyMTYxOGEzIiwic2lkIjpudWxsfQ.irMKzyncDO70ZzDBZpF8G501YxBcen-3DRPl2vn-M-c" | grep -o '"uuid":"[^"]*' | head -1 | cut -d'"' -f4)

# 標記為已讀
curl -s -X PATCH "http://localhost:8000/api/v1/notifications/${TARGET_UUID}/read" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NThkMDk2MS1mNTUyLTQwYmItYjgwOC00MTk2M2Q3MGExYmQiLCJleHAiOjE3ODY0MzAwMzgsImlhdCI6MTc4NjQyOTEzOCwidHlwZSI6ImFjY2VzcyIsImp0aSI6IjgxZGEzOWIyNzAxODhkZmM5YTIyOGM0NmUyMTYxOGEzIiwic2lkIjpudWxsfQ.irMKzyncDO70ZzDBZpF8G501YxBcen-3DRPl2vn-M-c" | json_pp
```

**預期回傳**:
```json
{
   "read" : true,
   "read_at" : "2026-08-11T06:18:35Z"
}
```

再次查詢 Alice 的未讀統計，`unread_count` 由 **3 降為 2**，且因為緊急通知已被讀取，`has_urgent` 自動變為 `false`：
```json
{
   "has_urgent" : false,
   "unread_count" : 2
}
```

---

### 測試 4：一鍵全部標記為已讀 (`PATCH /read-all`)

```bash
curl -s -X PATCH http://localhost:8000/api/v1/notifications/read-all \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NThkMDk2MS1mNTUyLTQwYmItYjgwOC00MTk2M2Q3MGExYmQiLCJleHAiOjE3ODY0MzAwMzgsImlhdCI6MTc4NjQyOTEzOCwidHlwZSI6ImFjY2VzcyIsImp0aSI6IjgxZGEzOWIyNzAxODhkZmM5YTIyOGM0NmUyMTYxOGEzIiwic2lkIjpudWxsfQ.irMKzyncDO70ZzDBZpF8G501YxBcen-3DRPl2vn-M-c" | json_pp
```

**預期回傳**:
```json
{
   "updated_count" : 2
}
```
> Alice 的未讀數現在歸零：`{"unread_count": 0, "has_urgent": false}`。

---

### 測試 5：使用者與角色權限隔離驗證 (Role isolation)
驗證點：Alice 將自己的通知讀完，完全不影響隊員 Bob 的未讀通知數。

```bash
curl -s -X GET http://localhost:8000/api/v1/notifications/unread-count \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlOWQ5ZTFmZS04OGZlLTQ4ODctYWFhNy1mM2U4NzhlYmIxY2UiLCJleHAiOjE3ODY0MzAwMzgsImlhdCI6MTc4NjQyOTEzOCwidHlwZSI6ImFjY2VzcyIsImp0aSI6IjNlMDMxM2MyYmM4MWJmMzcwMjcwM2NlN2I4MWY4MDc0Iiwic2lkIjpudWxsfQ.3Z-yec2qOUJUX1DMlQg2bsf8LtDrXBM_-ojvwj5oR3A" | json_pp
```

**預期回傳**:
```json
{
   "has_urgent" : false,
   "unread_count" : 2
}
```

---

### 測試 6：資安防護測試（IDOR 越權攻擊防禦）
**情境**：Bob 嘗試使用自己的 Token 去修改 Alice 的通知為已讀。

```bash
curl -s -X PATCH "http://localhost:8000/api/v1/notifications/${TARGET_UUID}/read" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlOWQ5ZTFmZS04OGZlLTQ4ODctYWFhNy1mM2U4NzhlYmIxY2UiLCJleHAiOjE3ODY0MzAwMzgsImlhdCI6MTc4NjQyOTEzOCwidHlwZSI6ImFjY2VzcyIsImp0aSI6IjNlMDMxM2MyYmM4MWJmMzcwMjcwM2NlN2I4MWY4MDc0Iiwic2lkIjpudWxsfQ.3Z-yec2qOUJUX1DMlQg2bsf8LtDrXBM_-ojvwj5oR3A" | json_pp
```

**預期回傳 (防探測 404)**:
```json
{
   "detail" : "通知不存在或無權限操作"
}
```

---

## 4. 自動化測試執行 (Automated tests)

在 `Backend/` 目錄下一鍵執行所有通知單元與整合測試：

```bash
cd Backend
PYTHONPATH=. .venv/bin/pytest tests/test_notification*
```

**預期輸出**:
```text
======================== 15 passed, 4 warnings in 0.31s ========================
```
