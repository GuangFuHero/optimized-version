# User Stories — 成員管理 (Member Management)

> **根基文件。** 先在這裡定義「為誰、在什麼情境、想達成什麼價值」;同資料夾的 `prd.md` 是由本文件**推導出來**的功能規格(如何實作)。閱讀與設計順序:先讀本文件(問題空間),再讀 `prd.md`(解法空間),避免從功能反推需求。
>
> 平台 RBAC 角色的權威定義見 [[04-rbac]];本文件只列與「成員管理」直接相關的使用者目標。

---

## 角色

| 角色 | 在本特性中的立場 |
|------|------------------|
| Super Admin | 全域:建立/管理所有 Team、指派平台 RBAC、管理無 Team 的平台級人員 |
| Government | 唯讀:只看 Team 列表與聯絡窗口,用於劃區指派的對接 |
| Team Admin | 管理自家 Team 的成員與邀請(Team 內角色,非 RBAC) |
| Team Member | 自家 Team 的行動成員 |
| Team Guest | 被邀進 Team 的訪客,唯讀/受限 |
| 一般使用者 | 前台市民/志工,透過申請進入組織 |

---

## 使用者情境

* **場景:** 災後現場進駐多個 NGO(慈濟、世界展望會、紅十字會、宮廟志工…),每個組織需要一個 Team 來管理自家成員、隔離內部資料;部分跨組織人員(如政府聯絡官)會被加入某 NGO Team 協作。
* **痛點:**
  * 混在同一份名單 → 各組織互看內部聯絡資訊,違反個資原則。
  * 各自獨立後台 → 跨組織協作時無法共用任務資料。
  * 緊急時新成員加入必須極簡,不能等 Super Admin 逐一建帳號。

---

## User Stories（依角色)

### Super Admin
* As a Super Admin, I want **建立新 Team 並編輯/暫停/解散**, so that 能視災情彈性管理現場合作組織。
* As a Super Admin, I want **看見全平台所有 Team 與成員的完整狀況**, so that 能從上而下宏觀掌握協作分佈。
* As a Super Admin, I want **在成員管理畫面指派/變更他人的平台 RBAC**, so that 能分權治理(規則見 [[04-rbac]])。
* As a Super Admin, I want **管理「平台級人員」(無 Team 的成員,如 Data Auditor、其他 Super Admin)**, so that 能完整掌握非一線的後台人員。

### Government
* As a Government 成員, I want **看見所有 Team 的列表與各自聯絡窗口**, so that 劃區指派時能快速找到對接窗口。
* As a Government 成員, I want **看不到別家 Team 的內部成員名單**, so that 尊重民間組織的內部隱私。

### Team Admin
* As a Team Admin, I want **檢視自家 Team 的成員名單**, so that 掌握內部人員與聯絡資訊,且不外洩給別家。
* As a Team Admin, I want **變更成員在自家 Team 內的角色(Admin/Member/Guest)與啟用狀態**, so that 依現場分工靈活調配。
* As a Team Admin, I want **一鍵為自家團隊產生邀請 QR/短連結(可設有效期與人數上限)**, so that 應對現場極大的人員流動性。
* As a Team Admin, I want **在審核佇列處理「加入本 Team」的申請**, so that 把關志工/成員加入。
* As a Team Admin, I want **查看與匯出自家團隊範圍的 Audit Log**, so that 掌握成員異動與內部權限變更歷程。
* As a Team Admin, I want **編輯自家 Team 的基本資訊與聯絡窗口**, so that 其他單位能聯繫到正確負責人。

### Team Member
* As a Team Member, I want **看到同 Team 的夥伴名單**, so that 救災協作時知道找誰聯繫。

### Team Guest
* As a Team Guest, I want **被邀進團隊後能進入該團隊後台(看任務、回報進度)**, so that 能參與協作,但看不到其他團隊任何資料,也無法進行地圖/成員/公告等全域管理。

### 一般使用者
* As an 一般使用者, I want **在設定頁送出「加入特定 Team」或「升為 Government/Data Auditor」申請並追蹤進度**, so that 不需透過口頭管道即可正式加入組織。
* As an 被邀請者, I want **掃 QR 並透過手機 OTP 完成註冊加入團隊**, so that 在保障帳號安全的前提下快速加入。

---

## 對應規格

各 User Story 的實作規格、約束與異常場景,見同資料夾 [`prd.md`](prd.md) 的功能需求(A. Team 管理 / B. RBAC 操作入口 / C. 跨維度共用)。
