// stationShared.jsx — shared UI atoms + role capability helper
(function () {
  const DS = window.WanGuardDesignSystem_9c8f68;
  const { Badge } = DS;
  const SD = window.StationData;

  // —— 角色權限矩陣 (對齊 04-rbac) ——
  // Data Auditor: 審查 + 編輯 + 新增；不可硬刪
  // Super Admin:  全部 + 下架/重新啟用 + rollback
  // NGO:          資源站全可見（公共資訊）；僅匯出自家責任區，無編輯/審查/刪除
  function caps(role) {
    return {
      role,
      isAuditor: role === "auditor",
      isAdmin: role === "admin",
      isNGO: role === "ngo",
      canReview: role === "auditor" || role === "admin",
      canEdit: role === "auditor" || role === "admin",
      canCreate: role === "auditor" || role === "admin",
      canQuickStatus: role === "auditor" || role === "admin",
      canRetire: role === "admin",        // 下架=軟刪除，限 Super Admin
      canRollback: role === "admin",      // rollback 限 Super Admin
      canExport: true,                     // 全角色可匯出 (NGO 限自家區)
    };
  }
  const ROLE_LABEL = { auditor: "Data Auditor", admin: "Super Admin", ngo: "NGO 成員" };

  function StatusBadge({ status, solid }) {
    const m = SD.STATUS[status];
    return React.createElement(Badge, { tone: m.tone, variant: solid ? "solid" : "subtle" }, m.label);
  }

  function TypeChip({ type }) {
    const m = SD.TYPE[type];
    const Icon = window.WGIcon;
    return React.createElement("span", {
      style: { display: "inline-flex", alignItems: "center", gap: 6, font: "var(--font-label-400)", color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" },
    },
      React.createElement(Icon, { n: m.icon, s: 16, c: "var(--color-fg-neutral-muted)" }),
      m.label
    );
  }

  function LoadBar({ load, capacity }) {
    if (load == null || capacity == null) {
      return React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, "—");
    }
    const pct = Math.min(100, Math.round((load / capacity) * 100));
    const tone = pct >= 100 ? "info" : pct >= 80 ? "warning" : "success";
    return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 120 } },
      React.createElement("div", { style: { flex: 1, height: 7, borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", overflow: "hidden" } },
        React.createElement("div", { style: { width: pct + "%", height: "100%", borderRadius: "var(--radius-full)", background: `var(--color-bg-${tone})` } })
      ),
      React.createElement("span", { className: "wg-data-xs", style: { whiteSpace: "nowrap", color: "var(--color-fg-neutral-subtle)" } }, `${load}/${capacity}`)
    );
  }

  function SourceTag({ source }) {
    const Icon = window.WGIcon;
    const official = source === "official";
    return React.createElement("span", {
      style: {
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: "var(--radius-full)",
        font: "var(--font-label-300)",
        color: official ? "var(--color-fg-info)" : "var(--color-brand-primary-subtle)",
        background: official ? "var(--color-bg-info-subtle)" : "var(--color-bg-primary-subtle)",
      },
    },
      React.createElement(Icon, { n: official ? "ShieldCheck" : "Users", s: 13, c: "currentColor" }),
      official ? "官方" : "群眾投稿"
    );
  }

  // —— Generic dropdown menu (outside-click close) ——
  function Menu({ trigger, items, value, onSelect, align = "left", width = 200 }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (!open) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, [open]);
    const Icon = window.WGIcon;
    return React.createElement("div", { ref, style: { position: "relative", display: "inline-flex" } },
      React.createElement("div", { onClick: () => setOpen((o) => !o) }, trigger(open)),
      open && React.createElement("div", {
        style: {
          position: "absolute", top: "calc(100% + 8px)", [align]: 0, zIndex: 300, minWidth: width,
          background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 6, overflow: "hidden",
        },
      },
        items.map((it) => React.createElement("button", {
          key: it.value, type: "button",
          onClick: () => { setOpen(false); onSelect(it.value); },
          style: {
            width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
            padding: "9px 11px", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer",
            background: it.value === value ? "var(--color-bg-primary-subtle)" : "transparent",
            font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap",
          },
          onMouseEnter: (e) => { if (it.value !== value) e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; },
          onMouseLeave: (e) => { if (it.value !== value) e.currentTarget.style.background = "transparent"; },
        },
          it.dot && React.createElement("span", { style: { width: 9, height: 9, borderRadius: "50%", background: `var(--color-bg-${it.dot})`, flexShrink: 0 } }),
          it.icon && React.createElement(Icon, { n: it.icon, s: 16, c: "var(--color-fg-neutral-muted)" }),
          React.createElement("span", { style: { flex: 1 } }, it.label),
          it.value === value && React.createElement(Icon, { n: "Check", s: 15, c: "var(--color-bg-primary)" })
        ))
      )
    );
  }

  // Labeled filter dropdown button (pill)
  function FilterSelect({ label, value, items, onSelect, icon }) {
    const Icon = window.WGIcon;
    const cur = items.find((i) => i.value === value);
    const isAll = value === "all";
    return React.createElement(Menu, {
      value, items, onSelect, width: 188,
      trigger: (open) => React.createElement("button", {
        type: "button",
        style: {
          display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px",
          borderRadius: "var(--radius-full)", cursor: "pointer", font: "var(--font-label-400)",
          background: isAll ? "var(--color-bg-neutral-default)" : "var(--color-bg-primary-subtle)",
          color: isAll ? "var(--color-fg-neutral-subtle)" : "var(--color-brand-primary-subtle)",
          border: `1px solid ${isAll ? "var(--color-border-default)" : "var(--color-border-accent)"}`,
          boxShadow: open ? "0 0 0 3px var(--color-bg-secondary-subtle)" : "none", transition: "box-shadow var(--transition-fast)", whiteSpace: "nowrap",
        },
      },
        icon && React.createElement(Icon, { n: icon, s: 16, c: "currentColor" }),
        React.createElement("span", { style: { color: "var(--color-fg-neutral-muted)", fontWeight: 400 } }, label),
        React.createElement("span", { style: { fontWeight: 700 } }, cur ? cur.label : ""),
        React.createElement(Icon, { n: open ? "ChevronUp" : "ChevronDown", s: 15, c: "var(--color-fg-neutral-muted)" })
      ),
    });
  }

  window.StationShared = { caps, ROLE_LABEL, StatusBadge, TypeChip, LoadBar, SourceTag, Menu, FilterSelect };
})();
