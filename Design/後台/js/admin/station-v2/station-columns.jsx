// station-columns.jsx — 對話框外殼
// 2026-08-16：列表欄位自訂功能整組移除（工具列「欄位」按鈕、欄位設定對話框、
// 順序調整與顯示／隱藏）。欄位一律依 station-data.jsx 的 STATION_COLUMNS 定義呈現。
// 本檔僅保留其他模組共用的 StationModal 對話框外殼。
(function () {
  const { Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // ── 對話框外殼 ──────────────────────────────────────────────────────────
  function StationModal({ title, icon, width = 560, onClose, footer, children }) {
    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
      <div style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ width: `min(${width}px, 96vw)`, maxHeight: "88vh", background: "var(--color-bg-neutral-default)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 10 }}>
            {icon}
            <h2 className="wg-h600" style={{ flex: 1, fontSize: 18, margin: 0 }}>{title}</h2>
            <button type="button" onClick={onClose} aria-label="關閉" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-fg-neutral-muted)", lineHeight: 0 }}>
              <Icon n="X" s={20} c="currentColor" />
            </button>
          </div>
          <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
          {footer && <div style={{ padding: "14px 22px", borderTop: "1px solid var(--color-border-default)", display: "flex", justifyContent: "flex-end", gap: 10 }}>{footer}</div>}
        </div>
      </div>
    );
  }

  Object.assign(window, { StationModal });
})();
