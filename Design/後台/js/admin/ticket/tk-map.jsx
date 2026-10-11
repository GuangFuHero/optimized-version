// tk-map.jsx — 地圖視圖的地圖窗格（Leaflet + OSM 圖資，與公開救災地圖同源；可縮放平移）
// 定位為瀏覽與決策輔助，不承載批次操作（F7）
(function () {
  const Icon = window.WGIcon;

  // 示範座標 — 正式版由後端 geocoding 提供
  const COORDS = {
    "T-1042": { c: [23.6760, 121.4205], anchor: true },
    "T-1067": { c: [23.6748, 121.4218], anchor: true },
    "T-1071": { c: [23.6640, 121.4290] },
    "T-1080": { c: [23.7455, 121.4520], anchor: true },
    "T-1085": { c: [23.7448, 121.4535], anchor: true },
    "T-1078": { c: [23.6699, 121.4238] },
    "T-1090": { c: [23.6672, 121.4262] },
  };
  const PRI_HEX = { critical: "#D32F2F", high: "#F57C00", medium: "#2592B9", low: "#2592B9" };
  const CENTER = [23.6725, 121.4235];
  window.TK_COORDS = COORDS;

  // 標點：填色 = 優先級；選中以外環 + 放大 + 層級表達（F5，不動色相）
  function pinHtml(t, selected) {
    const col = PRI_HEX[t.priority] || "#2592B9";
    const c = COORDS[t.id];
    const ring = selected ? "outline:3px solid #fff;outline-offset:2px;border:2px solid #0F172A;" : "";
    const shadow = selected ? "0 10px 24px rgba(227,121,30,.34)" : "0 3px 8px rgba(227,121,30,.24)";
    const scale = selected ? "scale(1.18)" : "scale(1)";
    const inner = c.anchor
      ? `<span style="width:26px;height:26px;border-radius:6px;background:${col};display:flex;align-items:center;justify-content:center;box-shadow:${shadow};${ring}">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>
         </span>`
      : `<span style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${col};display:block;box-shadow:${shadow};${ring}"></span>`;
    // 命中區大於視覺區：外圍 10px 透明 padding
    return `<div class="tk-pinwrap" style="padding:10px;cursor:pointer;line-height:0;display:flex;align-items:center;justify-content:center;">
      <span class="tk-pin" style="display:inline-flex;transform:${scale}">${inner}</span></div>`;
  }

  function tipHtml(t) {
    return `<div style="min-width:170px;text-align:left">
      <div style="font:var(--font-data-300);color:var(--color-fg-neutral-muted)">#${t.id}</div>
      <div style="font:var(--font-label-400);color:var(--color-fg-neutral-default);margin-top:1px">${t.title}</div>
      <div style="font:var(--font-body-300);color:var(--color-fg-neutral-subtle);margin-top:2px">${window.tkAddress(t)}</div>
    </div>`;
  }

  // 標點細節卡：點標點後出現，摘要 + 明確的「開啟任務細節」行動點（F4）
  function DetailCard({ t, onOpen, onClose, cardRef }) {
    const { Button } = window.WanGuardDesignSystem_9c8f68;
    const { PriorityBadge, StatusBadge } = window;
    const fulfilled = (t.tasks || []).filter((k) => k.status === "fulfilled").length;
    return (
      <div ref={cardRef} className="tk-rise" style={{ position: "absolute", right: 12, top: 12, width: 268, zIndex: 600, display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>#{t.id}</span>
            <span style={{ display: "block", font: "var(--font-label-500)", fontSize: 15, color: "var(--color-fg-neutral-default)", marginTop: 1 }}>{t.title}</span>
          </div>
          <button className="tk-iconbtn" aria-label="關閉" onClick={onClose} style={{ width: 24, height: 24, flexShrink: 0 }}>
            <Icon n="X" s={14} c="var(--color-fg-neutral-muted)" />
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <PriorityBadge p={t.priority} /><StatusBadge s={window.tkStatus(t)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" }}>
          <span style={{ display: "flex", gap: 6 }}><Icon n="MapPin" s={14} c="var(--color-fg-neutral-muted)" />{window.tkAddress(t)}{t.floor ? `（${t.floor}）` : ""}</span>
          {t.contact_name && <span style={{ display: "flex", gap: 6 }}><Icon n="User" s={14} c="var(--color-fg-neutral-muted)" />{t.contact_name}{t.contact_phone ? ` · ${t.contact_phone}` : ""}</span>}
          <span style={{ display: "flex", gap: 6 }}><Icon n="Users" s={14} c="var(--color-fg-neutral-muted)" />{t.team || "未指派"}</span>
          <span style={{ display: "flex", gap: 6 }}><Icon n="ClipboardList" s={14} c="var(--color-fg-neutral-muted)" />{(t.tasks || []).length} 筆需求 · 已滿足 {fulfilled}/{(t.tasks || []).length}</span>
        </div>
        <Button variant="primary" size="sm" startIcon={<Icon n="PanelRightOpen" s={15} />} onClick={() => { onClose(); onOpen(t); }}>開啟任務細節</Button>
      </div>
    );
  }

  function TicketMapPane({ rows, selectedId, onSelect, onOpen, height = 560 }) {
    const elRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const markersRef = React.useRef({});
    const selRef = React.useRef(selectedId);
    selRef.current = selectedId;
    const [card, setCard] = React.useState(null);
    const cardRef = React.useRef(null);
    const zoomRef = React.useRef(null);
    React.useEffect(() => { setCard(selectedId); }, [selectedId]);
    const shown = rows.find((t) => t.id === card);

    React.useEffect(() => {
      const L = window.L;
      if (!L || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { center: CENTER, zoom: 13, zoomControl: false, attributionControl: true });
      const zc = L.control.zoom({ position: "topright" });
      zc.addTo(map);
      zoomRef.current = zc.getContainer();
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 60);
      return () => { map.remove(); mapRef.current = null; markersRef.current = {}; };
    }, []);

    // 標點同步（跟隨篩選結果）
    React.useEffect(() => {
      const L = window.L, map = mapRef.current;
      if (!L || !map) return;
      const keep = {};
      rows.forEach((t) => {
        if (!COORDS[t.id]) return;
        keep[t.id] = true;
        const selected = selRef.current === t.id;
        let m = markersRef.current[t.id];
        const icon = L.divIcon({ className: "", html: pinHtml(t, selected), iconSize: [42, 42], iconAnchor: [21, 36] });
        if (m) { m.setIcon(icon); m.setZIndexOffset(selected ? 1000 : 0); }
        else {
          m = L.marker(COORDS[t.id].c, { icon, zIndexOffset: selected ? 1000 : 0, riseOnHover: true }).addTo(map);
          m.bindTooltip(tipHtml(t), { direction: "top", offset: [0, -18], opacity: 1, className: "tk-leaflet-tip" });
          m.on("click", () => { onSelect(t.id); setCard(t.id); });
          markersRef.current[t.id] = m;
        }
      });
      Object.keys(markersRef.current).forEach((id) => {
        if (!keep[id]) { map.removeLayer(markersRef.current[id]); delete markersRef.current[id]; }
      });
      // 預設視野框住當前篩選結果（避免固定 center/zoom 將標點置於可視區外）
      if (!selRef.current) {
        const pts = rows.filter((t) => COORDS[t.id]).map((t) => COORDS[t.id].c);
        if (pts.length === 1) map.setView(pts[0], 15);
        else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [48, 48] });
      }
    }, [rows, selectedId, onSelect]);

    // 選取 → 飛到對應標點
    React.useEffect(() => {
      const map = mapRef.current;
      if (!map || !selectedId || !COORDS[selectedId]) return;
      map.flyTo(COORDS[selectedId].c, Math.max(map.getZoom(), 15), { duration: 0.6 });
    }, [selectedId]);

    React.useEffect(() => { const m = mapRef.current; if (m) setTimeout(() => m.invalidateSize(), 60); }, [height]);

    // 縮放控制讓位給任務細節卡：卡片出現時下移到卡片下方
    React.useLayoutEffect(() => {
      const zEl = zoomRef.current;
      if (!zEl) return;
      const h = shown && cardRef.current ? cardRef.current.getBoundingClientRect().height + 12 : 0;
      zEl.style.marginTop = h ? `${h}px` : "";
      zEl.style.transition = "margin-top var(--duration-base) var(--ease-out)";
    }, [shown]);

    return (
      <div style={{ position: "relative", height, borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--color-border-default)" }}>
        <div ref={elRef} style={{ position: "absolute", inset: 0, background: "var(--color-bg-neutral-sunken)" }}></div>

        {shown && <DetailCard t={shown} cardRef={cardRef} onOpen={onOpen} onClose={() => setCard(null)} />}

        {/* 圖例：直式分組，水滴尖端朝下 */}
        <div style={{ position: "absolute", left: 12, bottom: 24, display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)", zIndex: 500 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)", letterSpacing: ".04em" }}>優先級</span>
          {[["#D32F2F", "生命危急"], ["#F57C00", "緊急"], ["#2592B9", "一般"]].map(([c, l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 16, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ width: 13, height: 13, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: c, display: "inline-block" }}></span>
              </span>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>{l}</span>
            </span>
          ))}
          <span style={{ height: 1, background: "var(--color-border-default)", margin: "1px 0" }}></span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 16, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ width: 15, height: 15, borderRadius: "var(--radius-sm)", background: "var(--color-fg-neutral-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon n="Building2" s={10} c="var(--color-bg-neutral-default)" />
              </span>
            </span>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>建築錨點</span>
          </span>
        </div>
      </div>
    );
  }

  Object.assign(window, { TicketMapPane });
})();
