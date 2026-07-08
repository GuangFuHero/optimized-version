# 研究 — 站內通知中心模式（In-App Notification Center）

> **目的**：02-user-profile 的通知設計只說「非主動推播，開頁時更新」+ 三種通知類型，但沒回答成熟通知中心都會處理的問題：
> 1. 「開頁時更新」具體怎麼做？輪詢？間隔多久？大量人同時在線會不會壓垮後端？
> 2. 已讀 / 未讀怎麼算？徽章數字怎麼計？點開算已讀還是點單則才算？
> 3. 通知要不要分組、要不要保留歷史、保留多久？
> 4. 同一事件短時間多次觸發要不要合併（防洗版）？
> 5. 三種通知是否該各有「跳轉目的地（deep link）」？
> **日期**：2026-06-10
> **關聯**：[[../prd]]（02-user-profile）、[[../../08-ticket-management/prd]]、[[../../07-resource-station/prd]]、[[../../05-member-management/prd]]、[[../../09-emergency-announcement/prd]]
> **狀態**：研究參考，供決策用（PRD 內以「🟡 建議」回填）

---

## 1. 問題拆解

02-user-profile 明確選了**「非主動推播（no push），開頁/換頁時才更新」**的輕量模型。這是個合理的取捨（不必經營 Web Push 訂閱、不必處理 Service Worker），但代價是**即時性**與**伺服器負載**之間要找平衡點。成熟產品（GitHub、Linear、Slack、Jira）的通知中心，差異主要落在四件事：**傳輸機制、已讀模型、分組與保留、防洗版**。

---

## 2. 傳輸機制：在「不做 Push」前提下的三種更新方式

| 機制 | 說明 | 即時性 | 後端負載 | 代表 |
|---|---|---|---|---|
| **A. 換頁/載入時拉一次** | 每次頁面載入或路由切換時打一次 API | 低（停在同頁就不更新） | 最低 | 傳統 server-rendered 後台 |
| **B. 短輪詢（short polling）** | 前端每 N 秒打一次 `GET /notifications/unread_count` | 中（取決於間隔） | 中（人數 × 頻率） | GitHub 網頁鈴鐺、多數 SaaS |
| **C. 長輪詢 / SSE / WebSocket** | 伺服器有事件才推 | 高 | 高（長連線） | Slack、Linear（但這已接近 push） |

> 02-user-profile 既然定為「非主動推播」，**最貼合的是 A + 輕量 B 的組合**：頁面載入先拉一次（A），停留期間以**較長間隔輪詢未讀數**（B，例如 30–60 秒，只拉「數字」不拉「內容」，內容點開鈴鐺才拉）。GitHub 的鈴鐺正是這種「先拉計數、點開才拉清單」的兩段式設計，能把負載壓到最低。
>
> 🟡 **建議**：輪詢間隔做成可調參數，**平時 60 秒、災害啟動期間自動縮短到 15–30 秒**（與 [[../../09-emergency-announcement/prd]] 的緊急公告即時性需求對齊）。

### 防驚群（thundering herd）
大量使用者同時在線時，若大家用「固定整點輪詢」會在同一瞬間打爆後端。業界作法：**加入隨機抖動（jitter）**，每個 client 的輪詢間隔 ±10–20% 隨機，把請求攤平。

---

## 3. 已讀 / 未讀模型

成熟產品普遍把「通知狀態」拆成多個維度，不是單一布林：

| 狀態 | 含義 | 代表 |
|---|---|---|
| **unseen（未看見）** | 還沒被算進「鈴鐺紅點」——使用者連通知列表都還沒打開 | Slack badge |
| **unread（未讀）** | 看過列表、但這一則還沒點開細節 | GitHub、Linear |
| **read（已讀）** | 點開過該則 | 通用 |
| **archived / done（已處理）** | 使用者主動歸檔，不再出現在主列表 | GitHub「Done」、Linear inbox |

> **關鍵設計選擇**：「打開鈴鐺」應只清掉**紅點（unseen → seen）**，**不應**把每則都標成已讀——使用者還沒讀內容。GitHub、Linear 都是這樣：打開列表紅點消失，但每則仍維持未讀粗體，直到點進去。
>
> 🟡 **建議 Wanguard 採三態**：`unseen`（紅點數字）→ `unread`（列表內粗體）→ `read`（點開後）。再提供「全部標為已讀」批次操作。

---

## 4. 分組、保留與歷史

| 議題 | 業界常見作法 | 🟡 對 Wanguard 建議 |
|---|---|---|
| **分組** | 依類型 Tab 或依事件對象聚合（如「同一 Ticket 的 3 則更新」收合成 1 條） | 至少依 02 的三種類型可篩選；同一 Ticket/同一申請的多則建議聚合 |
| **保留期限** | GitHub 5 個月、Slack 依方案、Linear 不限但可歸檔 | 建議站內通知保留 **90 天**，逾期歸檔或清除（災害稽核需求另由 Audit Log 承擔，見 [[../../05-member-management/prd]]） |
| **歷史檢視** | 提供「全部通知」頁，可翻舊的 | 提供完整通知頁，與鈴鐺快覽（最近 N 則）分離 |
| **跨裝置同步** | 已讀狀態雲端同步 | 已讀狀態存後端，不存 localStorage |

---

## 5. 防洗版（Notification Batching / Throttling）

災害期間單一任務可能短時間被多人承接、多次更新，若每次都產一則通知會把鈴鐺洗爆。業界作法：

- **合併（digest）**：同一對象（同一 Ticket）短時間（如 5 分鐘）內多次更新 → 合併成「您的任務有 3 則新進度」。
- **去抖（debounce）**：相同類型相同對象的連續事件，只保留最新一則或顯示計數。

> 🟡 **建議**：對「任務配對提醒」做合併（同一 Ticket 多人承接 → 一則含計數），對「審查結果」「角色升等」這種一次性結果**不合併**（每則都重要）。

---

## 6. 三種通知的 Deep Link（點擊跳轉）

02 的三種通知都應該「點了就跳到該去的地方」，否則使用者收到通知還要自己找。建議補上跳轉目的地：

| 通知類型 | 觸發來源 | 🟡 建議跳轉目的地 |
|---|---|---|
| 任務配對提醒 | [[../../08-ticket-management/prd]] 有志工承接 | 該 Ticket 詳情抽屜 |
| 審查結果通知 | [[../../07-resource-station/prd]] 修改建議審查完成 | 該資源站 / 該建議的結果頁 |
| 角色升等提醒 | [[../../05-member-management/prd]] 審核通過 | 個人檔案的角色區 / 重新整理套用新權限 |

> 🟡 **建議補強**：02 目前只列 3 類通知，但 [[../../09-emergency-announcement/prd]] 的後台公告、[[../../06-map-decision-support/prd]] 的 Zone 指派/Hazard 警示、[[../../05-member-management/prd]] 的待審佇列徽章，本質都需要觸達後台人員。**是否納入站內通知中心，還是各自獨立呈現，需要在 02 與這些 feature 間對齊**（列入開放問題）。

---

## 7. 「系統使用習慣」持久化（Pin 偏好）

02 提到記住 Pin 的圖層 / 觀測站 / 關注任務類型。業界（地圖類產品如 ArcGIS、Google My Maps）的作法：

- 偏好存在**後端 user_preferences**（非僅 localStorage），確保換裝置一致。
- 結構化為 `{ pinned_layers: [], pinned_stations: [], watched_task_types: [] }`。
- 🟡 **待確認**：Pin 的圖層若日後被刪除（如某 Hazard Zone 過期、某觀測站被刪），偏好要不要自動清理？建議**保留 ID 但渲染時略過失效項**，避免報錯。

---

## 8. 待決問題（供 PRD 回填）

- [ ] 輪詢間隔：平時 60 秒 / 災害期 15–30 秒、加隨機抖動？
- [ ] 已讀採三態（unseen / unread / read）+「全部標為已讀」？
- [ ] 通知保留期限 90 天？逾期歸檔或清除？
- [ ] 任務配對提醒是否做合併（同 Ticket 多人承接 → 一則含計數）？
- [ ] 三種通知是否都帶 deep link 跳轉？
- [ ] 緊急公告 / Zone 指派 / 待審佇列是否納入同一通知中心？
- [ ] Pin 偏好存後端、失效項渲染時略過？

---

## 9. 參考來源

- GitHub — About notifications（unread/read、保留 5 個月、鈴鐺兩段式）：https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github
- Linear — Inbox & notifications（unread / read / snooze / done）：https://linear.app/docs/inbox
- Slack — Manage notifications / badge 行為：https://slack.com/help/articles/201355156
- Knock / Courier — In-app notification feed best practices（batching、seen vs read、digest）：https://knock.app/blog
- NNG (Nielsen Norman Group) — Notifications UX 原則
- 短/長輪詢與 jitter：常見後端負載控制實務（exponential backoff with jitter）
