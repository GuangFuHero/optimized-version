// station-shell.jsx — 資源站點管理頁對共用 WGShell 的轉接層
//
// 外殼本身在 js/admin/shell/wg-shell.jsx（三頁共用）。
// 角色與人物來自 wg-event.js 的 TK_RBAC / TK_PERSONAS，與任務管理頁同一組。
// 事件脈絡在本頁為【唯讀】：不傳 onRemoveDisaster / onOpenEventSettings，
// 所以災害標籤沒有移除 X、也不會出現「事件設定」按鈕（2026-08-07 決策）。
(function () {
  function ConsoleShell({ active, role, onNavigate, onLogout, headerExtra, children }) {
    const p = (window.TK_PERSONAS || {})[role] || {};
    const r = (window.TK_RBAC || {})[role] || {};
    return (
      <window.WGShell
        active={active} onNavigate={onNavigate} onLogout={onLogout}
        persona={{ id: p.id, rbac: p.rbac, team: p.team, teams: p.teams, name: p.name, title: p.title, rbacLabel: r.label, rbacTone: r.tone }}
        headerExtra={headerExtra}
      >
        {children}
      </window.WGShell>
    );
  }

  // 原型角色視角列（黑底），與任務管理頁的 DemoBar 是同一個 WGRoleBar 元件
  function StationRoleBar({ role, setRole }) {
    const items = (window.WG_ROLE_ORDER || []).map((id) => {
      const p = window.TK_PERSONAS[id];
      return { id, name: p.name, sub: window.TK_RBAC[p.rbac].label };
    });
    return <window.WGRoleBar items={items} value={role} onChange={setRole}
      note="資源站點為公共資訊，全角色可見；差異在維護、審查與責任區權限" />;
  }

  Object.assign(window, { ConsoleShell, StationRoleBar });
})();
