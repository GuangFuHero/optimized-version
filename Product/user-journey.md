# 使用者旅程與操作流程 User Journey & Flows

本文件定義了 **島嶼守望 Wanguard** 管理後台的操作旅程與交互流程。透過角色分流，不同的權限群體將進入專屬的工作台介面。

**v2.0 更新（2026-05-28）**：加入 Team Admin / Team Member 兩個新角色路徑；加入災害類型 onboarding、地圖繪製模式、Ticket 群組化與直立救援啟動流程。

---

## 後台角色操作旅程 Mermaid 流程圖

系統支援以互動式圖表展示後台人員從登入、角色分流、全局命令、工作台切換至詳細抽屜控制的操作路徑。

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#fdf3e9', 'primaryTextColor': '#0f172a', 'primaryBorderColor': '#e3791e', 'lineColor': '#2592b9', 'secondaryColor': '#ffffff', 'tertiaryColor': '#eef7fb', 'background': '#ffffff', 'mainBkg': '#ffffff', 'nodeBorder': '#94a3b8', 'clusterBkg': '#f6faff', 'titleColor': '#111111', 'edgeLabelBackground': '#ffffff', 'fontFamily': 'ui-sans-serif'}}}%%
flowchart TD
  LOGIN(["🔐 登入"]) --> RBAC{"角色分流"}
  RBAC -->|"Super Admin"| V_SA["全局總覽<br/>預設顯示全地圖+Team管理入口"]
  RBAC -->|"Government"| V_GOV["區塊規劃視圖<br/>預設進入Draw Zone模式"]
  RBAC -->|"Team Admin"| V_TA["團隊責任區<br/>預設我的團隊+自家Zone"]
  RBAC -->|"Team Member"| V_TM["指派區域任務<br/>預設filter己指派範圍"]
  RBAC -->|"Data Auditor"| V_DA["待審佇列<br/>預設AI重複+群組建議"]

  V_SA --> M1
  V_GOV --> M1
  V_TA --> M1
  V_TM --> M1
  V_DA --> M1

  subgraph M1["M1｜全局命令列"]
    direction LR
    ANN["⚠️ 緊急公告橫幅<br/>僅災情啟動時展開"]
    BELL["🔔 通知中心<br/>收摺成badge數字"]
    SRCH["🔍 快速搜尋<br/>任務/站點/地址"]
  end

  M1 --> M2

  subgraph M2["M2｜主工作台"]
    direction LR
    MAP["🗺️ 地圖視圖<br/>預設視圖"] -->|"切換"| GRID["📊 表格+BI視圖<br/>filter / export"]
    GRID -->|"切換"| MAP
  end

  MAP -->|"點擊任務標點"| M3
  MAP -->|"點擊資源站標點"| M4
  MAP -->|"Gov: 拉框選取"| M5

  subgraph M3["M3｜任務抽屜"]
    direction TB
    T1["① 狀態摘要卡<br/>僅顯示狀態+地點"] -->|"展開"| T2["② 詳情/後勤/AI分析<br/>三個Tab"]
    T2 -->|"確認後才出現"| T3["③ 操作區<br/>Edit / Status / Delete<br/>依角色顯示"]
  end

  subgraph M4["M4｜資源站抽屜"]
    direction TB
    S1["① 站點摘要<br/>狀態+容量"] -->|"展開"| S2["② 歷史紀錄<br/>修改建議"]
    S2 -->|"確認後才出現"| S3["③ 操作區<br/>Admin/Auditor限定"]
  end

  subgraph M5["M5｜區塊指派 Gov only"]
    direction LR
    Z1["拉框劃定區塊"] --> Z2["選擇指派NGO"] --> Z3["確認送出"]
  end

  subgraph M6["M6｜AI重複審核"]
    direction LR
    AI1["待審佇列<br/>數量badge"] --> AI2["並排比對卡<br/>差異欄位高亮"] --> AI3["合併/保留兩者/刪除"]
  end

  subgraph M7["M7｜Team與成員管理"]
    direction LR
    U1["Team列表+成員清單<br/>RBAC tag filter"] --> U2["申請審核佇列"] --> U3["核准/附理由拒絕/QR邀請"]
    U2 --> U4["Team CRUD（Super Admin）"]
    U3 --> U5["Team Admin邀請自家成員"]
  end

  subgraph M8["M8｜浮動統計列"]
    direction LR
    B1["📋 任務總量"]
    B2["🧑‍🤝‍🧑 志工缺口<br/>紅色警示"]
    B3["🏠 活躍站點"]
  end

  V_DA --> M6
  V_SA --> M7
  V_TA --> M7
  GRID --> M8
  M3 -.->|"AI標記觸發"| M6

  MAP -->|"建築錨點點擊"| M9
  V_SA --> M10
  V_GOV --> M10

  subgraph M9["M9｜建築錨點抽屜"]
    direction TB
    BA1["🏢 建築摘要<br/>地址 + 樓層樹"] -->|"展開"| BA2["各樓層Ticket列表<br/>狀態+ID+受困數"]
    BA2 -->|"條件達成"| BA3["⚠️ 啟動直立救援按鈕<br/>Admin/Auditor/TeamAdmin"]
    BA3 -->|"啟動後"| BA4["所有同錨點Ticket<br/>標待補齊"]
  end

  subgraph M10["M10｜災害事件控制"]
    direction TB
    D1["啟動災害事件<br/>選類型+行政區"] --> D2["Disaster Activation建立"]
    D2 --> D3["新Ticket套用欄位群"]
    D3 -.->|"複合災害"| D4["+ 增加災害類型<br/>聯集欄位"]
  end

  subgraph M11["M11｜AI群組建議佇列"]
    direction LR
    G1["20m+同地址候選"] --> G2["並排對比樓層"] --> G3["建立群組/拒絕/部分"]
    G3 --> G4["Building Anchor建立"]
  end

  V_DA --> M11
```

---

## 互動視圖說明

1. **角色專屬初始畫面**：
   * **Super Admin**：預設進入全局地圖，含 Team 管理 / 災害事件控制 / Audit Log 跳轉面板。
   * **Government**：預設進入「劃區規劃（Draw Zone）」模式，可拉框 / 多邊形 / 圓 / 手繪 指派 Zone 給對應 Team。
   * **Team Admin**：預設進入「我的團隊」頁面（成員列表）+ 地圖只顯示自家被指派 Zone。
   * **Team Member**：地圖與表格預設只載入自家被指派的責任區任務。
   * **Data Auditor**：進入時預設開啟兩個佇列：AI 重複任務對比、AI 群組建議。
2. **工作台視圖切換 (M2)**：
   地圖模式與統計數據表格模式為一鍵無縫切換，共用篩選條件與定位參數。
3. **任務/資源站/建築錨點抽屜設計 (M3, M4, M9)**：
   點擊地圖物件由右側拉出抽屜，先精簡摘要，可展開詳細。
   * **M9 建築錨點**新增於 v2.0：點擊聚合的 🏢 圖示展開樓層樹，列出該建築所有 Ticket。
4. **災害事件控制 (M10)**：
   Super Admin / Government 可隨時啟動 / 切換災害類型，影響全平台新建 Ticket 的欄位群組。
5. **AI 群組建議 (M11)**：
   AI 偵測同建築不同樓層的 Ticket 群組，由 Auditor 確認後建立 Building Anchor。
6. **直立救援的三層觸發** （詳見 [[08-ticket-management]]）：
   * Layer 1 災害層：含直立救援的災害類型啟動時，表單顯示直立救援欄位群（預設摺疊）。
   * Layer 2 Ticket 層：填入樓層 ≠ 1F 或勾選需要直立救援時，自動轉為必填。
   * Layer 3 建築層：Building Anchor 啟動後，同建築所有 Ticket 自動必填繼承。

---

## v2.0 新增的關鍵流程

### Team Admin 邀請成員
```mermaid
flowchart LR
  A[Team Admin 進入我的團隊] --> B[+ 邀請成員] --> C[產生QR + 短連結] --> D[傳LINE群] --> E[成員掃碼+OTP] --> F[加入Team為Member]
```

### Government 劃區指派 + 自動連動 Team
```mermaid
flowchart LR
  A[Government 拉框/多邊形] --> B[即時預覽 N個任務] --> C[選Team + 命名 Zone] --> D[二次確認] --> E[5秒Undo Toast] --> F[Team Admin 收通知]
```

### Ticket 群組化 + 直立救援啟動
```mermaid
flowchart LR
  A[3筆Ticket同地址不同樓層] --> B[AI 進入群組建議佇列] --> C[Auditor 確認建立群組] --> D[Building Anchor建立 + 地圖合併標點] --> E[某Ticket勾選需直立救援] --> F[Anchor 啟動直立救援] --> G[同建築所有Ticket 標待補齊]
```
