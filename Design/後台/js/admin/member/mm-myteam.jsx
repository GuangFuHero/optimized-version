// mm-myteam.jsx — 「我的團隊」（管理員管理 / 成員檢視）＋「所有團隊」唯讀清單
// 2026-08-14 裁示：團隊角色移除 Guest，只留 Admin / Member。原「訪客視角」已刪除，
// 隸屬某團隊的人就是該團隊的成員，走同一個視角。
// 2026-08-15 PM 確認：身份切換在右上角人名選單（wg-profile.jsx 的 WGPersonaMenu），
// 本頁不再自帶切換器 —— 切換會同時改變任務單／資源站點的資料邊界，不能只掛在成員管理頁。
(function () {
  const { Button, Badge, Card, Avatar, Alert, Tabs } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useMM, MemberTable, StatPill, TypeBadge, ReasonDialog, QueueView, AuditView } = window;

  // ── 管理員 / 成員：我的團隊 ────────────────────────────────────────
  function TeamAdminView({ currentTeamId }) {
    const mm = useMM();
    const [tab, setTab] = React.useState("members");
    const [invite, setInvite] = React.useState(false);
    const [removing, setRemoving] = React.useState(null);

    // 隸屬清單走共用來源（wg-event.js），不讀 persona.teams —— 那份只是相容欄位
    const memberships = window.wgMemberships(mm.persona);
    const ms = currentTeamId ? memberships.find((m) => m.id === currentTeamId) : null;

    // 目前身份不是團隊身份時，本頁沒有團隊脈絡可用。這是合法狀態，不是錯誤。
    if (!ms) {
      return (
        <Alert tone="info" title="目前身份不是團隊身份"
          icon={<Icon n="Users" s={20} c="var(--color-fg-info)" />}>
          這一頁要有團隊脈絡才顯示得出來。
          {memberships.length
            ? "您有團隊身份，請用右上角人名選單切換過去。"
            : "加入團隊後，這裡會顯示該團隊的成員名單。"}
        </Alert>
      );
    }

    const team = mm.teams.find((t) => t.id === ms.id);
    const roster = mm.rosters[team.id] || [];
    const isAdmin = ms.role === "admin";
    const adminCount = roster.filter((r) => r.role === "admin" && r.status === "active").length;
    const queueCount = mm.queue.filter((q) => q.audience === team.id).length;

    const actionsFor = (m) => {
      if (!isAdmin) return null;
      const demote = () => {
        if (m.role === "admin" && adminCount <= 1) {
          mm.setBlock({
            title: "無法降級此成員",
            body: `${m.name} 是「${team.name}」目前唯一一位啟用中的管理員。請先將另一位成員升為管理員接班，才能降級或離隊。`,
            rule: "系統約束 EA1 — 每個運作中的團隊必須至少保留 1 位管理員",
          });
          return;
        }
        mm.updateRoster(team.id, m.id, { role: "member" });
        mm.pushAudit({ actor: mm.persona.name, action: `將 ${m.name} 降為「${team.name}」的成員`, cat: "member", scope: team.id });
        mm.toast(`${m.name} 已降為成員`);
      };
      const firstAction = m.role === "member"
          ? { label: "升為管理員", icon: "KeySquare", disabled: m.status === "pending", onClick: () => { mm.updateRoster(team.id, m.id, { role: "admin" }); mm.pushAudit({ actor: mm.persona.name, action: `將 ${m.name} 升為「${team.name}」的管理員`, cat: "member", scope: team.id }); mm.toast(`${m.name} 已升為管理員`); } }
          : { label: "降為成員", icon: "KeySquare", onClick: demote };
      return [
        firstAction,
        "divider",
        m.status === "suspended"
          ? { label: "恢復團隊內活動", icon: "Check", onClick: () => { mm.updateRoster(team.id, m.id, { status: "active", statusNote: undefined }); mm.toast(`已恢復 ${m.name}`); } }
          : { label: "團隊內暫停", icon: "CircleAlert", disabled: m.status === "pending", onClick: () => { mm.updateRoster(team.id, m.id, { status: "suspended", statusNote: "借調離隊（團隊內暫停）" }); mm.pushAudit({ actor: mm.persona.name, action: `將 ${m.name} 設為「${team.name}」團隊內暫停`, cat: "member", scope: team.id }); mm.toast(`已暫停 ${m.name}（僅此團隊，不影響其他團隊）`); } },
        { label: "移除出隊", icon: "X", danger: true, onClick: () => {
            if (m.role === "admin" && adminCount <= 1) {
              mm.setBlock({ title: "無法移除此成員", body: `${m.name} 是「${team.name}」唯一的管理員，請先指派接班人。`, rule: "系統約束 EA1 — 每個運作中的團隊必須至少保留 1 位管理員" });
              return;
            }
            setRemoving(m);
          } },
      ];
    };

    const tabs = isAdmin
      ? [
          { value: "members", label: <span style={{ whiteSpace: "nowrap" }}>成員列表</span> },
          { value: "queue", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>審核佇列{queueCount > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--color-bg-warning)", color: "var(--color-fg-on-warning)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{queueCount}</span>}</span> },
          { value: "audit", label: <span style={{ whiteSpace: "nowrap" }}>團隊紀錄</span> },
        ]
      : [{ value: "members", label: <span style={{ whiteSpace: "nowrap" }}>夥伴列表</span> }];

    // 2026-08-17 D-4（PM 確認放行）：所有團隊身份都看得到全平台團隊清單。
    // 🔴 PRD U-3 待決：同頁加分頁 vs 拆兩個導覽項。這裡先做同頁分頁 ——
    //    側邊欄已在 8/15 收斂成各身份排列一致，再加導覽項會破壞它。
    tabs.push({ value: "all", label: <span style={{ whiteSpace: "nowrap" }}>所有團隊</span> });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {memberships.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon n="ArrowLeftRight" s={14} c="var(--color-fg-neutral-muted)" />
              目前身份為「{team.name} · {isAdmin ? "管理員" : "成員"}」
            </span>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
              您另有 {memberships.length - 1} 個團隊，切換請用右上角人名選單。
            </span>
          </div>
        )}

        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 className="wg-h600" style={{ margin: 0 }}>{team.name}</h2>
                <TypeBadge type={team.type} />
                <Badge tone={isAdmin ? "primary" : "neutral"}>{isAdmin ? "我是管理員" : "我是成員"}</Badge>
              </div>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
                {isAdmin ? "您可邀請、暫停與調整本隊成員的團隊角色。別隊的成員名單看不到，也無法變更任何人的平台角色。" : "您在此團隊的角色是成員 —— 僅能檢視夥伴基本資訊；成員管理與團隊紀錄只有管理員看得到。"}
              </span>
            </div>
            {isAdmin && (
              <Button variant="primary" startIcon={<Icon n="QrCode" s={17} />} onClick={() => setInvite(true)}>邀請成員</Button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <StatPill icon="Users" label="成員" value={roster.length} />
            {/* 2026-08-17 Sucre：這一列的「管理員」與「待審」原本是紅底紅字（danger）。拿掉。
                「管理員 1」的紅色原意是提醒 EA1（每隊至少 1 位管理員），但那條約束在
                「降級／移除最後一位管理員」的當下就有 BlockDialog 擋著。常駐紅色是把一個
                **當下無害的狀態**畫成警報，而且這顆不可點 —— 看到紅色也沒有任何事能做。
                「待審 2」則是可點的（有 ChevronRight ＋ hover 陰影），可點性靠形狀表達就夠，
                不需要再靠顏色搶注意力。紅色同時給了「不可點的狀態」和「可點的待辦」兩種東西，
                等於讓紅色失去意義 —— 真的出事時反而沒有顏色可用。*/}
            <StatPill icon="KeySquare" label="管理員" value={adminCount} />
            {isAdmin && <StatPill icon="Inbox" label="待審" value={queueCount} onClick={() => setTab("queue")} />}
            <StatPill icon="MapPin" label="認領 Zone" value={team.zones.length ? team.zones.join("、") : "—"} />
          </div>
        </Card>

        <Tabs value={tab} onChange={setTab} tabs={tabs} />

        {tab === "members" && (
          <Card padding="0">
            <MemberTable rows={roster} basic={!isAdmin} selfId={mm.persona.id} actionsFor={actionsFor} />
          </Card>
        )}
        {tab === "queue" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>加入「{team.name}」的申請與成員邀請 QR 掃碼皆在此把關；同樣的佇列也會出現在右上角 🔔 全域 inbox。</span>
            <QueueView scope={team.id} />
          </div>
        )}
        {tab === "audit" && isAdmin && <AuditView scope={team.id} />}
        {tab === "all" && <window.AllTeamsView selfTeamId={team.id} />}

        {invite && <window.InviteMemberModal team={team} onClose={() => setInvite(false)} />}
        {removing && (
          <ReasonDialog
            title={`將 ${removing.name} 移除出隊`}
            body={`僅移除其在「${team.name}」的歸屬，不影響其在其他團隊的身份，也不變更其平台角色。`}
            confirmLabel="確認移除" danger
            onClose={() => setRemoving(null)}
            onConfirm={(why) => {
              mm.removeRosterMember(team.id, removing.id);
              mm.pushAudit({ actor: mm.persona.name, action: `將 ${removing.name} 移除出「${team.name}」｜理由：${why}`, cat: "member", scope: team.id, tone: "danger" });
              mm.toast(`已將 ${removing.name} 移除出隊`, "danger");
            }}
          />
        )}
      </div>
    );
  }

  Object.assign(window, { TeamAdminView });
})();
