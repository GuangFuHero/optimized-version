// pub-map.jsx — 公開前台救災地圖（訪客視角，Leaflet 真實地圖）
// 對齊：四層 Ticket→Task、災害在平台層、訪客位置以 H3 六邊形（~500m 隱私格）降精度、聯絡遮罩。
(function () {
  const { Button, Badge, Card, Chip, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const HEX = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";

  // 以中心點 + 半徑（公尺）算出地理六邊形頂點（固定真實大小 → 隨地圖縮放自然貼合）
  function hexPolygon(lat, lng, meters) {
    const dLat = meters / 111320;
    const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push([lat + dLat * Math.sin(a), lng + dLng * Math.cos(a)]);
    }
    return pts;
  }

  // ── 通用右側抽屜 ─────────────────────────────────────────────────────────
  function Drawer({ title, sub, onClose, children, footer, accent }) {
    React.useEffect(() => {
      const fn = (e) => { if (e.key === "Escape") onClose && onClose(); };
      window.addEventListener("keydown", fn);
      return () => window.removeEventListener("keydown", fn);
    }, [onClose]);
    return (
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,0.45)", display: "flex", justifyContent: "flex-end" }}>
        <div className="pm-slide" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "94vw", background: "var(--color-bg-neutral-default)", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ flexShrink: 0, padding: "18px 22px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "flex-start", gap: 12, borderTop: accent ? `3px solid ${accent}` : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="wg-h600" style={{ margin: 0 }}>{title}</h2>
              {sub && <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: 4 }}>{sub}</div>}
            </div>
            <button onClick={onClose} className="pm-iconbtn" aria-label="關閉"><Icon n="X" s={20} c="var(--color-fg-neutral-subtle)" /></button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
          {footer && <div style={{ flexShrink: 0, padding: "14px 22px", borderTop: "1px solid var(--color-border-default)", display: "flex", justifyContent: "flex-end", gap: 10 }}>{footer}</div>}
        </div>
      </div>
    );
  }

  function ToastHost({ toasts }) {
    return (
      <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1300, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} className="pm-rise" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-default)", color: "#fff", boxShadow: "var(--shadow-lg)", font: "var(--font-label-300)" }}>
            <Icon n="Check" s={16} c="#86EFAC" />{t.msg}
          </div>
        ))}
      </div>
    );
  }

  const kindChip = (k) => {
    const d = window.PUB_TASK_KIND[k.kind] || { label: k.kind, color: "#64748B" };
    return (
      <span key={k.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: d.color }}></span>
        <span style={{ font: "var(--font-data-300)", fontWeight: 600, color: "var(--color-fg-neutral-subtle)" }}>{k.name}</span>
      </span>
    );
  };

  // ── 站點抽屜（點站點 marker）────────────────────────────────────────────
  // 前台對既有站點只能做一件事：回報問題。
  // 不能新增站點，也不做投票（2026-08-06 與 PM 確認）。
  function StationDrawer({ station, onReport, onClose }) {
    const t = window.PUB_STATION_TYPES[station.type] || { color: "#64748B", label: station.type };
    const st = window.PUB_STATION_STATUS[station.status] || window.PUB_STATION_STATUS.open;

    return (
      <Drawer title={station.name} sub={`${t.label} · ${st.label}`} accent={t.color} onClose={onClose}
        footer={<Button variant="outline" startIcon={<Icon n="Flag" s={16} />} onClick={onReport}>回報這個站點的問題</Button>}>

        {/* 官方確認的資訊 */}
        <Card padding="0">
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon n="BadgeCheck" s={16} c="var(--color-bg-success)" />
              <span className="wg-label-sm" style={{ fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>官方確認資訊</span>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="wg-caption" style={{ width: 68, flexShrink: 0, color: "var(--color-fg-neutral-muted)" }}>開放時間</span>
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-default)" }}>{station.hours}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="wg-caption" style={{ width: 68, flexShrink: 0, color: "var(--color-fg-neutral-muted)" }}>資料來源</span>
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-default)" }}>{station.verifiedBy} · 更新於 {station.updated}</span>
              </div>
              {station.note && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span className="wg-caption" style={{ width: 68, flexShrink: 0, color: "var(--color-fg-neutral-muted)" }}>說明</span>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-default)", lineHeight: 1.5 }}>{station.note}</span>
                </div>
              )}
            </div>
          </div>
        </Card>


        <Alert tone="info" title="想新增新的站點？">
          目前站點只能由救災端建立。如果你發現地圖上沒有的據點，請透過救災單位通報。
        </Alert>
      </Drawer>
    );
  }

  // ── 回報站點問題 ────────────────────────────────────────────────────────
  // 選項是固定的；補充說明送進後台給審核人員看，不會公開顯示。
  function StationIssueDrawer({ station, onClose, onSubmit }) {
    const [kind, setKind] = React.useState(null);
    const [detail, setDetail] = React.useState("");
    return (
      <Drawer title="回報站點問題" sub={station.name} onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!kind} startIcon={<Icon n="Send" s={16} />} onClick={() => onSubmit(kind)}>送出回報</Button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="wg-label-sm" style={{ fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>發生什麼狀況？</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {window.PUB_STATION_ISSUES.map((o) => (
              <Chip key={o.k} active={kind === o.k} onClick={() => setKind(o.k)}>{o.label}</Chip>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="wg-label-sm" style={{ fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>補充說明<span style={{ fontWeight: 400, color: "var(--color-fg-neutral-muted)" }}>（選填）</span></span>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={4}
            placeholder="例如：門口貼了公告說今天下午撤站"
            style={{ width: "100%", padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", font: "var(--font-body-300)", resize: "vertical", boxSizing: "border-box" }} />
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.5 }}>
            這段說明只有救災端的審核人員看得到，不會公開顯示。
          </span>
        </div>
        <Alert tone="info" title="回報後會怎樣">
          審核人員確認後才會更新站點資料。在那之前，地圖上顯示的仍是目前的官方資訊。
        </Alert>
      </Drawer>
    );
  }

  // ── 訪客詳情抽屜（點六邊形）──────────────────────────────────────────────
  function CellDrawer({ cell, onClose, onLogin }) {
    return (
      <Drawer title={cell.area} sub={`${cell.tickets.length} 筆求助 · 概略區塊`} accent={window.PUB_PRIORITY[cell.top].color} onClose={onClose}
        footer={<Button variant="primary" startIcon={<Icon n="LogIn" s={16} />} onClick={onLogin}>登入救災端看完整資訊</Button>}>
        <Alert tone="info" title="位置已模糊化保護">
          為保護求助者，此處僅顯示所在鄉鎮的概略區塊與遮罩後資訊；精確位置與完整聯絡方式需登入救災端。
        </Alert>
        {cell.tickets.map((t) => {
          const pri = window.PUB_PRIORITY[t.priority];
          const st = window.PUB_STATUS[t.status];
          return (
            <Card key={t.id} padding="0">
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: "var(--radius-full)", background: pri.color + "1f" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: pri.color }}></span>
                    <span style={{ font: "var(--font-data-300)", fontWeight: 700, color: pri.color }}>{pri.label}</span>
                  </span>
                  <span style={{ font: "var(--font-data-300)", fontWeight: 700, color: st.color }}>{st.label}</span>
                  <span className="wg-caption" style={{ marginLeft: "auto", color: "var(--color-fg-neutral-muted)" }}>#{t.id}</span>
                </div>
                <div style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{t.title}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{t.tasks.map(kindChip)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 4, borderTop: "1px dashed var(--color-border-default)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon n="Lock" s={13} c="var(--color-fg-neutral-muted)" /><span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{t.contact} · {t.phone}</span></span>
                </div>
              </div>
            </Card>
          );
        })}
      </Drawer>
    );
  }

  // ── 民眾報案抽屜 ─────────────────────────────────────────────────────────
  function ReportDrawer({ onClose, onSubmit }) {
    const { Input } = window.WanGuardDesignSystem_9c8f68;
    const [addr, setAddr] = React.useState("");
    const [phone, setPhone] = React.useState("");
    const [need, setNeed] = React.useState("");
    const [desc, setDesc] = React.useState("");
    return (
      <Drawer title="我要求助" sub={`目前為「${window.PUB_EVENT.name}」應變 · 你不需選擇災害種類`} accent="#E3791E" onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" startIcon={<Icon n="Send" s={16} />} onClick={() => onSubmit()}>送出求助</Button>
        </>}>
        <Alert tone="warning" title="你的精確位置只有救災端看得到">
          公開地圖只會顯示你所在的<b>概略區塊</b>；門牌、樓層與聯絡方式不會對外公開。
        </Alert>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>地點 / 地址 <span style={{ color: "var(--color-fg-danger)" }}>*</span></span>
          <Input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="盡量寫清楚，例如：光復鄉中山路100號" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>聯絡電話</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx-xxx-xxx" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>需要什麼 <span style={{ color: "var(--color-fg-danger)" }}>*</span></span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(window.PUB_TASK_KIND).map(([k, v]) => (
              <Chip key={k} active={need === k} onClick={() => setNeed(k)}>{v.label}</Chip>
            ))}
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>狀況描述</span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="簡述現場狀況與需求…"
            style={{ resize: "vertical", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "none", outline: "none", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}></textarea>
        </label>
      </Drawer>
    );
  }

  function PubMapApp() {
    const [layer, setLayer] = React.useState("ticket");
    const [cell, setCell] = React.useState(null);
    const [report, setReport] = React.useState(false);
    const [station, setStation] = React.useState(null);      // 開著的站點抽屜
    const [issueFor, setIssueFor] = React.useState(null);    // 正在回報問題的站點
    const [toasts, setToasts] = React.useState([]);
    const [ready, setReady] = React.useState(false);

    const mapRef = React.useRef(null);
    const groupsRef = React.useRef({});
    const setCellRef = React.useRef(setCell);
    setCellRef.current = setCell;
    const setStationRef = React.useRef(setStation);
    setStationRef.current = setStation;

    const toast = (msg) => { const id = Date.now() + Math.random(); setToasts((ts) => [...ts, { id, msg }]); setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2800); };
    const login = () => { setCell(null); toast("登入救災端（示意）：登入後可見精確位置與完整聯絡"); };

    // 初始化 Leaflet 地圖（一次）
    React.useEffect(() => {
      const L = window.L;
      if (!L) return;
      const map = L.map("pubmap", { center: window.PUB_EVENT.center, zoom: window.PUB_EVENT.zoom, zoomControl: false, attributionControl: true });
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

      const cellGroup = L.layerGroup();
      window.PUB_CELLS.forEach((c) => {
        const pri = window.PUB_PRIORITY[c.top];
        const poly = L.polygon(hexPolygon(c.center[0], c.center[1], 480), { color: pri.color, weight: 2, fillColor: pri.color, fillOpacity: 0.18 });
        const label = L.marker(c.center, {
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:46px;height:46px;line-height:1;pointer-events:none;">
              <span style="font-size:20px;font-weight:800;color:${pri.color}">${c.tickets.length}</span>
              <span style="font-size:10px;font-weight:700;color:${pri.color}">求助</span></div>`,
            iconSize: [46, 46], iconAnchor: [23, 23],
          }),
        });
        const open = () => setCellRef.current(c);
        poly.on("click", open); label.on("click", open);
        cellGroup.addLayer(poly); cellGroup.addLayer(label);
      });

      const stationGroup = L.layerGroup();
      window.PUB_STATIONS.forEach((s) => {
        const col = (window.PUB_STATION_TYPES[s.type] || {}).color || "#64748B";
        const m = L.marker(s.center, {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:30px;height:30px;border-radius:8px;background:#fff;border:2px solid ${col};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(21,28,34,.22)">
              <span style="width:12px;height:12px;border-radius:50%;background:${col}"></span></div>`,
            iconSize: [30, 30], iconAnchor: [15, 30],
          }),
        });
        m.bindTooltip(`${s.name}（${(window.PUB_STATION_TYPES[s.type] || {}).label || ""}）`);
        m.on("click", () => setStationRef.current(s));
        stationGroup.addLayer(m);
      });

      cellGroup.addTo(map);
      mapRef.current = map;
      groupsRef.current = { cellGroup, stationGroup };
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
      return () => { map.remove(); mapRef.current = null; };
    }, []);

    // 圖層切換
    React.useEffect(() => {
      const map = mapRef.current; const g = groupsRef.current;
      if (!map || !g.cellGroup) return;
      if (layer === "ticket") { map.addLayer(g.cellGroup); map.removeLayer(g.stationGroup); }
      else { map.addLayer(g.stationGroup); map.removeLayer(g.cellGroup); }
    }, [layer, ready]);

    const glass = { background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)", border: "1px solid var(--color-border-default)" };

    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg-neutral-subtle)" }}>
        {/* 公開頁首 */}
        <header style={{ flexShrink: 0, height: 60, background: "var(--color-bg-neutral-default)", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 14, padding: "0 20px", zIndex: 500 }}>
          <span style={{ width: 30, height: 22, display: "inline-flex", color: "var(--color-bg-primary)" }} dangerouslySetInnerHTML={{ __html: window.WGMark }}></span>
          <span style={{ font: "var(--font-label-500)", fontSize: 17, color: "var(--color-fg-neutral-default)" }}>島嶼守望 · 救災地圖</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: "var(--radius-full)", background: "var(--color-bg-primary-subtle)", border: "1px solid var(--color-bg-primary)" }}>
            <span className="pm-pulse" style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: "var(--color-bg-danger)" }}></span>
            <span style={{ font: "var(--font-data-300)", fontWeight: 700, color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap" }}>應變中 · {window.PUB_EVENT.name}</span>
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <Badge tone="neutral">訪客檢視</Badge>
            <Button size="sm" variant="outline" startIcon={<Icon n="LogIn" s={15} />} onClick={login}>登入救災端</Button>
          </div>
        </header>

        {/* 地圖 */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <div id="pubmap" style={{ position: "absolute", inset: 0, zIndex: 0 }}></div>

          {/* 左上控制列 */}
          <div style={{ position: "absolute", top: 16, left: 16, zIndex: 500, display: "flex", gap: 8, padding: 8, borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", flexWrap: "wrap", ...glass }}>
            <Chip active={layer === "ticket"} onClick={() => setLayer("ticket")}>任務</Chip>
            <Chip active={layer === "station"} onClick={() => setLayer("station")}>站點</Chip>
          </div>

          {/* 圖例 / 隱私說明 */}
          <div style={{ position: "absolute", left: 16, bottom: 16, zIndex: 500, display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", maxWidth: 330, ...glass }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {Object.values(window.PUB_PRIORITY).map((p) => (
                <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, clipPath: HEX, background: p.color, display: "inline-block" }}></span>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>{p.label}</span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <Icon n="ShieldCheck" s={14} c="var(--color-brand-primary-subtle)" />
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.5 }}>為保護求助者，任務位置以<b>六邊形區塊(~500m)</b>呈現、地址僅到鄉鎮；精確資訊需登入救災端。</span>
            </div>
          </div>

          {/* 我要求助 FAB */}
          <div style={{ position: "absolute", right: 16, bottom: 30, zIndex: 500 }}>
            <Button variant="primary" startIcon={<Icon n="Hand" s={18} />} onClick={() => setReport(true)}
              style={{ height: 52, borderRadius: "var(--radius-full)", paddingLeft: 20, paddingRight: 22, boxShadow: "var(--shadow-lg)", fontSize: 15 }}>我要求助</Button>
          </div>
        </div>

        {cell && <CellDrawer cell={cell} onClose={() => setCell(null)} onLogin={login} />}
        {station && !issueFor && (
          <StationDrawer
            station={station}
            onReport={() => setIssueFor(station)}
            onClose={() => setStation(null)}
          />
        )}
        {issueFor && (
          <StationIssueDrawer
            station={issueFor}
            onClose={() => setIssueFor(null)}
            onSubmit={() => { setIssueFor(null); setStation(null); toast("已送出回報（示意）；審核人員確認後才會更新"); }}
          />
        )}
        {report && <ReportDrawer onClose={() => setReport(false)} onSubmit={() => { setReport(false); toast("已送出求助（示意）；救災端將盡快確認"); }} />}
        <ToastHost toasts={toasts} />
      </div>
    );
  }

  Object.assign(window, { PubMapApp });
})();
