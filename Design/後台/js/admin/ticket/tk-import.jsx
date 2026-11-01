// tk-import.jsx — 任務單匯入／匯出（2026-10-15 改版：對齊後端 feature 015）
//
// 🔒 後端契約（GuangFuHero/optimized-version @ main 7bdd34a，Backend/app/services/bulk_*.py）
//   這支原型的畫面照後端已實作的行為做。改這裡之前先讀後端，不要讓畫面承諾後端做不到的事。
//   BK-1 以「需求種類」為單位：一個檔案＝一種 task_type；一列＝一張任務單的一筆需求（ADR-120）。
//        同一張單有三筆搜救需求＝三列，標題與電話相同。
//   BK-2 欄位＝後端的英文欄名（bulk_columns.TICKET_COLUMNS）＋ 該種類的自訂欄位 `prop.<key>`。
//        匯出檔本身就是匯入範本（ADR-119）。❌ 不要另外發明中文欄名的範本 —— 那會變成兩套格式。
//        畫面上的中文名只是「說明」，檔案裡永遠是英文欄名；檔案用中文標題時靠「欄位對應」配回去。
//   BK-3 位置用經緯度，**沒有地址欄**。建立時必填：title、contact_name、latitude、longitude、task_name。
//   BK-4 已存在的單會「更新」不是新建（upsert）：用「標題＋聯絡電話」比對（ADR-107）。
//        對到一張＝更新；對到兩張以上＝這列失敗（不猜，ADR-113）；空白格＝不動（ADR-121）。
//        更新時只改得到：說明、狀態、優先級、災害類型、自訂欄位。其餘欄位建立後就不能改
//        （位置、聯絡資料、需求內容 —— 後端 Update*Input 沒有這些欄位）。
//   BK-5 同一個檔案裡：同一張單（標題＋電話相同）第一列建立，後面的列掛到同一張單；
//        同一張單裡「需求種類＋需求名稱」重複的列 → 全部失敗，不是最後一列贏（duplicate_key_rows）。
//   BK-6 先試算（preview，不寫入）→ 確認才寫入（commit）。好的列照寫，壞的列回報列號、欄位、原因，
//        並可下載「失敗的列」檔案修正後重傳（ADR-112）。一次最多 500 列（ADR-116）。
//   BK-7 每一列走跟手動建單同一支 service（ADR-110），所以權限、驗證、History、**重複審核**都照跑。
//   BK-8 匯出：選一種需求種類，匯出「你權限範圍內」該種類的全部需求；**不吃列表的篩選**。
//        CSV 或 Excel；最多 10,000 列；聯絡資料依每一列的權限可能遮罩（ticket.view_pii）。
//
// 🔒 Sucre 裁示
//   TM-IMP-102（10-13）匯入的單一樣要進 重複審核 —— 後端 BK-7 本來就是這樣。
//   BULK-102（11-01，推翻 10-15 的 BULK-101）權限：匯入、匯出給超級管理員、政府隊成員、團隊管理員；
//        非政府組織隊的成員、資料檢核員都不行。依「目前身份」判斷，寫在 js/shared/wg-bulk.jsx 的 canBulk。
//        ⚠️ 後端目前給資料檢核員 export —— 要請後端拿掉。
//
// 🚨 Claude 定的（後端沒規定，原型自己的）
//   TM-IMP-104 匯入新建的單歸屬：非政府組織 → 目前身份那一隊；超管／政府 → 未指派。
//   TM-IMP-107 優先級要是 critical/high/medium/low 或對應中文；看不懂的列失敗、空白＝一般。
//              ❌ 不要把看不懂的值當一般 —— 打錯的「生命危急」會被默默降級。（後端目前收任意字串）
//   TM-IMP-108 原型模擬重複判斷：相距 50 公尺內 ＋ 需求種類相同；物資另外要品名接近。
//              正式版由後端 DEDUP-001 判斷，分數與訊號文字是原型編的。
(function () {
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  const MAX_IMPORT = 500;      // BK-6 ADR-116
  const MAX_EXPORT = 10000;    // BK-8 MAX_EXPORT_ROWS

  // ── 欄位（BK-2，順序同 TICKET_COLUMNS）───────────────────────────────────
  // mode：both＝建立與更新都寫；create＝只在建立時寫；update＝只在更新時寫；read＝唯讀（匯出才有）
  const FIXED = [
    { key: "uuid",                label: "編號",       mode: "read" },
    { key: "title",               label: "標題",       mode: "create", required: true, matchKey: true },
    { key: "description",         label: "說明",       mode: "both" },
    { key: "status",              label: "狀態",       mode: "update" },
    { key: "priority",            label: "優先級",     mode: "both" },
    { key: "disaster_types",      label: "災害類型",   mode: "both" },
    { key: "contact_name",        label: "聯絡人",     mode: "create", required: true },
    { key: "contact_email",       label: "聯絡 Email", mode: "create" },
    { key: "contact_phone",       label: "聯絡電話",   mode: "create", matchKey: true },
    { key: "latitude",            label: "緯度",       mode: "create", required: true },
    { key: "longitude",           label: "經度",       mode: "create", required: true },
    { key: "visibility",          label: "公開範圍",   mode: "create" },
    { key: "task_type",           label: "需求種類",   mode: "create" },
    { key: "task_name",           label: "需求名稱",   mode: "create", required: true },
    { key: "task_description",    label: "需求說明",   mode: "create" },
    { key: "task_quantity",       label: "需求數量",   mode: "create" },
    { key: "verification_status", label: "查核狀態",   mode: "read" },
    { key: "review_note",         label: "審核備註",   mode: "read" },
    { key: "created_at",          label: "建立時間",   mode: "read" },
  ];
  // 各需求種類的自訂欄位。正式版由後端 ticket_columns(task_type) 從 task_property_config 讀；
  // 原型鏡射 settings/st-data.js 的種子（TM-CF-120 出廠起始欄位）。
  const TASK_FIELDS = {
    rescue: [["trapped_count", "受困人數", "number"], ["floor", "樓層", "number"], ["door_no", "門牌號"], ["hazard_note", "危害備註"]],
    supply: [["item_name", "物品名稱"]],
    hr:     [["skills", "需要技能"], ["vehicle_type", "車輛類型"], ["cleanup_type", "清理類型"], ["tools", "需要工具"]],
  };
  function columnsFor(type) {
    const dyn = (TASK_FIELDS[type] || []).map((f) => ({ key: "prop." + f[0], label: f[1], mode: "both", dynamic: true, number: f[2] === "number" }));
    return FIXED.concat(dyn);
  }
  // 檔案用中文標題時的自動對應（後端 suggested_mapping 的原型版）
  const ALIASES = {
    title: ["任務標題", "名稱"], description: ["描述", "狀況", "備註"], contact_phone: ["電話", "手機", "連絡電話", "聯絡方式"],
    contact_name: ["姓名", "報案人", "窗口"], latitude: ["lat", "y"], longitude: ["lng", "lon", "x"],
    task_name: ["需求", "需求項目"], task_quantity: ["數量"], uuid: ["id", "編號"],
  };

  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
  const normPhone = (s) => String(s || "").replace(/\D/g, "");
  const kindLabel = (k) => ((window.TK_TASK_KIND || {})[k] || {}).label || k;

  // 讀檔、下載、失敗列報告：兩頁共用 js/shared/wg-bulk.jsx
  const B = window.WGBulk;
  const parseCSV = B.parseCSV, readFile = B.readFile, download = B.download, stampName = B.stampName;

  // ── 匯出（BK-8）─────────────────────────────────────────────────────────
  function coordOf(t) {
    const c = window.TK_COORDS && window.TK_COORDS[t.id];
    return c ? c.c : (t.lat != null ? [t.lat, t.lng] : null);
  }
  function exportRows(tickets, type) {
    const cols = columnsFor(type);
    const out = [cols.map((c) => c.key)];
    tickets.forEach((t) => {
      (t.tasks || []).filter((k) => k.kind === type && k.status !== "canceled").forEach((k) => {
        const c = coordOf(t);
        const v = {
          uuid: t.id, title: t.title, description: t.desc || "", status: window.tkStatus ? window.tkStatus(t) : t.status,
          priority: t.priority, disaster_types: (t.disasterTypes || []).join(";"),
          contact_name: t.contact_name || "", contact_email: t.contact_email || "", contact_phone: t.contact_phone || "",
          latitude: c ? c[0] : "", longitude: c ? c[1] : "", visibility: t.visibility || "",
          task_type: k.kind, task_name: k.name, task_description: k.desc || "", task_quantity: k.quantity == null ? "" : k.quantity,
          verification_status: t.verification || "", review_note: t.reviewNote || "", created_at: t.createdAt || "",
        };
        out.push(cols.map((col) => col.dynamic ? (((k.props || t.fields || {})[col.key.slice(5)]) || "") : v[col.key]));
      });
    });
    return out;
  }
  function countByType(tickets) {
    const n = {};
    tickets.forEach((t) => (t.tasks || []).forEach((k) => { if (k.status !== "canceled") n[k.kind] = (n[k.kind] || 0) + 1; }));
    return n;
  }

  function TicketExportMenu() {
    const tk = window.useTK();
    // BK-8：範圍是「權限範圍內」，不是列表篩選，也不是「我的單位」切換。
    // ⚠️ 原型的讀取是全域開放（AC-VS-101），所以用 allTickets；正式版後端依 scope_filter（團隊管理員＝責任區）。
    const pool = tk.allTickets || tk.tickets;
    const counts = countByType(pool);
    const types = Object.keys(window.TK_TASK_KIND).map((k) => ({ key: k, label: kindLabel(k), icon: window.TK_TASK_KIND[k].icon, count: counts[k] || 0 }));
    return (
      <window.WGBulkExportMenu types={types} noun="需求" max={MAX_EXPORT}
        note={(t) => <span>匯出你權限範圍內<b>全部</b>的「{t.label}」需求，<b>不套用列表上的篩選</b>。一列＝一筆需求。聯絡資料依權限可能遮罩。這個檔案改完可以直接匯入：標題＋電話相同的會更新原本的單。</span>}
        onExport={(type, format) => download(exportRows(pool, type), `任務單_${kindLabel(type)}_${stampName()}_${counts[type] || 0}筆`, format)
          .then(() => tk.toast(counts[type] ? `已匯出「${kindLabel(type)}」需求 ${counts[type]} 筆` : `已下載「${kindLabel(type)}」空白範本`))
          .catch((e) => tk.toast(e.message, "danger"))} />
    );
  }

  // ── 匯入：試算（BK-4〜6）──────────────────────────────────────────────────
  function guessMapping(header, cols) {
    const map = {};
    header.forEach((h, i) => {
      const n = norm(h);
      const hit = cols.find((c) => norm(c.key) === n || norm(c.label) === n || (ALIASES[c.key] || []).some((a) => norm(a) === n)
        || (c.dynamic && norm(c.key.slice(5)) === n));
      map[i] = hit && hit.mode !== "read" ? hit.key : "";
    });
    return map;
  }
  function resolvePriority(v) {
    const n = norm(v);
    if (!n) return { key: null };
    const P = window.TK_PRIORITY;
    if (P[n]) return { key: n };
    const hit = Object.keys(P).find((k) => norm(P[k].label) === n);
    return hit ? { key: hit } : { err: `看不懂「${String(v).trim()}」（可填 ${Object.keys(P).map((k) => P[k].label).join("／")}）` };
  }
  function resolveStatus(v) {
    const n = norm(v);
    if (!n) return { key: null };
    const S = window.TK_STATUS;
    if (S[n]) return { key: n };
    const hit = Object.keys(S).find((k) => norm(S[k].label) === n);
    return hit ? { key: hit } : { err: `狀態「${String(v).trim()}」不在清單` };
  }
  const tkey = (title, phone) => norm(title) + "|" + normPhone(phone);

  // 回傳的形狀刻意對齊後端 BulkPreviewResponse：row_count / to_create / to_update / errors[{line,column,message}]
  // plans 是原型自己用來寫入的，後端 preview 不回傳逐列結果。
  function preview(rows, mapping, type, existing) {
    const header = rows[0], body = rows.slice(1);
    const cols = columnsFor(type);
    const errors = [];
    if (body.length > MAX_IMPORT) {
      return { row_count: body.length, to_create: 0, to_update: 0, errors: [{ line: 1, column: "-", message: `一次最多 ${MAX_IMPORT} 列，這個檔案有 ${body.length} 列。請拆成幾個檔案` }], plans: [], fatal: true };
    }
    const index = {};
    existing.forEach((t) => { const k = tkey(t.title, t.contact_phone); (index[k] = index[k] || []).push(t); });
    const taskSeen = {}, leaders = {};
    const plans = [];
    body.forEach((r, i) => {
      const line = i + 2;
      const v = {};
      Object.keys(mapping).forEach((ci) => { const f = mapping[ci]; if (f) v[f] = String(r[ci] == null ? "" : r[ci]).trim(); });
      const errs = [];
      const err = (column, message) => errs.push({ line, column, message });
      const key = tkey(v.title, v.contact_phone);
      const hits = v.title ? (index[key] || []) : [];
      let kind = "create", target = null;
      if (hits.length > 1) err("-", `對到 ${hits.length} 張任務單（${hits.map((t) => t.id).join("、")}），無法判斷要更新哪一張`);
      else if (hits.length === 1) { kind = "update"; target = hits[0]; }
      else if (v.title && leaders[key] != null) { kind = "attach"; }        // BK-5：同檔案裡同一張單的後續列
      // 種類：這份檔案就是選定的那一種
      if (v.task_type && norm(v.task_type) !== norm(type) && norm(v.task_type) !== norm(kindLabel(type))) err("task_type", `這份檔案是「${kindLabel(type)}」，這列寫的是「${v.task_type}」`);
      // 必填（只在建立時）
      if (kind === "create") {
        cols.filter((c) => c.required).forEach((c) => { if (!v[c.key]) err(c.key, `新的單必填「${c.label}」`); });
      } else if (!v.task_name) err("task_name", "缺需求名稱");
      ["latitude", "longitude"].forEach((f) => {
        if (v[f] && kind !== "update") {
          const x = Number(v[f]);
          const bad = !Number.isFinite(x) || (f === "latitude" ? Math.abs(x) > 90 : Math.abs(x) > 180);
          if (bad) err(f, `「${v[f]}」不是有效的${f === "latitude" ? "緯度" : "經度"}`);
        }
      });
      if (v.task_quantity && !/^\d+$/.test(v.task_quantity)) err("task_quantity", `數量要是整數，這列是「${v.task_quantity}」`);
      const pr = resolvePriority(v.priority); if (pr.err) err("priority", pr.err);
      const st = resolveStatus(v.status); if (st.err) err("status", st.err);
      cols.filter((c) => c.number).forEach((c) => { if (v[c.key] && !Number.isFinite(Number(v[c.key]))) err(c.key, `「${c.label}」要是數字`); });
      // BK-5：同一張單裡需求重複 → 全部失敗
      const tk2 = key + "#" + norm(v.task_name);
      if (v.title && v.task_name) (taskSeen[tk2] = taskSeen[tk2] || []).push(line);
      if (kind === "create" && v.title && !errs.length && leaders[key] == null) leaders[key] = line;
      plans.push({ line, kind, target, key, v, priority: pr.key, status: st.key, errs });
    });
    Object.keys(taskSeen).forEach((k) => {
      const ls = taskSeen[k];
      if (ls.length > 1) plans.forEach((p) => { if (ls.indexOf(p.line) >= 0) p.errs.push({ line: p.line, column: "-", message: `跟第 ${ls.filter((x) => x !== p.line).join("、")} 列是同一張單的同一筆需求` }); });
    });
    // 後續列的那張單第一列失敗 → 跟著失敗（ADR-211）
    plans.forEach((p) => {
      if (p.kind === "attach") {
        const leader = plans.find((q) => q.kind === "create" && q.key === p.key);
        if (!leader || leader.errs.length) p.errs.push({ line: p.line, column: "-", message: `同一張單的第一列（第 ${leader ? leader.line : "?"} 列）有問題，這列一起略過` });
      }
      p.errs.forEach((e) => errors.push(e));
    });
    const good = plans.filter((p) => !p.errs.length);
    return {
      row_count: body.length,
      to_create: good.filter((p) => p.kind !== "update").length,
      to_update: good.filter((p) => p.kind === "update").length,
      errors, plans,
      unmapped_headers: header.filter((h, i) => !mapping[i]),
    };
  }

  const failedReport = (rows, result) => B.failedReport(rows, result.errors);

  // ── 原型模擬重複判斷（TM-IMP-108）────────────────────────────────────
  function meters(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bigrams(s) {
    const t = String(s || "").replace(/[\s\d×xX*，,。.、（）()]/g, "");
    const out = [];
    for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); if (out.indexOf(b) < 0) out.push(b); }
    return out;
  }
  const CLOSED = ["completed", "canceled", "archived"];
  function dedupGroups(made, existing, meta) {
    const nodes = [];
    existing.forEach((t) => { if (CLOSED.indexOf(t.status) < 0) (t.tasks || []).forEach((k) => { if (k.status !== "canceled") nodes.push({ src: "old", t, k }); }); });
    made.forEach((t) => (t.tasks || []).forEach((k) => nodes.push({ src: "new", t, k })));
    const parent = nodes.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const dist = {};
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].src !== "new") continue;
      for (let j = 0; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (i === j || a.t === b.t || a.k.kind !== b.k.kind) continue;
        const ca = coordOf(a.t), cb = coordOf(b.t);
        if (!ca || !cb) continue;
        const m = meters(ca, cb);
        if (m > 50) continue;
        if (a.k.kind === "supply" && !bigrams(a.k.name).some((x) => bigrams(b.k.name).indexOf(x) >= 0)) continue;
        parent[find(i)] = find(j);
        dist[i] = Math.max(dist[i] || 0, m);
      }
    }
    const bag = {};
    nodes.forEach((n, i) => { const r = find(i); (bag[r] = bag[r] || []).push(Object.assign({ i }, n)); });
    let seq = meta.startId;
    return Object.values(bag).filter((g) => g.length > 1 && g.some((n) => n.src === "new")).map((g) => {
      const far = Math.round(Math.max.apply(null, g.map((n) => dist[n.i] || 0)));
      const oldIds = [];
      g.forEach((n) => { if (n.src === "old" && oldIds.indexOf(n.t.id) < 0) oldIds.push(n.t.id); });
      const common = bigrams(g[0].k.name).filter((b) => g.every((n) => bigrams(n.k.name).indexOf(b) >= 0));
      const signals = [far <= 1 ? "位置相同" : `相距 ${far} 公尺內`, oldIds.length ? `與既有任務單 ${oldIds.join("、")} 比對` : "同一次匯入", `需求種類相同（${kindLabel(g[0].k.kind)}）`];
      if (common.length) signals.push(`文字接近：${common.slice(0, 3).map((b) => `「${b}」`).join("")}`);
      const score = Math.min(0.95, 0.78 + (far <= 10 ? 0.08 : 0.03) + (common.length ? 0.07 : 0));   // 🚨 原型編的
      const items = g.map((n, i) => {
        const t = n.t, k = n.k, c = coordOf(t);
        return {
          key: String.fromCharCode(97 + i), ticketId: t.id, ticketTitle: t.title, team: t.team || null,
          owner: n.src === "new" ? meta.owner : (t.contact_name || "—"), createdAt: t.createdAt, updatedAt: t.createdAt,
          address: [t.city, t.street, t.no].filter(Boolean).join("") || (c ? `座標 ${c[0]}, ${c[1]}` : "（未填）"),
          contact: [t.contact_name, t.contact_phone].filter(Boolean).join(" ") || "（未填）",
          desc: t.desc || "", priority: t.priority,
          otherTasks: (t.tasks || []).filter((x) => x.id !== k.id).map((x) => x.name),
          claimed: (k.assignees || []).reduce((s, a) => s + (a.qty || 1), 0),
          task: { kind: k.kind, name: k.name, quantity: k.quantity },
        };
      });
      const id = "D-" + seq; seq += 1;
      return { id, kind: "ticket", source: "import", score: Math.round(score * 100) / 100, detectedAt: meta.at, status: "pending", signals, items };
    });
  }

  // ── 匯入對話框 ───────────────────────────────────────────────────────────
  function TicketImportDialog({ onClose }) {
    const tk = window.useTK();
    const [type, setType] = React.useState(null);
    const [rows, setRows] = React.useState(null);
    const [fileName, setFileName] = React.useState("");
    const [mapping, setMapping] = React.useState(null);
    const [loadErr, setLoadErr] = React.useState("");
    const [done, setDone] = React.useState(null);
    const fileRef = React.useRef(null);

    const cols = type ? columnsFor(type) : [];
    const result = React.useMemo(() => (type && rows && rows.length > 1 && mapping ? preview(rows, mapping, type, tk.allTickets) : null), [type, rows, mapping, tk.allTickets]);
    const failedLines = result ? Array.from(new Set(result.errors.map((e) => e.line))).length : 0;

    function take(r, name) {
      setLoadErr(""); setDone(null);
      if (!r || r.length < 2) { setRows(null); setMapping(null); setLoadErr(r && r.length === 1 ? "檔案只有標題列，沒有資料" : ""); return; }
      setRows(r); setFileName(name || ""); setMapping(guessMapping(r[0], columnsFor(type)));
    }
    function pickFile(e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      readFile(f).then((r) => take(r, f.name)).catch((err) => setLoadErr(err.message));
    }
    function chooseType(k) {
      setType(k);
      if (rows) setMapping(guessMapping(rows[0], columnsFor(k)));
    }
    function template() {
      const head = cols.filter((c) => c.mode !== "read").map((c) => c.key);
      download([head], `任務單匯入範本_${kindLabel(type)}`, "csv");
    }
    function commit() {
      const outcome = tk.applyImport(result.plans.filter((p) => !p.errs.length), type);
      setDone(Object.assign({ failed: failedLines }, outcome));
    }

    const box = { border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)" };
    const selCss = { flex: 1, minWidth: 0, height: 32, padding: "0 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)" };
    const chip = (on) => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: "var(--radius-full)", border: "1px solid " + (on ? "var(--color-border-accent)" : "var(--color-border-default)"), background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)", cursor: "pointer", font: "var(--font-label-300)", fontWeight: on ? 700 : 500, color: "var(--color-fg-neutral-default)" });
    const fieldLabel = (key) => { const c = cols.find((x) => x.key === key); return c ? c.label : key; };
    const teamLine = tk.importTeam ? `新建的單歸到「${tk.importTeam}」（你目前的身份）。` : "新建的單為「未指派」。";

    // —— 寫入完成 ——
    if (done) {
      return (
        <window.TKModal title="匯入完成" width={560} onClose={onClose} icon={<Icon n="CircleCheck" s={20} c="var(--color-fg-success)" />}
          footer={<Button variant="primary" onClick={onClose}>關閉</Button>}>
          <div data-tk-import-done style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="success">新增 {done.created} 列</Badge>
            <Badge tone="info">更新 {done.updated} 列</Badge>
            {done.failed > 0 && <Badge tone="danger">失敗 {done.failed} 列</Badge>}
            <span className="wg-data-xs" style={{ alignSelf: "center", color: "var(--color-fg-neutral-muted)" }}>批次 {done.batchId}</span>
          </div>
          {done.groups > 0 && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-info-subtle)" }}>
              <Icon n="ScanSearch" s={17} c="var(--color-fg-info)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="wg-caption">有 <b>{done.groups}</b> 組可能重複，已送進「重複審核」，由審核人員判斷。</div>
            </div>
          )}
          {done.failed > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="wg-caption" style={{ flex: 1, color: "var(--color-fg-neutral-muted)" }}>失敗的列沒有寫入。下載後修正，再匯入一次就好 —— 已成功的列不會重複建立。</span>
              <Button variant="outline" size="sm" startIcon={<Icon n="Download" s={15} />} onClick={() => download(failedReport(rows, result), `匯入失敗的列_${kindLabel(type)}_${stampName()}`, "csv")}>下載失敗的列</Button>
            </div>
          )}
        </window.TKModal>
      );
    }

    const canCommit = result && !result.fatal && (result.to_create + result.to_update) > 0;
    return (
      <window.TKModal title="匯入任務單" width={800} onClose={onClose}
        icon={<Icon n="Upload" s={20} c="var(--color-fg-neutral-subtle)" />}
        footer={<React.Fragment>
          <span className="wg-caption" style={{ marginRight: "auto", alignSelf: "center", color: "var(--color-fg-neutral-muted)" }}>
            {result && !result.fatal ? `新增 ${result.to_create}・更新 ${result.to_update}・失敗 ${failedLines}（共 ${result.row_count} 列）` : ""}
          </span>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!canCommit} startIcon={<Icon n="Upload" s={17} />} onClick={commit}>
            {canCommit ? `確認匯入 ${result.to_create + result.to_update} 列` : "確認匯入"}
          </Button>
        </React.Fragment>}>

        {/* 1 種類（BK-1） */}
        <div>
          <div className="wg-label-sm" style={{ fontWeight: 700, marginBottom: 8 }}>1 · 這份檔案是哪一種需求</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.keys(window.TK_TASK_KIND).map((k) => (
              <button key={k} data-tk-import-type={k} onClick={() => chooseType(k)} style={chip(type === k)}>
                <Icon n={window.TK_TASK_KIND[k].icon} s={15} c="var(--color-fg-neutral-subtle)" />{kindLabel(k)}
              </button>
            ))}
          </div>
          <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-neutral-muted)" }}>一個檔案只放一種需求；一列是一張單的一筆需求。同一張單有好幾筆需求，就寫好幾列、標題和電話相同。</div>
        </div>

        {/* 2 檔案 */}
        {type && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span className="wg-label-sm" style={{ fontWeight: 700 }}>2 · 上傳檔案</span>
              <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                <Button variant="outline" size="sm" startIcon={<Icon n="Download" s={15} />} onClick={template}>下載「{kindLabel(type)}」範本</Button>
                <Button variant="outline" size="sm" startIcon={<Icon n="FolderOpen" s={15} />} onClick={() => fileRef.current && fileRef.current.click()}>選擇 CSV／Excel</Button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={pickFile} style={{ display: "none" }} />
            <textarea rows={3} placeholder="也可以直接貼上 CSV 內容（第一列是欄位名稱）"
              onChange={(e) => take(parseCSV(e.target.value), "")}
              style={Object.assign({}, box, { width: "100%", boxSizing: "border-box", padding: 10, font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)", outline: "none", resize: "vertical" })} />
            {fileName && <div className="wg-data-xs" style={{ marginTop: 6, color: "var(--color-fg-neutral-muted)" }}>已讀取：{fileName}</div>}
            {loadErr && <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-danger)" }}>{loadErr}</div>}
            <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-neutral-muted)" }}>
              從「匯出」下載的檔案就是範本。新的單必填：標題、聯絡人、緯度、經度、需求名稱。位置用經緯度，沒有地址欄。
            </div>
          </div>
        )}

        {/* 3 欄位對應 */}
        {type && rows && mapping && (
          <div>
            <div className="wg-label-sm" style={{ fontWeight: 700, marginBottom: 8 }}>3 · 欄位對應 <span className="wg-caption" style={{ fontWeight: 400, color: "var(--color-fg-neutral-muted)" }}>檔案的每一欄要寫進哪個欄位</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {rows[0].map((h, i) => (
                <label key={i} data-tk-map-col={h} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="wg-data-xs" title={h} style={{ width: 96, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: mapping[i] ? "var(--color-fg-neutral-default)" : "var(--color-fg-warning)" }}>{h || `第 ${i + 1} 欄`}</span>
                  <select value={mapping[i] || ""} style={selCss} onChange={(e) => setMapping(Object.assign({}, mapping, { [i]: e.target.value }))}>
                    <option value="">（不匯入）</option>
                    {cols.filter((c) => c.mode !== "read").map((c) => <option key={c.key} value={c.key}>{c.label}{c.required ? " *" : ""}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {rows[0].some((h, i) => !mapping[i]) && (
              <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-warning)" }}>橘色的欄不會匯入（編號、建立時間這類唯讀欄位本來就不會匯入）。</div>
            )}
          </div>
        )}

        {/* 4 試算（BK-6） */}
        {result && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span className="wg-label-sm" style={{ fontWeight: 700 }}>4 · 試算結果</span>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>還沒寫入</span>
              {!result.fatal && <Badge tone="success">新增 {result.to_create}</Badge>}
              {!result.fatal && <Badge tone="info">更新 {result.to_update}</Badge>}
              {failedLines > 0 && <Badge tone="danger">失敗 {failedLines}</Badge>}
            </div>
            {result.to_update > 0 && (
              <div className="wg-caption" data-tk-import-update-note style={{ marginBottom: 8, color: "var(--color-fg-neutral-muted)" }}>
                「更新」是標題＋電話對到既有的單；只會改說明、狀態、優先級、災害類型和自訂欄位，空白的格子不動。位置、聯絡資料、需求內容建立後就不能用匯入改。
              </div>
            )}
            {result.errors.length > 0 && (
              <div data-tk-import-errors style={Object.assign({}, box, { maxHeight: 220, overflowY: "auto" })}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 110px 1fr", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--color-bg-neutral-sunken)" }}>
                    <span className="wg-data-xs" style={{ color: "var(--color-fg-neutral-muted)" }}>第 {e.line} 列</span>
                    <span className="wg-data-xs" style={{ color: "var(--color-fg-neutral-subtle)" }}>{e.column === "-" ? "整列" : fieldLabel(e.column)}</span>
                    <span className="wg-caption" style={{ color: "var(--color-fg-danger)" }}>{e.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, padding: "10px 12px", marginTop: 10, borderRadius: "var(--radius-md)", background: "var(--color-bg-info-subtle)", alignItems: "flex-start" }}>
              <Icon n="ScanSearch" s={16} c="var(--color-fg-info)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span className="wg-caption">新建的單跟手動建單一樣，可能重複的會送進「重複審核」，不會在這裡擋下。{teamLine}失敗的列不影響其他列，匯入後可以下載失敗的列修正再傳。</span>
            </div>
          </div>
        )}
      </window.TKModal>
    );
  }

  Object.assign(window, {
    TicketImportDialog, TicketExportMenu,
    TK_IMPORT_FIXED: FIXED, tkImportColumns: columnsFor,
    tkImportParseCSV: parseCSV, tkImportGuessMapping: guessMapping, tkImportPreview: preview,
    tkImportDedupGroups: dedupGroups,
    tkExportRows: exportRows, tkImportResolvePriority: resolvePriority, tkImportResolveStatus: resolveStatus,
  });
})();
