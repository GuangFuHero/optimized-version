# 研究 — 地圖效能、標點聚合、離線與繪製幾何模式

> **目的**：06 v2.0 的繪圖工具、Zone 模型、狀態機、衝突規則已很完整。本研究專門回應其**開放問題**並補三個技術主題：
> 1. 標點聚合（clustering）與大量 marker 的效能（v2.0 驗收要求「≤500 markers 60fps」，但災時可能上萬筆）。
> 2. 繪製幾何的精度與正確性（多邊形自相交、跨日界線、面積/範圍內物件 hit-test 的演算法）。
> 3. 離線 / 弱網（災區網路常斷）的底圖與資料策略。
> 4. 回應開放問題：行政區 SHP 匯入、Buffer 工具、Hazard 24h 自動失效、Zone 編輯後 Ticket 重算、子區。
> **日期**：2026-06-10
> **關聯**：[`feature.md`](../feature.md)（06-map-decision-support）、`RS-FEAT-001`、`Task Management`
> **狀態**：研究參考，供決策用（回填至 06 開放問題）

---

## 1. 標點聚合與效能（補 v2.0 ≤500 markers 的天花板）

v2.0 驗收訂「≤500 markers 60fps」。但花蓮 7.0 地震級事件，單一行政區 Ticket 可能上千、加上資源站與電線桿點集（CSV）可達數萬。**單純逐一畫 DOM marker 會卡死**。業界解法：

| 技術 | 說明 | 代表庫 |
|---|---|---|
| **Marker clustering** | 鄰近點聚成一個帶數字的群，縮放才展開 | Leaflet.markercluster、Mapbox/MapLibre cluster、Supercluster |
| **WebGL 渲染** | 用 GPU 畫點，數十萬點仍流暢 | deck.gl、Mapbox GL、MapLibre GL |
| **Viewport-only 載入** | 只載入目前視窗範圍 + 縮放層級的資料（後端 bbox 查詢 / 向量磚 vector tiles） | Tippecanoe + vector tiles |
| **資料抽稀（simplify）** | 低縮放時降採樣 / 簡化多邊形 | Douglas–Peucker |

> 🟡 **建議**：
> - 電線桿 CSV（靜態大點集）→ 預先切 **vector tiles**，WebGL 渲染。
> - Ticket / 資源站 markers → **clustering**（與 08 的 Building Anchor 群組化是不同層次：Anchor 是語意群組、cluster 是視覺群組，兩者可疊加）。
> - 後端支援 **bbox + zoom 查詢**，只回視窗內資料。
> - 把 v2.0 驗收的「≤500 markers」改寫為「**採聚合/WebGL 後，數千～上萬點仍維持平移縮放流暢**」，更貼近災時實況。

---

## 2. 繪製幾何的正確性（v2.0 狀態機沒談的邊界）

| 問題 | 業界處理 | 🟡 建議 |
|---|---|---|
| **多邊形自相交（self-intersecting）** | 偵測並阻止 / 自動修正 | 繪製時即時偵測，提示「邊界交叉，請調整」 |
| **範圍內物件 hit-test** | point-in-polygon（射線法）、圓用距離 | 用成熟庫（Turf.js `booleanPointInPolygon` / `pointsWithinPolygon`）；大量點先做 bbox 預篩再精算 |
| **即時計數效能（v2.0 要求 <100ms）** | 空間索引（R-tree / spatial index） | 前端用 rbush 之類空間索引，避免每次全量掃描 |
| **座標系一致** | 統一 WGS84（EPSG:4326） | 與電線桿 CSV、SHP 匯入皆轉同一座標系 |
| **頂點上限（v2.0 多邊形 100 點）** | 合理 | 保留，但手繪需做簡化避免產生上千頂點 |

---

## 3. 離線 / 弱網策略（災區網路常斷——v2.0 完全沒提）

這是 06 最大的隱性缺口。災區基地台可能損毀，後台人員若在現場附近作業會遇弱網。

| 層次 | 業界作法 | 🟡 建議 |
|---|---|---|
| **底圖離線** | 預先快取 map tiles（MBTiles / PMTiles），Service Worker 快取 | 對重點災區預載底圖磚 |
| **資料離線讀** | 本地快取最近資料，離線唯讀 | 至少讓「已載入的 Zone / Ticket / 資源站」離線可看 |
| **離線編輯 + 同步** | 樂觀寫入本地佇列，連線恢復後同步（衝突解決） | 🟡 進階，v2 再做；v1 先確保「離線可讀 + 連線後重試送出」 |
| **降級提示** | 明確顯示「離線模式 / 資料截至 HH:MM」 | 必要，避免誤判即時性 |

> 與 `RS-FEAT-001` 的「離線匯出 + 時間戳」呼應——兩者都在解同一個「現場無網」痛點，建議一致設計。

---

## 4. 回應 06 既有開放問題

- **行政區 SHP 匯入**（v2.0 建議 v2 再做）→ 🟡 **支持 v2**。補充：台灣行政區界圖資（國土測繪中心 / 政府開放資料）可轉 GeoJSON 預載，讓劃區能「吸附」到行政區界，減少手繪誤差。
- **沿線 Buffer 工具**（如河川/道路兩側 N 公尺）→ 🟡 用 Turf.js `buffer` 可低成本實作，但 v1 非必要，列 v2。
- **Hazard 24h 自動失效**（開放問題質疑是否合理）→ 🟡 **建議：預設 24h 但允許建立者自訂 effective_until，且到期前提醒延長**（避免危險區默默消失害到人）。與 `EA-FEAT-001` 公告自動到期同一設計語彙。
- **跨 Team 協作 Zone（一 Zone 多 Team）**→ v2.0 建議否；🟡 **支持否**（責任不清）。
- **Zone 編輯後 Ticket 重算**（移動邊界後原範圍 Ticket 去留）→ v2.0 建議保留+提示；🟡 **支持**，並建議：移出範圍的 Ticket 維持原 assigned_team 但標「已不在 Zone 內」，由 Government 決定是否解除。
- **Team Admin 自家責任區內畫子區**→ v2.0 建議 v2；🟡 **支持 v2**。
- **Zone 命名規範**→ 🟡 建議：自由命名但提供「行政區 + 流水號」預設樣板（如「花蓮市 #1」），降低命名混亂。

---

## 5. 待決問題（回填至 06 開放問題）

- [ ] 是否將驗收的「≤500 markers」升級為「聚合/WebGL 後數千～上萬點流暢」？電線桿用 vector tiles？
- [ ] Ticket/資源站採 marker clustering（與 Building Anchor 語意群組並存）？
- [ ] hit-test 與即時計數是否用 Turf.js + 空間索引（rbush）確保 <100ms？
- [ ] 繪製是否即時偵測多邊形自相交？
- [ ] 離線策略：v1 至少「離線可讀 + 降級提示 + 連線後重試」？底圖預載重點災區？
- [ ] Hazard Zone 到期改為「預設 24h + 可自訂 + 到期前提醒延長」？

---

## 6. 參考來源

- Leaflet.markercluster：https://github.com/Leaflet/Leaflet.markercluster
- Mapbox / MapLibre GL — clustering & vector tiles：https://docs.mapbox.com/
- deck.gl — 大規模 WebGL 地理視覺化：https://deck.gl/
- Turf.js — 幾何運算（point-in-polygon、buffer、area）：https://turfjs.org/
- Supercluster / rbush — 聚合與空間索引：https://github.com/mapbox/supercluster
- PMTiles / MBTiles — 離線/單檔向量磚：https://protomaps.com/
- 台灣國土測繪中心 / 政府資料開放平台 — 行政區界圖資
- 與本 repo 既有：`RS-FEAT-001`（離線匯出）、`Task Management`（Building Anchor 群組化）
