# 研究 — 群眾外包地點資料的審核與版本模式（Crowdsourced POI Moderation）

> **目的**：07-resource-station 是「站點資料 CRUD + 前台修改建議審查 + Table/地圖雙視圖」。v1.0 把功能列了，但沒回答成熟的地點資料平台（OSM、Google Maps、Wikidata、Waze）怎麼處理：
> 1. 前台「修改建議」的資料模型——是覆蓋原值，還是存成一筆 diff/proposal 等審核？
> 2. 同一站點短時間多筆衝突建議怎麼辦？審完 A 再審 B 時 A 已改變底稿？
> 3. 站點要不要版本歷史 / 可不可回溯（rollback）？
> 4. 「營運狀態」這種高時效欄位（開/關/暫停）怎麼快速更新而不必走完整審核？
> 5. 信任分級——前台使用者的建議是否一律要審？高信任貢獻者可否自動通過？
> 6. 離線匯出（NGO 現場無網）的格式與時效。
> **日期**：2026-06-10
> **關聯**：[`prd.md`](../prd.md)（07-resource-station）、[[06-map-decision-support]]、[[04-rbac]]、[[02-user-profile]]
> **狀態**：研究參考，供決策用（PRD 內以「🟡 建議」回填）

---

## 1. 問題拆解

資源站資料的本質是 **POI（Point of Interest）資料 + 高時效的營運狀態**，且**接受前台群眾投稿修正**。這正是 OpenStreetMap / Google Maps「Suggest an edit」/ Wikidata 的核心題目。難點在於：投稿是非同步的、會衝突的、品質參差的，而災害情境又要求**高時效**（站點開關狀態錯一天就會害民眾撲空）。

---

## 2. 修改建議的資料模型：Proposal/Suggestion，而非直接覆蓋

| 模型 | 說明 | 代表 | 取捨 |
|---|---|---|---|
| **A. 直接寫入 + 事後巡查** | 投稿即上線，靠社群事後糾錯回退 | OSM（資深使用者直接編輯） | 即時但易被破壞 |
| **B. 建議佇列（pending change/proposal）** ✅ | 投稿存成獨立 proposal，原資料不動，審核者核准才合併 | Google Maps「Suggest an edit」、Waze、Wikidata 部分屬性 | 安全，但有審核延遲 |
| **C. 混合：低風險自動、高風險排審** | 依欄位風險與貢獻者信任分級決定 | Google Maps（小修自動、刪除/重大改排審） | 最佳平衡 |

> 07 既然明確要「審查前台建議（核准/拒絕/調整）」→ 屬於 **模型 B**，且應以 **proposal 物件**承載，**不要讓建議直接覆蓋原值**。建議資料模型：
>
> ```yaml
> StationEditSuggestion:
>   id, station_id
>   submitted_by (前台 user)
>   base_version: int          # 投稿時所根據的站點版本，用來偵測衝突
>   changes: { field: {old, new}, ... }   # 欄位級 diff
>   status: pending | approved | rejected | superseded
>   reviewed_by, reviewed_at, reason
> ```
>
> 🟡 **建議**：採欄位級 diff + `base_version`，讓審查 UI 能精準「並排對比原值/建議值」（07 既有需求），並偵測衝突（見 §3）。

---

## 3. 衝突處理（並發建議 / 底稿已變）

成熟協作系統（Wikidata、Git）的核心是**樂觀並發控制（optimistic concurrency）**：

- 每筆建議記下 `base_version`。核准時若站點現行版本 ≠ `base_version`（這期間已被別人改過）→ **衝突**。
- 處理：
  - 若改的是**不同欄位** → 可自動三方合併。
  - 若改的是**同一欄位** → 標 `conflict`，要求審核者人工裁決，舊建議標 `superseded`。

> 🟡 **建議**：07 的審查頁在核准前做一次「底稿是否已變」檢查，避免「審核者看著舊資料按核准、覆蓋掉別人剛核准的新值」。

---

## 4. 版本歷史與回溯（Rollback）

07 v1.0 已有「操作歷史紀錄（開設者、變更人）」，但只是 log，不等於可回溯的版本。OSM / Wikidata 都保留**完整版本鏈**並支援 revert。

| 能力 | 🟡 對 Wanguard 建議 |
|---|---|
| 每次變更存一個 version（誰、何時、改了什麼） | 採之，欄位級 diff |
| 可檢視任一歷史版本 | v1 提供唯讀檢視 |
| 一鍵回溯到前一版（rollback） | 🟡 建議限 Super Admin，且 rollback 本身也是一次新版本（不抹除歷史） |
| 軟刪除（站點刪除可復原） | 🟡 建議：刪除＝標記 `inactive/deleted`，保留資料；硬刪除不開放（即使 Super Admin） |

> 與 07 既有「刪除限 Super Admin」一致，但建議把「刪除」明確定義為**軟刪除/下架**，因為災後站點常會重啟，硬刪會遺失歷史。

---

## 5. 高時效欄位：營運狀態快速通道

「開/關/暫停/物資已滿」這類狀態變化極快，若每次都要走「前台投稿 → Auditor 審核」會慢到害民眾撲空。Google Maps 對「暫時關閉/永久關閉」就有比一般編輯更快的處理。

> 🟡 **建議**：把 `operational_status`（運作中 / 暫停 / 已關閉 / 物資已滿）拆為**快速通道**：
> - 後台角色（Auditor / Super Admin / 該區 Team）可**即時**改狀態，不排審。
> - 前台投稿的「狀態變更」可設**較低核准門檻**或多筆一致即自動更新（眾包信號）。
> - 狀態欄位獨立於「基本資料修改建議」，避免高時效訊息卡在資料審核佇列。

---

## 6. 貢獻者信任分級（Trust / Reputation）

OSM、Waze、Google Local Guides 都用信任分級減輕審核負擔：新手全審、老手部分自動通過。

> 🟡 **建議（v2 再做）**：v1 先全審；未來可引入「前台貢獻者信任分數」，高信任者的低風險建議自動通過、僅抽查。列為開放問題，避免 v1 過度設計。

---

## 7. 站點資料模型建議（補 07 缺漏欄位）

07 v1.0 只提到「地區 / 類型 / 成立時間 / 營運狀態」可篩選，但沒列站點完整欄位。參考避難所/物資站常見欄位：

```yaml
ResourceStation:
  id, name
  station_type: shelter | supply | medical | water | charging | other
  coordinate {lat,lng}, address, admin_area  # 行政區，供篩選與 06 圖層
  operational_status: open | paused | closed | full
  capacity?, current_load?                    # 容量/目前使用（避難所）
  supplies?: [ {item, level} ]                # 物資盤點（物資站）
  contact_name?, contact_phone?
  opening_hours?
  established_at, created_by
  source: official | crowdsourced             # 來源（官方 vs 群眾投稿）
  verified: bool, verified_by, verified_at
  updated_at
```

> 🟡 **待確認**：是否需要與 [[06-map-decision-support]] 的圖層（Resource Station Markers）共用同一份資料模型與座標？建議**是**，單一真實來源（single source of truth），避免兩處資料不同步。

---

## 8. 離線匯出（NGO 現場無網）

07 有「NGO 匯出負責區域站點」需求。現場常無網路。

> 🟡 **建議**：匯出含 **CSV（試算表用）+ 可離線檢視格式**；標註**匯出時間戳**與「資料截至 HH:MM」，避免現場拿著過期清單；可選 GeoJSON 供其他地圖工具。

---

## 9. 待決問題（供 PRD 回填）

- [ ] 修改建議採 proposal + 欄位級 diff + base_version（不直接覆蓋）？
- [ ] 核准前做底稿衝突檢查（樂觀並發）？同欄位衝突標 superseded 需人工裁決？
- [ ] 站點刪除明確定義為軟刪除/下架（保留歷史），不開放硬刪？
- [ ] 是否提供版本回溯（rollback，限 Super Admin）？
- [ ] 營運狀態走「快速通道」與基本資料審核分離？
- [ ] 貢獻者信任分級是否納入（建議 v2）？
- [ ] 站點資料是否與 06 圖層共用單一資料來源？
- [ ] 匯出格式（CSV + 離線檢視 + 時間戳）與 GeoJSON？

---

## 10. 參考來源

- OpenStreetMap — Changesets / Good practice / Reverting changes：https://wiki.openstreetmap.org/wiki/Changeset
- Google Maps — Suggest an edit / report closed or moved：https://support.google.com/maps/answer/7421661
- Wikidata / Wikipedia — Revision history, optimistic concurrency, edit conflict 解法
- Waze Map Editor — edit & community review workflow
- Google Local Guides — reputation / trust levels
- 樂觀並發控制（optimistic concurrency control）— 一般分散式編輯實務
- 與本 repo 既有：[[06-map-decision-support]]（Resource Station 圖層）
