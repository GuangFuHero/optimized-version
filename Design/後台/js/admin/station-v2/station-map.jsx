// station-map.jsx (v2) — 地圖視圖：Leaflet + OSM 圖資，與任務管理頁 tk-map.jsx 同源
// 差異：標點依「站點類型」上色（任務單依優先級）；縮小時群聚。
//
// ⚠️ 2026-08-06 與 PM 確認：站點一律是「點」，不畫 Polygon。父子關係只在 UI 上以
//    依附方式呈現（群內站點標示所屬站點群），不做地理包含。指派為個別指派，不用圈選。
(function () {
  const Icon = window.WGIcon;
  const SD = window.StationData;
  const { StatusBadge, TypeChip, PendingChip } = window.StationShared;
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;

  const CENTER = [23.6725, 121.4235];

  // 類型色（沿用設計系統語意色的近似 hex，與 SD.TYPE 的 tone 對應）
  const TYPE_HEX = {
    shelter:  "#7B5EA7",
    supply:   "#E3791E",
    medical:  "#D32F2F",
    water:    "#2592B9",
    charging: "#F57C00",
    other:    "#64748B",
  };

  // 群聚門檻：低於此縮放層級才合併。13 ≈ 鄉鎮全景
  const CLUSTER_MAX_ZOOM = 14;
  // 群聚格線大小（螢幕像素）——同一格內的站點合併為一顆
  const CLUSTER_CELL_PX = 68;

  // ── 標點 HTML ──────────────────────────────────────────────────────────
  function pinHtml(s, selected) {
    const col = TYPE_HEX[s.type] || TYPE_HEX.other;
    const dim = s.status === "closed" || s.deleted;
    const ring = selected ? "outline:3px solid #fff;outline-offset:2px;border:2px solid #0F172A;" : "";
    const shadow = selected ? "0 10px 24px rgba(15,23,42,.34)" : "0 3px 8px rgba(15,23,42,.24)";
    const scale = selected ? "scale(1.18)" : "scale(1)";
    const op = dim ? "opacity:.45;" : "";
    // 站點群用方形（與任務單的「建築錨點」語彙一致），群內站點與一般站用水滴
    const inner = s.isParent
      ? `<span style="width:26px;height:26px;border-radius:6px;background:${col};display:flex;align-items:center;justify-content:center;box-shadow:${shadow};${ring}${op}">
           <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>
         </span>`
      : `<span style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${col};display:block;box-shadow:${shadow};${ring}${op}"></span>`;
    return `<div class="st-pinwrap" style="padding:10px;cursor:pointer;line-height:0;display:flex;align-items:center;justify-content:center;">
      <span class="st-pin" style="display:inline-flex;transform:${scale}">${inner}</span></div>`;
  }

  // ── 群聚圓圈 HTML ───────────────────────────────────────────────────────
  function clusterHtml(n) {
    const d = n >= 20 ? 52 : n >= 10 ? 46 : 40;
    return `<div style="cursor:pointer;line-height:0;display:flex;align-items:center;justify-content:center;">
      <span style="width:${d}px;height:${d}px;border-radius:50%;background:var(--color-bg-primary);color:#111;
        display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${n >= 100 ? 13 : 15}px;
        box-shadow:0 3px 10px rgba(15,23,42,.28);border:3px solid rgba(255,255,255,.9);">${n}</span></div>`;
  }

  function tipHtml(s) {
    return `<div style="min-width:170px;text-align:left">
      <div style="font:var(--font-data-300);color:var(--color-fg-neutral-muted)">${s.id}</div>
      <div style="font:var(--font-label-400);color:var(--color-fg-neutral-default);margin-top:1px">${s.name}</div>
      <div style="font:var(--font-body-300);color:var(--color-fg-neutral-subtle);margin-top:2px">${s.address}</div>
    </div>`;
  }

  // ── 標點細節卡（比照 tk-map 的 DetailCard）──────────────────────────────
  function DetailCard({ s, parent, onOpen, onClose, cardRef }) {
    return React.createElement("div", {
      ref: cardRef, className: "tk-rise",
      style: { position: "absolute", right: 12, top: 12, width: 276, zIndex: 600, display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-lg)" },
    },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 8 } },
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("span", { style: { font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" } }, s.id),
          React.createElement("span", { style: { display: "block", font: "var(--font-label-500)", fontSize: 15, color: "var(--color-fg-neutral-default)", marginTop: 1 } }, s.name)
        ),
        React.createElement("button", { className: "tk-iconbtn", "aria-label": "關閉", onClick: onClose, style: { width: 24, height: 24, flexShrink: 0, border: "none", background: "transparent", cursor: "pointer" } },
          React.createElement(Icon, { n: "X", s: 14, c: "var(--color-fg-neutral-muted)" }))
      ),
      React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } },
        React.createElement(TypeChip, { type: s.type }),
        React.createElement(StatusBadge, { status: s.status }),
        s.isParent && React.createElement(Badge, { tone: "info" }, "站點群")
      ),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" } },
        React.createElement("span", { style: { display: "flex", gap: 6 } },
          React.createElement(Icon, { n: "MapPin", s: 14, c: "var(--color-fg-neutral-muted)" }), s.address),
        parent && React.createElement("span", { style: { display: "flex", gap: 6 } },
          React.createElement(Icon, { n: "CornerDownRight", s: 14, c: "var(--color-fg-neutral-muted)" }), `屬：${parent.name}`),
      ),
      React.createElement(Button, { variant: "primary", size: "sm", startIcon: React.createElement(Icon, { n: "PanelRightOpen", s: 15 }), onClick: () => { onClose(); onOpen(s); } }, "開啟站點細節")
    );
  }

  // ── 主元件 ─────────────────────────────────────────────────────────────
  // selectedId / onSelect 由外部（station-table 的左側清單）控制，兩邊同步高亮。
  function StationMap({ stations, caps, selectedId, onSelect, onOpenStation, onAddStationAt, height = 560 }) {
    const elRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const layerRef = React.useRef(null);      // 標點與群聚圖層群組
    const [innerCard, setInnerCard] = React.useState(null);
    const controlled = typeof onSelect === "function";
    const card = controlled ? selectedId : innerCard;
    const setCard = controlled ? (id) => onSelect(id) : setInnerCard;
    const [zoom, setZoom] = React.useState(13);
    const cardRef = React.useRef(null);
    const zoomCtlRef = React.useRef(null);

    const byId = React.useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), [stations]);
    const shown = stations.find((s) => s.id === card) || null;

    // 建圖
    React.useEffect(() => {
      const L = window.L;
      if (!L || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { center: CENTER, zoom: 13, zoomControl: false, attributionControl: true });
      const zc = L.control.zoom({ position: "topright" });
      zc.addTo(map);
      zoomCtlRef.current = zc.getContainer();
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.on("zoomend", () => setZoom(map.getZoom()));
      // 只有後台能在地圖上點選新增站點。
      // 前台完全不能新增站點（2026-08-06 與 PM 確認），只能對既有站點投票與回報問題。
      if (caps && caps.canCreate && onAddStationAt) {
        map.on("click", (e) => onAddStationAt({ lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) }));
      }
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 60);
      return () => { map.remove(); mapRef.current = null; };
    }, []); // eslint-disable-line


    // 標點 / 群聚
    React.useEffect(() => {
      const L = window.L, map = mapRef.current, grp = layerRef.current;
      if (!L || !map || !grp) return;
      grp.clearLayers();
      const pts = stations.filter((s) => s.lat != null && s.lng != null);

      if (zoom > CLUSTER_MAX_ZOOM) {
        pts.forEach((s) => {
          const icon = L.divIcon({ className: "", html: pinHtml(s, card === s.id), iconSize: [42, 42], iconAnchor: [21, 36] });
          const m = L.marker([s.lat, s.lng], { icon, zIndexOffset: card === s.id ? 1000 : (s.isParent ? 400 : 0), riseOnHover: true }).addTo(grp);
          m.bindTooltip(tipHtml(s), { direction: "top", offset: [0, -18], opacity: 1, className: "st-leaflet-tip" });
          m.on("click", () => setCard(s.id));
        });
      } else {
        // 螢幕像素格線群聚：同格合併為一顆圓圈，圈內數字＝該格站點數
        const cells = {};
        pts.forEach((s) => {
          const p = map.latLngToContainerPoint([s.lat, s.lng]);
          const k = `${Math.floor(p.x / CLUSTER_CELL_PX)}_${Math.floor(p.y / CLUSTER_CELL_PX)}`;
          (cells[k] = cells[k] || []).push(s);
        });
        Object.values(cells).forEach((group) => {
          if (group.length === 1) {
            const s = group[0];
            const icon = L.divIcon({ className: "", html: pinHtml(s, card === s.id), iconSize: [42, 42], iconAnchor: [21, 36] });
            const m = L.marker([s.lat, s.lng], { icon, riseOnHover: true }).addTo(grp);
            m.bindTooltip(tipHtml(s), { direction: "top", offset: [0, -18], opacity: 1, className: "st-leaflet-tip" });
            m.on("click", () => setCard(s.id));
            return;
          }
          const lat = group.reduce((a, s) => a + s.lat, 0) / group.length;
          const lng = group.reduce((a, s) => a + s.lng, 0) / group.length;
          const icon = L.divIcon({ className: "", html: clusterHtml(group.length), iconSize: [52, 52], iconAnchor: [26, 26] });
          const m = L.marker([lat, lng], { icon, zIndexOffset: 800 }).addTo(grp);
          m.bindTooltip(`${group.length} 個站點 · 點擊放大`, { direction: "top", offset: [0, -22], opacity: 1, className: "st-leaflet-tip" });
          m.on("click", () => map.flyToBounds(L.latLngBounds(group.map((s) => [s.lat, s.lng])), { padding: [64, 64], maxZoom: 17, duration: 0.6 }));
        });
      }
    }, [stations, zoom, card]);

    // 外部選取 → 飛到對應標點
    React.useEffect(() => {
      const map = mapRef.current;
      const s = card ? stations.find((x) => x.id === card) : null;
      if (!map || !s || s.lat == null) return;
      map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    }, [card]); // eslint-disable-line

    // 預設視野框住當前篩選結果
    React.useEffect(() => {
      const L = window.L, map = mapRef.current;
      if (!L || !map || card) return;
      const pts = stations.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]);
      if (pts.length === 1) map.setView(pts[0], 15);
      else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [48, 48] });
    }, [stations]); // eslint-disable-line

    React.useEffect(() => { const m = mapRef.current; if (m) setTimeout(() => m.invalidateSize(), 60); }, [height]);

    // 縮放控制讓位給細節卡
    React.useLayoutEffect(() => {
      const zEl = zoomCtlRef.current;
      if (!zEl) return;
      const h = shown && cardRef.current ? cardRef.current.getBoundingClientRect().height + 12 : 0;
      zEl.style.marginTop = h ? `${h}px` : "";
      zEl.style.transition = "margin-top var(--duration-base) var(--ease-out)";
    }, [shown]);

    return React.createElement("div", { style: { position: "relative", height, borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--color-border-default)" } },
      React.createElement("div", { ref: elRef, style: { position: "absolute", inset: 0, background: "var(--color-bg-neutral-sunken)" } }),

      shown && React.createElement(DetailCard, {
        s: shown, parent: shown.parentId ? byId[shown.parentId] : null, cardRef,
        onOpen: onOpenStation, onClose: () => setCard(null),
      }),

      // 圖例
      React.createElement("div", { style: { position: "absolute", left: 12, bottom: 24, display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)", zIndex: 500 } },
        React.createElement("span", { className: "wg-caption", style: { fontWeight: 700, color: "var(--color-fg-neutral-muted)", letterSpacing: ".04em" } }, "站點類型"),
        SD.TYPE_ORDER.map((t) => React.createElement("span", { key: t, style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { width: 16, display: "inline-flex", justifyContent: "center", flexShrink: 0 } },
            React.createElement("span", { style: { width: 13, height: 13, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: TYPE_HEX[t], display: "inline-block" } })),
          React.createElement("span", { className: "wg-caption", style: { color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" } }, SD.TYPE[t].label)
        )),
        React.createElement("span", { style: { height: 1, background: "var(--color-border-default)", margin: "1px 0" } }),
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { width: 16, display: "inline-flex", justifyContent: "center", flexShrink: 0 } },
            React.createElement("span", { style: { width: 15, height: 15, borderRadius: "var(--radius-sm)", background: "var(--color-fg-neutral-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" } },
              React.createElement(Icon, { n: "Building2", s: 10, c: "var(--color-bg-neutral-default)" }))),
          React.createElement("span", { className: "wg-caption", style: { color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" } }, "站點群（虛線範圍）")
        )
      ),

      // 群聚狀態提示
      zoom <= CLUSTER_MAX_ZOOM && React.createElement("div", { style: { position: "absolute", left: 12, top: 12, zIndex: 500, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" } },
        React.createElement(Icon, { n: "Group", s: 14, c: "currentColor" }), "密集站點已合併，放大可展開"
      )
    );
  }

  window.StationMap = StationMap;
})();
