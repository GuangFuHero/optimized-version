// mm-members.jsx — 成員表格（共用）+ 平台級人員分頁
(function () {
  const { Button, Badge, Card, Avatar } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useMM, RbacBadge, TeamRoleBadge, StatusBadge, MMMenu, EmptyState } = window;

  // ── 成員表格 ──────────────────────────────────────────────────────────────
  // rows: roster 項目；basic: 僅基本資訊（Member 視角）；actionsFor(m) → MMMenu items 或 null
  function MemberTable({ rows, basic = false, selfId, actionsFor }) {
    const mm = useMM();
    const cols = basic
      ? "minmax(220px,2fr) 140px 130px"
      : "minmax(190px,1.8fr) 116px 106px 124px 92px 92px 44px";
    const header = basic
      ? ["成員", "團隊角色", "狀態"]
      : ["成員", "團隊角色", "平台角色", "狀態", "加入時間", "最後活動", ""];

    return (
      <div role="table" aria-label="成員列表" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: basic ? 0 : 780 }}>
        <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
          {header.map((h, i) => (
            <span key={i} role="columnheader" className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{h}</span>
          ))}
        </div>
        {rows.length === 0 && <EmptyState icon="Users" title="尚無成員" caption="產生邀請 QRCode，讓夥伴掃碼加入。" />}
        {rows.map((m) => {
          const items = actionsFor ? actionsFor(m) : null;
          return (
            <div key={m.id} role="row" className="mm-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: mm.pad, borderBottom: "1px solid var(--color-border-default)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Avatar name={m.name} size={34} tone={m.rbac === "gov" ? "secondary" : m.rbac === "user" ? "neutral" : "primary"} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                    {m.id === selfId && <Badge tone="neutral">我</Badge>}
                  </span>
                  <span style={{ display: "block", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>{basic ? (m.note || "") : m.phone}</span>
                </span>
              </span>
              <span><TeamRoleBadge role={m.role} /></span>
              {!basic && <span><RbacBadge rbac={m.rbac} /></span>}
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <StatusBadge status={m.status} />
                {m.statusNote && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", fontSize: 11 }}>{m.statusNote}</span>}
              </span>
              {!basic && <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>{m.joined}</span>}
              {!basic && <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>{m.last}</span>}
              {!basic && <span>{items && items.length > 0 && <MMMenu items={items} />}</span>}
            </div>
          );
        })}
        </div>
      </div>
    );
  }

  // ── 平台級人員分頁（限超級管理員）───────────────────────────────────────
  function PlatformView() {
    const mm = useMM();
    const [assign, setAssign] = React.useState(false);
    // 政府由 GOV 團隊推導，不屬於這一頁；核准前台「政府」申請時雖寫進 platform，這裡不列。
    const rows = mm.platform.filter((r) => r.rbac !== "gov");
    const activeSupers = rows.filter((r) => r.rbac === "super" && r.status === "active").length;
    const cols = "minmax(200px,1.8fr) 150px 110px 100px 100px 44px";

    const actionsFor = (m) => {
      const blockLastSuper = () => mm.setBlock({
        title: "無法執行此操作",
        body: `${m.name} 是平台目前唯一一位啟用中的超級管理員。請先指派另一位超級管理員接班，才能撤銷或停用。`,
        rule: "平台角色不變量（見 04-rbac）—— 平台必須至少保留 1 位超級管理員",
      });
      const isLastSuper = m.rbac === "super" && m.status === "active" && activeSupers <= 1;
      return [
        m.rbac === "auditor" && { label: "指派為超級管理員", icon: "KeySquare", onClick: () => { mm.updatePlatform(m.id, { rbac: "super" }); mm.pushAudit({ actor: mm.persona.name, action: `指派 ${m.name} 為超級管理員`, cat: "rbac", scope: "platform" }); mm.toast(`已指派 ${m.name} 為超級管理員`); } },
        m.rbac === "super" && { label: "撤銷超級管理員", icon: "KeySquare", danger: true, onClick: () => { if (isLastSuper) return blockLastSuper(); mm.updatePlatform(m.id, { rbac: "auditor" }); mm.pushAudit({ actor: mm.persona.name, action: `撤銷 ${m.name} 的超級管理員（改為資料檢核員）`, cat: "rbac", scope: "platform" }); mm.toast(`已撤銷 ${m.name} 的超級管理員`); } },
        "divider",
        m.status === "active"
          ? { label: "停用帳號", icon: "CircleAlert", danger: true, onClick: () => { if (isLastSuper) return blockLastSuper(); mm.updatePlatform(m.id, { status: "suspended" }); mm.pushAudit({ actor: mm.persona.name, action: `停用 ${m.name} 的帳號`, cat: "member", scope: "platform", tone: "danger" }); mm.toast(`已停用 ${m.name} 的帳號`, "danger"); } }
          : { label: "恢復帳號", icon: "Check", onClick: () => { mm.updatePlatform(m.id, { status: "active" }); mm.pushAudit({ actor: mm.persona.name, action: `恢復 ${m.name} 的帳號`, cat: "member", scope: "platform" }); mm.toast(`已恢復 ${m.name} 的帳號`); } },
      ].filter(Boolean);
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <p className="wg-caption" style={{ margin: 0, flex: 1, color: "var(--color-fg-neutral-muted)" }}>
            超級管理員與資料檢核員的工作是全域的，不需靠團隊管理成員 —— 此分頁只是把「不由團隊推導的全域角色」集中呈現，並非一種團隊。
          </p>
          <Button variant="outline" size="sm" startIcon={<Icon n="UserPlus" s={15} />} onClick={() => setAssign(true)}>指派平台級角色</Button>
        </div>
        <Card padding="0">
          <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
            {["成員", "平台角色", "狀態", "指派時間", "最後活動", ""].map((h, i) => (
              <span key={i} className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{h}</span>
            ))}
          </div>
          {rows.map((m) => (
            <div key={m.id} className="mm-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: mm.pad, borderBottom: "1px solid var(--color-border-default)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={m.name} size={34} tone={m.rbac === "super" ? "primary" : "secondary"} />
                <span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{m.name}</span>
                    {m.self && <Badge tone="neutral">我</Badge>}
                  </span>
                  <span style={{ display: "block", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>{m.phone}</span>
                </span>
              </span>
              <span><RbacBadge rbac={m.rbac} solid={m.rbac === "super"} /></span>
              <span><StatusBadge status={m.status} /></span>
              <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>{m.assigned}</span>
              <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>{m.last}</span>
              <span><MMMenu items={actionsFor(m)} /></span>
            </div>
          ))}
        </Card>
        {assign && <window.AssignRoleModal onClose={() => setAssign(false)} />}
      </div>
    );
  }

  // ── 全平台人員 · 唯讀目錄（回答「這個人是誰、平台身份、現在在哪些 Team」）──
  function PeopleDirectory() {
    const mm = useMM();
    const [q, setQ] = React.useState("");
    const [rbacFilter, setRbacFilter] = React.useState("all");
    // 剛核准的那個人：清掉搜尋與篩選（否則他可能被篩掉，看起來像沒核准成功），
    // 捲到可見並閃 2.4 秒（與互助地圖的 doneWith 同一個時長）。
    const [flashId, setFlashId] = React.useState(null);
    const rowRefs = React.useRef({});
    const focus = mm.focus;
    React.useEffect(() => {
      if (!focus || focus.tab !== "directory") return;
      setQ(""); setRbacFilter("all"); setFlashId(focus.personId);
      const t1 = setTimeout(() => {
        const el = rowRefs.current[focus.personId];
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 60);
      const t2 = setTimeout(() => setFlashId(null), 2400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [focus && focus.nonce]);
    const teamName = (id) => { const t = mm.teams.find((x) => x.id === id); return t ? t.name : id; };

    const people = React.useMemo(() => {
      const map = {};
      mm.platform.forEach((p) => { map[p.id] = { id: p.id, name: p.name, phone: p.phone, rbac: p.rbac, status: p.status, teams: [] }; });
      Object.entries(mm.rosters).forEach(([tid, roster]) => {
        (roster || []).forEach((m) => {
          if (!map[m.id]) map[m.id] = { id: m.id, name: m.name, phone: m.phone, rbac: m.rbac, status: m.status, teams: [] };
          map[m.id].teams.push({ id: tid, name: teamName(tid), role: m.role });
        });
      });
      return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    }, [mm.platform, mm.rosters, mm.teams]);

    const filtered = people.filter((p) =>
      (rbacFilter === "all" || p.rbac === rbacFilter) &&
      (!q || p.name.includes(q) || (p.phone || "").includes(q))
    );
    const cols = "minmax(180px,1.6fr) 130px minmax(220px,2fr) 96px";
    const FILTERS = [["all", "全部"], ["super", "超級管理員"], ["gov", "政府"], ["ngo", "非政府組織"], ["auditor", "資料檢核員"]];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="wg-caption" style={{ margin: 0, color: "var(--color-fg-neutral-muted)" }}>
          跨團隊的唯讀人員目錄 —— 查詢任一人的平台身份與所屬團隊。變更平台角色須回到「平台級人員」刻意指派；團隊角色由各隊的管理員於「團隊」頁調整。
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-default)", boxShadow: "inset 0 0 0 1px var(--color-border-default)", minWidth: 240, flex: "0 1 320px" }}>
            <Icon n="Search" s={17} c="var(--color-fg-neutral-muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名或手機…" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)" }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map(([v, label]) => (
              <window.WanGuardDesignSystem_9c8f68.Chip key={v} active={rbacFilter === v} onClick={() => setRbacFilter(v)}>{label}</window.WanGuardDesignSystem_9c8f68.Chip>
            ))}
          </div>
          <span style={{ flex: 1 }}></span>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{filtered.length} 人</span>
        </div>
        <style>{`@keyframes mmRowFlash{0%,60%{background:var(--color-bg-primary-subtle)}100%{background:transparent}}.mm-row-flash{animation:mmRowFlash 2.4s ease-out;box-shadow:inset 3px 0 0 var(--color-bg-primary)}`}</style>
        <Card padding="0">
          <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
            {["人員", "平台角色", "所屬團隊（角色）", "帳號"].map((h, i) => (
              <span key={i} className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{h}</span>
            ))}
          </div>
          {filtered.length === 0 && <EmptyState icon="Search" title="查無符合的人員" caption="試試其他姓名、手機或調整篩選條件。" />}
          {filtered.map((p) => (
            <div key={p.id} ref={(el) => { rowRefs.current[p.id] = el; }} data-person-id={p.id} className={"mm-row" + (flashId === p.id ? " mm-row-flash" : "")} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: mm.pad, borderBottom: "1px solid var(--color-border-default)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Avatar name={p.name} size={34} tone={p.rbac === "super" ? "primary" : p.rbac === "gov" ? "secondary" : p.rbac === "user" ? "neutral" : "secondary"} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    {flashId === p.id && <Badge tone="success">剛核准</Badge>}
                  </span>
                  <span style={{ display: "block", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>{p.phone}</span>
                </span>
              </span>
              <span><RbacBadge rbac={p.rbac} solid={p.rbac === "super"} /></span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {p.teams.length === 0
                  ? <Badge tone="warning">未分配團隊</Badge>
                  : p.teams.map((tm) => (
                      <span key={tm.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 8px 0 10px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
                        <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" }}>{tm.name}</span>
                        <window.TeamRoleBadge role={tm.role} />
                      </span>
                    ))}
              </span>
              <span><StatusBadge status={p.status} /></span>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  // ── 「成員與權限」首頁（平台身份視角 · Function B）──────────────────────────
  function MembersPermissionsView() {
    const mm = useMM();
    const { Tabs } = window.WanGuardDesignSystem_9c8f68;
    const [tab, setTab] = React.useState(mm.focus ? mm.focus.tab : "platform");
    // 從審核佇列（本頁分頁或頂欄 🔔）核准後，切到目標分頁
    React.useEffect(() => { if (mm.focus) setTab(mm.focus.tab); }, [mm.focus && mm.focus.nonce]);
    const qc = mm.queue.filter((q) => q.audience === "super").length;
    const queueLabel = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        審核佇列{qc > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--color-bg-warning)", color: "var(--color-fg-on-warning)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{qc}</span>}
      </span>
    );
    const tabs = [
      { value: "platform", label: <span style={{ whiteSpace: "nowrap" }}>平台級人員</span> },
      { value: "queue", label: queueLabel },
      { value: "directory", label: <span style={{ whiteSpace: "nowrap" }}>全平台人員</span> },
      { value: "audit", label: <span style={{ whiteSpace: "nowrap" }}>操作紀錄</span> },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        {tab === "platform" && <PlatformView />}
        {tab === "queue" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>平台角色申請（政府／資料檢核員）由超級管理員審核；加入團隊的申請由各隊的管理員在自己那一隊處理。同樣的佇列也在右上角 🔔 全域 inbox。</span>
            <window.QueueView scope="super" />
          </div>
        )}
        {tab === "directory" && <PeopleDirectory />}
        {tab === "audit" && <window.AuditView scope="platform" />}
      </div>
    );
  }

  Object.assign(window, { MemberTable, PlatformView, PeopleDirectory, MembersPermissionsView });
})();
