// StationMap.jsx — 地圖視圖: OSM 風格底圖 + 狀態標點 + 聚合 (clustering, RS6) + 地圖直接新增站點
(function () {
  const { Card, Badge, Button, Switch } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const { StatusBadge, TypeChip, SourceTag } = window.StationShared;
  const Icon = window.WGIcon;

  function StationMap({ stations, caps, onOpenStation, onAddStationAt, density }) {
    const live = stations.filter((s) => !s.deleted);
    const [sel, setSel] = React.useState(live[0] ? live[0].id : null);
    const [cluster, setCluster] = React.useState(true);
    const [addMode, setAddMode] = React.useState(false);

    React.useEffect(() => { if (live.length && !live.find((s) => s.id === sel)) setSel(live[0].id); }, [live, sel]);
    const selStation = live.find((s) => s.id === sel) || null;

    // cluster by admin area centroid
    const clusters = React.useMemo(() => {
      const m = {};
      live.forEach((s) => { (m[s.area] = m[s.area] || []).push(s); });
      return Object.entries(m).map(([area, arr]) => ({
        area, count: arr.length,
        x: arr.reduce((a, s) => a + s.x, 0) / arr.length,
        y: arr.reduce((a, s) => a + s.y, 0) / arr.length,
        stations: arr,
      }));
    }, [live]);

    function mapClick(e) {
      if (!addMode) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      const lat = +(23.50 + (90 - y) / 90 * 0.30).toFixed(4);
      const lng = +(121.37 + x / 100 * 0.10).toFixed(4);
      setAddMode(false);
      onAddStationAt({ x: +x.toFixed(1), y: +y.toFixed(1), lat, lng });
    }

    return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, height: "calc(100vh - 320px)", minHeight: 520 } },
      // —— side list ——
      React.createElement(Card, { padding: "0", style: { display: "flex", flexDirection: "column", overflow: "hidden" } },
        React.createElement("div", { style: { padding: "15px 18px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" } },
          React.createElement("h3", { className: "wg-h600", style: { fontSize: 16 } }, "站點清單"),
          React.createElement(Badge, { tone: "primary", variant: "solid" }, String(live.length))
        ),
        React.createElement("div", { style: { overflow: "auto", flex: 1 } },
          live.map((s) => React.createElement("button", { key: s.id, onClick: () => setSel(s.id),
            style: { width: "100%", textAlign: "left", border: "none", cursor: "pointer", padding: density === "compact" ? "10px 18px" : "13px 18px",
              borderBottom: "1px solid var(--color-bg-neutral-sunken)", background: sel === s.id ? "var(--color-bg-primary-subtle)" : "transparent",
              display: "flex", gap: 11, alignItems: "center" } },
            React.createElement("span", { style: { width: 11, height: 11, borderRadius: "50%", flexShrink: 0, background: `var(--color-bg-${SD.STATUS[s.status].tone === "neutral" ? "neutral-sunken" : SD.STATUS[s.status].tone})` } }),
            React.createElement("span", { style: { flex: 1, minWidth: 0 } },
              React.createElement("span", { style: { display: "block", font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.name),
              React.createElement("span", { className: "wg-caption" }, `${s.area} · ${SD.TYPE[s.type].label}`)
            ),
            React.createElement(Icon, { n: "ChevronRight", s: 16, c: "var(--color-fg-neutral-muted)" })
          ))
        )
      ),
      // —— map ——
      React.createElement(Card, { padding: "0", style: { position: "relative", overflow: "hidden", background: "var(--color-bg-secondary-subtle)", cursor: addMode ? "crosshair" : "default" } },
        // toolbar
        React.createElement("div", { style: { position: "absolute", top: 16, left: 16, right: 16, zIndex: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
          React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)" } },
            React.createElement(Switch, { checked: cluster, onChange: (e) => setCluster(e.target.checked), label: "聚合顯示" })
          ),
          React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)" } },
            React.createElement(Icon, { n: "Layers", s: 15, c: "var(--color-fg-neutral-muted)" }),
            React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-subtle)" } }, "OpenStreetMap 圖資")
          ),
          caps.canCreate && React.createElement(Button, { variant: addMode ? "danger" : "primary", size: "sm", style: { marginLeft: "auto" }, startIcon: React.createElement(Icon, { n: addMode ? "X" : "MapPinPlus", s: 16 }), onClick: () => setAddMode((a) => !a) }, addMode ? "取消新增" : "在地圖上新增站點")
        ),
        addMode && React.createElement("div", { style: { position: "absolute", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 20, padding: "8px 16px", borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-default)", color: "#fff", font: "var(--font-label-400)", boxShadow: "var(--shadow-md)" } }, "點擊地圖任一處放置新站點"),

        // stylised terrain (馬太鞍溪流域)
        React.createElement("svg", { width: "100%", height: "100%", viewBox: "0 0 100 100", preserveAspectRatio: "xMidYMid slice", style: { position: "absolute", inset: 0 }, onClick: mapClick },
          React.createElement("rect", { width: "100", height: "100", fill: "var(--color-bg-secondary-subtle)" }),
          React.createElement("path", { d: "M0 58 Q22 50 42 57 T78 55 T100 60 V100 H0 Z", fill: "var(--prim-color-green-50)", opacity: "0.85" }),
          React.createElement("path", { d: "M0 78 Q30 70 56 76 T100 78 V100 H0 Z", fill: "var(--prim-color-green-100)", opacity: "0.7" }),
          // 馬太鞍溪
          React.createElement("path", { d: "M40 -2 L46 28 L34 56 L48 84 L42 102", stroke: "var(--prim-color-blue-200)", strokeWidth: "3.4", fill: "none", strokeLinecap: "round", opacity: "0.9" }),
          React.createElement("path", { d: "M70 -2 L64 30 L76 60 L66 102", stroke: "var(--prim-color-blue-100)", strokeWidth: "2.4", fill: "none", strokeLinecap: "round" }),
          // roads
          React.createElement("path", { d: "M-2 36 L102 30", stroke: "#fff", strokeWidth: "1.4", opacity: "0.8" }),
          React.createElement("path", { d: "M16 -2 L24 102", stroke: "#fff", strokeWidth: "1.1", opacity: "0.7" })
        ),

        // pins or clusters
        cluster
          ? clusters.map((c) => React.createElement("button", { key: c.area, onClick: () => setCluster(false), title: `${c.area} · ${c.count} 站`,
              style: { position: "absolute", left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%,-50%)", border: "none", background: "transparent", cursor: "pointer", lineHeight: 0, zIndex: 10 } },
              React.createElement("span", { style: { display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 } },
                React.createElement("span", { style: { width: 34 + c.count * 5, height: 34 + c.count * 5, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: "var(--color-bg-primary)", color: "var(--color-fg-on-primary)", font: "var(--font-data-400)", fontWeight: 800, border: "3px solid #fff", boxShadow: "var(--shadow-md)" } }, c.count),
                React.createElement("span", { style: { padding: "1px 8px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)", font: "var(--font-label-300)", color: "var(--color-fg-neutral-subtle)" } }, c.area)
              )
            ))
          : live.map((s) => {
              const tone = SD.STATUS[s.status].tone === "neutral" ? "neutral-sunken" : SD.STATUS[s.status].tone;
              const active = sel === s.id;
              return React.createElement("button", { key: s.id, onClick: (e) => { e.stopPropagation(); setSel(s.id); }, title: s.name,
                style: { position: "absolute", left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-100%)", border: "none", background: "transparent", cursor: "pointer", lineHeight: 0, zIndex: active ? 15 : 10 } },
                React.createElement("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: active ? 40 : 32, height: active ? 40 : 32, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)",
                  background: `var(--color-bg-${tone})`, boxShadow: "var(--shadow-md)", border: "2.5px solid #fff", transition: "all var(--transition-spring)" } },
                  React.createElement(Icon, { n: SD.TYPE[s.type].icon, s: 16, c: "#fff", style: { transform: "rotate(45deg)" } })
                )
              );
            }),

        // detail popover
        !cluster && selStation && React.createElement("div", { style: { position: "absolute", left: 16, bottom: 16, right: 16, maxWidth: 400 } },
          React.createElement(Card, { padding: "16px", elevation: "lg" },
            React.createElement("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 } },
              React.createElement("div", null,
                React.createElement("h4", { className: "wg-h600", style: { fontSize: 17 } }, selStation.name),
                React.createElement("div", { style: { marginTop: 5 } }, React.createElement(TypeChip, { type: selStation.type }))
              ),
              React.createElement(StatusBadge, { status: selStation.status, solid: true })
            ),
            React.createElement("div", { className: "wg-caption", style: { margin: "10px 0", display: "flex", alignItems: "center", gap: 5 } },
              React.createElement(Icon, { n: "MapPin", s: 14, c: "var(--color-fg-neutral-muted)" }), selStation.address),
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } },
              React.createElement(SourceTag, { source: selStation.source }),
              React.createElement(Button, { variant: "primary", size: "sm", endIcon: React.createElement(Icon, { n: "ArrowRight", s: 16 }), onClick: () => onOpenStation(selStation) }, "檢視詳情")
            )
          )
        )
      )
    );
  }

  window.StationMap = StationMap;
})();
