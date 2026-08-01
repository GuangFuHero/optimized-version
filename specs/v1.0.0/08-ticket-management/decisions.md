# Grill 決策日誌 — 任務管理 (Ticket Management)

> 本文件記錄對 `prd.md` 進行「grill-me」逐項拷問的每一個問題與拍板決策，作為日後改寫 PRD 的依據。
> 方法：一次一題、每題附建議答案、決策後即記錄。能由文件查證者直接查證，不浪費討論。
> 開始日期：2026-06-16

---

## 決策狀態圖例
✅ 已拍板　🟡 已提出待決　⛔ 已否決方案　🔄 被後續討論取代

---

## D1 — grill-me skill 安裝範圍
- **決策：** ✅ 安裝為 user scope（`~/.claude/skills/grill-me/`），所有專案皆可用。
- **安全掃描：** 通過（純行為提示詞、無程式碼/網路/檔案操作/擴權）。

---

## D2 — 災害類型的可擴充性（Grill #1）
- **問題：** 真實災難出現「未預設的災害類型」時，系統當下行為為何？
- **選項：** (A) 一律塞 `other`、資訊事後補不回 ⛔　(B) Super Admin 用現有欄位積木即時拼出新類型 ✅　(C) 其他
- **決策：** ✅ **採 B**。三層抽象的權責切點：
  - ① **欄位 Field**：🔒 系統定義、不可改。
  - ② **欄位群組 FieldGroup**：🔒 系統定義、不可改。
  - ③ **災害類型 DisasterType**（= 一或多個②的組合）：✅ Super Admin 可自行拼裝。
- **理由：** ①②鎖死保資料一致性與跨災害 BI 統計；③開放保新災害應變彈性。切點落在「積木內部 vs 積木組裝」之間。

---

## D3 — 欄位不足時的逃生閥（Grill #2）🟡 待決
- **問題：** 當現有欄位積木不足以描述新災害時怎麼辦？
- **選項：** (B1) 完全鎖死①②，缺欄位等工程加　(B2) 給 Super Admin 受限「自訂補充啞欄位」（不進 BI、不可觸發必填邏輯）　(B3) 完全開放自訂任意欄位
- **建議：** B2（自訂欄位與正式欄位物理隔離，永為二等公民）
- **狀態：** 🟡 使用者選擇先回到地基逐 Field 討論，本題暫掛，待釐清欄位全貌後回頭定案。

---

## D4 — Ticket 誕生管道（Grill #3）
- **決策：** ✅ **採 A**。系統**有**前台民眾自助報案管道。Ticket 三種誕生來源，必填規則依來源分流：
  - `citizen_report`（前台民眾）：極簡表單，直立救援等專業欄位**一律不必填**。
  - `staff_intake`（Team Member／話務員代報）：套用 F3 條件式必填。
  - `system_relfrom`（外部系統匯入／轉派）：依來源映射。
- **理由：** 救命表單不能用必填星號把求救者擋在門外；專業欄位由後台補齊。

## D5 — 直立救援的三道閘門（疊加關係，由 Grill #3 後續釐清）
- **決策：** ✅ 直立救援「是否必填」由三道**獨立且 AND 疊加**的閘門決定：
  - **閘1 顯示**：災害類型含直立救援（earthquake/fire/landslide/war），或 Super Admin 依 D2 將 `vertical_rescue` 積木組進其他災害（如水災）→ 欄位群才顯示。對應 F3.1。
  - **閘2 來源**：即使顯示，`citizen_report` 永遠不會被設為必填。對應 D4。
  - **閘3 條件**：樓層≠1F／主動勾選／建築錨點繼承 才觸發必填。對應 F3.2/F3.3。
  - 必填 ⇔ 閘1 ∧ 閘2=staff ∧ 閘3 觸發。
- **使用者確認：** 「只開水災則無直立救援欄位、Super Admin 可視情況開啟」合理，且已符合 F3.1，無需改規格、僅需在 PRD 補上三閘疊加的明文。

---

## D6 — `task_id` 形態（Grill #4）
- **決策：** ✅ **採 A**。只用 `ticket.uuid`（系統內部、前端不顯示、自動帶），現場可讀短碼暫不做、之後再議。

---

## ⚠️ 重大發現：實際 Schema 與 PRD 的結構性落差（2026-06-16 使用者提供最新欄位單）

### 實際 Ticket 欄位（ground truth）
> 核心結構：**1 個 Ticket 可有多個 Task；Ticket 存地址/經緯度/聯絡，Task 存需求（物資、人力等）。**

| 欄位 | key | 必填 | 備註 |
|---|---|:---:|---|
| 任務編碼 | `ticket.uuid` | ✓ | 前端不顯示、自動 |
| 任務標題 | `title` | ✓ | task_name 同步帶入，除非開不同子任務 |
| 任務說明 | `description` | — | |
| 任務狀態 | `status` | ✓ | ⚠️ 與下方「處理狀態」重複待釐清 |
| 現場聯絡人 | `contact_name` | ✓ | |
| 現場聯繫方式 | `contact_phone` | — | |
| 處理狀態 | `status` | ✓ | 系統自動帶 ⚠️ 重複 |
| 最後更新時間 | `updated_at` | ✓ | 自動 |
| 經度 | `base_geometries.geometry.longitude` | ✓ | |
| 緯度 | `base_geometries.geometry.latitude` | ✓ | |
| 地址 | `geometry.geometry_uuid, location_type` | ✓ | 待確認可否拆 county/city/lane/alley/no/floor/room |
| 建立者 | `created_by` | ✓ | |
| 現場照片 | `ref_uuid, ref_type, url, created_by, uuid, created_at, updated_at` | — | 多筆 |
| 需要什麼 | `ticket_tasks` | ✓ | = Task，多筆需求（鏟土志工、圓鍬、礦泉水…） |
| 任務類型 | `task_type` | ✓ | search_rescue / medical_support / supply_delivery |
| 接案者 ID | `actor_uuid` | ✓ | |
| 接案時間 | `assigned_at` | ✓ | |
| 災害種類 | `disaster_type` | ✓ | 使用者不填、預設好；無後台時先預設單一災害 |

### 偵測到的對齊落差（待逐項處理）
1. **雙層模型 Ticket→Task**：PRD 無此概念，把 Ticket 當作「帶災害欄位群的原子單位」。實際 Ticket=地點錨點、Task=需求，一對多。→ 衝擊 F1、F4。
2. **災害專屬結構欄位全數缺席**：PRD F1 的 `collapse_level/water_level/structure_stability/fire_status…` 在實際 schema **完全沒有**。實際 Ticket 是通用欄位。→ F1 欄位群機制是否還存在？
3. **disaster_type 單選＋預設＋使用者不填**：與 PRD 的多選/聯集(F1.3)/複合災害(F2.2)/chip 切換(F1.5) 直接衝突。
4. **直立救援欄位缺席**：F3 三層觸發所依賴的 `floor_level/structure_stability/victims_*` 在實際 schema 沒有（僅地址內可能含 floor）。→ F3 整套是否還在範圍內？
5. **status 重複**：任務狀態 vs 處理狀態 兩個 `status` 都必填，需釐清語義或合併。
6. **PRD common 未列的新欄位**：`contact_name, contact_phone, actor_uuid(接案者), assigned_at, created_by`。
7. **task_type 與 ticket_tasks 的層級**：Ticket 有 `task_type`(三選一)，又有 `ticket_tasks`(多筆需求)，兩者關係與所在層級待定。
8. **地址拆解**：能否由地址辨識拆 county/city/lane/alley/no/floor/room；其中 `floor` 是否即直立救援的 `floor_level`。

---

## D7 — 結構根問題：Ticket / Task 雙層模型 + 災害欄位定位（Grill #5）
- **決策：** ✅ **採 C（中間派）**。
  - **雙層結構確立為地基**：`Ticket`（地點錨點：地址/經緯度/聯絡/災害種類）→ 多筆 `Task`（需求：人力/物資/搜救），一對多。
  - **災害專屬欄位不綁死在 Ticket 上**：報案走精簡表單（不卡關），結構評估等專業欄位**降級為「後台／現場指揮可選後補」**，不強迫第一線報案者填。
  - 呼應 D3 逃生閥、D4 來源分流、D5 三閘。
- **理由：** 用精簡 schema 當骨架、報案 30 秒填完；又不放棄專業救援情報，由後台補齊。

---

## D8 — 建立 user-stories.md 北極星文件
- **決策：** ✅ 在 `product/prd/08-ticket-management/` 下新建 `user-stories.md`，比照 `05-member-management/user-stories.md` 體例，作為問題空間的根基文件，`prd.md` 由其推導。
- **動機（使用者）：** 意識到災害情境種類繁多，需要一份涵蓋多災種的北極星，避免 PRD 從功能反推需求。

---

## 逐 Field 討論（暫停，待北極星建立後恢復）

> 原 PRD common 欄位群定義已被上方實際 schema 取代，逐 Field 將以實際 schema + 雙層 Ticket/Task 模型為準。

---

## ⚠️ 重大發現：自訂欄位功能已在後端實作（2026-08-01 查證程式碼）

D3「欄位不足時的逃生閥」擱置期間，後端已經把自訂欄位做出來了。查證結果：

| 項目 | 位置 | 狀態 |
|---|---|---|
| 欄位定義表 `task_property_config` | `Backend/app/models/property_config.py` | 已建表、已有種子資料 |
| 查詢 `taskPropertyConfigs(taskType)` | `Backend/app/graphql/config/queries.py` | 已實作 |
| 新增／修改 `upsertTaskPropertyConfig` | `Backend/app/graphql/config/mutations.py` | 已實作，權限 `map:edit` |

**這代表 D3 的前提已經被程式碼跳過**：不是「要不要給自訂」，而是「已經給了，且接近 B3（完全開放）」——`property_name` 與 `data_type` 都是自由輸入，權限只擋在 `map:edit`（非 Super Admin 專屬）。D3 要重新問的是「**接受現況，還是收回權限**」。

種子資料的實際欄位：`rescue` → `people_count`／`floor_level`／`unit_number`／`hazard_note`；`hr` → `required_skill`／`vehicle_type`／`cargo_type`／`cleanup_type`／`required_tool`；`supply` → `item_name`。

> 附帶：待拍板 B「直立救援」需要的 `floor_level` 已存在於 `rescue` 底下，並非從零開始。

### 同時推翻的 PRD 敘述

PRD 稱 Ticket 層 `task_type` 是情境分類（`search_rescue`/`medical_support`/`fire_response`/`supply_delivery`）。**這組值在整個後端一次都沒出現過。** 程式碼中兩層用的是同一套值（`rescue`/`supply`/`medical`/`hr`），種子資料 `tickets.task_type` 存的就是 `'rescue'`。

所以不是「同名不同義」，是**同名同義、重複一份**——Ticket 層那個是底下 Task 的摘要。

---

## D9 — Ticket 層重複的 `task_type`
- **問題：** `tickets.task_type` 與 `ticket_tasks.task_type` 同名同義，前者可空、無任何機制使用；後者必填、是自訂欄位的分類依據。
- **決策：** ✅ **廢除 `tickets.task_type`。**
- **理由（使用者）：** 「先把多餘的東西拿掉，否則做不完」——控制範圍優先。
- **影響評估：** 資料庫 1 個可空欄位；後端 GraphQL 型別 3–4 處、種子 SQL 1 個檔；前端 0 處（未使用）；自訂欄位機制不受影響（綁 Task 層）。
- **衍生開放問題：** 地圖圖示與統計原本讀這個欄位，廢除後需即時由 Task 集合推導；災時上千至上萬點的效能影響需工程評估。

---

## D10 — 自訂欄位的層級（進行中）
- **問題：** 新災害需要新欄位（如水災的「積水深度」）時，管理員能動的層級到哪？
- **選項：** (A) 需求種類鎖死、只開放欄位　(B) 需求種類也可新增　(C) 多加一個「災害」維度
- **建議：** A。平台一次只處理一場應變，欄位清單本就等於「這場應變的表單設定」，不需再切災害維度；且現況 schema 即支援、分類不會長歪。
- **狀態：** 🟡 待決。三個做法的後台畫面與表單效果見 [`wireframe/02-field-admin-options.md`](wireframe/02-field-admin-options.md)、[`wireframe/03-form-effect.md`](wireframe/03-form-effect.md)。
