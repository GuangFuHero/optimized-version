---
feature: 06-map-decision-support
title: 即時決策輔助與地圖繪製
status: definition
owner:
depends_on: [04-rbac, 05-member-management, 07-resource-station, 08-ticket-management, 09-emergency-announcement]
design:
---

# Feature PRD — 即時決策輔助與地圖繪製 (Map Decision Support & Drawing)

> **根基文件：** [`user-stories.md`](user-stories.md)（角色、情境、使用者目標——請先讀這份）
> **關聯文件：** `research/map-performance-offline-geometry-patterns.md`、[user-journey.md](../../user-journey.md)

---

## 核心概念：兩種 Zone、一張地圖

* **Assignment Zone（指派區）**：把任務批次交給某 Team，決定「誰負責這片區域」。
* **Hazard Zone（危險區）**：標記風險，讓範圍內 Ticket 自動帶警告，決定「哪裡不能貿然進入」。
* 兩者疊在同一張地圖的多圖層上，並與 [[08-ticket-management]] 的 Ticket / Building Anchor、[[07-resource-station]] 的資源站共享底圖與聚合策略。

---

## 使用者情境

* **角色：** Super Admin、Government（主要繪製者）、Data Auditor、Team Admin / Member（檢視自家責任區）
* **場景：**
  * 災害發生時，Government 需快速「劃出 A 區交給慈濟、B 區交給壯闊台灣、C 區是危險禁區」，讓對應 Team 立即看到自家區域內所有任務。
  * 後台人員在山區或無門牌地區，需透過電線桿編號定位。
  * 災害預警圖層（土石流潛勢區、淹水警戒）需即時疊在地圖上輔助決策。
* **痛點 / 觸發點：**
  * 紙本劃區效率低、易誤分發；現場人員與後台脫節。
  * 沒有結構化的危險區標註 → 救援人員可能進入未知風險區。
  * 多個圖層資訊散落 → 需切換多個系統。

---

## IDEAL Case

> 理想體驗的高層敘事；逐步分支邏輯見「User Flow」。

1. **Government 劃區指派**：選繪圖工具拉出範圍，右下角即時顯示「框內 47 個任務 / 3 個資源站」，命名並指派 Team，確認後 5 秒內可 Undo，目標 Team Admin 立即收到通知。
2. **Super Admin 標危險區**：用圓形工具圈出瓦斯外洩半徑，設 Hazard Zone 與嚴重度，範圍內所有 Ticket 自動加「位於危險區」標籤，重疊的 Assignment Team 收優先警示。
3. **電線桿定位**：搜尋框輸入電線桿編號，3 秒內地圖跳轉標記，直接在該位置建 Ticket、座標自動代入。
4. **結果：** 劃區、避險、定位都在同一張地圖完成，現場與後台對「誰負責、哪裡危險、人在哪」沒有落差。

---

## User Story

### 地圖繪製
* As a **Government 成員**，I want **在地圖上以多種繪圖工具劃定區域並指派給 Team**，so that **能批次分配任務而不需逐一點選**。
* As a **Super Admin**，I want **標註危險區域並讓系統自動連動範圍內 Ticket**，so that **救援人員不會進入未知風險區**。
* As a **Team Admin**，I want **看到自家被指派的所有 Zone 邊界**，so that **掌握責任範圍與資源分布**。

### 即時決策
* As a **後台應變人員**，I want **用電線桿編號搜尋位置**，so that **快速定位山區無門牌地區的事故點**。
* As a **後台應變人員**，I want **在同一個地圖頁面看到所有決策相關圖層**，so that **不需切換系統即可做決策**。
* As a **Government 成員**，I want **即時預覽繪製範圍內物件數量**，so that **避免不小心把過多任務丟給單一 Team**。

---

## 功能需求

### F1. 繪圖工具列（Floating Pill Toolbar）

#### F1.1 工具選項
| 工具 | 圖示 | 用途 | 可用角色 |
| --- | --- | --- | --- |
| **矩形** | ▢ | 快速框選大致範圍 | Super Admin, Government |
| **多邊形** | ⬠ | 精確邊界（最多 100 頂點） | Super Admin, Government |
| **圓形** | ◯ | 中心 + 半徑（適用爆炸 / 污染擴散） | Super Admin, Government |
| **手繪** | ✎ | 自由形狀（自然邊界） | Super Admin, Government |
| **單點 Pin** | ⊕ | 標危險點（不是區域） | Super Admin, Government |

#### F1.2 工具列行為
* 預設摺疊為單一 ✎ 按鈕，點開展開所有工具。
* Mobile (< 768px) 改為底部抽屜，觸控頂點 ≥ 24px。
* 工具觸發時游標變十字，ESC / 右鍵取消。

---

### F2. Zone 資料模型

#### F2.1 Assignment Zone（指派區域）
* **顏色**：藍色系，每 Team 自動分配獨立色票。
* **屬性**：name（必填）、geometry (polygon / circle / rectangle)、assigned_team_id、disaster_event_id、expires_at（可選，預設無）、created_by / created_at / updated_at。
* **連動**：建立後系統列出範圍內所有 Ticket 並批次指派 `assigned_team_id`。
* **可重疊**：允許，但同 Ticket 不可同時屬於兩個 Assignment Zone（最後指派覆蓋並警告）。

#### F2.2 Hazard Zone（危險區域）
* **顏色**：紅色系，依 hazard_level 漸層。
* **屬性**：name（必填）、geometry、hazard_level (`low`/`medium`/`high`/`critical`)、hazard_type (`gas_leak`/`chemical`/`radiation`/`structural`/`flood_water`/`landslide_risk`/`fire_spread`/`other`)、description、effective_until、created_by / created_at / updated_at。
* **連動**：範圍內所有現有與未來 Ticket 自動加 `hazard_zone_ids[]` 並顯示警告圖示。
* **可重疊**：允許，UI 取最高 hazard_level 顯示。
* **自動失效**：預設 24 小時自動 expired（UI 隱藏、資料保留），**可自訂效期**，且**到期前提醒可延長**，避免危險區默默消失（與 [[09-emergency-announcement]] 公告到期同語彙）。

> 暫不新增「避難集合點」「物資集散」等 Zone 類型，這些用 Pin / Resource Station 處理。

---

### F3. 繪製流程狀態機

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Drawing: 點擊工具
  Drawing --> Preview: 完成形狀
  Drawing --> Idle: ESC 取消
  Preview --> Annotate: 點繼續
  Preview --> Idle: 取消
  Annotate --> Confirm: 點儲存
  Annotate --> Preview: 修改形狀
  Confirm --> Saved: 確認
  Confirm --> Annotate: 取消
  Saved --> Persisted: 5 秒後
  Saved --> Drawing: Undo 5 秒內
  Persisted --> [*]
```

| 狀態 | 表現 |
| --- | --- |
| **Idle** | 工具列摺疊，地圖為瀏覽模式 |
| **Drawing** | 游標十字，形狀邊框 dashed |
| **Preview** | 形狀填色 30% 透明，邊框 2px solid；**右下角浮動標籤顯示「N 個任務 / M 個資源站」** |
| **Annotate** | 側抽屜開啟，填寫名稱、類型、Team（若 Assignment）、描述 |
| **Confirm** | Modal「將 N 個任務指派給 Team T？」+ 確認 / 取消 |
| **Saved** | Toast「已建立 Zone」+ 倒數 5 秒 Undo 按鈕 |
| **Persisted** | 持久化進資料庫，所有訂閱者收到 push |

---

### F4. 即時預覽（範圍內物件計數）

* 繪製進行中即時 hit-test 範圍內：Ticket 總數（依狀態分：待開始 / 進行中 / 完成）、Resource Station 總數、已被其他 Team 認領的 Ticket 數（顯示衝突警示）。
* 計數面板浮在地圖右下角，跟隨形狀邊界更新（延遲 < 100ms）。
* 若 > 100 物件，加紅色警示「⚠️ 任務數較多，請確認指派目標」。
* **實作**：以 Turf.js + 空間索引（rbush）做 bbox 預篩再精算；座標統一 WGS84。

---

### F5. Undo / Conflict / 5 秒回復

* 儲存後 Toast 顯示「已建立 Zone X 並指派 N 個任務給 T」，倒數 5 秒可點 **Undo** 完全撤回。
* 若 5 秒內被其他人改動 → Undo 失效並提示。
* Undo 動作寫入 Audit Log。

---

### F6. 圖層管理（Layer Popover）

#### F6.1 預設圖層（由上到下）
1. 🚨 Active Ticket Markers
2. 🏢 Building Anchors（聚合的 Ticket 群）
3. 📍 Resource Station Markers
4. ⚠️ Hazard Zone Polygons
5. 🔷 Assignment Zone Polygons（依 Team 色票）
6. 🛣️ 電線桿編號（CSV 點集）
7. 🌊 災害預警圖層（外部資料整合）
8. 🗺️ OpenStreetMap 底圖

#### F6.2 每層控制
* 開 / 關、透明度 (0–100%)、圖例（Legend）、限定篩選（如 Assignment Zone 可只看「我家 Team」）。

---

### F7. 電線桿編號圖層

* CSV 數據整合，每筆含 pole_id, lat, lng, area, voltage。
* 搜尋框輸入 pole_id → 3 秒內地圖定位。
* 點擊電線桿 Pin 可一鍵建 Ticket，座標代入。

---

### F8. 災害預警圖層

* 整合 NCDR / 氣象局 / 內政部公開 API，顯示延遲 < 5 分鐘。
* 圖層依災害類型有獨立色帶（地震輻、淹水區、土石流潛勢）。

---

### F9. Zone 衝突規則

| 情境 | 規則 |
| --- | --- |
| 同類型 Zone 邊界重疊 | 允許，顯示「N 個重疊」標籤 |
| Hazard 覆蓋既有 Assignment Zone | 允許，Assignment Team Admin 收高優先警示 |
| 同 Ticket 同時落入兩個 Assignment Zone | **不允許**重複指派；最後建立的 Zone 覆蓋，並顯示衝突通知 |
| 同 Team 多個 Assignment Zone 重疊 | 允許，視為同一責任區 |
| 已過期 Hazard Zone | 自動隱藏並標記 expired，不刪除 |

---

### F10. 編輯與刪除權限

| 動作 | Super Admin | Government | Team Admin | Data Auditor |
| --- | :---: | :---: | :---: | :---: |
| 建立 Assignment Zone | ✓ | ✓ | — | — |
| 編輯 Assignment Zone（建立者 + Super Admin）| ✓ | ✓（自建）| — | — |
| 刪除 Assignment Zone | ✓ | — | — | — |
| 建立 Hazard Zone | ✓ | ✓ | — | — |
| 編輯 / 刪除 Hazard Zone | ✓ | ✓（自建）| — | — |
| 變更 Zone 指派目標 Team | ✓ | ✓ | — | — |
| 查看自家被指派 Zone | ✓ | ✓ | ✓（自家）| ✓ |

---

### F11. 效能、幾何正確性與離線

#### F11.1 效能與聚合
* 採 **marker clustering + WebGL / vector tiles**，目標在數千～上萬點仍流暢平移縮放（取代早期「≤500 markers 60fps」的天花板）。
* 電線桿 CSV 預切 vector tiles。
* 視覺 clustering 與 [[08-ticket-management]] 的語意 Building Anchor 群組化**並存**——兩者是不同層次，可疊加。

#### F11.2 繪製幾何正確性
* 即時偵測多邊形自相交並提示。
* 手繪做頂點簡化（Douglas–Peucker），避免上千頂點。

#### F11.3 離線 / 弱網
* v1 至少做到「**離線可讀已載入資料 + 降級提示（資料截至 HH:MM）+ 連線後重試送出**」。
* 重點災區預載底圖磚（與 [[07-resource-station]] 離線匯出呼應）。

---

## User Flow

### Flow 1 — Government 劃區指派

```mermaid
flowchart TD
  A[Government 進入地圖工作台] --> B[預設進入 Draw Zone 模式]
  B --> C[展開繪圖工具列]
  C --> D[選擇工具：矩形 / 多邊形 / 圓 / 手繪]
  D --> E[在地圖上繪製形狀]
  E --> F[即時顯示 N 個任務 / M 個資源站]
  F --> G[完成繪製 → Preview]
  G --> H[側抽屜：選 Zone 類型 = Assignment]
  H --> I[命名 + 選 Team + 設過期]
  I --> J[點儲存 → Confirm Modal]
  J --> K{確認?}
  K -->|是| L[儲存 → Toast 5 秒 Undo]
  K -->|否| H
  L --> M[Team Admin 收通知]
  L --> N[Ticket 批次更新 assigned_team]
```

### Flow 2 — Super Admin 標記危險區

```mermaid
flowchart TD
  A[Super Admin 收瓦斯外洩通報] --> B[切換地圖工作台]
  B --> C[選圓形工具 → 點中心 → 拉半徑]
  C --> D[Preview: 顯示 14 個 Ticket 將被標記]
  D --> E[側抽屜選 Hazard Zone]
  E --> F[填 hazard_level=high, type=gas_leak]
  F --> G[設 effective_until=24h]
  G --> H[儲存 → 範圍內 Ticket 加警告]
  H --> I[Assignment Zone 重疊的 Team 收警示]
```

### Flow 3 — Team Admin 查看自家責任區

```mermaid
flowchart TD
  A[Team Admin 登入] --> B[地圖預設只顯示自家被指派 Zone]
  B --> C[點擊 Zone 邊界 → 抽屜顯示 Zone 詳情]
  C --> D[列出該 Zone 內所有 Ticket + 進度]
  D --> E[切換 Zone 內視圖 / 地圖 / 表格]
```

---

## 驗收標準

- [ ] Government 可用矩形 / 多邊形 / 圓 / 手繪 / Pin 五種工具在地圖上繪製形狀。
- [ ] 繪製進行中右下角即時顯示範圍內 Ticket 與 Resource Station 數量，更新延遲 < 100ms。
- [ ] 儲存 Zone 後 Toast 顯示 5 秒 Undo 按鈕，點擊可完全撤回。
- [ ] Assignment Zone 建立後 3 秒內，範圍內所有 Ticket 的 `assigned_team_id` 被批次更新，且該 Team Admin 收到通知。
- [ ] Hazard Zone 建立後，範圍內現有與未來 Ticket 自動加 `hazard_zone_ids[]`。
- [ ] Hazard Zone 預設 24 小時自動 expired（UI 隱藏、資料保留），可自訂效期、到期前可提醒延長。
- [ ] 同 Ticket 被指派到兩個 Assignment Zone 時，後建立者覆蓋並顯示衝突警告。
- [ ] Team Admin 與 Team Member 進入地圖時，預設僅顯示自家責任 Zone（可手動切到全域）。
- [ ] 電線桿編號搜尋 3 秒內定位並標記。
- [ ] 採 clustering + WebGL/vector tiles，數千～上萬點仍可流暢平移縮放。
- [ ] 多邊形自相交即時偵測並提示；手繪做頂點簡化。
- [ ] 離線可讀已載入資料並顯示「資料截至 HH:MM」，連線後可重試送出。
- [ ] Mobile (< 768px) 繪製工具改為底部抽屜，觸控頂點 ≥ 24px。

---

## 開放問題

> 效能/聚合、幾何正確性、離線策略、Hazard 效期、Zone 編輯後 Ticket 重算等已定調寫入規格；以下為仍待決或排程 v2 者。

- [ ] **行政區 SHP 圖資**（v2）：匯入台灣行政區界轉 GeoJSON 預載，劃區可「吸附」行政區界以減少誤差？
- [ ] **沿線 Buffer 工具**（v2）：Turf.js `buffer` 低成本，但 v1 非必要。
- [ ] **跨 Team 協作 Zone**：是否支援一個 Zone 指派給多個 Team？傾向**否**（避免責任不清），待確認。
- [ ] **Zone 編輯後 Ticket 重算**：邊界移動後，移出範圍的 Ticket 標「已不在 Zone 內」，由 Government 決定是否解除指派——此處理方式是否採用？
- [ ] **Team Admin 自家責任區內畫子區**（v2）：是否開放？
- [ ] **Zone 命名規範**：自由命名 + 提供「行政區 + 流水號」預設樣板（如「花蓮市 #1」）是否足夠？

---

## 相關 Feature

* [[07-resource-station]] — 資源站地圖視圖、離線匯出呼應
* [[08-ticket-management]] — 任務與 Zone 關聯、批次指派、Building Anchor 群組化
* [[05-member-management]] — Zone 指派目標來自 Team 列表
* [[04-rbac]] — Zone 編輯權限
* [[09-emergency-announcement]] — Hazard 嚴重度與公告分級對齊
