/* site-notify.jsx — 前台通知（鈴鐺 ＋ 收件匣抽屜）
 *
 * 🔴 起點：2026-09-10 Sucre「後台有通知功能，前台應該也要有。」
 *
 * 🔒 2026-09-10 裁示：**只有兩條通知，其他都不考慮**
 *     ① 建立任務的人 —— 有人接了會收到通知，**而且要知道是誰接的**
 *     ② 承接任務的人 —— 那筆任務有異動也會通知他
 *
 * 🚨 **2026-09-11 覆蓋上面那條：第三種通知加進來了。**
 *     Sucre 原話：「審核結果成功前台要通知，失敗前台也要通知。」
 *     ③ **角色升級申請的結果**（通過／未通過），見 AC-FEAT-002。
 *
 *     這是**明確的覆蓋，不是偷加**。為什麼它站得住：
 *     09-10 那條的判準是「只通知**對我個人的事**，廣播走緊急公告」——
 *     審核結果正是對我個人的事（而且是我自己送出的申請），符合同一條判準。
 *     當時沒有列入，是因為那一輪根本還沒做角色升級申請。
 *     🔒 但**判準沒有放寬**：任何「跟大家都有關」的東西仍然不准進收件匣。
 *
 * 為什麼前台通知不能沿用後台那一套（`js/admin/shell/wg-notify.jsx`）：
 *   - 後台的三種通知是**工作分派**（任務進度／資料審核結果／角色升級結果），
 *     收件人是「負責這件事的人」。
 *   - 前台的兩種是**對我個人的承諾狀態**：我求助的事有沒有人要來、
 *     我答應要去的事還算不算數。這兩件事沒有一件在後台那三種裡面。
 *   兩邊的資料來源也不同（後台讀 mock 通知陣列，前台從 `WGBridge` 的承接事件長出來）。
 *
 * 🚨 **後端一片空白**：ERD 27 張表裡沒有任何一張跟通知有關，只有 `announcements`
 *    那張廣播用的橫幅表。這一支跟後台那一支一樣，都是原型自己用 localStorage 造的。
 *    正式版要開新表，見交付前阻斷清單。
 *
 * 🔒 通知與緊急公告**不可以混**（2026-09-06 裁示 C-2）：
 *    公告是廣播、通知是針對你個人的事。混在一起兩種都會變鈍。
 *    所以緊急公告走 `an-banner.jsx` 的紅色橫幅，永遠不進這個收件匣。
 */
(function () {
  const { useState, useMemo, useCallback } = React;
  const { Badge } = window.WanGuardDesignSystem_9c8f68;
  const Bridge = window.WGBridge;

  const KIND_META = {
    claimed:     { icon: 'HandHeart',   tone: 'var(--color-brand-secondary-subtle)' },
    'need-full': { icon: 'CircleCheck', tone: 'var(--color-fg-success)' },
    closed:      { icon: 'CircleSlash', tone: 'var(--color-fg-danger)' },
    /* ③ 角色升級申請的結果（2026-09-11 覆蓋「只有兩條」）。
       通過用 success、未通過用中性灰 —— **不用 danger**。
       被拒不是錯誤，他原本的權限一項都沒有少；用紅色會讓人以為出事了。 */
    'role-approved': { icon: 'BadgeCheck', tone: 'var(--color-fg-success)' },
    'role-rejected': { icon: 'BadgeX',     tone: 'var(--color-fg-neutral-subtle)' },
  };

  /* ── 原型的種子通知 ─────────────────────────────────────────────────────
   *
   * 🚨 **內容全部是我編的**（2026-09-10 Sucre：「通知要有假資料」）。
   *    人名取自既有的 persona，任務單編號與需求名稱取自 `site-data.js` 的
   *    mock —— 不自己造 `T-24xx` 這種對不到的號碼，否則點下去會開不出東西。
   *    這是 2026-08-08 後台通知那次記過的教訓，同一個坑不要再踩一次。
   *
   * 🔒 只種**這兩條裁示涵蓋的類型**（有人承接／承接的單有異動）。
   *    種第三種等於在畫面上先斬後奏地示範一個沒有裁示過的功能。
   *
   * 只在**該使用者一則都沒有**的時候種一次，之後真的通知會疊在上面。
   * 種子的時間戳刻意是過去的，且 `read` 一新一舊 —— 未讀與已讀兩種樣式都要看得到。 */
  const NOTICE_SEEDS = {
    'usr-citizen-01': [
      { kind: 'claimed', ticketId: 'tk-4031', taskId: 'K-4031-1', read: false,
        title: '林佩珊 承接了你的「分送志工（3 人一組）」',
        body: '大進村獨居長者物資配送　目前 2/6 人' },
      { kind: 'claimed', ticketId: 'tk-4008', taskId: 'K-4008-1', read: true,
        title: '陳彥廷 承接了你的「破壞剪操作」',
        body: '中正路倒塌圍籬移除　目前 2/2 人，已經滿了' },
    ],
    'usr-citizen-42': [
      { kind: 'need-full', ticketId: 'tk-4022', taskId: 'K-4022-1', read: false,
        title: '「堤岸清淤人力」已經湊齊人了',
        body: '馬太鞍溪堤岸清淤　你仍然在名單上，時間到請照常前往。' },
      { kind: 'closed', ticketId: 'tk-3975', taskId: 'K-3975-1', read: true,
        title: '你承接的「現場警戒」已經取消',
        body: '大平村電線桿傾倒通報　建立者關閉了這張單，不用前往了。' },
    ],
  };
  function seedNoticesOnce(viewerId) {
    if (!viewerId) return;
    const seeds = NOTICE_SEEDS[viewerId];
    if (!seeds || Bridge.readNoticesFor(viewerId).length) return;
    /* `pushNotice` 是往前塞的，所以要**倒著推**，讀出來才是陣列上的順序。
       時間戳則要照**原本的順序**算 —— 排在前面的是比較新的那一則。
       兩者搞混的話會出現「上面那則比下面那則舊」，看起來像壞掉。 */
    seeds.map((seed, j) => ({ seed, ageH: (j + 1) * 3.5 })).reverse().forEach(({ seed, ageH }) => {
      const at = new Date(Date.now() - ageH * 3600 * 1000);
      Bridge.pushNotice({
        ...seed, to: viewerId,
        at: Bridge.stamp(at), atISO: at.toISOString(),
        dedupeKey: 'seed:' + viewerId + ':' + seed.ticketId + '#' + seed.taskId,
      });
    });
  }

  /** 收件匣的資料。`viewerId` 為 null（未登入）時永遠是空的 ——
   *  未登入的人沒有「我建立的／我承接的」，也就沒有任何對他個人的事。 */
  function useSiteNotices(viewerId) {
    const version = Bridge.useBridgeVersion();
    React.useEffect(() => { seedNoticesOnce(viewerId); }, [viewerId]);
    const notices = useMemo(() => Bridge.readNoticesFor(viewerId), [viewerId, version]);
    const unread = notices.filter((n) => !n.read).length;
    const markAllRead = useCallback(() => Bridge.markNoticesRead(viewerId), [viewerId]);
    return { notices, unread, markAllRead };
  }

  /** 鈴鐺。桌機與手機頂欄共用同一顆。 */
  function SiteNotifyBell({ viewerId, onOpenTicket }) {
    const [open, setOpen] = useState(false);
    const { notices, unread, markAllRead } = useSiteNotices(viewerId);

    /* 未登入不顯示鈴鐺。
       不是「顯示但點了叫他登入」—— 那會讓人以為自己有未讀的東西被鎖住，
       而事實是根本沒有任何東西是給他的（同 08-17 D-3「乾淨切」的原則）。 */
    if (!viewerId) return null;

    /* 🔒 打開清單就把徽章清掉，但**不動每一則的已讀狀態**。
       這是後台 `wg-notify.jsx` 既有的行為（規則 IAM-UP-104），兩邊要一致：
       徽章回答「有沒有新的」，逐則的粗體回答「這一則我看過了沒」。 */
    const openList = () => { setOpen(true); };

    return (
      <React.Fragment>
        <button type="button" onClick={openList} aria-label={'通知' + (unread ? '，' + unread + ' 則未讀' : '')}
          style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-full)',
            color: 'var(--color-fg-neutral-subtle)' }}>
          <WGIcon n="Bell" s={20} />
          {unread ? (
            <span aria-hidden="true" style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16,
              padding: '0 4px', display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-full)',
              background: 'var(--color-bg-danger)', color: 'var(--color-fg-on-primary)',
              font: '700 var(--fs-10)/1 var(--font-data)' }}>{unread > 9 ? '9+' : unread}</span>
          ) : null}
        </button>
        {open ? (
          <SiteNotifyDrawer notices={notices} onClose={() => setOpen(false)}
            onMarkAllRead={markAllRead}
            onOpenTicket={(id) => { setOpen(false); if (onOpenTicket) onOpenTicket(id); }} />
        ) : null}
      </React.Fragment>
    );
  }

  function SiteNotifyDrawer({ notices, onClose, onMarkAllRead, onOpenTicket }) {
    const unread = notices.filter((n) => !n.read).length;
    return (
      <WGPortal>
        <div style={{ position: 'fixed', top: 'var(--wg-banner-h, 0px)', left: 0, right: 0, bottom: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}
          role="dialog" aria-modal="true" aria-label="通知">
          <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.42)' }}></div>
          {/* ⚠️ padding 一律走 DS 的間距刻度 `1/2/3/4/6/8/12/16/20/24` —— **沒有 5**。
              `var(--space-5)` 不存在，CSS 對未定義的 var() 不報錯、只是靜默失效，
              padding 會變成 0、文字整個貼著螢幕邊緣（2026-09-05 與 09-06 各抓到一次）。
              底部另外補 safe-area，否則在 iPhone 上最後一列壓在 home indicator 下面。 */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column',
            width: 'min(420px, 100vw)', height: '100%', background: 'var(--color-bg-neutral-default)',
            boxShadow: 'var(--shadow-lg)', animation: 'wgSlideIn var(--duration-base) var(--ease-out)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
              padding: 'var(--space-6) var(--space-4) var(--space-4)',
              borderBottom: '1px solid var(--color-border-default)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 var(--fs-20)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>通知</div>
                <div style={{ marginTop: 4, font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
                  有人承接你的需求、你承接的任務有異動、申請審核有結果，都會出現在這裡。
                </div>
              </div>
              <button type="button" aria-label="關閉通知" onClick={onClose}
                style={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'none',
                  border: 0, cursor: 'pointer', borderRadius: 'var(--radius-full)', color: 'var(--color-fg-neutral-subtle)' }}>
                <WGIcon n="X" s={20} />
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              padding: 'var(--space-4) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom, 0px))' }}>
              {notices.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-8) var(--space-4)', textAlign: 'center' }}>
                  <span style={{ color: 'var(--color-fg-neutral-muted)' }}><WGIcon n="BellOff" s={28} /></span>
                  <span style={{ font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
                    目前沒有通知。有人承接你建立的需求、你承接的任務有異動，或申請有結果時，這裡會出現。
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {unread ? (
                    <button type="button" onClick={onMarkAllRead}
                      style={{ alignSelf: 'flex-end', background: 'none', border: 0, cursor: 'pointer',
                        font: '500 var(--fs-12)/1.4 var(--font-body)', color: 'var(--color-brand-secondary-default)' }}>
                      全部標為已讀
                    </button>
                  ) : null}
                  {notices.map((n) => {
                    const meta = KIND_META[n.kind] || { icon: 'Bell', tone: 'var(--color-fg-neutral-subtle)' };
                    return (
                      <button key={n.id} type="button"
                        onClick={() => { if (n.ticketId) onOpenTicket(n.ticketId); }}
                        style={{ display: 'flex', gap: 'var(--space-3)', width: '100%', textAlign: 'left',
                          padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                          border: '1px solid var(--color-border-default)',
                          background: n.read ? 'transparent' : 'var(--color-bg-neutral-subtle)' }}>
                        <span style={{ marginTop: 2, flexShrink: 0, color: meta.tone }}><WGIcon n={meta.icon} s={18} /></span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', font: (n.read ? 500 : 700) + ' var(--fs-14)/1.5 var(--font-body)',
                            color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>{n.title}</span>
                          <span style={{ display: 'block', marginTop: 2, font: '400 var(--fs-13)/1.6 var(--font-body)',
                            color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>{n.body}</span>
                          {/* 角色升級那兩種沒有單號，不要印出 "null · 09/11"。 */}
                          <span style={{ display: 'block', marginTop: 4, font: '400 var(--fs-11)/1.4 var(--font-data)',
                            color: 'var(--color-fg-neutral-muted)' }}>{n.ticketId ? n.ticketId + ' · ' : ''}{n.at}</span>
                        </span>
                        {!n.read ? <Badge tone="warning" variant="subtle">新</Badge> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </WGPortal>
    );
  }

  Object.assign(window, { SiteNotifyBell, useSiteNotices });
})();
