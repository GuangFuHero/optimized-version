/* wg-bridge.js — 前台 ↔ 後台共用狀態橋接
 *
 * 為什麼需要這支：
 *   前台（前台地圖／前台列表）與後台（任務管理／成員管理／資源站點）是**五個獨立 HTML 檔**，
 *   沒有共用的 JS module scope。民眾在前台建立的任務單、按下的「接任務」，
 *   在原型裡只存在該頁的 React state，重整就消失，後台也永遠看不到。
 *
 * 做法沿用地端既有慣例，不發明新東西：
 *   - `wg-event.js` 用 localStorage ＋ CustomEvent 同步身份切換
 *   - `wg-notify.jsx` 用 localStorage 同步已讀狀態
 *   - `tk-app.jsx` 用 localStorage 存欄位設定
 *   本檔把同一套做法收成一個具名 API，讓前後台都吃同一份。
 *
 * ⚠️ 這是**原型層**的橋接。正式版走 GraphQL mutation ＋ subscription，
 *    localStorage 完全不存在。所有讀寫都包 try/catch，
 *    無痕視窗、封鎖站台資料的瀏覽器會安靜降級成「只在本頁有效」。
 *
 * 決策依據：
 *   2026-08-11  前台已登入民眾可承接任務（推翻 08-06／08-09「前台不能接任務」）
 *   2026-08-11  災情發生時由現場民眾在前台建立任務單
 *   2026-08-22  新增任務單需登入（與站點回報一致）；聯動採共用 localStorage store
 */
(function () {
  'use strict';

  var KEYS = {
    tickets: 'wg.bridge.siteTickets',   // 前台民眾建立的任務單
    /* ⚠️ 2026-09-04：承接從「以任務單為單位」改成「以需求為單位」，儲存的鍵也跟著換。
       舊鍵 `wg.bridge.taskMatches` 的每一列是 `ticketId → {matched, claimedBy…}`，
       **無法回推那個人接的是哪一筆需求** —— 一張單有兩筆需求時，那筆資料根本
       沒有記下答案。所以不做自動搬移：舊鍵原封不動留著（不刪，萬一要查），
       新鍵從零開始。原型的 demo 資料重按一次即可。
       正式版沒有這個問題 —— `task_assignments` 本來就是 per task。 */
    matches: 'wg.bridge.needMatches',   // 承接狀態，鍵為 `ticketId#taskId`（前台寫、後台讀）
    legacyMatches: 'wg.bridge.taskMatches',
    /* 🔴 2026-09-10 Sucre：「後台有通知功能，前台應該也要有。」
       **後端沒有任何通知相關的表**（ERD 27 張表裡一張都沒有，只有 `announcements`
       那張廣播用的）。後台 `wg-notify.jsx` 的通知也是原型自己用 localStorage 造的。
       所以這裡的形狀是原型自訂，不是接既有的東西 —— 正式版要開新表。 */
    notices: 'wg.bridge.siteNotices',   // 前台通知（收件人為 userId）
    /* 🔴 2026-09-11 Sucre：「建議修改的資源站點是否應該跟我的任務一樣，有個地方統一顯示？」
       在此之前站點修改建議只活在**該頁的 React state** —— 送出、一個 toast、然後消失，
       重整就沒了，提報的人永遠不知道審了沒。搬進 bridge 才有「紀錄」可言。
       ⚠️ 後端的 `station_update_suggestions` **仍然不存在**（2026-09-06 查證至今零筆），
          所以這一份是原型自有的，正式版要開表。 */
    stationReports: 'wg.bridge.stationReports',
    /* 角色升級申請（AC-FEAT-002）。2026-09-11 起前台「申請成為後台人員」真的會送出。
       ⚠️ 後端有 `user_role_assign` 可以存**結果**，但**沒有任何一張表存「申請」**
          （ERD grep `request`/`elevation`/`application` 零筆）—— 這一份是原型自有的。 */
    roleRequests: 'wg.bridge.roleRequests',
    /* 🔴 2026-09-12 Sucre 裁示：直立地圖（同址多樓層）。
       「後台輸入某地址他有幾樓幾戶，所以開啟這個表格，然後前台的人才能看到並且勾選。」

       ⚠️ **後端完全沒有建築這個東西。** ERD 裡 `tickets.uuid` 就是 `base_geometries.uuid`，
          而 `base_geometries ||--|| secondary_locations` 是 1:1 —— 也就是說一張單可以有
          自己的 floor/room（欄位確實存在），但**同一棟的多張單之間沒有任何共同上層實體**，
          沒有表、沒有欄位可以把它們綁在一起。這一份是原型自有的，正式版要開表。

       🔒 為什麼一定要後台先輸入「幾樓幾戶」：
          矩陣的價值在於**畫得出白格** —— 白格＝「這一戶存在，而且沒有任何求助單」。
          如果讓格子從已存在的單反推長出來，沒被撐到的範圍會看起來像「不存在」，
          而不是「沒消息」，使用者會把白格讀成「這戶沒事」。火災現場那是會害死人的誤讀。 */
    buildings: 'wg.bridge.buildings',
  };
  var EVENT = 'wg:bridge';

  /* 明確走 window.localStorage，不用裸的全域名字 ——
     裸名在非瀏覽器宿主（測試用的 jsdom、SSR）會解析到別的東西，
     然後被下面的 try/catch 安靜吞掉，變成「寫了但讀不到」的假象。 */
  function store() {
    return (typeof window !== 'undefined' && window.localStorage) || null;
  }
  function readRaw(key, fallback) {
    try {
      var st = store();
      if (!st) return fallback;
      var v = JSON.parse(st.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeRaw(key, value) {
    try {
      var st = store();
      if (st) st.setItem(key, JSON.stringify(value));
    } catch (e) { /* 無痕視窗：安靜降級 */ }
    // 同分頁靠 CustomEvent，跨分頁靠瀏覽器原生的 storage 事件（見 subscribe）
    try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: key } })); } catch (e) {}
  }

  /** 兩位數補零的當地時間標記，與 tk-data.js 的 createdAt 同格式（"06/13 06:58"）。 */
  function stamp(d) {
    var t = d || new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(t.getMonth() + 1) + '/' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }

  /* ── 任務單 ─────────────────────────────────────────────────────────────── */

  function readSiteTickets() {
    var list = readRaw(KEYS.tickets, []);
    return Array.isArray(list) ? list : [];
  }

  /** 前台建立一筆任務單。
   *  形狀刻意對齊 `tk-data.js` 的 `window.TK_TICKETS`，後台才不必做欄位轉換。
   *  `intake: 'citizen'` 是 `TK_INTAKE` 的既有 key（前台民眾報案），不是本次新造的。
   *
   *  ⚠️ `priority` 一律吃呼叫端傳進來的值，前台目前固定送 'medium' ——
   *     優先級由後台人員後續裁定（2026-08-22 Sucre：民眾不做優先級）。
   *  ⚠️ `tasks[].kind` 必須是 `TK_TASK_KIND` 的三個 key 之一：hr / supply / rescue。
   *     民眾語言 → 三值的映射發生在 `site-actions.jsx`，本檔只負責存。 */
  function createSiteTicket(input) {
    var now = new Date();
    var seq = readSiteTickets().length + 1;
    var lm = input.landmark || {};
    var rows = (input.tasks && input.tasks.length ? input.tasks : [{ kind: 'hr', name: '現場人力', quantity: 1 }]);
    var ticket = {
      id: 'T-9' + String(900 + seq).slice(-3),      // T-9xxx 保留給前台來源，避免與後台 mock 撞號
      title: input.title,
      county: '花蓮縣', city: input.region || '光復鄉',
      street: input.address || '', no: '', floor: input.floor || null,
      /* 直立地圖（2026-09-12）。`room` 對齊 ERD `secondary_locations.room`（欄位早就存在，
         只是前台從來沒寫過）。`buildingId` 是**原型自有**的，正式版沒有這個概念。
         兩者都可為 null —— 不知道自己在幾樓幾戶的人（代填的鄰居、不確定門牌的）
         仍然要能送出單，那張單會落到矩陣旁的「未定位」區。 */
      room: input.room || null,
      buildingId: input.buildingId || null,
      contact_name: input.contactName || '', contact_phone: input.contactPhone || '',
      priority: input.priority || 'medium',
      /* `pending` ＝ 待處理／待承接，**不是待審核**。任務單沒有審核閘門，
         建立後直接在線上等志工承接（2026-08-22 Sucre 更正）。 */
      status: 'pending',
      team: null,                                    // 歸屬單位由後台派工時指派，前台不問
      region: input.region || '光復鄉',
      intake: 'citizen',
      visibility: 'public', verification: null,
      createdAt: stamp(now), updatedMin: 0,
      desc: input.desc || '',
      fields: {},
      photos: [],
      tasks: rows.map(function (t, i) {
        return {
          id: 'K-' + seq + '-' + (i + 1),
          kind: t.kind, name: t.name,
          /* 未填就存 null（ERD `ticket_tasks.quantity` nullable）。
             不要 `|| 1` —— 那會把「不知道要幾個人」偽裝成「確定要 1 個」。 */
          quantity: (typeof t.quantity === 'number' && t.quantity > 0) ? t.quantity : null,
          status: 'pending', assignees: [],
          siteNeed: t.siteNeed || null,              // 民眾原始選的那一格，後台可看出原意
        };
      }),
      /* 前台專用欄位 —— 後台不讀，只給前台地圖／列表定位與顯示 */
      _site: {
        lat: lm.lat, lng: lm.lng, landmarkSource: lm.source || 'manual',
        createdBy: input.userId || null,
        /* 進度條要有分母，所以未填數量的需求先當 1 人估。
           ⚠️ 這是**前台顯示用的估值**，不是 `ticket_tasks.quantity` 本身 ——
              那一欄仍然誠實地存 null。 */
        requiredVolunteers: rows.reduce(function (n, t) {
          return n + ((typeof t.quantity === 'number' && t.quantity > 0) ? t.quantity : 1);
        }, 0),
        matchedVolunteers: 0,
        submittedAt: stamp(now),
        /* 排序要用的可比較時間戳。
           `createdAt` 是給人看的 "MM/DD HH:mm"，跨月會排錯、也無法與後端的 ISO 比較。
           顯示與排序用不同欄位，不要拿顯示字串去 sort。 */
        createdAtISO: now.toISOString(),
      },
    };
    var next = [ticket].concat(readSiteTickets());
    writeRaw(KEYS.tickets, next);
    return ticket;
  }

  /* ── 承接（接任務）─────────────────────────────────────────────────────────
   *
   * 🔒 2026-09-04 Sucre：**承接的單位是「需求」，不是「任務單」。**
   *    一張單可以有多筆需求（清淤人力 10 人 ＋ 飲用水 200 箱），志工接的是
   *    其中某一筆。先前整套 store 以 `ticketId` 為鍵，等於把兩筆需求併成一筆，
   *    畫面上也就沒有東西可以問「你要接哪一個」。
   *
   *    這與兩份既有文件本來就一致，是實作沒跟上：
   *      - 正典 `PUB-FEAT-001` `PUB-PS-140`：「一張任務單可有多筆需求。
   *        志工以『需求』為單位承接。」
   *      - ERD `task_assignments`：**UNIQUE(task_uuid, actor_uuid)**，
   *        主鍵那一半是 `ticket_tasks.uuid`，不是 `tickets.uuid`。
   *
   *    鍵的形狀 `ticketId#taskId` 只是原型用 localStorage 的權宜；
   *    正式版就是 `task_assignments` 的兩個外鍵，不需要組字串。
   */

  /** 承接紀錄的鍵。`taskId` 省略時退回任務單層（只給還沒改寫的舊呼叫點用）。 */
  function matchKey(ticketId, taskId) {
    return taskId ? (ticketId + '#' + taskId) : String(ticketId);
  }
  function splitMatchKey(key) {
    var i = String(key).indexOf('#');
    return i < 0 ? { ticketId: String(key), taskId: null }
                 : { ticketId: String(key).slice(0, i), taskId: String(key).slice(i + 1) };
  }

  function readTaskMatches() {
    var m = readRaw(KEYS.matches, {});
    return (m && typeof m === 'object') ? m : {};
  }
  /** 一張單底下所有需求的承接紀錄：`{ taskId: state }`。 */
  function readTicketMatches(ticketId) {
    var all = readTaskMatches();
    var out = {};
    Object.keys(all).forEach(function (k) {
      var p = splitMatchKey(k);
      if (p.ticketId === ticketId && p.taskId) out[p.taskId] = all[k];
    });
    return out;
  }
  function readTaskMatch(ticketId, taskId) {
    return readTaskMatches()[matchKey(ticketId, taskId)] || null;
  }
  function writeTaskMatch(ticketId, taskId, state) {
    var all = readTaskMatches();
    all[matchKey(ticketId, taskId)] = state;
    writeRaw(KEYS.matches, all);
    return state;
  }
  /** 一次寫多筆需求（刪除媒合單時要把整張單的需求一起關掉）。 */
  function writeTicketMatches(ticketId, byTaskId) {
    var all = readTaskMatches();
    Object.keys(byTaskId).forEach(function (taskId) {
      all[matchKey(ticketId, taskId)] = byTaskId[taskId];
    });
    writeRaw(KEYS.matches, all);
  }

  /* ── 前台通知 ───────────────────────────────────────────────────────────
   *
   * 🔒 2026-09-10 Sucre 裁示，**只有兩條，其他都不考慮**：
   *   ① 建立任務的人 —— 有人接了會收到通知，而且要知道**是誰**接的
   *   ② 承接任務的人 —— 那筆任務有異動也會通知他
   *
   * 為什麼是「只有兩條」而不是「先做兩條」：兩邊都是**對我個人的事**，
   * 不是廣播。廣播走的是緊急公告（C-2 已裁示公告不進收件匣，兩者不可混）。
   *
   * ⚠️ 收件人以 `to`（userId）過濾。原型沒有伺服器，所有人的通知都在同一份
   *    localStorage 裡 —— 這在正式版是**嚴重的隱私問題**，正式版必須由後端
   *    只回傳屬於當前使用者的那些。
   */
  function readNotices() {
    var list = readRaw(KEYS.notices, []);
    return Array.isArray(list) ? list : [];
  }
  /** 收件匣：只給某個人的，新到舊。 */
  function readNoticesFor(userId) {
    if (!userId) return [];
    return readNotices().filter(function (n) { return n.to === userId; });
  }
  /** 發一則通知。
   *  `dedupeKey` 相同的只留一則 —— 重整頁面或重複觸發不該長出第二則同樣的字。 */
  function pushNotice(notice) {
    if (!notice || !notice.to) return null;
    var all = readNotices();
    if (notice.dedupeKey && all.some(function (n) { return n.dedupeKey === notice.dedupeKey; })) return null;
    var row = {
      id: 'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      at: stamp(), atISO: new Date().toISOString(), read: false,
    };
    Object.keys(notice).forEach(function (k) { row[k] = notice[k]; });
    writeRaw(KEYS.notices, [row].concat(all));
    return row;
  }
  /** 標為已讀。不傳 ids 就是「全部標為已讀」（限該使用者）。 */
  function markNoticesRead(userId, ids) {
    var all = readNotices();
    var next = all.map(function (n) {
      if (n.to !== userId) return n;
      if (ids && ids.indexOf(n.id) === -1) return n;
      return Object.assign({}, n, { read: true });
    });
    writeRaw(KEYS.notices, next);
  }

  /* ── 站點修改建議 ───────────────────────────────────────────────────────
   *
   * 一筆＝一個欄位的修改提案（2026-08-21 決議：前台只做欄位級建議）。
   * `by` 是提報者，前台的「我回報的」只讀自己那些。
   * ⚠️ 與通知同一個問題：原型把所有人的都放在同一份 localStorage，
   *    正式版必須由後端只回自己的。
   */
  function readStationReports() {
    var list = readRaw(KEYS.stationReports, []);
    return Array.isArray(list) ? list : [];
  }
  function readStationReportsFor(userId) {
    if (!userId) return [];
    return readStationReports().filter(function (r) { return r.by === userId; });
  }
  function pushStationReport(record) {
    var all = readStationReports();
    if (record.dedupeKey && all.some(function (r) { return r.dedupeKey === record.dedupeKey; })) return null;
    var row = { id: 'rep-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      submittedAt: stamp(), submittedAtISO: new Date().toISOString(), review: 'pending' };
    Object.keys(record).forEach(function (k) { row[k] = record[k]; });
    writeRaw(KEYS.stationReports, [row].concat(all));
    return row;
  }

  /* ── 角色升級申請（AC-FEAT-002）──────────────────────────────────────────
   *
   * 🔒 `AC-RE-106`：**同時只能有一筆待審。** 這條由 `pendingRoleRequestFor`
   *    在送出前擋住 —— 不是靠畫面自律。
   * 🔒 `AC-RE-107`：被拒之後可以再送（2026-09-11 裁示：不設冷卻期）。
   */
  function readRoleRequests() {
    var list = readRaw(KEYS.roleRequests, []);
    return Array.isArray(list) ? list : [];
  }
  function readRoleRequestsFor(userId) {
    if (!userId) return [];
    return readRoleRequests().filter(function (r) { return r.by === userId; });
  }
  function pendingRoleRequestFor(userId) {
    return readRoleRequestsFor(userId).filter(function (r) { return r.status === 'pending'; })[0] || null;
  }
  function submitRoleRequest(input) {
    if (!input || !input.by) return null;
    if (pendingRoleRequestFor(input.by)) return null;      // AC-RE-106
    var row = {
      id: 'rr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      by: input.by, role: input.role, roleLabel: input.roleLabel,
      reason: input.reason || '', contact: input.contact || '',
      status: 'pending',
      submittedAt: stamp(), submittedAtISO: new Date().toISOString(),
      decidedAt: null, decidedNote: '',
    };
    writeRaw(KEYS.roleRequests, [row].concat(readRoleRequests()));
    return row;
  }
  /** 審核裁決。**目前沒有任何後台介面會呼叫它** —— 留著是為了讓通知那一段
   *  有真正的觸發點，而不是在畫面上假裝有流程在跑。原型可由 console 觸發。 */
  function decideRoleRequest(id, status, note) {
    var all = readRoleRequests();
    var hit = null;
    var next = all.map(function (r) {
      if (r.id !== id) return r;
      hit = Object.assign({}, r, { status: status, decidedAt: stamp(), decidedNote: note || '' });
      return hit;
    });
    if (!hit) return null;
    writeRaw(KEYS.roleRequests, next);
    /* 🔴 2026-09-11 Sucre：「審核結果成功前台要通知，失敗前台也要通知。」
       **這是對 2026-09-10「前台通知只有兩條，其他都不考慮」的明確覆蓋**，
       不是偷加第三種。理由見 site-notify.jsx 的 KIND_META 註解。 */
    pushNotice({
      to: hit.by,
      kind: status === 'approved' ? 'role-approved' : 'role-rejected',
      ticketId: null, taskId: null,
      title: status === 'approved'
        ? '你的「' + hit.roleLabel + '」申請通過了'
        : '你的「' + hit.roleLabel + '」申請沒有通過',
      body: status === 'approved'
        ? '右上角會出現「前往後台」，不需要重新登入。'
        : (hit.decidedNote || '你原本的權限沒有任何改變，可以再送一次申請。'),
      dedupeKey: 'role:' + hit.id + ':' + status,
    });
    return hit;
  }

  /* ── 訂閱 ───────────────────────────────────────────────────────────────── */

  /** 同頁與跨頁都會呼叫 fn。回傳解除訂閱函式。 */
  function subscribe(fn) {
    var onCustom = function () { fn(); };
    var onStorage = function (e) {
      if (!e.key || e.key === KEYS.tickets || e.key === KEYS.matches
        || e.key === KEYS.notices || e.key === KEYS.stationReports
        || e.key === KEYS.roleRequests || e.key === KEYS.buildings) fn();
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return function () {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }

  /** React hook：任何前台或後台元件都可用，橋接內容一變就重繪。 */
  function useBridgeVersion() {
    var R = window.React;
    var pair = R.useState(0);
    R.useEffect(function () { return subscribe(function () { pair[1](function (n) { return n + 1; }); }); }, []);
    return pair[0];
  }

  /* ══════════════════════════════════════════════════════════════════════
     建築結構（直立地圖）— 2026-09-12
     ══════════════════════════════════════════════════════════════════════ */

  /** 地址正規化，只為了「同一棟」比對用。
   *  做的事：去掉所有空白（含全形）、全形數字轉半形、英文小寫。
   *  **不做**斷詞、不做同義字 —— 「中正路２段120號」與「中正路二段 120 號」
   *  仍然算兩棟。這是刻意的：猜錯把兩棟併成一棟，比沒併更難發現。
   *  正式版應該用 `secondary_locations` 的結構化七欄比對，不是字串。 */
  function normalizeAddr(v) {
    var t = String(v == null ? '' : v);
    t = t.replace(/[\s\u3000]+/g, '');
    t = t.replace(/[\uFF10-\uFF19]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48);
    });
    return t.toLowerCase();
  }

  function readBuildings() {
    var list = readRaw(KEYS.buildings, null);
    if (!Array.isArray(list)) { list = seedBuildings(); writeRaw(KEYS.buildings, list); }
    return list;
  }

  function buildingById(id) {
    var all = readBuildings();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /** 某個地址有沒有開啟直立模式。沒開就回 null，呼叫端照原本的單張單流程走。 */
  function buildingForAddress(addr) {
    var key = normalizeAddr(addr);
    if (!key) return null;
    var all = readBuildings();
    for (var i = 0; i < all.length; i++) if (all[i].addrKey === key) return all[i];
    return null;
  }

  /** 格子的鍵。樓層用數字：地上 1,2,3…；地下 -1 是 B1、-2 是 B2。 */
  function cellKey(floor, unit) { return String(floor) + '-' + String(unit); }

  /** 由上而下的樓層順序。
   *  🔒 2026-09-12 裁示：**1 樓在上、往下遞增**，地下層排在 1 樓之上。
   *     （我原本建議「高樓層在上」的剖面隱喻已作廢 —— 那是從功能名字推的，
   *       不是從使用推的，而參考站台與一般表格習慣都是小數字在上。）
   *  排序規則就是樓層數字由小到大，所以 B2 會排在 B1 之上。
   *  ⚠️ 這一點與物理位置相反（B2 實際在 B1 下面），但換來「整欄由小到大」
   *     這條唯一的規則；若之後要改成 B1 在上，只改這個 sort。 */
  function buildingFloors(b) {
    var out = [], i;
    for (i = (b.floorsBelow || 0); i >= 1; i--) out.push(-i);
    for (i = 1; i <= (b.floorsAbove || 0); i++) out.push(i);
    return out;
  }
  function floorLabel(f) { return f < 0 ? 'B' + (-f) : String(f); }
  function unitLabel(u) { return String(u) + '室'; }

  /** 這一格存不存在。後台可以標掉（頂樓只有 4 戶、1 樓是店面）。
   *  🔒 「不存在」與「沒有求助單」**必須**是兩種不同的格子 ——
   *     一旦白格同時代表兩件事，「白格不等於安全」那條警告就寫不出來了。 */
  function isCellMissing(b, floor, unit) {
    var m = b && b.missingCells;
    return Array.isArray(m) && m.indexOf(cellKey(floor, unit)) !== -1;
  }

  function createBuilding(input) {
    var all = readBuildings();
    var addr = input.address || '';
    var row = {
      id: 'BLD-' + String(Date.now()).slice(-6) + '-' + (all.length + 1),
      address: addr,
      addrKey: normalizeAddr(addr),
      alias: input.alias || '',
      floorsAbove: Math.max(1, parseInt(input.floorsAbove, 10) || 1),
      floorsBelow: Math.max(0, parseInt(input.floorsBelow, 10) || 0),
      unitsPerFloor: Math.max(1, parseInt(input.unitsPerFloor, 10) || 1),
      missingCells: Array.isArray(input.missingCells) ? input.missingCells.slice() : [],
      lat: (typeof input.lat === 'number') ? input.lat : null,
      lng: (typeof input.lng === 'number') ? input.lng : null,
      /* TODO(2026-09-12)：哪個後台角色能開這個開關**尚未裁示**。
         現在誰按誰就是 createdBy，沒有任何權限檢查。 */
      createdBy: input.userId || null,
      createdAt: stamp(new Date()),
    };
    writeRaw(KEYS.buildings, [row].concat(all));
    return row;
  }

  function updateBuilding(id, patch) {
    var all = readBuildings();
    var next = all.map(function (b) {
      if (b.id !== id) return b;
      var m = {};
      for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) m[k] = b[k];
      for (var k2 in patch) if (Object.prototype.hasOwnProperty.call(patch, k2)) m[k2] = patch[k2];
      if (patch.address != null) m.addrKey = normalizeAddr(patch.address);
      return m;
    });
    writeRaw(KEYS.buildings, next);
    return buildingById(id);
  }

  /** 切換某一格「存在／不存在」。 */
  function toggleCellMissing(id, floor, unit) {
    var b = buildingById(id);
    if (!b) return null;
    var key = cellKey(floor, unit);
    var m = Array.isArray(b.missingCells) ? b.missingCells.slice() : [];
    var at = m.indexOf(key);
    if (at === -1) m.push(key); else m.splice(at, 1);
    return updateBuilding(id, { missingCells: m });
  }

  /** 🚨 種子建築：**這一棟是編的**，花蓮光復鄉沒有這個地址，不得對外使用。
   *  存在的理由：現有 10 筆 mock 任務單全是低矮鄉村地址（堤防、國小、部落屋頂），
   *  沒有任何一筆能示範「一個地址多層樓多戶」。不編一棟就看不到這個功能。 */
  function seedBuildings() {
    return [{
      id: 'BLD-DEMO-1',
      address: '花蓮縣光復鄉中正路二段 120 號',
      addrKey: normalizeAddr('花蓮縣光復鄉中正路二段 120 號'),
      alias: '中正路社區大樓',
      floorsAbove: 12,
      floorsBelow: 1,
      unitsPerFloor: 6,
      /* 頂樓兩戶打通、B1 只有 2 格是車位以外的空間 —— 都是編的，只為了讓
         「不存在的格子」在畫面上真的出現，否則永遠測不到那個狀態。 */
      missingCells: ['12-5', '12-6', '-1-3', '-1-4', '-1-5', '-1-6'],
      lat: 23.6675, lng: 121.4223,
      createdBy: null,
      createdAt: stamp(new Date()),
    }];
  }

  /** 清空（給 demo 重置用）。 */
  function reset() {
    writeRaw(KEYS.tickets, []);
    writeRaw(KEYS.matches, {});
    writeRaw(KEYS.notices, []);
    writeRaw(KEYS.stationReports, []);
    writeRaw(KEYS.roleRequests, []);
    writeRaw(KEYS.buildings, seedBuildings());
  }

  window.WGBridge = {
    KEYS: KEYS, EVENT: EVENT, stamp: stamp,
    readSiteTickets: readSiteTickets, createSiteTicket: createSiteTicket,
    readTaskMatches: readTaskMatches, readTaskMatch: readTaskMatch, writeTaskMatch: writeTaskMatch,
    readTicketMatches: readTicketMatches, writeTicketMatches: writeTicketMatches,
    matchKey: matchKey, splitMatchKey: splitMatchKey,
    readNotices: readNotices, readNoticesFor: readNoticesFor, pushNotice: pushNotice, markNoticesRead: markNoticesRead,
    readStationReports: readStationReports, readStationReportsFor: readStationReportsFor, pushStationReport: pushStationReport,
    readRoleRequests: readRoleRequests, readRoleRequestsFor: readRoleRequestsFor,
    pendingRoleRequestFor: pendingRoleRequestFor, submitRoleRequest: submitRoleRequest, decideRoleRequest: decideRoleRequest,
    normalizeAddr: normalizeAddr,
    readBuildings: readBuildings, buildingById: buildingById, buildingForAddress: buildingForAddress,
    createBuilding: createBuilding, updateBuilding: updateBuilding, toggleCellMissing: toggleCellMissing,
    cellKey: cellKey, buildingFloors: buildingFloors, floorLabel: floorLabel, unitLabel: unitLabel,
    isCellMissing: isCellMissing,
    subscribe: subscribe, useBridgeVersion: useBridgeVersion, reset: reset,
  };
})();
