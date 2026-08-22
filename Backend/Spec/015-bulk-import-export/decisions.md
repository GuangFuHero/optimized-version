# 批量匯入匯出 — ADR 全集（ADR-106~125）

**Date**: 2026-08-21
**Feature**: 015-bulk-import-export
**Status**: 定案，待實作
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。編號接續 `Spec/014-session-revocation/decisions.md` 的 ADR-105。

**與既有 ADR 的關係**：ADR-117 明確推翻 `Spec/013-project-settings-activity/decisions.md` 的 ADR-092，範圍限於匯入路徑。依 ADR 優先規則（相撞時後續的勝），013 的 ADR-092 在單筆寫入路徑上仍然有效。

---

### ADR-106 匯入採 upsert，不是 insert-only

**白話**：匯入的檔案裡，比對得中現有資料的那幾列，是去更新它，不是再開一筆新的。

**Context**：三個選項——(A) 一律新增，重複交給事後 dedup；(B) 帶 uuid 才更新；(C) 用自然欄位比對後更新。

**Decision**：採 upsert（C 的形狀，比對鍵見 ADR-107）。

**Consequences**：
➕ 支援真正的使用情境：拿一份外部名單反覆匯，第二次不會長出一整份重複。
➕ 「匯出→改→匯回」成立。
➖ 每一列都要跑比對查詢與 `require_scope` 的 checkpoint 2，成本比 insert-only 高一個量級（所以有 ADR-116 的上限）。
➖ 開了一條「一個檔改掉幾百筆」的路徑，需要 ADR-113 與 ADR-121 兜住誤傷。

**否決 insert-only 的理由**：它把重複的處理推給一個不存在的機制。`is_duplicate` / `dedup_group_id` 今天沒有任何程式會寫（見 ADR-113），所以 insert-only 的實際後果就是資料庫裡堆重複資料。

**現階段可承受的前提**：使用者明確表示站點數量不多，逐筆 scope 檢查的成本可以接受。

---

### ADR-107 比對鍵用自然欄位，不用 uuid

**白話**：靠名稱和地址（或標題和電話）認人，不是靠系統編號。

**Context**：uuid 是語意上唯一、不可能誤擊的比對鍵，而且匯出檔本來就會帶。但外部來源的檔（政府或夥伴給的名單）永遠沒有 uuid，那條路只能新增。

**Decision**：

| 實體 | 比對鍵 |
|---|---|
| station | `stations.name` + `secondary_locations.county` + `city` |
| ticket | `tickets.title` + `tickets.contact_phone` |
| ticket 的 task 層 | 配到的 ticket + `task_type` + `task_name` |

`uuid` 仍然出現在匯出檔裡，但**只是唯讀參考**，不參與比對。

**Consequences**：
➕ 外部名單可以直接反覆匯入而不重複。
➖ 這些欄位在 DB 上**都沒有 unique 約束**（`name` 甚至是 nullable），所以「配到不只一筆」是必然會發生的，需要 ADR-113。
➖ ticket 的比對鍵含 PII，牽出 ADR-109。
➖ station 依賴 `secondary_location`，而它是選填的（`app/services/station.py:42`）——既有資料沒填縣市區的，永遠比不中。

**為什麼 ticket 不用縣市區**：`tickets` 表沒有任何地址欄位，`create_ticket` / `update_ticket` 也沒有 `secondary_location`（`app/graphql/tickets/mutations.py:34`）。技術上 `secondary_locations.geometry_uuid` 的 FK 指向 `base_geometries`，掛得上去，但那是給 ticket 加地址的另一件事，不在本票範圍。

**否決「匯入時自選比對欄」的理由**：把「會不會覆寫錯資料」的責任完全丟給使用者，而且要先做一個含 EAV 的通用多欄位比對引擎。彈性換來的是一個沒有人能推理其後果的功能。

---

### ADR-108 比對鍵欄位在更新列上唯讀

**白話**：匯入可以用電話認出這張單，但不能改這支電話。

**Context**：不是本票加的限制——既有的更新服務本來就不收這些欄位：`UpdateStationInput` 沒有 `secondary_location` 也沒有 `source`（`app/graphql/geo/types.py:214`）；`UpdateTicketInput` 沒有任何 `contact_*`（`app/graphql/tickets/types.py:491`）。

**Decision**：維持現狀。這些欄位在匯出檔裡照出，但更新列上一律忽略（不是失敗，是忽略——它們在往返時本來就會原封帶回來）。

**Consequences**：
➕ 匯入永遠不會把一筆資料「改成別人」——比對鍵不動，被更新的就一定還是被比中的那筆。
➕ 不必為了匯入去擴充兩個既有的 update 服務與它們的測試。
➖ **打錯的電話、打錯的縣市區，匯入修不了**，只能去 UI 改。

**為什麼是忽略而不是報錯**：往返情境下這些欄位一定有值（匯出帶出來的），報錯等於每一列都失敗。

---

### ADR-109 匯出逐筆套 PII scope；遮罩列匯回一律失敗

**白話**：你看不到的電話，匯出檔裡也是遮罩的；拿遮罩的值匯回來，那一列直接擋掉。

**Context**：ticket 的比對鍵含 `contact_phone`，而現行 GraphQL 是逐筆檢 `ticket.view_pii` 的 own/zone/all，不在 scope 就回遮罩值（`app/graphql/tickets/types.py:375`）。若匯出繞過這個檢查，一個看不到電話的人按一下匯出就拿到整份名單。

**Decision**：匯出逐筆套用相同判斷。匯入偵測到遮罩格式的電話 → 該列失敗，訊息明說原因。

**Consequences**：
➕ 不開繞過 ADR-049 PII 遮罩的後門，匯出與畫面看到的是同一套規則。
➕ 失敗訊息可診斷——使用者知道是權限問題，不是資料問題。
➖ zone scope 的團隊成員匯出 100 列，能改回去的只有落在自己 WorkZone 內的那些。

**否決「匯出一律明碼」的理由**：它讓 `ticket.view_pii` 的 own/zone 分級形同虛設——分級擋得住畫面，擋不住匯出鍵，等於沒擋。

**否決「靜默轉成新增」的理由**：那是最壞的失敗模式。使用者以為更新成功，實際上憑空長出一堆重複單，而且要等到有人發現重複才知道。

**否決「檔內吐 phone hash」的理由**：往返確實永遠成立且不外洩 PII，但多一個使用者看不懂的神秘欄位，而且手打的新列沒有 hash，等於還是要有第二套規則。

---

### ADR-110 新增三個 capability key，匯入需同時持有 import 與 add/edit

**白話**：匯入匯出各自要有自己的權限，而且能匯入不代表就能寫——還是得有原本的新增/編輯權。

**Context**：目前只有 `ticket.export` 這個空殼（零 grant、零 enforcement，`scripts/seed_rbac.py:10`），station 沒有 export key，兩邊都沒有 import key。

**Decision**：新增 `station.export` / `station.import` / `ticket.import`，並啟用 `ticket.export`。匯入需同時持有 `*.import` 和 `*.add`（新增列）/ `*.edit`（更新列，逐筆再過 checkpoint 2）。

**Consequences**：
➕ 管理者可以只把批量能力給少數人——批量誤操作的爆炸半徑比單筆大得多。
➕ 匯入不會變成繞過 own/zone scope 的後門：逐筆仍走既有的 `require_scope`。
➖ 4 個 key 的 seed matrix 與文件都要更新。
➖ 產生「有 import 沒有 edit」這種無效組合，但它的行為是明確的（每一列都因為 checkpoint 1 失敗），不是未定義。

**否決「匯入沿用 add/edit 不另立 key」的理由**：那樣任何能建站點的人都自動能一次改幾百筆，權限的粒度跟不上風險的粒度。

**否決「匯入匯出共用一組 key」的理由**：匯出是讀且帶 PII 外洩風險，匯入是寫且帶資料損毀風險。綁在一起之後就拆不開了。

---

### ADR-111 grant 矩陣：super_admin 全拿，team admin 可用，member 與 user 不給

**白話**：平台管理員什麼都能做；團隊管理員能匯出自己負責區、能匯入；現場人員和一般使用者都不給。

**Decision**：

| 角色 | station.export | station.import | ticket.export | ticket.import |
|---|---|---|---|---|
| super_admin | all | all | all | all |
| data_auditor | all | — | all | — |
| admin (team) | zone | all | zone | all |
| member (team) | — | — | — | — |
| user | — | — | — | — |

**Consequences**：
➕ `data_auditor` 拿 export 是它的本職（oversight，已持有 `ticket.view_pii: all`），不給 import 因為它全範圍無寫權（`scripts/seed_rbac.py:59`）。
➕ team admin 的 export=zone 讓匯出檔天然只含自己負責區的資料，不需要另外做範圍參數。
➖ 現場人員要一份自己負責區的清單只能請團隊管理員匯。

**import 的 scope 為什麼一律 all**：checkpoint 1 只回答「有沒有這個能力」，真正的逐筆保護來自 `*.add` / `*.edit` 的 own/zone 判斷。給 import 一個 zone scope 只會製造一個看起來有意義、實際上不影響任何行為的設定。

---

### ADR-112 逐筆進 + 錯誤報告，不做整批 atomic

**白話**：能進的先進，進不去的列出來給你改，不是一有錯就整批退回。

**Context**：因為有映射確認這一步，流程天然是兩段，乾跑驗證是免費的。所以「全部驗過才寫」與「逐筆寫」的實作成本差不多。

**Decision**：逐筆進，失敗列跳過，回可下載的錯誤報告（列號 + 原內容 + 原因）。`preview` 一次吐出所有錯誤列，不是碰到第一個就停。

**Consequences**：
➕ 一份 500 列的檔裡有 3 列有問題時，不必為了那 3 列把 497 列擋在門外。
➕ 錯誤報告可以直接當成「要修的清單」。
➖ 中途失敗（連線斷、逾時）時會停在一個「進了一部分」的狀態。ADR-116 的 500 列上限就是為了讓這個視窗夠小。
➖ 重傳修好的檔時，已進的那些列會再跑一次 upsert——靠 ADR-107 的比對鍵才不會重複。

**否決 atomic 的理由**：使用者明確選了逐筆。附帶理由是外部來源的名單品質參差，atomic 會讓「一列格式錯 → 整份不能用」變成常態。

**否決「失敗列進審核佇列 + 發 alert」的理由**（Notion 原文的寫法）：需要新表、審核 UI、通知機制，那已經是另一張票的體量。

---

### ADR-113 比對配到多筆、或檔內同鍵 → 該列失敗；不猜、不進 dedup 欄位

**白話**：認不出是哪一筆的時候就不要動它，把情況寫清楚讓人來判斷。

**Context**：比對鍵在 DB 上都沒有 unique 約束，`stations.name` 甚至 nullable，所以「配到不只一筆」是必然。

**Decision**：DB 配到 ≥2 筆 → 該列失敗，錯誤訊息列出配到的 uuid。檔案內部同鍵的那幾列 → 全部失敗，並指出彼此的列號。

**Consequences**：
➕ 不存在「默默覆寫了錯的那一筆」這種查不出來的後果。
➕ 錯誤訊息帶 uuid，人可以直接去 UI 上處理。
➖ 資料庫裡本來就有重複的地方，匯入永遠碰不了它們，要先人工清乾淨。

**否決「取最新那筆 / 後蓋前」的理由**：這是默默猜測，猜錯就是覆寫錯資料，而且使用者不會知道。「同一份檔裡同名兩列」很常是使用者真的有兩個不同的站點，後蓋前會直接吞掉一個。

**否決「標記進 `is_duplicate` / `dedup_group_id`」的理由**：`tickets` 表根本沒有這兩欄（只有 `stations` 與 `ticket_tasks` 有），而且全 codebase 沒有任何程式會讀或寫它們，`ai_duplicate.*` 的 capability 也零 enforcement。寫進去等於丟進黑洞。

---

### ADR-114 REST 兩端點、伺服器零狀態、檔案傳兩次

**白話**：上傳看預覽、確認後再傳一次同一份檔，中間伺服器什麼都不存。

**Context**：映射確認這一步中間有狀態要放。四個選項：兩次傳檔（無狀態）、Redis 暫存 token、`import_jobs` 表 + 背景任務、前端解檔後端只收 JSON。

**Decision**：REST 兩端點 `preview` / `commit`，檔案傳兩次。匯出走 `GET` 直接串流。CRUD 雖然在 GraphQL，但檔案上傳與串流下載走 REST。

**Consequences**：
➕ **沒有暫存、沒有 TTL、沒有清理、沒有孤兒檔**。
➕ 沒有背景任務的生命週期問題（專案沒有 celery/arq，也沒有物件儲存）。
➕ 檔案小（ADR-116 限 2 MB），傳兩次的成本可以忽略。
➖ 理論上第二次可以傳一份不同的檔（調包）。實務影響有限：`commit` 自己會完整重跑驗證，調包的結果就是驗證錯誤，而不是繞過驗證。

**否決 Redis 暫存的理由**：多一個用途、多一組 TTL 與容量要管，換到的只是「省一次上傳」和一個防不到什麼的調包保證。

**否決 `import_jobs` 表 + 非同步的理由**：新表 + migration + 輪詢 API + 背景任務的 DB session 生命週期。以「站點不多」的前提來說是超建。

**否決「前端解檔、後端只收 JSON」的理由**：型別轉換與 config 驗證規則會前後端各一套，兩套一定會漂移；而且匯出還是得後端產 XLSX，依賴一樣要加。

---

### ADR-115 CSV + XLSX 雙向；不做 .md / .json

**白話**：兩種格式都支援，Excel 的坑要主動處理掉。

**Decision**：匯入匯出都支援 `.csv` 與 `.xlsx`，新增 `openpyxl` 依賴（純 Python、無編譯、MIT）。CSV 匯出帶 UTF-8 BOM；XLSX 把電話、名稱、`no`/`floor` 等寫成文字格式儲存格。

**Consequences**：
➕ 涵蓋兩種真實來源：政府名單常是 CSV，內部維護用 Excel。
➕ BOM 與文字格式解掉「Excel 開 CSV 中文亂碼」和「`0912345678` 被吃掉前導 0 變成 `912345678`」。**後者直接打在 ticket 的比對鍵上**——不處理的話往返會整批失敗。
➖ 多一個依賴、多一組格式的解析與測試。

**否決 `.md` 的理由**：不是資料交換格式。

**否決 `.json` 的理由**：唯一的真實好處是 EAV 可以巢狀表達，但目前沒有已知的系統對系統串接對象，而人不會拿 Excel 編輯 JSON。要做的時候再加，格式層是可擴充的。

---

### ADR-116 單次 500 列 / 2 MB 上限，preview 階段就擋

**白話**：一次最多五百列，超過請分批。

**Context**：ADR-114 選了同步端點。逐筆 upsert 每列要跑比對查詢 + `require_scope`，而 zone scope 是 PostGIS 的點在多邊形內查詢。

**Decision**：500 列 / 2 MB，`preview` 就拒絕。`commit` 端點加 rate limit（`fastapi-limiter` 已在依賴裡）。

**Consequences**：
➕ 單次請求維持在秒級到十幾秒，不會撞 nginx / uvicorn 的預設逾時。
➕ 逾時視窗小，配合 ADR-112 的逐筆進，「進了一半」的狀態不會太難收拾。
➖ 一份 1200 列的名單要分三次匯，錯誤報告也分成三份。

**否決「不設列數上限」的理由**：沒有背景任務的情況下，那是把逾時風險完全交給運氣，而且一個人匯大檔會佔住連線池影響別人。

---

### ADR-117 匯入路徑嚴格照 config 驗證，明確推翻 013 的 ADR-092

**白話**：一般在畫面上填欄位，後端不管你填什麼型別；但批量匯入一定要照定義檢查。

**Context**：013 的 ADR-092 定的是「config 只是給前端 render 的定義，後端從不驗證寫入的值」（`app/models/property_config.py` 檔頭）。本票要在匯入時擋型別與 enum 錯誤，正面撞上它。

**Decision**：在匯入路徑推翻 ADR-092，其餘不變。

- 匯入：未在 config 定義的 `prop.` 欄位 → 該列失敗；`Enum` 值不在 `enum_options` → 失敗；型別轉不動 → 失敗。
- 單筆 GraphQL 寫入：維持不驗證。

驗證的欄位來源直接用 013 的 `list_by_type`（`app/repositories/config_repository.py:44`），所以 `is_active=false` 與不屬於本部署災害型別的欄位**自動**不在合法集合裡，不必另寫過濾。

**Consequences**：
➕ 唯一一條「沒有前端表單擋著、沒有人逐筆看、一次寫幾百列」的路徑有了防線。一個型別錯誤在單筆寫入是一筆髒資料，在這裡是一整張表。
➕ 停用的欄位、不屬於本次災害的欄位，自然被擋在匯入之外。
➖ 平台上出現兩種寫入語意：同一個值手動填得進去、匯入匯不進去。這是刻意的，但需要在錯誤訊息裡講清楚。

**否決「全平台都改成驗證」的理由**：那要動 station / ticket 的 property mutation 與它們的測試，而 #36 還沒合併，兩張 PR 會互撞。範圍也超出本票。

**否決「遵守 ADR-092、匯入也不驗」的理由**：那等於放棄這張票的標題「欄位比對」——比對不驗證，錯位就照樣寫進去。

**否決「只驗 enum 不驗型別」的理由**：station 側的值要進 `quantity` 這個整數欄，不驗型別就是匯入時直接爆資料庫錯誤，而不是一句可讀的訊息。

---

### ADR-118 station 動態欄位只支援 `Integer`；不補 `property_value`

**白話**：資源站點的動態欄位目前只有數字型的能用，其餘的先不做，也不在這張票修。

**Context**：`station_properties` 唯一能存值的欄位是 `quantity: int`（`app/models/station_property.py:9-22`；`CreateStationPropertyInput` 也只收 `quantity`，`status` 是審核狀態不是值）。而 seed 的 36 筆 station config 分佈是 Boolean 17 / Enum 5 / Array 4 / String 3 / Text 2 / **Integer 5**。12 個 station type 裡有 8 個（water、shower、toilet、transport、power、cellular、gas_station、supply）一個 `Integer` 欄位都沒有；有可用欄位的只有 shelter 3/9、medical 1/6、charge 1/3（分母含 `'all'` bucket 的 `crowd_level`）。

**Decision**：不動 schema。匯出表頭只列該 type 的 `Integer` 動態欄位；其餘在 `preview` 回報裡列出「已略過，原因：station_properties 目前無法儲存 `<data_type>` 型別的值」。

**Consequences**：
➕ 本票不帶 schema 變更，不碰 station property 的 mutation。
➕ 匯出檔仍然是合法的匯入範本——表頭裡不會出現填了就一定失敗的欄位。
➕ **沒有資料損失**：那些型別的值今天本來就存不下，匯出它們也只會是空欄。
➖ **36 個 station 動態欄位有 31 個進不了也出不來**。station 這半邊的價值落在固定欄位（名稱、型別、座標、地址、營業時間、可見度）。
➖ 013 剛做完的 config 管理頁可以定義 Boolean/Enum 欄位，但那些值寫不進資料庫——這個既有缺陷在本票之後仍然存在。

**這是既有缺陷，不是本票造成的**。修法是給 `station_properties` 補一個 `property_value`（與 `task_properties` 對齊）並讓 `CreateStationPropertyInput` 收它，順便給 `station_property_config` 補 `property_type`（`station_properties.property_type` 必填，config 裡卻沒有這一欄，照 config 匯入時無從得知該填 facility 還是 supply）。**另開一張票。**

---

### ADR-119 匯出必須指定單一 type

**白話**：一次匯一種站點型別（或一種任務型別），不混著匯。

**Context**：每個 `station_type` / `task_type` 的動態欄位定義不同，flat 表格要決定表頭。

**Decision**：匯出端點的 `type` 參數必填，欄位 = 該 type 經 `list_by_type` 過濾後的定義，順序固定（`sort_order, property_name`）。空庫也能匯出只有表頭的空範本。

**Consequences**：
➕ **匯出檔就是合法的匯入範本**，往返完全對稱。
➕ 表頭穩定：同一個 type 匯兩次一定得到同一組欄位，不隨資料浮動。
➕ 空範本可以直接發給外部單位填。
➖ 要匯完整份資料得按 type 匯十幾次。

**否決「涉及到的 type 取聯集」的理由**：表頭會隨資料浮動，同一個匯出鍵按兩次可能吐出不同表頭；而且聯集下的空格子在匯回時語意模糊（是「這個 type 沒這欄」還是「這欄沒填」）。

**否決「按實際資料出現過的 property_name 展開」的理由**：直接與 ADR-117 矛盾——匯出來的欄位（config 已刪的歷史欄位）匯不回去。

---

### ADR-120 ticket 一列 = 一張單 + 一個 task

**白話**：試算表的一列就是「一張求助單和它的一個任務」。

**Context**：`task_properties` 掛的是 `ticket_tasks` 不是 `tickets`（`app/models/ticket_task.py:44-46`），而 `task_property_config` 是按 `task_type` 定義的。所以「一列 ticket 帶動態欄位」在資料模型上必然要跨到 task 這一層。

**Decision**：匯入的一列建立 / 更新一張 ticket 加一個 ticket_task，動態欄位掛在 task 下。匯出同構。ADR-119 說的「單一 type」在 ticket 這邊指 `task_type`。

**Consequences**：
➕ 一列一個完整可操作的單位，使用者不必理解兩層結構。
➕ 直接複用既有的 `create_ticket` / `create_ticket_task` / `create_task_property`，不必新寫寫入邏輯。
➖ 一張單有多個任務時，匯出會重複列出同一張單的基本資料（每個任務一列）。
➖ task 層需要自己的比對鍵（ADR-107 的第三列），配到多筆同樣依 ADR-113 失敗。

**否決「ticket 匯入不帶動態欄位」的理由**：ticket 這半邊的動態欄位是唯一真正能用的（`task_properties` 有 `property_value`，全型別可存）——station 那半邊已經因為 ADR-118 只剩 5 個欄位。兩邊都拿掉的話這張票就沒有「欄位比對」了。

**否決「主檔子檔兩份匯入」的理由**：使用者要懂兩個步驟且順序不能錯，實作與測試也是兩套。

---

### ADR-121 更新時空白 = 不動；不提供清空

**白話**：格子留空就是「這欄不要改」，匯入沒有辦法把一個欄位清空。

**Context**：flat 表格加單一 type 範本會有很多空格。三種語意：空白=不動、空白=清空（檔案即真相）、空白=不動且另設清空記號。

**Decision**：空白一律是「不動」。不提供任何清空手段。

**Consequences**：
➕ 使用者拿一份只填了兩三欄的精簡檔也能用。
➕ Excel 不小心弄不見的格子不會損資料。
➕ 實作與測試最少，且不存在「使用者誤用清空記號」的失敗模式。
➖ 「批量清掉舊資料裡一堆錯誤備註」這種需求做不到，要去 UI 一筆筆改。

**否決「空白=清空」的理由**：任何人拿一份只有幾欄的檔來匯，就會把其他欄位全部清空，而且不可復原。往返情境下它與「空白=不動」結果相同，差別只在誤用時的後果——而那個後果是不可逆的。

**否決「另設 `__CLEAR__` 記號」的理由**：多一個要教使用者的約定，換到的是一個目前沒有人提出的需求。要做的時候再加，加它不會破壞既有語意。

---

### ADR-122 status 複用既有服務與狀態機，同值先 diff 掉

**白話**：匯入改狀態走的是跟畫面上一樣的規則，沒改的就不要送進去。

**Context**：`update_ticket` 對 status 有狀態機，`completed` 與 `cancelled` 是終態（`app/services/ticket.py:28`）。匯出檔一定帶 status 欄，使用者原封不動匯回時，若實作把 status 當「要變更」送進去，`completed → completed` 也會被擋，整批已完成的單會全變錯誤列。

**Decision**：匯入直接複用 `update_ticket` / `update_station` / `update_ticket_task`（連同 authz、驗證、狀態機一起）。實作上先跟 DB 現值 diff，相同就不放進 `changes`。真正的非法轉換（例如 `completed → pending`）→ 該列失敗並寫明原因。

**Consequences**：
➕ 沒有第二套業務規則。匯入能做的事和 UI 能做的事完全一致。
➕ 往返不會因為終態單子而整批爆掉。
➖ 誤點成 `completed` 的單子匯入救不回來——但那是狀態機該不該有管理員回退路徑的問題，不是匯入的問題。

**否決「匯入忽略 status 欄」的理由**：使用者在 Excel 裡改了 status 存檔匯回，系統靜默忽略並回報「更新成功」。這比報錯更糟。

**否決「匯入繞過狀態機」的理由**：開一個繞過業務規則的後門，而且是從一個沒有人逐筆看的路徑進去。

---

### ADR-123 座標用 `latitude` / `longitude` 兩欄，新增列必填

**白話**：要建新資料就一定要給經緯度，不猜也不查。

**Context**：`create_station` 與 `create_ticket` 都必須有合法 Point（`validate_point`，`app/services/geo_validation.py:12`）。而 ADR-107 的比對鍵不含座標，所以比對本身不需要它。

**Decision**：匯入檔固定有 `latitude` / `longitude` 兩欄。比對不中（要新增）且座標缺失或超界 → 該列失敗；比對中（要更新）且座標空白 → 保留原座標。

**Consequences**：
➕ 語意直白，且往返時匯出檔本來就帶座標。
➕ 更新列不必重填座標，符合 ADR-121 的「空白=不動」。
➖ 純地址的外部名單不能直接匯入建站，要先自己查好座標。

**否決 geocoding 的理由**：專案目前沒有任何 geocoding 依賴或金鑰，要新增外部服務、配額、失敗重試與批量呼叫的速率限制。這是一張獨立的票。

**否決「用縣市中心點當佔位座標」的理由**：這個系統的授權是**地理性的**——zone scope 看的是座標落在哪個 WorkZone 內。假座標會直接造成授權判斷錯誤，而且它會出現在災害地圖上。

---

### ADR-124 本票不做匯入批次追溯；只補上動態欄位的稽核

**白話**：「這 300 筆是哪一次匯進來的」這個問題本票先不回答，但動態欄位的變更現在開始會留痕跡。

**Context**：稽核是 DB trigger 自動做的（`app/db/triggers.py`），匯入 500 列會自然產生上千筆 `audit_logs`。但 trigger 只留逐列變更，看不出「這是同一次匯入」。

原本的設計是把 batch uuid 塞進 `audit_logs.context` 這個 JSONB——**但那個欄位在本票的基底上不存在**。`context` 欄與 `app.active_identity` 這個 session setting 都是 feature 010（ADR-076）帶進來的，010 在 PR #37 的分支上，而本票的基底 #36 是從 `main` 開的，兩者沒有交集。**沒有任何一個分支同時有 013 的 config 欄位和 010 的 audit context。**

**Decision**：本票不做批次追溯。batch uuid 仍然會產生，但只出現在 HTTP 回應與錯誤報告裡，不進資料庫。

**同時仍然要做**的是把 `station_properties` 與 `task_properties` 加進 `AUDITED_TABLES`——這半邊不依賴 010，而且它補的是一個既有盲點：動態欄位的變更目前完全不留痕跡。

**Consequences**：
➕ 本票維持零 migration、零 schema 變更。
➕ 不去改 `audit_trigger_func`，就不會跟 010 對同一支 trigger 的改動在合併時互撞。
➕ 動態欄位的變更從此有稽核紀錄（含匯入造成的）。
➖ **匯入造成的變更在 `audit_logs` 裡跟一筆一筆手改長得一模一樣**，出事時沒有辦法圈出「那一次匯入」。
➖ 使用者關掉分頁之後就失去那份錯誤報告，沒有地方可以回頭查。

**補回來的時機**：010 合進 `main` 之後另開一張小票，那時 `context` 欄已經在，加一個 `import_batch` 鍵才真的是零 migration。

**否決「本票自己加一支 migration」的理由**：要給 `audit_logs` 加欄位並改 `audit_trigger_func`，而 010 也在改同一支 function。兩張未合併的 PR 各自改同一段 PL/pgSQL，合併時會是手工解衝突，而換到的只是一個「事後查得到」的便利——不是正確性。

**否決「改 base 到 #39」的理由**：那樣拿得到 010 的 audit context，卻拿不到 013 的 `is_active` / `disaster_types` / `list_by_type`，驗證邏輯得自己重寫一套過濾，而且 #36 合併之後會反過來撞。等於把 ADR-125 否決的那條路反過來走一遍。

**否決「等 #36 與 #37 都合進 main」的理由**：#35~#39 五張都還 open，何時合不在本票手上。

---

### ADR-125 分支 base 在 `feat/project-settings-backend`（#36），不是 main

**白話**：這張票疊在 013 上面做，不是從主線開。

**Context**：ADR-117 的驗證邏輯直接建在 013 的 `list_by_type` 上（`is_active`、`disaster_types` 過濾、`'all'` bucket、穩定排序），而且 ADR-117 是明確推翻 013 的 ADR-092。

**Decision**：`feat/bulk-import-export-backend`，base 指向 `feat/project-settings-backend`，stacked PR（`gh pr create --base feat/project-settings-backend`）。

**Consequences**：
➕ 驗證直接站在 013 的成果上，不必自己重寫一套過濾。
➕ 推翻 ADR-092 的 ADR 接在它後面，讀的人看得到完整脈絡。
➖ #36 若被要求大改，本票跟著卡。
➖ **合併必須排在 #36 之後**。

**否決 base 在 main 的理由**：#36 合併之後會留下一個默默的語意漏洞——`is_active=false` 的欄位依然能匯入。這是 `git merge-tree` 看不出來、真 merge 才會炸的那種衝突。

**否決「等 #36 合完再開工」的理由**：#35~#39 何時合不在本票手上，而 Notion 的排程是 08-18~08-22。
