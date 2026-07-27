---
feature: 09-emergency-announcement
title: 緊急公告系統
status: definition
owner:
depends_on: [02-user-profile, 04-rbac, 06-map-decision-support, 08-ticket-management]
design:
---

# Feature PRD — 緊急公告系統 (Emergency Announcement)

> **根基文件：** [`user-stories.md`](user-stories.md)（角色、情境、使用者目標——請先讀這份）
> **關聯文件：** `research/emergency-alert-cap-patterns.md`、[user-journey.md](../../user-journey.md)

---

## 核心概念：公告是一個警報分發系統

災害情境下的「公告」本質是警報分發，故借國際標準 **CAP（Common Alerting Protocol）** 的結構設計：

* **兩個管道**：前台對外警報（給民眾）、後台協調公告（給工作人員 / NGO）。
* **嚴重度驅動視覺**：severity（extreme / severe / moderate / minor）決定前台呈現強度。
* **排程 + 自動到期**：可預定上架、到期自動下架，避免資訊污染。
* **發佈權限對齊 [[04-rbac]]**：前台對外警報限 **Super Admin（+Government）**；後台協調公告可下放 **Team Admin 對自家 Team** 發。

---

## 使用者情境

* **角色：** Super Admin、Government（前台警報）、Team Admin（後台對自家 Team 公告）
* **場景一（前台公告）**：颱風即將登陸，需在前台頁面最頂部顯示「颱風警報：請勿前往 XX 地區」，確保所有進入平台的使用者第一眼看到。
* **場景二（後台公告）**：協調應變作業中，需通知所有後台人員與 NGO「今晚 22:00 後暫停任務媒合，等待統一指令」。
* **痛點 / 觸發點：** 緊急資訊若只靠 LINE 群組或 Email，無法確保所有人都看到；平台內公告可確保觸達率，但需夠快夠簡單，避免緊急時刻還要走複雜流程。

---

## IDEAL Case

1. 發佈者點「發佈公告」，選對象（前台 / 後台）、嚴重度，輸入標題與內容。
2. 點「預覽」看到公告在目標頁面的實際顯示效果。
3. 確認後點「發佈」立即生效：前台置頂橫幅出現 / 後台所有人員看到公告提示。
4. 情況解除後下架公告（或到期自動下架），橫幅消失。
5. **結果：** 從決定發佈到所有相關人員看到，整個流程在 2 分鐘內完成。

---

## User Story

* As a **Super Admin / Government**，I want **在前台發佈置頂緊急公告**，so that **所有進入平台的民眾第一眼就能看到重要警示**。
* As a **Super Admin / Team Admin**，I want **對後台工作人員與 NGO 發佈協調公告**，so that **確保所有人收到統一指令而不需依賴外部通訊工具**。
* As a **發佈者**，I want **發佈前預覽顯示效果**，so that **確認排版與內容正確後再正式推送，避免緊急時刻出現文字錯誤**。

---

## 功能需求

### F1. 公告資料模型（CAP 子集）

```yaml
Announcement:
  id, channel: frontstage | backstage      # 前台 / 後台
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

### F2. 嚴重程度分級與視覺

| severity | 前台視覺 | 行為 |
|---|---|---|
| **Extreme 極端** | 紅底、可全螢幕攔截 modal | 進站強制顯示，需手動關閉 |
| **Severe 嚴重** | 橙底置頂橫幅 | 置頂、可收合 |
| **Moderate 中等** | 黃底橫幅 | 置頂、可關閉 |
| **Minor 輕微 / 一般協調** | 藍 / 灰資訊條 | 低調呈現 |

* severity 與 [[06-map-decision-support]] Hazard Zone 的 `low/medium/high/critical` 用語對齊或可互轉，避免一個平台兩套嚴重度語彙。

### F3. 排程與自動到期

* **排程發佈**：可設 `effective_at` 預定上架（如「22:00 起暫停媒合」提前排定）。
* **自動到期**：到 `expires_at` 自動下架，避免忘了下架造成資訊污染（前台警報預設 24h，與 Hazard Zone 一致）。
* 保留「立即發佈」快速路徑（緊急不必排程）。
* **狀態機**（借 CAP msgType）：

```
draft → scheduled → active → expired
active → cancelled(提前撤銷)
active → updated(發更新版取代前一則，舊版標 superseded)
```

### F4. 分眾投放與發佈權限

| 維度 | 規格 |
|---|---|
| 管道 | 前台橫幅 / 後台公告 |
| 地理 | 借 CAP `area`，可只投放特定行政區（結合 [[06-map-decision-support]]） |
| 對象 | 後台協調公告可指定 RBAC / Team（對齊 [[04-rbac]]） |
| 語言 | 至少中英；多語 v2 擴充（見開放問題） |
| **發佈權限** | 前台對外警報限 **Super Admin（+Government）**；後台協調公告可下放 **Team Admin 對自家 Team** 發（對齊 [[04-rbac]] 權限表） |

### F5. 後台公告已讀回執（Acknowledge）

* 後台協調公告可勾「需確認」；發佈者看得到「已確認 X / 未確認 Y」，可催未確認者。
* 前台民眾警報量大，**不需**回執。

### F6. 多則並存與版位

* 排序：severity → effective 時間。
* 前台置頂**最多同時顯示 1–2 則**（最高 severity 優先），其餘收進「更多警報」，避免橫幅把首頁推太下面。

### F7. 發佈前預覽

* 公告發佈前可分別預覽前台與後台的實際顯示效果，確認後再正式發佈。

### F8. 異常場景

| 編號 | 場景 | 處理 |
|------|------|----------|
| **AN1** | 颱風過了但忘了下架 | 自動到期（F3）即解決；無 expires 者後台顯示「已逾預期時長」提醒。 |
| **AN2** | 同時多則高嚴重度公告 | 依 F6 版位上限，最高 severity 優先，其餘收合。 |
| **AN3** | 排程公告在生效前情況已變 | scheduled 狀態可編輯 / 取消，不需等到生效。 |
| **AN4** | 公告內容需更正 | 發 `updated` 版取代前一則（舊版 superseded），而非刪除重發，保留稽核鏈。 |
| **AN5** | 後台關鍵指令無人確認 | require_ack + 已讀比例 + 催確認（F5）。 |
| **AN6** | Team Admin 越權發前台對外警報 | ⛔ 前台警報限 Super Admin（+Government）；前後端雙重驗證（對齊 [[04-rbac]]）。 |

---

## 驗收標準

- [ ] 前台公告發佈後，所有造訪前台的使用者在頁面頂部可見置頂橫幅。
- [ ] 後台公告發佈後，所有已登入後台的人員在下次開啟頁面或重新整理時看到公告提示。
- [ ] 預覽功能可分別預覽前台與後台的實際顯示效果。
- [ ] 公告可隨時下架，下架後 1 分鐘內前後台均不再顯示。
- [ ] 公告編輯、發佈、下架操作均記錄在 Audit Log。
- [ ] 發佈權限對齊 [[04-rbac]]：前台限 Super Admin / Government、後台可含 Team Admin（自家）；越權前台警報被前後端阻擋。
- [ ] 公告可設 severity，前台依嚴重程度呈現不同視覺分級。
- [ ] 公告可排程發佈並在 expires 自動下架，逾期不再顯示。
- [ ] 後台「需確認」公告可顯示已確認 / 未確認比例。
- [ ] 多則前台公告並存時依 severity 排序，置頂版位有上限（1–2 則）。
- [ ] 公告更正以 updated 版取代並保留稽核鏈，而非刪除重發。

---

## 開放問題

> 資料模型、嚴重度視覺、排程到期、分眾、回執、版位、發佈權限均已定調寫入規格；以下為仍待決者。

- [ ] **多語支援時程**：中英以外的多語是否納入 v1，還是 v2 擴充？
- [ ] **後台公告與站內通知整合**：後台公告發佈是否同時生成 [[02-user-profile]] 站內通知？需與該 feature 的「通知範圍擴充」一併決定。
- [ ] **前台 Extreme 攔截 modal 的頻率控制**：同一使用者重複進站是否每次都攔截，還是當日確認過即不再強制？

---

## 相關 Feature

* [[04-rbac]] — 公告發佈與分眾的權限邊界（前台 vs 後台發佈者範圍）
* [[02-user-profile]] — 後台成員接收公告通知（後台公告發佈即生成站內通知，待對齊）
* [[06-map-decision-support]] — 公告地理範圍與 Hazard Zone 嚴重度對齊
* [[08-ticket-management]] — 公告關聯 Disaster Activation 事件
