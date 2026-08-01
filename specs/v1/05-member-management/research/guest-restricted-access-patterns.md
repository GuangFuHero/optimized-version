# 研究 — 受限成員 / 訪客存取模式（Guest & Restricted Access）

> **目的**：回答一個 member-management 的開放問題——當 **Team Admin 透過 QRCode 邀請一位「一般使用者」（前台市民/志工，無任何後台 RBAC）進入自己的 Team** 時，是否該讓這個人「進得了後台」？如果讓他進來，他理應只看得到「他被邀進的那一個 Team」，看不到後台其他內容。這種「只看得到一個空間」的人，業界成熟產品怎麼處理？
> **日期**：2026-06-08
> **關聯**：[`prd.md`](../prd.md)（05-member-management v3.0）、[[04-rbac]]
> **狀態**：研究參考，供決策用（尚未拍板）

---

## 1. 問題拆解

在 v3.0 的解耦模型下：

- **RBAC**（5 種）是純權限層級，與 Team 無關。
- **Team** 是可選的協作空間。
- Super Admin / Government / NGO / Data Auditor **本來就看得到後台**，所以被邀進 Team 後自然看得到那個 Team。
- 唯一的灰色地帶是 **「一般使用者」**：他在 RBAC 上沒有任何後台權限，但被某 Team 邀請進來協作。**要不要讓他進後台？進來後他只看得到一個 Team，其他全部看不到——這個「半殘」狀態合不合理？**

本質上這是所有協作型 SaaS 都遇過的題目：**如何讓一個「不是正式成員」的人，安全地參與「一個特定空間」的協作，而不暴露其他內容。**

---

## 2. 兩條根本路線

| 路線 | 說明 | 代表產品 |
|---|---|---|
| **A. 獨立前台 Portal** | 為外部/低權限者另建一個獨立的、功能受限的入口，與內部後台完全分離 | Salesforce Experience Cloud（社群入口）、Discourse、各種「客戶專區」 |
| **B. 同一後台 + 範圍收斂** ✅ 主流 | 讓受限者進入**同一個**產品介面，但介面**自動收斂**成只剩他被授權的那一塊；其餘導覽項目根本不渲染 | Slack、Notion、GitHub、Microsoft Teams |

**業界壓倒性主流是路線 B**：不為訪客另蓋一套 App，而是用同一套介面 + 動態隱顯。原因：
1. 維護兩套 UI 成本高、容易產生功能落差。
2. 受限者常常會「轉正」（志工變正式成員），同一介面讓升級無痛。
3. 路線 A 只有在「外部使用者數量極大且信任極低」（如數十萬名客戶）時才划算——這不是 Wanguard 後台協作者的情境。

> 這也正好呼應 04-rbac 既有的設計原則：「**頁面結構一致 + 動態隱顯**」。

---

## 3. 成熟產品作法比較

### 3.1 Slack — Single-Channel Guest（單頻道訪客）

最貼近本問題的範例。Slack 把帳號分三級：**Member / Multi-Channel Guest / Single-Channel Guest**。

- **單頻道訪客**：只看得到**被邀進的那一個頻道**，把整個 workspace 當成「一個房間」。
- 不能瀏覽其他頻道、**不能搜尋 workspace、不出現在成員目錄**、不能主動私訊正式成員（除非對方先發訊息）。
- 免費（每位付費成員可帶 5 名單頻道訪客），由 Admin 控管其頻道存取。

**對應到 Wanguard**：被邀進一個 Team 的一般使用者 ＝ 單頻道訪客。進得了後台，但後台對他而言就只是「那一個 Team」這個房間，看不到也搜不到其他 Team、地圖工具、成員管理等。

### 3.2 Notion — Guest（頁面級訪客）

概念框架最乾淨的範例：

- **Member（成員）＝ workspace 全域存取**：對大部分內容至少有讀取權。
- **Guest（訪客）＝ 不能有 workspace 全域權限**，只能被「逐頁邀請」，且自動繼承該頁的子頁。
- 訪客**不能被加進成員群組、不能改 workspace 設定、不能再邀請別人**。

**關鍵洞察**：Notion 把「全域可見性」綁在 **Member 身份**，把「單一空間可見性」綁在 **被邀請的事實**——兩者是兩個獨立來源。這正是 Wanguard 解耦模型可以直接借用的：**後台可見範圍 = RBAC 給的（全域）∪ Team 成員身份給的（單一空間）**。一般使用者的 RBAC 給 0，所以他只剩 Team 那一塊。

### 3.3 GitHub — Outside Collaborator（外部協作者）

- **外部協作者**：可存取**被明確指定的 repo**，但**不是 org 成員**、不出現在 org 的「People」名單、沒有 org 全域可見性。
- 重要對比：GitHub **不允許把外部協作者加進 Team**（Team 是 org 成員專屬的分組）。
- 但兩者都能在 repo 層級被賦予不同權限（Read / Write / Admin…）。

**對 Wanguard 的啟示**：GitHub 證明「非正式成員 + 範圍精準鎖定」可長期穩定運作，且**外部協作者與正式成員是兩個明確分開的概念**——不要把訪客硬塞進「正式成員」的資料結構，會比較乾淨。

### 3.4 Microsoft Teams / Entra B2B — Guest vs External Member

- **Guest（訪客）**：B2B 帳號，可加入某個 Team 並存取該 Team 資源，但**目錄權限預設受限**。
- **External Member（外部成員）**：少見，給「同一大組織的多租戶」用，享 member 級權限。
- 重要教訓：**訪客不能被「靜默轉正」成 member**——身份層級要在邀請時就明確定義，事後轉換有摩擦。

**對 Wanguard 的啟示**：如果決定讓一般使用者以「訪客」身份進後台，要在**邀請那一刻就把身份定義清楚**（是「Team 訪客」還是「直接升為 NGO」），不要留模糊的中間態。

### 3.5 救災領域競品（repo 既有研究）

- **Crisis Cleanup**：以「組織（Organization）」為核心，志工隸屬組織後才能認領案件；外部/未驗證者只能看有限資訊。它的做法接近「先入組織才有後台能力」——即**偏向「邀請＝賦予角色」**而非「純訪客」。
- **Sahana Eden**：完整 RBAC + 組織登記，角色決定模組可見性，沒有輕量訪客層——較重。

救災語境的額外考量：**現場人員流動極快、信任建立時間短**，因此「掃 QR 即可立刻開工」的低摩擦比「精細的訪客權限」更重要。這會把天平往「邀請即賦予可工作的身份」傾斜。

---

## 4. 跨產品關鍵洞察

1. **幾乎沒人為受限者另建前台**——主流是「同一後台 + 介面收斂」（路線 B）。
2. **「全域可見」與「單一空間可見」是兩個獨立的權限來源**（Notion 最清楚）。可直接套用 Wanguard 解耦模型：**可見範圍 = RBAC(全域) ∪ Team 成員(單一空間)**。
3. **訪客 ≠ 成員，要是明確的獨立層級**（Slack、GitHub、Teams 都這樣分），不要做出「權限說不清的半殘成員」。
4. **訪客看不到目錄/清單**——對應 Wanguard：訪客（Team 內角色為 Member）本來就看不到 Team 成員清單（只有 Team Admin 看得到），規則天然一致。
5. **身份要在邀請當下定義清楚**，避免事後難以轉換的模糊態（Teams 教訓）。
6. **救災語境偏好低摩擦**：掃碼即可開工 > 精細訪客控管。

---

## 5. 對 Wanguard 的建議

兩個可行方案，推薦 **方案一**：

### ✅ 方案一（推薦）— 後台存取「推導自身份來源」，一般使用者以 Team 訪客進入

完全貼合 v3.0 解耦原則：**不改他的 RBAC**（仍是「一般使用者」），但「是否進得了後台、看得到什麼」由下列公式推導：

```
後台可見範圍 = RBAC 授予的全域範圍  ∪  所屬 Team 授予的單一空間範圍
```

- 一般使用者 RBAC 全域範圍 = ∅；但因為他是某 Team 的 Member，所以解鎖「該 Team 這一個空間」。
- 結果：他**進得了後台，但後台對他收斂成只剩那一個 Team**（看任務、回報進度、看同 Team 夥伴）。
- member-management、其他 Team、地圖繪製、災害啟動、Audit Log 等**對他完全不渲染**（且後端 403 把關）。
- 對應 Slack 單頻道訪客 + Notion 訪客模型。

**優點**：RBAC 與 Team 真正解耦、邏輯一條公式說清楚、無摩擦、可無痛轉正。
**缺點**：需要在權限引擎實作「推導式可見範圍」而非單純查 RBAC。

### 方案二 — 邀請即賦予 NGO 角色（Crisis Cleanup 風格）

Team Admin 邀請時，被邀者直接升為 RBAC = NGO，於是用既有 NGO 權限自然取得 Team-scoped 後台。

**優點**：權限邏輯最簡單（只查 RBAC）、最低摩擦、貼近救災競品。
**缺點**：違反「邀進 Team 不該改 RBAC」的解耦原則；且「一個剛掃碼的志工」立刻變 NGO 角色，語意上膨脹。

> 折衷：可在 RBAC 增列一個輕量的 **「Team 訪客 / Volunteer」第 6 種角色**，但這會打破「只有 5 種 RBAC」的約束——除非你願意把它定義成「Team 內角色」而非 RBAC（即訪客是 Team 內第三種內部角色：Admin / Member / Guest）。

---

## 6. 建議的可見範圍推導表（採方案一）

| 觀察者 | RBAC 全域範圍 | 因 Team 成員身份解鎖 | 實際後台所見 |
|---|---|---|---|
| Super Admin | 全平台（含 member-management 全部） | —（通常無 Team） | 全部 |
| Government | 全部 Team 名稱+窗口、跨 Team 任務 | 若被加入某 Team，另解鎖該 Team 內部 | 全域 ∪ 該 Team |
| NGO | 無全域、僅自家責任區 | 自己所屬 Team(s) | 所屬 Team(s) |
| Data Auditor | 全平台任務（審查用），不含任何 Team 成員清單 | —（通常無 Team） | 全域審查視圖 |
| **一般使用者（被邀入 Team）** | **∅** | **被邀的那一個 Team** | **只有那一個 Team** |
| 一般使用者（未入任何 Team） | ∅ | — | **進不了後台（純前台）** |

> 最後一列回答了核心問題：**沒被任何 Team 邀請的一般使用者，不該進後台**；一旦被邀進某 Team，就以「Team 訪客」進入、且只看得到那一個 Team。

---

## 7. 待決問題（供 PRD 回填）

- [ ] 採方案一（推導式、RBAC 不變）還是方案二（邀請即升 NGO）？
- [ ] 若採方案一，訪客在 Team 內是定位成 **Member** 還是新增 **Guest** 這第三種 Team 內角色（Guest 可能連回報任務都受限，只能看）？
- [ ] 訪客能否被同 Team 的 Team Admin 升為正式角色？升級流程是否需 Super Admin 介入（跨身份升等）？
- [ ] 訪客的後台是否需要與正式成員視覺上區隔（如標示「訪客」徽章），避免現場誤認權限？

---

## 參考來源

- Slack — Understand guest roles：https://slack.com/help/articles/202518103-Understand-guest-roles-in-Slack
- Slack — Types of roles：https://slack.com/help/articles/360018112273-Types-of-roles-in-Slack
- Notion — Who should be a member, who should be a guest：https://www.notion.com/help/guides/who-should-be-a-workspace-member-who-should-be-a-guest
- Notion — Manage members & guests：https://www.notion.com/help/add-members-admins-guests-and-groups
- GitHub — Managing outside collaborators：https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-outside-collaborators
- GitHub — Roles in an organization：https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization
- Microsoft Teams — Guest access：https://learn.microsoft.com/en-us/microsoftteams/guest-access
- Microsoft Entra — B2B guest user properties：https://learn.microsoft.com/en-us/entra/external-id/user-properties
