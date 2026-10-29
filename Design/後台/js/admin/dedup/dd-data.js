/* dd-data.js — 重複審核：資料層（欄位、權限、合併後果）
 *
 * 規則整理與後端對照：docs/重複審核.md（先讀那份）
 * 後端：main 的 Backend/Spec/025-dedup-review-queue（判定）、028-dedup-resolve（合併：POST /admin/duplicate-pairs/{uuid}/resolve）
 * 記號：🔒 已裁示 · 🚨 設計端先定，可以再談 · ⚠️ 後端還沒有
 *
 * ── 這頁在做什麼 ─────────────────────────────────────────────
 *   DUP-BE-420 🔒 一次處理一對（兩張任務單或兩個站點），同後端的配對卡
 *   DUP-BE-424 🔒 站點這一版不能合併（後端 ADR-377：站點卡 resolve 回 422），只能「確認重複」或「不是重複」，都不動站點
 *   DUP-BE-425 🔒 同一張單上的兩筆需求不會出現在佇列（後端回 422）
 *
 * ── 合併任務單（使用者看到的是「兩張合成一張」）──────────────
 *   DUP-BE-430 🔒 畫面上**不出現**「保留哪一張」「整張取消」「搬到 A」。使用者只關心合併後那張單對不對：
 *                · 每個欄位挑一個值（標題、描述、聯絡人、優先級、地址、災害欄位、重複那筆需求的各欄）
 *                · 兩張單上的其他需求、照片全部列成勾選；勾的放進合併後的單，沒勾的取消。預設全勾
 *   DUP-BE-431 🔒 後端一定要 primary（主要單），**前端自己決定，不給使用者看**：
 *                · 後端這一版不能改地址（ADR-367）→ **使用者挑哪一張的地址，那一張就是 primary**
 *                · 兩張地址一樣 → 重複那筆需求有志工承接的那張，其次最早建立的（ddPrimary）
 *                送出時轉成 resolve 的 request：
 *                  primary 的其他需求  勾＝keep  ／沒勾＝cancel
 *                  另一張的其他需求    勾＝move  ／沒勾＝cancel
 *                  另一張的重複需求    一定 absorb 進 primary 的重複需求
 *                  照片               勾＝keep  ／沒勾＝cancel
 *                  ticket 欄位、values（task_name、quantity…）、disaster_details 帶使用者挑的值
 *                另一張單由後端整張取消（ADR-371）
 *   DUP-BE-410 🔒 欄位**有什麼列什麼，不可以寫死**（見 ddFieldsFor）。兩張都沒填的欄位不列
 *   DUP-BE-432 🔒 比對畫面分左右：左邊「比對」（A、B 並排，點一格＝把這個值帶到右邊）、右邊「合併後的任務單」。
 *                右邊每一格都可以**直接改**（地址、需求種類除外：後端這一版不能改地址 ADR-367；只能併同類型 ADR-370）。
 *                改過的標「已修改」，可以「還原」回左邊選的值。取代 DUP-BE-404「只能挑」與 DUP-BE-422「數量另外一列自己填」。
 *                理由：比對後可能發現兩邊都不對，或審核員有系統外的消息（電話、現場），出來的單要符合真實情況；
 *                合併完再去任務管理找那張單改更不合理。**沒有「修改原因」欄**（後端只有整筆的 note，DUP-BE-427）
 *                數量仍不能少於合併後的承接人數（ADR-370）、搜救以外不能空，不符就擋下
 *   DUP-BE-423 🔒 兩邊已承接的志工都留在合併後的需求繼續承接（ADR-369），不是釋出
 *   DUP-BE-427 🔒 送出時可以寫備註（選填，≤1000 字，後端 note）
 *
 * ── 送出 ───────────────────────────────────────────────────
 *   DUP-BE-401 🔒 送出後不能復原、不能拆回（ADR-376），沒有「五秒反悔」
 *   DUP-BE-402 🔒 按「合併」「不是重複」「確認重複」都先跳確認視窗，按「確認…，送出」才寫入
 *   DUP-BE-413 🔒 送出前看得到合併後那張單：就是比對畫面右邊那一半，一直都在（DUP-BE-432）；確認視窗只列送出後會發生什麼
 *   🔒 打開後有一張被改過 → 送出時擋下、請使用者重新載入（後端 expected_versions 對不上回 409，ADR-374）
 *   ⚠️ 待審期間被改到不像了 → 自動移出佇列，在「已處理」標「內容變更，自動移出」（後端還沒有這個機制）
 *
 * ── 清單 ───────────────────────────────────────────────────
 *   DUP-BE-411 🔒 不顯示「來源」、不能用來源篩選（對判斷沒有幫助）。g.source 只用來決定「不是重複」要不要通知當初選仍要建立的人
 *   DUP-BE-412 🔒 兩張依建立時間排（A 最早）；清單寫「最早 MM/DD HH:mm＋前後差多久」、表頭寫「最早／晚 N 小時」、
 *                基本資料寫完整時間（🚨 三處怎麼放設計端先定）
 *   🔒 任務單、站點分兩個分頁；已處理的在各分頁的「已處理」切換裡
 *   🔒 文案一律寫「可能重複」，不寫「重複」；擁有者收到的通知不寫是誰改的
 *
 * ── 權限 ───────────────────────────────────────────────────
 *   ⚠️ DUP-BE-428 🔒 **團隊管理員要能處理**（兩張都屬於自己團隊才行；跨單位或含未指派的只能看）。
 *                後端目前只開給超級管理員、資料檢核員（ai_duplicate.view／review）→ **待後端開給團隊管理員**
 *
 * 🧹 交付版：**測試資料已移除**，頁面一開是空的（正式上線第一天的樣子）。
 *    要看比對畫面：網址加 `?demo=1`，會載入 demoPairs() 的示範資料（地址、人名、數字都是編的）。
 *    `?demo=1` 只是給工程師看畫面，正式版不要做。
 */
(function () {
  const KEY = "wg.dedup.v6"; // localStorage 只是原型存處理結果用；正式版不存

  // 🔒 DUP-BE-411：來源**不顯示、不篩選**，只留在資料上給「不是重複」的通知用（source === "create"）
  window.DD_SOURCE = {
    create: { label: "建立時仍要建立", icon: "UserPen" },
    import: { label: "批次匯入",       icon: "FileSpreadsheet" },
    scan:   { label: "背景掃描",       icon: "ScanSearch" },
  };

  window.DD_OUTCOME = {
    merged:    { label: "已合併",       tone: "success" },
    confirmed: { label: "確認重複（未合併）", tone: "warning" },   // DUP-BE-424 站點用
    separate:  { label: "不是重複",     tone: "neutral" },
    removed:   { label: "內容變更，自動移出", tone: "info" },
  };

  // ════════════════════════════════════════════════════════════════════════
  // 欄位：有什麼就列什麼（🔒 DUP-BE-410）
  //
  //   比對表的每一列＝一個欄位。欄位來自兩處，**畫面上不可以寫死欄位名**：
  //   ① 本身的欄位（後端資料表的欄）：需求 ticket_tasks（task_type／task_name／quantity）、
  //      任務單 tickets（描述、聯絡人、優先級、地址）、站點 stations
  //   ② 另外設定的欄位：需求類型 → task_property_config、災害 → ticket_property_config、站點類型 → station_property_config
  //      · 名稱用設定的 label；設定被刪掉或沒有 label → 顯示 property_name（同後端 property_config.py）
  //      · 排序照設定的 sort_order；設定裡沒有的排最後
  //      · 停用的欄位，舊資料有值照樣列出
  //   ③ **兩張都沒填的欄位不列**，只在表格下面寫一句「沒有人填：…」
  //   正式版：從 GET /admin/duplicate-pairs/{uuid} 的 tickets.*（tasks[].properties、disaster_details）讀，不要寫死。
  // ════════════════════════════════════════════════════════════════════════
  const kindLabel = (v) => ((window.TK_TASK_KIND || {})[v] || {}).label || v;
  const prioLabel = (v) => ((window.TK_PRIORITY || {})[v] || {}).label || v;
  // scope：值放在哪裡。task＝需求的欄、taskProp＝需求的設定欄位、ticket／station＝單本身的欄、ticketProp／stationProp＝單本身的設定欄位
  // fixed：不能挑（DUP-BE-426：地址這一版不能改）
  const TASK_COLS = [
    { scope: "task",   key: "kind",     label: "需求種類", fmt: kindLabel, locked: true },   // 後端只能併同類型（ADR-370），不能改
    { scope: "task",   key: "name",     label: "需求名稱" },
    { scope: "task",   key: "quantity", label: "數量", number: true },
    // 需求說明（後端 ticket_tasks.task_description → resolve 的 values.task_description）。
    // 跟任務單的「描述」是兩個不同欄位：描述講整張單，需求說明講這一筆需求
    { scope: "task",   key: "desc",     label: "需求說明", long: true },
  ];
  const TICKET_COLS = [
    { scope: "ticket", key: "ticketTitle", label: "標題" },
    { scope: "ticket", key: "desc",     label: "描述", long: true },
    { scope: "ticket", key: "contact",  label: "聯絡人" },
    { scope: "ticket", key: "priority", label: "優先級", fmt: prioLabel, options: () => Object.keys(window.TK_PRIORITY || {}).map((k) => [k, prioLabel(k)]) },
    // DUP-BE-431：挑哪一張的地址，那一張就是送給後端的 primary（地址這一版後端不能改，只能跟著 primary）
    { scope: "ticket", key: "address",  label: "地址", primary: true },
  ];
  const STATION_COLS = [
    { scope: "station", key: "name",     label: "站點名稱" },
    { scope: "station", key: "type",     label: "類型" },
    { scope: "station", key: "address",  label: "地址" },
    { scope: "station", key: "hours",    label: "開放時間" },
    { scope: "station", key: "contact",  label: "聯絡人" },
    { scope: "station", key: "opStatus", label: "營運狀態" },
  ];

  // 設定頁的欄位設定（st-data.js；頁面有載就讀，讀不到就只用 property_name）
  function propConfigs() {
    try { return (window.stLoad ? window.stLoad().fields : []) || []; } catch (e) { return []; }
  }
  const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  function fmtProp(cfg) {
    return (v) => {
      if (isEmpty(v)) return "";
      if (Array.isArray(v)) return v.join("、");
      if (typeof v === "boolean") return v ? "是" : "否";
      return cfg && cfg.unit ? `${v} ${cfg.unit}` : String(v);
    };
  }
  function propFields(items, scope, bag, cfgKind, cfgScopeOf) {
    const cfgs = propConfigs();
    const keys = [];
    items.forEach((it) => Object.keys(bag(it) || {}).forEach((k) => { if (keys.indexOf(k) < 0) keys.push(k); }));
    return keys.map((k) => {
      const scopes = items.map(cfgScopeOf);
      const cfg = cfgs.find((c) => c.kind === cfgKind && c.key === k && (cfgKind === "disaster" || scopes.indexOf(c.scope) >= 0));
      return { scope, key: k, label: (cfg && cfg.label) || k, fmt: fmtProp(cfg), order: cfg ? (cfg.order || 0) : 9999, prop: true, inactive: !!(cfg && cfg.active === false), cfg: cfg || null };
    }).sort((a, b) => a.order - b.order);
  }

  window.ddRead = function (it, f) {
    if (f.scope === "task") return (it.task || {})[f.key];
    if (f.scope === "taskProp") return ((it.task || {}).props || {})[f.key];
    if (f.scope === "ticketProp" || f.scope === "stationProp") return (it.props || {})[f.key];
    return it[f.key];
  };
  window.ddWrite = function (it, f, v) {
    const out = Object.assign({}, it);
    const setIn = (obj, k, val) => { const o = Object.assign({}, obj || {}); if (isEmpty(val)) delete o[k]; else o[k] = val; return o; };
    if (f.scope === "task") out.task = Object.assign({}, it.task, { [f.key]: v });
    else if (f.scope === "taskProp") out.task = Object.assign({}, it.task, { props: setIn((it.task || {}).props, f.key, v) });
    else if (f.scope === "ticketProp" || f.scope === "stationProp") out.props = setIn(it.props, f.key, v);
    else out[f.key] = v;
    return out;
  };
  window.ddShow = function (f, v) {
    const out = isEmpty(v) ? "" : f.fmt ? f.fmt(v) : (Array.isArray(v) ? v.join("、") : v);
    return out == null || out === "" ? "（未填）" : String(out);
  };
  window.ddFieldId = (f) => f.scope + ":" + f.key;

  // 這一對要列哪些欄位：
  //   任務單 → { ticket: 單的欄位（含災害欄位）, task: 重複那筆需求的欄位, empty }
  //   站點   → { station: 站點的欄位（DUP-BE-424：只並排，不能挑）, empty }
  window.ddFieldsFor = function (g) {
    const items = g.items;
    const empty = [];
    const keep = (list) => list.filter((f) => {
      const has = items.some((it) => !isEmpty(window.ddRead(it, f)));
      if (!has) empty.push(f.label);
      return has;
    });
    if (g.kind === "station") {
      const props = propFields(items, "stationProp", (it) => it.props, "station", (it) => it.typeKey || it.type);
      return { station: keep(STATION_COLS.concat(props)), empty };
    }
    const ticketProps = propFields(items, "ticketProp", (it) => it.props, "disaster", () => null);
    const taskProps = propFields(items, "taskProp", (it) => (it.task || {}).props, "task", (it) => (it.task || {}).kind);
    // 地址排在單本身欄位的最後、災害欄位之前
    const tk = keep(TICKET_COLS.concat(ticketProps));
    return { ticket: tk, task: keep(TASK_COLS.concat(taskProps)), empty };
  };

  // ── 時間（DUP-BE-412）：示範資料的時間是「MM/DD HH:mm」；正式版用後端的 created_at ──
  window.ddTime = function (t) {
    const m = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/.exec(t || "");
    return m ? new Date(2026, +m[1] - 1, +m[2], +m[3], +m[4]).getTime() : NaN;
  };
  window.ddGap = function (a, b) {
    const mins = Math.round(Math.abs(window.ddTime(b) - window.ddTime(a)) / 60000);
    if (!isFinite(mins)) return "";
    if (mins === 0) return "同時";
    if (mins < 60) return `${mins} 分`;
    const h = Math.floor(mins / 60), d = Math.floor(h / 24);
    if (d) return `${d} 天${h % 24 ? ` ${h % 24} 小時` : ""}`;
    return `${h} 小時${mins % 60 ? ` ${mins % 60} 分` : ""}`;
  };
  function byCreated(items) {
    return items.map((it, i) => [it, i]).sort((a, b) => (window.ddTime(a[0].createdAt) - window.ddTime(b[0].createdAt)) || (a[1] - b[1])).map((x) => x[0]);
  }

  // 一筆任務單（一對裡的一邊）的形狀：
  //   ticketId／ticketTitle／team／owner／createdAt／updatedAt／address／contact／desc／priority
  //   props：災害欄位答案（後端 disaster_details）
  //   task：疑似重複的那筆需求 { kind, name, quantity, claimed（承接人數）, props（需求的設定欄位）}
  //   others：單上其他還在的需求 [{ id, kind, name, quantity, claimed }]
  //   photos：照片 [{ id, label }]（正式版是 url）
  const DEMO = (() => { try { return new URLSearchParams(location.search).get("demo") === "1"; } catch (e) { return false; } })();
  function seed() { return DEMO ? demoPairs() : []; }
  function demoPairs() {
    return [
      // ── 任務單 ──────────────────────────────────────────────────────────
      {
        id: "D-301", kind: "ticket", source: "create", score: 0.91, detectedAt: "10/10 08:42", status: "pending",
        signals: ["相距 12 公尺", "建立時間差 1 小時 25 分", "需求種類相同（人力）", "文字很接近：「清淤」「一樓」"],
        items: [
          { key: "a", ticketId: "T-2101", ticketTitle: "大進街12號 一樓淤泥清理", team: "壯闊台灣", owner: "陳先生",
            createdAt: "10/10 07:17", updatedAt: "10/10 07:17",
            address: "光復鄉大進街12號", contact: "陳先生 0912-xxx-208", desc: "一樓淤泥約 50 公分，家具泡水。", priority: "medium",
            props: { water_depth: 50, power_status: "停電" },
            task: { kind: "hr", name: "清淤人力", quantity: 6, claimed: 3, desc: "一樓客廳與廚房，要能搬重物", props: { cleanup_type: "淤泥", tools: ["鏟子", "推車"] } },
            others: [{ id: "T-2101-2", kind: "supply", name: "推車", quantity: 2, claimed: 0 }],
            photos: [{ id: "p1", label: "一樓客廳" }, { id: "p2", label: "門口" }] },
          { key: "b", ticketId: "T-2108", ticketTitle: "大進街12號 需要人幫忙清泥", team: "壯闊台灣", owner: "陳太太",
            createdAt: "10/10 08:42", updatedAt: "10/10 08:42",
            address: "光復鄉大進街12號", contact: "陳太太 0921-xxx-771", desc: "一樓積泥約 50 公分，需要鏟子，家裡只有兩個老人。", priority: "high",
            props: { water_depth: 50, road_access: "正常" },
            task: { kind: "hr", name: "清泥人力", quantity: 4, claimed: 1, desc: "早上 9 點前到，家裡有長輩", props: { cleanup_type: "淤泥", tools: ["鏟子"], skills: ["體力活"] } },
            others: [{ id: "T-2108-2", kind: "supply", name: "飲用水", quantity: 2, claimed: 0 }, { id: "T-2108-3", kind: "supply", name: "成人尿布", quantity: 1, claimed: 1 }],
            photos: [{ id: "p3", label: "廚房" }] },
        ],
      },
      {
        id: "D-302", kind: "ticket", source: "scan", score: 0.84, detectedAt: "10/10 06:00", status: "pending",
        signals: ["相距 35 公尺", "建立時間差 5 小時", "需求種類相同（物資）", "文字接近：「飲用水」「箱」"],
        items: [
          { key: "a", ticketId: "T-2075", ticketTitle: "大平村活動中心 飲用水不足", team: "慈濟基金會", owner: "林村長",
            createdAt: "10/09 22:10", updatedAt: "10/10 05:40",
            address: "光復鄉大平村活動中心", contact: "林村長 0933-xxx-512", desc: "收容 80 人，飲用水只剩半天。", priority: "high",
            props: { road_access: "單線可通" },
            task: { kind: "supply", name: "瓶裝飲用水", quantity: 120, claimed: 0, props: { item_name: "600ml 瓶裝水" } },
            others: [], photos: [] },
          { key: "b", ticketId: "T-2090", ticketTitle: "大平村 收容點缺水缺毛毯", team: "慈濟基金會", owner: "王小姐",
            createdAt: "10/10 03:02", updatedAt: "10/10 03:02",
            address: "光復鄉大平村活動中心旁", contact: "王小姐 LINE: wang_hl", desc: "活動中心的人很多，水不夠，晚上很冷。", priority: "medium",
            props: {},
            task: { kind: "supply", name: "飲用水（箱）", quantity: 30, claimed: 0, desc: "送到活動中心側門", props: { item_name: "瓶裝水（一箱 24 瓶）" } },
            others: [{ id: "T-2090-2", kind: "supply", name: "毛毯", quantity: 40, claimed: 0 }],
            photos: [{ id: "p4", label: "活動中心外" }] },
        ],
      },
      {
        id: "D-303", kind: "ticket", source: "import", score: 0.88, detectedAt: "10/10 09:15", status: "pending",
        signals: ["相距 15 公尺", "同一次匯入", "需求種類相同（物資）", "文字接近：「毛毯」「收容所」"],
        items: [
          { key: "a", ticketId: "T-2140", ticketTitle: "光復國小收容所 毛毯", team: null, owner: "花蓮縣政府災防辦（匯入）",
            createdAt: "10/10 09:15", updatedAt: "10/10 09:15",
            address: "光復鄉光復國小", contact: "收容所窗口 03-87xx-xxx", desc: "收容所夜間保暖。", priority: "medium",
            props: {}, task: { kind: "supply", name: "毛毯", quantity: 80, claimed: 0, props: { item_name: "毛毯" } },
            others: [], photos: [] },
          { key: "b", ticketId: "T-2141", ticketTitle: "光復國小 收容所需要毛毯", team: null, owner: "花蓮縣政府災防辦（匯入）",
            createdAt: "10/10 09:15", updatedAt: "10/10 09:15",
            address: "光復鄉光復國小", contact: "", desc: "", priority: "medium",
            props: {}, task: { kind: "supply", name: "毛毯", quantity: 100, claimed: 0 },
            others: [{ id: "T-2141-2", kind: "supply", name: "睡墊", quantity: 50, claimed: 0 }], photos: [],
            // 示範：審核員打開後，擁有者改了數量 → 送出時要擋下並重新載入（後端 409）
            staleDemo: { field: "quantity", to: 150, by: "擁有者", at: "10/10 09:48" } },
        ],
      },
      {
        id: "D-305", kind: "ticket", source: "import", score: 0.82, detectedAt: "10/10 10:30", status: "pending",
        signals: ["相距 40 公尺", "同一次匯入", "需求種類相同（人力）", "文字接近：「車站」「清淤」「水溝」"],
        items: [
          { key: "a", ticketId: "T-2150", ticketTitle: "光復車站前 水溝清淤", team: "壯闊台灣", owner: "車站站長（匯入）",
            createdAt: "10/10 10:30", updatedAt: "10/10 10:30",
            address: "光復鄉中山路一段（光復車站前）", contact: "站務室 03-87xx-xxx", desc: "站前水溝被泥堵住，下雨會淹。", priority: "high",
            props: { road_access: "正常" },
            task: { kind: "hr", name: "水溝清淤人力", quantity: 10, claimed: 4, props: { cleanup_type: "水溝", tools: ["鏟子"] } },
            others: [{ id: "T-2150-2", kind: "supply", name: "鏟子", quantity: 10, claimed: 0 }], photos: [{ id: "p5", label: "站前水溝" }] },
          { key: "b", ticketId: "T-2153", ticketTitle: "光復車站 站前廣場清泥", team: "壯闊台灣", owner: "鄉公所（匯入）",
            createdAt: "10/10 10:30", updatedAt: "10/10 10:30",
            address: "光復鄉中山路一段 站前廣場", contact: "鄉公所 03-87xx-xxx", desc: "廣場與水溝都有泥，需要推車。", priority: "high",
            props: { road_access: "正常" },
            task: { kind: "hr", name: "清淤人力", quantity: 12, claimed: 1, props: { cleanup_type: "淤泥", tools: ["推車"] } },
            others: [{ id: "T-2153-2", kind: "supply", name: "推車", quantity: 3, claimed: 1 }, { id: "T-2153-3", kind: "supply", name: "飲用水", quantity: 2, claimed: 0 }],
            photos: [{ id: "p6", label: "站前廣場" }, { id: "p7", label: "水溝口" }] },
        ],
      },

      // ── 站點（DUP-BE-424：只能確認重複／不是重複，不能合併）──────────────
      {
        id: "D-401", kind: "station", source: "scan", score: 0.87, detectedAt: "10/10 06:00", status: "pending",
        signals: ["相距 40 公尺", "類型相同（供水）", "名稱接近：「糖廠」「水」"],
        items: [
          { key: "a", stationId: "RS-0211", team: null, owner: "台灣自來水公司（匯入）", createdAt: "10/08 14:00", updatedAt: "10/09 18:20",
            name: "光復糖廠加水站", type: "供水", address: "光復鄉糖廠街19號", hours: "每日 08:00–20:00", contact: "台水第九區處", opStatus: "開設中", pendingSuggestions: 0 },
          { key: "b", stationId: "RS-0234", team: null, owner: "吳政憲", createdAt: "10/09 21:30", updatedAt: "10/09 21:30",
            name: "糖廠飲水站", type: "供水", address: "光復鄉糖廠街（停車場旁）", hours: "", contact: "現場志工", opStatus: "開設中", pendingSuggestions: 1 },
        ],
      },
      {
        id: "D-402", kind: "station", source: "import", score: 0.93, detectedAt: "10/10 07:05", status: "pending",
        signals: ["同一地址", "同一次匯入", "類型相同（物資）", "名稱幾乎相同"],
        items: [
          { key: "a", stationId: "RS-0240", team: "壯闊台灣", owner: "黃曉芳（匯入）", createdAt: "10/10 07:05", updatedAt: "10/10 07:05",
            name: "大進國小物資站", type: "物資", address: "光復鄉大進國小", hours: "09:00–17:00", contact: "黃曉芳", opStatus: "開設中", pendingSuggestions: 0 },
          { key: "b", stationId: "RS-0241", team: "壯闊台灣", owner: "黃曉芳（匯入）", createdAt: "10/10 07:05", updatedAt: "10/10 07:05",
            name: "大進國小 物資發放站", type: "物資", address: "光復鄉大進國小 操場", hours: "", contact: "", opStatus: "開設中", pendingSuggestions: 0 },
        ],
      },

      // ── 已處理（示範）────────────────────────────────────────────────────
      {
        id: "D-290", kind: "ticket", source: "create", score: 0.9, detectedAt: "10/09 15:20", status: "merged",
        signals: ["相距 8 公尺", "需求種類相同（搜救）"],
        result: { at: "10/09 15:41", by: "張育成", keptKey: "a", summary: "保留 T-2011，重複的需求合併成「破拆搜救人力」；T-2016 整張取消。已通知 2 位擁有者。" },
        items: [
          { key: "a", ticketId: "T-2011", ticketTitle: "中山路88號 受困", team: "壯闊台灣", owner: "鄰居李先生", createdAt: "10/09 14:02", updatedAt: "10/09 15:41",
            address: "光復鄉中山路88號", contact: "李先生", desc: "二樓有人敲牆回應。", priority: "critical", props: {}, others: [], photos: [],
            task: { kind: "rescue", name: "破拆搜救人力", quantity: 4, claimed: 2 } },
          { key: "b", ticketId: "T-2016", ticketTitle: "中山路88號 二樓有人", team: "壯闊台灣", owner: "張小姐", createdAt: "10/09 15:20", updatedAt: "10/09 15:41",
            address: "光復鄉中山路88號", contact: "張小姐", desc: "聽到敲擊聲。", priority: "critical", props: {}, others: [], photos: [],
            task: { kind: "rescue", name: "搜救", quantity: 2, claimed: 0 } },
        ],
      },
      {
        id: "D-291", kind: "ticket", source: "scan", score: 0.72, detectedAt: "10/09 12:00", status: "separate",
        signals: ["相距 60 公尺", "需求種類相同（人力）"],
        result: { at: "10/09 13:05", by: "黃曉芳", summary: "審核後確認不是同一件事（隔壁兩戶）。這一對不會再提示，除非之後被改到相似。" },
        items: [
          { key: "a", ticketId: "T-1990", ticketTitle: "中正路45號 清淤", team: "壯闊台灣", owner: "吳先生", createdAt: "10/09 09:00", updatedAt: "10/09 09:00",
            address: "光復鄉中正路45號", contact: "吳先生", desc: "", priority: "medium", props: {}, others: [], photos: [], task: { kind: "hr", name: "清淤人力", quantity: 4, claimed: 0 } },
          { key: "b", ticketId: "T-1994", ticketTitle: "中正路47號 清淤", team: "壯闊台灣", owner: "劉太太", createdAt: "10/09 10:10", updatedAt: "10/09 10:10",
            address: "光復鄉中正路47號", contact: "劉太太", desc: "", priority: "medium", props: {}, others: [], photos: [], task: { kind: "hr", name: "清淤人力", quantity: 3, claimed: 0 } },
        ],
      },
      {
        id: "D-292", kind: "ticket", source: "create", score: 0.81, detectedAt: "10/09 19:30", status: "removed",
        signals: ["相距 15 公尺", "需求種類相同（物資）"],
        result: { at: "10/09 20:02", by: "系統", summary: "擁有者把 T-2051 的地址改成「富田村」，與 T-2048 不再相似，已自動移出佇列。" },
        items: [
          { key: "a", ticketId: "T-2048", ticketTitle: "大全村 尿布", team: "慈濟基金會", owner: "許小姐", createdAt: "10/09 18:50", updatedAt: "10/09 18:50",
            address: "光復鄉大全村", contact: "許小姐", desc: "", priority: "low", props: {}, others: [], photos: [], task: { kind: "supply", name: "成人尿布", quantity: 20, claimed: 0 } },
          { key: "b", ticketId: "T-2051", ticketTitle: "富田村 尿布", team: "慈濟基金會", owner: "許先生", createdAt: "10/09 19:30", updatedAt: "10/09 20:02",
            address: "光復鄉富田村", contact: "許先生", desc: "", priority: "low", props: {}, others: [], photos: [], task: { kind: "supply", name: "成人尿布", quantity: 15, claimed: 0 } },
        ],
      },
    ];
  }

  // DUP-BE-412：載入時把兩筆依建立時間排好，A 永遠是最早建立的
  const sorted = (gs) => gs.map((g) => Object.assign({}, g, { items: byCreated(g.items) }));
  // 示範模式和空白模式分開存，免得一開 ?demo=1 之後，空白版也一直看到示範資料
  const STORE = KEY + (DEMO ? ".demo" : "");
  window.ddLoad = function () {
    try { const raw = localStorage.getItem(STORE); if (raw) return sorted(JSON.parse(raw)); } catch (e) {}
    return sorted(seed());
  };
  window.ddSave = function (groups) { try { localStorage.setItem(STORE, JSON.stringify(groups)); } catch (e) {} };
  window.ddReset = function () { try { localStorage.removeItem(STORE); } catch (e) {} return sorted(seed()); };

  // ── 權限 ─────────────────────────────────────────────────────────────────
  // ⚠️ DUP-BE-428：團隊管理員能處理是設計端的裁示，後端目前不支援（ai_duplicate.* 只 grant 超級管理員、資料檢核員）。待後端。
  window.ddAccess = function (identity) {
    if (!identity) return { page: false };
    if (identity.kind === "platform" && (identity.role === "super" || identity.role === "auditor")) return { page: true, all: true };
    if (identity.kind === "team" && identity.role === "admin") return { page: true, all: false, team: identity.teamName };
    return { page: false };
  };
  // 這一對在不在你的範圍（團隊管理員：任一張屬於自己團隊）
  window.ddInScope = function (g, access) {
    if (access.all) return true;
    return g.items.some((it) => it.team === access.team);
  };
  // 你能不能處理這一對；不能的話回傳原因（團隊管理員：兩張都屬於自己團隊才行）
  window.ddCanHandle = function (g, access) {
    if (access.all) return { can: true };
    const teams = [];
    let unassigned = false;
    g.items.forEach((it) => {
      if (!it.team) unassigned = true;
      else if (it.team !== access.team && teams.indexOf(it.team) < 0) teams.push(it.team);
    });
    if (teams.length) return { can: false, reason: "cross", teams };
    if (unassigned) return { can: false, reason: "unassigned" };
    return { can: true };
  };

  // ── primary（DUP-BE-431）：兩張地址一樣時，重複那筆需求有人承接的那張，其次最早建立的 ──
  window.ddPrimary = function (items) {
    const c = (i) => ((i.task || {}).claimed || 0);
    return items.slice().sort((a, b) => (c(b) - c(a)) || (window.ddTime(a.createdAt) - window.ddTime(b.createdAt)))[0].key;
  };
  // 一對裡所有「其他需求」與照片（兩張合在一起，標出來自哪一張）
  window.ddAllNeeds = function (g) { return g.items.reduce((a, it) => a.concat((it.others || []).map((t) => Object.assign({ from: it.key }, t))), []); };
  window.ddAllPhotos = function (g) { return g.items.reduce((a, it) => a.concat((it.photos || []).map((p) => Object.assign({ from: it.key }, p))), []); };

  // ── 合併的後果（DUP-BE-430／431，對齊後端 Spec 028）────────────────────────
  //   plan：{ kept（primary，畫面不顯示）, qty（合併後數量）, needOff: { 需求id: true＝沒勾 }, photoOff: { 照片id: true＝沒勾 } }
  window.ddMergeEffects = function (g, plan) {
    const kept = g.items.find((i) => i.key === plan.kept);
    const other = g.items.find((i) => i.key !== plan.kept);
    const off = plan.needOff || {}, poff = plan.photoOff || {};
    const needs = window.ddAllNeeds(g);
    const included = needs.filter((t) => !off[t.id]);
    const dropped = needs.filter((t) => off[t.id]);
    const claimedTotal = (kept.task.claimed || 0) + (other.task.claimed || 0);
    const photos = window.ddAllPhotos(g);
    const photosIn = photos.filter((p) => !poff[p.id]);
    const owners = [];
    g.items.forEach((i) => { if (owners.indexOf(i.owner) < 0) owners.push(i.owner); });
    return {
      kept, other, included, dropped, claimedTotal, photosIn,
      photosDropped: photos.length - photosIn.length,
      // DUP-BE-423：重複那筆需求兩邊的志工都留在合併後的需求；勾的需求志工跟著；沒勾的需求上的志工收到取消通知
      volunteersStay: claimedTotal + included.reduce((n, t) => n + (t.claimed || 0), 0),
      volunteersCanceled: dropped.reduce((n, t) => n + (t.claimed || 0), 0),
      // 🔒 後端 ADR-370：合併後的數量不能少於承接人數
      qtyTooSmall: plan.qty != null && plan.qty !== "" && kept.task.kind !== "rescue" && Number(plan.qty) < claimedTotal,
      qtyMissing: (plan.qty == null || plan.qty === "") && kept.task.kind !== "rescue",
      owners,
    };
  };
})();
