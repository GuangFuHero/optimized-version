# Feature PRD — 緊急公告系統 (Emergency Announcement)

> **版本：** v1.1 — 對齊 CAP：拆細嚴重程度分級、排程/到期、分眾投放、已讀回執、多則並存（建議形式，未推翻 v1.0）
> **日期：** 2026-06-10
> **狀態：** Definition Phase
> **所屬功能：** 緊急公告系統 Emergency Announcement（ManagerEnd 核心模組）
> **關聯文件：** `research/emergency-alert-cap-patterns.md`、`ai-context/decisions-log.md`、`product/user-journey.md`、`design/foundation/design-principles.md`、`UI-UX-Analysis.md`

> 🟡 **v1.1 補充說明**：v1.0 的「發 / 預覽 / 下架」是正確核心，但災害情境下公告其實是一個**警報分發系統**。本版借用國際標準 **CAP（Common Alerting Protocol）** 的結構把它拆細（嚴重度、排程到期、分眾、回執），模糊處標 🟡。研究依據見 [`research/emergency-alert-cap-patterns.md`](research/emergency-alert-cap-patterns.md)。
>
> ⚠️ **一致性質疑**：v1.0 寫「Super Admin（唯一操作者）/ 發佈僅限 Super Admin」，但 [[04-rbac]] 的權限總表把「編輯前台公告」給了 **Super Admin + Government**、「編輯後台公告」給了 **Super Admin + Government + Team Admin（自家）**。兩者矛盾——建議釐清：**前台對外警報限 Super Admin（+Government），後台協調公告可下放 Team Admin 對自家 Team 發**。見下方 A4 與開放問題。

---

## 使用者情境

* **角色：** Super Admin（唯一操作者）
* **場景一（前台公告）**：颱風即將登陸，Super Admin 需要在前台頁面最頂部顯示「颱風警報：請勿前往 XX 地區」，確保所有進入平台的使用者第一眼看到。
* **場景二（後台公告）**：協調應變作業中，Super Admin 需要通知所有後台工作人員與 NGO「今晚 22:00 後暫停任務媒合，等待統一指令」。
* **痛點 / 觸發點：** 緊急資訊若只能透過 LINE 群組或 Email 傳達，無法確保所有人都看到；平台內的公告機制可以確保訊息觸達率，但需要夠快、夠簡單，避免在緊急時刻還要走複雜流程。

---

## IDEAL Case

1. Super Admin 在後台點擊「發佈公告」，選擇對象（前台 / 後台），輸入標題與內容。
2. 點擊「預覽」，看到公告在目標頁面上的實際顯示效果。
3. 確認無誤後點「發佈」，公告立即生效：前台置頂橫幅出現 / 後台所有人員看到公告提示。
4. 情況解除後，Super Admin 下架公告，橫幅消失。
5. **結果：** 從決定發佈到所有相關人員看到公告，整個流程在 2 分鐘內完成。

---

## User Story

* As a **Super Admin**，I want **在前台發佈置頂緊急公告**，so that **所有進入平台的民眾第一眼就能看到重要警示，不會錯過**。
* As a **Super Admin**，I want **對後台所有工作人員和 NGO 發佈協調公告**，so that **確保所有人收到統一指令而不需要依賴外部通訊工具**。
* As a **Super Admin**，I want **發佈前預覽公告的顯示效果**，so that **確認排版與內容正確後再正式推送，避免緊急時刻出現文字錯誤**。

---

## 功能需求

### 前台公告

* 使用場景：災情啟動或突發事件時。
* 操作：編輯公告內容後在**前台頁面置頂展開**顯示。

### 後台公告

* 對象：所有後台工作人員與 NGO 成員。
* 用途：發佈內部協調事項公告。

### 發佈前預覽

* 公告發佈前支援預覽功能，確認顯示效果後再正式發佈。

---

## 拆細規格（v1.1，對齊 CAP）

> 詳見 [`research/emergency-alert-cap-patterns.md`](research/emergency-alert-cap-patterns.md)。模糊處標 🟡，未推翻 v1.0。

### A1. 公告資料模型（🟡 建議對齊 CAP 子集）

```yaml
Announcement:
  id, channel: frontstage | backstage      # 前台 / 後台（沿用 v1.0）
  severity: extreme | severe | moderate | minor   # 嚴重程度（決定視覺）
  headline, body, instruction?             # 標題 / 內文 / 應採取行動
  event_ref?: disaster_activation_id       # 關聯災害事件（08）
  effective_at, expires_at                 # 排程生效 / 自動到期
  area?: { admin_areas[] | geometry }      # 分眾：地理範圍（可選）
  audience?: { rbac[] | team_ids[] }       # 分眾：對象（後台公告用）
  require_ack?: bool                        # 是否需已讀確認（後台用）
  status: draft | scheduled | active | expired | cancelled | superseded
  created_by, published_at, taken_down_by
```

### A2. 嚴重程度分級與視覺（🟡 建議）

| severity | 前台視覺 | 行為 |
|---|---|---|
| **Extreme 極端** | 紅底、可全螢幕攔截 modal | 進站強制顯示，需手動關閉 |
| **Severe 嚴重** | 橙底置頂橫幅 | 置頂、可收合 |
| **Moderate 中等** | 黃底橫幅 | 置頂、可關閉 |
| **Minor 輕微 / 一般協調** | 藍/灰資訊條 | 低調呈現 |

* 🟡 **建議**：severity 與 [[06-map-decision-support]] Hazard Zone 的 `low/medium/high/critical` 用語對齊或可互轉，避免一個平台兩套嚴重度語彙。

### A3. 排程與自動到期（🟡 建議）

* **排程發佈**：可設 `effective_at` 預定上架（如「22:00 起暫停媒合」提前排定）。
* **自動到期**：到 `expires_at` 自動下架，避免忘了下架造成資訊污染（前台警報 🟡 建議預設 24h，與 Hazard Zone 一致）。
* 保留 v1.0「立即發佈」快速路徑（緊急不必排程）。
* **狀態機**（借 CAP msgType）：

```
draft → scheduled → active → expired
active → cancelled(提前撤銷)
active → updated(發更新版取代前一則，舊版標 superseded)
```

### A4. 分眾投放與發佈權限（🟡 建議）

| 維度 | 建議 |
|---|---|
| 管道 | 前台橫幅 / 後台公告（沿用 v1.0） |
| 地理 | 借 CAP `area`，可只投放特定行政區（結合 06） |
| 對象 | 後台協調公告可指定 RBAC / Team（對齊 04-rbac） |
| 語言 | 🟡 待確認：至少中英，多語 v2 擴充 |
| **發佈權限** | 🟡 **建議釐清**：前台對外警報限 **Super Admin（+Government）**；後台協調公告可下放 **Team Admin 對自家 Team** 發（對齊 04-rbac 權限表，修正 v1.0「唯一操作者」） |

### A5. 後台公告已讀回執（Acknowledge，🟡 建議）

* 後台協調公告可勾「需確認」；發佈者看得到「已確認 X / 未確認 Y」，可催未確認者。
* 前台民眾警報量大，**不需**回執。

### A6. 多則並存與版位（🟡 建議）

* 排序：severity → effective 時間。
* 前台置頂**最多同時顯示 1–2 則**（最高 severity 優先），其餘收進「更多警報」，避免橫幅把首頁推太下面。

### A7. 異常場景（v1.1 新增）

| 編號 | 場景 | 處理建議 |
|------|------|----------|
| **AN1** | 颱風過了但忘了下架 | 自動到期（A3）即解決；無 expires 者後台顯示「已逾預期時長」提醒。 |
| **AN2** | 同時多則高嚴重度公告 | 依 A6 版位上限，最高 severity 優先，其餘收合。 |
| **AN3** | 排程公告在生效前情況已變 | scheduled 狀態可編輯 / 取消，不需等到生效。 |
| **AN4** | 公告內容需更正 | 發 `updated` 版取代前一則（舊版 superseded），而非刪除重發，保留稽核鏈。 |
| **AN5** | 後台關鍵指令無人確認 | require_ack + 已讀比例 + 催確認（A5）。 |
| **AN6** | Team Admin 越權發前台對外警報 | ⛔ 前台警報限 Super Admin（+Government）；前後端雙重驗證（對齊 04-rbac）。 |

---

## 成功驗收標準

- [ ] 前台公告發佈後，所有造訪前台的使用者在頁面頂部可見置頂橫幅。
- [ ] 後台公告發佈後，所有已登入後台的人員在下次開啟頁面或重新整理時看到公告提示。
- [ ] 預覽功能可分別預覽前台與後台的實際顯示效果。
- [ ] 公告可由 Super Admin 隨時下架，下架後 1 分鐘內前後台均不再顯示。
- [ ] 公告編輯、發佈、下架操作均記錄在 Audit Log。
- [ ] 公告發佈操作僅限 Super Admin，其他角色不顯示操作入口。（🟡 待與 04-rbac 對齊：前台限 Super Admin/Government、後台可含 Team Admin）
- [ ] 公告可設 severity，前台依嚴重程度呈現不同視覺分級。
- [ ] 公告可排程發佈並在 expires 自動下架，逾期不再顯示。
- [ ] 後台「需確認」公告可顯示已確認/未確認比例。
- [ ] 多則前台公告並存時依 severity 排序，置頂版位有上限。
- [ ] 公告更正以 updated 版取代並保留稽核鏈，而非刪除重發。

---

## 開放問題（v1.1 新增，待確認）

- [ ] 公告資料模型對齊 CAP 子集（severity / effective / expires / area / audience）？
- [ ] severity 四級 + 視覺分級，並與 Hazard Zone 分級用語對齊？
- [ ] 支援排程發佈與自動到期（前台預設 24h）？
- [ ] 分眾投放（地理 / RBAC / Team / 多語）納入範圍？多語是否 v1？
- [ ] 後台協調公告支援「需確認」回執？
- [ ] **發佈權限**：v1.0「唯一操作者 Super Admin」是否依 04-rbac 調整為「前台限 Super Admin/Government、後台含 Team Admin（自家）」？
- [ ] 前台置頂同時顯示則數上限（建議 1–2）？

---

## 相關 Feature

* [[04-rbac]] — 公告發佈與分眾的權限邊界（🟡 需與本 feature 對齊發佈者範圍）
* [[02-user-profile]] — 後台成員接收公告通知（建議：後台公告發佈即生成站內通知）
* [[06-map-decision-support]] — 公告地理範圍與 Hazard Zone 嚴重度對齊
* [[08-ticket-management]] — 公告關聯 Disaster Activation 事件

---

## 變更紀錄

| 版本 | 日期 | 更新重點 | 負責人 |
|------|------|----------|--------|
| v1.0 | 2026-05-28 | 初版建立，從 prd-manager-end.md §4 拆分 | — |
| v1.1 | 2026-06-10 | 對齊 CAP：拆細公告資料模型、嚴重程度視覺分級、排程/自動到期狀態機、分眾投放、已讀回執、多則並存版位、6 條異常場景；質疑並標註 v1.0「唯一操作者」與 04-rbac 權限表的矛盾；新增研究檔 `research/emergency-alert-cap-patterns.md` | — |
