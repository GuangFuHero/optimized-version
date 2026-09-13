/* site-shell.jsx — 前台共用外殼（/map 與 /list 只換主畫面內容）
 * 對齊 repo：libs/modules/src/shell/site/{shell,top-navbar,sidebar,header-search-input,user-menu}.tsx */
(function () {
  const { useState, useEffect, useRef } = React;
  const { SidebarItem, Avatar, Input, Button } = window.WanGuardDesignSystem_9c8f68;
  const R = window.SiteRoute;

  const LAYOUT = { topNavBarHeight: 64, mobileTopNavBarHeight: 56, collapsedSidebarWidth: 72, expandedSidebarWidth: 240 };
  /** 各前台模組對應的頁面檔（Next 專案為 /map、/list 兩條路由）。 */
  const MODULE_PAGES = { map: '前台地圖 Site Map.html', list: '前台列表 Site List.html',
    brief: '前台行前資訊 Site Briefing.html' };
  const MODULE_META = { map: { label: '地圖', icon: 'Map' }, list: { label: '列表', icon: 'LayoutList' },
    brief: { label: '行前資訊', icon: 'BookOpen' } };

  /* 🔒 /brief 刻意**不進** R.SITE_MODULES。
   *    SITE_MODULES 是「同一份內容的兩種看法」（2026-08-22 的資訊層級 L1，高頻互切），
   *    它的路由帶著圖層／篩選／選取的標記，兩頁互切時要保留。
   *    行前資訊是另一種內容，沒有那些狀態 —— 硬塞進去會讓 createSiteHref 生出
   *    /list/... 的路徑（那支只分 map 與非 map 兩條）。所以它在側欄自成一段。 */
  const moduleHref = (target, state) => (target === 'brief'
    ? encodeURI(MODULE_PAGES.brief) + '#/brief'
    : encodeURI(MODULE_PAGES[target]) + '#' + R.createSiteHref(target, state));

  /** 事件脈絡（前台顯示用）。
   *  ⚠️ 前台跟後台顯示同一個事件短名（2026-08-16）：後台側邊欄第一行已改成事件短名，
   *     前台若還掛品牌名，同一個人跨場域時會以為是兩個系統。
   *  後台三頁載入 wg-event.js／tk-data.js 會有 window.TK_ACTIVATION；前台沒有那兩支，
   *  所以在這裡留一份 fallback。上線時兩邊都應改吃同一支事件 API。 */
  const SITE_EVENT_FALLBACK = { name: '花蓮馬太鞍溪堰塞湖專案', shortName: '花蓮馬太鞍溪' };
  const siteEvent = () => window.TK_ACTIVATION || SITE_EVENT_FALLBACK;
  /* 短名取法與後台同一套：優先共用的 wgEventShortName（前台沒載入 wg-event.js 時才自己取）。 */
  const siteEventShortName = (ev) => (window.wgEventShortName ? window.wgEventShortName(ev) : (ev.shortName || ev.name || ''));

  /* ── 前台角色切換（原型用）────────────────────────────────────────────────
   * 2026-08-22 Sucre：前台也要能像後台一樣切換角色，兩個已登入、一個未登入。
   *
   * 做法沿用後台 `wg-event.js` 的 persona 慣例，但**不共用同一個 key** ——
   * 後台的 `wg.personaId` 存的是後台人員（超管／政府／團隊管理員⋯），
   * 前台的是民眾，兩者不是同一群人，混在一起切會出現「切成超級管理員的民眾」。
   *
   * 三個 persona 刻意涵蓋三種會產生不同畫面的狀態：
   *   - 建立者：手上有自己建的任務單 → 看得到「我建立的」與刪除媒合單的入口
   *   - 志工：手上有承接紀錄 → 看得到「我承接的」與釋出名額
   *   - 訪客：未登入 → 所有寫入動作被擋、位置被遮成網格、看不到聯絡資訊
   *
   * ⚠️ 這是**原型的展示裝置**，正式版沒有這個切換器。 */
  const SITE_PERSONA_KEY = 'wg.sitePersonaId';
  const SITE_PERSONAS = [
    { id: 'usr-citizen-01', name: '王志豪', label: '民眾 · 建立者',
      hint: '有自己建立的任務單', isAuthenticated: true, platformRole: 'general_user' },
    { id: 'usr-citizen-42', name: '林佩珊', label: '民眾 · 志工',
      hint: '有承接紀錄，可釋出名額', isAuthenticated: true, platformRole: 'ngo' },
    { id: null, name: '未登入訪客', label: '未登入',
      hint: '只能看，位置被遮成概略範圍', isAuthenticated: false, platformRole: 'general_user' },
  ];
  const readSitePersona = () => {
    let stored = null;
    try { stored = localStorage.getItem(SITE_PERSONA_KEY); } catch (e) {}
    /* 未登入那筆的 id 是 null，localStorage 存不了 null，所以用字串哨兵。 */
    if (stored === 'guest') return SITE_PERSONAS[2];
    return SITE_PERSONAS.find((p) => p.id === stored) || SITE_PERSONAS[0];
  };
  const writeSitePersona = (persona) => {
    try { localStorage.setItem(SITE_PERSONA_KEY, persona.id || 'guest'); } catch (e) {}
    window.dispatchEvent(new CustomEvent('wg:site-persona', { detail: { id: persona.id } }));
  };
  /** 兩支前台 HTML 都用這支取得 session，不要各自 hardcode。 */
  function useSitePersona() {
    const [persona, setPersona] = useState(readSitePersona);
    useEffect(() => {
      const on = () => setPersona(readSitePersona());
      window.addEventListener('wg:site-persona', on);
      const onStorage = (e) => { if (e.key === SITE_PERSONA_KEY) on(); };
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener('wg:site-persona', on);
        window.removeEventListener('storage', onStorage);
      };
    }, []);
    return [
      { isAuthenticated: persona.isAuthenticated, userName: persona.name,
        userId: persona.id, platformRole: persona.platformRole, personaLabel: persona.label },
      (p) => { setPersona(p); writeSitePersona(p); },
    ];
  }

  /** 身份切換列表。原型專用，樣式刻意樸素 —— 它不是產品的一部分。
   *
   *  ⚠️ 這一版把它從「頂欄的獨立下拉」改成「使用者選單裡的一段」。
   *  原因是手機頂欄放不下：56px 高、360px 寬要塞漢堡(40) ＋ 品牌與事件短名(~110)
   *  ＋ 場域標籤(~76) ＋ 切換器(~90) ＋ 頭像(32) ＋ 四個 gap(48) ＋ padding(32)
   *  ≈ 428px。而且下拉自己 minWidth 240，靠右開會直接掉出畫面。
   *  使用者選單本來就有空間，切換身份也本來就是「使用者」這個範疇的事。 */
  function SitePersonaList({ onPicked }) {
    const [session, setPersona] = useSitePersona();
    const currentKey = session.userId || 'guest';
    return (
      <div>
        <div style={{ padding: 'var(--space-2) var(--space-3) 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <WGIcon n="FlaskConical" s={12} c="var(--color-fg-neutral-muted)" />
          <span style={{ font: '700 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>
            原型身份切換
          </span>
        </div>
        {SITE_PERSONAS.map((p) => {
          const active = (p.id || 'guest') === currentKey;
          return (
            <button key={p.id || 'guest'} type="button"
              onClick={() => { setPersona(p); if (onPicked) onPicked(); }}
              style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                padding: 'var(--space-2) var(--space-3)', minHeight: 44, cursor: 'pointer', border: 0,
                borderRadius: 'var(--radius-md)', justifyContent: 'center',
                background: active ? 'var(--color-bg-secondary-subtle)' : 'none' }}>
              {/* 13px 是上一輪整站放大時漏掉的寫死值（2026-09-11 補）。 */}
              <span style={{ font: (active ? 800 : 500) + ' var(--fs-13)/1.3 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>
                {p.label}{p.isAuthenticated ? ' · ' + p.name : ''}
              </span>
              <span style={{ font: '400 var(--fs-11)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>{p.hint}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function BrandLockup({ size = 26, showText = true, textSize = 16 }) {
    const ev = siteEvent();
    return (
      <a href={encodeURI(MODULE_PAGES.map) + '#/map'} title={ev.name}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)', textDecoration: 'none', minWidth: 0 }}>
        <img src="assets/logo/mark.svg" alt="" width={size * 1.45} height={size} style={{ display: 'block' }} />
        {showText ? (
          <span style={{ font: '700 ' + textSize + 'px/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)',
            minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {siteEventShortName(ev)}
          </span>
        ) : null}
      </a>
    );
  }

  /** 頂欄搜尋 —— 寫回路由狀態的 search，地圖與列表共用同一份過濾。 */
  function SiteHeaderSearchInput({ value, onChange }) {
    const [draft, setDraft] = useState(value || '');
    const timer = useRef(null);
    useEffect(() => { setDraft(value || ''); }, [value]);
    const commit = (next) => {
      setDraft(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onChange(next.trim()), 250);
    };
    return (
      <div style={{ width: '100%', maxWidth: 520 }}>
        <Input type="search" value={draft} placeholder="搜尋站點、任務或地點"
          aria-label="搜尋站點或任務"
          leadingIcon={<WGIcon n="Search" s={18} c="var(--color-fg-neutral-muted)" />}
          onChange={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { clearTimeout(timer.current); onChange(draft.trim()); } }} />
      </div>
    );
  }

  /* ── 前往後台 / 申請成為後台人員（IAM-FEAT-004 / IAM-PS-101、102、106）─────────
   * 兩種狀態互斥，由 render 當下持有的平台角色決定，不快取（IAM-PS-106）：
   *   有後台平台角色 → 「前往後台」，點下去後端自動換發後台憑證，使用者無感（IAM-PS-103）
   *   只有 General User → 「申請成為後台人員」，導到角色升級申請（AC-FEAT-002），不做任何跨越
   * 未登入者兩種都不顯示（IAM-PS-102 末句）。
   * 桌機放頂欄右側（UserMenu 左邊）；行動版頂欄只有 40px 塞不下，改掛在側欄抽屜底部。 */
  const ADMIN_PORTAL_HOME = '任務管理 Ticket Management.html';
  /* 🔴 2026-09-11：原本是 `'#/apply-admin'` —— 一條沒有任何東西接住的 hash。
     點下去畫面毫無變化，**而且把路由狀態洗掉**（維度與篩選都寫在 hash 裡），
     那個狀態下重整頁面會整個回到預設。改成開抽屜，不動網址。 */
  const ROLE_ELEVATION_EVENT = 'wg:site-role-elevation';
  const openRoleElevationDrawer = () => dispatchOrHandoff(ROLE_ELEVATION_EVENT, 'roleElevation');
  const BACKOFFICE_ROLES = ['super_admin', 'government', 'ngo', 'data_auditor'];
  const hasBackofficeRole = (platformRole) => BACKOFFICE_ROLES.includes(platformRole);

  /** 場域標籤：靜態，只回答「我現在在前台」。不可點，避免跟切換按鈕混淆。
   *  未登入者也顯示 —— 這是狀態資訊，不是 IAM-PS-102 管的那顆控制項。 */
  function SiteRealmBadge() {
    return (
      <span title="你目前在前台公開頁面"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 9px', flexShrink: 0,
          borderRadius: 'var(--radius-full)', background: 'var(--color-bg-neutral-sunken)',
          font: '700 var(--fs-12)/1.4 var(--font-latin)', color: 'var(--color-fg-neutral-subtle)', whiteSpace: 'nowrap' }}>
        <WGIcon n="Globe" s={12} c="var(--color-fg-neutral-muted)" />公開頁面
      </span>
    );
  }

  /* ── 請求協助（前台民眾建立任務單）──────────────────────────────────────
   * 2026-08-22 Sucre 更正：這**不是**災難報案窗口。主體是一般民眾，
   *   內容以民間互助為主 —— 清淤、送餐、陪同、修繕，也就是
   *   「政府進不了民宅、志工進得去」的那一塊。人員受困是少數情形。
   *   所以圖示與文案都不用救難語彙（原本的警笛圖示已移除）。
   *
   * 未登入時**仍然顯示**這顆按鈕，點下去才給登入提示 —— 與「修改建議」不同待遇是刻意的：
   * 修改建議是錦上添花，藏起來沒人損失；需要幫忙的人找不到入口就是找不到。
   * 擋在送出前，不擋在入口前。
   *
   * 按鈕住在 shell、抽屜住在各模組主畫面（/map 與 /list 各自管自己的狀態），
   * 兩者靠 CustomEvent 串接 —— 與 `wg-notify.jsx` 的 `wg:notify-open` 同一套做法，
   * 免得為了一顆按鈕把 props 從 HTML 一路穿到 view。
   *
   * 換字只需改這個常數與 `SiteTicketCreateDrawer` 的標題兩處。 */
  const SITE_TICKET_ENTRY_LABEL = '請求協助';
  const NEW_TICKET_EVENT = 'wg:site-new-ticket';
  /* 「我的任務」與「請求協助」同一套做法：按鈕住 shell、抽屜住各模組主畫面，靠 CustomEvent 串接。 */
  const MY_TASKS_EVENT = 'wg:site-my-tasks';
  /* ── shell 的動作怎麼落地 ────────────────────────────────────────────────
   *
   * 🔴 2026-09-11 回報「漢堡包裡面的請求協助無效」。查下去不是按鈕壞掉：
   *    **`前台行前資訊 Site Briefing.html` 沒有載入 `site-actions.jsx`**，
   *    那些抽屜（請求協助／我的任務／我回報的站點／申請成為後台人員）
   *    在那一頁根本不存在。按鈕派出事件，沒有任何東西接住 —— 完全沒反應。
   *
   * 🔒 修法不是「幫那一頁補上四支抽屜」，而是**讓所有 shell 動作都有退路**：
   *    事件改成 cancelable，接得住的頁面 `preventDefault()` 就地開抽屜；
   *    接不住的頁面自動跳到列表頁，並在那裡把同一個抽屜打開。
   *    這樣以後**任何**新頁面只要載入 shell 就不會出現死按鈕，
   *    不必記得「這一頁要不要補 site-actions.jsx」。
   *
   * 交接用 sessionStorage 不用網址參數 —— hash 就是路由本身，
   * 塞第三個參數進去會被 `useSiteRouteState` 當成路由的一部分解析。 */
  const OPEN_ON_LOAD_KEY = 'wg.site.openOnLoad';
  const dispatchOrHandoff = (eventName, handoffId) => {
    let handled = false;
    try {
      const ev = new CustomEvent(eventName, { cancelable: true });
      window.dispatchEvent(ev);
      handled = ev.defaultPrevented;
    } catch (e) {}
    if (handled) return;
    try { sessionStorage.setItem(OPEN_ON_LOAD_KEY, handoffId); } catch (e) {}
    /* 🔒 2026-09-11 Sucre：接不住的時候**跳地圖頁，不是列表頁**。
       理由不只是「地圖是首頁」：這四個動作裡最常用的是「請求協助」，
       而它第一個必填欄位就是**在地圖上標位置**。落在地圖上，
       關掉抽屜之後他人就已經在對的地方；落在列表則要再自己切過去。 */
    window.location.href = encodeURI(MODULE_PAGES.map) + '#/map';
  };
  /** 落地頁在掛載時呼叫一次：有交接就回傳該開哪一個，並清掉（只用一次）。 */
  const takeOpenOnLoad = () => {
    try {
      const v = sessionStorage.getItem(OPEN_ON_LOAD_KEY);
      if (v) sessionStorage.removeItem(OPEN_ON_LOAD_KEY);
      return v || null;
    } catch (e) { return null; }
  };

  /* 從通知點進那張任務單。做法與「我的任務」「請求協助」相同：
     按鈕住 shell，落地動作住各模組主畫面，靠 CustomEvent 串接。 */
  const OPEN_TICKET_EVENT = 'wg:site-open-ticket';
  const openSiteTicket = (id) => {
    /* 兩段式，與後台 `wg-notify.jsx` 的 deep-link 同一套：
       ① 先問本頁 —— 地圖／列表接得住就 `preventDefault()`，直接開詳情，不重新載入。
       ② 本頁接不住（例如行前資訊那一頁沒有任務清單）才跨頁到列表。
       不做第二段的話，在那些頁面按下通知會**完全沒有反應**，看起來像壞掉。 */
    let handled = false;
    try {
      const ev = new CustomEvent(OPEN_TICKET_EVENT, { detail: { id }, cancelable: true });
      window.dispatchEvent(ev);
      handled = ev.defaultPrevented;
    } catch (e) {}
    if (!handled) {
      window.location.href = encodeURI(MODULE_PAGES.list) + '#/list?selected=' + encodeURIComponent(id);
    }
  };

  /* 🔒 2026-09-11 Sucre：「加一個呀？加一個資源站點回報紀錄？」
     —— 不併進「我的任務」，另外開一個入口。理由見 site-actions.jsx 的
     StationReportsDrawer 註解：兩者是不同的東西，合併會逼著標題抽象化。 */
  const STATION_REPORTS_EVENT = 'wg:site-station-reports';
  const openStationReportsDrawer = () => dispatchOrHandoff(STATION_REPORTS_EVENT, 'stationReports');

  const openMyTasksDrawer = () => dispatchOrHandoff(MY_TASKS_EVENT, 'myTasks');
  const openNewTicketDrawer = () => dispatchOrHandoff(NEW_TICKET_EVENT, 'newTicket');

  function SiteRequestHelpButton({ variant = 'sidebar', collapsed }) {
    if (variant === 'sidebar') {
      return <SidebarItem icon={<WGIcon n="HeartHandshake" s={22} />} label={SITE_TICKET_ENTRY_LABEL}
        collapsed={collapsed} onClick={openNewTicketDrawer} />;
    }
    return (
      <Button variant="primary" size="sm" onClick={openNewTicketDrawer}
        startIcon={<WGIcon n="HeartHandshake" s={16} />} title="需要有人幫忙？在這裡說明你的需求">
        {SITE_TICKET_ENTRY_LABEL}
      </Button>
    );
  }

  function SitePortalSwitch({ isAuthenticated, platformRole, variant = 'topbar' }) {
    if (!isAuthenticated) return null;
    const canCross = hasBackofficeRole(platformRole);
    const label = canCross ? '前往後台' : '申請成為後台人員';
    const icon = canCross ? 'ArrowLeftRight' : 'BadgeCheck';
    /* 「前往後台」是跨頁，仍然是 <a>；「申請」是開抽屜，是 <button>。
       兩者長得一樣但語意不同 —— 用對元素，右鍵開新分頁與鍵盤行為才會正確。 */
    const asLink = canCross;
    const href = canCross ? encodeURI(ADMIN_PORTAL_HOME) : undefined;
    const Tag = asLink ? 'a' : 'button';
    const extra = asLink ? { href: href } : { type: 'button', onClick: openRoleElevationDrawer };

    if (variant === 'sidebar') {
      return (
        <Tag {...extra} style={{ textDecoration: 'none', display: 'block', width: '100%',
          background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <SidebarItem icon={<WGIcon n={icon} s={22} />} label={label} />
        </Tag>
      );
    }
    return (
      <Tag {...extra} title={canCross ? '前往後台（不需再次登入）' : '送出成為後台人員的申請'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 var(--space-3)',
          borderRadius: 'var(--radius-full)', textDecoration: 'none', whiteSpace: 'nowrap',
          border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)',
          font: '500 var(--fs-14)/1.2 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>
        <WGIcon n={icon} s={16} c="var(--color-fg-neutral-muted)" />{label}
      </Tag>
    );
  }

  /* 🔴 2026-09-11 Sucre：「右上角大頭照的選單文字有各種尺寸，有的還有加粗，
     應該是需要整理一下。」確實 —— 同一個下拉裡混了 400/500 兩種字重、
     1.2/1.5 兩種行高、40/44 兩種列高。每一項都是可點的同一類東西，
     長得不一樣只會讓人以為它們不一樣。
     🔒 收成**一份**樣式，所有選單列都用它。以後要加項目就套這個，不要再各寫一次。
     列高一律 44（iOS 最小可點區），字重一律 500 —— 400 在放大後的
     選單裡偏輕，700 又會跟上面的使用者名稱打架。 */
  const MENU_ROW = {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', minHeight: 44,
    padding: '0 var(--space-3)', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left',
    borderRadius: 'var(--radius-md)', color: 'var(--color-fg-neutral-default)',
    font: '500 var(--fs-14)/1.3 var(--font-body)',
  };

  function SiteUserMenu({ isAuthenticated, userName, onSignIn, onSignOut }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [open]);
    /* 未登入時仍要留一個原型身份切換的入口 ——
       否則切成「未登入訪客」之後，使用者選單整個消失，就再也切不回來了。
       用小燒瓶圖示鈕，與已登入時的選單同一份 SitePersonaList。 */
    if (!isAuthenticated) {
      return (
        <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button variant="secondary" size="sm" startIcon={<WGIcon n="LogIn" s={16} />} onClick={onSignIn}>登入</Button>
          <button type="button" aria-label="原型身份切換" aria-expanded={open} onClick={() => setOpen((v) => !v)}
            style={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', cursor: 'pointer',
              borderRadius: 'var(--radius-full)', border: '1px dashed var(--color-border-accent)',
              background: 'var(--color-bg-neutral-default)', color: 'var(--color-fg-neutral-subtle)' }}>
            <WGIcon n="FlaskConical" s={16} />
          </button>
          {open ? (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, minWidth: 240,
              maxWidth: 'calc(100vw - 32px)',
              padding: 'var(--space-2)', background: 'var(--color-bg-neutral-default)',
              border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
              <SitePersonaList onPicked={() => setOpen(false)} />
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button type="button" aria-label="使用者選單" aria-expanded={open} onClick={() => setOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 4, background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-full)' }}>
          <Avatar name={userName} size={32} tone="secondary" />
        </button>
        {open ? (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, minWidth: 240,
            maxWidth: 'calc(100vw - 32px)',
            padding: 'var(--space-2)', background: 'var(--color-bg-neutral-default)',
            border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border-default)', marginBottom: 4 }}>
              {/* 這兩行是**標頭**不是選單項，所以刻意與 MENU_ROW 不同：
                  名稱粗一階、副標細一階。它們不可點，長得一樣反而會被當成可點。 */}
              <div style={{ font: '700 var(--fs-16)/1.3 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>{userName}</div>
              <div style={{ marginTop: 2, font: '400 var(--fs-12)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>志工 · 已驗證</div>
            </div>
            <SitePersonaList onPicked={() => setOpen(false)} />
            <div style={{ height: 1, background: 'var(--color-border-default)', margin: '4px var(--space-2)' }}></div>
            {/* 我的任務：民眾在這裡追蹤自己建立的需求，以及自己答應要去的任務。
                一個入口兩個分頁，不拆成兩個選單項 —— 對同一個人這是同一件事的兩面，
                而且操作會連動（看到自己建的單有人接了，下一步常常就想看自己接了什麼）。 */}
            <button type="button" onClick={() => { setOpen(false); openMyTasksDrawer(); }}
              style={MENU_ROW}>
              <WGIcon n="ClipboardList" s={16} />我的任務
            </button>
            {/* 資源站點回報紀錄：與「我的任務」並排的第二個入口（2026-09-11）。 */}
            <button type="button" onClick={() => { setOpen(false); openStationReportsDrawer(); }}
              style={MENU_ROW}>
              <WGIcon n="ClipboardCheck" s={16} />我回報的站點
            </button>
            <div style={{ height: 1, background: 'var(--color-border-default)', margin: '4px var(--space-2)' }}></div>
            <button type="button" onClick={() => { setOpen(false); onSignOut(); }}
              style={MENU_ROW}>
              <WGIcon n="LogOut" s={16} />登出
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function SiteTopNavBar({ isAuthenticated, userName, platformRole, viewerId, search, onSearchChange, onSignIn, onSignOut }) {
    return (
      <header style={{ height: LAYOUT.topNavBarHeight, display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto',
        alignItems: 'center', columnGap: 'var(--space-6)', padding: '0 var(--space-6)',
        background: 'var(--color-bg-neutral-default)', borderBottom: '1px solid var(--color-border-default)' }}>
        {/* 左上：品牌 ＋ 場域標籤 ＋ 切換按鈕，與後台側欄場域列互為鏡像（2026-08-16）。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
          <BrandLockup />
          <SiteRealmBadge />
          <SitePortalSwitch isAuthenticated={isAuthenticated} platformRole={platformRole} />
        </div>
        <div style={{ minWidth: 0, display: 'flex', justifyContent: 'center' }}>
          <SiteHeaderSearchInput value={search} onChange={onSearchChange} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifySelf: 'end' }}>
          <SiteRequestHelpButton variant="topbar" />
          {/* 通知（2026-09-10）。未載入 site-notify.jsx 的頁面不會壞掉，只是沒有鈴鐺。
              位置在人名選單左邊，與後台頂欄同一個位置 —— 兩邊的人是同一批。 */}
          {window.SiteNotifyBell ? <window.SiteNotifyBell viewerId={viewerId} onOpenTicket={openSiteTicket} /> : null}
          <SiteUserMenu isAuthenticated={isAuthenticated} userName={userName} onSignIn={onSignIn} onSignOut={onSignOut} />
        </div>
      </header>
    );
  }

  function SiteMobileTopNavBar({ onMenuClick, isAuthenticated, userName, viewerId, search, onSearchChange, onSignIn, onSignOut }) {
    /* 搜尋在手機是**展開式**：平常只佔一顆 44px 的圖示鈕，按下才換成整列輸入框。
     *
     * ⚠️ 先前手機**完全沒有搜尋** —— `SiteHeaderSearchInput` 只掛在桌機的 SiteTopNavBar，
     *    手機頂欄從來沒有它（2026-08-22 回報）。這不是被我改掉的，是一直就缺。
     *
     * 為什麼不常駐一個輸入框：56px × 360px 的頂欄要同時放漢堡、品牌、搜尋、使用者選單，
     * 常駐輸入框會把品牌與事件短名擠掉 —— 而「我在看哪一個災害事件」比搜尋更需要隨時看得到。
     * 依 2026-08-22 的資訊層級，搜尋是 L2（收斂），與篩選同級，不是 L0/L1。 */
    const [searchOpen, setSearchOpen] = useState(false);
    const inputRef = useRef(null);
    useEffect(() => {
      if (searchOpen && inputRef.current) {
        const el = inputRef.current.querySelector('input');
        if (el) el.focus();
      }
    }, [searchOpen]);

    const barStyle = {
      height: LAYOUT.mobileTopNavBarHeight, display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: '0 var(--space-3)', background: 'var(--color-bg-neutral-default)',
      borderBottom: '1px solid var(--color-border-default)',
    };
    const iconBtn = {
      width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'none', border: 0,
      cursor: 'pointer', borderRadius: 'var(--radius-full)', color: 'var(--color-fg-neutral-default)',
    };

    /* 展開態：整列讓給搜尋，只留一顆返回。
       關掉時一併清空關鍵字 —— 收起搜尋卻還在被過濾，是使用者最容易困惑的狀態。 */
    if (searchOpen) {
      return (
        <header style={barStyle}>
          <button type="button" aria-label="關閉搜尋"
            onClick={() => { setSearchOpen(false); if (search) onSearchChange(''); }} style={iconBtn}>
            <WGIcon n="ArrowLeft" s={22} />
          </button>
          <div ref={inputRef} style={{ flex: 1, minWidth: 0 }}>
            <SiteHeaderSearchInput value={search} onChange={onSearchChange} />
          </div>
        </header>
      );
    }

    return (
      <header style={barStyle}>
        <button type="button" aria-label="開啟選單" onClick={onMenuClick} style={iconBtn}>
          <WGIcon n="Menu" s={22} />
        </button>
        {/* ⚠️ 手機頂欄只放四樣：漢堡、品牌、搜尋、使用者選單。
            場域標籤移到側欄抽屜、身份切換移進使用者選單 ——
            56px × 360px 塞不下更多。 */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <BrandLockup size={22} textSize={15} />
        </div>
        <button type="button" aria-label="搜尋" onClick={() => setSearchOpen(true)}
          style={{ ...iconBtn, color: search ? 'var(--color-brand-primary-subtle)' : 'var(--color-fg-neutral-default)' }}>
          <WGIcon n={search ? 'SearchCheck' : 'Search'} s={20} />
        </button>
        {/* 手機頂欄現在有五樣：漢堡、品牌、搜尋、通知、人名。
            品牌那格是 `minWidth: 0` 的彈性欄，所以擠得下（390px 已實測）。 */}
        {window.SiteNotifyBell ? <window.SiteNotifyBell viewerId={viewerId} onOpenTicket={openSiteTicket} /> : null}
        <div style={{ flexShrink: 0 }}>
          <SiteUserMenu isAuthenticated={isAuthenticated} userName={userName} onSignIn={onSignIn} onSignOut={onSignOut} />
        </div>
      </header>
    );
  }

  /** 手機的浮動主動作。
   *
   *  「請求協助」是這個平台對民眾存在的理由，手機上不該藏在漢堡選單裡 ——
   *  需要幫忙的人多按一下就是多一次放棄的機會。桌機有頂欄那顆，所以 FAB 只在手機出現。
   *
   *  位置：右下角，拇指區。避開 Leaflet 的縮放控制（左上）與圖層面板。
   *  `env(safe-area-inset-bottom)` 讓它不會被 iPhone 的 home indicator 壓到。 */
  function SiteMobileHelpFab() {
    /* 地圖頁的底部控制列自己有一顆「請求協助」，那時就不要再畫浮動按鈕 ——
       兩顆同樣的主動作同時出現，而且位置一定會撞。列表頁沒有底部列，才需要這顆。 */
    const [suppressed, setSuppressed] = useState(() => Boolean(window.WG_SITE_OWN_HELP_ACTION));
    useEffect(() => {
      const on = () => setSuppressed(Boolean(window.WG_SITE_OWN_HELP_ACTION));
      window.addEventListener('wg:site-help-action', on);
      on();
      return () => window.removeEventListener('wg:site-help-action', on);
    }, []);
    if (suppressed) return null;
    return (
      <button type="button" onClick={openNewTicketDrawer} aria-label={SITE_TICKET_ENTRY_LABEL}
        /* `--wg-map-bottom-bar` 由地圖頁設定（見 site-map.jsx）——
           地圖頁底部有控制列要讓開，列表頁沒有就是 0。
           先前寫死 bottom:16，結果跟 Leaflet 的縮放控制與版權列疊在同一個角落。 */
        style={{ position: 'fixed', right: 'var(--space-4)',
          bottom: 'calc(var(--space-4) + var(--wg-map-bottom-bar, 0px) + env(safe-area-inset-bottom, 0px))',
          zIndex: 110, maxWidth: 'calc(100vw - 32px)',
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
          /* 🔴 2026-09-06 修：原本寫 var(--space-5)，而 DS 的間距刻度**跳過 5**
             （1/2/3/4/6/8/12/16/20/24）。CSS 對未定義的 var() 不報錯、只是整條宣告失效
             → 這顆手機版「請求協助」FAB 的左右內距一直是 0，圖示與文字貼著邊。
             與 2026-08-29 緊急公告那次爆版是同一個坑。 */
          height: 52, padding: '0 var(--space-4)', borderRadius: 'var(--radius-full)', border: 0, cursor: 'pointer',
          background: 'var(--color-bg-primary)', color: 'var(--color-fg-on-primary)',
          boxShadow: 'var(--shadow-lg)', font: '700 var(--fs-15)/1.2 var(--font-body)' }}>
        <WGIcon n="HeartHandshake" s={20} />{SITE_TICKET_ENTRY_LABEL}
      </button>
    );
  }

  /** 前台側欄：模組選項為地圖 / 列表，連結帶上現有狀態（切換時保留篩選與詳情）。 */
  function SiteSidebar({ module, state, open, width, collapsedWidth, isAuthenticated, platformRole, showPortalSwitch, onSignIn, headerContent, showCloseButton, onClose }) {
    const collapsed = !open && collapsedWidth != null;
    return (
      <nav aria-label="前台模組" style={{ width: width || (open ? LAYOUT.expandedSidebarWidth : collapsedWidth), height: '100%',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-3)',
        background: 'var(--color-bg-neutral-default)', borderRight: '1px solid var(--color-border-default)',
        boxShadow: open && collapsedWidth != null ? 'var(--shadow-md)' : 'none', overflow: 'hidden',
        transition: 'width var(--transition-base)' }}>
        {headerContent ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', paddingBottom: 'var(--space-4)' }}>
            {headerContent}
            {showCloseButton ? (
              <button type="button" aria-label="關閉選單" onClick={onClose}
                style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'none', border: 0,
                  cursor: 'pointer', borderRadius: 'var(--radius-full)', color: 'var(--color-fg-neutral-subtle)' }}>
                <WGIcon n="X" s={20} />
              </button>
            ) : null}
          </div>
        ) : null}
        {!collapsed ? (
          <div style={{ padding: '0 var(--space-2) var(--space-1)', font: '700 var(--fs-11)/1.4 var(--font-latin)',
            letterSpacing: '.08em', color: 'var(--color-fg-neutral-muted)' }}>檢視模式</div>
        ) : null}
        {R.SITE_MODULES.map((target) => (
          <a key={target} href={moduleHref(target, state)} style={{ textDecoration: 'none', display: 'block' }}>
            <SidebarItem icon={<WGIcon n={MODULE_META[target].icon} s={22} />} label={MODULE_META[target].label}
              active={target === module} collapsed={collapsed} />
          </a>
        ))}

        {/* 行前資訊（VB-FEAT-001）自成一段，不混進「檢視模式」——
            地圖與列表是同一份內容的兩種看法，行前資訊是另一種內容。
            並排會讓人以為切過去還是在看同一批任務。 */}
        <div style={{ height: 1, background: 'var(--color-border-default)', margin: 'var(--space-2) var(--space-2)' }}></div>
        {!collapsed ? (
          <div style={{ padding: '0 var(--space-2) var(--space-1)', font: '700 var(--fs-11)/1.4 var(--font-latin)',
            letterSpacing: '.08em', color: 'var(--color-fg-neutral-muted)' }}>出發前</div>
        ) : null}
        <a href={moduleHref('brief', state)} style={{ textDecoration: 'none', display: 'block' }}>
          <SidebarItem icon={<WGIcon n={MODULE_META.brief.icon} s={22} />} label={MODULE_META.brief.label}
            active={module === 'brief'} collapsed={collapsed} />
        </a>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* 請求協助在行動版頂欄同樣塞不下，掛側欄第一順位（桌機由頂欄負責）。 */}
          <SiteRequestHelpButton variant="sidebar" collapsed={collapsed} />
          {/* 行動版頂欄放不下切換按鈕，改掛這裡（桌機由頂欄負責，不重複出現）。 */}
          {showPortalSwitch ? (
            <React.Fragment>
              <div style={{ height: 1, background: 'var(--color-border-default)', margin: '0 var(--space-2)' }}></div>
              <SitePortalSwitch isAuthenticated={isAuthenticated} platformRole={platformRole} variant="sidebar" />
            </React.Fragment>
          ) : null}
          {!isAuthenticated ? (
            <SidebarItem icon={<WGIcon n="LogIn" s={22} />} label="登入" collapsed={collapsed} onClick={onSignIn} />
          ) : null}
        </div>
      </nav>
    );
  }

  /**
   * 前台外殼：單一 responsive layout。桌機側欄 hover 展開；行動版改抽屜。
   * children 為各模組主畫面（/map 或 /list）。
   */
  function SiteShell({ module, state, search, onSearchChange, isAuthenticated, userName, platformRole = 'general_user', onSignIn, onSignOut, children }) {
    const [desktopOpen, setDesktopOpen] = useState(false);
    /* 通知要知道「現在是誰」。呼叫端（兩支 HTML）只傳了 isAuthenticated / userName，
       沒有 userId —— 與其改動兩支 HTML 的介面，這裡直接讀同一份 persona 來源。
       `useSitePersona` 是同一個 store，不會出現兩個不同步的身份。 */
    const [shellSession] = useSitePersona();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
      const mq = window.matchMedia('(max-width: 767px)');
      const onChange = () => setIsMobile(mq.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }, []);

    const sidebarWidth = desktopOpen ? LAYOUT.expandedSidebarWidth : LAYOUT.collapsedSidebarWidth;

    return (
      /* 2026-08-29：外面多包一層直向 flex，第一列是前台全站橫幅（EA-FEAT-001）。
         grid 原本的 height:'100dvh' 改成 flex:1 + minHeight:0 —— 橫幅出現時整個
         版面往下推，內容區自己的捲動位置不變（EA-AB-145）。
         an-banner.jsx 未載入時整段不 render，還沒改 script 標籤的頁面不會壞掉。 */
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {window.WGAnnounceBanner ? <window.WGAnnounceBanner realm="site" /> : null}
      <div style={{ position: 'relative', isolation: 'isolate', display: 'grid', flex: 1, minHeight: 0,
        gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : LAYOUT.collapsedSidebarWidth + 'px minmax(0,1fr)',
        gridTemplateRows: (isMobile ? LAYOUT.mobileTopNavBarHeight : LAYOUT.topNavBarHeight) + 'px minmax(0,1fr)',
        background: 'var(--color-bg-neutral-subtle)' }}>
        <div style={{ gridColumn: '1 / -1', gridRow: 1, position: 'relative', zIndex: 3 }}>
          {isMobile ? (
            <SiteMobileTopNavBar onMenuClick={() => setDrawerOpen(true)} isAuthenticated={isAuthenticated}
              userName={userName} viewerId={shellSession.userId} search={search} onSearchChange={onSearchChange}
              onSignIn={onSignIn} onSignOut={onSignOut} />
          ) : (
            <SiteTopNavBar isAuthenticated={isAuthenticated} userName={userName} platformRole={platformRole}
              viewerId={shellSession.userId} search={search}
              onSearchChange={onSearchChange} onSignIn={onSignIn} onSignOut={onSignOut} />
          )}
        </div>

        {!isMobile ? (
          <div onMouseEnter={() => setDesktopOpen(true)} onMouseLeave={() => setDesktopOpen(false)}
            onFocusCapture={() => setDesktopOpen(true)}
            onBlurCapture={(e) => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDesktopOpen(false); }}
            style={{ gridColumn: 1, gridRow: 2, position: 'relative', zIndex: 2 }}>
            <div style={{ position: 'absolute', inset: '0 auto 0 0', width: sidebarWidth, height: '100%', transition: 'width var(--transition-base)' }}>
              <SiteSidebar module={module} state={state} open={desktopOpen} collapsedWidth={LAYOUT.collapsedSidebarWidth}
                isAuthenticated={isAuthenticated} platformRole={platformRole} onSignIn={onSignIn} />
            </div>
          </div>
        ) : null}

        <main style={{ gridColumn: isMobile ? 1 : 2, gridRow: 2, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden', zIndex: 0 }}>
          {children}
        </main>
        {/* 手機主動作：不讓「請求協助」被埋進漢堡選單。
            🔴 2026-09-11：漢堡**開著的時候要收起來** —— 它是 fixed 浮層，
            會直接蓋在選單的「申請成為後台人員」那一列上，而且選單裡本來就有
            一顆「請求協助」。同一個動作在同一個畫面出現兩顆，近的那顆還蓋住別人。 */}
        {isMobile && !drawerOpen ? <SiteMobileHelpFab /> : null}

        {isMobile && drawerOpen ? (
          /* 從緊急公告下方開始，不蓋掉它（2026-09-10）。--wg-banner-h 由 an-banner.jsx 寫入，沒有公告時是 0px。 */
          <div style={{ position: 'fixed', top: 'var(--wg-banner-h, 0px)', left: 0, right: 0, bottom: 0, zIndex: 90 }}>
            <div onClick={() => setDrawerOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.42)' }}></div>
            <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 'min(320px, calc(100vw - 40px))', animation: 'wgSlideIn var(--duration-base) var(--ease-out)' }}>
              <SiteSidebar module={module} state={state} open width="100%" isAuthenticated={isAuthenticated}
                platformRole={platformRole} showPortalSwitch
                onSignIn={onSignIn} showCloseButton onClose={() => setDrawerOpen(false)}
                headerContent={<BrandLockup size={24} textSize={18} />} />
            </div>
          </div>
        ) : null}
      </div>
      </div>
    );
  }

  Object.assign(window, {
    SiteRequestHelpButton, SiteMobileHelpFab, OPEN_TICKET_EVENT, openSiteTicket,
    STATION_REPORTS_EVENT, openStationReportsDrawer,
    ROLE_ELEVATION_EVENT, openRoleElevationDrawer, takeOpenOnLoad, SitePersonaList, useSitePersona, SITE_PERSONAS, NEW_TICKET_EVENT, openNewTicketDrawer, SITE_TICKET_ENTRY_LABEL, MY_TASKS_EVENT, openMyTasksDrawer, SiteShell, SiteSidebar, SiteTopNavBar, SiteHeaderSearchInput, SitePortalSwitch, SiteRealmBadge, BrandLockup, SITE_LAYOUT: LAYOUT, MODULE_PAGES });
})();
