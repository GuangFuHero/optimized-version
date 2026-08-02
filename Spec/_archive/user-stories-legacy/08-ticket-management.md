# User Stories — 任務管理 (Ticket Management)

本文件是由 `product/prd/08-ticket-management/prd.md` 提取出的 User Stories。

### 災害類型欄位群組
* **As a** Super Admin，**I want** 啟動災害事件並選擇災害類型，**so that** 新建 Ticket 自動套用對應欄位群，現場人員不用每次選。
* **As a** Super Admin，**I want** 複合災害發生時增加災害類型，欄位群聯集疊加，**so that** 不會遺漏任何災害的關鍵資訊。
* **As a** Team Member，**I want** 在新建 Ticket 時看到分組顯示的欄位（共通 / 水災 / 火災），**so that** 能聚焦填寫不混亂。

### 直立救援
* **As a** Team Member，**I want** 填樓層 ≥ 2F 時自動觸發直立救援必填，**so that** 不會忘記填關鍵的結構評估欄位。
* **As a** Super Admin / Government / Team Admin，**I want** 對某建築一鍵啟動直立救援，連動所有同建築 Ticket，**so that** 所有負責成員都知道此建築進入垂直救援模式。
* **As a** Team Member（一樓求救任務），**I want** 不要被直立救援必填卡住，**so that** 平地任務不受高樓救援欄位干擾。

### Ticket 群組化
* **As a** Data Auditor，**I want** 看到 AI 建議的群組候選並一鍵確認，**so that** 快速整理地圖上的重疊標點。
* **As a** Team Admin，**I want** 在地圖上看到聚合的建築錨點而不是 10 個重疊標點，**so that** 能清楚掌握同建築多任務的全貌。

### 任務管理 (Table / 地圖與操作)
* **As a** Government 成員，**I want** 拉框批次指派任務，**so that** 節省逐筆操作時間。
* **As a** Data Auditor，**I want** 並排對比 AI 標記的疑似重複任務，**so that** 快速合併或拒絕。
* **As a** Super Admin，**I want** 看到志工缺口比例與警示，**so that** 能主動調度資源。
* **As a** Super Admin，**I want** 對極高優先任務一鍵啟動「立刻救援」，**so that** 立即提升優先級。
