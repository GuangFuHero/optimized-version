# 研究 — 緊急警報與公告模式（Emergency Alert / CAP）

> **目的**：09-emergency-announcement 是「前台置頂公告 + 後台協調公告 + 發佈前預覽」，由 Super Admin 操作。v1.0 把「能發、能預覽、能下架」講了，但缺成熟警報系統都有的結構：
> 1. 警報有沒有**嚴重程度 / 類型**分級？視覺呈現要不要隨之分級？
> 2. 公告能不能**排程**（預定時間發）與**自動到期**（颱風過了自動下架）？
> 3. 能不能**分眾投放**（只給特定行政區 / 特定 Team / 特定 RBAC）？
> 4. 後台協調公告要不要**已讀回執 / 確認（acknowledge）**，確保關鍵指令真的有人看到？
> 5. 多則公告同時存在的優先序與版位？
> 6. 與國家級警報（CAP / NCDR / 細胞廣播）的關係與用語對齊。
> **日期**：2026-06-10
> **關聯**：[[../prd]]（09-emergency-announcement）、[[../../02-user-profile/prd]]、[[../../06-map-decision-support/prd]]、[[../../08-ticket-management/prd]]、[[../../04-rbac/prd]]
> **狀態**：研究參考，供決策用（PRD 內以「🟡 建議」回填）

---

## 1. 問題拆解

公告系統表面是「打字 → 置頂」，但在**災害應變**情境下，它其實是一個**警報分發系統**。國際上這類系統有成熟標準 —— **CAP（Common Alerting Protocol，OASIS 標準）**，被美國 IPAWS、Google Public Alerts、台灣 NCDR / 災防告警細胞廣播（PWS/CBS）廣泛採用。借用 CAP 的欄位結構，可以讓 09 從「一段文字」升級成「結構化、可分級、可分眾、可機讀」的警報。

---

## 2. CAP 的核心欄位（可直接借用為公告 schema）

CAP 每則警報（alert/info）的關鍵欄位：

| CAP 欄位 | 含義 | 對 09 的對應 / 🟡 建議 |
|---|---|---|
| **category** | 災害類別（Geo/Met/Safety/Health/Fire/Security…） | 對應 [[08-ticket-management]] 的災害類型，可重用 |
| **event** | 事件名稱 | 公告標題 / 關聯的 Disaster Activation |
| **urgency** | Immediate / Expected / Future / Past | 控制是否需立即彈出 |
| **severity** | **Extreme / Severe / Moderate / Minor** | **公告嚴重程度 → 決定視覺分級**（見 §3） |
| **certainty** | Observed / Likely / Possible / Unlikely | 可選，標示資訊可信度 |
| **effective / onset / expires** | 生效 / 起始 / **失效時間** | **排程發佈 + 自動到期**（見 §4） |
| **area** | 影響地理範圍（polygon/geocode） | **分眾投放：行政區 / 地圖範圍**（見 §5） |
| **instruction** | 應採取的行動 | 公告內文的「該怎麼做」 |
| **headline / description** | 標題 / 描述 | 公告標題與內文 |

> 🟡 **建議**：09 的公告資料模型直接對齊 CAP 子集，至少納入 `severity`、`effective/expires`、`area`、`audience`，未來若要與 NCDR / 政府警報互通也省事。

---

## 3. 嚴重程度分級與視覺（🟡 建議）

09 v1.0 的橫幅是單一樣式。成熟警報 UI（Google Public Alerts、各國 EAS、政府 App）都依 severity 分色分級：

| severity | 視覺 | 行為 |
|---|---|---|
| **Extreme（極端）** | 紅底、可全螢幕攔截式 modal | 進站強制顯示，需手動關閉 |
| **Severe（嚴重）** | 橙底置頂橫幅 | 置頂、可收合 |
| **Moderate（中等）** | 黃底橫幅 | 置頂、可關閉 |
| **Minor（輕微）/ 一般協調** | 藍/灰資訊條 | 低調呈現 |

> 對應 [[06-map-decision-support]] 的 Hazard Zone 已有 `low/medium/high/critical` 分級——**建議公告 severity 與 Hazard Zone 分級用語對齊或可互轉**，避免同一平台兩套嚴重度語彙。

---

## 4. 排程與自動到期（🟡 建議）

v1.0 只有「立即發佈 / 手動下架」。災害公告極需：

* **排程發佈**：預定 `effective` 時間自動上架（如「22:00 起暫停媒合」可提前設定）。
* **自動到期**：到 `expires` 自動下架（颱風警報過期自動消失，避免忘了下架造成資訊污染）。
* **狀態機（借 CAP msgType）**：

```
draft → scheduled → active → expired
active → cancelled(提前撤銷)            # CAP: Cancel
active → updated(發更新版，取代前一則)   # CAP: Update，舊版標 superseded
```

> 🟡 **建議**：保留「立即發佈」的快速路徑（緊急時不必設排程），但同時提供 `expires` 預設值（如前台警報預設 24h，與 Hazard Zone 一致）。

---

## 5. 分眾投放（Targeting，🟡 建議）

v1.0 只分「前台 / 後台」兩個對象。實務常需更細：

| 維度 | 範例 | 🟡 建議 |
|---|---|---|
| **管道** | 前台橫幅 / 後台公告 | 沿用 v1.0 |
| **地理** | 只給花蓮縣民眾 | 借 CAP `area`，可結合 [[06-map-decision-support]] 行政區 |
| **RBAC / Team** | 只給 NGO、或只給某 Team | 後台協調公告可指定收件對象（對齊 [[04-rbac]]） |
| **語言** | 中 / 英 / 原民語 / 越南語等 | 🟡 待確認：災害資訊多語是否納入？建議至少中英，v2 擴充 |

---

## 6. 後台公告的已讀回執 / 確認（Acknowledge，🟡 建議）

關鍵協調指令（「22:00 後暫停媒合」）若沒人讀就失效。成熟事件指揮系統（如 Everbridge、PagerDuty、政府應變平台）對重要通告支援 **acknowledge（需點「我已知悉」）** 並回報「已讀 X / 未讀 Y」。

> 🟡 **建議**：後台協調公告可選「需確認」旗標；發佈者看得到已讀/已確認比例，未確認者可再催。一般前台民眾警報**不需**回執（量太大）。

---

## 7. 多則公告並存與版位（🟡 建議）

颱風 + 地震同時，前台可能有多則。需定義：

* **排序**：依 severity → effective 時間。
* **版位上限**：前台置頂建議**最多同時顯示 1–2 則**（最高 severity 優先），其餘收進「更多警報」。
* 避免橫幅把整個首頁推到下面（accessibility / 可用性）。

---

## 8. 與通知中心、Audit 的關係

* 後台公告發佈 → 應同時觸發 [[02-user-profile]] 站內通知（v1.0 §相關 Feature 已連結，建議明確「發佈即生成通知」）。
* 09 v1.0 已要求「編輯/發佈/下架記入 Audit Log」——保留，並建議記錄 severity、對象、排程、到期、撤銷/更新等完整生命週期。

---

## 9. 待決問題（供 PRD 回填）

- [ ] 公告資料模型是否對齊 CAP 子集（severity / effective / expires / area / audience）？
- [ ] severity 分四級且視覺分級？與 Hazard Zone 分級用語對齊？
- [ ] 是否支援排程發佈與自動到期？前台警報預設 24h 到期？
- [ ] 是否支援分眾投放（地理 / RBAC / Team / 語言）？多語是否納入 v1？
- [ ] 後台協調公告是否支援「需確認」回執與已讀比例？
- [ ] 多則公告並存的排序與前台版位上限（1–2 則）？
- [ ] 發佈者是否僅限 Super Admin？（v1.0 限 Super Admin，但 [[04-rbac]] 權限表把「編輯前台/後台公告」也給了 Government / Team Admin —— 需釐清，見 PRD 質疑）

---

## 10. 參考來源

- OASIS — Common Alerting Protocol (CAP) v1.2 標準：https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.html
- FEMA IPAWS — Integrated Public Alert & Warning System：https://www.fema.gov/emergency-managers/practitioners/integrated-public-alert-warning-system
- Google Public Alerts（CAP 為基礎的警報呈現）：https://developers.google.com/public-alerts
- 台灣 NCDR 災害示警公開資料平台（CAP 格式）：https://alerts.ncdr.nat.gov.tw/
- 台灣 災防告警細胞廣播訊息（PWS / Cell Broadcast）
- Everbridge / PagerDuty — mass notification & acknowledgement 實務
- 與本 repo 既有：[[../../06-map-decision-support/prd]]（Hazard Zone 分級）、[[../../08-ticket-management/prd]]（災害類型）
