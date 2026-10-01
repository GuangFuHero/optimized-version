// db-app.jsx — 總覽儀表板頁（後台第一個導覽項）
//
// 外殼沿用三頁共用的 WGPage / WGShell（js/admin/shell/wg-shell.jsx），
// 本檔只負責儀表板自己的內容。所有指標的中文名與說明**一律讀 db-data.js 的
// DB_TERM**，不要在這裡另寫一份 —— 兩份就會開始不一致。
//
// 2026-08-27 UX 修正（Sucre：「任務單跟資源站點混在一起」「備註不是人類看得懂的」）：
//   1. 任務單與資源站點**徹底分開**，各自有自己的 KPI 列與圖表區，中間隔開。
//      原本頂端那排 KPI 把 6 個任務單指標和 1 個站點指標混在一起，是最亂的地方。
//   2. 每張卡都有一句人話說明（DB_TERM.what），欄位名 y=… 保留但降級成灰色小字，
//      並且**永遠有中文陪著**，不會單獨出現。
//   3. 首屏只留看得完的量；次要分析收進可展開區塊。
//
// 可視範圍（CLAUDE.md 2026-08-11 Sucre）：所有後台角色看到同一份，不分權。
// ⚠️ 那句「不分權」與後端 analytics 端點吃的 scope_filter 仍未收斂，接 API 時會撞到。
(function () {
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const TERM = window.DB_TERM;

  // 折線／長條配色。第 4 色刻意跳開橘系 —— 任務積壓增減有四條線，
  // 兩條同為橘色在現場快速掃視時會看錯。
  const PALETTE = ["#E3791E", "#2592B9", "#2E7D32", "#8B5CF6", "#D32F2F", "#62BADA", "#F57C00", "#64748B"];

  const iso = window.DB_iso;
  const TODAY = new Date();
  const shift = (days) => iso(new Date(TODAY.getTime() + days * 864e5));

  const DEFAULT_FILTERS = {
    start: shift(-29), end: iso(TODAY),
    granularity: "day", tz: "Asia/Taipei",
    mode: "mock", base: "http://localhost:8000", token: "",
  };

  const card = {
    background: "var(--color-bg-neutral-default)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-sm)",
  };
  const muted = { color: "var(--color-fg-neutral-muted)" };

  // 欄位名小字：永遠跟在中文說明後面，不單獨出現（Sucre：「欄位只有你知道」）
  function FieldTag({ children, title }) {
    return (
      <code title={title} style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)",
        background: "var(--color-bg-neutral-sunken)", padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
        {children}
      </code>
    );
  }

  function Field({ label, hint, children }) {
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="wg-caption" style={{ ...muted, fontWeight: 700 }}>
          {label}{hint && <span style={{ fontWeight: 400 }}> · {hint}</span>}
        </span>
        {children}
      </label>
    );
  }

  const inputStyle = {
    font: "var(--font-data-300)", padding: "7px 10px", minWidth: 132,
    borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)",
    background: "var(--color-bg-neutral-default)", color: "var(--color-fg-neutral-default)",
  };

  function Seg({ value, options, onChange, size = "md" }) {
    return (
      <div style={{ display: "inline-flex", border: "1px solid var(--color-border-default)",
        borderRadius: size === "sm" ? "var(--radius-full)" : "var(--radius-sm)", overflow: "hidden" }}>
        {options.map(([v, label, tip], i) => {
          const on = value === v;
          return (
            <button key={v} type="button" onClick={() => onChange(v)} title={tip}
              style={{ border: "none", borderLeft: i ? "1px solid var(--color-border-default)" : "none", cursor: "pointer",
                padding: size === "sm" ? "3px 10px" : "7px 13px",
                font: size === "sm" ? "var(--font-data-300)" : "var(--font-label-300)", fontWeight: on ? 700 : 400,
                background: on ? (size === "sm" ? "var(--color-bg-neutral-sunken)" : "var(--color-bg-primary)") : "transparent",
                color: on ? (size === "sm" ? "var(--color-fg-neutral-default)" : "var(--color-fg-on-primary)") : "var(--color-fg-neutral-muted)" }}>
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  // ── 篩選列 ──────────────────────────────────────────────────────────────
  // 中文優先：常用的是「看多久」「一天一格還是一週一格」，日期快捷鍵擺前面。
  // 英文參數名收在「顯示欄位名」開關後面 —— 對工程有用，對指揮官是噪音。
  function DBFilters({ f, setF, onRefresh, catalogNote, onLoadCatalog, syncedAt, devMode, setDevMode }) {
    const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
    const rangeDays = Math.round((new Date(f.end) - new Date(f.start)) / 864e5) + 1;
    const quick = (d) => setF((s) => ({ ...s, start: shift(-(d - 1)), end: iso(TODAY) }));

    return (
      <section style={{ ...card, padding: "14px 18px", display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "14px 18px" }}>
        <Field label="看多久" hint={rangeDays + " 天"}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Seg value={rangeDays === 7 ? 7 : rangeDays === 30 ? 30 : 0}
              onChange={(v) => v && quick(v)}
              options={[[7, "近 7 天"], [30, "近 30 天"], [0, "自訂"]]} />
          </div>
        </Field>
        <Field label="起訖日期">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" style={inputStyle} value={f.start} onChange={(e) => set("start")(e.target.value)} />
            <span style={muted}>→</span>
            <input type="date" style={inputStyle} value={f.end} onChange={(e) => set("end")(e.target.value)} />
          </div>
        </Field>
        <Field label="每格代表">
          <Seg value={f.granularity} onChange={set("granularity")}
            options={[["day", "一天"], ["week", "一週"]]} />
        </Field>
        <Field label="時區" hint="影響每天從幾點算起">
          <select style={inputStyle} value={f.tz} onChange={(e) => set("tz")(e.target.value)}>
            <option value="Asia/Taipei">台北（UTC+8）</option>
            <option value="UTC">UTC</option>
            <option value="Asia/Tokyo">東京（UTC+9）</option>
          </select>
        </Field>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {syncedAt && <span className="wg-caption" style={muted}>更新於 {syncedAt}</span>}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="顯示每張圖對應的後端欄位名與 API 參數，對接時用">
            <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
            <span className="wg-caption" style={muted}>顯示欄位名</span>
          </label>
          <Button variant="primary" onClick={onRefresh}>重新整理</Button>
        </div>

        {devMode && (
          <div style={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px 16px",
            borderTop: "1px dashed var(--color-border-default)", paddingTop: 12 }}>
            <Field label="資料來源">
              <Seg value={f.mode} onChange={set("mode")}
                options={[["mock", "假資料"], ["api", "真實 API"]]} />
            </Field>
            {f.mode === "api" && (
              <React.Fragment>
                <Field label="API Base URL">
                  <input type="text" style={{ ...inputStyle, minWidth: 240 }} value={f.base}
                    onChange={(e) => set("base")(e.target.value)} placeholder="http://localhost:8000" />
                </Field>
                <Field label="Bearer Token">
                  <input type="password" style={{ ...inputStyle, minWidth: 220 }} value={f.token}
                    onChange={(e) => set("token")(e.target.value)} placeholder="登入後取得的 access token" />
                </Field>
                <Button variant="secondary" onClick={onLoadCatalog}>載入 /analytics/catalog</Button>
                <span className="wg-caption" style={muted}>{catalogNote}</span>
              </React.Fragment>
            )}
            <span className="wg-caption" style={{ ...muted, marginLeft: "auto" }}>
              對應參數：<FieldTag>start_date</FieldTag> <FieldTag>end_date</FieldTag>{" "}
              <FieldTag>x_granularity</FieldTag> <FieldTag>tz</FieldTag>
            </span>
          </div>
        )}
      </section>
    );
  }

  // ── KPI ─────────────────────────────────────────────────────────────────
  // 一組 KPI 只講一件事的不同面向，不混不同對象（Sucre：任務單跟站點不要混在一起）
  const TICKET_KPIS = [
    { domain: "tickets", y: "total_tickets",      accent: "var(--color-bg-primary)" },
    { domain: "tickets", y: "unassigned_tickets", accent: "var(--color-bg-warning)", emphasis: true },
    { domain: "tickets", y: "ongoing_tickets",    accent: "var(--color-bg-secondary)" },
    { domain: "tickets", y: "completed_tickets",  accent: "var(--color-bg-success)" },
    { domain: "tickets", y: "canceled_tickets",   accent: "var(--color-fg-neutral-muted)" },
    { domain: "tickets", y: "completion_rate",    accent: "var(--color-bg-primary)", percent: true },
  ];
  const STATION_KPIS = [
    { domain: "stations", y: "station_count", accent: "var(--color-bg-secondary)" },
  ];

  // aggregate 查詢回來的是「單一數值的圖」。真實 API 模式下把 div 注入隱藏容器
  // 再把數字讀回來 —— 後端沒有回傳純數值的端點，只有圖。
  async function kpiValue(k, f, probeRef) {
    if (f.mode === "mock") {
      const d = window.DB_mock(k.domain, k.y, "none", f);
      return d.series[Object.keys(d.series)[0]][0];
    }
    const html = await window.DB_apiFetchChart(k.domain, k.y, null, "bar", f, { height: 200 });
    const probe = probeRef.current;
    window.DB_injectPlotly(probe, html);
    await new Promise((r) => setTimeout(r, 60));
    const gd = probe.querySelector(".js-plotly-plot");
    const tr = gd && gd.data && gd.data[0];
    const v = tr ? (tr.y ? tr.y[0] : (tr.values ? tr.values[0] : null)) : null;
    probe.innerHTML = "";
    return v;
  }

  function KpiRow({ items, f, nonce, probeRef, devMode }) {
    const [vals, setVals] = React.useState(items.map(() => ({ state: "loading" })));
    React.useEffect(() => {
      let alive = true;
      (async () => {
        const out = [];
        for (const k of items) {
          try { out.push({ state: "ok", v: await kpiValue(k, f, probeRef) }); }
          catch (e) { out.push({ state: "err", msg: e.message }); }
        }
        if (alive) setVals(out);
      })();
      return () => { alive = false; };
    }, [nonce]);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(" + items.length + ", minmax(0, 1fr))", gap: 14 }}>
        {items.map((k, i) => {
          const s = vals[i] || {};
          const t = TERM[k.y];
          return (
            <div key={k.y} title={t.what}
              style={{ ...card, padding: "14px 16px", position: "relative", overflow: "hidden",
                display: "flex", flexDirection: "column", gap: 4,
                borderColor: k.emphasis ? "var(--color-border-accent)" : "var(--color-border-default)" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: k.accent }}></span>
              <span style={{ font: "var(--font-label-400)" }}>{t.name}</span>
              <span style={{ font: "var(--font-data-500)", fontSize: 30, lineHeight: 1.15, letterSpacing: "-.02em" }}>
                {s.state === "loading" && <span style={{ ...muted, fontSize: 20 }}>…</span>}
                {s.state === "err" && <span style={{ color: "var(--color-fg-danger)", fontSize: 14 }} title={s.msg}>讀取失敗</span>}
                {s.state === "ok" && s.v == null && <span style={muted}>—</span>}
                {s.state === "ok" && s.v != null && (k.percent
                  ? <React.Fragment>{(s.v * 100).toFixed(1)}<small style={{ fontSize: 15, marginLeft: 2, ...muted }}>%</small></React.Fragment>
                  : <React.Fragment>{Number(s.v).toLocaleString("zh-Hant")}<small style={{ fontSize: 15, marginLeft: 2, ...muted }}>{t.unit}</small></React.Fragment>)}
              </span>
              <span className="wg-caption" style={{ ...muted, lineHeight: 1.4 }}>{t.what}</span>
              {devMode && <FieldTag title="API 參數：y">y={k.y}</FieldTag>}
            </div>
          );
        })}
      </div>
    );
  }

  // ── 圖表 ────────────────────────────────────────────────────────────────
  const seriesLabel = (n) => (window.DB_SERIES_LABEL && window.DB_SERIES_LABEL[n]) || n;

  function plotLocal(el, data, chartType, opts) {
    const names = Object.keys(data.series);
    let traces;
    if (chartType === "pie") {
      traces = [{ type: "pie", labels: data.x, values: data.series[names[0]] || [], hole: .5,
        marker: { colors: PALETTE, line: { color: "#fff", width: 2 } },
        textinfo: "percent", textposition: "inside", automargin: true }];
    } else {
      traces = names.map((n, i) => (chartType === "line"
        ? { type: "scatter", mode: "lines", name: seriesLabel(n), x: data.x, y: data.series[n],
            line: { color: PALETTE[i % PALETTE.length], width: 2.4, shape: "spline", smoothing: 0.4 } }
        : { type: "bar", name: seriesLabel(n), x: data.x, y: data.series[n],
            marker: { color: PALETTE[i % PALETTE.length] } }));
    }
    Plotly.newPlot(el, traces, {
      template: "plotly_white",
      margin: { l: 48, r: 16, t: 8, b: 40 },
      height: (opts && opts.height) || 280,
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, Noto Sans TC, sans-serif", size: 12, color: "#475569" },
      barmode: names.length > 1 ? "group" : undefined,
      showlegend: names.length > 1 || chartType === "pie",
      legend: { orientation: "h", y: -0.2, x: 0 },
      hovermode: chartType === "pie" ? undefined : "x unified",
      xaxis: { gridcolor: "#F1F5F9", zeroline: false, automargin: true },
      yaxis: { gridcolor: "#EDF2F7", zeroline: true, zerolinecolor: "#CBD5E1", automargin: true,
               rangemode: (opts && opts.allowNegative) ? "normal" : "tozero",
               tickformat: (opts && opts.percent) ? ".0%" : undefined },
    }, { displayModeBar: false, responsive: true });
  }

  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  function DBChart({ spec, f, nonce, devMode }) {
    const [x, setX] = React.useState(spec.x);
    const [ct, setCt] = React.useState(spec.ct);
    const [err, setErr] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const ref = React.useRef(null);
    const t = TERM[spec.y];
    const cat = (window.DB_CATALOG[spec.domain] && window.DB_CATALOG[spec.domain][spec.y]) || {};
    const height = spec.size === "wide" ? 300 : 270;

    React.useEffect(() => {
      let alive = true;
      const el = ref.current;
      if (!el) return;

      let r;
      try { r = window.DB_resolve(spec.domain, spec.y, x, ct); }
      catch (e) { setErr(e.message); setLoading(false); return; }

      // 後端會回 400 的兩種情況，前端先擋 —— catalog 公開 requires_date_range /
      // max_range_days 就是為了讓前端夾住日期，不要靠 400 才知道。
      if (cat.requires_date_range && (!f.start || !f.end)) {
        setErr("這張圖必須指定起訖日期"); setLoading(false); return;
      }
      if (cat.max_range_days != null && f.start && f.end && daysBetween(f.start, f.end) > cat.max_range_days) {
        setErr("時間範圍超過 " + cat.max_range_days + " 天上限，請縮短"); setLoading(false); return;
      }

      setErr(null); setLoading(true);
      (async () => {
        try {
          if (f.mode === "mock") {
            const data = window.DB_mock(spec.domain, spec.y, r.x, f);
            if (!alive) return;
            el.innerHTML = "";
            plotLocal(el, data, r.chartType, { height, percent: !!spec.percent, allowNegative: !!spec.allowNegative });
          } else {
            const html = await window.DB_apiFetchChart(spec.domain, spec.y, r.x, r.chartType, f, { height });
            if (!alive) return;
            window.DB_injectPlotly(el, html);
          }
          if (alive) setLoading(false);
        } catch (e) { if (alive) { setErr(e.message); setLoading(false); } }
      })();
      return () => { alive = false; };
    }, [x, ct, nonce]);

    const xOpts = (cat.allowed_x || ["none"]).map((v) => [v, window.DB_X_LABEL[v] || v, "切換分組方式（API 參數 x=" + v + "）"]);
    const ctOpts = (cat.allowed_chart_types || ["bar"]).map((v) => [v, window.DB_CT_LABEL[v] || v, "切換圖型（API 參數 chart_type=" + v + "）"]);

    return (
      <section style={{ ...card, gridColumn: spec.span ? "span " + spec.span : "span 6",
        display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--color-border-default)" }}>
          {/* 標題與切換鈕同一行，說明文字自己一整行 —— 窄卡（span 4）如果三者擠同一行，
              說明會被壓成一行四個字的細長條，比沒有還難讀。 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* minWidth 讓標題有底線寬度：窄卡放不下時切換鈕會整組換行，
                而不是把標題擠成「疑似／重複／的單」三行 */}
            <div style={{ font: "var(--font-label-500)", minWidth: 132, flex: 1 }}>{spec.title || t.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {xOpts.length > 1 && <Seg size="sm" value={x || "none"} options={xOpts} onChange={setX} />}
              {ctOpts.length > 1 && <Seg size="sm" value={ct} options={ctOpts} onChange={setCt} />}
            </div>
          </div>
          {/* 人話說明永遠在，欄位名只是附註 —— 不會出現「只有工程看得懂」的標題 */}
          <div className="wg-caption" style={{ ...muted, marginTop: 4, lineHeight: 1.5 }}>
            {spec.what || t.what}
            {cat.requires_date_range && <React.Fragment>{"　"}<b style={{ color: "var(--color-fg-warning)" }}>一次最多查 {cat.max_range_days} 天</b></React.Fragment>}
            {devMode && <React.Fragment>{"　"}<FieldTag title="API 參數：y">y={spec.y}</FieldTag></React.Fragment>}
          </div>
        </div>
        <div style={{ padding: "8px 6px 12px", position: "relative", minHeight: height }}>
          <div ref={ref} style={{ minHeight: height }}></div>
          {(loading || err) && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: "0 24px",
              font: "var(--font-data-300)", color: err ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)",
              background: "var(--color-bg-neutral-default)" }}>
              {err || "載入中…"}
            </div>
          )}
        </div>
      </section>
    );
  }

  // 首屏只留「現在該不該加人手」會用到的三張；其餘收進可展開區。
  const TICKET_MAIN = [
    { domain: "tickets", y: "total_tickets", x: "date", ct: "line", span: 8,
      title: "每天新增多少單", what: "看得出災情回報的節奏：哪幾天湧進來、哪幾天緩下來" },
    { domain: "tickets", y: "unassigned_tickets", x: "category", ct: "bar", span: 4,
      title: "沒人接的單卡在哪一類", what: "哪一類任務找不到人接，人力就該往那邊調" },
    { domain: "tickets", y: "net_backlog_change", x: "date", ct: "line", span: 12, allowNegative: true },
  ];
  const TICKET_MORE = [
    { domain: "tickets", y: "completion_rate", x: "date", ct: "line", span: 6, percent: true },
    { domain: "tickets", y: "age_distribution", x: "none", ct: "bar", span: 6 },
    { domain: "tickets", y: "time_to_completion", x: "category", ct: "bar", span: 4 },
    { domain: "tickets", y: "task_completion_distribution", x: "none", ct: "pie", span: 4 },
    { domain: "tickets", y: "duplicate_count", x: "category", ct: "bar", span: 4 },
  ];
  const STATION_CHARTS = [
    { domain: "stations", y: "station_count", x: "category", ct: "bar", span: 4,
      title: "各類站點有幾個", what: "物資、醫療、收容等各類站點的數量分布" },
    { domain: "stations", y: "station_status_count", x: "category", ct: "pie", span: 4 },
    { domain: "stations", y: "station_freshness_trend", x: "date", ct: "line", span: 4 },
  ];

  const Grid = ({ children }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>{children}</div>
  );

  // 區塊標題：兩個區塊之間要看得出來換主題了（Sucre：任務單跟站點混在一起）
  function Section({ icon, title, sub, children }) {
    return (
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: "var(--radius-sm)", display: "grid", placeItems: "center",
            background: "var(--color-bg-primary-subtle)", color: "var(--color-bg-primary)", flexShrink: 0 }}>
            <Icon n={icon} s={17} c="currentColor" />
          </span>
          <div>
            <div style={{ font: "var(--font-heading-600)", fontSize: 17 }}>{title}</div>
            {sub && <div className="wg-caption" style={muted}>{sub}</div>}
          </div>
          <span style={{ flex: 1, height: 1, background: "var(--color-border-default)", marginLeft: 6 }}></span>
        </div>
        {children}
      </section>
    );
  }

  function DashboardBody() {
    const [f, setF] = React.useState(DEFAULT_FILTERS);
    const [nonce, setNonce] = React.useState(0);
    const [syncedAt, setSyncedAt] = React.useState(null);
    const [devMode, setDevMode] = React.useState(false);
    const [showMore, setShowMore] = React.useState(false);
    const [catalogNote, setCatalogNote] = React.useState("尚未載入，先用內建規則");
    const probeRef = React.useRef(null);

    const refresh = React.useCallback(() => {
      window.DB_resetSeed();
      setNonce((n) => n + 1);
      setSyncedAt(new Date().toTimeString().slice(0, 8));
    }, []);

    // 這幾個一改就重畫；日期等按「重新整理」，免得打字打到一半就重打 API
    React.useEffect(() => { refresh(); }, [f.granularity, f.tz, f.mode]);

    async function loadCatalog() {
      setCatalogNote("載入中…");
      try {
        const c = await window.DB_apiFetchCatalog(f);
        setCatalogNote("已載入（任務單 " + Object.keys(c.tickets).length + " 項 / 站點 " + Object.keys(c.stations).length + " 項）");
        refresh();
      } catch (e) { setCatalogNote("載入失敗：" + e.message + "（沿用內建規則）"); }
    }

    const chartProps = { f, nonce, devMode };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <DBFilters f={f} setF={setF} onRefresh={refresh} onLoadCatalog={loadCatalog}
          catalogNote={catalogNote} syncedAt={syncedAt} devMode={devMode} setDevMode={setDevMode} />

        <Section icon="ClipboardList" title="任務單"
          sub="民眾與各單位回報的求助案件。這一區全部只講任務單，不含資源站點。">
          <KpiRow items={TICKET_KPIS} f={f} nonce={nonce} probeRef={probeRef} devMode={devMode} />
          <Grid>{TICKET_MAIN.map((s) => <DBChart key={s.y + s.title} spec={s} {...chartProps} />)}</Grid>

          <div>
            <button type="button" onClick={() => setShowMore((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--color-border-default)",
                background: "var(--color-bg-neutral-default)", borderRadius: "var(--radius-full)", padding: "6px 14px",
                cursor: "pointer", font: "var(--font-label-300)", color: "var(--color-fg-neutral-subtle)" }}>
              <Icon n={showMore ? "ChevronUp" : "ChevronDown"} s={15} c="currentColor" />
              {showMore ? "收起細部分析" : "展開細部分析（完成率、等待時間、處理耗時、重複單）"}
            </button>
          </div>
          {showMore && <Grid>{TICKET_MORE.map((s) => <DBChart key={s.y} spec={s} {...chartProps} />)}</Grid>}
        </Section>

        <Section icon="Package" title="資源站點"
          sub="物資站、醫療站等實體據點。與上方任務單是兩回事，數字不要互相比較。">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14 }}>
            <KpiRow items={STATION_KPIS} f={f} nonce={nonce} probeRef={probeRef} devMode={devMode} />
          </div>
          <Grid>{STATION_CHARTS.map((s) => <DBChart key={s.y} spec={s} {...chartProps} />)}</Grid>
        </Section>

        <p className="wg-caption" style={{ ...muted, lineHeight: 1.8, margin: 0 }}>
          <b>目前顯示的是假資料</b>，用來確認版面與用詞；勾選右上「顯示欄位名」可切到真實 API 並看到每張圖對應的後端欄位。
          資料來源為後端 <b>PR #32</b> 的 analytics 端點（尚未合併）。指標中文名與說明是本原型自訂的，正式定名需與 PM 確認。
        </p>

        {/* 讀 KPI 數值用的隱藏容器：後端沒有回傳純數值的端點，只好把 aggregate 圖注入再讀回來 */}
        <div ref={probeRef} style={{ position: "absolute", left: -9999, top: 0, width: 400, height: 300, visibility: "hidden" }}></div>
      </div>
    );
  }

  // ── 頁面入口 ────────────────────────────────────────────────────────────
  function DBApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "super");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];

    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({
          id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label,
        }))}
        value={role} onChange={setRole}
        note="儀表板不分權：所有後台角色看到同一份" />
    );

    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="dashboard"
          onNavigate={(id) => window.wgNavigate(id, "dashboard")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}
        >
          <DashboardBody />
        </window.WGShell>
      </window.WGPage>
    );
  }

  Object.assign(window, { DBApp, DashboardBody, DBChart });
})();
