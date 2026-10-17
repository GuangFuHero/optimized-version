// tk-data.js — 任務管理的資料層（四層模型：Ticket 地點 → Task 需求 → 承接）
//
// 🧹 2026-10-16：**測試任務單已全部移除**，頁面一開是空的 —— 這是給使用者用的真實狀態。
//    資料要從兩個入口進來：後台「新增任務」、前台民眾報案（經 wg-bridge.js 併入）。
//    這支檔案現在只放「規則與選項」（狀態、優先級、需求種類…），不放任何紀錄。
//    正式版：TK_TICKETS 換成 GraphQL `tickets` 查詢的結果，欄位見 README 的對照表。
// ⚠️ 事件層（名稱／災害類型／起始時間）後端 ER diagram 目前無對應資料表，
//    畫面上一律以「資料待確認」樣式標示，見 window.TK_PENDING。
// ── RBAC（5 角色）─────────────────────────────────────────────────────────
// 2026-08-17：標籤改讀 wg-terms.js 的 token（四個後台頁唯一真相來源）。
// ⚠️ 這裡的 `admin` / `member` 其實是**團隊角色**被誤放在 rbac 欄位裡的歷史遺留，
//    不是平台角色。依 8/14 裁示，隸屬 NGO 隊的人平台角色就是非政府組織。
//    真正的平台角色請讀 wgActingPlatformRole()，不要讀 persona.rbac。
window.TK_RBAC = {
  super:   { label: window.wgPlatformLabel("super"),   tone: window.wgPlatformTone("super")   },
  gov:     { label: window.wgPlatformLabel("gov"),     tone: window.wgPlatformTone("gov")     },
  admin:   { label: window.wgPlatformLabel("ngo"),     tone: window.wgPlatformTone("ngo")     },
  member:  { label: window.wgPlatformLabel("ngo"),     tone: window.wgPlatformTone("ngo")     },
  auditor: { label: window.wgPlatformLabel("auditor"), tone: window.wgPlatformTone("auditor") },
};

// teams = 這個人隸屬的所有 Team（MEM-MT-101 一人多隊）。
// 沒有「目前身份」這種全域狀態 —— 隸屬的每一隊他都看得到也都改得動（AC-VS-104 的寫入邊界＝聯集）。
// 需要決定歸屬的動作（新建任務單）在當下就地問，不靠全域切換器。
// `team` 保留為 teams[0]，只給還沒改寫的舊呼叫點用。
window.TK_PERSONAS = {
  super:   { id: "u-lin",   name: "林承翰", rbac: "super",   title: "平台管理者",          teams: [] },
  gov:     { id: "u-wu",    name: "吳政憲", rbac: "gov",     title: "花蓮縣政府災防辦",     teams: [] },
  admin:   { id: "u-huang", name: "黃曉芳", rbac: "admin",   title: "壯闊台灣 · 管理員", teams: ["壯闊台灣", "慈濟基金會"] },
  member:  { id: "u-lee",   name: "李國豪", rbac: "member",  title: "壯闊台灣 · 成員",      teams: ["壯闊台灣"] },
  auditor: { id: "u-chang", name: "張育成", rbac: "auditor", title: "資料檢核",          teams: [] },
};
Object.values(window.TK_PERSONAS).forEach((p) => { p.team = p.teams[0] || null; });

// ── 「資料待確認」註記（§7 阻斷級事項的統一佔位說明）──────────────────────────
window.TK_PENDING = {
  disasterFields: {
    title: "欄位定義待確認",
    note: "以下欄位名稱與選項為版型示意，尚未對應消防署／INSARAG 或各單位現行表單。上線前需由權責單位提供正式欄位清單。",
  },
  activation: {
    title: "事件層資料待確認",
    note: "後端 ER diagram 尚無 event／activation 表。事件名稱、事件層災害類型與起始時間目前無資料來源。",
  },
};

// ── 災害種類（系統預定義）— 只用於「平台層事件」的顯示，Ticket 不攜帶災害 ────────
window.TK_DISASTERS = {
  earthquake: { label: "地震",   color: "#E3791E", tint: "var(--color-bg-primary-subtle)" },
  fire:       { label: "火災",   color: "#D32F2F", tint: "var(--color-bg-danger-subtle)"  },
  flood:      { label: "水災",   color: "#2592B9", tint: "var(--color-bg-info-subtle)"    },
  typhoon:    { label: "颱風",   color: "#0E7490", tint: "#E0F2F7" },
  landslide:  { label: "土石流", color: "#92400E", tint: "#FBEEE4" },
  tsunami:    { label: "海嘯",   color: "#1D4ED8", tint: "#E4ECFD" },
  radiation:  { label: "輻射",   color: "#7C3AED", tint: "#F0E9FC" },
  war:        { label: "戰爭",   color: "#475569", tint: "#EEF1F5" },
  epidemic:   { label: "流行病", color: "#2E7D32", tint: "var(--color-bg-success-subtle)" },
  other:      { label: "其他",   color: "#64748B", tint: "var(--color-bg-neutral-subtle)" },
};

// ── 優先級 4 級（§6：只有「生命危急」有實心紅，緊急淡橘，其餘純灰）────────────────
window.TK_PRIORITY = {
  critical: { label: "生命危急", rank: 4, warnMin: 30,  overMin: 60  },
  high:     { label: "緊急",     rank: 3, warnMin: 120, overMin: 240 },
  medium:   { label: "一般",     rank: 2 },
  low:      { label: "低",       rank: 1 },
};

// ── Ticket 狀態（地點層）— 後台只能改前三個 ─────────────────────────────────
window.TK_STATUS = {
  pending:     { label: "待處理", dot: true },
  in_progress: { label: "處理中" },
  completed:   { label: "已完成" },
  canceled:    { label: "已取消", readonly: true, by: "由建立者於前台撤案" },
  archived:    { label: "已封存", readonly: true, by: "由系統自動封存" },
};
window.TK_STATUS_EDITABLE = ["pending", "in_progress", "completed"];

// ── Task 狀態（需求層）─ 檢視態即可用下拉調整 ─────────────────────────────────
window.TK_TASK_STATUS = {
  pending:     { label: "待承接" },
  in_progress: { label: "進行中" },
  fulfilled:   { label: "已滿足" },
  canceled:    { label: "已取消" },
};

// ── Task 需求種類（ticket_tasks.task_type）────────────────────────────────────
window.TK_TASK_KIND = {
  rescue: { label: "搜救", icon: "LifeBuoy" },
  hr:     { label: "人力", icon: "Users"    },
  supply: { label: "物資", icon: "Package"  },
};

window.TK_INTAKE = {
  citizen: { label: "前台民眾報案" },
  staff:   { label: "後台代報" },
  system:  { label: "系統匯入" },
};

window.TK_VISIBILITY = {
  restricted: { label: "受限（僅後台）" },
  public:     { label: "公開" },
};

// ── 系統設定（自動封存規則；實際值在設定頁調整，此處唯讀顯示）────────────────────
window.TK_SETTINGS = { archiveDays: 30, settingsHref: "#settings/archive" };

// ── 動態欄位：跟著「災害類型」走 ─────────────────────────────────────────────
// ⚠️ 全部為版型示意，見 TK_PENDING.disasterFields
window.TK_DISASTER_FIELDS = {
  flood: [
    { key: "water_depth",  label: "積水深度", type: "text",   hint: "cm" },
    { key: "water_trend",  label: "水位趨勢", type: "select", options: ["上升", "持平", "退去"] },
    { key: "road_access",  label: "聯外道路", type: "select", options: ["中斷", "單線可通", "正常"] },
    { key: "power_status", label: "電力",     type: "select", options: ["停電", "不穩", "正常"] },
  ],
  landslide: [
    { key: "bury_extent",  label: "掩埋範圍", type: "text",   hint: "如 1F 全埋 / 車道" },
    { key: "road_access",  label: "聯外道路", type: "select", options: ["中斷", "單線可通", "正常"] },
    { key: "slope_risk",   label: "二次崩塌風險", type: "select", options: ["高", "中", "低"] },
  ],
};

// ── Team 成員名冊（Team Admin 指派承接人用；對應 users × team_members）──────────
window.TK_TEAM_MEMBERS = {
  "壯闊台灣":       [{ id: "u-lee", name: "李國豪" }, { id: "u-chen", name: "陳柏宇" }, { id: "u-tsai", name: "蔡孟儒" }, { id: "u-hsu", name: "許雅婷" }],
  "慈濟基金會":     [{ id: "u-liu", name: "劉美玲" }, { id: "u-yang", name: "楊志明" }, { id: "u-ko", name: "柯宗翰" }],
  "中華民國紅十字會": [{ id: "u-hung", name: "洪于晴" }, { id: "u-pan", name: "潘冠廷" }],
};

// ── 任務 Ticket（地點錨點）→ tasks（需求）→ assignees（承接，含 qty）───────────
// 🧹 空陣列。一筆的形狀見 Design/後台/docs/任務管理.md「資料形狀」。
// updatedMin = 距最後狀態異動的分鐘數（後端待補「最後狀態異動時間」欄位）
window.TK_TICKETS = [];

// ── Disaster Activation（事件層；⚠️ 後端無對應表）──────────────────────────────
window.TK_ACTIVATION = {
  name: "花蓮馬太鞍溪堰塞湖專案",
  // shortName：側邊欄品牌列用的短名（2026-08-16）。全名放事件卡與 tooltip。
  // ⚠️ 顯示用欄位，後端沒有；沒設就 fallback 到 name。
  shortName: "花蓮馬太鞍溪",
  types: ["flood", "landslide"],
  // regions 已移除（2026-08-16 Sucre：後端確定沒有這個儲存欄位）
  startedAt: "2026-06-10 04:18",
  startedBy: "林承翰",
  pending: true,
};

// ── 列表欄位定義（TM-FS-101：順序／顯示為全域設定，只在欄位設定頁維護）───────────
// TM-FS-102：列表不橫向捲動 —— 所有彈性欄位最小寬度為 0，格線永遠收得進視窗；
// 過寬的值單行截斷，完整內容靠 hover（title）與詳情頁。
window.TK_COLUMNS = [
  { key: "priority", label: "優先級",    width: "104px", required: true },
  { key: "ticket",   label: "任務",      width: "minmax(0,2.4fr)", required: true },
  { key: "tasks",    label: "需求 · 承接進度", width: "minmax(0,2fr)" },
  { key: "updated",  label: "更新時間",  width: "92px" },
  { key: "status",   label: "狀態",      width: "92px" },
  { key: "team",     label: "指派 Team", width: "minmax(0,1fr)" },
];

// ── 志工統計（tk-stats.jsx；目前沒有任何畫面在用）───────────────────────────
// 🧹 歸零。正式版由後端彙總 task_assignments，不在前端算。
window.TK_VOLUNTEER = { matchedToday: 0, demand: 0, cumulative: 0, byRegion: [] };


// 地址組合（county/city/street/no 是分開的欄位，不是一整串）
window.tkAddress = function (t) {
  return [t.county, t.city, t.street, t.no].filter(Boolean).join("");
};

// Ticket 狀態＝由需求的承接進度自動推導（後台不可手改）
// 已取消（前台撤案）／已封存（系統）維持原值。
window.tkStatus = function (t) {
  if (t.status === "canceled" || t.status === "archived") return t.status;
  const tasks = (t.tasks || []).filter((k) => k.status !== "canceled");
  if (!tasks.length) return "pending";
  if (tasks.every((k) => k.status === "fulfilled")) return "completed";
  const started = tasks.some((k) => (k.assignees || []).length > 0 || k.status === "in_progress" || k.status === "fulfilled");
  return started ? "in_progress" : "pending";
};
window.TK_STATUS_RULE = "狀態由需求的承接進度自動推導：全部需求已滿足＝已完成；有人承接或進行中＝處理中；否則＝待處理。";

// ── 任務單 History（TM-FEAT-008）─────────────────────────────────────────────
// ⚠️ 版型示意資料。正式資料來源為 audit_logs ＋ task_assignments 兩張表的合併查詢
// （TM-RH-104），依 row_id 過濾、時間排序。
//
// 一筆的形狀：
//   at        時間
//   actor     操作者姓名。TM-RH-105：寫入當下的姓名快照，帳號被刪除後仍讀得到名字
//   actorGone 該帳號已不存在（仍以快照姓名顯示，不退回 UUID）
//   team      操作者當時所屬單位
//   src       來源：audit（audit_logs）／assign（task_assignments）
//   crawler   TM-RH-106：機器爬取，給專屬 badge
//   action    動作敘述
//   field     有欄位變更時的欄位名稱
//   from/to   TM-RH-103：變更前後值。無值變更的事件不帶這組
//   fieldOff  TM-RH-107：該欄位事後已被停用，歷史仍完整保留
// 🧹 歷史種子已清空。沒有種子時，每張單至少會有一筆「建立任務單」（見 tkHistory）。
window.TK_HISTORY = {};

// 這一輪新寫入的歷史。TK_HISTORY 是後端讀回來的既有紀錄、不動它 ——
// 種子是「以前發生過的事」，這裡是「這個 session 剛做的事」。
// ⚠️ 只在記憶體，重整就沒了。正式版寫 audit_logs。
window.TK_HISTORY_NEW = window.TK_HISTORY_NEW || {};

// TM-IMG-143：新增／移除圖片連結要留紀錄。
// 🔒 移除時 `from` 帶的是**原網址** —— 歷史不能只寫「移除了一張圖」，
//    那樣事後查不出被移掉的是哪一條（規格：移除時歷史保留原網址）。
window.tkPushHistory = function (ticketId, entry) {
  if (!ticketId || !entry) return;
  const bag = window.TK_HISTORY_NEW;
  bag[ticketId] = [entry].concat(bag[ticketId] || []);
};

// TM-RH-101：每一張單都有時間軸。沒有明列的單以建立事件回填，
// 讓「開了 History 卻是空的」不會發生。
window.tkHistory = function (t) {
  if (!t) return [];
  // 🔴 本 session 的新紀錄排在最前（TM-RH-103 新到舊），再接種子。
  //    不要反過來寫成「種子 concat 新的」—— 那會讓剛做的事沉到最底下。
  const fresh = window.TK_HISTORY_NEW[t.id] || [];
  const listed = window.TK_HISTORY[t.id];
  if (listed) return fresh.concat(listed);
  if (fresh.length) return fresh.concat(tkSeedEntry(t));
  return tkSeedEntry(t);
};

function tkSeedEntry(t) {
  const by = { citizen: "前台民眾", staff: "後台人員", system: "災情爬蟲" }[t.intake] || "系統";
  return [{
    at: t.createdAt, actor: by, team: t.team || "平台", src: "audit",
    crawler: t.intake === "system", action: "建立任務單",
  }];
}

// ── 任務單座標（地圖用）────────────────────────────────────────────────────
// 三個來源的形狀不一樣，統一在這裡轉成 Leaflet 的 [lat, lng]：
//   t.coord      互助地圖內部用的形狀
//   t.landmark   後台建單（tk-form.jsx 的地標選點 {lat, lng, source}）
//   t._site      前台民眾報案（wg-bridge.js createSiteTicket 存在 _site.lat/_site.lng）
// 正式版：tickets 的地標座標（PostGIS Point，GeoJSON 是 [lng, lat]，注意順序）。
// 沒座標回 null —— 地圖上不畫，列表照常顯示。
window.tkCoord = function (t) {
  if (!t) return null;
  if (Array.isArray(t.coord) && t.coord.length === 2) return t.coord;
  const lm = t.landmark;
  if (lm && typeof lm.lat === "number" && typeof lm.lng === "number") return [lm.lat, lm.lng];
  const st = t._site;
  if (st && typeof st.lat === "number" && typeof st.lng === "number") return [st.lat, st.lng];
  if (typeof t.lat === "number" && typeof t.lng === "number") return [t.lat, t.lng];
  return null;
};
