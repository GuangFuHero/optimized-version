// mm-teams.jsx — 超級管理員「團隊管理」（左列表 + 右詳情）與「所有團隊」唯讀清單
//
// 2026-08-17 D-4：唯讀清單從政府專屬開放給 NGO（PM 確認放行）。
// 舊名 GovTeamsView 保留為 AllTeamsView 的別名。
(function () {
  const { Button, Badge, Card, Avatar, Alert, Chip } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useMM, TypeBadge, TeamStatusBadge, MMMenu, StatPill, ReasonDialog, MemberTable } = window;

  // ── 左側團隊列表項 ──────────────────────────────────────────────────────
  function TeamRailItem({ team, active, onClick, count }) {
    return (
      <button
        onClick={onClick}
        style={{
          display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px", textAlign: "left", cursor: "pointer",
          borderRadius: "var(--radius-md)", border: "none", width: "100%",
          background: active ? "var(--color-bg-primary-subtle)" : "transparent",
          boxShadow: active ? "inset 3px 0 0 var(--color-bg-primary)" : "none",
          opacity: team.status === "inactive" ? 0.65 : 1,
          transition: "background var(--transition-fast)",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, font: "var(--font-label-400)", color: active ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</span>
          <TeamStatusBadge status={team.status} />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TypeBadge type={team.type} />
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{count} 位成員</span>
        </span>
      </button>
    );
  }

  // ── 超級管理員：團隊管理 ────────────────────────────────────────────────
  function SuperTeamsView() {
    const mm = useMM();
    const [selectedId, setSelectedId] = React.useState("t2");
    const [query, setQuery] = React.useState("");
    const [create, setCreate] = React.useState(false);
    const [invite, setInvite] = React.useState(null);
    const [reason, setReason] = React.useState(null); // {mode:'suspend'|'dissolve', team}

    const teams = mm.teams.filter((t) => !query || t.name.includes(query));
    const team = mm.teams.find((t) => t.id === selectedId) || mm.teams[0];
    const roster = mm.rosters[team.id] || [];
    const adminCount = roster.filter((r) => r.role === "admin").length;

    const memberActions = (m) => [
      m.role === "member"
          ? { label: "升為管理員", icon: "KeySquare", onClick: () => { mm.updateRoster(team.id, m.id, { role: "admin" }); mm.pushAudit({ actor: mm.persona.name, action: `將 ${m.name} 升為「${team.name}」的管理員`, cat: "member", scope: team.id }); mm.toast(`${m.name} 已升為管理員`); } }
          : { label: "降為成員", icon: "KeySquare", onClick: () => { mm.updateRoster(team.id, m.id, { role: "member" }); mm.pushAudit({ actor: mm.persona.name, action: `將 ${m.name} 降為「${team.name}」的成員`, cat: "member", scope: team.id }); mm.toast(`${m.name} 已降為成員`); } },
      "divider",
      m.status === "suspended"
        ? { label: "恢復團隊內活動", icon: "Check", onClick: () => { mm.updateRoster(team.id, m.id, { status: "active", statusNote: undefined }); mm.toast(`已恢復 ${m.name}`); } }
        : { label: "團隊內暫停", icon: "CircleAlert", onClick: () => { mm.updateRoster(team.id, m.id, { status: "suspended", statusNote: "由超級管理員暫停" }); mm.pushAudit({ actor: mm.persona.name, action: `將 ${m.name} 設為「${team.name}」團隊內暫停`, cat: "member", scope: team.id }); mm.toast(`已暫停 ${m.name}（僅此團隊）`); } },
      { label: "停用整個帳號", icon: "ShieldAlert", danger: true, onClick: () => mm.toast(`已停用 ${m.name} 的帳號（全域）`, "danger") },
    ];

    return (
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* 左：團隊列表 */}
        <Card padding="16px" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button variant="primary" startIcon={<Icon n="Plus" s={17} />} onClick={() => setCreate(true)} style={{ width: "100%" }}>新增團隊</Button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
            <Icon n="Search" s={16} c="var(--color-fg-neutral-muted)" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋團隊…" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {teams.map((t) => (
              <TeamRailItem key={t.id} team={t} active={t.id === team.id} count={(mm.rosters[t.id] || []).length} onClick={() => setSelectedId(t.id)} />
            ))}
          </div>
        </Card>

        {/* 右：團隊詳情 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {team.status === "suspended" && (
            <Alert tone="danger" title={`此團隊已暫停 — ${team.statusNote || ""}`}>
              暫停期間成員無法存取本隊的任務與資料，原資料保留。
              <span style={{ display: "inline-flex", marginLeft: 8 }}>
                <Button size="sm" variant="outline" onClick={() => { mm.updateTeam(team.id, { status: "active", statusNote: undefined }); mm.pushAudit({ actor: mm.persona.name, action: `恢復團隊「${team.name}」`, cat: "team", scope: "platform" }); mm.toast(`已恢復「${team.name}」`); }}>恢復團隊</Button>
              </span>
            </Alert>
          )}
          {team.status === "inactive" && (
            <Alert tone="info" title="此團隊已解散（標記為歷史，不刪除）">
              原 Ticket 與 Zone 保留並標示「來源團隊已解散」；成員在其他團隊的身份不受影響。
            </Alert>
          )}

          <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 className="wg-h600" style={{ margin: 0 }}>{team.name}</h2>
                  <TypeBadge type={team.type} />
                  <TeamStatusBadge status={team.status} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" }}>
                    <Icon n="Phone" s={15} c="var(--color-fg-neutral-muted)" />聯絡窗口 {team.contact.name} · {team.contact.phone}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" }}>
                    <Icon n="Clock" s={15} c="var(--color-fg-neutral-muted)" />建立於 {team.created}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {team.status === "active" && (
                  <Button variant="outline" size="sm" startIcon={<Icon n="QrCode" s={15} />} onClick={() => setInvite(team)}>邀請 QR</Button>
                )}
                <MMMenu items={[
                  { label: "編輯團隊資料", icon: "Pencil", onClick: () => mm.toast("編輯團隊（示意）") },
                  "divider",
                  team.status === "active" && { label: "暫停團隊", icon: "CircleAlert", onClick: () => setReason({ mode: "suspend", team }) },
                  team.status !== "inactive" && { label: "解散團隊", icon: "ShieldAlert", danger: true, onClick: () => setReason({ mode: "dissolve", team }) },
                ].filter(Boolean)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <StatPill icon="Users" label="成員" value={roster.length} />
              {/* 2026-08-17：比照「我的團隊」拿掉常駐紅色。
                  ⚠️ 這裡的條件是 `=== 0`，不是 `<= 1` —— 「一個運作中的團隊沒有任何管理員」
                  是真正的異常狀態（EA1 被破壞），不是提醒。這種情況保留 danger 是對的，
                  因為它確實需要超級管理員介入指派接班人。*/}
              <StatPill icon="KeySquare" label="管理員" value={adminCount} tone={adminCount === 0 ? "danger" : undefined} />
              <StatPill icon="MapPin" label="認領 Zone" value={team.zones.length ? team.zones.join("、") : "—"} />
              <StatPill icon="ClipboardList" label="Ticket" value={team.tickets} />
            </div>
          </Card>

          <Card padding="0">
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 16px 6px" }}>
              <h3 className="wg-h600" style={{ margin: 0, fontSize: 17, flex: 1 }}>成員名單</h3>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>超級管理員全域可見；各隊的管理員只看得到自己那一隊</span>
            </div>
            <MemberTable rows={roster} actionsFor={team.status === "active" ? memberActions : null} />
          </Card>
        </div>

        {create && <window.CreateTeamModal onClose={() => setCreate(false)} />}
        {invite && <window.InviteMemberModal team={invite} onClose={() => setInvite(null)} />}
        {reason && (
          <ReasonDialog
            title={reason.mode === "suspend" ? `暫停「${reason.team.name}」` : `解散「${reason.team.name}」`}
            body={reason.mode === "suspend"
              ? "暫停後該團隊成員將暫時無法存取，原資料保留、可隨時恢復。"
              : "解散將標記為歷史（不刪除）：原 Ticket 與 Zone 保留並標示「來源團隊已解散」，認領中的 Zone 進入待重新指派。成員在其他團隊的身份不受影響。"}
            confirmLabel={reason.mode === "suspend" ? "確認暫停" : "確認解散"}
            danger={reason.mode === "dissolve"}
            onClose={() => setReason(null)}
            onConfirm={(why) => {
              const st = reason.mode === "suspend" ? "suspended" : "inactive";
              mm.updateTeam(reason.team.id, { status: st, statusNote: why });
              mm.pushAudit({ actor: mm.persona.name, action: `${reason.mode === "suspend" ? "暫停" : "解散"}團隊「${reason.team.name}」｜理由：${why}`, cat: "team", scope: "platform", tone: "danger" });
              mm.toast(`已${reason.mode === "suspend" ? "暫停" : "解散"}「${reason.team.name}」`, "danger");
            }}
          />
        )}
      </div>
    );
  }

  // ── 所有團隊：名稱 ＋ 聯絡窗口（唯讀）────────────────────────────────────
  //
  // 🔄 2026-08-17 D-4（PM 確認放行）：這一層**從政府專屬開放給 NGO**。
  //
  //    Notion PRD v5.2 §3 A1 原文：「政府見列表+窗口（唯讀、別家）｜
  //    **Team Admin 見自己所屬 Team**」，§6 驗收又寫「Team Admin 在 UI 與 API 皆
  //    看不到別隊成員」。所以 NGO 原本連「平台上有哪些隊」都看不到。
  //
  //    Sucre 8/17：「NGO 應該也要看到全部團隊的 team 名稱，也就是至少知道有哪些
  //    NGO 在現場，以及 Team admin 的聯繫方式」。這剛好等於政府那一層，
  //    一字不差 —— 所以不是新設計一層，是把既有的那層開放出去。
  //
  //    ⚠️ **A2（成員名單）一個字都不動。** 別家的名單、別家成員的手機仍然關著。
  //    ⚠️ 覆蓋 Notion v5.2 與正典驗收兩條 → PRD 的 ADR-6，需補簽。
  //
  // D-5：聯絡方式用 `teams.contact`（該隊自己填的對外窗口），**不從名單撈
  //      role=admin**。理由：窗口是「這一隊願意對外的號碼」，管理員是「這個人的
  //      號碼」，兩者不該畫上等號；而且一隊可能有多位管理員（t1 慈濟就有兩位）。
  function AllTeamsView({ selfTeamId }) {
    const mm = useMM();
    const cols = "minmax(180px,1.6fr) 110px 100px minmax(140px,1.2fr) 150px minmax(140px,1.4fr)";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Alert tone="info" title="唯讀 —— 只有團隊名稱與對外聯絡窗口">
          供劃區、轉介與跨隊聯繫時挑選對象。依個資原則，別隊的成員名單與成員電話一律不顯示；
          這裡的電話是各隊自己填的對外窗口，不是成員個人號碼。
        </Alert>
        <Card padding="0">
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
            {["團隊名稱", "類型", "狀態", "聯絡窗口", "電話", "責任區"].map((h, i) => (
              <span key={i} className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{h}</span>
            ))}
          </div>
          {mm.teams.map((t) => {
            const isSelf = t.id === selfTeamId;
            // 🔴 待決（PRD U-4）：`teams.contact` 沒填時要顯示什麼。現有假資料每隊都有值。
            const cName = (t.contact && t.contact.name) || "未提供";
            const cPhone = (t.contact && t.contact.phone) || "未提供";
            return (
              <div key={t.id} className="mm-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: mm.pad, borderBottom: "1px solid var(--color-border-default)", opacity: t.status === "inactive" ? 0.6 : 1, background: isSelf ? "var(--color-bg-primary-subtle)" : undefined }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                  {isSelf && <Badge tone="primary">目前身份</Badge>}
                </span>
                <span><TypeBadge type={t.type} /></span>
                <span><TeamStatusBadge status={t.status} /></span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar name={cName} size={28} tone="neutral" />
                  <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)" }}>{cName}</span>
                </span>
                <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>{cPhone}</span>
                <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" }}>{t.zones.length ? t.zones.join("、") : "—"}</span>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px" }}>
            <Icon n="Lock" s={14} c="var(--color-fg-neutral-muted)" />
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>成員名單僅該隊的管理員與超級管理員可見。</span>
          </div>
        </Card>
      </div>
    );
  }

  // GovTeamsView 保留為別名 —— 這一層現在不是政府專屬了，但還有呼叫點沿用舊名。
  Object.assign(window, { SuperTeamsView, AllTeamsView, GovTeamsView: AllTeamsView });
})();
