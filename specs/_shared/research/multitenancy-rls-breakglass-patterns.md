# 研究 — 多租戶資料隔離、Break-glass、唯讀角色與雙人核可

> **目的**：04-rbac v2.0 已很完整（5 種角色 + Team 兩維、可見性矩陣、建議 RLS）。本研究專門回應其**開放問題**：
> 1. 是否需要「Read-only viewer」唯讀角色（媒體 / 觀察員）？業界怎麼做？
> 2. Team Admin 與 Government 能否兼任（政府人員又是慈濟成員）？——權限優先序。
> 3. 角色變更是否需強制登出？
> 4. 平台級操作（關閉災害事件、解除直立救援）是否需兩位 Super Admin 雙簽？
> 並補一個 v2.0 點到但沒展開的主題：**PostgreSQL RLS 的實作模式與陷阱**，以及災時 **break-glass（緊急破窗）** 存取。
> **日期**：2026-06-10
> **關聯**：[[04-rbac]]（04-rbac）、[[05-member-management]]、[[01-auth]]、[[08-ticket-management]]
> **狀態**：研究參考，供決策用（回填至 04-rbac 開放問題）

---

## 1. PostgreSQL Row-Level Security 實作模式（補 v2.0「建議 RLS」的 how）

v2.0 建議「在 DB 層再加一層 RLS」，這裡補實作要點與陷阱：

| 要點 | 說明 |
|---|---|
| **以 session 變數帶租戶 context** | 連線時 `SET app.current_user_id` / `app.team_ids`，policy 用 `current_setting()` 過濾 |
| **policy 分讀寫** | `USING`（讀/可見列）與 `WITH CHECK`（寫入合法性）分別定義，避免「看不到卻能寫」 |
| **`FORCE ROW LEVEL SECURITY`** | 否則 table owner（常是 app 連線帳號）會繞過 RLS——這是最常見的漏洞 |
| **連線池陷阱** | PgBouncer 等共用連線時，session 變數可能殘留給下一請求 → 必須每請求重設或用 `SET LOCAL`（交易內） |
| **效能** | policy 內的子查詢要可走索引；`team_id` 應建索引 |
| **defense-in-depth** | RLS 是「最後一道」，不取代 app 層 middleware（v2.0 既有原則一致） |

> 業界（Supabase、Crunchy、AWS）共識：**多租戶 SaaS 用 RLS 做兜底是值得的，但絕不能當唯一防線**，且務必開 `FORCE` 並處理連線池殘留。

---

## 2. 唯讀角色（Read-only Viewer）——回應開放問題

| 產品 | 唯讀角色作法 |
|---|---|
| GitHub | Organization 有 `Read` / `Triage` 等低權層級 |
| Jira / Confluence | 明確 `Viewer` 角色，只讀不可改 |
| ArcGIS | `Viewer` user type，僅檢視地圖與儀表板 |
| Grafana | `Viewer` 只能看 dashboard |

> 🟡 **建議**：Wanguard 引入「Read-only viewer（觀察員 / 媒體 / 上級督導）」**作為一種低權 RBAC 或既有角色的唯讀旗標**，全域只讀、不含任何 Team 內部成員清單、不可編輯任何資料。**但須限制可見範圍**（如不可見受困者個資、不可見 Team 內部名單），避免變成個資外洩破口。建議列為 v2 加值，v1 可用「Government 唯讀子集」暫代。

---

## 3. 混合角色 / 雙重身份的權限優先序——回應開放問題（呼應 05 之 E7/E14）

問題：某 Government 人員同時是某 NGO Team 的成員，其 Ticket/Zone 權限該依「平台 RBAC」還是「當前 Team」？

業界（Microsoft Entra、AWS IAM、GCP IAM）對「多重角色」的通則：

- **權限取聯集（union of allow），但資料邊界取交集 / 當前情境（scope）**。
- IAM 普遍是「**deny 優先於 allow**」，且高敏感操作需明確 scope。

> 🟡 **建議**（供 04-rbac / 05 對齊）：
> - **平台 RBAC 決定「能做什麼動作」（動詞）**；**當前 Team context 決定「對哪些資料」（範圍）**。
> - 雙重身份者切到某 Team 時，動作能力＝其平台 RBAC ∪ 該 Team 內角色給的能力；可見資料範圍＝當前 Team。
> - 個資敏感的「Team 內部成員清單」仍嚴格依**該 Team 內角色**（Member 看不到），即使其平台 RBAC 是 Government（呼應 05 之 E7）。
> - 關於 E14「跨組織類型者擔任他組織 Team 的 Admin」：🟡 建議加一條軟性管控——**跨組織類型擔任 Admin 需 Super Admin 核可並記 Audit**，而非全面禁止。

---

## 4. 角色變更是否強制登出——回應開放問題

| 作法 | 取捨 | 代表 |
|---|---|---|
| 強制登出 | 安全、但擾民 | 高敏感金融系統 |
| 下次 token 刷新生效（不強制登出） | 體驗好、靠短 token 收斂時間窗 | 多數 SaaS、雲端 IAM |

> 04-rbac v2.0 已決「不強制登出、下次刷新生效」。本研究**支持此決策**，補充條件：**降權（如撤銷 Super Admin、停權）應更即時**——建議降權類變更縮短生效窗（如強制該使用者的 access token 立即失效一次），升權則可等自然刷新。這與 [[01-auth]] 的短 token 設計一致。

---

## 5. 雙人核可（Two-person / Dual-control）與 Break-glass——回應開放問題

### 5.1 雙簽（four-eyes principle）
高風險不可逆操作（關閉災害事件、解除直立救援、解散 Team、刪除大量 Ticket）業界常用 **four-eyes / maker-checker**：一人發起、另一人核可。

> 🟡 **建議**：
> - **災時不宜全面雙簽**（會拖慢應變）。建議只對「**關閉災害事件**」「**解散 Team**」這種**整體性、事後難復原**的操作要求雙簽或「冷靜期 + 可撤銷」二選一。
> - 「解除直立救援」維持 v2.0 的「限 Super Admin + 附理由」即可，不必雙簽（現場時效優先）。

### 5.2 Break-glass（緊急破窗存取）
呼應 [[01-auth]] A6：若究平安 SSO 中斷、或唯一 Super Admin 失聯，平台需要緊急取得最高權限的途徑。

> 業界（PagerDuty、AWS break-glass IAM、醫療系統）作法：保留**極少數封存的緊急帳號**，使用需強稽核（每次使用即告警 + 事後審查），平時鎖定。
>
> 🟡 **建議**：Wanguard 保留 1–2 組封存的緊急 Super Admin 憑證（離線保管），使用即觸發 Audit + 通知，事後檢討。這同時解掉 05 之 E8「最後一位 Super Admin 失聯」的死鎖。

---

## 6. 待決問題（回填至 04-rbac 開放問題）

- [ ] RLS 是否確實開 `FORCE ROW LEVEL SECURITY` 並處理連線池 session 殘留？
- [ ] 是否引入唯讀 Viewer 角色（限制可見範圍、不含個資/內部名單）？v1 還是 v2？
- [ ] 混合角色優先序採「RBAC 定動作、Team context 定範圍、個資依 Team 內角色」？
- [ ] 降權類變更是否縮短生效窗（立即失效一次 token）、升權等自然刷新？
- [ ] 哪些操作要雙簽 / 冷靜期（建議僅關閉災害事件、解散 Team）？
- [ ] 是否設置 break-glass 緊急 Super Admin 憑證（強稽核），同時解 E8 死鎖？

---

## 7. 參考來源

- PostgreSQL — Row Security Policies（FORCE RLS、USING/WITH CHECK）：https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Supabase — RLS 多租戶實務與陷阱：https://supabase.com/docs/guides/database/postgres/row-level-security
- AWS — Multi-tenant data isolation patterns / IAM evaluation logic（deny 優先）：https://docs.aws.amazon.com/
- Microsoft Entra — Multiple role assignment & PIM（Privileged Identity Management）
- NIST / 一般安全工程 — Four-eyes principle、Break-glass access
- 與本 repo 既有：[[05-member-management]]（E7 / E8 / E14）、[[01-auth]]（短 token、break-glass A6）
