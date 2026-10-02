// stationData.jsx — mock data model for 資源站管理 (R1 station, R2 proposals, R4 version history)
(function () {

  // —— 營運狀態 (operational_status) ——
  // ⚠️ 二態為 2026-08-06 本地決策；RS-FEAT-001 feature.md 的 Target behavior
  //    仍寫 open/paused/closed/full 四態。差異以 PendingChip 於畫面標示。
  const STATUS = {
    open:   { label: "開設中", tone: "success", icon: "CircleCheck" },
    closed: { label: "已關閉", tone: "neutral", icon: "CircleOff" },
  };
  const STATUS_ORDER = ["open", "closed"];


  // ── 「資料待確認」註記（比照任務管理頁 TK_PENDING）───────────────────────
  const PENDING = {
    status2: {
      title: "營運狀態：等後端開欄位",
      note: "二態「開設中／已關閉」已定案（2026-08-06 決策，2026-09-01 再次確認）。缺的是後端：查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。stations 表沒有任何營運狀態欄位（只有 op_hour 開放時間），前端 StationFields 也沒有。另外 RS-FEAT-001 feature.md 的 Target behavior 仍寫 open/paused/closed/full 四態，Spec 尚未同步修改。",
    },
    parent: {
      title: "站點群：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。ERD 的 stations 表有 child_station_uuid（語意正確——註解明寫「this station is a child of the referenced station」，即指向父站——但命名相反，已請更名為 parent_station_uuid）；然而前端 GraphQL 的 StationFields 根本沒有暴露這個欄位，前端目前拿不到父子關係。level 欄位用途仍未回覆。正典 RS-FEAT-001 完全未提及站點群，且 Out of scope 明列排除 Zone drawing。見《資源站點-用語與回報決議-2026-08-21》。",
    },
    photos: {
      title: "站點照片：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。photos 表的 ref_type 仍只有 ticket / pole，站點無法掛照片；前端 contract 也只有 Ticket 有照片。2026-08-05 記錄「已請工程師修改」，至今兩份文件皆未反映。RS-FEAT-001 亦未提及站點照片。",
    },
    rbacAuditor: {
      title: "Data Auditor 權限與 Notion 不一致",
      note: "本頁讓 Data Auditor 可審核、合併、匯出（2026-08-07 Owner 決定）。Notion BE-RBAC-3 明寫 data_auditor『has zero write access to any endpoint — any non-GET request returns 403』，且 Verify / Reject resource spot 兩列皆為 ❌。此為刻意偏離，需與後端確認。",
    },
    importSpec: {
      title: "匯入欄位與驗證規則未定",
      note: "Notion 的權限矩陣有「Import CSV/Excel」這一列（super/ngo/gov ✅、auditor ❌），排期見「補齊功能 - resource station&ticket 資料匯入匯出」（2026-08-02~08-14），但該卡內容為空。CSV 欄位名稱、必填規則、重複判定標準都尚未有正典規格，目前為提案版本。「匯入後預設為關」則依 2026-08-06 決策。",
    },
    rbacTeam: {
      title: "指派團隊：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。stations 表沒有任何指派團隊的欄位，前端 StationFields 也沒有——站點無從指派給團隊，此處的 assignedTeam 純為前端示意。另 Notion BE-RBAC-3 的 team_role 只涵蓋團隊成員管理，對資源站點沒有任何權限定義；CLAUDE.md 記載管轄權以地理判定（work_zones + team_zone_assign, ADR-049），與此處的直接指派不同。",
    },
    phone: {
      title: "聯絡人與電話：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。stations 表沒有聯絡人與電話欄位，前端 StationFields 也沒有。此為本地決策新增（S-04 情境逼出、亦為法定通報欄位），規則是僅後台可見、公開 API 不得回傳——此揭露規則需後端一併實作，不能只靠前端不畫。RS-FEAT-001 未提及此欄位。",
    },
  };

  // —— 站點類型 (station_type) ——
  const TYPE = {
    shelter:  { label: "避難收容", icon: "Home",    tone: "secondary" },
    supply:   { label: "物資集散", icon: "Package", tone: "primary" },
    medical:  { label: "醫療站",   icon: "Cross",   tone: "danger" },
    water:    { label: "供水點",   icon: "Droplets", tone: "info" },
    charging: { label: "充電/通訊", icon: "BatteryCharging", tone: "warning" },
    other:    { label: "其他",     icon: "MapPin",  tone: "neutral" },
    // 站點群不是真的站點類型，是前端呈現層用的容器標記（2026-08-21 決議）。
    // 刻意不放進 TYPE_ORDER：類型篩選器不列它，篩特定類型時站點群會被篩掉，
    // 群內站點升為頂層並標「屬：○○」——此行為已於 2026-08-21 確認保留。
    group:    { label: "站點群",   icon: "Layers",  tone: "info" },
  };
  const TYPE_ORDER = ["shelter", "supply", "medical", "water", "charging", "other"];

  // —— 資料新鮮度門檻（分鐘）——
  // 站點的「久未更新」是資料新鮮度問題，不是危險程度，
  // 所以刻意不用 danger 色，最高只到 warning（amber）。
  // 任務單的紅色語意是「有人可能還被困著」，兩者不共用色階。
  const FRESHNESS = { staleMin: 24 * 60, expiredMin: 72 * 60 };

  // —— 可指派的 Team ——
  // ⚠️ 站點指派給 Team 沒有正典依據，見 PENDING.rbacTeam
  const TEAMS = ["壯闊台灣", "慈濟基金會", "鳳林救難協會", "花蓮縣消防局"];

  // —— 行政區 (admin_area) ——
  const AREAS = ["光復鄉", "鳳林鎮", "瑞穗鄉", "萬榮鄉", "花蓮市"];

  // supply level chips
  const LEVEL = { full: { label: "充足", tone: "success" }, low: { label: "偏低", tone: "warning" }, out: { label: "缺貨", tone: "danger" } };

  // —— 站點清單 (single source of truth, shared w/ 06 圖層) ——
  // [x%, y%] are stylised map coords; lat/lng shown as data.
  const STATIONS = [
    // ── 站點群（大場地；站點一律是點，不畫 Polygon。群內站點以 UI 依附呈現）──
    // 2026-08-21 決議：站點群為純容器，不帶物資盤點與營運狀態，但可被指派 Team。
    // ⚠️ 此結構為本地決策，RS-FEAT-001 未提及。見 PENDING.parent
    {
      id: "RS-0100",
      updatedMin: 35,
      assignedTeam: "壯闊台灣", name: "花蓮觀光糖廠", type: "group", area: "光復鄉",
      parentId: null, isParent: true,
      photos: ["sugar-1.jpg", "sugar-2.jpg", "sugar-3.jpg"],
      address: "花蓮縣光復鄉大進街 19 號", lat: 23.6722, lng: 121.4203, x: 47, y: 33,
      // 站點群為純容器：無營運狀態、無物資盤點（2026-08-21 決議）
      status: null, supplies: [],
      contact: "現場指揮官", phone: "03-870-4801", hours: "24 小時開放",
      isOfficial: true, verified: true, verifiedBy: "光復鄉公所", established: "2024-09-24",
      createdBy: "光復鄉公所", updated: "2026-06-14 08:40", version: 9, deleted: false,
      history: [{ v: 9, who: "系統匯入", when: "2026-06-14 08:40", note: "建立站點群", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
    },
    {
      id: "RS-0101",
      updatedMin: 12,
      assignedTeam: "壯闊台灣", name: "大進國小", type: "group", area: "光復鄉",
      parentId: null, isParent: true,
      photos: ["dajin-1.jpg"],
      address: "花蓮縣光復鄉大進村大進街 100 號", lat: 23.6774, lng: 121.4280, x: 58, y: 25,
      // 站點群為純容器：無營運狀態、無物資盤點（2026-08-21 決議）
      status: null, supplies: [],
      contact: "校方聯絡人", phone: "03-870-1601", hours: "24 小時開放",
      isOfficial: true, verified: true, verifiedBy: "光復鄉公所", established: "2024-09-24",
      createdBy: "光復鄉公所", updated: "2026-06-14 07:20", version: 6, deleted: false,
      history: [{ v: 6, who: "系統匯入", when: "2026-06-14 07:20", note: "建立站點群", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
    },
    // ── 糖廠這個站點群底下的站點 ──────────────────────────────────────
    {
      id: "RS-0102",
      updatedMin: 190,
      assignedTeam: "壯闊台灣", name: "糖廠沐浴站", type: "other", area: "光復鄉",
      parentId: "RS-0100", photos: ["bath-1.jpg"],
      address: "花蓮縣光復鄉大進街 19 號（糖廠停車場東側）", lat: 23.6731, lng: 121.4219, x: 49, y: 31,
      status: "open", supplies: [{ item: "熱水", level: "full" }, { item: "毛巾", level: "low" }],
      contact: "志工調度台", phone: "03-870-4812", hours: "06:00 – 22:00",
      isOfficial: true, verified: true, verifiedBy: "光復鄉公所", established: "2024-09-26",
      createdBy: "光復鄉公所", updated: "2026-06-14 08:05", version: 3, deleted: false,
      history: [{ v: 3, who: "黃曉芳（Team Admin）", when: "2026-06-14 08:05", note: "毛巾存量偏低", diff: [{ field: "supplies.毛巾", old: "充足", new: "偏低" }] }],
    },
    {
      id: "RS-0103",
      updatedMin: 6,
      assignedTeam: "壯闊台灣", name: "糖廠志工報到處", type: "other", area: "光復鄉",
      parentId: "RS-0100", photos: [],
      address: "花蓮縣光復鄉大進街 19 號（糖廠正門）", lat: 23.6715, lng: 121.4188, x: 45, y: 35,
      status: "open", supplies: [{ item: "雨鞋", level: "low" }, { item: "鏟子/圓鍬", level: "full" }],
      contact: "報到組", phone: "03-870-4820", hours: "07:00 – 18:00",
      isOfficial: true, verified: true, verifiedBy: "光復鄉公所", established: "2024-09-25",
      createdBy: "光復鄉公所", updated: "2026-06-14 09:12", version: 4, deleted: false,
      history: [{ v: 4, who: "李國豪（Team Member）", when: "2026-06-14 09:12", note: "雨鞋存量偏低", diff: [{ field: "supplies.雨鞋", old: "充足", new: "偏低" }] }],
    },
    {
      id: "RS-0142",
      updatedMin: 78,
      assignedTeam: "壯闊台灣",
      parentId: null, photos: ["shelter-1.jpg", "shelter-2.jpg"], name: "光復國中收容所", type: "shelter", area: "光復鄉",
      address: "花蓮縣光復鄉中正路一段 16 號", lat: 23.6694, lng: 121.4218, x: 46, y: 40,
      status: "open", supplies: [{ item: "飲用水", level: "full" }, { item: "睡袋/毛毯", level: "low" }, { item: "即食餐", level: "full" }],
      contact: "陳怡君", phone: "03-870-1234", hours: "24 小時開放",
      isOfficial: true, verified: true, verifiedBy: "系統匯入", established: "2024-09-25",
      createdBy: "中央災害應變中心", updated: "2026-06-14 08:12", version: 7, deleted: false,
      history: [
        { v: 7, who: "張育成（Data Auditor）", when: "2026-06-14 08:12", note: "更新目前收容人數", diff: [{ field: "current_load", old: "176", new: "198" }] },
        { v: 6, who: "系統 · 快速通道", when: "2026-06-13 21:40", note: "營運狀態調整", diff: [{ field: "operational_status", old: "已關閉", new: "開設中" }] },
        { v: 5, who: "林承翰（Super Admin）", when: "2026-06-12 09:05", note: "新增物資盤點欄位", diff: [{ field: "supplies", old: "—", new: "飲用水、睡袋/毛毯、即食餐" }] },
      ],
    },
    {
      id: "RS-0143",
      updatedMin: 22,
      assignedTeam: "壯闊台灣",
      parentId: "RS-0101", photos: ["supply-1.jpg"], name: "大進村物資集散中心", type: "supply", area: "光復鄉",
      address: "花蓮縣光復鄉大進村大全街 88 號", lat: 23.6731, lng: 121.4290, x: 58, y: 27,
      status: "open", supplies: [{ item: "鏟子/圓鍬", level: "full" }, { item: "除濕機", level: "out" }, { item: "雨鞋", level: "low" }],
      contact: "黃志明", phone: "0912-345-678", hours: "08:00 – 20:00",
      isOfficial: true, verified: true, verifiedBy: "光復鄉公所", established: "2024-09-24",
      createdBy: "光復鄉公所", updated: "2026-06-14 07:50", version: 11, deleted: false,
      history: [
        { v: 11, who: "張育成（Data Auditor）", when: "2026-06-14 07:50", note: "除濕機補貨需求", diff: [{ field: "supplies.除濕機", old: "偏低", new: "缺貨" }] },
        { v: 10, who: "黃曉芳（Team Admin）", when: "2026-06-13 15:20", note: "更新聯絡電話", diff: [{ field: "contact_phone", old: "03-870-2200", new: "0912-345-678" }] },
      ],
    },
    {
      id: "RS-0151",
      updatedMin: 620,
      assignedTeam: "慈濟基金會",
      parentId: null, photos: [], name: "馬太鞍臨時醫療站", type: "medical", area: "光復鄉",
      address: "花蓮縣光復鄉馬太鞍部落活動中心", lat: 23.6602, lng: 121.4156, x: 33, y: 52,
      status: "open", supplies: [{ item: "外傷敷料", level: "full" }, { item: "破傷風疫苗", level: "low" }],
      contact: "張醫師", phone: "03-870-5588", hours: "24 小時開放",
      isOfficial: true, verified: true, verifiedBy: "花蓮慈濟醫院", established: "2024-09-26",
      createdBy: "花蓮慈濟醫院", updated: "2026-06-14 06:30", version: 4, deleted: false,
      history: [
        { v: 4, who: "張育成（Data Auditor）", when: "2026-06-14 06:30", note: "疫苗存量偏低", diff: [{ field: "supplies.破傷風疫苗", old: "充足", new: "偏低" }] },
      ],
    },
    {
      id: "RS-0160",
      updatedMin: 2880,
      assignedTeam: null,
      parentId: null, photos: ["water-1.jpg"], name: "大富社區供水點", type: "water", area: "光復鄉",
      address: "花蓮縣光復鄉大富村明德路 12 號", lat: 23.6210, lng: 121.4302, x: 70, y: 64,
      status: "open", supplies: [{ item: "桶裝水", level: "low" }],
      contact: "社區理事長", phone: "03-870-7788", hours: "06:00 – 18:00",
      isOfficial: true, verified: true, verifiedBy: "台灣自來水公司", established: "2024-10-02",
      createdBy: "大富社區發展協會", updated: "2026-06-13 18:00", version: 3, deleted: false,
      history: [
        { v: 3, who: "系統 · 快速通道", when: "2026-06-13 18:00", note: "管線維修，先關閉再恢復", diff: [{ field: "operational_status", old: "開設中", new: "已關閉" }] },
      ],
    },
    {
      id: "RS-0166",
      updatedMin: 45,
      assignedTeam: null,
      parentId: null, photos: [], name: "光復車站充電補給站", type: "charging", area: "光復鄉",
      address: "花蓮縣光復鄉中正路二段 1 號", lat: 23.6685, lng: 121.4240, x: 50, y: 46,
      status: "open", supplies: [{ item: "行動電源", level: "out" }],
      contact: "台鐵服務台", phone: "03-870-2001", hours: "24 小時開放",
      isOfficial: false, verified: true, verifiedBy: "李** (志工)", established: "2024-09-28",
      createdBy: "黃曉芳（Team Admin）", updated: "2026-06-14 09:01", version: 6, deleted: false,
      history: [
        { v: 6, who: "系統 · 快速通道", when: "2026-06-14 09:01", note: "插座已滿載，暫時關閉", diff: [{ field: "operational_status", old: "開設中", new: "已關閉" }] },
      ],
    },
    {
      id: "RS-0170",
      updatedMin: 1520,
      assignedTeam: "鳳林救難協會",
      parentId: null, photos: [], name: "鳳林國小收容所", type: "shelter", area: "鳳林鎮",
      address: "花蓮縣鳳林鎮中華路 132 號", lat: 23.7460, lng: 121.4510, x: 64, y: 16,
      status: "open", supplies: [{ item: "飲用水", level: "full" }, { item: "盥洗包", level: "full" }],
      contact: "鳳林鎮公所", phone: "03-876-1100", hours: "24 小時開放",
      isOfficial: true, verified: true, verifiedBy: "鳳林鎮公所", established: "2024-09-25",
      createdBy: "鳳林鎮公所", updated: "2026-06-13 22:10", version: 2, deleted: false,
      history: [
        { v: 2, who: "系統匯入", when: "2026-06-13 22:10", note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] },
      ],
    },
    {
      id: "RS-0181",
      updatedMin: 7300,
      assignedTeam: null,
      parentId: null, photos: [], name: "瑞穗溫泉避難據點", type: "shelter", area: "瑞穗鄉",
      address: "花蓮縣瑞穗鄉溫泉路 25 號", lat: 23.4970, lng: 121.3760, x: 28, y: 82,
      status: "open", supplies: [{ item: "毛毯", level: "full" }],
      contact: "瑞穗鄉公所", phone: "03-887-2345", hours: "24 小時開放",
      isOfficial: true, verified: true, verifiedBy: "瑞穗鄉公所", established: "2024-09-27",
      createdBy: "瑞穗鄉公所", updated: "2026-06-12 11:00", version: 1, deleted: false,
      history: [{ v: 1, who: "系統匯入", when: "2026-06-12 11:00", note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
    },
    {
      id: "RS-0188",
      updatedMin: 4320,
      assignedTeam: "花蓮縣消防局",
      parentId: null, photos: [], name: "萬榮林道前進指揮所", type: "other", area: "萬榮鄉",
      address: "花蓮縣萬榮鄉萬榮村明利道路", lat: 23.7050, lng: 121.4080, x: 18, y: 30,
      status: "open", supplies: [],
      contact: "搜救協調官", phone: "03-875-0119", hours: "24 小時開放",
      isOfficial: true, verified: true, verifiedBy: "消防局", established: "2024-09-26",
      createdBy: "花蓮縣消防局", updated: "2026-06-14 05:15", version: 2, deleted: false,
      history: [{ v: 2, who: "系統匯入", when: "2026-06-14 05:15", note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
    },
    {
      id: "RS-0190",
      updatedMin: 11200,
      assignedTeam: null,
      parentId: null, photos: [], name: "大同村臨時供餐站", type: "supply", area: "光復鄉",
      address: "花蓮縣光復鄉大同村中山路三段 5 號", lat: 23.6760, lng: 121.4180, x: 42, y: 22,
      status: "closed", supplies: [],
      contact: "—", phone: "—", hours: "—",
      isOfficial: false, verified: false, verifiedBy: null, established: "2024-09-30",
      createdBy: "黃曉芳（Team Admin）", updated: "2026-06-10 14:00", version: 5, deleted: true,
      history: [
        { v: 5, who: "林承翰（Super Admin）", when: "2026-06-10 14:00", note: "任務結束，下架站點（軟刪除）", diff: [{ field: "operational_status", old: "open", new: "closed" }] },
        { v: 4, who: "黃曉芳（Team Admin）", when: "2026-06-05 09:30", note: "更新供餐時段", diff: [{ field: "opening_hours", old: "11:00–13:00", new: "11:00–13:00, 17:00–19:00" }] },
      ],
    },
  ];

  // —— 修改建議 (StationEditSuggestion) ——
  // currentVersion = 站點現行版本；base_version < currentVersion 且同欄位被改 → 衝突
  const PROPOSALS = [
    {
      id: "SUG-2207", stationId: "RS-0142", stationName: "光復國中收容所",
      submittedBy: "前台用戶 · 王**", submittedAt: "2026-06-14 09:22", source: "crowdsourced",
      baseVersion: 7, status: "pending",
      changes: [
        { field: "opening_hours", label: "開放時間", old: "24 小時開放", new: "夜間 22:00 後僅留守一名管理員" },
        { field: "contact_phone", label: "聯絡電話", old: "03-870-1234", new: "03-870-1299" },
      ],
    },
    {
      id: "SUG-2211", stationId: "RS-0143", stationName: "大進村物資集散中心",
      submittedBy: "前台用戶 · 李**", submittedAt: "2026-06-14 08:05", source: "crowdsourced",
      baseVersion: 9, status: "pending", // 站點現為 v11 → 衝突
      changes: [
        { field: "contact_phone", label: "聯絡電話", old: "03-870-2200", new: "03-870-2255", conflict: true },
        { field: "address", label: "地址", old: "花蓮縣光復鄉大進村大全街 88 號", new: "花蓮縣光復鄉大進村大全街 86 號" },
      ],
    },
    {
      id: "SUG-2215", stationId: "RS-0166", stationName: "光復車站充電補給站",
      submittedBy: "前台用戶 · 陳**", submittedAt: "2026-06-14 07:40", source: "crowdsourced",
      baseVersion: 6, status: "pending",
      changes: [
        { field: "name", label: "站點名稱", old: "光復車站充電補給站", new: "光復車站充電 & WiFi 補給站" },
        { field: "supplies", label: "物資項目", old: "行動電源", new: "行動電源、延長線、WiFi 分享器" },
      ],
    },
    {
      id: "SUG-2219", stationId: "RS-0160", stationName: "大富社區供水點",
      submittedBy: "前台用戶 · 周**", submittedAt: "2026-06-14 06:15", source: "crowdsourced",
      baseVersion: 3, status: "pending", statusOnly: true,
      changes: [
        { field: "operational_status", label: "營運狀態", old: "已關閉", new: "開設中（回報已恢復供水）" },
      ],
    },
  ];

  // ── 可選欄位定義 ────────────────────────────────────────────────────────
  // required 的欄位不可隱藏（沒有站名就無法辨識是哪一站）
  window.STATION_COLUMNS = [
    { key: "station", label: "站點",       width: "minmax(240px,2.2fr)", required: true },
    { key: "type",    label: "類型",       width: "120px" },
    { key: "area",    label: "行政區",     width: "110px" },
    { key: "status",  label: "營運狀態",   width: "150px" },
    { key: "team",    label: "指派 Team",  width: "138px" },
    { key: "updated", label: "最後更新",   width: "130px" },
  ];
  // 2026-08-16：欄位不可自訂 —— 順序與顯示欄位一律依上方定義，不再提供設定介面，
  // 也不再讀寫 localStorage（舊的 station.colOrder / station.colHidden 一併清掉）。
  try {
    localStorage.removeItem("station.colOrder");
    localStorage.removeItem("station.colHidden");
  } catch (e) { /* 無痕模式讀不到就算了 */ }

  window.StationData = { STATUS, STATUS_ORDER, TYPE, TYPE_ORDER, AREAS, TEAMS, FRESHNESS, LEVEL, STATIONS, PROPOSALS, PENDING };
})();
