// db-data.js — 總覽儀表板的指標目錄、假資料與 API 轉接（PR #32 analytics）
//
// 對應後端：
//   GET /api/v1/analytics/tickets/chart
//   GET /api/v1/analytics/stations/chart
//   GET /api/v1/analytics/catalog
//
// ⚠️ 這頁的所有數字都是假資料。後端 analytics 端點在 PR #32，尚未合併也還沒接。
//    真實 API 模式（右上角切換）會直接打上面三個端點，用來對接時驗證用。
(function () {

  // ── 指標目錄 ────────────────────────────────────────────────────────────
  // 鏡射 Backend/app/services/chart_render.py 的 CATALOG。
  // ⚠️ 後端註解明寫「build dropdowns from that response instead of hardcoding」——
  //    這份硬寫版本只是為了讓原型能離線跑；真實 API 模式會用 /analytics/catalog 覆寫。
  window.DB_BUILTIN_CATALOG = {
    tickets: {
      total_tickets:      { allowed_x: ["none", "date", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "line", "pie"] },
      ongoing_tickets:    { allowed_x: ["none", "date", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "line", "pie"] },
      unassigned_tickets: { allowed_x: ["none", "date", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "line", "pie"] },
      completed_tickets:  { allowed_x: ["none", "date", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "line", "pie"] },
      canceled_tickets:   { allowed_x: ["none", "date", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "line", "pie"] },
      completion_rate:    { allowed_x: ["none", "date", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "line"] },
      age_distribution:   { allowed_x: ["none"],                     default_chart_type: "bar",  allowed_chart_types: ["bar"] },
      time_to_completion: { allowed_x: ["none", "category"],         default_chart_type: "bar",  allowed_chart_types: ["bar"] },
      net_backlog_change: { allowed_x: ["date"],                     default_chart_type: "line", allowed_chart_types: ["line", "bar"] },
      task_completion_distribution: { allowed_x: ["none"],           default_chart_type: "pie",  allowed_chart_types: ["pie"] },
      duplicate_count:    { allowed_x: ["none", "date", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "pie"],
                            requires_date_range: true, max_range_days: 120 },
    },
    stations: {
      station_count:           { allowed_x: ["none", "category"], default_chart_type: "bar",  allowed_chart_types: ["bar", "pie"] },
      station_status_count:    { allowed_x: ["category"],         default_chart_type: "pie",  allowed_chart_types: ["pie", "bar"] },
      station_freshness_trend: { allowed_x: ["date"],             default_chart_type: "line", allowed_chart_types: ["line", "bar"] },
    },
  };
  window.DB_CATALOG = JSON.parse(JSON.stringify(window.DB_BUILTIN_CATALOG));

  // ── 詞彙表（唯一真相來源）────────────────────────────────────────────────
  // 每個指標一個中文名 + 一句人話。頁面上的 KPI 卡、圖表標題、說明文字全部讀這裡，
  // 不要在 db-app.jsx 裡另外寫一份中文名 —— 兩份就會開始不一致。
  //
  // ⚠️ 這些中文名與說明是我寫的，後端只有英文 metric key，正典沒有詞彙表。
  //    要正式定名請跟 PM 對過再改這裡。
  window.DB_TERM = {
    total_tickets:      { name: "任務單總量", what: "事件開始到現在，總共建立了幾張任務單", unit: "件" },
    ongoing_tickets:    { name: "進行中",     what: "已經有人接、還沒完成的單", unit: "件" },
    unassigned_tickets: { name: "未指派",     what: "還沒有任何人接的單 —— 現場最該優先處理的就是這些", unit: "件" },
    completed_tickets:  { name: "已完成",     what: "底下的子任務都已完成的單", unit: "件" },
    canceled_tickets:   { name: "已取消",     what: "重複、誤報或已不需要而取消的單", unit: "件" },
    completion_rate:    { name: "完成率",     what: "已完成 ÷（總量 − 已取消）", unit: "%" },
    age_distribution:   { name: "未結案的單等了多久", what: "還沒完成的單，從建立到現在過了多久。>72h 那一柱愈高代表愈多單被卡住", unit: "件" },
    time_to_completion: { name: "平均處理時間", what: "一張單從建立到完成，平均與中位數各花幾天", unit: "天" },
    net_backlog_change: { name: "任務積壓增減", what: "新增 − 完成 − 取消 ＝ 淨增減。線在 0 以上代表待辦愈積愈多，該加人手", unit: "件" },
    task_completion_distribution: { name: "子任務完成度", what: "一張任務單可拆成多個子任務；這裡算的是子任務，不是單", unit: "項" },
    duplicate_count:    { name: "疑似重複的單", what: "位置相近、同類型、時間相近而可能重複回報的單", unit: "件" },
    station_count:      { name: "資源站點數量", what: "地圖上登錄的物資站、醫療站等站點總數", unit: "站" },
    station_status_count:    { name: "站點營運狀態", what: "各站點目前是營運中、暫停還是永久關閉", unit: "站" },
    station_freshness_trend: { name: "站點新增／關閉", what: "每個時間桶新開與關閉的站點數，看得出資源網絡在擴張還是收縮", unit: "站" },
  };
  // 舊呼叫點相容：只要名字
  window.DB_LABEL = Object.keys(window.DB_TERM).reduce(function (o, k) { o[k] = window.DB_TERM[k].name; return o; }, {});

  // 圖例（series）中文對照。後端回傳的圖例是英文寫死在 chart_render.py 裡，
  // 假資料模式我們自己畫，就用中文；⚠️ 切到真實 API 時圖例會變回英文。
  window.DB_SERIES_LABEL = {
    "tickets": "任務單", "ongoing tickets": "進行中", "unassigned tickets": "未指派",
    "completed tickets": "已完成", "canceled tickets": "已取消", "completion rate": "完成率",
    "duplicate tickets": "疑似重複", "tasks": "子任務", "stations": "站點",
    "new": "新增", "completed": "完成", "canceled": "取消", "net change": "淨增減",
    "added": "新增站點", "closed": "關閉站點",
    "avg (days)": "平均（天）", "median (days)": "中位數（天）",
  };

  window.DB_X_LABEL = { none: "總計", date: "日期", category: "類型" };
  window.DB_CT_LABEL = { bar: "長條", line: "折線", pie: "圓餅" };

  // ── resolve()：與後端 chart_render.resolve() 同一套規則 ────────────────────
  // chart_type 不合法要擋（後端回 400）；x 不適用則靜默退回，不報錯。
  window.DB_resolve = function (domain, y, x, chartType) {
    const spec = window.DB_CATALOG[domain] && window.DB_CATALOG[domain][y];
    if (!spec) throw new Error("未知指標 " + y);
    const ct = chartType || spec.default_chart_type;
    if (spec.allowed_chart_types.indexOf(ct) < 0) throw new Error("chart_type=" + ct + " 不適用於 " + y);
    let rx = x || "none";
    if (ct === "pie" && rx === "date") rx = "none";              // 日期趨勢畫不成圓餅
    if (spec.allowed_x.indexOf(rx) < 0) {
      rx = spec.allowed_x.indexOf("none") >= 0 ? "none" : spec.allowed_x[0];
    }
    return { x: rx, chartType: ct };
  };

  // ── 假資料 ──────────────────────────────────────────────────────────────
  // 形狀刻意對齊各 service 回傳的欄位名稱（count / rate / avg_seconds /
  // new_count / added_count…），這樣接真 API 時只換資料來源、不動畫圖那段。
  //
  // ⚠️ 任務類型沿用 tk-data.js 的 TK_TASK_KIND（載入時才取，沒有就用備援清單）。
  const FALLBACK_TYPES = ["搜救", "物資", "醫療", "人力"];  // TM-CF-101 的四個系統類別
  const STATION_TYPES = ["物資集散點", "醫療站", "志工報到處", "避難收容所", "機具調度站", "飲水供應點"];
  const STATUS_LABEL = ["營運中", "暫停營運", "永久關閉"];  // 對應 active / temporarily_closed / permanently_closed

  function taskTypes() {
    const k = window.TK_TASK_KIND;
    if (!k) return FALLBACK_TYPES;
    return Object.keys(k).map((key) => (k[key] && (k[key].label || k[key].name)) || key);
  }

  // 固定亂數種子：重整後數字不會亂跳，方便照著同一份數字討論
  let seed = 20260826;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function ri(a, b) { return Math.floor(a + rnd() * (b - a + 1)); }
  window.DB_resetSeed = function () { seed = 20260826; };

  const iso = (d) => d.toISOString().slice(0, 10);
  window.DB_iso = iso;

  function dateBuckets(f) {
    const out = [];
    const e = new Date(f.end);
    let cur = new Date(f.start);
    if (f.granularity === "week") cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7)); // 對齊週一
    const step = f.granularity === "week" ? 7 : 1;
    while (cur <= e) { out.push(iso(cur)); cur = new Date(cur.getTime() + step * 864e5); }
    return out.slice(-60);
  }

  window.DB_mock = function (domain, y, x, f) {
    const dates = dateBuckets(f);
    const TYPES = taskTypes();
    const wave = (i) => 0.6 + 0.4 * Math.sin(i / 4);

    if (domain === "stations") {
      if (y === "station_count") {
        return x === "category"
          ? { x: STATION_TYPES, series: { stations: STATION_TYPES.map(() => ri(4, 38)) } }
          : { x: ["overall"], series: { stations: [ri(120, 160)] } };
      }
      if (y === "station_status_count") {
        return { x: STATUS_LABEL, series: { stations: [ri(88, 120), ri(10, 26), ri(3, 12)] } };
      }
      if (y === "station_freshness_trend") {
        return { x: dates, series: {
          added:  dates.map((_, i) => Math.max(0, Math.round(6 * wave(i) + ri(-2, 2)))),
          closed: dates.map((_, i) => Math.max(0, Math.round(2.5 * wave(i - 2) + ri(-1, 1)))),
        } };
      }
    }

    switch (y) {
      case "total_tickets":
      case "ongoing_tickets":
      case "unassigned_tickets":
      case "completed_tickets":
      case "canceled_tickets": {
        const scale = { total_tickets: 1, ongoing_tickets: .42, unassigned_tickets: .18, completed_tickets: .34, canceled_tickets: .06 }[y];
        const name  = { total_tickets: "tickets", ongoing_tickets: "ongoing tickets", unassigned_tickets: "unassigned tickets",
                        completed_tickets: "completed tickets", canceled_tickets: "canceled tickets" }[y];
        if (x === "date")     return { x: dates, series: { [name]: dates.map((_, i) => Math.max(0, Math.round((46 * wave(i) + ri(-6, 6)) * scale))) } };
        if (x === "category") return { x: TYPES, series: { [name]: TYPES.map(() => Math.round(ri(30, 180) * scale)) } };
        const base = { total_tickets: 1284, ongoing_tickets: 541, unassigned_tickets: 233, completed_tickets: 436, canceled_tickets: 74 }[y];
        return { x: ["overall"], series: { [name]: [base] } };
      }
      case "completion_rate": {
        if (x === "date")     return { x: dates, series: { "completion rate": dates.map((_, i) => +(0.28 + 0.22 * wave(i) + rnd() * 0.06).toFixed(3)) } };
        if (x === "category") return { x: TYPES, series: { "completion rate": TYPES.map(() => +(0.2 + rnd() * 0.55).toFixed(3)) } };
        return { x: ["overall"], series: { "completion rate": [0.361] } };
      }
      case "age_distribution":
        // 桶名直接來自 ticket_analytics.get_age_distribution
        return { x: ["<24h", "24-48h", "48-72h", ">72h"], series: { tickets: [ri(120, 190), ri(80, 140), ri(50, 95), ri(90, 160)] } };
      case "time_to_completion":
        if (x === "category")
          return { x: TYPES, series: {
            "avg (days)":    TYPES.map(() => +(0.4 + rnd() * 3.2).toFixed(2)),
            "median (days)": TYPES.map(() => +(0.3 + rnd() * 2.4).toFixed(2)),
          } };
        return { x: ["overall"], series: { "avg (days)": [1.86], "median (days)": [1.21] } };
      case "net_backlog_change": {
        // 用 wave 當主旋律、亂數只當小抖動 —— 全隨機會畫成鋸齒，看不出趨勢
        const nw = dates.map((_, i) => Math.max(0, Math.round(46 * wave(i) + ri(-5, 5))));
        const cp = dates.map((_, i) => Math.max(0, Math.round(34 * wave(i - 3) + ri(-5, 5))));
        const cx = dates.map((_, i) => Math.max(0, Math.round(4 * wave(i) + ri(-2, 2))));
        return { x: dates, series: {
          new: nw, completed: cp, canceled: cx,
          "net change": nw.map((v, i) => v - cp[i] - cx[i]),
        } };
      }
      case "task_completion_distribution":
        return { x: ["已完成", "未完成"], series: { tasks: [1642, 913] } };
      case "duplicate_count":
        if (x === "date")     return { x: dates, series: { "duplicate tickets": dates.map(() => ri(0, 6)) } };
        if (x === "category") return { x: TYPES, series: { "duplicate tickets": TYPES.map(() => ri(0, 17)) } };
        return { x: ["overall"], series: { "duplicate tickets": [47] } };
    }
    return { x: [], series: {} };
  };

  // ── 真實 API ────────────────────────────────────────────────────────────
  // 後端回傳 { html: "<div …partial plotly div…>" }，不含 plotly.js —— 前端只載一次
  // 函式庫再把 div 注入，這正是 analytics.py 模組註解寫的預期用法。
  window.DB_apiUrl = function (domain, y, x, chartType, f, extra) {
    const p = new URLSearchParams();
    p.set("y", y);
    if (x && x !== "none") p.set("x", x);
    p.set("x_granularity", f.granularity);
    if (chartType) p.set("chart_type", chartType);
    if (f.start) p.set("start_date", f.start);
    if (f.end)   p.set("end_date", f.end);
    p.set("tz", f.tz);
    p.set("theme", "light");
    if (extra && extra.height) p.set("height", extra.height);
    p.set("layout_overrides", JSON.stringify({
      margin: { l: 52, r: 18, t: 16, b: 48 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
    }));
    return String(f.base || "").replace(/\/$/, "") + "/api/v1/analytics/" + domain + "/chart?" + p.toString();
  };

  window.DB_apiFetchChart = async function (domain, y, x, chartType, f, extra) {
    const res = await fetch(window.DB_apiUrl(domain, y, x, chartType, f, extra), {
      headers: f.token ? { Authorization: "Bearer " + f.token } : {},
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (e) {}
      throw new Error("HTTP " + res.status + " — " + detail);
    }
    return (await res.json()).html;
  };

  window.DB_apiFetchCatalog = async function (f) {
    const res = await fetch(String(f.base || "").replace(/\/$/, "") + "/api/v1/analytics/catalog", {
      headers: f.token ? { Authorization: "Bearer " + f.token } : {},
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    window.DB_CATALOG = { tickets: json.tickets, stations: json.stations };
    return window.DB_CATALOG;
  };

  // innerHTML 不會執行 <script>，注入 partial div 時必須重建節點
  window.DB_injectPlotly = function (el, html) {
    el.innerHTML = html;
    el.querySelectorAll("script").forEach(function (old) {
      const s = document.createElement("script");
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  };
})();
