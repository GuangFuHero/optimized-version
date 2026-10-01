// station-import.jsx — 站點名單 CSV 匯入
//
// 依據：Notion「🛠️ RBAC — admin portal permission matrix」(BE-RBAC-3) 的
//       Import / Export 那組矩陣列：Import CSV/Excel — super ✅ / ngo ✅ / gov ✅ / auditor ❌
//       排期見 Notion「補齊功能 - 1.申請身份升級/2.resource station&ticket資料匯入匯出」
//       （2026-08-02~08-14，該卡內容為空，欄位與流程細節無正典規格）。
//
// ⚠️ 規則來源：
//   - 匯入後營運狀態預設「已關閉」— CLAUDE.md 記載的 2026-08-06 決策「名單匯入後預設為關」
//   - 匯入為後台建立，直接生效不進審核 — CLAUDE.md「後台建立直接生效」
//   - 其餘（欄位名稱、驗證規則、重複判定）都是我定的，見 PENDING.import
(function () {
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const Icon = window.WGIcon;

  // ── CSV 欄位對應 ────────────────────────────────────────────────────────
  // aliases：容許政府單位常見的欄位命名，比對時忽略大小寫與空白
  const FIELDS = [
    { key: "name",     label: "站點名稱", required: true,  aliases: ["站名", "名稱", "站點", "據點名稱", "name"] },
    { key: "type",     label: "類型",     required: true,  aliases: ["站點類型", "種類", "type"] },
    { key: "area",     label: "行政區",   required: false, aliases: ["鄉鎮市區", "區域", "地區", "area"] },
    { key: "address",  label: "地址",     required: true,  aliases: ["住址", "地點", "address"] },
    { key: "lat",      label: "緯度",     required: false, aliases: ["latitude", "y"] },
    { key: "lng",      label: "經度",     required: false, aliases: ["longitude", "x"] },
    { key: "contact",  label: "聯絡人",   required: false, aliases: ["負責人", "窗口", "contact"] },
    { key: "phone",    label: "聯絡電話", required: false, aliases: ["電話", "連絡電話", "phone", "tel"] },
    { key: "hours",    label: "開放時間", required: false, aliases: ["服務時間", "開放時段", "hours"] },
  ];

  const TEMPLATE = [
    FIELDS.map((f) => f.label).join(","),
    "光復國小收容所,避難收容,光復鄉,花蓮縣光復鄉中山路一段 10 號,23.6690,121.4210,200,王小明,03-870-0000,24 小時開放",
    "大馬村供水點,供水點,光復鄉,花蓮縣光復鄉大馬村中正路 5 號,23.6712,121.4188,,李小華,0912-000-000,06:00 – 18:00",
  ].join("\n");

  // ── CSV 解析（支援雙引號包住的逗號與換行）──────────────────────────────
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    const src = String(text || "").replace(/\r\n?/g, "\n");
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

  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "");

  // 依標題列自動猜欄位對應
  function guessMapping(header) {
    const map = {};
    FIELDS.forEach((f) => {
      const cands = [f.label, f.key, ...f.aliases].map(norm);
      const idx = header.findIndex((h) => cands.includes(norm(h)));
      map[f.key] = idx;
    });
    return map;
  }

  // 類型：接受 key（shelter）或中文 label（避難收容）
  function resolveType(v) {
    const n = norm(v);
    if (!n) return null;
    if (SD.TYPE[n]) return n;
    const hit = SD.TYPE_ORDER.find((t) => norm(SD.TYPE[t].label) === n);
    return hit || null;
  }

  // ── 逐列驗證 ────────────────────────────────────────────────────────────
  function validate(rows, map, existing) {
    const seen = {};
    return rows.map((r, i) => {
      const get = (k) => (map[k] >= 0 ? String(r[map[k]] ?? "").trim() : "");
      const errs = [], warns = [];
      const name = get("name");
      const address = get("address");
      if (!name) errs.push("缺站點名稱");
      if (!address) errs.push("缺地址");

      const rawType = get("type");
      const type = resolveType(rawType);
      if (!rawType) errs.push("缺類型");
      else if (!type) errs.push(`類型「${rawType}」不在清單中`);

      const area = get("area");
      if (area && !SD.AREAS.includes(area)) warns.push(`行政區「${area}」不在既有清單`);

      const lat = parseFloat(get("lat")), lng = parseFloat(get("lng"));
      const hasCoord = Number.isFinite(lat) && Number.isFinite(lng);
      if (!hasCoord) warns.push("無座標，不會出現在地圖上");

      // 重複：與既有站點同名同址，或檔案內自身重複
      const sig = norm(name) + "|" + norm(address);
      if (name && address) {
        if (existing.some((x) => norm(x.name) + "|" + norm(x.address) === sig)) warns.push("與既有站點同名同址，可能重複");
        if (seen[sig]) warns.push(`與檔案第 ${seen[sig]} 列重複`);
        else seen[sig] = i + 1;
      }

      return {
        line: i + 1, errs, warns,
        data: {
          name, address, type: type || "other", area: area || SD.AREAS[0],
          lat: hasCoord ? lat : null, lng: hasCoord ? lng : null,
          contact: get("contact") || "—", phone: get("phone") || "—", hours: get("hours") || "—",
        },
      };
    });
  }

  // ── 主對話框 ────────────────────────────────────────────────────────────
  function ImportDialog({ existing, onClose, onImport }) {
    const [text, setText] = React.useState("");
    const [fileName, setFileName] = React.useState("");
    const fileRef = React.useRef(null);

    const parsed = React.useMemo(() => {
      const rows = parseCSV(text);
      if (rows.length < 2) return null;
      const header = rows[0];
      return { header, body: rows.slice(1), map: guessMapping(header) };
    }, [text]);

    const [map, setMap] = React.useState(null);
    React.useEffect(() => { if (parsed) setMap(parsed.map); }, [parsed]);

    const effMap = map || (parsed ? parsed.map : {});
    const checked = parsed ? validate(parsed.body, effMap, existing) : [];
    const okRows = checked.filter((c) => c.errs.length === 0);
    const badRows = checked.filter((c) => c.errs.length > 0);
    const warnRows = okRows.filter((c) => c.warns.length > 0);

    function pickFile(e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      setFileName(f.name);
      const rd = new FileReader();
      rd.onload = () => setText(String(rd.result || ""));
      rd.readAsText(f, "utf-8");
    }

    function downloadTemplate() {
      // BOM 讓 Excel 正確辨識 UTF-8
      const blob = new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "資源站點匯入範本.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    }

    const box = { border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)" };

    return React.createElement(window.StationModal, {
      title: "匯入站點名單（CSV）", width: 760, onClose,
      icon: React.createElement(Icon, { n: "Upload", s: 20, c: "var(--color-fg-neutral-subtle)" }),
      footer: React.createElement(React.Fragment, null,
        React.createElement("span", { className: "wg-caption", style: { marginRight: "auto", color: "var(--color-fg-neutral-muted)" } },
          parsed ? `可匯入 ${okRows.length} 筆・略過 ${badRows.length} 筆` : ""),
        React.createElement(Button, { variant: "ghost", onClick: onClose }, "取消"),
        React.createElement(Button, {
          variant: "primary", disabled: okRows.length === 0,
          startIcon: React.createElement(Icon, { n: "Upload", s: 17 }),
          onClick: () => onImport(okRows.map((c) => c.data)),
        }, okRows.length ? `匯入 ${okRows.length} 筆` : "匯入")
      ),
    },
      // —— 規則說明 ——
      React.createElement("div", { style: { display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-warning-subtle)", alignItems: "flex-start" } },
        React.createElement(Icon, { n: "Info", s: 17, c: "var(--color-fg-warning)", style: { marginTop: 1, flexShrink: 0 } }),
        React.createElement("div", null,
          React.createElement("div", { className: "wg-label-sm", style: { fontWeight: 700, color: "var(--color-fg-warning)" } }, "匯入後營運狀態一律為「已關閉」"),
          React.createElement("div", { className: "wg-caption", style: { marginTop: 2 } },
            "名單匯入不等於站點已開設，需要有人到現場確認後再逐一開啟。匯入為後台建立，直接生效、不進審核佇列。")
        )
      ),

      // —— 來源 ——
      React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" } },
          React.createElement("span", { className: "wg-label-sm", style: { fontWeight: 700 } }, "1 · 選擇檔案或直接貼上"),
          React.createElement("div", { style: { marginLeft: "auto", display: "inline-flex", gap: 8 } },
            React.createElement(Button, { variant: "outline", size: "sm", startIcon: React.createElement(Icon, { n: "Download", s: 15 }), onClick: downloadTemplate }, "下載範本"),
            React.createElement(Button, { variant: "outline", size: "sm", startIcon: React.createElement(Icon, { n: "FolderOpen", s: 15 }), onClick: () => fileRef.current && fileRef.current.click() }, "選擇 CSV")
          )
        ),
        React.createElement("input", { ref: fileRef, type: "file", accept: ".csv,text/csv", onChange: pickFile, style: { display: "none" } }),
        React.createElement("textarea", {
          value: text, onChange: (e) => { setText(e.target.value); setFileName(""); }, rows: 5,
          placeholder: "站點名稱,類型,行政區,地址,緯度,經度,容量,聯絡人,聯絡電話,開放時間\n光復國小收容所,避難收容,光復鄉,花蓮縣光復鄉中山路一段 10 號,23.6690,121.4210,200,王小明,03-870-0000,24 小時開放",
          style: { ...box, width: "100%", padding: 12, font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)", outline: "none", resize: "vertical", background: "var(--color-bg-neutral-subtle)" },
        }),
        fileName && React.createElement("div", { className: "wg-data-xs", style: { marginTop: 6, color: "var(--color-fg-neutral-muted)" } }, `已讀取：${fileName}`)
      ),

      // —— 欄位對應 ——
      parsed && React.createElement("div", null,
        React.createElement("div", { className: "wg-label-sm", style: { fontWeight: 700, marginBottom: 8 } }, "2 · 欄位對應"),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 } },
          FIELDS.map((f) => React.createElement("label", { key: f.key, style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("span", { className: "wg-caption", style: { width: 76, flexShrink: 0, color: "var(--color-fg-neutral-muted)" } },
              f.label, f.required && React.createElement("span", { style: { color: "var(--color-fg-danger)" } }, " *")),
            React.createElement("select", {
              value: effMap[f.key] >= 0 ? String(effMap[f.key]) : "",
              onChange: (e) => setMap({ ...effMap, [f.key]: e.target.value === "" ? -1 : Number(e.target.value) }),
              style: { flex: 1, minWidth: 0, height: 34, padding: "0 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)" },
            },
              React.createElement("option", { value: "" }, "（不匯入）"),
              parsed.header.map((h, i) => React.createElement("option", { key: i, value: String(i) }, h || `第 ${i + 1} 欄`))
            )
          ))
        )
      ),

      // —— 預覽 ——
      parsed && React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" } },
          React.createElement("span", { className: "wg-label-sm", style: { fontWeight: 700 } }, "3 · 預覽與檢查"),
          React.createElement(Badge, { tone: "success" }, `可匯入 ${okRows.length}`),
          warnRows.length > 0 && React.createElement(Badge, { tone: "warning" }, `有提醒 ${warnRows.length}`),
          badRows.length > 0 && React.createElement(Badge, { tone: "danger" }, `無法匯入 ${badRows.length}`)
        ),
        React.createElement("div", { style: { ...box, maxHeight: 260, overflowY: "auto" } },
          checked.map((c) => {
            const bad = c.errs.length > 0;
            return React.createElement("div", { key: c.line,
              style: { display: "grid", gridTemplateColumns: "44px 1fr", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--color-bg-neutral-sunken)", opacity: bad ? 0.75 : 1 } },
              React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, `#${c.line}`),
              React.createElement("span", { style: { minWidth: 0 } },
                React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
                  React.createElement(Icon, { n: bad ? "CircleX" : (c.warns.length ? "TriangleAlert" : "CircleCheck"), s: 14,
                    c: bad ? "var(--color-fg-danger)" : (c.warns.length ? "var(--color-fg-warning)" : "var(--color-fg-success)") }),
                  React.createElement("span", { style: { font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)" } }, c.data.name || "（無名稱）"),
                  c.data.type && !bad && React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, SD.TYPE[c.data.type].label)
                ),
                React.createElement("span", { className: "wg-caption", style: { display: "block", color: "var(--color-fg-neutral-muted)", marginTop: 2 } }, c.data.address || "（無地址）"),
                [...c.errs.map((m) => ["danger", m]), ...c.warns.map((m) => ["warning", m])].map(([tone, m], i) =>
                  React.createElement("span", { key: i, className: "wg-data-xs", style: { display: "block", marginTop: 2, color: `var(--color-fg-${tone})` } }, `· ${m}`))
              )
            );
          })
        )
      ),

      React.createElement("p", { className: "wg-caption", style: { margin: 0, color: "var(--color-fg-neutral-muted)" } },
        "CSV 需為 UTF-8 編碼；第一列為欄位標題。「站點名稱」「類型」「地址」為必填，缺任一項的列會被略過。")
    );
  }

  window.StationImportDialog = ImportDialog;
  window.STATION_IMPORT_FIELDS = FIELDS;
  window.stationParseCSV = parseCSV;
  window.stationValidateImport = validate;
  window.stationGuessMapping = guessMapping;
})();
