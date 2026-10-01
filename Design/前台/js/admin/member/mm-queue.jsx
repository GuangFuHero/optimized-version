// mm-queue.jsx — 審核佇列（平台角色申請 / 加入 Team 申請 / QR 掃碼待確認）
(function () {
  const { Button, Badge, Card, Avatar } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useMM, EmptyState, ReasonDialog } = window;

  const KIND = {
    "platform-role": { label: "平台角色申請", tone: "secondary", icon: "KeySquare" },
    "join-team":     { label: "加入團隊申請", tone: "info",     icon: "Users" },
    "qr-pending":    { label: "QR 掃碼待確認", tone: "warning",   icon: "QrCode" },
  };

  function QueueView({ scope }) {
    const mm = useMM();
    const [rejecting, setRejecting] = React.useState(null);
    const items = mm.queue.filter((q) => q.audience === scope);

    if (items.length === 0) {
      return (
        <Card padding="0">
          <EmptyState icon="Inbox" title="目前沒有待審核項目" caption="有新的角色申請或掃碼加入時，會出現在這裡並於分頁顯示徽章。" />
        </Card>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((q) => {
          const k = KIND[q.kind];
          return (
            <Card key={q.id} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <Avatar name={q.applicant} size={42} tone="neutral" />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>{q.applicant}</span>
                  <Badge tone={k.tone}>{k.label}</Badge>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{q.time}</span>
                </div>
                <div style={{ font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" }}>
                  {q.kind === "platform-role"
                    ? <span>申請平台角色：<b>{q.current}</b> → <b>{q.request}</b></span>
                    : <span>{q.request}{q.kind === "join-team" && <span>（核准後以 Member 加入）</span>}</span>}
                </div>
                {q.note && (
                  <div style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" }}>
                    「{q.note}」
                  </div>
                )}
                {q.kind === "join-team" && (
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon n="Eye" s={13} c="var(--color-fg-neutral-muted)" />核准後以成員身份加入，可看到本隊名單與任務；平台角色由該隊型別推導（8/14 裁示）。
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Button size="sm" variant="ghost" style={{ color: "var(--color-fg-danger)" }} startIcon={<Icon n="X" s={15} />} onClick={() => setRejecting(q)}>拒絕</Button>
                <Button size="sm" variant="primary" startIcon={<Icon n="Check" s={15} />} onClick={() => mm.approveQueue(q)}>核准</Button>
              </div>
            </Card>
          );
        })}
        {rejecting && (
          <ReasonDialog
            title={`拒絕 ${rejecting.applicant} 的申請`}
            body="拒絕將通知申請人，並附上您的理由。"
            confirmLabel="確認拒絕" danger
            onClose={() => setRejecting(null)}
            onConfirm={(why) => mm.rejectQueue(rejecting, why)}
          />
        )}
      </div>
    );
  }

  // ── 頂欄全域審核 inbox（橫跨三類申請、不同 reviewer，不綁任一模組分頁）──────
  // audiences: 當前角色可審核的對象清單（"super" 或 teamId 陣列）
  function InboxPanel({ audiences = [], onClose, onGoTeam }) {
    const mm = useMM();
    const [rejecting, setRejecting] = React.useState(null);
    const items = mm.queue.filter((q) => audiences.includes(q.audience));
    const teamName = (id) => { const t = mm.teams.find((x) => x.id === id); return t ? t.name : id; };

    return (
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
        {/* 標題 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px 12px", borderBottom: "1px solid var(--color-border-default)" }}>
          <span style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", background: "var(--color-bg-primary-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon n="Inbox" s={18} c="var(--color-brand-primary-subtle)" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>審核佇列</span>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>全域 inbox · 平台角色／加入團隊／QR 待確認</span>
          </span>
          {items.length > 0 && (
            <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: "var(--radius-full)", background: "var(--color-bg-warning)", color: "var(--color-fg-on-warning)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{items.length}</span>
          )}
        </div>

        {/* 清單 */}
        <div style={{ overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "36px 20px", color: "var(--color-fg-neutral-muted)", textAlign: "center" }}>
              <Icon n="CircleCheck" s={28} c="var(--color-fg-success)" />
              <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-subtle)" }}>目前沒有待審核項目</span>
              <span className="wg-caption">新的申請或掃碼加入會即時出現在這裡。</span>
            </div>
          )}
          {items.map((q) => {
            const k = KIND[q.kind];
            const teamScoped = q.audience !== "super";
            return (
              <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <Avatar name={q.applicant} size={34} tone="neutral" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{q.applicant}</span>
                      <Badge tone={k.tone}>{k.label}</Badge>
                    </div>
                    <div style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)", marginTop: 2 }}>
                      {q.kind === "platform-role"
                        ? <span><b>{q.current}</b> → <b>{q.request}</b></span>
                        : <span>{q.request}{q.kind === "join-team" && "（核准後以 Member 加入，平台角色不變）"}</span>}
                    </div>
                    <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
                      {q.time}{teamScoped && ` · ${teamName(q.audience)}`}{q.kind === "platform-role" && "　·　由超級管理員審核"}
                    </span>
                  </div>
                </div>
                {q.note && (
                  <div style={{ padding: "7px 11px", borderRadius: "var(--radius-sm)", background: "var(--color-bg-neutral-default)", font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
                    「{q.note}」
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {teamScoped && onGoTeam && (
                    <Button size="sm" variant="ghost" startIcon={<Icon n="ArrowUpRight" s={14} />} onClick={() => onGoTeam(q.audience)}>前往團隊</Button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <Button size="sm" variant="ghost" style={{ color: "var(--color-fg-danger)" }} onClick={() => setRejecting(q)}>拒絕</Button>
                  <Button size="sm" variant="primary" startIcon={<Icon n="Check" s={14} />} onClick={() => mm.approveQueue(q)}>核准</Button>
                </div>
              </div>
            );
          })}
        </div>

        {rejecting && (
          <ReasonDialog
            title={`拒絕 ${rejecting.applicant} 的申請`}
            body="拒絕將通知申請人，並附上您的理由。"
            confirmLabel="確認拒絕" danger
            onClose={() => setRejecting(null)}
            onConfirm={(why) => mm.rejectQueue(rejecting, why)}
          />
        )}
      </div>
    );
  }

  Object.assign(window, { QueueView, InboxPanel });
})();
