// map-canvas.jsx — 互助地圖的 Leaflet 畫布：任務單標點、資源站點、區域多邊形、手繪與邊界編輯
//
// 圖資與互動沿用既有兩處實作，不另起爐灶：
//   - 標點樣式與 tooltip：`js/admin/ticket/tk-map.jsx`（同一組優先級色）
//   - 原生 Leaflet imperative 同步：`js/site/site-map.jsx`
//   - 站點用途類型與圖示：`js/site/site-route.js` 的 STATION_TYPE_OPTIONS / _ICONS（正典同一份）
//
// 手繪與編輯都是自寫，**沒有引入 Leaflet.draw / Leaflet.Editable**。理由：
//   1. 那兩支的提示文案是英文，且不易在災防語境下改寫
//   2. 正典 AC-08 要求「自我相交的多邊形被拒絕並說明原因」，Leaflet.draw 的預設
//      行為是允許後才提示，改它比自寫麻煩
//   3. 少兩支 unpkg 相依
// ⚠️ 代價：目前只支援多邊形。正典 AC-01 還要求矩形／圓形／自由曲線／點危害，未做。
(function () {
  const PRI_HEX = { critical: "#D32F2F", high: "#F57C00", medium: "#2592B9", low: "#64748B" };

  function iconSvg(name, color, size) {
    if (!window.lucide || !window.lucide[name]) return "";
    const el = window.lucide.createElement(window.lucide[name]);
    el.setAttribute("width", size); el.setAttribute("height", size);
    el.setAttribute("stroke", color); el.setAttribute("stroke-width", "2.2");
    return el.outerHTML;
  }

  // 🔴 2026-09-26：任務單從大水滴改成**圓點**（白邊）。
  //    上百個水滴會把區域的範圍整個蓋掉；這一頁的主角是「區域」，任務單是用來看分布與數量的。
  //    要看單張內容，滑過去有 tooltip，點進區域細節有清單。
  function pinHtml(t, selected, dim) {
    const col = PRI_HEX[t.priority] || "#2592B9";
    const size = t.synthetic ? 11 : 14;
    const ring = selected ? "box-shadow:0 0 0 2px #fff,0 0 0 4px #0F172A;" : "box-shadow:0 0 0 2px #fff,0 1px 4px rgba(15,23,42,.45);";
    return `<div style="padding:6px;line-height:0;cursor:pointer;opacity:${dim ? 0.22 : 1}">
      <span style="width:${size}px;height:${size}px;border-radius:50%;background:${col};display:block;${ring}"></span></div>`;
  }

  /** 區域名稱標籤：白底深字＋左側色塊（危險區為斜紋）。放在最上層的 pane，不被標點蓋住。 */
  function zoneLabelHtml(z, on, dim) {
    const sw = z.kind === "hazard"
      ? `<span class="wg-hazard-swatch" style="width:12px;height:12px;border-radius:3px;flex-shrink:0"></span>`
      : `<span style="width:12px;height:12px;border-radius:3px;flex-shrink:0;background:${z.color}"></span>`;
    const border = z.kind === "hazard" ? "#E65100" : z.color;
    const sub = z.kind === "hazard" ? "危險區" : (z.team || "");
    return `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:7px;white-space:nowrap;
        padding:5px 11px 5px 8px;border-radius:8px;background:#fff;color:#0F172A;border:${on ? 2 : 1.5}px solid ${border};
        font:700 13px/1.2 var(--font-body, 'Noto Sans TC', sans-serif);box-shadow:0 2px 10px rgba(15,23,42,.22);
        opacity:${dim ? 0.55 : 1};cursor:pointer">
        ${sw}<span>${z.name}</span>${sub ? `<span style="font-weight:500;color:#475569;font-size:12px">${sub}</span>` : ""}</div>`;
  }

  // 站點與任務單刻意用**不同形狀**（圓角方 vs 水滴），不是只換顏色 ——
  // 災防現場快速掃視時色相分不出兩種東西。
  function stationHtml(s, dim) {
    const meta = (window.MAP_STATION_TYPES || []).find((x) => x.value === s.type);
    const glyph = iconSvg(meta ? meta.icon : "MapPin", "#fff", 13);
    return `<div style="padding:6px;line-height:0;cursor:pointer;opacity:${dim ? 0.3 : 1}">
      <span style="width:24px;height:24px;border-radius:7px;background:#0F172A;display:flex;align-items:center;
        justify-content:center;box-shadow:0 2px 7px rgba(15,23,42,.4);border:2px solid #fff">${glyph}</span></div>`;
  }

  function tipHtml(t) {
    return `<div style="min-width:150px;text-align:left">
      <div style="font:var(--font-data-300);color:var(--color-fg-neutral-muted)">#${t.id}</div>
      <div style="font:var(--font-label-400);margin-top:1px">${t.title}</div>
      <div style="font:var(--font-body-300);color:var(--color-fg-neutral-subtle);margin-top:2px">${t.team || "未指派"}</div>
    </div>`;
  }

  function stationTip(s) {
    const meta = (window.MAP_STATION_TYPES || []).find((x) => x.value === s.type);
    return `<div style="min-width:130px;text-align:left">
      <div style="font:var(--font-label-400)">${s.name}</div>
      <div style="font:var(--font-body-300);color:var(--color-fg-neutral-subtle);margin-top:2px">
        ${meta ? meta.label : s.type}${s.isOfficial ? " · 🛡 官方" : ""}</div></div>`;
  }

  function vertexIcon(L, color, kind) {
    const html = kind === "mid"
      ? `<span style="display:flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;
           background:#fff;border:2px dashed ${color};color:${color};font:700 11px/1 var(--font-data,monospace);cursor:copy">+</span>`
      : `<span style="display:block;width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid ${color};
           box-shadow:0 1px 5px rgba(15,23,42,.4);cursor:grab"></span>`;
    return L.divIcon({ className: "", html, iconSize: [15, 15], iconAnchor: [7.5, 7.5] });
  }

  function midpoints(ring) {
    return ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length];
      return { at: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], after: i };
    });
  }

  /**
   * props
   *   tickets / stations        要畫的點（已套用篩選）
   *   zones                     要畫的區域
   *   layers                    {tickets, stations, zones} 圖層開關
   *   selectedZoneId            高亮的區域
   *   mode                      'browse' | 'draw' | 'edit'
   *   draft                     繪製／編輯中的頂點陣列（受控，父層持有）
   *   onDraftChange(ring)       頂點變動
   *   onFinishDraw()            完成（僅 draw）
   *   onSelectZone(id)          點到既有區域
   *   highlightIds              要強調的任務單 id
   */
  function MapCanvas({
    tickets, stations, zones, layers, selectedZoneId, mode, draft,
    onDraftChange, onFinishDraw, onSelectZone, onBackgroundClick, highlightIds,
  }) {
    const drawing = mode === "draw";
    const editing = mode === "edit";
    const busy = drawing || editing;

    const hostRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const pinLayerRef = React.useRef(null);
    const zoneLayerRef = React.useRef(null);
    const draftLayerRef = React.useRef(null);
    const labelLayerRef = React.useRef(null);
    const liveRef = React.useRef({});
    liveRef.current = { drawing, editing, draft, onDraftChange, onFinishDraw, zones, onBackgroundClick };

    React.useEffect(() => {
      const L = window.L;
      if (!L || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, { center: window.MAP_CENTER, zoom: 13, zoomControl: false, doubleClickZoom: false });
      L.control.zoom({ position: "topright" }).addTo(map);
      L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

      zoneLayerRef.current = L.layerGroup().addTo(map);   // 面在最底
      draftLayerRef.current = L.layerGroup().addTo(map);
      pinLayerRef.current = L.layerGroup().addTo(map);    // 標點在面之上
      // 區域名稱放在自己的 pane，DOM 順序在 markerPane 之後 —— 本頁 CSS 把所有 pane 的 z-index
      // 壓成同一個值（為了不蓋過外殼的浮層），同值時後面的在上面。
      map.createPane("zoneLabels");
      labelLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (e) => {
        const s = liveRef.current;
        if (!s.drawing) {                               // 瀏覽態：點空白處＝關掉細節
          if (!s.editing && s.onBackgroundClick) s.onBackgroundClick();
          return;                                       // 編輯態不靠點地圖加點，靠中點的「＋」
        }
        s.onDraftChange([...(s.draft || []), [e.latlng.lat, e.latlng.lng]]);
      });
      map.on("dblclick", () => {
        const s = liveRef.current;
        if (s.drawing && (s.draft || []).length >= 3) s.onFinishDraw();
      });
      mapRef.current = map;
      setTimeout(() => {
        map.invalidateSize();
        // 預設視野框住既有區域。固定 center/zoom 會讓標點擠成一團看不出分佈
        // ——與 tk-map.jsx 的 fitBounds 同一個理由。
        const all = [];
        (liveRef.current.zones || []).forEach((z) => all.push(...z.ring));
        if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [56, 56] });
      }, 60);
      return () => { map.remove(); mapRef.current = null; };
    }, []);

    // 游標與鍵盤
    React.useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      map.getContainer().style.cursor = drawing ? "crosshair" : "";
      if (!busy) return;
      const onKey = (e) => {
        const s = liveRef.current;
        if (s.drawing && e.key === "Backspace" && (s.draft || []).length) { e.preventDefault(); s.onDraftChange(s.draft.slice(0, -1)); }
        if (s.drawing && e.key === "Enter" && (s.draft || []).length >= 3) s.onFinishDraw();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [drawing, busy]);

    // 區域圖層
    // 🔴 2026-09-26：區域改成「粗實線＋很淡的填色」，標籤改白底深字。
    //    選了一區時，其他區域淡掉 —— 眼睛只需要看一個範圍。
    React.useEffect(() => {
      const L = window.L, layer = zoneLayerRef.current, labels = labelLayerRef.current;
      if (!L || !layer) return;
      layer.clearLayers();
      if (labels) labels.clearLayers();
      if (layers && layers.zones === false) return;
      (zones || []).forEach((z) => {
        // 正在編輯的那一區由草稿圖層畫，這裡跳過，免得兩層疊在一起看不出改了什麼
        if (editing && z.editing) return;
        const on = z.id === selectedZoneId;
        const dim = (selectedZoneId && !on) || busy;
        const hazard = z.kind === "hazard";
        // 🔒 危險區固定橘白斜紋（2026-09-25 Sucre：像危險角錐的顏色），不吃 z.color
        if (hazard && window.WGHazard) window.WGHazard.ensure();
        const style = hazard && window.WGHazard
          ? { ...window.WGHazard.polygonStyle({ selected: on }), ...(dim ? { opacity: 0.5, fillOpacity: 0.3 } : {}) }
          : { color: z.color, weight: on ? 4 : 3, opacity: dim ? 0.45 : 1, fillColor: z.color, fillOpacity: on ? 0.14 : dim ? 0.03 : 0.07 };
        const poly = L.polygon(z.ring, { ...style, interactive: !busy }).addTo(layer);
        poly.on("click", (e) => { window.L.DomEvent.stop(e); onSelectZone && onSelectZone(z.id); });
        if (labels) {
          L.marker(window.mapCentroid(z.ring), {
            pane: "zoneLabels", interactive: !busy, keyboard: false,
            icon: L.divIcon({ className: "", html: zoneLabelHtml(z, on, dim), iconSize: [0, 0] }),
          }).on("click", (e) => { window.L.DomEvent.stop(e); onSelectZone && onSelectZone(z.id); }).addTo(labels);
        }
      });
    }, [zones, selectedZoneId, busy, editing, layers, onSelectZone]);

    // 草稿／編輯圖層
    React.useEffect(() => {
      const L = window.L, layer = draftLayerRef.current;
      if (!L || !layer) return;
      layer.clearLayers();
      const ring = draft || [];
      if (!busy || !ring.length) return;

      const bad = ring.length >= 4 && window.mapSelfIntersects(ring);
      // 草稿用近黑色虛線：跟任何區域色、優先級色、危險區橘都不撞
      const col = bad ? "#D32F2F" : "#0F172A";

      let poly = null;
      if (ring.length >= 3) {
        poly = L.polygon(ring, { color: col, weight: 2.5, dashArray: "6 4", fillColor: col, fillOpacity: 0.14 }).addTo(layer);
      } else if (ring.length === 2) {
        L.polyline(ring, { color: col, weight: 2, dashArray: "6 4" }).addTo(layer);
      }

      // 頂點。編輯態可拖、可點掉（保留至少 3 個）
      const live = ring.map((p) => [p[0], p[1]]);
      ring.forEach((p, i) => {
        const m = L.marker(p, {
          icon: vertexIcon(L, col, "vertex"),
          draggable: editing, interactive: editing, zIndexOffset: 900 + i,
        }).addTo(layer);
        if (!editing) return;
        // 拖曳期間只改 Leaflet 圖層，放開才回寫 state —— 每一格都 setState 會把
        // marker 重建掉，拖到一半就斷手。
        m.on("drag", (e) => {
          live[i] = [e.latlng.lat, e.latlng.lng];
          if (poly) poly.setLatLngs(live);
        });
        m.on("dragend", () => liveRef.current.onDraftChange(live.map((q) => [q[0], q[1]])));
        m.on("click", (e) => {
          L.DomEvent.stop(e);
          const s = liveRef.current;
          if ((s.draft || []).length <= 3) return;      // 少於三個就不是多邊形了
          s.onDraftChange(s.draft.filter((_, k) => k !== i));
        });
        m.bindTooltip("拖曳移動 · 點一下刪除", { direction: "top", offset: [0, -10] });
      });

      // 中點的「＋」：在兩個角之間插一個新角
      if (editing && ring.length >= 3) {
        midpoints(ring).forEach((mp) => {
          L.marker(mp.at, { icon: vertexIcon(L, col, "mid"), zIndexOffset: 880 })
            .addTo(layer)
            .bindTooltip("在這裡加一個轉角", { direction: "top", offset: [0, -10] })
            .on("click", (e) => {
              L.DomEvent.stop(e);
              const s = liveRef.current;
              const next = s.draft.slice();
              next.splice(mp.after + 1, 0, mp.at);
              s.onDraftChange(next);
            });
        });
      }
    }, [draft, busy, editing]);

    // 標點圖層
    React.useEffect(() => {
      const L = window.L, layer = pinLayerRef.current;
      if (!L || !layer) return;
      layer.clearLayers();
      const hi = highlightIds && highlightIds.length ? new Set(highlightIds) : null;
      if (!layers || layers.tickets !== false) {
        (tickets || []).forEach((t) => {
          if (!t.coord) return;
          const on = hi ? hi.has(t.id) : false;
          const m = L.marker(t.coord, {
            icon: L.divIcon({ className: "", html: pinHtml(t, on, hi ? !on : false), iconSize: [30, 30], iconAnchor: [15, 26] }),
            interactive: !busy, zIndexOffset: on ? 800 : 0,
          }).addTo(layer);
          if (!busy) m.bindTooltip(tipHtml(t), { direction: "top", offset: [0, -20], opacity: 1 });
        });
      }
      if (!layers || layers.stations !== false) {
        (stations || []).forEach((s) => {
          const m = L.marker(s.coord, {
            icon: L.divIcon({ className: "", html: stationHtml(s, hi ? true : false), iconSize: [36, 36], iconAnchor: [18, 18] }),
            interactive: !busy,
          }).addTo(layer);
          if (!busy) m.bindTooltip(stationTip(s), { direction: "top", offset: [0, -14] });
        });
      }
    }, [tickets, stations, highlightIds, busy, layers]);

    // 選取區域 → 飛過去
    React.useEffect(() => {
      const map = mapRef.current;
      if (!map || !selectedZoneId || busy) return;
      const z = (zones || []).find((x) => x.id === selectedZoneId);
      if (z) map.flyToBounds(window.L.latLngBounds(z.ring), { padding: [64, 64], duration: 0.5 });
    }, [selectedZoneId]);

    return <div ref={hostRef} style={{ position: "absolute", inset: 0, background: "var(--color-bg-neutral-sunken)" }}></div>;
  }

  Object.assign(window, { MapCanvas, MAP_PRI_HEX: PRI_HEX });
})();
