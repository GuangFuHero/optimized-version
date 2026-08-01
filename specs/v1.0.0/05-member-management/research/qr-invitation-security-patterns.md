# 研究 — QRCode / 連結邀請的安全模式（Invitation & QR Security）

> **目的**：05-member-management 大量依賴「QRCode + 短連結」邀請（Team 邀請 72h、成員邀請 24h 可多人 50 次、OTP 待確認）。這是災時擴員的命脈，但也是最容易被濫用的入口。本研究回應 05 的開放問題並補安全細節：
> 1. 一次性 vs 多次邀請 token 的安全模型與防外流。
> 2. OTP 是否該強制（05 傾向是）。
> 3. QR 外流被陌生人掃到混合角色 Team 的防護。
> 4. 邀請的撤銷 / 輪替 / 稽核。
> 5. 深連結（短連結）被轉傳、被預覽抓取（link preview bot）誤觸的問題。
> **日期**：2026-06-10
> **關聯**：[`prd.md`](../prd.md)（05-member-management）、[[01-auth]]、[[04-rbac]]、[[03-user-settings]]
> **狀態**：研究參考，供決策用（回填至 05 開放問題）

---

## 1. 問題拆解

邀請連結本質是「持有即可獲得某種存取」的 **bearer token**。災時要快（發 LINE 群秒加人），但 Team 可能混合不同 RBAC（含 Government 協作官），一旦外流，陌生人掃碼可能混進敏感協作空間。成熟產品（Slack、Notion、GitHub、MS Teams、1Password、Crisis Cleanup）的共識可歸納為四原則：**短時效、可撤銷、加入需二次確認、全程稽核**。

---

## 2. 一次性 vs 多次 token 的安全模型

| 類型 | 05 對應 | 業界作法 | 風險與緩解 |
|---|---|---|---|
| **一次性 token** | Team 邀請（首位掃碼成 Admin） | 用後即焚（Slack 單次邀請、GitHub SSO 一次連結） | 最安全；首掃即綁定，後續掃碼進「待確認佇列」✅ 05 已這樣設計 |
| **多次 token（有上限）** | 成員邀請（24h、上限 50） | Slack/Notion 共享邀請連結（可設過期與上限） | 外流風險高 → 必須可隨時撤銷 + 加入需 Admin 確認 / OTP |

> 05 既有設計（首掃成 Admin、後續進確認佇列、多次 QR 有次數上限）方向正確。本研究建議補：**多次 token 必須可「立即撤銷 / 重新產生（rotate）」**，外流時一鍵作廢舊碼。

---

## 3. OTP 是否強制——回應 05 開放問題（傾向是）

簡訊/Email OTP 把「持有連結」升級為「持有連結 **且** 控制某個手機/信箱」，大幅降低純外流風險。

> 🟡 **建議：強制 OTP**（與 05 傾向一致）。流程：掃 QR → 填手機 → 收 OTP → 完成註冊。OTP 規格沿用 [[01-auth]] 研究（6 碼 / 5 分鐘 / 限流）。
> 例外考量：災時偏鄉收不到簡訊 → 🟡 可備援 Email OTP 或「Team Admin 手動確認佇列」雙軌（05 已有確認佇列，正好當 OTP 收不到時的後備）。

---

## 4. QR 外流 / 陌生人掃碼——回應 05 之 E10

多層防護（defense in depth），任一層擋下即安全：

1. **短時效**（Team 72h / 成員 24h）—— 05 已有。
2. **OTP 驗證身份** —— §3。
3. **加入需確認佇列**（首位以外 / 多次 token 掃碼者進 Team Admin 確認）—— 05 已有。
4. **次數上限 + 可撤銷 / 輪替** —— 建議補「撤銷/rotate」。
5. **混合角色 Team 的額外把關**：若 Team 內含 Government / 跨組織協作者（敏感），🟡 建議該 Team 的邀請**一律需 Admin 逐一確認**，不開放「掃碼即入」。
6. **稽核**：QR 產生 / 失效 / 被使用 全進 Audit Log —— 05 F4.1 已有。

---

## 5. 短連結被預覽 bot 誤觸（容易被忽略的雷）

LINE / Slack / WhatsApp 等通訊軟體會對貼上的連結發 **link-preview 爬蟲** 預抓。若邀請連結是「**GET 即消耗 / 即生效**」，預覽 bot 可能在使用者點之前就把一次性 token 用掉，造成「連結失效」客訴。

> 🟡 **建議**：邀請連結的「**檢視**」與「**接受**」分離——
> - `GET /i/{token}`：只回傳邀請資訊頁（誰邀你、加入哪個 Team），**不消耗** token、不改狀態。
> - `POST /i/{token}/accept`：使用者按「加入」才真正消耗 / 進確認佇列。
> 這同時讓「接受前先看清楚要加入哪個 Team」成為可能，符合 §4 的知情同意。

---

## 6. 邀請的撤銷、輪替與到期語義

| 能力 | 🟡 建議 |
|---|---|
| **撤銷（revoke）** | Team Admin / Super Admin 可即時作廢任一未用 / 多次 token |
| **輪替（rotate）** | 疑似外流時，一鍵作廢舊碼 + 生成新碼 |
| **到期顯示** | 列出進行中的有效邀請及剩餘時效 / 已用次數 |
| **pending 清理** | 掃了 QR 但未完成 OTP 的 `pending` 帳號，逾時（如 24h）自動清除（呼應 05 F2.4 pending 狀態） |

---

## 7. 待決問題（回填至 05 開放問題）

- [ ] 強制 OTP（手機為主、Email 為偏鄉備援、確認佇列為最終後備）？
- [ ] 多次邀請 token 是否補「撤銷 / 輪替（rotate）」能力？
- [ ] 混合角色 / 含 Government 的 Team，邀請是否一律走 Admin 逐一確認（不開放掃碼即入）？
- [ ] 邀請連結是否「檢視（GET 不消耗）／接受（POST 消耗）」分離，避免 link-preview bot 誤觸？
- [ ] pending 帳號逾時自動清除（如 24h）？

---

## 8. 參考來源

- Slack — Create & manage invite links / revoke：https://slack.com/help/articles/201330256
- Notion — Share & invite links, link expiry：https://www.notion.com/help/add-members-admins-guests-and-groups
- GitHub — Inviting users / SSO 一次性連結：https://docs.github.com/en/organizations
- Microsoft Teams / Entra B2B — Guest invitation redemption & verification：https://learn.microsoft.com/en-us/entra/external-id/
- OWASP — 防止 bearer token 外流、短時效與輪替；link unfurling/preview 副作用（避免 GET 變更狀態的 CSRF/側效）
- 與本 repo 既有：[[01-auth]]（OTP 規格）、[`guest-restricted-access-patterns.md`](guest-restricted-access-patterns.md)（訪客模型）
