// station-import.jsx — 資源站點匯入／匯出（2026-10-15 改版：對齊後端 feature 015，介面比照任務單）
//
// 共用零件（讀檔、下載、權限、「新增 ▾」、匯出選單）在 js/shared/wg-bulk.jsx；任務單版在 js/admin/ticket/tk-import.jsx。
//
// 🔒 後端契約（GuangFuHero/optimized-version @ main 7bdd34a，Backend/app/services/bulk_*.py）
//   SBK-1 以「站點類型」為單位：一個檔案＝一種 station_type；一列＝一個站點。
//   SBK-2 欄位＝後端英文欄名（bulk_columns.STATION_COLUMNS）。匯出檔就是匯入範本（ADR-119）。
//         ⚠️ 後端站點檔**沒有聯絡人、電話、營運狀態**欄位 —— 匯入建不了這些，要建立後在站點裡補。
//   SBK-3 建立時必填：name、latitude、longitude。地址拆成 county／city／lane／alley／no／floor／room。
//   SBK-4 已存在的站點會「更新」：用「站名＋縣市＋鄉鎮市區」比對（ADR-107）。對到兩個以上＝這列失敗（ADR-113）；空白格＝不動。
//         更新改得到：說明、開放時間、level、comment、公開範圍、緯度、經度。站名與地址建立後不能用匯入改
//         （後端 UpdateStationInput 碰不到 secondary_locations）。
//   SBK-5 同一個檔案裡比對鍵重複的列 → 全部失敗，不是最後一列贏（duplicate_key_rows）。
//   SBK-6 先試算再確認；好的列照寫、壞的列回報；一次最多 500 列。
//   SBK-7 匯出：選一種類型，匯出權限範圍內該類型全部站點；不吃列表篩選；CSV 或 Excel；最多 10,000 筆。
//         團隊管理員的範圍＝指派給自己團隊的站點（RBAC 矩陣 station.export＝team）。
//
// 🔒 裁示
//   BULK-102（11-01）匯入匯出給超級管理員、政府隊成員、團隊管理員 —— 見 wg-bulk.jsx。
//   🔄 2026-10-27 Carol（#97 核對）：**匯入的站點營運狀態用預設（開設中）、而且是官方**。
//         理由：後台匯入理解為可信的來源。推翻 2026-08-06「匯入後一律已關閉」與 2026-08-21「匯入 ≠ 官方造冊」。
//         （後端 operational_status 預設 active；is_official 照 ADMIN-026 設 true）
//
// 🚨 Claude 定的：原型模擬重複判斷＝相距 50 公尺內＋同類型，寫進 重複審核的「站點」分頁（正式版由後端判斷）。
//    既有站點的地址在原型裡是一整串，拆欄位時：開頭「花蓮縣」→ county，area → city，其餘放 lane。
(function () {
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const Icon = window.WGIcon;
  const B = window.WGBulk;

  const MAX_IMPORT = 500, MAX_EXPORT = 10000;

  const COLS = [
    { key: "uuid",                label: "編號",       mode: "read" },
    { key: "name",                label: "站點名稱",   mode: "create", required: true },
    { key: "type",                label: "類型",       mode: "both" },
    { key: "description",         label: "說明",       mode: "both" },
    { key: "op_hour",             label: "開放時間",   mode: "both" },
    { key: "level",               label: "level",      mode: "both", int: true },
    { key: "comment",             label: "comment",    mode: "both" },
    { key: "source",              label: "來源",       mode: "create" },
    { key: "visibility",          label: "公開範圍",   mode: "both" },
    { key: "latitude",            label: "緯度",       mode: "both", required: true },
    { key: "longitude",           label: "經度",       mode: "both", required: true },
    { key: "county",              label: "縣市",       mode: "create" },
    { key: "city",                label: "鄉鎮市區",   mode: "create" },
    { key: "lane",                label: "路街",       mode: "create" },
    { key: "alley",               label: "巷弄",       mode: "create" },
    { key: "no",                  label: "號",         mode: "create" },
    { key: "floor",               label: "樓",         mode: "create" },
    { key: "room",                label: "室",         mode: "create" },
    { key: "verification_status", label: "查核狀態",   mode: "read" },
    { key: "is_official",         label: "官方認定",   mode: "read" },
    { key: "confidence_score",    label: "信心分數",   mode: "read" },
    { key: "created_at",          label: "建立時間",   mode: "read" },
    { key: "updated_at",          label: "更新時間",   mode: "read" },
  ];
  const ALIASES = {
    name: ["站名", "名稱", "站點", "據點名稱"], op_hour: ["開放時段", "服務時間", "hours"], description: ["描述", "備註"],
    latitude: ["lat", "y"], longitude: ["lng", "lon", "x"], county: ["縣", "市"], city: ["鄉鎮", "行政區", "鄉鎮市", "area"],
    lane: ["路", "街", "路名", "地址"], uuid: ["id", "編號"],
  };
  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
  const typeLabel = (k) => (SD.TYPE[k] || {}).label || k;

  // 原型站點 → 後端欄位（地址拆欄見檔頭 🚨）
  function addrParts(s) {
    let rest = String(s.address || "").replace(/\s+/g, "");
    let county = "";
    if (rest.indexOf("花蓮縣") === 0) { county = "花蓮縣"; rest = rest.slice(3); }
    const city = s.city || s.area || "";
    if (city && rest.indexOf(city) === 0) rest = rest.slice(city.length);
    return { county: s.county != null ? s.county : county, city, lane: s.lane != null ? s.lane : rest };
  }
  const skey = (name, county, city) => norm(name) + "|" + norm(county) + "|" + norm(city);

  // ── 匯出（SBK-7）────────────────────────────────────────────────────────
  function exportRows(stations, type) {
    const out = [COLS.map((c) => c.key)];
    stations.filter((s) => !s.deleted && s.type === type).forEach((s) => {
      const a = addrParts(s);
      const v = {
        uuid: s.id, name: s.name, type: s.type, description: s.description || "", op_hour: s.hours && s.hours !== "—" ? s.hours : "",
        level: s.level != null ? s.level : "", comment: s.comment || "", source: s.source || "", visibility: s.visibility || "public",
        latitude: s.lat == null ? "" : s.lat, longitude: s.lng == null ? "" : s.lng,
        county: a.county, city: a.city, lane: a.lane, alley: s.alley || "", no: s.no || "", floor: s.floor || "", room: s.room || "",
        verification_status: s.verified ? "human_verified" : "unverified", is_official: s.isOfficial ? "true" : "false",
        confidence_score: "", created_at: s.established || "", updated_at: s.updated || "",
      };
      out.push(COLS.map((c) => v[c.key]));
    });
    return out;
  }
  // 團隊管理員只匯出指派給自己團隊的站點（station.export＝team）
  function exportPool(stations, persona) {
    const id = window.wgActingIdentity ? window.wgActingIdentity(persona) : null;
    const live = stations.filter((s) => !s.deleted);
    return id && id.kind === "team" ? live.filter((s) => s.assignedTeam === id.teamName) : live;
  }
  function StationExportMenu({ stations, persona, onToast }) {
    const pool = exportPool(stations, persona);
    const counts = {};
    pool.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
    const id = window.wgActingIdentity ? window.wgActingIdentity(persona) : null;
    const scope = id && id.kind === "team" ? `指派給「${id.teamName}」的` : "";
    const types = SD.TYPE_ORDER.map((k) => ({ key: k, label: typeLabel(k), icon: SD.TYPE[k].icon, count: counts[k] || 0 }));
    return (
      <window.WGBulkExportMenu types={types} noun="站點" max={MAX_EXPORT}
        note={(t) => <span>匯出你權限範圍內{scope}<b>全部</b>「{t.label}」站點，<b>不套用列表上的篩選</b>。一列＝一個站點。檔案裡沒有聯絡人、電話、營運狀態（後端匯出沒有這些欄位）。改完可以直接匯入：站名＋縣市＋鄉鎮相同的會更新原本的站點。</span>}
        onExport={(type, format) => B.download(exportRows(pool, type), `資源站點_${typeLabel(type)}_${B.stampName()}_${counts[type] || 0}筆`, format)
          .then(() => onToast(counts[type] ? `已匯出「${typeLabel(type)}」站點 ${counts[type]} 筆` : `已下載「${typeLabel(type)}」空白範本`))
          .catch((e) => onToast(e.message, "warning"))} />
    );
  }

  // ── 匯入：試算（SBK-4〜6）──────────────────────────────────────────────
  function guessMapping(header) {
    const map = {};
    header.forEach((h, i) => {
      const n = norm(h);
      const hit = COLS.find((c) => norm(c.key) === n || norm(c.label) === n || (ALIASES[c.key] || []).some((a) => norm(a) === n));
      map[i] = hit && hit.mode !== "read" ? hit.key : "";
    });
    return map;
  }
  function preview(rows, mapping, type, existing) {
    const body = rows.slice(1);
    if (body.length > MAX_IMPORT) return { row_count: body.length, to_create: 0, to_update: 0, fatal: true, plans: [], errors: [{ line: 1, column: "-", message: `一次最多 ${MAX_IMPORT} 列，這個檔案有 ${body.length} 列。請拆成幾個檔案` }] };
    const index = {};
    existing.filter((s) => !s.deleted).forEach((s) => { const a = addrParts(s); const k = skey(s.name, a.county, a.city); (index[k] = index[k] || []).push(s); });
    const seen = {}, plans = [], errors = [];
    body.forEach((r, i) => {
      const line = i + 2, v = {}, errs = [];
      Object.keys(mapping).forEach((ci) => { const f = mapping[ci]; if (f) v[f] = String(r[ci] == null ? "" : r[ci]).trim(); });
      const err = (column, message) => errs.push({ line, column, message });
      const key = skey(v.name, v.county, v.city);
      const hits = v.name ? (index[key] || []) : [];
      let kind = "create", target = null;
      if (hits.length > 1) err("-", `對到 ${hits.length} 個站點（${hits.map((s) => s.id).join("、")}），無法判斷要更新哪一個`);
      else if (hits.length === 1) { kind = "update"; target = hits[0]; }
      if (v.type && norm(v.type) !== norm(type) && norm(v.type) !== norm(typeLabel(type))) err("type", `這份檔案是「${typeLabel(type)}」，這列寫的是「${v.type}」`);
      if (kind === "create") COLS.filter((c) => c.required).forEach((c) => { if (!v[c.key]) err(c.key, `新的站點必填「${c.label}」`); });
      ["latitude", "longitude"].forEach((f) => {
        if (v[f]) { const x = Number(v[f]); if (!Number.isFinite(x) || (f === "latitude" ? Math.abs(x) > 90 : Math.abs(x) > 180)) err(f, `「${v[f]}」不是有效的${f === "latitude" ? "緯度" : "經度"}`); }
      });
      if (v.level && !/^-?\d+$/.test(v.level)) err("level", `level 要是整數，這列是「${v.level}」`);
      if (v.name) (seen[key] = seen[key] || []).push(line);
      plans.push({ line, kind, target, key, v, errs });
    });
    Object.keys(seen).forEach((k) => {
      const ls = seen[k];
      if (ls.length > 1) plans.forEach((p) => { if (ls.indexOf(p.line) >= 0) p.errs.push({ line: p.line, column: "-", message: `跟第 ${ls.filter((x) => x !== p.line).join("、")} 列是同一個站點（站名＋縣市＋鄉鎮相同）` }); });
    });
    plans.forEach((p) => p.errs.forEach((e) => errors.push(e)));
    const good = plans.filter((p) => !p.errs.length);
    return { row_count: body.length, to_create: good.filter((p) => p.kind === "create").length, to_update: good.filter((p) => p.kind === "update").length, errors, plans };
  }

  // ── 原型模擬重複判斷 → 重複審核「站點」分頁 ─────────────────────────
  function meters(a, b) {
    const R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function dedupGroups(made, existing, meta) {
    const nodes = existing.filter((s) => !s.deleted && s.lat != null).map((s) => ({ src: "old", s })).concat(made.map((s) => ({ src: "new", s })));
    const parent = nodes.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const dist = {};
    nodes.forEach((a, i) => {
      if (a.src !== "new") return;
      nodes.forEach((b, j) => {
        if (i === j || a.s.type !== b.s.type) return;
        const m = meters([a.s.lat, a.s.lng], [b.s.lat, b.s.lng]);
        if (m > 50) return;
        parent[find(i)] = find(j); dist[i] = Math.max(dist[i] || 0, m);
      });
    });
    const bag = {};
    nodes.forEach((n, i) => { const k = find(i); (bag[k] = bag[k] || []).push(Object.assign({ i }, n)); });
    let seq = meta.startId;
    return Object.values(bag).filter((g) => g.length > 1 && g.some((n) => n.src === "new")).map((g) => {
      const far = Math.round(Math.max.apply(null, g.map((n) => dist[n.i] || 0)));
      const old = g.filter((n) => n.src === "old").map((n) => n.s.id);
      const id = "D-" + seq; seq += 1;
      return {
        id, kind: "station", source: "import", score: far <= 10 ? 0.88 : 0.81, detectedAt: meta.at, status: "pending",   // 🚨 分數原型編的
        signals: [far <= 1 ? "位置相同" : `相距 ${far} 公尺內`, `類型相同（${typeLabel(g[0].s.type)}）`, old.length ? `與既有站點 ${old.join("、")} 比對` : "同一次匯入"],
        items: g.map((n, i) => ({
          key: String.fromCharCode(97 + i), stationId: n.s.id, team: n.s.assignedTeam || null,
          owner: n.src === "new" ? meta.owner : (n.s.createdBy || "—"), createdAt: n.s.established || "", updatedAt: n.s.updated || "",
          name: n.s.name, type: typeLabel(n.s.type), address: n.s.address, hours: n.s.hours === "—" ? "" : n.s.hours,
          contact: n.s.contact === "—" ? "" : (n.s.contact || ""), opStatus: (SD.STATUS[n.s.status] || {}).label || n.s.status, pendingSuggestions: 0,
        })),
      };
    });
  }

  // ── 疑似重複：匯入前逐列決定要不要建立 ─────────────────────────────────
  // 🔒 DUP-IMP-101（#97，Carol／Sucre 10-27）：批次匯入先只跟資料庫比（同檔內的靠重複審核佇列）；
  //    每列只有「仍要建立／不建立」兩個選項，**預設不建立**；有「全部」按鈕；不建立的列進錯誤報告；照列號排；
  //    每筆顯示名稱、類型、營運狀態、距離、建立時間，不顯示相似度。原型判準：同類型、50 公尺內（🚨 我定的，正式版由後端給）。
  function importSuspects(result, existing, type) {
    if (!result || result.fatal) return [];
    const olds = existing.filter((s) => !s.deleted && s.lat != null && s.type === type);
    return result.plans.filter((p) => p.kind === "create" && !p.errs.length && p.v.latitude && p.v.longitude).map((p) => {
      const at = [Number(p.v.latitude), Number(p.v.longitude)];
      const near = olds.map((s) => ({ s, m: Math.round(meters(at, [s.lat, s.lng])) })).filter((x) => x.m <= 50).sort((a, b) => a.m - b.m);
      return near.length ? { line: p.line, name: p.v.name, near } : null;
    }).filter(Boolean);
  }
  // 🔒 DUP-IMP-102 二選一的樣子（Sucre 11-01，回 PR #233；補 BTN-107）：
  //    沒選中＝灰框黑字，滑過只變淡灰、不上浮；選中＝淡橘底橘框橘字＋打勾（不只靠顏色）。
  //    ❌ 不要讓沒選中的那顆滑過時變淡橘 —— 跟選中一模一樣，一時分不出哪個才是選中的。
  function ChoicePair({ value, onChange, line }) {
    const B2 = window.WGButton;
    // 沒載入共用按鈕（wg-button.jsx）的頁面：用同一套規則的簡單版，不要整個對話框掛掉
    const plain = (v, label) => {
      const on = value === v;
      return React.createElement("button", { key: v, type: "button", "aria-pressed": on, "data-dup-choice": v + "-" + line, onClick: () => onChange(v),
        className: on ? "" : "wg-choice-plain",
        style: { display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: "var(--radius-full)", cursor: "pointer",
          font: "var(--font-label-400)", fontWeight: 700,
          border: "1.5px solid " + (on ? "var(--color-border-accent)" : "var(--color-border-default)"),
          background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)",
          color: on ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-default)" } },
        on ? React.createElement(Icon, { n: "Check", s: 15 }) : null, label);
    };
    const opt = (v, label) => {
      if (!B2) return plain(v, label);
      const on = value === v;
      return React.createElement(B2, { key: v, variant: "outline", size: "sm", selected: on, className: on ? "" : "wg-btn--choice", "data-dup-choice": v + "-" + line,
        startIcon: on ? React.createElement(Icon, { n: "Check", s: 15 }) : null, onClick: () => onChange(v) }, label);
    };
    return React.createElement("span", { role: "radiogroup", "aria-label": `第 ${line} 列要不要建立`, style: { display: "inline-flex", gap: 8 } },
      !B2 && React.createElement("style", null, ".wg-choice-plain:hover{background:var(--color-bg-neutral-subtle)!important}"),
      opt("skip", "不建立"), opt("file", "仍要建立"));
  }

  // ── 匯入對話框（介面同任務單）──────────────────────────────────────────
  function StationImportDialog({ existing, onClose, onApply }) {
    const [type, setType] = React.useState(null);
    const [rows, setRows] = React.useState(null);
    const [fileName, setFileName] = React.useState("");
    const [mapping, setMapping] = React.useState(null);
    const [loadErr, setLoadErr] = React.useState("");
    const [done, setDone] = React.useState(null);
    const fileRef = React.useRef(null);
    const result = React.useMemo(() => (type && rows && rows.length > 1 && mapping ? preview(rows, mapping, type, existing) : null), [type, rows, mapping, existing]);
    const failedLines = result ? Array.from(new Set(result.errors.map((e) => e.line))).length : 0;
    const suspects = React.useMemo(() => importSuspects(result, existing, type), [result, existing, type]);
    const [choice, setChoice] = React.useState({});            // line → "file"｜"skip"；沒有＝預設不建立
    const pick = (line) => choice[line] || "skip";
    const skipped = suspects.filter((x) => pick(x.line) === "skip").map((x) => x.line);

    function take(r, name) {
      setLoadErr(""); setDone(null);
      if (!r || r.length < 2) { setRows(null); setMapping(null); setLoadErr(r && r.length === 1 ? "檔案只有標題列，沒有資料" : ""); return; }
      setRows(r); setFileName(name || ""); setMapping(guessMapping(r[0]));
    }
    function pickFile(e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) B.readFile(f).then((r) => take(r, f.name)).catch((x) => setLoadErr(x.message));
    }
    function commit() { setDone(Object.assign({ failed: failedLines, declined: skipped.length }, onApply(result.plans.filter((p) => !p.errs.length && skipped.indexOf(p.line) < 0), type))); }

    const box = { border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)" };
    const selCss = { flex: 1, minWidth: 0, height: 32, padding: "0 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)" };
    const chip = (on) => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: "var(--radius-full)", border: "1px solid " + (on ? "var(--color-border-accent)" : "var(--color-border-default)"), background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)", cursor: "pointer", font: "var(--font-label-300)", fontWeight: on ? 700 : 500, color: "var(--color-fg-neutral-default)" });
    const fieldLabel = (key) => { const c = COLS.find((x) => x.key === key); return c ? c.label : key; };

    if (done) {
      return (
        <window.StationModal title="匯入完成" width={560} onClose={onClose} icon={<Icon n="CircleCheck" s={20} c="var(--color-fg-success)" />}
          footer={<Button variant="primary" onClick={onClose}>關閉</Button>}>
          <div data-st-import-done style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="success">新增 {done.created} 列</Badge>
            <Badge tone="info">更新 {done.updated} 列</Badge>
            {done.failed > 0 && <Badge tone="danger">失敗 {done.failed} 列</Badge>}
            {done.declined > 0 && <Badge tone="neutral">選了不建立 {done.declined} 列</Badge>}
            <span className="wg-data-xs" style={{ alignSelf: "center", color: "var(--color-fg-neutral-muted)" }}>批次 {done.batchId}</span>
          </div>
          {done.created > 0 && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-warning-subtle)" }}>
              <Icon n="Info" s={17} c="var(--color-fg-warning)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="wg-caption">新增的站點是「開設中」、標為官方（後台匯入視為可信來源）。檔案裡沒有聯絡人與電話，請之後補上。</div>
            </div>
          )}
          {done.groups > 0 && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-info-subtle)" }}>
              <Icon n="ScanSearch" s={17} c="var(--color-fg-info)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="wg-caption">有 <b>{done.groups}</b> 組可能重複，已送進「重複審核」的站點分頁。</div>
            </div>
          )}
          {done.failed > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="wg-caption" style={{ flex: 1, color: "var(--color-fg-neutral-muted)" }}>失敗的列沒有寫入。下載後修正，再匯入一次就好 —— 已成功的列不會重複建立。</span>
              <Button variant="outline" size="sm" startIcon={<Icon n="Download" s={15} />} onClick={() => B.download(B.failedReport(rows, result.errors), `站點匯入失敗的列_${typeLabel(type)}_${B.stampName()}`, "csv")}>下載失敗的列</Button>
            </div>
          )}
        </window.StationModal>
      );
    }

    const AllBtn = window.WGButton || Button;   // 沒載入 wg-button.jsx 的頁面退回設計系統的 Button
    const willWrite = result ? result.to_create + result.to_update - skipped.length : 0;
    const canCommit = result && !result.fatal && willWrite > 0;
    return (
      <window.StationModal title="匯入資源站點" width={800} onClose={onClose} icon={<Icon n="Upload" s={20} c="var(--color-fg-neutral-subtle)" />}
        footer={<React.Fragment>
          <span className="wg-caption" style={{ marginRight: "auto", alignSelf: "center", color: "var(--color-fg-neutral-muted)" }}>
            {result && !result.fatal ? `新增 ${result.to_create}・更新 ${result.to_update}・失敗 ${failedLines}（共 ${result.row_count} 列）` : ""}
          </span>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!canCommit} startIcon={<Icon n="Upload" s={17} />} onClick={commit}>{canCommit ? `確認匯入 ${willWrite} 列` : "確認匯入"}</Button>
        </React.Fragment>}>

        <div>
          <div className="wg-label-sm" style={{ fontWeight: 700, marginBottom: 8 }}>1 · 這份檔案是哪一種站點</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SD.TYPE_ORDER.map((k) => (
              <button key={k} data-st-import-type={k} onClick={() => setType(k)} style={chip(type === k)}>
                <Icon n={SD.TYPE[k].icon} s={15} c="var(--color-fg-neutral-subtle)" />{typeLabel(k)}
              </button>
            ))}
          </div>
          <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-neutral-muted)" }}>一個檔案只放一種站點；一列是一個站點。</div>
        </div>

        {type && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span className="wg-label-sm" style={{ fontWeight: 700 }}>2 · 上傳檔案</span>
              <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                <Button variant="outline" size="sm" startIcon={<Icon n="Download" s={15} />} onClick={() => B.download([COLS.filter((c) => c.mode !== "read").map((c) => c.key)], `資源站點匯入範本_${typeLabel(type)}`, "csv")}>下載「{typeLabel(type)}」範本</Button>
                <Button variant="outline" size="sm" startIcon={<Icon n="FolderOpen" s={15} />} onClick={() => fileRef.current && fileRef.current.click()}>選擇 CSV／Excel</Button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={pickFile} style={{ display: "none" }} />
            <textarea rows={3} placeholder="也可以直接貼上 CSV 內容（第一列是欄位名稱）" onChange={(e) => take(B.parseCSV(e.target.value), "")}
              style={Object.assign({}, box, { width: "100%", boxSizing: "border-box", padding: 10, font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)", outline: "none", resize: "vertical" })} />
            {fileName && <div className="wg-data-xs" style={{ marginTop: 6, color: "var(--color-fg-neutral-muted)" }}>已讀取：{fileName}</div>}
            {loadErr && <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-danger)" }}>{loadErr}</div>}
            <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-neutral-muted)" }}>
              從「匯出」下載的檔案就是範本。新的站點必填：站點名稱、緯度、經度。檔案裡沒有聯絡人、電話、營運狀態，建立後再補。
            </div>
          </div>
        )}

        {type && rows && mapping && (
          <div>
            <div className="wg-label-sm" style={{ fontWeight: 700, marginBottom: 8 }}>3 · 欄位對應 <span className="wg-caption" style={{ fontWeight: 400, color: "var(--color-fg-neutral-muted)" }}>檔案的每一欄要寫進哪個欄位</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {rows[0].map((h, i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="wg-data-xs" title={h} style={{ width: 96, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: mapping[i] ? "var(--color-fg-neutral-default)" : "var(--color-fg-warning)" }}>{h || `第 ${i + 1} 欄`}</span>
                  <select value={mapping[i] || ""} style={selCss} onChange={(e) => setMapping(Object.assign({}, mapping, { [i]: e.target.value }))}>
                    <option value="">（不匯入）</option>
                    {COLS.filter((c) => c.mode !== "read").map((c) => <option key={c.key} value={c.key}>{c.label}{c.required ? " *" : ""}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {rows[0].some((h, i) => !mapping[i]) && <div className="wg-caption" style={{ marginTop: 6, color: "var(--color-fg-warning)" }}>橘色的欄不會匯入（編號、建立時間這類唯讀欄位本來就不會匯入）。</div>}
          </div>
        )}

        {result && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span className="wg-label-sm" style={{ fontWeight: 700 }}>4 · 試算結果</span>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>還沒寫入</span>
              {!result.fatal && <Badge tone="success">新增 {result.to_create}</Badge>}
              {!result.fatal && <Badge tone="info">更新 {result.to_update}</Badge>}
              {failedLines > 0 && <Badge tone="danger">失敗 {failedLines}</Badge>}
            </div>
            {suspects.length > 0 && (
              <div data-st-import-suspects style={Object.assign({}, box, { marginBottom: 10, background: "var(--color-bg-neutral-default)" })}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--color-bg-neutral-sunken)", flexWrap: "wrap" }}>
                  <Icon n="ScanSearch" s={16} c="var(--color-fg-warning)" />
                  <span className="wg-label-sm" style={{ fontWeight: 700 }}>{suspects.length} 列可能跟既有站點重複</span>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>沒選「仍要建立」的列不會建立</span>
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                    <AllBtn variant="ghost" size="sm" onClick={() => setChoice(Object.fromEntries(suspects.map((x) => [x.line, "skip"])))}>全部不建立</AllBtn>
                    <AllBtn variant="ghost" size="sm" onClick={() => setChoice(Object.fromEntries(suspects.map((x) => [x.line, "file"])))}>全部仍要建立</AllBtn>
                  </span>
                </div>
                {suspects.map((x) => (
                  <div key={x.line} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--color-bg-neutral-sunken)" }}>
                    <span className="wg-data-xs" style={{ color: "var(--color-fg-neutral-muted)" }}>第 {x.line} 列</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="wg-label-sm" style={{ fontWeight: 700 }}>{x.name}</div>
                      {x.near.slice(0, 2).map((n) => (
                        <div key={n.s.id} className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
                          像：{n.s.name}・{typeLabel(n.s.type)}・{(SD.STATUS[n.s.status] || {}).label || "—"}・相距 {n.m} 公尺{n.s.established ? "・建立於 " + n.s.established : ""}
                        </div>
                      ))}
                    </div>
                    <ChoicePair line={x.line} value={pick(x.line)} onChange={(v) => setChoice((c) => Object.assign({}, c, { [x.line]: v }))} />
                  </div>
                ))}
              </div>
            )}
            {result.to_update > 0 && (
              <div className="wg-caption" data-st-import-update-note style={{ marginBottom: 8, color: "var(--color-fg-neutral-muted)" }}>
                「更新」是站名＋縣市＋鄉鎮對到既有的站點；只會改說明、開放時間、level、comment、公開範圍和位置（經緯度），空白的格子不動。站名與地址建立後不能用匯入改。
              </div>
            )}
            {result.errors.length > 0 && (
              <div data-st-import-errors style={Object.assign({}, box, { maxHeight: 220, overflowY: "auto" })}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 110px 1fr", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--color-bg-neutral-sunken)" }}>
                    <span className="wg-data-xs" style={{ color: "var(--color-fg-neutral-muted)" }}>第 {e.line} 列</span>
                    <span className="wg-data-xs" style={{ color: "var(--color-fg-neutral-subtle)" }}>{e.column === "-" ? "整列" : fieldLabel(e.column)}</span>
                    <span className="wg-caption" style={{ color: "var(--color-fg-danger)" }}>{e.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, padding: "10px 12px", marginTop: 10, borderRadius: "var(--radius-md)", background: "var(--color-bg-warning-subtle)", alignItems: "flex-start" }}>
              <Icon n="Info" s={16} c="var(--color-fg-warning)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span className="wg-caption">新增的站點是「開設中」、標為官方（後台匯入視為可信來源）。跟既有站點像的在上面逐列選要不要建立；同一個檔案裡互相重複的，建立後送進「重複審核」。</span>
            </div>
          </div>
        )}
      </window.StationModal>
    );
  }

  Object.assign(window, {
    StationImportDialog, StationExportMenu,
    stationExportRows: exportRows, stationImportPreview: preview, stationImportDedupGroups: dedupGroups,
    stationImportGuessMapping: guessMapping, STATION_IMPORT_COLS: COLS,
  });
})();
