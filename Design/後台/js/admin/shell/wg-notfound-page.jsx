/* 後台的「找不到這一頁」（2026-10-18）。畫面本體在 js/shared/wg-notfound.jsx，前後台共用。
 * 正式版：後台路由對不到任何頁面時顯示這一頁。
 * 🔒 WGShell 的 active="notfound"：側欄沒有任何一項亮起（你不在任何一頁），頂欄標題寫「找不到這一頁」。
 * 🔒 下一步的選項走 wgNavFor()，依目前身份 —— 看不到的頁面這裡也不出現（乾淨切 2026-08-17 D-3）。
 *    只取前三項；其他頁面側欄都在。
 * 交付版：總覽儀表板、重複審核尚未交付（點了落到「建置中」佔位頁），所以下一步先跳過它們。
 *    正式版不需要 NOT_DELIVERED，直接取 wgNavFor() 的前三項。
 * 角色：交付版沒有角色視角列（WGRoleBar 回傳 null），用網址 ?as=gov 等預覽，見 docs/角色與權限.md。 */
(function () {
  function NotFoundApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "super");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];
    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({ id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label }))}
        value={role} onChange={setRole}
        note="下一步的選項依身份不同（看不到的頁面不出現）" />
    );
    const nav = window.wgNavFor ? window.wgNavFor(persona) : [];
    const SUB = { dashboard: "整體狀況與數字", ticket: "任務單、指派與進度", map: "責任區、危險區與標示區",
      station: "資源站點與修改建議", dedup: "可能重複的任務單與站點", announce: "前台與後台的緊急公告",
      brief: "給志工的行前資訊", members: "全平台人員與權限", teams: "團隊與成員" };
    const NOT_DELIVERED = ["dashboard", "dedup"];
    const links = nav.filter(([id]) => NOT_DELIVERED.indexOf(id) < 0).slice(0, 3).map(([id, label, icon]) => ({
      key: id, label, icon, sub: SUB[id], onClick: () => window.wgNavigate(id, "notfound"),
    }));
    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="notfound"
          onNavigate={(id) => window.wgNavigate(id, "notfound")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}>
          <window.WGNotFound key={role} realm="admin"
            lead="網址可能打錯了，或這個頁面已經移除。可以從左邊的選單前往其他頁面，或從這裡繼續："
            links={links} />
        </window.WGShell>
      </window.WGPage>
    );
  }
  Object.assign(window, { NotFoundApp });
})();
