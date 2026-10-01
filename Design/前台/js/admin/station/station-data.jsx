// stationData.jsx — mock data model for 資源站管理 (R1 station, R2 proposals, R4 version history)
(function () {

  // —— 營運狀態 (operational_status) ——
  const STATUS = {
    open:   { label: "營運中", tone: "success", icon: "CircleCheck" },
    paused: { label: "暫停中", tone: "warning", icon: "CirclePause" },
    full:   { label: "已額滿", tone: "info",    icon: "CircleDot" },
    closed: { label: "已關閉", tone: "neutral",  icon: "CircleOff" },
  };
  const STATUS_ORDER = ["open", "paused", "full", "closed"];

  // —— 站點類型 (station_type) ——
  const TYPE = {
    shelter:  { label: "避難收容", icon: "Home",    tone: "secondary" },
    supply:   { label: "物資集散", icon: "Package", tone: "primary" },
    medical:  { label: "醫療站",   icon: "Cross",   tone: "danger" },
    water:    { label: "供水點",   icon: "Droplets", tone: "info" },
    charging: { label: "充電/通訊", icon: "BatteryCharging", tone: "warning" },
    other:    { label: "其他",     icon: "MapPin",  tone: "neutral" },
  };
  const TYPE_ORDER = ["shelter", "supply", "medical", "water", "charging", "other"];

  // —— 行政區 (admin_area) ——
  const AREAS = ["光復鄉", "鳳林鎮", "瑞穗鄉", "萬榮鄉", "花蓮市"];

  // supply level chips
  const LEVEL = { full: { label: "充足", tone: "success" }, low: { label: "偏低", tone: "warning" }, out: { label: "缺貨", tone: "danger" } };

  // —— 站點清單 (single source of truth, shared w/ 06 圖層) ——
  // [x%, y%] are stylised map coords; lat/lng shown as data.
  const STATIONS = [
    {
      id: "RS-0142", name: "光復國中收容所", type: "shelter", area: "光復鄉",
      address: "花蓮縣光復鄉中正路一段 16 號", lat: 23.6694, lng: 121.4218, x: 46, y: 40,
      status: "open", capacity: 320, load: 198,
      supplies: [{ item: "飲用水", level: "full" }, { item: "睡袋/毛毯", level: "low" }, { item: "即食餐", level: "full" }],
      contact: "陳怡君", phone: "03-870-1234", hours: "24 小時開放",
      source: "official", verified: true, verifiedBy: "系統匯入", established: "2024-09-25",
      createdBy: "中央災害應變中心", updated: "2026-06-14 08:12", version: 7, deleted: false,
      history: [
        { v: 7, who: "陳怡君 (Auditor)", when: "2026-06-14 08:12", note: "更新目前收容人數", diff: [{ field: "current_load", old: "176", new: "198" }] },
        { v: 6, who: "系統 · 快速通道", when: "2026-06-13 21:40", note: "營運狀態調整", diff: [{ field: "operational_status", old: "full", new: "open" }] },
        { v: 5, who: "林宥廷 (Super Admin)", when: "2026-06-12 09:05", note: "新增物資盤點欄位", diff: [{ field: "supplies", old: "—", new: "飲用水、睡袋/毛毯、即食餐" }] },
      ],
    },
    {
      id: "RS-0143", name: "大進村物資集散中心", type: "supply", area: "光復鄉",
      address: "花蓮縣光復鄉大進村大全街 88 號", lat: 23.6731, lng: 121.4290, x: 58, y: 27,
      status: "open", capacity: null, load: null,
      supplies: [{ item: "鏟子/圓鍬", level: "full" }, { item: "除濕機", level: "out" }, { item: "雨鞋", level: "low" }],
      contact: "黃志明", phone: "0912-345-678", hours: "08:00 – 20:00",
      source: "official", verified: true, verifiedBy: "光復鄉公所", established: "2024-09-24",
      createdBy: "光復鄉公所", updated: "2026-06-14 07:50", version: 11, deleted: false,
      history: [
        { v: 11, who: "黃志明 (Auditor)", when: "2026-06-14 07:50", note: "除濕機補貨需求", diff: [{ field: "supplies.除濕機", old: "偏低", new: "缺貨" }] },
        { v: 10, who: "前台投稿核准", when: "2026-06-13 15:20", note: "更新聯絡電話", diff: [{ field: "contact_phone", old: "03-870-2200", new: "0912-345-678" }] },
      ],
    },
    {
      id: "RS-0151", name: "馬太鞍臨時醫療站", type: "medical", area: "光復鄉",
      address: "花蓮縣光復鄉馬太鞍部落活動中心", lat: 23.6602, lng: 121.4156, x: 33, y: 52,
      status: "open", capacity: 40, load: 12,
      supplies: [{ item: "外傷敷料", level: "full" }, { item: "破傷風疫苗", level: "low" }],
      contact: "張醫師", phone: "03-870-5588", hours: "24 小時開放",
      source: "official", verified: true, verifiedBy: "花蓮慈濟醫院", established: "2024-09-26",
      createdBy: "花蓮慈濟醫院", updated: "2026-06-14 06:30", version: 4, deleted: false,
      history: [
        { v: 4, who: "張醫師 (Auditor)", when: "2026-06-14 06:30", note: "疫苗存量偏低", diff: [{ field: "supplies.破傷風疫苗", old: "充足", new: "偏低" }] },
      ],
    },
    {
      id: "RS-0160", name: "大富社區供水點", type: "water", area: "光復鄉",
      address: "花蓮縣光復鄉大富村明德路 12 號", lat: 23.6210, lng: 121.4302, x: 70, y: 64,
      status: "paused", capacity: null, load: null,
      supplies: [{ item: "桶裝水", level: "low" }],
      contact: "社區理事長", phone: "03-870-7788", hours: "06:00 – 18:00",
      source: "official", verified: true, verifiedBy: "台灣自來水公司", established: "2024-10-02",
      createdBy: "大富社區發展協會", updated: "2026-06-13 18:00", version: 3, deleted: false,
      history: [
        { v: 3, who: "系統 · 快速通道", when: "2026-06-13 18:00", note: "管線維修暫停供水", diff: [{ field: "operational_status", old: "open", new: "paused" }] },
      ],
    },
    {
      id: "RS-0166", name: "光復車站充電補給站", type: "charging", area: "光復鄉",
      address: "花蓮縣光復鄉中正路二段 1 號", lat: 23.6685, lng: 121.4240, x: 50, y: 46,
      status: "full", capacity: 24, load: 24,
      supplies: [{ item: "行動電源", level: "out" }],
      contact: "台鐵服務台", phone: "03-870-2001", hours: "24 小時開放",
      source: "crowdsourced", verified: true, verifiedBy: "李** (志工)", established: "2024-09-28",
      createdBy: "前台投稿", updated: "2026-06-14 09:01", version: 6, deleted: false,
      history: [
        { v: 6, who: "系統 · 快速通道", when: "2026-06-14 09:01", note: "插座已滿載", diff: [{ field: "operational_status", old: "open", new: "full" }] },
      ],
    },
    {
      id: "RS-0170", name: "鳳林國小收容所", type: "shelter", area: "鳳林鎮",
      address: "花蓮縣鳳林鎮中華路 132 號", lat: 23.7460, lng: 121.4510, x: 64, y: 16,
      status: "open", capacity: 250, load: 88,
      supplies: [{ item: "飲用水", level: "full" }, { item: "盥洗包", level: "full" }],
      contact: "鳳林鎮公所", phone: "03-876-1100", hours: "24 小時開放",
      source: "official", verified: true, verifiedBy: "鳳林鎮公所", established: "2024-09-25",
      createdBy: "鳳林鎮公所", updated: "2026-06-13 22:10", version: 2, deleted: false,
      history: [
        { v: 2, who: "系統匯入", when: "2026-06-13 22:10", note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] },
      ],
    },
    {
      id: "RS-0181", name: "瑞穗溫泉避難據點", type: "shelter", area: "瑞穗鄉",
      address: "花蓮縣瑞穗鄉溫泉路 25 號", lat: 23.4970, lng: 121.3760, x: 28, y: 82,
      status: "open", capacity: 120, load: 31,
      supplies: [{ item: "毛毯", level: "full" }],
      contact: "瑞穗鄉公所", phone: "03-887-2345", hours: "24 小時開放",
      source: "official", verified: true, verifiedBy: "瑞穗鄉公所", established: "2024-09-27",
      createdBy: "瑞穗鄉公所", updated: "2026-06-12 11:00", version: 1, deleted: false,
      history: [{ v: 1, who: "系統匯入", when: "2026-06-12 11:00", note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
    },
    {
      id: "RS-0188", name: "萬榮林道前進指揮所", type: "other", area: "萬榮鄉",
      address: "花蓮縣萬榮鄉萬榮村明利道路", lat: 23.7050, lng: 121.4080, x: 18, y: 30,
      status: "open", capacity: null, load: null,
      supplies: [],
      contact: "搜救協調官", phone: "03-875-0119", hours: "24 小時開放",
      source: "official", verified: true, verifiedBy: "消防局", established: "2024-09-26",
      createdBy: "花蓮縣消防局", updated: "2026-06-14 05:15", version: 2, deleted: false,
      history: [{ v: 2, who: "系統匯入", when: "2026-06-14 05:15", note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
    },
    {
      id: "RS-0190", name: "大同村臨時供餐站", type: "supply", area: "光復鄉",
      address: "花蓮縣光復鄉大同村中山路三段 5 號", lat: 23.6760, lng: 121.4180, x: 42, y: 22,
      status: "closed", capacity: null, load: null,
      supplies: [],
      contact: "—", phone: "—", hours: "—",
      source: "crowdsourced", verified: false, verifiedBy: null, established: "2024-09-30",
      createdBy: "前台投稿", updated: "2026-06-10 14:00", version: 5, deleted: true,
      history: [
        { v: 5, who: "林宥廷 (Super Admin)", when: "2026-06-10 14:00", note: "任務結束，下架站點（軟刪除）", diff: [{ field: "operational_status", old: "open", new: "closed" }] },
        { v: 4, who: "前台投稿核准", when: "2026-06-05 09:30", note: "更新供餐時段", diff: [{ field: "opening_hours", old: "11:00–13:00", new: "11:00–13:00, 17:00–19:00" }] },
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
        { field: "operational_status", label: "營運狀態", old: "暫停中", new: "營運中（回報已恢復供水）" },
      ],
    },
  ];

  window.StationData = { STATUS, STATUS_ORDER, TYPE, TYPE_ORDER, AREAS, LEVEL, STATIONS, PROPOSALS };
})();
