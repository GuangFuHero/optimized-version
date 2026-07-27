# User Stories — 即時決策輔助與地圖繪製 (Map Decision Support & Drawing)

> **根基文件。** 定義「為誰、在什麼情境、想達成什麼價值」；同資料夾的 [`prd.md`](prd.md) 是對應的功能規格（如何實作）。
> 閱讀與設計順序：先讀本文件（問題空間），再讀 `prd.md`（解法空間），避免從功能反推需求。
>
> ⚠️ 本份 stories 係早期自 `prd.md` 反向提取，尚未經獨立的問題空間盤點（深度可對照 [05](../05-member-management/user-stories.md) / [08](../08-ticket-management/user-stories.md)）。作為根基使用前請先複核。

### 地圖繪製
* **As a** Government 成員，**I want** 在地圖上以多種繪圖工具劃定區域並指派給 Team，**so that** 能批次分配任務而不需逐一點選。
* **As a** Super Admin，**I want** 標註危險區域並讓系統自動連動範圍內 Ticket，**so that** 救援人員不會進入未知風險區。
* **As a** Team Admin，**I want** 看到自家被指派的所有 Zone 邊界，**so that** 能掌握責任範圍與資源分布。

### 即時決策
* **As a** 後台應變人員，**I want** 在地圖上用電線桿編號搜尋位置，**so that** 能快速定位山區無門牌地區的事故點。
* **As a** 後台應變人員，**I want** 在同一個地圖頁面看到所有決策相關圖層，**so that** 不需切換系統即可做決策。
* **As a** Government 成員，**I want** 即時預覽繪製範圍內物件數量，**so that** 避免不小心將過多任務丟給單一 Team。
