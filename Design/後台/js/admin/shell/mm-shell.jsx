// mm-shell.jsx — 成員管理頁對共用 WGShell 的轉接層
//
// ⚠️ 2026-08-15 重構：這支原本是 WGShell 的**完整重複實作**（自己的側邊欄、頂欄、
//    品牌區、設定／登出頁尾），所以成員管理頁的左側選單與任務管理／資源站點
//    長得不一樣、也沒有事件脈絡區塊。現在跟 tk-shell / station-shell 一樣，
//    只負責把成員管理的東西轉成 WGShell 認得的 props：
//
//      headerExtra    → 搜尋框
//      headerActions  → 審核佇列鈴鐺（成員管理專屬，跟個人通知鈴鐺是兩件事）
//
//    對外仍導出 MMShell / MMPlaceholder，mm-app.jsx 不用改。
(function () {
  const Icon = window.WGIcon;

  // ── 搜尋框（成員管理專屬）────────────────────────────────────────────────
  function MMSearch() {
    return (
      <div style={{ flex: 1, maxWidth: 340, marginLeft: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
          <Icon n="Search" s={18} c="var(--color-fg-neutral-muted)" />
          <input placeholder="搜尋成員、團隊或單據…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" }} />
        </div>
      </div>
    );
  }

  // ── 審核佇列鈴鐺 ────────────────────────────────────────────────────────
  // 這顆跟 wg-notify.jsx 的個人通知鈴鐺**不是同一件事**，不要合併：
  //   審核佇列 = 等我處理的申請（我是 reviewer，有動作要做）
  //   通知收件匣 = 發生了什麼事（多半只是知會）
  function MMReviewBell({ queueCount = 0, reviewAudiences = [], onGoTeam }) {
    const [open, setOpen] = React.useState(false);
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <button className="mm-iconbtn" style={{ position: "relative" }} aria-label="審核佇列" onClick={() => setOpen((o) => !o)}>
          <Icon n="Inbox" s={22} c={open ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-subtle)"} />
          {queueCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--color-bg-warning)", color: "var(--color-fg-on-warning)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-bg-neutral-default)" }}>{queueCount}</span>
          )}
        </button>
        {open && (
          <React.Fragment>
            <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }}></span>
            <div className="mm-rise" style={{ position: "absolute", top: "calc(100% + 12px)", right: 0, zIndex: 401, width: 420, maxWidth: "calc(100vw - 32px)", background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
              <window.InboxPanel audiences={reviewAudiences} onClose={() => setOpen(false)}
                onGoTeam={(tid) => { setOpen(false); onGoTeam && onGoTeam(tid); }} />
            </div>
          </React.Fragment>
        )}
      </span>
    );
  }

  function MMShell({ active, onNavigate, persona, queueCount = 0, reviewAudiences = [], onGoTeam, children }) {
    // MM_RBAC 已無 `user`（2026-08-17 移除「一般使用者」），查不到就退回中性，
    // 不要讓 shell 因為一筆過期假資料而整頁掛掉。
    // ⚠️ 頂欄那顆徽章實際顯示的是**目前身份**的平台角色（wg-profile.jsx 自己算），
    //    這裡的 rbacLabel 只是 WGPersonaMenu 未載入時的退路。
    const rbacDef = window.MM_RBAC[persona.rbac] || { label: "—", tone: "neutral" };
    return (
      <window.WGShell
        active={active} onNavigate={onNavigate}
        persona={{
          id: persona.id, rbac: persona.rbac, teams: persona.teams,
          name: persona.name, title: persona.title,
          rbacLabel: rbacDef.label, rbacTone: rbacDef.tone,
        }}
        headerExtra={<MMSearch />}
        headerActions={<MMReviewBell queueCount={queueCount} reviewAudiences={reviewAudiences} onGoTeam={onGoTeam} />}
      >
        {children}
      </window.WGShell>
    );
  }

  // 建置中佔位（成員管理以外的後台模組）
  function MMPlaceholder({ label }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 420, gap: 12, color: "var(--color-fg-neutral-muted)" }}>
        <Icon n="Hammer" s={40} c="var(--color-fg-neutral-muted)" />
        <div className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>{label} · 建置中</div>
        <div className="wg-caption">本原型聚焦「成員管理」模組，此分頁為 ManagerEnd 導覽佔位。</div>
      </div>
    );
  }

  // ── 乾淨切的兜底畫面（2026-08-17 D-3）────────────────────────────────────
  // ⚠️ 這**不是**「灰掉＋提示」。乾淨切的正式行為是導覽項與按鈕整個不 render，
  //    使用者根本走不到這裡。這支只在有人用網址列直接打 #view=members 之類的
  //    方式繞過導覽時出現，等同後端的 403 —— 前端不能假裝那個 view 不存在。
  function MMNoAccess({ need, current }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 420, gap: 12, textAlign: "center" }}>
        <Icon n="ShieldAlert" s={40} c="var(--color-fg-neutral-muted)" />
        <div className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>此功能不屬於目前身份</div>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", maxWidth: 440, lineHeight: 1.8 }}>
          目前身份是「{current}」，這一頁需要「{need}」。<br />
          請用右上角人名選單切換身份 —— 各身份的權限完全切割，不會互相補位。
        </div>
      </div>
    );
  }

  Object.assign(window, { MMShell, MMPlaceholder, MMReviewBell, MMNoAccess });
})();
