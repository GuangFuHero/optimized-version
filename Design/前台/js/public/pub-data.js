// pub-data.js — 公開前台地圖假資料（訪客視角：位置降精度、聯絡遮罩）
// 座標為真實經緯度（花蓮光復鄉 / 鳳林鎮一帶）。對齊後端 feature/pii-protection：
// 訪客看到的是 H3 六邊形（固定 ~500m 隱私格）中心，地址只到鄉鎮，聯絡遮罩。
window.PUB_EVENT = {
  name: "2026 花蓮光復 馬太鞍溪堰塞湖溢流",
  types: ["水災", "土石流"],
  // regions 已移除（2026-08-16 Sucre：後端確定沒有這個儲存欄位，全面移除，不只後台）
  center: [23.6725, 121.4235],
  zoom: 13,
};

window.PUB_PRIORITY = {
  critical: { label: "生命危急", color: "#D32F2F" },
  high:     { label: "緊急",     color: "#F57C00" },
  medium:   { label: "一般",     color: "#2592B9" },
  low:      { label: "低",       color: "#64748B" },
};

window.PUB_TASK_KIND = {
  rescue: { label: "搜救", color: "#D32F2F" },
  hr:     { label: "人力", color: "#2563EB" },
  supply: { label: "物資", color: "#2E7D32" },
};

window.PUB_STATUS = {
  pending:     { label: "待處理", color: "#B4690E" },
  in_progress: { label: "處理中", color: "#0E7490" },
  completed:   { label: "已完成", color: "#2E7D32" },
};

// ── H3 降精度「格」：訪客地圖上一個六邊形 = 一個 ~500m 隱私格（街廓級上限）──
// 同格內多筆 Ticket 塌縮到同一中心；contact/phone 已預先遮罩（如後端 mask_name/mask_phone）。
window.PUB_CELLS = [
  {
    id: "c1", area: "花蓮縣光復鄉 大同村", center: [23.6760, 121.4205], top: "critical",
    tickets: [
      { id: "T-1042", title: "透天遭土石掩埋受困", priority: "critical", status: "in_progress", contact: "王◯◯", phone: "09**-***-*11",
        tasks: [{ kind: "rescue", name: "破拆搜救人力" }, { kind: "supply", name: "圓鍬" }] },
      { id: "T-1051", title: "民宅一樓進水待救", priority: "high", status: "pending", contact: "陳◯◯", phone: "09**-***-*40",
        tasks: [{ kind: "rescue", name: "撤離協助" }] },
      { id: "T-1067", title: "收容所物資見底", priority: "medium", status: "pending", contact: "—", phone: "—",
        tasks: [{ kind: "supply", name: "飲用水" }, { kind: "supply", name: "毛毯" }] },
    ],
  },
  {
    id: "c2", area: "花蓮縣光復鄉 大平村", center: [23.6640, 121.4290], top: "medium",
    tickets: [
      { id: "T-1071", title: "住宅清淤", priority: "medium", status: "in_progress", contact: "林◯◯", phone: "—",
        tasks: [{ kind: "hr", name: "清淤人力" }, { kind: "supply", name: "推車" }] },
      { id: "T-1078", title: "街道沖洗", priority: "low", status: "pending", contact: "—", phone: "—",
        tasks: [{ kind: "hr", name: "清淤人力" }, { kind: "supply", name: "高壓水槍" }] },
    ],
  },
  {
    id: "c3", area: "花蓮縣鳳林鎮 市區", center: [23.7455, 121.4520], top: "critical",
    tickets: [
      { id: "T-1080", title: "獨居長者失聯", priority: "critical", status: "pending", contact: "里◯◯", phone: "09**-***-*02",
        tasks: [{ kind: "rescue", name: "破門搜救人力" }] },
      { id: "T-1085", title: "收容所醫療支援", priority: "high", status: "in_progress", contact: "護◯◯", phone: "09**-***-*40",
        tasks: [{ kind: "hr", name: "EMT 醫護人力" }, { kind: "supply", name: "常備藥品" }] },
    ],
  },
];

// ── 站點（公開 POI，精確顯示）──────────────────────────────────────────────
// status 只有 open / closed 兩態（MVP 決定，不做暫停與額滿）
// ⚠️ 2026-08-06 與 PM 確認：資源站點不做民眾投票。前台只能回報問題。
// ⚠️ 前台不顯示聯絡人與電話（僅後台可見）。
// ⚠️ 前台不能新增站點，只能對既有站點回報問題。
window.PUB_STATIONS = [
  { id: "s1", type: "shelter", label: "收容所", x: 0, center: [23.6748, 121.4218], name: "大同村活動中心",
    status: "open", hours: "24 小時開放", verifiedBy: "光復鄉公所", updated: "2 小時前",
    note: "現場有熱食供應" },
  { id: "s2", type: "supply",  label: "物資站", center: [23.6699, 121.4238], name: "光復車站前發放點",
    status: "open", hours: "08:00 – 20:00", verifiedBy: "光復鄉公所", updated: "40 分鐘前",
    note: "飲用水充足；睡袋與毛毯偏少" },
  { id: "s3", type: "medical", label: "醫療站", center: [23.7448, 121.4535], name: "鳳林國小收容所",
    status: "open", hours: "24 小時開放", verifiedBy: "衛生所", updated: "1 小時前",
    note: "" },
  { id: "s4", type: "water",   label: "供水站", center: [23.6605, 121.4305], name: "大平村供水點",
    status: "open", hours: "全日", verifiedBy: "自來水公司", updated: "3 小時前",
    // 法規：經消防車運送之民生用水僅供清潔使用，不可飲用。此區分寫在說明欄，不另設必填欄位。
    note: "消防車運送，僅供清潔使用，不可飲用" },
];
window.PUB_STATION_TYPES = {
  shelter: { color: "#7C3AED", label: "收容所" }, supply: { color: "#2E7D32", label: "物資站" },
  medical: { color: "#D32F2F", label: "醫療站" }, water: { color: "#2592B9", label: "供水站" },
};
window.PUB_STATION_STATUS = {
  open:   { label: "開放中", tone: "success" },
  closed: { label: "已關閉", tone: "neutral" },
};
// 回報問題的固定選項。刻意不開放自由發言當作公開內容——這不是社群平台。
// 補充說明會進後台給審核人員看，不會公開顯示。
window.PUB_STATION_ISSUES = [
  { k: "closed",   label: "已經關閉了" },
  { k: "supply",   label: "東西發完了" },
  { k: "full",     label: "人太多進不去" },
  { k: "location", label: "位置不對" },
  { k: "hours",    label: "開放時間不對" },
  { k: "other",    label: "其他" },
];
