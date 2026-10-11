// map-data.js — 互助地圖（MAP-FEAT-002 責任區與危險區）原型資料層與幾何運算
//
// 正典對應：Spec/product-areas/map-decision-support/features/MAP-FEAT-002-zone-drawing-and-effects
//   feature.md（2026-08-27 以 WebFetch 讀過原文）已定義 AC-01〜AC-09、Q1〜Q6。
//   本原型只實作 Sucre 2026-08-27 指定的範圍：**手繪多邊形 ＋ 責任區批次指派**。
//
// ⚠️ 後端對應（2026-08-27 讀 er-diagram.md 原文）：
//   work_zones(uuid, name, geometry MultiPolygon SRID 4326, created_by, created_at, updated_at, delete_at)
//   team_zone_assign(uuid, team_uuid, zone_uuid, UNIQUE(team_uuid, zone_uuid))
//   → **責任區在後端是既有的實體，不是 2026-08-16 被移除的 `regions`。**
//     那次移除的是「事件層的影響區域字串」，兩者不同，此處不推翻該裁示。
//
// 🚨 以下是我（Claude）自己編的，正典與程式碼裡沒有，交付前請複核：
//   - 所有座標、村里邊界、任務單筆數、站點位置（`MAP_COORDS` / `MAP_ZONES` / `MAP_STATIONS`）
//   - `zone.kind` 兩值（assign / hazard）是把 feature.md 的 Assignment Zone / Hazard Zone
//     直接譯成資料欄位，正典沒有給欄位名
//   - `zone.status` 三值（draft / active / expired）為我補的狀態機，正典只講 Hazard 24h 到期
//
// 🔴 2026-09-25 Sucre 四點（本檔對應的部分）：
//   ① 指派對象＝全部團隊（政府＋非政府組織），**只列啟用中、依類型分組** → `TEAMS` 改讀 `MM_TEAMS`
//   ② 區域預設只在後台可見，可勾「前台可見」→ `zone.publicVisible`；**危險區預設勾**（`mapDefaultPublic`）
//   ③ 責任區的責任單位是**選填** —— 志工休息區這種非危險、不派工的區域也用責任區畫，不另開類型
//   ⑥ 🔒 2026-09-27 Sucre：區域分**三種**（推翻 09-25 ③「責任區單位選填」）
//      hazard 危險區（橘白斜紋，不派單位）／assign 責任區（**單位必填**）／mark 標示區（不派單位，例：志工休息區）
//      理由：以「完全沒用過或很久才用一次」的人來看，先選「我要做什麼」比組合選項好懂；
//      而且「責任區」這個名字本來就讓人以為一定要派 —— 那就讓它真的一定要派，不派的另外叫標示區。
//   ⑤ 2026-09-26 Sucre：「沒有辦法做到 24 小時到期就關閉」→ 危險區**不自動到期**，由人按「解除危險區」
//      （正典 AC-06 的 24 小時到期因此不做，需回頭改正典）
//   ④ 危險區固定橘白斜紋（js/shared/wg-hazard.js），不參與 `ZONE_COLORS` 輪替
//   🚨 `publicVisible` 欄位名是我取的；後端 `work_zones` 沒有這個欄位
(function () {

  // ── 幾何 ────────────────────────────────────────────────────────────────
  // 多邊形以 [lat, lng] 陣列表示（Leaflet 慣例）。送後端前要轉成 GeoJSON 的 [lng, lat]。

  /** 射線法。邊界上視為在內（災防場景寧可多框一張單，也不要漏一張）。 */
  function pointInPolygon(pt, ring) {
    const [y, x] = pt;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i], [yj, xj] = ring[j];
      const hit = (xi > x) !== (xj > x) && y < ((yj - yi) * (x - xi)) / (xj - xi) + yi;
      if (hit) inside = !inside;
    }
    return inside;
  }

  function segIntersect(p1, p2, p3, p4) {
    const d = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /** AC-08：自我相交的多邊形要被拒絕，不是默默存進去。 */
  function selfIntersects(ring) {
    const n = ring.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
        if (segIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  function centroid(ring) {
    const s = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    return [s[0] / ring.length, s[1] / ring.length];
  }

  /** 粗略面積（km²）。等距圓柱投影，光復鄉這個緯度誤差可接受，只用於顯示。 */
  function areaKm2(ring) {
    const latRad = (centroid(ring)[0] * Math.PI) / 180;
    const kx = 111.32 * Math.cos(latRad), ky = 110.57;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][1] * kx) * (ring[i][0] * ky) - (ring[i][1] * kx) * (ring[j][0] * ky);
    }
    return Math.abs(a / 2);
  }

  // ── 場景座標 ──────────────────────────────────────────────────────────────
  // 情境沿用 tk-data.js：2026 花蓮光復 馬太鞍溪堰塞湖溢流。
  // 🚨 全部是我編的示範座標，正式版由後端 geocoding 提供。
  const CENTER = [23.6725, 121.4235];

  // tk-map.jsx 既有的七點，維持同一組座標以免兩頁對不起來
  const BASE_COORDS = {
    "T-1042": [23.6760, 121.4205], "T-1067": [23.6748, 121.4218], "T-1071": [23.6640, 121.4290],
    "T-1080": [23.7455, 121.4520], "T-1085": [23.7448, 121.4535], "T-1078": [23.6699, 121.4238],
    "T-1090": [23.6672, 121.4262],
  };

  // 村里（🚨 邊界為我畫的示意多邊形，不是實際村里界；Q1「是否預載行政區界」未裁示）
  const VILLAGES = {
    大平村: [[23.6800, 121.4150], [23.6805, 121.4290], [23.6690, 121.4300], [23.6680, 121.4160]],
    大同村: [[23.6690, 121.4180], [23.6688, 121.4320], [23.6580, 121.4330], [23.6578, 121.4190]],
    北富村: [[23.7500, 121.4450], [23.7505, 121.4600], [23.7390, 121.4610], [23.7385, 121.4460]],
  };

  const STREETS = ["中山路", "中正路", "林森路", "大進街", "糖廠街", "自強路", "民族街"];
  const PRIORITIES = ["critical", "high", "medium", "medium", "low"];
  const KINDS = [["hr", "清淤人力"], ["supply", "飲用水"], ["hr", "送餐志工"], ["supply", "毛毯"], ["rescue", "破拆搜救人力"]];

  /** 在多邊形的 bounding box 內灑點，落在多邊形外就重抽。固定種子，每次開頁一樣。 */
  function seeded(n) { let s = n; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

  function synthesize() {
    const rnd = seeded(20260827);
    const out = [];
    let n = 1100;
    Object.entries(VILLAGES).forEach(([village, ring]) => {
      const lats = ring.map((p) => p[0]), lngs = ring.map((p) => p[1]);
      // 數量刻意讓「一次框住兩個村」會超過 MAP_HIGH_VOLUME(100)，才示範得出 AC-02 的高量警示
      const count = village === "北富村" ? 22 : 48;
      for (let i = 0; i < count; i++) {
        let p = null;
        for (let k = 0; k < 60 && !p; k++) {
          const c = [lats[3] + rnd() * (lats[0] - lats[3]), lngs[0] + rnd() * (lngs[1] - lngs[0])];
          if (pointInPolygon(c, ring)) p = c;
        }
        if (!p) continue;
        const id = "T-" + (++n);
        const [kind, name] = KINDS[Math.floor(rnd() * KINDS.length)];
        const pri = PRIORITIES[Math.floor(rnd() * PRIORITIES.length)];
        // 三成先給團隊，用來示範 AC-07「已指派者被後畫的責任區覆蓋」
        const team = rnd() < 0.3 ? ["壯闊台灣", "慈濟基金會", "中華民國紅十字會"][Math.floor(rnd() * 3)] : null;
        out.push({
          id, title: `${STREETS[Math.floor(rnd() * STREETS.length)]}${Math.floor(rnd() * 200) + 1}號 ${name}需求`,
          county: "花蓮縣", city: "光復鄉", region: `光復鄉 ${village}`,
          priority: pri, status: team ? "in_progress" : "pending", team,
          coord: p, synthetic: true,
          tasks: [{ id: `${id}-K1`, kind, name, quantity: Math.floor(rnd() * 8) + 1, status: team ? "in_progress" : "pending", assignees: [] }],
        });
      }
    });
    return out;
  }

  /** 把 tk-data.js 的七張正式假單與合成單合成一份地圖用清單。 */
  function buildTickets() {
    const real = (window.TK_TICKETS || []).map((t) => ({ ...t, coord: BASE_COORDS[t.id] || null }))
      .filter((t) => t.coord);
    return real.concat(synthesize());
  }

  // ── 責任區 ────────────────────────────────────────────────────────────────
  // 🚨 這兩筆是我編的初始資料。「拉框大平村批次指派 47 筆給慈濟基金會」這個動作
  //    在 tk-data.js 的 TK_HISTORY 裡已經存在（2026-06-12 吳政憲），此處沿用同一個情境。
  const INITIAL_ZONES = [
    {
      id: "Z-01", kind: "assign", name: "光復鄉 大平村", ring: VILLAGES.大平村,
      team: "慈濟基金會", note: "堰塞湖溢流主要淹沒帶，以清淤與送餐為主。",
      status: "active", createdBy: "吳政憲", createdAt: "06/12 11:25", color: "#4338CA",
    },
    {
      // 🚨 09-27 起責任區單位必填，原本「尚未指派」的示範改派給台灣世界展望會（我選的）
      id: "Z-02", kind: "assign", name: "光復鄉 大同村", ring: VILLAGES.大同村,
      team: "台灣世界展望會", note: "以物資發放與長者關懷為主。",
      status: "active", createdBy: "吳政憲", createdAt: "06/12 11:40", color: "#7E22CE",
    },
    // 🚨 2026-09-25 補的兩筆示範（名稱與範圍都是我編的）：
    //    一筆「不指派、前台可見」的責任區，示範志工休息區這種用法；一筆危險區，示範橘白斜紋。
    {
      id: "Z-03", kind: "mark", name: "糖廠志工休息區", ring: [[23.6712, 121.4232], [23.6713, 121.4256], [23.6697, 121.4257], [23.6696, 121.4233]],
      team: null, note: "飲水、廁所、陰涼處。請勿在此停放車輛。",
      status: "active", createdBy: "吳政憲", createdAt: "06/12 13:05", color: "#15803D", publicVisible: true,
    },
    {
      id: "Z-04", kind: "hazard", name: "馬太鞍溪堤防潰口", ring: [[23.6632, 121.4262], [23.6636, 121.4310], [23.6606, 121.4318], [23.6600, 121.4270]],
      team: null, note: "堤防缺口持續擴大，禁止進入。",
      status: "active", createdBy: "吳政憲", createdAt: "06/12 14:20", color: "#E65100", publicVisible: true,
    },
  ].map((z) => ({ publicVisible: false, ...z }));

  /** 新區域的「前台可見」預設值。危險區預設勾 —— 危險資訊要讓民眾與志工看到（2026-09-25 Sucre）。 */
  function defaultPublic(kind) { return kind === "hazard"; }

  /** 三種區域的名稱、說明與例子（表單卡片、清單分組、細節徽章共用一份）。 */
  const ZONE_KINDS = [
    { value: "hazard", label: "危險區", hint: "提醒大家不要進入", example: "例：堤防潰口、土石流警戒" },
    { value: "assign", label: "責任區", hint: "交給一個單位負責，區內任務單歸他", example: "例：大平村交給慈濟基金會" },
    { value: "mark",   label: "標示區", hint: "只標出位置，不派單位", example: "例：志工休息區、集合點、物資集散點" },
  ];
  function kindLabel(k) { const d = ZONE_KINDS.find((x) => x.value === k); return d ? d.label : k; }

  /** 寫給前台的形狀：只有前台需要的欄位。**不含責任單位**（那是後台的派工資訊）。 */
  function toPublicZone(z) {
    return { id: z.id, kind: z.kind, name: z.name, ring: z.ring, color: z.color, note: z.note || "" };
  }

  // ── 資源站點 ──────────────────────────────────────────────────────────────
  // 用途類型**照抄正典**：`libs/modules/src/station/type-options.ts`，
  // 前台 `js/site/site-route.js` 的 `STATION_TYPE_OPTIONS` 就是同一份（11 值）。
  // ⚠️ 不要在這裡自己加類型 —— 前後台對不起來的來源就是各寫各的。
  const STATION_TYPES = [
    { value: "water",       label: "加水", icon: "Droplets" },
    { value: "shelter",     label: "避難", icon: "Tent" },
    { value: "shower",      label: "洗澡", icon: "ShowerHead" },
    { value: "toilet",      label: "廁所", icon: "Toilet" },
    { value: "transport",   label: "交通", icon: "Bus" },
    { value: "medical",     label: "醫療", icon: "HeartPulse" },
    { value: "supply",      label: "物資", icon: "Package" },
    { value: "gas_station", label: "加油", icon: "Fuel" },
    { value: "charge",      label: "充電", icon: "BatteryCharging" },
    { value: "power",       label: "發電", icon: "Zap" },
    { value: "cellular",    label: "通訊", icon: "RadioTower" },
  ];

  // 🚨 站點的名稱與座標是我編的示範資料，非真實站點。類型值本身照正典。
  const STATIONS = [
    { id: "S-1",  name: "光復國小 收容所",     type: "shelter",     coord: [23.6742, 121.4231], isOfficial: true },
    { id: "S-2",  name: "花蓮糖廠 物資集散",   type: "supply",      coord: [23.6702, 121.4248], isOfficial: true },
    { id: "S-3",  name: "大同村活動中心 淋浴站", type: "shower",     coord: [23.6640, 121.4255], isOfficial: false },
    { id: "S-4",  name: "北富村 醫療站",       type: "medical",     coord: [23.7440, 121.4520], isOfficial: true },
    { id: "S-5",  name: "中山路口 加水站",     type: "water",       coord: [23.6768, 121.4222], isOfficial: true },
    { id: "S-6",  name: "糖廠停車場 流動廁所", type: "toilet",      coord: [23.6714, 121.4262], isOfficial: false },
    { id: "S-7",  name: "光復火車站 接駁點",   type: "transport",   coord: [23.6690, 121.4205], isOfficial: true },
    { id: "S-8",  name: "大平村 發電機集中點", type: "power",       coord: [23.6752, 121.4188], isOfficial: false },
    { id: "S-9",  name: "活動中心 充電站",     type: "charge",      coord: [23.6636, 121.4228], isOfficial: false },
    { id: "S-10", name: "馬太鞍橋頭 加油站",   type: "gas_station", coord: [23.6618, 121.4290], isOfficial: true },
    { id: "S-11", name: "大同村 臨時基地台",   type: "cellular",    coord: [23.6660, 121.4300], isOfficial: true },
    { id: "S-12", name: "北富村活動中心 避難所", type: "shelter",   coord: [23.7462, 121.4552], isOfficial: true },
    { id: "S-13", name: "北富村 物資轉運",     type: "supply",      coord: [23.7420, 121.4576], isOfficial: false },
    { id: "S-14", name: "大平村 加水點（民間）", type: "water",     coord: [23.6712, 121.4172], isOfficial: false },
  ];

  // 🔴 2026-09-26：區域色**整組避開任務單的優先級色**（紅 #D32F2F／橘 #F57C00／藍 #2592B9／灰 #64748B）
  //    與危險區的橘。原本第一色 #2592B9 跟「一般」優先級的藍一模一樣，區域和單混成一片。
  //    改用靛、紫、綠、洋紅、深青、石板 —— 都夠深，當粗邊線時在淡色底圖上看得清楚。
  const ZONE_COLORS = ["#4338CA", "#7E22CE", "#15803D", "#BE185D", "#0F766E", "#475569"];

  // 可指派的單位（2026-09-25 Sucre：全部團隊，含政府與非政府組織）。
  //   讀成員管理的 `MM_TEAMS`（正式版讀 teams 表），**只列 status === "active"** ——
  //   停權與已解散的隊伍不出現（不是反灰：乾淨切，同 08-17 D-3）。
  //   順序：政府在前、非政府組織在後，下拉選單依此分組。
  //   `MM_TEAMS` 沒載到時退回舊的四隊，免得頁面空掉。
  const TYPE_ORDER = ["gov", "ngo"];
  const TEAMS = (window.MM_TEAMS && window.MM_TEAMS.length
    ? window.MM_TEAMS.filter((t) => t.status === "active").map((t) => ({ name: t.name, type: t.type }))
    : [
      { name: "壯闊台灣", type: "ngo" },
      { name: "慈濟基金會", type: "ngo" },
      { name: "中華民國紅十字會", type: "ngo" },
      { name: "花蓮縣政府災防辦", type: "gov" },
    ]).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

  /** 下拉選單用：[{ type, label, teams: [...] }]，空的組不出現。 */
  function teamGroups(list) {
    return TYPE_ORDER.map((type) => ({
      type,
      label: window.wgTeamTypeLabel ? window.wgTeamTypeLabel(type) : type,
      teams: (list || TEAMS).filter((t) => t.type === type),
    })).filter((g) => g.teams.length);
  }

  /** AC-02 的即時預覽：算出多邊形內的任務單與站點。 */
  function insideZone(ring, tickets, stations) {
    const t = (tickets || []).filter((x) => x.coord && pointInPolygon(x.coord, ring));
    const s = (stations || []).filter((x) => pointInPolygon(x.coord, ring));
    return { tickets: t, stations: s };
  }

  /** 指派前的分項：未指派／已指派他隊（AC-07 要警示的那一群）／已在本隊。 */
  function splitByAssignment(tickets, team) {
    return {
      unassigned: tickets.filter((t) => !t.team),
      others: tickets.filter((t) => t.team && t.team !== team),
      already: tickets.filter((t) => t.team === team),
    };
  }

  // ── 篩選 ──────────────────────────────────────────────────────────────────
  // 🔒 篩選是**看的方式，不是選的方式**（2026-08-27 Sucre 裁示）。
  //    區域的計數與批次指派一律吃完整清單，不吃篩選結果 —— 見 MAP-ZD-128。
  const DEFAULT_FILTERS = {
    layers: { tickets: true, stations: true, zones: true },
    priority: [],                 // 空＝全部
    status: [],                   // 空＝全部
    assign: "all",                // all | assigned | unassigned
    stationTypes: [],             // 空＝全部
  };

  function filterTickets(list, f) {
    if (!f) return list;
    return list.filter((t) => {
      if (f.priority.length && f.priority.indexOf(t.priority) < 0) return false;
      const st = window.tkStatus ? window.tkStatus(t) : t.status;
      if (f.status.length && f.status.indexOf(st) < 0) return false;
      if (f.assign === "assigned" && !t.team) return false;
      if (f.assign === "unassigned" && t.team) return false;
      return true;
    });
  }

  function filterStations(list, f) {
    if (!f || !f.stationTypes.length) return list;
    return list.filter((s) => f.stationTypes.indexOf(s.type) >= 0);
  }

  /**
   * 編輯邊界的影響（正典 Q4，2026-08-27 Sucre 裁示為「維持原指派＋標記待複核」）。
   *   movedOut  原本在區內、屬於本區責任單位，改完之後掉到區外 → 不動歸屬，掛待複核
   *   movedIn   原本在區外、改完之後進到區內且未指派 → 指派給本區責任單位
   */
  function zoneEditDiff(oldRing, newRing, list, team) {
    const wasIn = new Set(list.filter((t) => t.coord && pointInPolygon(t.coord, oldRing)).map((t) => t.id));
    const nowIn = new Set(list.filter((t) => t.coord && pointInPolygon(t.coord, newRing)).map((t) => t.id));
    return {
      movedOut: list.filter((t) => wasIn.has(t.id) && !nowIn.has(t.id) && team && t.team === team),
      movedIn: list.filter((t) => !wasIn.has(t.id) && nowIn.has(t.id) && !t.team),
      stillIn: list.filter((t) => nowIn.has(t.id)),
    };
  }

  Object.assign(window, {
    MAP_CENTER: CENTER,
    MAP_STATION_TYPES: STATION_TYPES,
    MAP_DEFAULT_FILTERS: DEFAULT_FILTERS,
    mapFilterTickets: filterTickets,
    mapFilterStations: filterStations,
    mapZoneEditDiff: zoneEditDiff,
    MAP_VILLAGES: VILLAGES,
    MAP_STATIONS: STATIONS,
    MAP_TEAMS: TEAMS,
    MAP_ZONE_COLORS: ZONE_COLORS,
    MAP_INITIAL_ZONES: INITIAL_ZONES,
    mapTeamGroups: teamGroups,
    mapDefaultPublic: defaultPublic,
    MAP_ZONE_KINDS: ZONE_KINDS,
    mapKindLabel: kindLabel,
    mapToPublicZone: toPublicZone,
    mapBuildTickets: buildTickets,
    mapPointInPolygon: pointInPolygon,
    mapSelfIntersects: selfIntersects,
    mapCentroid: centroid,
    mapAreaKm2: areaKm2,
    mapInsideZone: insideZone,
    mapSplitByAssignment: splitByAssignment,
    // AC-02 的高量警示門檻。正典寫死 100。
    MAP_HIGH_VOLUME: 100,
    // AC-03 的可復原視窗（秒）。正典寫死 5。
    MAP_UNDO_SECONDS: 5,
  });
})();
