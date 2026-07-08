# 研究 — 任務優先級/SLA、志工媒合與 USAR 欄位精簡

> **目的**：08 v2.0 在災害欄位群組、直立救援三層觸發、Building Anchor 群組化上已非常完整。本研究專門回應其**開放問題**並補三個 v2.0 較弱的面向：
> 1. **任務優先級與 SLA / 升級（escalation）**——v2.0 有「立刻救援」最高優先，但中間層級與逾時升級沒談。
> 2. **志工媒合（matching）模型**——v2.0 只統計「缺口比例」，沒談怎麼把人配到任務。
> 3. **USAR 直立救援 15 欄位是否過多**（v2.0 自己提的開放問題）——拆「必填核心 vs 可選」。
> 並回填 20m 半徑、立刻救援 vs 直立救援組合、跨建築錨點等開放問題。
> **日期**：2026-06-10
> **關聯**：[[../prd]]（08-ticket-management）、[[../../06-map-decision-support/prd]]、[[../../05-member-management/prd]]、`research/competitive/patterns/vertical-rescue-usar.md`
> **狀態**：研究參考，供決策用（回填至 08 開放問題）

---

## 1. 優先級與 SLA / 升級（補 v2.0 只有「立刻救援」單一極值）

v2.0 的優先級只有「一般」與「立刻救援（最高）」兩端。成熟事件/工單系統（PagerDuty、ServiceNow、ICS 事件指揮、Crisis Cleanup 的 work order）都有**多級優先 + 時效（SLA）+ 逾時升級**：

| 概念 | 業界作法 | 🟡 對 Wanguard 建議 |
|---|---|---|
| **優先級分級** | P1–P4 / Critical-High-Medium-Low | 建議 4 級：`life_threatening`（含立刻救援）/ `urgent` / `normal` / `low`；生命危急＝最高 |
| **SLA 時效** | 各級設目標回應/完成時間 | 各級設「目標承接時間」，如生命危急 < 30 分無人承接即升級警示 |
| **逾時升級（escalation）** | 逾時自動通知更高層 / 擴大派發 | 生命危急逾時未承接 → 通知 Government / Super Admin、擴大到鄰區 Team |
| **三角分級（triage）** | START/SALT 檢傷分類 | 醫療相關 Ticket 可借檢傷概念標記傷勢嚴重度（已有 medical 欄位群） |

> 🟡 **建議**：把優先級從二元擴成 4 級 + 各級 SLA，並對「生命危急逾時未承接」做升級警示——這比單一「立刻救援」更能反映災場真實調度。「立刻救援」維持為 Admin 手動的最高覆寫（沿用 F8）。

---

## 2. 志工媒合模型（補 v2.0 只有缺口統計）

v2.0 F5.2 統計「真實人數 / 需求量」缺口，但沒回答「**怎麼把對的志工配到對的任務**」。Crisis Cleanup、ArcGIS Workforce、災防志工平台的常見模型：

| 模型 | 說明 | 取捨 |
|---|---|---|
| **A. 自我承接（self-claim / 搶單）** | 志工從清單/地圖自選任務承接 | 簡單、去中心；但易扎堆熱區、冷區沒人 |
| **B. 指派制（dispatch）** | 後台/Team Admin 指派任務給特定志工 | 可控；但後台負擔重 |
| **C. 技能/地理媒合** | 依技能標籤 + 距離 + 可用時段推薦 | 最佳配對；需志工檔案資料 |

> v2.0 的「任務配對提醒（有志工承接 → 通知發起者）」暗示是 **模型 A（自我承接）**。🟡 **建議**：v1 以 A 為主（搭配 Zone 指派把任務先框給 Team），補兩個防扎堆機制：
> - **缺口導向排序**：任務清單預設依「缺口大 + 優先級高 + 距離近」排序，引導志工去冷區。
> - **承接上限 / 重複承接防呆**：同一志工同時段承接數上限；已滿額任務標「已足」。
> - 模型 C（技能媒合）需志工技能檔案，列 v2。
>
> 🟡 **待確認**：志工是「前台一般使用者」還是需登錄的 Team Member？這牽涉 [[../../05-member-management/prd]] 的身份模型——「承接任務」的人到底是誰、要不要先入 Team，需釐清（列開放問題）。

---

## 3. USAR 直立救援欄位精簡（回應 v2.0「15 欄是否太多」）

v2.0 vertical_rescue 群組有 ~15 欄。現場（尤其初報）一次填 15 欄不現實。INSARAG / USAR 實務是**分階段蒐集**：初期快評（worksite triage）只要關鍵幾項，細節隨救援展開補。

> 🟡 **建議：拆「必填核心」與「可選/後補」兩層**：
>
> **必填核心（初報即要，≤5 欄）**
> - `floor_level`（樓層）
> - `victims_known_count`（已知受困人數）
> - `structure_stability`（結構穩定度：穩定/部分受損/瀕危）
> - `entry_point`（可進入點）
> - `hazmat_status`（是否有危害物質，是/否/未知）
>
> **可選 / 救援展開後補**
> - `victims_confirmed_alive`、`victims_by_floor`、`communication_status`、`estimated_trapped_hours`、`required_equipment`、`usar_level`、`estimated_operation_hours`、`requires_field_commander`、`collapse_level`
>
> 這樣初報快、不漏關鍵；細節欄位在 Building Anchor 抽屜由現場指揮逐步補齊。對齊 [[06-map-decision-support]] 的漸進式資訊蒐集精神。

---

## 4. 回應 08 其他開放問題

- **20 公尺群組半徑** → v2.0 已建議「可調參數，預設 20m」。🟡 **支持**，補充：大型廠房/連棟可由 Auditor 在確認群組時手動調整候選半徑（如 20/50/100m 切換）。
- **跨建築錨點（連體大樓/棟群）** → v2.0 建議 v1 不開放。🟡 **支持否**，但建議保留「Anchor 之間可標關聯（同社區）」的輕量連結供 v2。
- **子 Ticket 各自被不同 Team 認領** → v2.0 建議否（整 Anchor 同一 Team）。🟡 **支持**，理由：直立救援需單一指揮，分屬不同 Team 會指揮混亂。
- **立刻救援 + 直立救援同時** → v2.0 問 UI 怎麼呈現。🟡 **建議**：兩者正交、各一枚徽章（🔴 立刻救援 + 🏢⚠️ 直立救援），不合併成新狀態，避免語義爆炸。
- **化學/核災/人為事故災害類型** → 🟡 建議：化學/核災可暫由 `radiation` + `hazmat` 欄位群覆蓋；「人為事故」併入 `other`，待真實案例再獨立。
- **Super Admin 自訂欄位群（schema builder）** → v2.0 建議否。🟡 **支持否**（災時不該讓人臨時改 schema，風險高）；改以「預定義 + 開放問題回報」迭代。

---

## 5. 待決問題（回填至 08 開放問題）

- [ ] 優先級是否從二元擴為 4 級 + 各級 SLA + 生命危急逾時升級警示？
- [ ] 志工媒合 v1 採自我承接 + 缺口導向排序 + 承接上限防扎堆？技能媒合列 v2？
- [ ] 「承接任務的志工」身份模型（前台一般使用者 vs 需入 Team）需與 05 對齊？
- [ ] USAR 欄位拆「必填核心 ≤5 + 可選後補」分階段蒐集？
- [ ] 群組半徑可由 Auditor 在確認時切換（20/50/100m）？
- [ ] 立刻救援 + 直立救援以兩枚並存徽章呈現（不合併新狀態）？

---

## 6. 參考來源

- PagerDuty — Incident priority & escalation policies：https://support.pagerduty.com/
- ServiceNow — Priority = Impact × Urgency、SLA/OLA
- ICS（Incident Command System）/ FEMA — 資源派遣與優先排序
- INSARAG Guidelines — USAR worksite triage & ASR（Assessment）分階段蒐集：https://www.insarag.org/
- START / SALT triage — 大量傷患檢傷分類
- Crisis Cleanup — work order claim / 志工承接模型（見 `research/competitive/competitor-details/crisis-cleanup.md`）
- ArcGIS Workforce — dispatch/assignment 模型（見 `research/competitive/competitor-details/arcgis-workforce.md`）
- 與本 repo 既有：`research/competitive/patterns/vertical-rescue-usar.md`、[[../../05-member-management/prd]]、[[../../06-map-decision-support/prd]]
