// ExportDialog.jsx — 離線匯出: CSV / GeoJSON + 匯出時間戳 + 責任區範圍 (R6)
(function () {
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  function ExportDialog({ caps, count, onClose, onExport }) {
    const [fmt, setFmt] = React.useState("csv");
    const [scope, setScope] = React.useState(caps.isNGO ? "own" : "all");
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const fmts = [
      { value: "csv", label: "CSV", icon: "Sheet", desc: "離線可檢視・通用表格" },
      { value: "geojson", label: "GeoJSON", icon: "Map", desc: "地圖圖層・座標標準格式" },
    ];
    const scopes = [
      { value: "all", label: "全部資源站", desc: "資源站為公共資訊，全角色可見", disabled: caps.isNGO },
      { value: "own", label: "僅自家責任區", desc: "依 04-rbac，NGO 匯出限指派區域" },
    ];

    return React.createElement("div", { style: { position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }, onMouseDown: (e) => { if (e.target === e.currentTarget) onClose(); } },
      React.createElement("div", { style: { width: "min(460px, 96vw)", background: "var(--color-bg-neutral-default)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", overflow: "hidden" } },
        React.createElement("div", { style: { padding: "20px 24px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 12 } },
          React.createElement("span", { style: { width: 38, height: 38, borderRadius: "var(--radius-md)", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-info-subtle)", color: "var(--color-bg-info)" } },
            React.createElement(Icon, { n: "Download", s: 20, c: "currentColor" })),
          React.createElement("h2", { className: "wg-h600", style: { flex: 1, fontSize: 19 } }, "匯出離線清單"),
          React.createElement("button", { type: "button", onClick: onClose, "aria-label": "關閉", style: { border: "none", background: "transparent", cursor: "pointer", color: "var(--color-fg-neutral-muted)", lineHeight: 0 } }, React.createElement(Icon, { n: "X", s: 20, c: "currentColor" }))
        ),
        React.createElement("div", { style: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } },
          React.createElement("div", null,
            React.createElement("div", { className: "wg-label-sm", style: { fontWeight: 700, marginBottom: 10 } }, "檔案格式"),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
              fmts.map((f) => React.createElement(OptCard, { key: f.value, active: fmt === f.value, onClick: () => setFmt(f.value), icon: f.icon, label: f.label, desc: f.desc })))
          ),
          React.createElement("div", null,
            React.createElement("div", { className: "wg-label-sm", style: { fontWeight: 700, marginBottom: 10 } }, "匯出範圍"),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
              scopes.map((s) => React.createElement(ScopeRow, { key: s.value, active: scope === s.value, disabled: s.disabled, onClick: () => !s.disabled && setScope(s.value), label: s.label, desc: s.desc })))
          ),
          React.createElement("div", { style: { display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-warning-subtle)", alignItems: "flex-start" } },
            React.createElement(Icon, { n: "Clock", s: 17, c: "var(--color-fg-warning)", style: { marginTop: 1, flexShrink: 0 } }),
            React.createElement("div", null,
              React.createElement("div", { className: "wg-label-sm", style: { fontWeight: 700, color: "var(--color-fg-warning)" } }, `資料截至 ${ts}`),
              React.createElement("div", { className: "wg-caption", style: { marginTop: 2 } }, "檔名與內容皆標註此時間戳，避免現場使用過期清單。")
            )
          )
        ),
        React.createElement("div", { style: { padding: "16px 24px", borderTop: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 12 } },
          React.createElement("span", { className: "wg-caption", style: { flex: 1, display: "inline-flex", alignItems: "center", gap: 6 } }, React.createElement(Badge, { tone: "neutral" }, `${scope === "own" ? "責任區" : count} 站`), "將被匯出"),
          React.createElement(Button, { variant: "ghost", size: "md", onClick: onClose }, "取消"),
          React.createElement(Button, { variant: "primary", size: "md", startIcon: React.createElement(Icon, { n: "Download", s: 17 }), onClick: () => onExport({ fmt, scope, ts }) }, "匯出")
        )
      )
    );
  }

  function OptCard({ active, onClick, icon, label, desc }) {
    const Icon = window.WGIcon;
    return React.createElement("button", { type: "button", onClick,
      style: { textAlign: "left", padding: "13px 14px", borderRadius: "var(--radius-md)", cursor: "pointer",
        background: active ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)",
        border: `1.5px solid ${active ? "var(--color-bg-primary)" : "var(--color-border-default)"}` } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement(Icon, { n: icon, s: 18, c: active ? "var(--color-bg-primary)" : "var(--color-fg-neutral-muted)" }),
        React.createElement("span", { className: "wg-label-sm", style: { fontWeight: 700 } }, label)
      ),
      React.createElement("div", { className: "wg-caption", style: { marginTop: 5 } }, desc)
    );
  }
  function ScopeRow({ active, disabled, onClick, label, desc }) {
    const Icon = window.WGIcon;
    return React.createElement("button", { type: "button", onClick, disabled,
      style: { textAlign: "left", width: "100%", padding: "11px 14px", borderRadius: "var(--radius-md)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        background: active ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-subtle)",
        border: `1.5px solid ${active ? "var(--color-border-accent)" : "transparent"}`, display: "flex", alignItems: "center", gap: 11 } },
      React.createElement("span", { style: { width: 18, height: 18, borderRadius: "50%", flexShrink: 0, border: `2px solid ${active ? "var(--color-bg-primary)" : "var(--color-border-default)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center" } },
        active && React.createElement("span", { style: { width: 9, height: 9, borderRadius: "50%", background: "var(--color-bg-primary)" } })),
      React.createElement("span", { style: { flex: 1 } },
        React.createElement("span", { style: { display: "block", font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)" } }, label),
        React.createElement("span", { className: "wg-caption" }, desc)
      )
    );
  }

  window.ExportDialog = ExportDialog;
})();
