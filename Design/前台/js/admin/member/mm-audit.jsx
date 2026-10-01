// mm-audit.jsx — Audit Log（平台全域 / Team 範圍）
(function () {
  const { Button, Badge, Card, Chip } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useMM, EmptyState } = window;

  const CATS = [
    { id: "all",    label: "全部" },
    { id: "team",   label: "Team 異動", icon: "Building2" },
    { id: "member", label: "成員異動",  icon: "Users" },
    { id: "rbac",   label: "RBAC 變更", icon: "KeySquare" },
    { id: "qr",     label: "QR 邀請",   icon: "QrCode" },
  ];
  const CAT_ICON = { team: "Building2", member: "Users", rbac: "KeySquare", qr: "QrCode" };

  function AuditView({ scope }) {
    const mm = useMM();
    const [cat, setCat] = React.useState("all");
    const entries = mm.audit.filter((a) => (scope === "platform" ? true : a.scope === scope) && (cat === "all" || a.cat === cat));
    const teamName = (id) => { const t = mm.teams.find((x) => x.id === id); return t ? t.name : id; };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {CATS.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</Chip>
          ))}
          <span style={{ flex: 1 }}></span>
          <Button variant="outline" size="sm" startIcon={<Icon n="Download" s={15} />} onClick={() => mm.toast(`已匯出 ${entries.length} 筆紀錄（CSV）`)}>匯出 CSV</Button>
        </div>
        <Card padding="0">
          {entries.length === 0 && <EmptyState icon="ScrollText" title="此範圍內沒有紀錄" />}
          {entries.map((a, i) => (
            <div key={a.id} className="mm-row" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: mm.pad, borderBottom: i < entries.length - 1 ? "1px solid var(--color-border-default)" : "none" }}>
              <span style={{ width: 88, flexShrink: 0, font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", paddingTop: 6 }}>{a.time}</span>
              <span style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", flexShrink: 0, background: a.tone === "danger" ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon n={CAT_ICON[a.cat] || "FileText"} s={15} c={a.tone === "danger" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-subtle)"} />
              </span>
              <span style={{ flex: 1, minWidth: 0, font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)", paddingTop: 5 }}>
                <b>{a.actor}</b>　{a.action}
              </span>
              <span style={{ flexShrink: 0, paddingTop: 4 }}>
                <Badge tone={a.scope === "platform" ? "neutral" : "info"}>{a.scope === "platform" ? "平台" : teamName(a.scope)}</Badge>
              </span>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  Object.assign(window, { AuditView });
})();
