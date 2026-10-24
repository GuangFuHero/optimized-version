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
// 🧹 2026-10-16：**示範區域、合成任務單（約 120 張）、示範站點、示意村里邊界已全部移除**。
//    地圖一開是空的；任務單讀 TK_TICKETS（含前台報案），區域由使用者圈選。
//
// 🚨 以下是設計端定的，正典沒有，實作前請複核：
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

  // ── 預設視野 ──────────────────────────────────────────────────────────
  // 地圖上什麼都沒有時的中心點（花蓮縣光復鄉）。正式版改讀 project_settings 的事件中心點。
  const CENTER = [23.6725, 121.4235];

  /** 地圖用的任務單清單：tk-data.js 的 TK_TICKETS（已併入前台報案），座標由 tkCoord 取。
   *  沒有座標的單不上地圖（區域計數也算不到它），列表頁照常看得到。 */
  function buildTickets() {
    return (window.TK_TICKETS || [])
      .map((t) => ({ ...t, coord: window.tkCoord ? window.tkCoord(t) : null }))
      .filter((t) => t.coord);
  }

  // ── 區域 ──────────────────────────────────────────────────────────────
  // 🧹 空陣列。一筆區域的形狀：
  //   { id, kind: hazard|assign|mark, name, ring: [[lat,lng]…], team, note,
  //     status: active|expired, createdBy, createdAt, color, publicVisible }
  // 正式版：work_zones（geometry MultiPolygon）＋ team_zone_assign。
  const INITIAL_ZONES = [];

  /** 新區域的「前台可見」預設值。危險區預設勾 —— 危險資訊要讓民眾與志工看到（2026-09-25 Sucre）。 */
  function defaultPublic(kind) { return kind === "hazard"; }

  /** 三種區域的名稱、說明與例子（表單卡片、清單分組、細節徽章共用一份）。 */
  const ZONE_KINDS = [
    { value: "hazard", label: "危險區", hint: "提醒大家不要進入", example: "例：堤防潰口、土石流警戒" },
    { value: "assign", label: "責任區", hint: "交給一個單位負責，區內任務單歸他", example: "例：大平村交給慈濟基金會" },
    { value: "mark",   label: "標示區", hint: "只標出位置，不派單位", example: "例：志工休息區、集合點、物資集散點" },
  ];
  function kindLabel(k) { const d = ZONE_KINDS.find((x) => x.value === k); return d ? d.label : k; }

  /** 寫給前台的形狀：只有前台需要的欄位。責任區帶 team（🔄 2026-10-23 PM 裁示（照後端 ADR-311 10-11 修訂）：責任區前後台都公布被指派的單位）。
   *  ❌ 不帶區內任務單歸屬（那仍是後台的派工資訊）。 */
  function toPublicZone(z) {
    // 🔒 不帶 color：後端沒有這個欄位，前台照類型用 wgZoneColor(kind)（ZONE-COLOR-102）
    return { id: z.id, kind: z.kind, name: z.name, ring: z.ring, note: z.note || "",
      ...(z.kind === "assign" && z.team ? { team: z.team } : null) };
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

  // 🧹 示範站點已移除。正式版讀 GraphQL `stations`（與資源站點管理同一份），
  //    轉成 { id, name, type, coord: [lat, lng], isOfficial }。
  const STATIONS = [];

  // 🔴 2026-09-26：區域色**整組避開任務單的優先級色**（紅 #D32F2F／橘 #F57C00／藍 #2592B9／灰 #64748B）
  //    與危險區的橘。原本第一色 #2592B9 跟「一般」優先級的藍一模一樣，區域和單混成一片。
  //    改用靛、紫、綠、洋紅、深青、石板 —— 都夠深，當粗邊線時在淡色底圖上看得清楚。
  //    🔒 10-23 起區域顏色照類型固定（js/shared/wg-hazard.js 的 wgZoneColor），這組只剩舊程式參考。
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

/* 🔒 ZONE-NAME-101（2026-10-24）區域名稱上限 10 個字（Unicode 字元數）。前台 site-map.jsx 的 ZONE_NAME_MAX 同值。
   ⚠️ 後端 work_zones.name 是 varchar(100)，目前只有前端擋。 */
window.MAP_ZONE_NAME_MAX = 10;
window.mapZoneNameCount = function (s) { return [...String(s || "")].length; };
