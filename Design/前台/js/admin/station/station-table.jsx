// StationTable.jsx — Table + BI 表格視圖 (pure table; filter bar + stats live in orchestrator)
(function () {
  const { Badge } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const { StatusBadge, TypeChip, LoadBar, SourceTag, Menu } = window.StationShared;
  const Icon = window.WGIcon;

  function QuickStatus({ station, canQuick, onQuickStatus }) {
    if (!canQuick) return React.createElement(StatusBadge, { status: station.status });
    const items = SD.STATUS_ORDER.map((s) => ({ value: s, label: SD.STATUS[s].label, dot: SD.STATUS[s].tone === "neutral" ? "neutral-sunken" : SD.STATUS[s].tone }));
    return React.createElement(Menu, {
      value: station.status, items, align: "left", width: 150,
      onSelect: (v) => onQuickStatus(station.id, v),
      trigger: (open) => React.createElement("button", {
        type: "button", title: "快速變更營運狀態（不排審）",
        style: { display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", padding: 0 },
      },
        React.createElement(StatusBadge, { status: station.status }),
        React.createElement(Icon, { n: "ChevronsUpDown", s: 13, c: "var(--color-fg-neutral-muted)" })
      ),
    });
  }

  function StationTable({ stations, caps, pendingByStation, onOpenStation, onQuickStatus, onOpenReviewFor, density }) {
    const pad = density === "compact" ? "10px 18px" : "16px 18px";
    if (!stations.length) {
      return React.createElement("div", { style: { padding: "72px 0", textAlign: "center", color: "var(--color-fg-neutral-muted)" } },
        React.createElement(Icon, { n: "SearchX", s: 38, c: "var(--color-fg-neutral-muted)" }),
        React.createElement("div", { className: "wg-h600", style: { marginTop: 12, color: "var(--color-fg-neutral-subtle)" } }, "沒有符合條件的站點"),
        React.createElement("div", { className: "wg-caption", style: { marginTop: 4 } }, "試著調整地區、類型或營運狀態篩選。")
      );
    }
    const th = { padding: "13px 18px", fontWeight: 400, font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", textAlign: "left", whiteSpace: "nowrap" };
    const td = { padding: pad, verticalAlign: "middle", transition: "padding var(--transition-base)" };

    return React.createElement("div", { style: { overflowX: "auto" } },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 880 } },
        React.createElement("thead", null,
          React.createElement("tr", null,
            ["站點", "類型", "行政區", "營運狀態", "容量 / 使用", "前台建議", "最後更新", ""].map((h, i) =>
              React.createElement("th", { key: i, style: { ...th, textAlign: i === 7 ? "right" : "left" } }, h))
          )
        ),
        React.createElement("tbody", null,
          stations.map((s) => {
            const pending = pendingByStation[s.id] || 0;
            return React.createElement("tr", {
              key: s.id,
              onClick: () => onOpenStation(s),
              style: {
                borderTop: "1px solid var(--color-bg-neutral-sunken)", cursor: "pointer",
                opacity: s.deleted ? 0.62 : 1, transition: "background var(--transition-fast)",
              },
              onMouseEnter: (e) => { e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; },
              onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; },
            },
              // 站點 name + id + source + retired flag
              React.createElement("td", { style: td },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                  React.createElement("span", { style: { width: 36, height: 36, flexShrink: 0, borderRadius: "var(--radius-md)", display: "inline-flex", alignItems: "center", justifyContent: "center", background: `var(--color-bg-${SD.TYPE[s.type].tone === "neutral" ? "neutral-sunken" : SD.TYPE[s.type].tone + "-subtle"})`, color: `var(--color-bg-${SD.TYPE[s.type].tone === "neutral" ? "info" : SD.TYPE[s.type].tone})` } },
                    React.createElement(Icon, { n: SD.TYPE[s.type].icon, s: 18, c: "currentColor" })
                  ),
                  React.createElement("div", { style: { minWidth: 0 } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                      React.createElement("span", { style: { font: "var(--font-body-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)" } }, s.name),
                      s.deleted && React.createElement(Badge, { tone: "neutral" }, "已下架")
                    ),
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 3 } },
                      React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, s.id),
                      React.createElement(SourceTag, { source: s.source })
                    )
                  )
                )
              ),
              React.createElement("td", { style: td }, React.createElement(TypeChip, { type: s.type })),
              React.createElement("td", { style: td }, React.createElement("span", { className: "wg-caption", style: { display: "inline-flex", alignItems: "center", gap: 4 } }, React.createElement(Icon, { n: "MapPin", s: 14, c: "var(--color-fg-neutral-muted)" }), s.area)),
              React.createElement("td", { style: td, onClick: (e) => e.stopPropagation() }, React.createElement(QuickStatus, { station: s, canQuick: caps.canQuickStatus, onQuickStatus })),
              React.createElement("td", { style: td }, React.createElement(LoadBar, { load: s.load, capacity: s.capacity })),
              React.createElement("td", { style: td, onClick: (e) => e.stopPropagation() },
                pending > 0
                  ? React.createElement("button", {
                      type: "button", onClick: () => onOpenReviewFor(s.id),
                      style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: "var(--radius-full)", border: "1px solid var(--color-border-accent)", background: "var(--color-bg-warning-subtle)", color: "var(--color-fg-warning)", cursor: "pointer", font: "var(--font-label-300)", fontWeight: 700 } },
                      React.createElement(Icon, { n: "GitPullRequestArrow", s: 14, c: "currentColor" }), `${pending} 筆待審`
                    )
                  : React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, "—")
              ),
              React.createElement("td", { style: td }, React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-subtle)" } }, s.updated)),
              React.createElement("td", { style: { ...td, textAlign: "right" } }, React.createElement(Icon, { n: "ChevronRight", s: 18, c: "var(--color-fg-neutral-muted)" }))
            );
          })
        )
      )
    );
  }

  window.StationTable = StationTable;
})();
