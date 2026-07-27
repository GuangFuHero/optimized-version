# PRD 索引 — 管理後台系統 (ManagerEnd)

**系統**：島嶼守望 Wanguard 管理後台
**定位**：本資料夾是產品需求的**權威來源**。工程實作規格見 [`Backend/Spec/`](../../Backend/Spec/)。

每個 feature 一個資料夾，固定三件事：

| 檔案 | 角色 | 回答什麼 |
|------|------|----------|
| `user-stories.md` | 根基（問題空間） | 為誰、在什麼情境、想達成什麼價值 |
| `prd.md` | 規格（解法空間） | 系統該有什麼行為、什麼算完成 |
| `research/` | 決策依據 | 成熟產品怎麼做、為什麼這樣選 |

**閱讀順序：先 `user-stories.md`，再 `prd.md`。** 避免從功能反推需求。

---

## Feature 列表

| # | Feature | 文件 | 狀態 | 說明 |
|---|---------|------|------|------|
| 01 | 身份認證 | [stories](./01-auth/user-stories.md) · [prd](./01-auth/prd.md) | Definition | Email/SMS/Google/Line 登入、後台 SSO、帳號識別與連結、OTP 防濫用 |
| 02 | 個人檔案 | [stories](./02-user-profile/user-stories.md) · [prd](./02-user-profile/prd.md) | Definition | 通知中心、基本資訊、系統使用習慣 |
| 03 | 個人設定 | [stories](./03-user-settings/user-stories.md) · [prd](./03-user-settings/prd.md) | Definition | 帳號安全、聯繫資訊變更、角色升等申請、停用/刪除 |
| 05 | 成員管理 | [stories](./05-member-management/user-stories.md) · [prd](./05-member-management/prd.md) | Definition | Team CRUD、QR 邀請、審核佇列、Audit Log |
| 06 | 即時決策輔助 | [stories](./06-map-decision-support/user-stories.md) · [prd](./06-map-decision-support/prd.md) | Definition | 地圖繪製、Assignment/Hazard Zone、電線桿與災害圖層 |
| 07 | 資源站管理 | [stories](./07-resource-station/user-stories.md) · [prd](./07-resource-station/prd.md) | Definition | Table/地圖視圖、修改建議審查、版本歷史、離線匯出 |
| 08 | 任務管理 | [stories](./08-ticket-management/user-stories.md) · [prd](./08-ticket-management/prd.md) | Definition | 四層 Ticket→Task 結構、優先級、劃區指派、重複偵測 |
| 09 | 緊急公告系統 | [stories](./09-emergency-announcement/user-stories.md) · [prd](./09-emergency-announcement/prd.md) | Definition | CAP 子集、嚴重度分級、排程到期、分眾投放 |
| 10 | 訪客端工單隱私 | [prd](./10-guest-ticket-privacy/prd.md) | **草稿** | 公開前台工單揭露分級：存取控制 + 欄位揭露 + 位置降精度 |

> 編號 04 保留給 RBAC，見下方橫切定義。10 尚無 `user-stories.md`。

## 橫切定義（非 feature）

| 主題 | 文件 | 說明 |
|------|------|------|
| 角色權限 RBAC | [`_shared/04-rbac.md`](./_shared/04-rbac.md) | 平台 5 角色職掌、Team 內角色（正交維度）、資料可見性矩陣、各模組權限總表 |

全站以 `[[04-rbac]]` 引用此文件。權限相關規則一律定義在此，各 feature PRD 引用而不重述。

## 撰寫規範

新增 feature 時複製 [`_template/`](./_template/) 底下兩份範本：先寫 `user-stories.md`，再寫 `prd.md`。

- **User Story 是脊椎**：UX Flow、功能需求、驗收標準都要對應得到某條 story。
- **乾淨、解耦、自足**：一份 PRD 不纏繞其他 PRD，沒有上下文的人也能讀懂。
- **不寫變更紀錄／版本號**——歷史交給 Git，狀態寫在 front-matter 的 `status`。
- **章節不編號**，且不自創同義標題（統一用「開放問題」「驗收標準」）。跨文件引用寫章節名稱，不寫 `§1.3`。
- **橫切、非 feature 的定義**（如 RBAC）放 `_shared/`，引用而不重述。

每份 PRD 開頭有 YAML front-matter：`feature` / `title` / `status` / `owner` / `depends_on` / `design`。
`status` 取值：`draft` → `definition` → `approved` → `shipped`。

模板必填章節目前的落實狀況（含兩個系統性缺口：UX Flow 與成功指標）見 [`../../DOCS.md`](../../DOCS.md)。

## 相關文件

| 文件 | 說明 |
|------|------|
| [`../user-journey.md`](../user-journey.md) | 跨 feature 的角色操作旅程與流程圖 |
| [`./prd-manager-end-sucre.md`](./prd-manager-end-sucre.md) | 舊版單檔總表，內容已全數拆分至 01–10，僅供追溯 |
| [`../_archive/`](../_archive/) | 已凍結文件，**勿引用** |
| [`../../Backend/Spec/`](../../Backend/Spec/) | 工程實作規格（spec-kit，編號體系與此處不同） |
