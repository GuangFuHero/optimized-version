---
feature: 04-rbac
title: 角色權限管理
status: definition
owner:
depends_on: [01-auth, 05-member-management, 06-map-decision-support, 08-ticket-management, 10-guest-ticket-privacy]
design:
---

# 橫切定義 — 角色權限管理 (RBAC)

> **性質：** 橫切定義，非 feature PRD。全站以 `[[04-rbac]]` 引用本文件；權限規則一律定義在此，各 feature PRD 引用而不重述。
> **適用範圍：** 全平台（ManagerEnd 所有模組）
> **關聯文件：** `research/multitenancy-rls-breakglass-patterns.md`、[user-journey.md](user-journey.md)


---

## 核心原則：RBAC 與 Team 是正交兩維

本文件定義的是**平台 RBAC（5 種）**——使用者的全域身份與權限。

Team 內角色（Admin / Member / Guest）是另一個正交維度，定義在 [[05-member-management]] 中。兩者互不掛勾：

| 維度 | 定義位置 | 可能值 | 決定什麼 |
|------|----------|--------|----------|
| **平台 RBAC** | 本文件 (04-rbac) | Super Admin / Government / NGO / Data Auditor / 一般使用者 | 能做什麼動作、能看到哪些全域資料 |
| **Team 內角色** | 05-member-management | Admin / Member / Guest（每 Team 獨立） | 在某個 Team 內能否管理成員清單 |

> ⛔ **NGO 是 RBAC 角色，不是 Team Admin。** Team Admin 是 Team 內角色，與 RBAC 完全獨立。詳見 [[05-member-management]]「範圍與邊界」的三條鐵則。

---

## 使用者情境

* **角色：** 系統設計層面影響所有角色；主要決策者為 Super Admin
* **場景：**
  * 平台上不同單位（政府、NGO、志工、審查員）職責截然不同。必須確保每個角色只能看到與操作職權範圍內的功能，避免越權或資訊洩漏。
  * 民間 NGO 內部資料（成員、聯絡方式）不應跨組織暴露，連 Government 也僅能看到聯絡窗口。
* **痛點 / 觸發點：**
  * 若所有功能對所有人開放，NGO 可能誤刪任務、Team 之間互看內部聯絡資訊造成個資外洩。

---

## IDEAL Case

1. 後台人員登入後，系統自動套用對應角色的權限，頁面上只顯示該角色可操作的控制項與資料。
2. 前後端雙重驗證，前端隱藏不等於後端允許。
3. 跨 Team 的資料隔離由 `team_id` 強制過濾。
4. **結果：** 每個人在自己的職責邊界內高效工作，資料邊界明確。

---

## 設計原則

* **頁面結構一致 + 動態隱顯**：所有角色看到一致的後台架構，控制項依角色動態顯示。
* **前後端雙重驗證**：API 層獨立驗證權限，不依賴前端隱藏。
* **資料隔離 by Team**：跨 Team 的資料邊界由 `team_id` 強制過濾，連 SQL 層級都應有 Row-Level Security。
* **最小權限原則**：預設拒絕，明確授權。

---

## 平台 RBAC 角色職掌（5 種）

### 1. 超級管理員 (Super Admin)
* 平台層級最高權限。
* 跨 Team / 跨 Zone / 跨災害事件 完全可見可編輯。
* 唯一可建立 / 暫停 / 解散 Team 的角色。
* 唯一可指派 / 變更其他使用者 RBAC 的角色。
* 唯一可解除 Building Anchor 直立救援的角色。

### 2. 政府單位 (Government)
* 可看見所有 Team 名稱與聯絡窗口（**不可見 Team 內部成員**）。
* 可在地圖上繪製 Assignment Zone 並指派給任一 Team。
* 可繪製 Hazard Zone。
* 可啟動 / 切換災害類型。
* 可查看所有任務（跨 Team）。

### 3. NGO（民間組織成員）
* NGO 是一種**平台身份標記**，表示該使用者隸屬某個民間組織。
* **NGO 不等於 Team Admin**——NGO 成員在 Team 內可以是 Admin、Member 或 Guest，取決於 Team 內角色的指派。
* 其在 Team 內的具體操作權限（編輯 Ticket、邀請成員等），由 Team 內角色決定（見 [Team 內角色附錄](#team-內角色附錄正交維度)）。

### 4. 數據審查員 (Data Auditor)
* 全域審查可疑資訊與 AI 標記的重複單據 / 群組建議。
* 修正既有錯誤資訊。
* 不可看任何 Team 內部成員列表。
* 不可建立 Zone、不可刪除任務、不可變更角色。

### 5. 一般使用者
* 前台市民 / 志工，預設基線角色。
* 無後台權限；可透過 `03-user-settings` 送出升等 / 加入 Team 的申請。
* 被邀進某 Team 後，以 Team 訪客（Guest）進入後台，但畫面收斂成只剩該 Team（RBAC 不變）。詳見 [[05-member-management]] A5。

---

## 平台 RBAC 不變量與生命週期

> 本節為平台 RBAC 的權威定義。原散落於 [[05-member-management]] 的相關規則（≥1 Super Admin、Super Admin 互撤、存取推導）於 2026-06-15 整併至此,05 僅保留「在成員管理畫面執行」的操作入口並引用本節。

### 存取推導原則
* **後台可見範圍 = RBAC 授予的全域範圍 ∪ 所屬 Team 授予的單一空間範圍。**
* 因此一般使用者(全域範圍 = ∅)未加入任何 Team → 進不了後台(純前台);一旦被某 Team 邀入,即解鎖「該 Team 這一個空間」,但畫面收斂成只剩那一個 Team(RBAC 不變)。詳見 [[05-member-management]] A5。

### 不變量(硬約束)
* ⛔ **平台至少保留 1 位 Super Admin**,不允許移除 / 降級最後一位。最後一位須先指派接班人,否則操作被拒。
* ⛔ **只有 Super Admin 能指派 / 變更平台 RBAC**(NGO / Government / Data Auditor / 另一位 Super Admin)。Team Admin 是 Team 內角色,無權變更任何人的平台 RBAC。

### Super Admin 指派與互相撤銷
* Super Admin 可指派第二位以上 Super Admin,亦可互相撤銷(受「至少 1 位」約束)。
* 發起撤銷時:**需重新驗證身分(密碼 / 2FA)、記錄不可竄改的 Audit Log、立即通知被降級者**。
* **不設冷靜期**,以維持緊急處置的機動性。
* 死鎖救援:唯一 Super Admin 失聯時,以 break-glass 緊急憑證處理(見下方開放問題與 [[01-auth]] A6)。

---

## Team 內角色附錄（正交維度）

> 以下內容為簡要摘錄，完整定義見 [[05-member-management]]「範圍與邊界」。此處列出是為了讓本文件的權限矩陣可以完整呈現。

Team 內角色是**與 RBAC 正交的另一個維度**，每 Team 獨立計算。同一人在不同 Team 可有不同 Team 內角色。

| Team 內角色 | 摘要 |
|-------------|------|
| **Admin** | 管理該 Team 的成員清單、邀請成員、升降 Team 內角色 |
| **Member** | 該 Team 的一般成員，可回報任務 |
| **Guest** | 訪客，唯讀/受限，需升級為 Member 才可回報 |

> Team 內角色的完整 CRUD 規則、邀請流程、審核佇列等，均定義在 [[05-member-management]]。

---

## 資料可見性矩陣

下表以**平台 RBAC** 為主軸。Team 內角色對成員清單的可見性規則見 [[05-member-management]] A2.1。最右側「訪客」欄為**未登入的公開前台瀏覽者**（與 Team 內的 Guest 角色不同，後者是已登入、被邀進某 Team 的受限成員）。

| 資源 | Super Admin | Government | NGO | Data Auditor | 一般使用者 | 訪客（未登入） |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Team 列表** | 全部 | 全部（含窗口）| 依 Team 歸屬 | — | — | — |
| **Team 內部成員** | 全部 | — | 依 Team 內角色 | — | 依 Team 內角色 | — |
| **Audit Log** | 全平台 | — | 依 Team 內角色 | — | — | — |
| **Ticket** | 全部 | 全部 | 自家責任區 | 全部 | 依 Team 歸屬 | 僅 public · 降級揭露 ¹ |
| **Building Anchor** | 全部 | 全部 | 自家責任區 | 全部 | 依 Team 歸屬 | — ¹ |
| **Assignment Zone** | 全部 | 全部 | 自家被指派 | 全部 | 依 Team 歸屬 | — |
| **Hazard Zone** | 全部 | 全部 | 全部（為了避險）| 全部 | 全部 | 全部 ² |
| **Resource Station** | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 ³ |
| **Disaster Activation 設定** | 全部 | 全部 | 唯讀 | 唯讀 | — | — |

> Hazard Zone 全部可見的設計是因為安全資訊應該共享，避免任何人不知情進入危險區。

> 表中「依 Team 內角色」表示：該使用者在特定 Team 內的角色（Admin/Member/Guest）決定了其可見範圍，詳見 [[05-member-management]]。

**訪客欄註解：**
- **¹ Ticket / Building Anchor**：訪客僅能看到 `visibility = public` 的工單，且欄位採**降級揭露**（精確座標降精度、自由文字內文與照片不給原文、聯絡欄位遮罩）；`restricted` / `internal` 一律不回傳。Building Anchor 因綁定門牌級建築位置，對訪客僅以聚合呈現、不開放單體。完整欄位分級與位置降精度規格見 [[10-guest-ticket-privacy]]。
- **² Hazard Zone**：延續「安全資訊應共享」原則，對訪客亦全可見——讓未登入民眾也能避開危險區。
- **³ Resource Station**：作為公開服務點（民眾領取/捐贈物資），對訪客開放；惟站點若含營運者個資，比照 ticket 降級揭露。

---

## 各功能模組權限總表

### 平台 RBAC 維度權限

| 功能模組 | Super Admin | Government | NGO | Data Auditor | 一般使用者 |
|----------|:-----------:|:----------:|:---:|:---:|:---:|
| **Team 管理** |
| 建立 Team | ✓ | — | — | — | — |
| 暫停 / 解散 Team | ✓ | — | — | — | — |
| 查看 Team 列表 | 全部 | 全部含窗口 | 依 Team 歸屬 | — | — |
| 指派 / 變更平台 RBAC | ✓ | — | — | — | — |
| **地圖繪製** |
| 建立 Assignment Zone | ✓ | ✓ | — | — | — |
| 建立 Hazard Zone | ✓ | ✓ | — | — | — |
| 編輯 Zone | ✓ | ✓（自建） | — | — | — |
| 刪除 Zone | ✓ | — | — | — | — |
| **災害事件** |
| 啟動災害事件 | ✓ | ✓ | — | — | — |
| 切換 / 增加災害類型 | ✓ | ✓ | — | — | — |
| 關閉災害事件 | ✓ | — | — | — | — |
| **任務 (Ticket)** |
| 查看 Ticket | 全部 | 全部 | 自家責任區 | 全部 | 依 Team |
| 建立 Ticket | ✓ | ✓ | 依 Team 內角色 | ✓ | 依 Team 內角色 |
| 編輯 Ticket | ✓ | ✓（自區） | 依 Team 內角色 | ✓ | 依 Team 內角色 |
| 刪除 Ticket | ✓ | — | — | — | — |
| 立刻救援機制 | ✓ | — | — | — | — |
| **Building Anchor 與直立救援** |
| 建立 Building Anchor | ✓ | — | — | ✓ | — |
| 手動加入 / 移除 Ticket | ✓ | — | — | ✓ | — |
| 啟動建築直立救援 | ✓ | ✓ | 依 Team 內角色 | ✓ | — |
| 解除建築直立救援 | ✓ | — | — | — | — |
| **資源站** |
| 資源站修改建議審查 | ✓ | — | — | ✓ | — |
| 資源站刪除 | ✓ | — | — | — | — |
| **AI 審查** |
| AI 重複任務審查 | ✓ | — | — | ✓ | — |
| AI 群組建議審查 | ✓ | — | — | ✓ | — |
| **緊急公告** |
| 編輯前台公告 | ✓ | ✓ | — | — | — |
| 編輯後台公告 | ✓ | ✓ | 依 Team 內角色 | — | — |
| **Audit Log** |
| 查看 Audit Log | 全平台 | — | 依 Team 內角色 | — | — |

> 表中「依 Team 內角色」表示：
> - **Team Admin**：可編輯自家 Team 基本資訊、查看自家成員、邀請成員、變更 Team 內角色、查看自家 Audit Log、編輯自家責任區 Ticket、啟動自家區域建築直立救援、編輯自家後台公告
> - **Team Member**：查看自家成員（基本資訊）、編輯自家責任區 Ticket、建立 Ticket（限自家責任區）、回報進度
> - **Team Guest**：唯讀存取所屬 Team 空間

---

## 技術實作要求

### 後端權限驗證
* 所有 API endpoint 必須以 middleware 驗證角色 + 資料邊界。
* 涉及 `team_id` 的查詢，後端強制注入過濾條件，不依賴前端傳入的 team_id。
* **建議**：PostgreSQL Row-Level Security policy 在 DB 層再加一層保險。

### 前端動態 UI
* 進入頁面前載入角色 metadata，依此渲染控制項。
* 隱藏的控制項在 DOM 中也不應該存在（避免 Inspect Element 繞過顯示）。

### 變更角色生效時機
* Super Admin 修改某使用者角色後，該使用者**下次頁面重新整理或 API 呼叫時**新權限生效。
* **不需要**強制登出（避免擾民），但需即時通知該使用者。
* **降權 / 停權應更即時**（強制該使用者 token 立即失效一次），升權可等自然刷新。

---

## 驗收標準

- [ ] 每個角色登入後頁面只顯示有權操作的控制項。
- [ ] RBAC 角色變更（NGO / Government / Data Auditor / Super Admin）只有 Super Admin 能執行。
- [ ] 平台至少保留 1 位 Super Admin,不允許移除/降級最後一位(須先指派接班人)。
- [ ] Super Admin 互相撤銷時,強制重新驗證身分、寫入不可竄改 Audit Log、即時通知被降級者。
- [ ] NGO 成員在 Team 內的操作權限取決於 Team 內角色，與其 RBAC 身份無關。
- [ ] Government 無法看到任何 Team 內部成員（除聯絡窗口外）。
- [ ] Super Admin 修改某人角色後，對方在下次頁面重新整理時即套用新權限。
- [ ] Data Auditor 看不到「變更角色」「刪除任務」「立刻救援」「Zone 編輯」等控制項。
- [ ] 未授權的 API 呼叫回傳 403 而非靜默失敗。
- [ ] Hazard Zone 所有角色（含一般使用者）都可見，確保安全資訊不被遮蔽。

---

## 開放問題

> 🟡 以下每題補上研究後的建議答案，詳見 [`research/multitenancy-rls-breakglass-patterns.md`](research/multitenancy-rls-breakglass-patterns.md)。

- [ ] 是否需要「Read-only viewer」唯讀角色（如媒體 / 觀察員）？
  → 🟡 **建議**：引入唯讀 Viewer，但**限制可見範圍**（不可見受困者個資、不可見 Team 內部名單），避免變成個資破口。v1 可用「Government 唯讀子集」暫代，獨立角色列 v2。
- [ ] 混合角色：某 Government 人員又是某 NGO Team 內的 Admin？
  → 🟡 **建議**：可兼任。優先序原則——**平台 RBAC 決定「能做什麼動作」，當前 Team context 決定「對哪些資料」，個資（Team 內部名單）一律依該 Team 內角色**（呼應 [[05-member-management]] EC2/EC4）。
- [ ] 角色變更時是否需要強制登出？建議**否**。
  → 🟡 **建議維持否**，但補強：**降權 / 停權應更即時**（強制該使用者 token 立即失效一次），升權可等自然刷新（靠 [[01-auth]] 短 token）。
- [ ] 平台級操作（如關閉災害事件）是否需要兩位 Super Admin 雙簽？
  → 🟡 **建議**：災時不宜全面雙簽。僅對「**關閉災害事件**」「**解散 Team**」這類整體性、難復原操作要求「雙簽**或**冷靜期+可撤銷」二選一；「解除直立救援」維持限 Super Admin + 附理由即可。
- [ ] **RLS 落實**：PostgreSQL RLS 是否確實開 `FORCE ROW LEVEL SECURITY` 並處理連線池 session 變數殘留？RLS 為兜底、不取代 app 層 middleware。
- [ ] **Break-glass**：平台 SSO 中斷或唯一 Super Admin 失聯時，是否保留 1–2 組封存的緊急 Super Admin 憑證（使用即強稽核 + 告警）？此同時解 [[05-member-management]] EB2 死鎖（呼應 [[01-auth]] A6）。

---

## 相關 Feature

* [[01-auth]] — SSO 登入取得 RBAC 權限
* [[05-member-management]] — Team 管理、Team 內角色指派與審核（正交維度）
* [[06-map-decision-support]] — Zone 編輯權限
* [[08-ticket-management]] — 任務操作權限與資料邊界
