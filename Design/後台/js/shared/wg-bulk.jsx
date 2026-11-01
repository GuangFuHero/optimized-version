// wg-bulk.jsx — 任務單與資源站點共用的「批次匯入匯出」零件（2026-10-15）
//
// 兩頁的匯入匯出都對齊同一套後端（feature 015，Backend/app/services/bulk_*.py），
// 所以讀檔、下載、權限、按鈕長相只寫這一份。❌ 不要在某一頁另抄一份 —— 改一邊漏一邊。
//   任務單：js/admin/ticket/tk-import.jsx　　資源站點：js/admin/station-v2/station-import.jsx
//
// 🔒 BULK-102 權限（Sucre 2026-11-01，回 PR #236；推翻 10-15 BULK-101）：匯入與匯出都給
//      超級管理員、政府隊的成員（管理員與成員都可以）、團隊管理員（非政府組織隊只有管理員）。
//      資料檢核員、非政府組織隊的成員都不行。
//      判斷依右上角「目前身份」（切換身份是硬邊界，8/17）：同一個人在政府隊、切到非政府組織隊當成員 → 不行。
//      已停權的團隊身份不算。
//      ⚠️ 後端 seed_rbac.py 目前給 data_auditor station.export／ticket.export＝all，角色與權限.md:82,88 也不同 —— 要請後端改成這一條。
//      ❌ 不要只用平台角色判斷 —— 非政府組織隊的成員平台角色也是 ngo，但不能匯入匯出；要看「團隊類型＋團隊角色」。
(function () {
  const { Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  function canBulk(persona) {
    const id = window.wgActingIdentity ? window.wgActingIdentity(persona) : null;
    if (!id) return false;
    if (id.kind === "platform") return id.role === "super";
    if (id.kind !== "team" || id.status === "suspended") return false;
    return id.teamType === "gov" || id.role === "admin";   // BULK-102：政府隊全員、其他隊只有管理員
  }

  // ── 讀檔：CSV 自己解析（支援引號內的逗號與換行）；Excel 用 SheetJS，第一次用到才載 ──
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    const src = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
        continue;
      }
      if (c === '"') { q = true; continue; }
      if (c === ",") { row.push(cell); cell = ""; continue; }
      if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
      cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  }
  let xlsxPromise = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPromise) {
      xlsxPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js";
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => { xlsxPromise = null; reject(new Error("Excel 元件載入失敗，請改用 CSV")); };
        document.head.appendChild(s);
      });
    }
    return xlsxPromise;
  }
  function readFile(file) {
    const isX = /\.xlsx?$/i.test(file.name);
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onerror = () => reject(new Error("檔案讀取失敗"));
      if (!isX) { rd.onload = () => resolve(parseCSV(String(rd.result || ""))); rd.readAsText(file, "utf-8"); return; }
      rd.onload = () => loadXLSX().then((X) => {
        const wb = X.read(new Uint8Array(rd.result), { type: "array" });
        const sh = wb.Sheets[wb.SheetNames[0]];
        resolve(X.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "" }).filter((r) => r.some((x) => String(x).trim() !== "")));
      }).catch(reject);
      rd.readAsArrayBuffer(file);
    });
  }
  const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  // rows：二維陣列（第一列是表頭）；name 不含副檔名；format：csv | xlsx
  function download(rows, name, format) {
    if (format === "xlsx") {
      return loadXLSX().then((X) => {
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), "data");
        X.writeFile(wb, name + ".xlsx");
        return name + ".xlsx";
      });
    }
    const text = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });   // BOM：Excel 才認得 UTF-8
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    // ❌ 不要立刻 revoke：瀏覽器還沒開始下載就收回網址，檔名會掉成「download」
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return Promise.resolve(name + ".csv");
  }
  const stampName = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  // 失敗列報告：原檔的列＋一欄 error（後端 error_report 的原型版）
  function failedReport(rows, errors) {
    const bad = {};
    errors.forEach((e) => { (bad[e.line] = bad[e.line] || []).push((e.column !== "-" ? e.column + "：" : "") + e.message); });
    const out = [rows[0].concat(["error"])];
    Object.keys(bad).map(Number).sort((a, b) => a - b).forEach((line) => { if (rows[line - 1]) out.push(rows[line - 1].concat([bad[line].join("；")])); });
    return out;
  }

  // ── 「新增 ▾」拆分按鈕 ──────────────────────────────────────────────────
  // 匯入＝一次新增很多筆，所以收在新增的箭頭裡，不另佔一顆按鈕（2026-10-15）。
  //   主體照舊點了就開新增表單 —— ❌ 不要把主體改成開選單，最常用的動作會多一次點擊。
  //   onImport 沒給（沒有 BULK-102 權限）→ 只剩一般按鈕，連箭頭都不 render（乾淨切）。
  function WGNewSplitButton({ label, onNew, onImport, newItem, importItem }) {
    const [menu, setMenu] = React.useState(false);
    // 2026-11-01：有載入共用拆分按鈕（js/shared/wg-button.jsx，BTN-112）就用它；外側膠囊、相接處小圓角
    if (window.WGSplitButton) return (
      <span data-wg-new-split style={{ display: "inline-flex" }}>
        <window.WGSplitButton label={label} icon={<Icon n="Plus" s={17} />} onClick={onNew}
          items={onImport ? [{ icon: <Icon n="Plus" s={16} />, label: newItem, onClick: onNew }, { icon: <Icon n="Upload" s={16} />, label: importItem, onClick: onImport }] : null} />
      </span>
    );
    if (!onImport) return <Button variant="primary" startIcon={<Icon n="Plus" s={17} />} onClick={onNew}>{label}</Button>;
    return (
      <span data-wg-new-split style={{ position: "relative", display: "inline-flex", alignItems: "stretch" }}>
        <Button variant="primary" startIcon={<Icon n="Plus" s={17} />} onClick={onNew}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>{label}</Button>
        <button aria-label="更多新增方式" aria-expanded={menu} onClick={() => setMenu((m) => !m)}
          style={{ width: 38, border: "none", borderLeft: "1px solid rgba(255,255,255,0.35)", borderTopRightRadius: "var(--radius-md)", borderBottomRightRadius: "var(--radius-md)", background: "var(--color-bg-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon n="ChevronDown" s={17} c="#fff" />
        </button>
        {menu && (
          <span>
            <span onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }}></span>
            <span className="tk-rise" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 401, background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", minWidth: 200, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {[["Plus", newItem, onNew], ["Upload", importItem, onImport]].map(([ic, text, fn]) => (
                <button key={text} onClick={() => { setMenu(false); fn(); }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", font: "var(--font-label-300)", textAlign: "left", whiteSpace: "nowrap", color: "var(--color-fg-neutral-default)" }}>
                  <Icon n={ic} s={16} c="currentColor" />{text}
                </button>
              ))}
            </span>
          </span>
        )}
      </span>
    );
  }

  // ── 依種類匯出的選單（後端：一次一種 task_type／station_type，不吃列表篩選）──
  // types：[{ key, label, icon, count }]；noun：「需求」「站點」；note(type)：說明文字
  // onExport(typeKey, format) → Promise<訊息>
  function WGBulkExportMenu({ types, noun, note, max, onExport }) {
    const [open, setOpen] = React.useState(false);
    const [type, setType] = React.useState(types[0] && types[0].key);
    const [format, setFormat] = React.useState("csv");
    const [busy, setBusy] = React.useState(false);
    const cur = types.find((t) => t.key === type) || types[0];
    const n = cur ? cur.count : 0;
    function go() {
      setBusy(true);
      Promise.resolve(onExport(type, format)).then(() => setOpen(false)).catch(() => {}).then(() => setBusy(false));
    }
    const radio = (on) => ({ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid " + (on ? "var(--color-border-accent)" : "var(--color-border-default)"), background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)", cursor: "pointer", font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)" });
    return (
      <span data-wg-export-menu style={{ position: "relative", display: "inline-flex" }}>
        {/* 匯出是工具鈕（BTN-109）：中性白底，橘色留給「新增」 */}
        {window.WGButton
          ? <window.WGButton variant="neutral" startIcon={<Icon n="Download" s={17} />} endIcon={<Icon n={open ? "ChevronUp" : "ChevronDown"} s={16} />} onClick={() => setOpen((o) => !o)} aria-expanded={open}>匯出</window.WGButton>
          : <Button variant="outline" startIcon={<Icon n="Download" s={17} />} onClick={() => setOpen((o) => !o)} aria-expanded={open}>匯出</Button>}
        {open && (
          <span>
            <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }}></span>
            <div className="tk-rise" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 401, width: 340, maxHeight: "70vh", overflowY: "auto", background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div className="wg-label-sm" style={{ fontWeight: 700, marginBottom: 6 }}>匯出哪一種{noun}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {types.map((t) => (
                    <label key={t.key} style={radio(type === t.key)}>
                      <input type="radio" name="wg-exp-type" checked={type === t.key} onChange={() => setType(t.key)} />
                      {t.icon && <Icon n={t.icon} s={15} c="var(--color-fg-neutral-subtle)" />}
                      <span style={{ flex: 1 }}>{t.label}</span>
                      <span className="wg-data-xs" style={{ color: "var(--color-fg-neutral-muted)" }}>{t.count} 筆</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="wg-label-sm" style={{ fontWeight: 700, marginRight: 4 }}>格式</span>
                {[["csv", "CSV"], ["xlsx", "Excel"]].map(([v, l]) => (
                  <label key={v} style={Object.assign(radio(format === v), { padding: "5px 10px" })}>
                    <input type="radio" name="wg-exp-fmt" checked={format === v} onChange={() => setFormat(v)} />{l}
                  </label>
                ))}
              </div>
              <div className="wg-caption" data-wg-export-note style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.6 }}>{note(cur)}</div>
              {n > max && <div className="wg-caption" style={{ color: "var(--color-fg-danger)" }}>超過 {max.toLocaleString()} 筆，後端會拒絕匯出。</div>}
              <Button variant="primary" disabled={n > max || busy} startIcon={<Icon n="Download" s={16} />} onClick={go}>
                {n === 0 ? "下載空白範本" : `下載 ${n} 筆`}
              </Button>
            </div>
          </span>
        )}
      </span>
    );
  }

  window.WGBulk = { canBulk, parseCSV, loadXLSX, readFile, download, stampName, failedReport };
  Object.assign(window, { WGNewSplitButton, WGBulkExportMenu });
})();
