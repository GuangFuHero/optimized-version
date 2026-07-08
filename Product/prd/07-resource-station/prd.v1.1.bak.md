# Feature PRD — 資源站管理 (Resource Station)

> **版本：** v1.1 — 拆細修改建議資料模型、衝突/版本、營運狀態快速通道、站點欄位與離線匯出（建議形式，未推翻 v1.0）
> **日期：** 2026-06-10
> **狀態：** Definition Phase
> **所屬功能：** 資源站管理 Resource Station（ManagerEnd 核心模組）
> **關聯文件：** `research/crowdsourced-poi-moderation-patterns.md`、`ai-context/decisions-log.md`、`product/user-journey.md`、`design/foundation/design-principles.md`、`UI-UX-Analysis.md`

> 🟡 **v1.1 補充說明**：v1.0 列出 CRUD + 審查 + 雙視圖正確，但缺「建議怎麼存、衝突怎麼解、能不能回溯、高時效狀態怎麼快更、站點到底有哪些欄位」。本版以群眾外包 POI 平台（OSM / Google Maps / Wikidata）的成熟作法拆細，標 🟡。研究依據見 [`research/crowdsourced-poi-moderation-patterns.md`](research/crowdsourced-poi-moderation-patterns.md)。
>
> ⚠️ **一致性質疑**：v1.0 §使用者情境寫「NGO（僅限指派區域檢視）」，但 [[04-rbac]] 的資料可見性矩陣把 Resource Station 列為**所有角色全部可見**（資源站屬公共資訊）。兩者矛盾——建議以 04-rbac 為準（資源站全可見，匯出可限自家區域），請 v1.0 該句更新對齊。

---

## 使用者情境

* **角色：** Data Auditor（審查與編輯）、Super Admin（完整操作含刪除）、NGO（僅限指派區域檢視）
* **場景：** 災害期間，各類物資收發站、避難所等資源站點不斷增減，前台使用者也會主動提交錯誤修正建議。後台需要一個統一的介面來管理站點資料、審查修改建議，並掌握各區域的站點分布。
* **痛點 / 觸發點：** 若站點資料不準確或更新不及時，民眾可能前往已關閉的站點，造成二次困難；同時，大量前台提交的修改建議若無系統化審查流程，容易積壓或遺漏。

---

## IDEAL Case

1. Data Auditor 打開資源站管理頁，在 Table 視圖中快速用「新北市 / 避難所 / 營運中」篩選出目標站點。
2. 看到前台提交的修改建議佇列，並排對比原始資料與建議修改，一鍵核准或直接調整後核准。
3. 切換到地圖視圖，直觀看到各區域站點的分布密度，發現某區域明顯空白後，在地圖上直接新增站點。
4. 所有操作自動記錄操作者與時間，之後可追溯。
5. **結果：** 前台看到的資源站資訊永遠是最新且經過審查的，民眾前往時不會撲空。

---

## User Story

* As a **Data Auditor**，I want **審查前台使用者提交的站點修改建議**，so that **確保資源站資料準確而不需要從頭人工核查**。
* As a **Data Auditor**，I want **在地圖上直接新增資源站**，so that **能在看到空白區域時立即補充，而不需要切換到另一個頁面填表**。
* As a **後台管理人員**，I want **用地區、類型、狀態篩選站點列表**，so that **在大量站點中快速找到需要的資訊**。
* As a **NGO 成員**，I want **匯出負責區域的站點資料**，so that **能在沒有網路的現場使用離線清單**。

---

## 功能需求

### Table + BI 表格視圖

* **統計資訊**：
  * 顯示站點總數量。
  * 支援以下維度進行 Filter 篩選：地區、類型、成立時間、營運狀態。
* **操作歷史紀錄**：
  * 記錄每個站點的操作歷史，包含開設者、細節變更人等資訊。

### 地圖視圖

* 整合 **OpenStreetMap API** 或衛星圖資進行顯示。

### 前台修改建議審查

* 審查前台使用者提交的站點修改建議。
* 操作選項：核准 / 拒絕 / 直接調整。
* **存取限制**：僅限 Data Auditor 與 Super Admin 執行。

### 編輯動作 (CRUD)

| 操作 | 可執行角色 |
|------|-----------|
| 新增站點 | Data Auditor、Super Admin |
| 編輯站點 | Data Auditor、Super Admin |
| 刪除站點 | **僅限 Super Admin** |

---

## 拆細規格（v1.1）

> 詳見 [`research/crowdsourced-poi-moderation-patterns.md`](research/crowdsourced-poi-moderation-patterns.md)。模糊處標 🟡，未推翻 v1.0。

### R1. 站點資料模型（v1.0 未列完整欄位，🟡 建議）

```yaml
ResourceStation:
  id, name
  station_type: shelter | supply | medical | water | charging | other
  coordinate {lat,lng}, address, admin_area     # 行政區供篩選與 06 圖層
  operational_status: open | paused | closed | full
  capacity?, current_load?                       # 容量/目前使用（避難所）
  supplies?: [ {item, level} ]                   # 物資盤點
  contact_name?, contact_phone?, opening_hours?
  established_at, created_by
  source: official | crowdsourced                # 官方 vs 群眾投稿
  verified: bool, verified_by, verified_at
  updated_at
```

* 🟡 **建議**：站點資料與 [[06-map-decision-support]] 的「Resource Station Markers」圖層**共用單一真實來源**（single source of truth），避免兩處不同步。

### R2. 修改建議資料模型（🟡 建議：proposal，不直接覆蓋）

> v1.0 只說「審查前台建議（核准/拒絕/調整）」。應以獨立 proposal 物件承載，原資料在核准前不動，才能精準並排對比與偵測衝突。

```yaml
StationEditSuggestion:
  id, station_id
  submitted_by (前台 user)
  base_version: int        # 投稿時所根據的站點版本（用於衝突偵測）
  changes: { field: {old, new}, ... }   # 欄位級 diff
  status: pending | approved | rejected | superseded
  reviewed_by, reviewed_at, reason
```

### R3. 衝突處理（樂觀並發，🟡 建議）

* 核准前比對：站點現行版本 ≠ 建議的 `base_version` → 期間已被改過 → **衝突**。
* 不同欄位 → 可自動合併；同一欄位 → 標 `conflict`，需人工裁決，舊建議標 `superseded`。
* 目的：避免「審核者看著舊資料按核准，覆蓋掉別人剛核准的新值」。

### R4. 版本歷史與軟刪除（🟡 建議）

* v1.0 既有「操作歷史」升級為**可檢視的版本鏈**（欄位級 diff，誰/何時/改什麼）。
* **刪除＝軟刪除/下架**（標 `closed/deleted`，保留資料），**不開放硬刪**——災後站點常重啟，硬刪遺失歷史。與 v1.0「刪除限 Super Admin」一致但語義收斂為下架。
* 🟡 **建議**：提供「回溯到前一版（rollback）」限 Super Admin，且 rollback 本身也是一次新版本（不抹除歷史）。

### R5. 營運狀態快速通道（🟡 建議）

> 開/關/暫停/物資已滿時效極高，不該卡在資料審核佇列。

* 後台角色（Auditor / Super Admin / 該區 Team）可**即時**改 `operational_status`，不排審。
* 前台投稿的「狀態變更」可設較低門檻或多筆一致即自動更新；狀態欄位獨立於「基本資料修改建議」佇列。

### R6. 離線匯出（🟡 建議）

* 匯出 **CSV + 可離線檢視格式**，標註**匯出時間戳**與「資料截至 HH:MM」避免現場用過期清單；可選 GeoJSON。
* 匯出範圍：對齊 04-rbac——資源站全可見，匯出可依自家責任區篩選。

### R7. 異常場景（v1.1 新增）

| 編號 | 場景 | 處理建議 |
|------|------|----------|
| **RS1** | 同站點短時間多筆前台建議 | 各帶 base_version；先核准的成為新底稿，後續以衝突邏輯處理（R3）。 |
| **RS2** | 審核者核准時底稿已被改 | ⛔ 阻擋直接覆蓋：提示底稿已變、重新對比。 |
| **RS3** | 前台投稿「站點已關閉」但實際仍開（誤報/惡意） | 走快速通道但保留 source=crowdsourced 標記，後台可一鍵改回並記錄。 |
| **RS4** | 被刪除站點日後重啟 | 軟刪除可「重新啟用」，沿用歷史與 ID。 |
| **RS5** | 站點座標與行政區不符（跨區） | 以座標為準歸入行政區，篩選/匯出以實際座標所在區為準。 |
| **RS6** | 大量站點時地圖標點重疊 | 🟡 建議地圖視圖採聚合（clustering），與 [[06-map-decision-support]] 圖層效能策略一致。 |

---

## 成功驗收標準

- [ ] Table 視圖可依地區、類型、成立時間、營運狀態組合篩選，結果即時更新。
- [ ] 前台修改建議可在後台審查頁面中並排對比原始值與建議值，並提供核准 / 拒絕 / 調整操作。
- [ ] 審查決定後，前台資料在 1 分鐘內反映變更結果。
- [ ] 地圖視圖與 Table 視圖可一鍵切換，切換後保留當前篩選條件。
- [ ] 刪除操作僅限 Super Admin，其他角色不顯示刪除按鈕且 API 拒絕請求。
- [ ] 所有 CRUD 操作自動記錄在操作歷史，顯示操作者帳號與時間戳記。
- [ ] 前台修改建議以 proposal 物件儲存，核准前不覆蓋原值。
- [ ] 核准時若底稿版本已變，系統偵測衝突並阻擋盲目覆蓋。
- [ ] 站點刪除為軟刪除/下架，資料與歷史保留、可重新啟用。
- [ ] 營運狀態可由後台角色即時更新，不需走資料審核佇列。
- [ ] 匯出檔含匯出時間戳，避免現場使用過期清單。

---

## 開放問題（v1.1 新增，待確認）

- [ ] 修改建議採 proposal + 欄位級 diff + base_version？
- [ ] 核准前做樂觀並發衝突檢查？同欄位衝突走人工裁決？
- [ ] 刪除明確定義為軟刪除/下架（不開放硬刪）？是否提供 rollback（限 Super Admin）？
- [ ] 營運狀態走快速通道、與資料審核分離？
- [ ] 站點資料是否與 06 圖層共用單一真實來源？
- [ ] 貢獻者信任分級（高信任自動通過）是否納入 v2？
- [ ] v1.0「NGO 僅限指派區域檢視」是否更新為「全可見、匯出限自家區」對齊 04-rbac？

---

## 相關 Feature

* [[04-rbac]] — 各角色對此功能的存取權限
* [[06-map-decision-support]] — 地圖底圖與圖層整合

---

## 變更紀錄

| 版本 | 日期 | 更新重點 | 負責人 |
|------|------|----------|--------|
| v1.0 | 2026-05-28 | 初版建立，從 prd-manager-end.md §3.2 拆分 | — |
| v1.1 | 2026-06-10 | 拆細站點資料模型、修改建議 proposal/diff、樂觀並發衝突、版本/軟刪除/rollback、營運狀態快速通道、離線匯出、6 條異常場景；質疑並對齊 04-rbac 的資源站可見性；新增研究檔 `research/crowdsourced-poi-moderation-patterns.md` | — |
