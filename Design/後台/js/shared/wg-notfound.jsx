/* 平台的「找不到這一頁」（2026-10-18）—— 前台與後台共用同一支。
 *
 * 前台：前台找不到頁面 Site Not Found.html，套 SiteShell。
 * 後台：後台找不到頁面 Not Found.html，套 WGShell（active="notfound"）。
 *
 * 🔒 外殼（側欄、頂欄、緊急公告）照常顯示。迷路的人第一個需要的是「我還在平台裡、
 *    旁邊的選單都還能用」，不是一張跟平台長得不一樣的錯誤頁。
 * 🔒 只給幾個「下一步」，不列全站地圖。後台的選項依目前身份走 wgNavFor()：
 *    乾淨切（2026-08-17 D-3）—— 看不到的頁面在這裡也不出現。
 * 🔒 文案不寫技術用語（不寫 404 Not Found、路由、伺服器）。「404」只寫在光復寶寶的牌子上，
 *    讓工程師與回報問題的人有個對得上的字；文字區不再重複一次。
 * 🔒 不要用物件 rest 解構（2026-09-27：Babel standalone 會在全域宣告 _excluded，撞名白畫面）。
 *
 * props
 *   realm  'site' | 'admin'
 *   title  標題，預設「找不到這一頁」（2026-10-20：沒有權限的頁面共用這支，傳「沒有權限訪問此頁」）
 *   mood   'lost'（404，預設）| 'stop'（403）—— 光復寶寶的動畫，見 js/shared/wg-mascot.jsx
 *   code   牌子上的字，預設依 mood（404／403）
 *   （img／alt 是沒載入 wg-mascot.jsx 時的靜態退回圖）
 *   lead   一句說明
 *   note   （選填）說明下方的補充區塊，例如 403 頁的「目前身份」
 *   links  [{ key, label, sub, icon, href? , onClick? }]
 */
(function () {
  function NotFoundCard(props) {
    const Icon = window.WGIcon;
    const l = props.link;
    const inner = (
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
        {Icon && l.icon ? (
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-full)', display: 'grid', placeItems: 'center',
            background: 'var(--color-bg-primary-subtle)', color: 'var(--color-fg-neutral-default)' }}>
            <Icon n={l.icon} s={20} />
          </span>
        ) : null}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <b style={{ font: '700 16px/1.4 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>{l.label}</b>
          {l.sub ? <span style={{ font: '400 13px/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>{l.sub}</span> : null}
        </span>
      </span>
    );
    const style = { display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-bg-neutral-default)', border: '1px solid var(--color-border-default)', textDecoration: 'none',
      cursor: 'pointer', font: 'inherit', color: 'inherit', boxSizing: 'border-box' };
    return l.href
      ? <a href={l.href} className="wg-nf-card" data-nf-link={l.key} style={style}>{inner}</a>
      : <button type="button" onClick={l.onClick} className="wg-nf-card" data-nf-link={l.key} style={style}>{inner}</button>;
  }

  function WGNotFound(props) {
    const links = props.links || [];
    return (
      <div data-wg-notfound={props.realm} style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--color-bg-neutral-subtle)' }}>
        <style>{'.wg-nf-card{transition:border-color .15s}.wg-nf-card:hover,.wg-nf-card:focus-visible{border-color:var(--color-bg-primary)!important;outline:none}'}</style>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: 'clamp(24px, 6vh, 64px) 16px 48px' }}>
          {/* 光復寶寶舉著寫「404」的牌子（2026-10-18 Sucre 提供；牌子上的字是另存的 -404 版本）。
              原檔疊的陰影 PNG 不在資料夾，已拿掉那一層。alt 寫 404：牌子上的字是這張圖唯一的資訊。 */}
          {/* 2026-10-20：以圖為主 —— 光復寶寶放大、置中、會動（wg-mascot.jsx）。沒載入時退回靜態圖。 */}
          <div style={{ margin: '0 0 20px' }}>
            {window.WGMascot
              ? <window.WGMascot mood={props.mood} code={props.code} />
              : <img src={props.img || "assets/mascot/guangfu-baby-404.svg"} alt={props.alt || "404"} width="220"
                  style={{ display: 'block', width: 'clamp(180px, 48vw, 220px)', height: 'auto', margin: '0 auto' }} />}
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ font: '700 28px/1.3 var(--font-display)', margin: '0 0 12px', color: 'var(--color-fg-neutral-default)' }}>{props.title || '找不到這一頁'}</h2>
            <p style={{ font: '400 16px/1.7 var(--font-body)', margin: props.note ? '0 auto 14px' : '0 auto 28px', maxWidth: 460, color: 'var(--color-fg-neutral-subtle)' }}>{props.lead}</p>
            {props.note ? <div style={{ margin: '0 0 28px' }}>{props.note}</div> : null}
          </div>
          {links.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {links.map((l) => <NotFoundCard key={l.key} link={l} />)}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  Object.assign(window, { WGNotFound });
})();
