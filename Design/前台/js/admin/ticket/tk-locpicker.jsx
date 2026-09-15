// tk-locpicker.jsx — 地標選點（建單抽屜內嵌小地圖：自動定位一次 → 可點圖／拖曳大頭針調整）
(function () {
  const Icon = window.WGIcon;
  const FALLBACK = [23.6725, 121.4235]; // 光復鄉；無定位時的起始視野

  const fmt = (n) => Number(n).toFixed(5);

  function pinHtml() {
    return `<div style="padding:8px;line-height:0;cursor:grab">
      <span style="display:block;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#E3791E;border:2px solid #fff;box-shadow:0 4px 12px rgba(227,121,30,.42)"></span>
    </div>`;
  }

  // value: {lat,lng} | null
  function LocationPicker({ value, onChange, invalid, height = 236 }) {
    const elRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const markRef = React.useRef(null);
    const [status, setStatus] = React.useState("idle"); // idle | locating | error
    const cbRef = React.useRef(onChange);
    cbRef.current = onChange;

    const locate = React.useCallback(() => {
      if (!navigator.geolocation) { setStatus("error"); return; }
      setStatus("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setStatus("idle");
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" };
          cbRef.current(p);
          if (mapRef.current) mapRef.current.setView([p.lat, p.lng], 17);
        },
        () => setStatus("error"),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    }, []);

    React.useEffect(() => {
      const L = window.L;
      if (!L || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { center: value ? [value.lat, value.lng] : FALLBACK, zoom: value ? 17 : 14, zoomControl: false, attributionControl: false });
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      map.on("click", (e) => cbRef.current({ lat: e.latlng.lat, lng: e.latlng.lng, source: "manual" }));
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 80);
      if (!value) locate(); // 建新單：自動抓一次定位
      return () => { map.remove(); mapRef.current = null; markRef.current = null; };
    }, []);

    // 大頭針同步（可拖曳）
    React.useEffect(() => {
      const L = window.L, map = mapRef.current;
      if (!L || !map) return;
      if (!value) { if (markRef.current) { map.removeLayer(markRef.current); markRef.current = null; } return; }
      const ll = [value.lat, value.lng];
      if (markRef.current) markRef.current.setLatLng(ll);
      else {
        const m = L.marker(ll, { draggable: true, icon: L.divIcon({ className: "", html: pinHtml(), iconSize: [40, 40], iconAnchor: [20, 34] }) }).addTo(map);
        m.on("dragend", () => { const p = m.getLatLng(); cbRef.current({ lat: p.lat, lng: p.lng, source: "manual" }); });
        markRef.current = m;
      }
    }, [value && value.lat, value && value.lng]);

    const ring = invalid ? "var(--color-bg-danger)" : "var(--color-border-default)";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ position: "relative", height, borderRadius: "var(--radius-md)", overflow: "hidden", border: `${invalid ? 1.5 : 1}px solid ${ring}`, background: "var(--color-bg-neutral-sunken)" }}>
          <div ref={elRef} style={{ position: "absolute", inset: 0, cursor: value ? "grab" : "crosshair" }}></div>
          {(status === "locating" || !value) && (
            <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 500, display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>
              <Icon n={status === "locating" ? "LoaderCircle" : "MapPin"} s={13} c="var(--color-fg-neutral-muted)" />
              {status === "locating" ? "正在取得目前定位…" : "點地圖任一處放置大頭針"}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="tk-chipbtn" onClick={locate} disabled={status === "locating"} style={{ height: 32, padding: "0 14px", opacity: status === "locating" ? 0.6 : 1 }}>
            <Icon n="LocateFixed" s={14} c="currentColor" />{status === "locating" ? "定位中…" : "用目前定位"}
          </button>
          {value ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0, font: "var(--font-data-300)", fontVariantNumeric: "tabular-nums", color: "var(--color-fg-neutral-subtle)" }}>
              <span style={{ color: "var(--color-fg-neutral-muted)" }}>座標</span>
              {fmt(value.lat)}, {fmt(value.lng)}
              <span style={{ color: "var(--color-fg-neutral-muted)" }}>· {value.source === "gps" ? "目前定位" : "手動標記"}</span>
            </span>
          ) : (
            <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>尚未標記地標</span>
          )}
        </div>

        {status === "error" && (
          <span className="wg-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-fg-danger)" }}>
            <Icon n="TriangleAlert" s={13} c="var(--color-fg-danger)" />拿不到定位，請在地圖上點一下
          </span>
        )}
      </div>
    );
  }

  Object.assign(window, { LocationPicker });
})();
