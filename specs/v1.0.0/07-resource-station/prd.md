---
feature: 07-resource-station
title: 資源站管理
status: definition
owner:
depends_on: [04-rbac, 06-map-decision-support]
design:
---

# Feature PRD — 資源站管理 (Resource Station)

> **根基文件：** [`user-stories.md`](user-stories.md)（角色、情境、使用者目標——請先讀這份）
> **關聯文件：** `research/crowdsourced-poi-moderation-patterns.md`、[user-journey.md](../../_shared/user-journey.md)

---

## 核心概念：群眾外包 POI 的審查式維護

* **資源站是公共資訊**：依 [[04-rbac]] 資料可見性矩陣，Resource Station **對所有角色可見**；存取差異只在「編輯 / 刪除權限」與「匯出範圍」。
* **建議不直接覆蓋**：前台投稿以獨立 proposal 物件承載，原資料在核准前不動，才能精準並排對比與偵測衝突。
* **時效與資料分離**：營運狀態（開 / 關 / 滿）走快速通道即時更新；基本資料修改才排審。
* **單一真實來源**：站點資料與 [[06-map-decision-support]] 的「Resource Station Markers」圖層共用同一份資料，避免兩處不同步。

---

## 使用者情境

* **角色：** Data Auditor（審查與編輯）、Super Admin（完整操作含刪除）、其餘角色（檢視；匯出可限自家責任區）
* **場景：** 災害期間，各類物資收發站、避難所等資源站點不斷增減，前台使用者也會主動提交錯誤修正建議。後台需要統一介面管理站點資料、審查修改建議，並掌握各區站點分布。
* **痛點 / 觸發點：** 站點資料不準或更新不及時，民眾可能前往已關閉的站點造成二次困難；大量前台修改建議若無系統化審查，容易積壓或遺漏。

---

## IDEAL Case

1. Data Auditor 打開資源站管理頁，在 Table 視圖用「新北市 / 避難所 / 營運中」篩選出目標站點。
2. 看到前台提交的修改建議佇列，並排對比原始資料與建議，一鍵核准或直接調整後核准。
3. 切換到地圖視圖，直觀看到站點分布密度，發現某區空白後在地圖上直接新增站點。
4. 所有操作自動記錄操作者與時間，之後可追溯。
5. **結果：** 前台看到的資源站資訊永遠是最新且經過審查的，民眾前往時不會撲空。

---

## User Story

* As a **Data Auditor**，I want **審查前台使用者提交的站點修改建議**，so that **確保資源站資料準確而不需要從頭人工核查**。
* As a **Data Auditor**，I want **在地圖上直接新增資源站**，so that **看到空白區域時立即補充，而不需要切換到另一個頁面填表**。
* As a **後台管理人員**，I want **用地區、類型、狀態篩選站點列表**，so that **在大量站點中快速找到需要的資訊**。
* As a **NGO 成員**，I want **匯出負責區域的站點資料**，so that **在沒有網路的現場使用離線清單**。

---

## 功能需求

### F1. 站點資料模型

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

* 站點資料與 [[06-map-decision-support]] 的「Resource Station Markers」圖層**共用單一真實來源**。

### F2. Table + BI 表格視圖

* **統計資訊**：顯示站點總數；支援以地區、類型、成立時間、營運狀態 Filter 篩選。
* **操作歷史**：見 F5 版本鏈。

### F3. 地圖視圖

* 整合 **OpenStreetMap API** 或衛星圖資顯示。
* 大量站點時採聚合（clustering），與 [[06-map-decision-support]] 圖層效能策略一致。
* 與 Table 視圖可一鍵切換，切換後保留當前篩選條件。

### F4. 前台修改建議審查

#### F4.1 修改建議資料模型（proposal，不直接覆蓋）

```yaml
StationEditSuggestion:
  id, station_id
  submitted_by (前台 user)
  base_version: int        # 投稿時所根據的站點版本（用於衝突偵測）
  changes: { field: {old, new}, ... }   # 欄位級 diff
  status: pending | approved | rejected | superseded
  reviewed_by, reviewed_at, reason
```

#### F4.2 審查操作
* 並排對比原始值與建議值，操作：核准 / 拒絕 / 直接調整。
* **存取限制**：僅限 Data Auditor 與 Super Admin。

#### F4.3 衝突處理（樂觀並發）
* 核准前比對：站點現行版本 ≠ 建議的 `base_version` → 期間已被改過 → **衝突**。
* 不同欄位 → 可自動合併；同一欄位 → 標 `conflict`，需人工裁決，舊建議標 `superseded`。
* 目的：避免「審核者看著舊資料按核准，覆蓋掉別人剛核准的新值」。

### F5. 版本歷史與軟刪除

* 操作歷史為**可檢視的版本鏈**（欄位級 diff，誰 / 何時 / 改什麼）。
* **刪除＝軟刪除 / 下架**（標 `closed/deleted`，保留資料），**不開放硬刪**——災後站點常重啟，硬刪遺失歷史。刪除限 Super Admin。
* **回溯（rollback）**：限 Super Admin，且 rollback 本身也是一次新版本（不抹除歷史）。

### F6. 營運狀態快速通道

> 開 / 關 / 暫停 / 物資已滿時效極高，不該卡在資料審核佇列。

* 後台角色（Auditor / Super Admin / 該區 Team）可**即時**改 `operational_status`，不排審。
* 前台投稿的「狀態變更」可設較低門檻或多筆一致即自動更新；狀態欄位獨立於「基本資料修改建議」佇列。

### F7. 編輯動作（CRUD）權限

| 操作 | 可執行角色 |
|------|-----------|
| 檢視站點 | 所有角色（資源站為公共資訊） |
| 新增站點 | Data Auditor、Super Admin |
| 編輯站點 | Data Auditor、Super Admin |
| 即時改營運狀態 | Auditor、Super Admin、該區 Team |
| 刪除（軟刪除 / 下架） | **僅限 Super Admin** |

### F8. 離線匯出

* 匯出 **CSV + 可離線檢視格式**，標註**匯出時間戳**與「資料截至 HH:MM」避免現場用過期清單；可選 GeoJSON。
* 匯出範圍：對齊 [[04-rbac]]——資源站全可見，匯出可依自家責任區篩選。

### F9. 異常場景

| 編號 | 場景 | 處理 |
|------|------|----------|
| **RS1** | 同站點短時間多筆前台建議 | 各帶 base_version；先核准的成為新底稿，後續以衝突邏輯處理（F4.3）。 |
| **RS2** | 審核者核准時底稿已被改 | ⛔ 阻擋直接覆蓋：提示底稿已變、重新對比。 |
| **RS3** | 前台投稿「站點已關閉」但實際仍開（誤報 / 惡意） | 走快速通道但保留 source=crowdsourced 標記，後台可一鍵改回並記錄。 |
| **RS4** | 被刪除站點日後重啟 | 軟刪除可「重新啟用」，沿用歷史與 ID。 |
| **RS5** | 站點座標與行政區不符（跨區） | 以座標為準歸入行政區，篩選 / 匯出以實際座標所在區為準。 |
| **RS6** | 大量站點時地圖標點重疊 | 地圖視圖採聚合（clustering），與 [[06-map-decision-support]] 效能策略一致。 |

---

## 驗收標準

- [ ] Table 視圖可依地區、類型、成立時間、營運狀態組合篩選，結果即時更新。
- [ ] 前台修改建議可在後台審查頁並排對比原始值與建議值，並提供核准 / 拒絕 / 調整操作。
- [ ] 審查決定後，前台資料在 1 分鐘內反映變更結果。
- [ ] 地圖視圖與 Table 視圖可一鍵切換，切換後保留當前篩選條件。
- [ ] 刪除操作僅限 Super Admin，其他角色不顯示刪除按鈕且 API 拒絕請求。
- [ ] 所有 CRUD 操作自動記錄在版本鏈，顯示操作者帳號與時間戳記。
- [ ] 前台修改建議以 proposal 物件儲存，核准前不覆蓋原值。
- [ ] 核准時若底稿版本已變，系統偵測衝突並阻擋盲目覆蓋。
- [ ] 站點刪除為軟刪除 / 下架，資料與歷史保留、可重新啟用。
- [ ] 營運狀態可由後台角色即時更新，不需走資料審核佇列。
- [ ] 匯出檔含匯出時間戳，避免現場使用過期清單。
- [ ] 所有角色皆可檢視資源站（公共資訊），匯出可依自家責任區篩選。

---

## 開放問題

> 資料模型、proposal/diff、衝突處理、軟刪除/rollback、快速通道、離線匯出均已定調寫入規格；以下為仍待決者。

- [ ] **貢獻者信任分級**（v2）：是否引入「高信任貢獻者自動通過低風險修改」？
- [ ] **前台狀態變更自動更新門檻**：F6「多筆一致即自動更新」的具體筆數 / 一致性條件？

---

## 相關 Feature

* [[04-rbac]] — 各角色對此功能的存取權限（資源站為公共資訊、全可見）
* [[06-map-decision-support]] — 地圖底圖與圖層整合、共用單一真實來源
