// tk-stats.jsx — BI 統計列（任務量 / 狀態 / 志工缺口紅色警示）
(function () {
  const { Card, Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK } = window;

  function StatCard({ icon, label, value, sub, tone, children }) {
    return (
      <Card padding="18px" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: "var(--radius-full)", background: tone === "danger" ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon n={icon} s={16} c={tone === "danger" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)"} />
          </span>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>{label}</span>
        </div>
        {value != null && <div style={{ font: "var(--font-display-700, var(--font-heading-700))", fontSize: 30, fontWeight: 800, lineHeight: 1, color: tone === "danger" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-default)" }}>{value}</div>}
        {sub && <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{sub}</div>}
        {children}
      </Card>
    );
  }

  function StatStrip() {
    const tk = useTK();
    const tickets = tk.tickets;
    const total = tickets.length;
    const byStatus = { pending: 0, in_progress: 0, completed: 0 };
    tickets.forEach((t) => { byStatus[t.status]++; });
    const lifeOverdue = tickets.filter((t) => t.priority === "life_threatening" && t.slaLeftMin < 0).length;

    const v = window.TK_VOLUNTEER;
    const fillRate = Math.round((v.matchedToday / v.demand) * 100);
    const gap = 100 - fillRate;
    const gapWarn = gap > 50;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(228px, 1fr))", gap: 16 }}>
        <StatCard icon="ClipboardList" label="任務總量" value={total}
          sub={`待承接 ${byStatus.pending}　進行中 ${byStatus.in_progress}　已完成 ${byStatus.completed}`} />

        <StatCard icon="Siren" label="生命危急 · 逾時未承接" value={lifeOverdue} tone={lifeOverdue > 0 ? "danger" : undefined}
          sub={lifeOverdue > 0 ? "已自動升級通知 Government / Super Admin" : "目前皆在 SLA 內"} />

        <StatCard icon="Users" label="志工媒合（今日 / 需求）" tone={gapWarn ? "danger" : undefined}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: gapWarn ? "var(--color-fg-danger)" : "var(--color-fg-neutral-default)" }}>{v.matchedToday.toLocaleString()}</span>
            <span style={{ font: "var(--font-data-400)", color: "var(--color-fg-neutral-muted)" }}>/ {v.demand.toLocaleString()}</span>
          </div>
          <div style={{ height: 8, borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", overflow: "hidden" }}>
            <div style={{ width: `${Math.max(fillRate, 3)}%`, height: "100%", borderRadius: "var(--radius-full)", background: gapWarn ? "var(--color-bg-danger)" : "var(--color-bg-success)" }}></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {gapWarn && <Badge tone="danger" variant="solid">缺口 {gap}%</Badge>}
            <span className="wg-caption" style={{ color: gapWarn ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)" }}>{gapWarn ? "超過 50% 門檻" : `填補率 ${fillRate}%`}</span>
          </div>
        </StatCard>

        <StatCard icon="Building2" label="建築錨點 · 直立救援" value={Object.keys(tk.anchors).length}>
          <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>含直立救援啟動 {Object.values(tk.anchors).filter((a) => a.vertical_rescue_enabled).length} 處</div>
        </StatCard>
      </div>
    );
  }

  // 志工缺口分區明細（給統計分頁）
  function VolunteerGapTable() {
    const v = window.TK_VOLUNTEER;
    return (
      <Card padding="0">
        <div style={{ padding: "16px 16px 6px" }}><h3 className="wg-h600" style={{ margin: 0, fontSize: 17 }}>志工缺口 · 分區</h3></div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1.4fr", gap: 12, padding: "8px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
          {["地區", "現有人力", "需求", "填補率"].map((h, i) => <span key={i} className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{h}</span>)}
        </div>
        {v.byRegion.map((r) => {
          const rate = Math.round((r.supply / r.demand) * 100);
          const warn = rate < 50;
          return (
            <div key={r.region} className="tk-row" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1.4fr", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
              <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{r.region}</span>
              <span style={{ font: "var(--font-data-400)", color: "var(--color-fg-neutral-subtle)" }}>{r.supply}</span>
              <span style={{ font: "var(--font-data-400)", color: "var(--color-fg-neutral-subtle)" }}>{r.demand.toLocaleString()}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, height: 8, borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${Math.max(rate, 3)}%`, height: "100%", background: warn ? "var(--color-bg-danger)" : "var(--color-bg-success)" }}></span>
                </span>
                <span style={{ font: "var(--font-data-300)", fontWeight: 700, width: 36, color: warn ? "var(--color-fg-danger)" : "var(--color-fg-neutral-subtle)" }}>{rate}%</span>
              </span>
            </div>
          );
        })}
      </Card>
    );
  }

  Object.assign(window, { StatStrip, VolunteerGapTable });
})();
