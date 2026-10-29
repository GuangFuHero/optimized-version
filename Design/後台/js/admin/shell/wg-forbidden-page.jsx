/* 後台的「沒有權限訪問此頁」（2026-10-20）。畫面本體跟 404 共用 js/shared/wg-notfound.jsx。
 * 正式版：後台路由存在、但目前身份沒有權限時顯示（API 回 403、或直接打網址進來）。
 *
 * 🔒 跟 404 一樣：外殼照常顯示；WGShell active="forbidden" → 側欄沒有任何一項亮起，頂欄標題「沒有權限訪問此頁」。
 * 🔒 乾淨切（2026-08-17 D-3）：正常操作不會走到這頁 —— 看不到的頁面側欄本來就不出現。
 *    會到這裡的只有：直接打網址、別人傳來的連結、書籤、切換身份後停在原頁。
 * 🔒 不說「是哪一頁」「需要什麼角色」。只說目前用什麼身份、可以找誰、可以去哪。
 * 🚨 2026-10-20 Claude 定的（待 Sucre 確認）：
 *    - 顯示「目前身份」那一列（用 wgIdentityLabel，跟右上角同一套字）
 *    - 有 2 個以上身份才提示「從右上角切換身份」（只有一個身份時切換器不存在）
 *    - 找誰：團隊成員 → 團隊管理員；超級管理員 → 不寫找誰；其他 → 超級管理員
 *    - 下一步選項與 404 相同：wgNavFor() 前三項
 * 交付版：總覽儀表板尚未交付（重複審核 2026-10-29 已交付），下一步先跳過它們（NOT_DELIVERED，同 404）。正式版直接取 wgNavFor() 前三項。
 * 角色：交付版沒有角色視角列（WGRoleBar 回傳 null），用網址 ?as=ngo-member 等預覽，見 docs/角色與權限.md。
 * 🔒 不要用物件 rest 解構（Babel standalone _excluded 撞名白畫面）。 */
(function () {
  function ForbiddenApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "member");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];
    // 跟著右上角切換身份重繪（側欄、目前身份、下一步都會變）
    const [identity] = window.useWGActingIdentity(persona);
    const identities = window.wgIdentities ? window.wgIdentities(persona) : [];
    const Icon = window.WGIcon;

    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({ id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label }))}
        value={role} onChange={setRole}
        note="目前身份、找誰、下一步的選項依身份不同" />
    );

    const nav = window.wgNavFor ? window.wgNavFor(persona) : [];
    const SUB = { dashboard: "整體狀況與數字", ticket: "任務單、指派與進度", map: "責任區、危險區與標示區",
      station: "資源站點與修改建議", dedup: "可能重複的任務單與站點", announce: "前台與後台的緊急公告",
      brief: "給志工的行前資訊", members: "全平台人員與權限", teams: "團隊與成員" };
    const NOT_DELIVERED = ["dashboard"];   // 重複審核 2026-10-29 已交付
    const links = nav.filter(([id]) => NOT_DELIVERED.indexOf(id) < 0).slice(0, 3).map(([id, label, icon]) => ({
      key: id, label, icon, sub: SUB[id], onClick: () => window.wgNavigate(id, "forbidden"),
    }));

    const isTeamMember = identity && identity.kind === "team" && identity.role !== "admin";
    const who = isTeamMember ? "你的團隊管理員" : "平台的超級管理員";
    const canSwitch = identities.length > 1;
    // 超級管理員自己就是最高權限，不叫他「聯絡超級管理員」（正式版超管不會看到這頁，原型才切得到）
    const isSuper = identity && identity.kind === "platform" && identity.role === "super";
    const lead = (isSuper ? "你目前的身份沒有開放這個頁面"
        : "你目前的身份沒有開放這個頁面。如果工作上需要，請聯絡" + who + "開通")
      + (canSwitch ? "；或從右上角的人名切換到其他身份再試一次。" : "。")
      + "也可以從左邊的選單，或從這裡繼續：";

    const label = window.wgIdentityLabel ? window.wgIdentityLabel(identity) : rbacDef.label;
    const note = (
      <div data-forbidden-identity style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderRadius: 'var(--radius-full)', background: 'var(--color-bg-neutral-default)', border: '1px solid var(--color-border-default)',
        font: '400 14px/1.4 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
        {Icon ? <Icon n="UserRound" s={16} /> : null}
        <span>目前身份</span>
        <b style={{ fontWeight: 700, color: 'var(--color-fg-neutral-default)' }}>{persona.name} · {label}</b>
      </div>
    );

    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="forbidden"
          onNavigate={(id) => window.wgNavigate(id, "forbidden")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}>
          <window.WGNotFound key={role + ':' + (identity ? identity.key : '')} realm="admin"
            title="沒有權限訪問此頁"
            mood="stop" img="assets/mascot/guangfu-baby-403.svg" alt="403"
            lead={lead} note={note} links={links} />
        </window.WGShell>
      </window.WGPage>
    );
  }
  Object.assign(window, { ForbiddenApp });
})();
