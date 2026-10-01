// tk-grouping.jsx — 群組建議佇列（F4）+ 重複比對（F7）+ 變更紀錄（F5.3）+ Building Anchor 抽屜
(function () {
  const { Button, Badge, Card, Chip, Alert, Checkbox } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK, PriorityBadge, DisasterTag, EmptyState, TKDrawer, ConfirmDialog } = window;

  // ── 群組建議佇列（Auditor 並排對比，可調半徑）──────────────────────────────
  function GroupingView() {
    const tk = useTK();
    const [radius, setRadius] = React.useState(20);
    const [sel, setSel] = React.useState({});
    const [confirm, setConfirm] = React.useState(null);

    if (tk.groupSuggestions.length === 0) {
      return <Card padding="0"><EmptyState icon="Building2" title="目前沒有群組建議" caption="AI 偵測同地址、半徑內的多筆 Ticket 時會出現在此，供確認合併為建築錨點。" /></Card>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Alert tone="info" title="群組化 ≠ 重複合併">群組化是「不同事件但同建築」→ 合併顯示但各自保留資料；重複合併請見「重複比對」分頁。</Alert>
        {tk.groupSuggestions.map((g) => {
          const chosen = sel[g.id] || g.candidates.map((c) => c.id);
          const toggle = (id) => setSel((s) => { const cur = s[g.id] || g.candidates.map((c) => c.id); return { ...s, [g.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }; });
          return (
            <Card key={g.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", background: "var(--color-bg-primary-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon n="Building2" s={20} c="var(--color-brand-primary-subtle)" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="wg-h600" style={{ fontSize: 17 }}>{g.address}</span>
                    <Badge tone="info">{Math.round(g.confidence * 100)}% 信心</Badge>
                  </div>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>AI 偵測 {g.candidates.length} 筆任務，最大間距約 {g.distanceM}m，地址主部相同</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>候選半徑</span>
                  {[20, 50, 100].map((r) => <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>{r}m</Chip>)}
                </div>
              </div>

              {/* 並排對比 */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${g.candidates.length}, 1fr)`, gap: 12 }}>
                {g.candidates.map((c) => {
                  const on = chosen.includes(c.id);
                  return (
                    <div key={c.id} style={{ borderRadius: "var(--radius-md)", border: on ? "1.5px solid var(--color-bg-primary)" : "1px solid var(--color-border-default)", background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-subtle)", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Checkbox checked={on} onChange={() => toggle(c.id)} />
                        <Badge tone="neutral">{c.floor}</Badge>
                        <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", marginLeft: "auto" }}>#{c.id}</span>
                      </div>
                      <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{c.title}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><PriorityBadge p={c.priority} /><span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>受困 {c.victims}</span></div>
                      <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>更新 {c.updated}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="wg-caption" style={{ flex: 1, color: "var(--color-fg-neutral-muted)" }}>已選 {chosen.length} / {g.candidates.length} 筆{chosen.length < g.candidates.length ? "（部分建立）" : ""}</span>
                <Button variant="ghost" style={{ color: "var(--color-fg-danger)" }} onClick={() => setConfirm({ g })}>拒絕建議</Button>
                <Button variant="primary" startIcon={<Icon n="Building2" s={16} />} disabled={chosen.length < 2} onClick={() => tk.createGroup(g, chosen)}>建立群組（{chosen.length}）</Button>
              </div>
            </Card>
          );
        })}
        {confirm && <ConfirmDialog title="拒絕群組建議" body="標記此建議已審且不成立，將不再提示。" confirmLabel="確認拒絕" danger onClose={() => setConfirm(null)} onConfirm={() => tk.rejectGroup(confirm.g)} />}
      </div>
    );
  }

  // ── 重複比對（F7）─────────────────────────────────────────────────────────
  function DuplicateView() {
    const tk = useTK();
    if (tk.duplicates.length === 0) return <Card padding="0"><EmptyState icon="Copy" title="沒有疑似重複任務" /></Card>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Alert tone="warning" title="AI 標記疑似重複">兩筆描述同一件事 → 合併保留其一；若實為不同事件請保留兩者。</Alert>
        {tk.duplicates.map((d) => (
          <Card key={d.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon n="Copy" s={18} c="var(--color-fg-warning)" />
              <span className="wg-h600" style={{ fontSize: 17 }}>疑似重複</span>
              <Badge tone="warning">{Math.round(d.confidence * 100)}% 相似</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 1fr", gap: 12, alignItems: "center" }}>
              {[d.a, d.b].map((side, i) => (
                <React.Fragment key={side.id}>
                  {i === 1 && <div style={{ display: "flex", justifyContent: "center" }}><span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon n="GitCompare" s={16} c="var(--color-fg-neutral-muted)" /></span></div>}
                  <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>#{side.id}</span>
                    <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{side.title}</span>
                    <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>{side.desc}</span>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>Team {side.team}</span>
                      <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{side.source}</span>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="ghost" onClick={() => tk.resolveDup(d, "keep")}>保留兩者</Button>
              <Button variant="outline" onClick={() => tk.resolveDup(d, "merge")} startIcon={<Icon n="Merge" s={16} />}>合併為一筆</Button>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // ── 變更紀錄（F5.3）─────────────────────────────────────────────────────────
  const HCAT = { group: "Building2", immediate: "Siren", vertical: "Building2", assign: "Map", activation: "Radio", edit: "PenLine" };
  function HistoryView() {
    const tk = useTK();
    return (
      <Card padding="0">
        {tk.history.map((h, i) => (
          <div key={i} className="tk-row" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", borderBottom: i < tk.history.length - 1 ? "1px solid var(--color-border-default)" : "none" }}>
            <span style={{ width: 96, flexShrink: 0, font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", paddingTop: 5 }}>{h.time}</span>
            <span style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", flexShrink: 0, background: h.tone === "danger" ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon n={HCAT[h.cat] || "FileText"} s={15} c={h.tone === "danger" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-subtle)"} /></span>
            <span style={{ flex: 1, font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)", paddingTop: 5 }}><b>{h.actor}</b>　{h.action}</span>
          </div>
        ))}
      </Card>
    );
  }

  // ── Building Anchor 抽屜（樓層樹 + 啟動/解除直立救援）───────────────────────
  const FLOOR_RANK = (f) => { if (!f) return 0; if (f === "8F以上") return 8; const m = parseInt(f); return isNaN(m) ? 0 : m; };
  function AnchorDrawer({ anchor, onClose, onOpenTicket }) {
    const tk = useTK();
    const [release, setRelease] = React.useState(false);
    const tickets = tk.tickets.filter((t) => t.anchor === anchor.id).sort((a, b) => FLOOR_RANK(b.floor) - FLOOR_RANK(a.floor));
    const vr = anchor.vertical_rescue_enabled;
    return (
      <TKDrawer title={anchor.name} sub={anchor.address} width={560} onClose={onClose}
        headerExtra={vr ? <Badge tone="danger" variant="solid">直立救援</Badge> : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Badge tone="neutral">{anchor.floorCount} 層</Badge>
            <Badge tone="neutral">{tickets.length} 筆任務</Badge>
            {anchor.assignedTeam && <Badge tone="info">指派 {anchor.assignedTeam}</Badge>}
          </div>

          {vr ? (
            <Alert tone="danger" title="直立救援已啟動" icon={<Icon n="TriangleAlert" s={20} c="var(--color-fg-danger)" />}>
              由 {anchor.vr_activatedBy} 於 {anchor.vr_activatedAt} 啟動，同建築新建 Ticket 自動必填核心欄位。
              {tk.can.releaseVR && <span style={{ display: "inline-flex", marginLeft: 8 }}><Button size="sm" variant="outline" onClick={() => setRelease(true)}>解除（限 Super Admin）</Button></span>}
            </Alert>
          ) : (
            tk.can.activateVR && <Button variant="primary" startIcon={<Icon n="TriangleAlert" s={16} />} onClick={() => tk.activateVR(anchor)}>啟動直立救援（連動同建築）</Button>
          )}

          <div>
            <h3 className="wg-h600" style={{ fontSize: 16, margin: "0 0 8px" }}>樓層樹</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tickets.map((t) => (
                <button key={t.id} onClick={() => onOpenTicket(t)} className="tk-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 44, height: 32, borderRadius: "var(--radius-sm)", flexShrink: 0, background: "var(--color-bg-neutral-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{t.floor}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                    <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>受困 {t.victims} · 更新 {t.updated}{t.vrPending ? " · 欄位待補齊" : ""}</span>
                  </span>
                  <PriorityBadge p={t.priority} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {release && <ConfirmDialog title="解除建築直立救援" body={`解除「${anchor.name}」的直立救援，欄位資料保留但不再必填。此操作限 Super Admin。`} confirmLabel="確認解除" danger requireReason onClose={() => setRelease(false)} onConfirm={(why) => tk.releaseVR(anchor, why)} />}
      </TKDrawer>
    );
  }

  Object.assign(window, { GroupingView, DuplicateView, HistoryView, AnchorDrawer });
})();
