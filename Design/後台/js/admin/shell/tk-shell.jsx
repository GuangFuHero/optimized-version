// tk-shell.jsx — 任務管理頁對共用 WGShell 的轉接層
//
// 外殼本身已抽到 js/admin/shell/wg-shell.jsx（三頁共用）。
// 這支只負責把任務管理的 context（useTK）轉成 WGShell 認得的 props，
// 對外仍導出 TKShell / DemoBar / EventScopeBar / TKPlaceholder，tk-app.jsx 不用改。
(function () {
  const Icon = window.WGIcon;
  const { useTK } = window;

  const ROLE_ORDER = ["super", "gov", "admin", "member", "auditor"];

  // ── 資料可視範圍切換（AC-VS-101 / AC-VS-103）──────────────────────────────
  // 放在 header、列表／地圖切換的左邊：先決定「看哪些單」，再決定「怎麼看」。
  // 篩選列的「清除」只清篩選條件，範圍不該被它連坐 —— 兩者刻意分開擺。
  // 沒有所屬 team 的角色（Super Admin／Government／Data Auditor）不顯示，他們沒有「我的單位」。
  function TKScopeSwitch() {
    const tk = useTK();
    const teams = tk.myTeams || [];
    // 2026-08-15 改決策：「我的單位」＝目前身份那一隊（右上角人名選單切換），
    // 不再是所有隸屬隊的聯集。沒有目前身份（平台身份／無隊角色）就不顯示這個切換。
    if (!teams.length) return null;
    const mineLabel = "我的單位";
    const mineTitle = `我的單位：${teams[0]}（切換身份請用右上角人名選單）`;
    const opts = [["mine", mineLabel, "Users", mineTitle], ["all", "全部單位", "Globe", "所有單位的單，其他單位唯讀"]];
    return (
      <React.Fragment>
        <div title="資料可視範圍。其他單位的單看得到、不能編輯"
          style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-sunken)" }}>
          {opts.map(([id, label, icon, tip]) => {
            const on = tk.scope === id;
            return (
              <button key={id} type="button" onClick={() => tk.setScope(id)} aria-pressed={on} title={tip}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 14px", borderRadius: 8, cursor: "pointer", border: "none", whiteSpace: "nowrap",
                  background: on ? "var(--color-bg-neutral-default)" : "transparent", boxShadow: on ? "var(--shadow-sm)" : "none",
                  font: "var(--font-label-400)", fontWeight: on ? 700 : 400, color: on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>
                <Icon n={icon} s={15} c={on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)"} />{label}
              </button>
            );
          })}
        </div>
        <span style={{ width: 1, height: 22, background: "var(--color-border-default)", flexShrink: 0 }}></span>
      </React.Fragment>
    );
  }

  // 原型角色視角列
  function DemoBar({ role, onChange }) {
    const items = ROLE_ORDER.map((key) => {
      const p = window.TK_PERSONAS[key];
      return { id: key, name: p.name, sub: window.TK_RBAC[p.rbac].label };
    });
    return <window.WGRoleBar items={items} value={role} onChange={onChange} />;
  }

  function TKShell({ active: activeNav, onNavigate, persona, children }) {
    const tk = useTK();
    const activeTypes = tk.actTypes.filter((t) => t.status === "active");
    const rbacDef = window.TK_RBAC[persona.rbac];

    return (
      <window.WGShell
        active={activeNav} onNavigate={onNavigate}
        persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams, name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}
        activation={window.TK_ACTIVATION}
        disasterTypes={activeTypes.map((t) => ({ key: t.key, isNew: t.isNew }))}
        onRemoveDisaster={tk.can.activate ? (k) => tk.askRemoveDisaster(k) : undefined}
        onOpenEventSettings={() => tk.setModal("disasterSettings")}
        headerExtra={activeNav === "ticket" && tk.view
          ? <><TKScopeSwitch /><window.WGViewSwitch count={tk.tickets.length} value={tk.view} onChange={tk.setView} /></>
          : null}
      >
        {children}
      </window.WGShell>
    );
  }

  // 保留舊的頂部災害脈絡列（目前 tk-app 已不使用；事件脈絡改在側邊欄）
  function EventScopeBar({ activation }) {
    const tk = useTK();
    const active = tk.actTypes.filter((t) => t.status === "active");
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16, height: 36, borderBottom: "1px solid var(--color-border-default)", background: "transparent", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", overflow: "hidden" }}>
        {/* 影響區域已移除（2026-08-16 Sucre：後端確定沒有 regions 儲存欄位）*/}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflowX: "auto" }}>
          <span style={{ flexShrink: 0 }}>災害類型：</span>
          {active.map((t) => <window.DisasterTag key={t.key} type={t.key} size="sm" isNew={t.isNew} mono
            onRemove={tk.can.activate && active.length > 1 ? () => tk.askRemoveDisaster(t.key) : undefined} />)}
          <window.ShellPendingChip info={window.WG_EVENT_PENDING} label="事件層資料待確認" />
        </span>
      </div>
    );
  }

  function TKPlaceholder({ label }) {
    return <window.WGPlaceholder label={label} note="本原型聚焦「任務管理」模組，此分頁為 ManagerEnd 導覽佔位。" />;
  }

  Object.assign(window, { TKShell, DemoBar, EventScopeBar, TKPlaceholder });
})();
