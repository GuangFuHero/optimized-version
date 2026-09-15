/* site-list.jsx — /list 主畫面
 * 對齊 repo：libs/modules/src/list/{site-list-view,site-list-row}.tsx
 * 與 /map 共用路由狀態、篩選邏輯與詳情面板。 */
(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const { Badge, Button } = window.WanGuardDesignSystem_9c8f68;
  const R = window.SiteRoute;
  const D = window.SiteData;
  const PAGE_SIZE = 6;

  /** 分頁取數（對應 usePaginatedRescueMapMarkers；正式版由 urql connection 分頁驅動）。 */
  /* TM-FEAT-003 AC-04：`List, single-item, nested, mutation-response, export, and
   * other Task paths apply the same guest boundary.`
   * → /list 跟 /map 走的必須是同一道邊界，不能只遮地圖。 */
  function usePaginatedRescueMapMarkers(state, isAuthenticated) {
    /* 自己送出新單後要立刻重查，否則要等下次篩選變動才看得到自己那一筆。 */
    const bridgeVersion = window.WGBridge.useBridgeVersion();
    const [pages, setPages] = useState(1);
    const [snapshot, setSnapshot] = useState({ markers: [], isFetching: true, hasNextPage: false, totalCount: 0 });
    const [dismissed, setDismissed] = useState([]);
    const subSignature = (state.subDataTypes || []).join('|');
    /* 🔴 2026-09-04：**搜尋時不能只搜「已載入的那一頁」。**
       先前分頁（一次 6 筆）發生在資料層，搜尋卻在載入之後才過濾 ——
       打「醫」的時候，那筆「隨行醫護（EMT）」排在第 7 筆還沒被撈進來，
       畫面就顯示「沒有符合條件的資料」。對只會醫療的志工來說，
       這比沒有搜尋更糟：他會以為現場不需要他。
       → 有搜尋詞時整份撈回來再過濾。正式版走後端全文檢索，不會有這個問題。 */
    const term = (state.search || '').trim();
    useEffect(() => { setPages(1); }, [state.dataType, subSignature, term]);
    useEffect(() => {
      let cancelled = false;
      setSnapshot((cur) => ({ ...cur, isFetching: true }));
      const timer = setTimeout(() => {
        if (cancelled) return;
        const result = D.queryMarkers({
          dataType: state.dataType || R.SITE_FALLBACK_DATA_TYPE,
          /* ⚠️ 這兩個參數先前漏傳，導致 /list 與 /map 吃同一份 mock 卻**看到不同的集合** ——
             使用者在地圖篩了「供水站」，切到列表卻是全部站點（2026-08-22 回報）。
             兩頁共用同一份路由狀態，查詢參數就必須一致。 */
          stationType: R.singleStationType(state), ticketStatus: R.singleTicketStatus(state),
          skip: 0, limit: term ? 500 : PAGE_SIZE * pages, isAuthenticated,
        });
        setSnapshot({
          markers: result.items, isFetching: false,
          hasNextPage: result.pageInfo.hasNextPage, totalCount: result.pageInfo.totalCount,
        });
      }, 220);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [state.dataType, subSignature, pages, term, isAuthenticated, bridgeVersion]);
    const markers = useMemo(() => snapshot.markers.filter((m) => !dismissed.includes(m.id)), [snapshot.markers, dismissed]);
    return {
      markers, isFetching: snapshot.isFetching, hasNextPage: snapshot.hasNextPage, totalCount: snapshot.totalCount,
      loadNextPage: useCallback(() => setPages((p) => p + 1), []),
      dismissMarker: useCallback((id) => setDismissed((cur) => [...cur, id]), []),
    };
  }

  const rowActionStyle = (tone) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 14px',
    cursor: tone === 'disabled' ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-full)',
    border: '1px solid ' + (tone === 'danger' ? 'var(--color-bg-danger)' : tone === 'disabled' ? 'var(--color-border-default)' : 'var(--color-border-default)'),
    background: tone === 'disabled' ? 'var(--color-bg-disable)' : 'var(--color-bg-neutral-default)',
    color: tone === 'danger' ? 'var(--color-fg-danger)' : tone === 'disabled' ? 'var(--color-fg-disable)' : 'var(--color-brand-secondary-subtle)',
    font: '700 var(--fs-12)/1.2 var(--font-latin)', whiteSpace: 'nowrap',
    transition: 'background var(--transition-fast), border-color var(--transition-fast)',
  });

  function RowAction({ icon, label, tone, onClick, disabled }) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
        style={rowActionStyle(disabled ? 'disabled' : tone)}>
        <WGIcon n={icon} s={14} />{label}
      </button>
    );
  }

  /* 一張卡片＝一張任務單，卡片裡是它的每一筆需求（2026-09-05 Sucre）。
   *
   * 為什麼從「一筆需求一張卡」改成「同一張單的需求收在同一張卡」：
   *   前一版每一筆需求都重複一次任務單標題與地址 —— 兩筆需求就把
   *   「馬太鞍溪堤岸清淤 · 堤岸缺口淤泥約 60 公尺…」印兩次。
   *   手機一屏只有 5～6 個資訊塊，重複的抬頭吃掉的正是志工要掃的東西。
   *   **承接仍然是需求層的動作**（每一筆自己一顆按鈕），只是抬頭不再重複。
   *
   * 🔒 密度規則（現場都是手機，2026-09-05 Sucre：「篇幅的設計距離很重要，
   *    減少間隙又不要減少到看起來很不舒服的剛剛好」）：
   *      卡片間距   8px（原 12）
   *      卡片內距   12/14px（原 16）
   *      需求列高   單列 8px 上下內距 ＋ 1px 分隔線，不用巢狀方框
   *      觸控目標   按鈕 32px 高、命中區補到 44px（低於這個在晃動的車上按不到）
   *    ⚠️ 可以再擠的地方是**留白**，不是**觸控目標**。把按鈕縮到 28px 以下，
   *       畫面會更漂亮而現場更難用。
   */
  const NEED_KIND_META = {
    rescue: { label: '搜救', icon: 'LifeBuoy' },
    hr: { label: '人力', icon: 'Users' },
    supply: { label: '物資', icon: 'Package' },
  };

  function NeedLine({ marker, task, state, isAuthenticated, viewerId, compact, onClaim, divider }) {
    const meta = NEED_KIND_META[task.kind] || NEED_KIND_META.hr;
    const mine = Boolean(viewerId) && (state.claimedBy || []).indexOf(viewerId) !== -1;
    const full = state.status === 'matched';
    const removed = state.status === 'deleted';
    const left = Math.max(0, state.required - state.matched);
    const pct = state.required ? Math.min(100, Math.round((state.matched / state.required) * 100)) : 0;
    const disabled = !isAuthenticated || full || removed || mine;
    const label = removed ? '已刪除' : mine ? '已承接' : full ? '已滿' : !isAuthenticated ? '登入後接' : '接這筆';

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: '8px 0', borderTop: divider ? '1px solid var(--color-border-default)' : 'none',
        opacity: removed ? 0.55 : 1 }}>
        <span style={{ flexShrink: 0, color: 'var(--color-fg-neutral-muted)', display: 'inline-flex' }}>
          <WGIcon n={meta.icon} s={16} />
        </span>

        {/* 桌機把文字欄收在 460px 內：卡片寬 880 時，數字被推到最右邊會離名稱太遠，
            進度條也拉成一條看不出比例的長線。手機不設限，本來就窄。 */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: compact ? 'none' : 460 }}>
          {/* 名稱與數字同一行、數字靠右 —— 這樣進度條才拿得到整欄寬度。
              先前把條與數字擠在同一行，扣掉按鈕與數字之後條只剩十幾 px，看不出比例。 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
            {/* 🔴 2026-09-11：手機**不再截斷需求名稱**。
                字放大之後「分送志工（3 人一組）」被切成「分送志工（3 ...」——
                而括號裡那句正是志工判斷要不要接的依據（幾人一組）。
                寧可多一行，也不要切掉決定性的資訊。桌機維持單行（寬度夠）。 */}
            <span style={{ flex: 1, minWidth: 0, font: '700 var(--fs-14)/1.35 var(--font-body)',
              color: 'var(--color-fg-neutral-default)',
              ...(compact ? { textWrap: 'pretty' }
                          : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>
              {task.name}
            </span>
            {/* 🔒 這串數字是**志工唯一要做的判斷**（還缺不缺人），不是附註。
                所以它跟著名稱一起放大一階，不留在最小的那一級。 */}
            <span style={{ flexShrink: 0, font: '700 var(--fs-13)/1.4 var(--font-data)', whiteSpace: 'nowrap',
              color: full ? 'var(--color-fg-success)' : mine ? 'var(--color-brand-secondary-subtle)' : 'var(--color-fg-neutral-muted)' }}>
              {/* 不再加「你已接」前綴 —— 按鈕已經寫著「已承接」，這裡重複一次
                  會在 390px 上把需求名稱擠到截斷。狀態用顏色帶，不用字。 */}
              {state.matched}/{state.required}{full ? ' 已滿' : left ? ' · 缺 ' + left : ''}
            </span>
          </div>
          <div style={{ marginTop: 4, height: 4, borderRadius: 'var(--radius-full)',
            background: 'var(--color-bg-neutral-sunken)', overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', borderRadius: 'var(--radius-full)',
              background: full ? 'var(--color-bg-success)' : 'var(--color-bg-primary)' }}></div>
          </div>
        </div>

        {/* 觸控目標：視覺 32px（手機 36px，字放大後 32 會夾到），
            外圍 margin 把命中區補到 44px。 */}
        <button type="button" onClick={onClaim} disabled={disabled}
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
            height: compact ? 36 : 32, padding: '0 ' + (compact ? '12px' : '14px'),
            margin: (compact ? '4px' : '5px') + ' 0',
            borderRadius: 'var(--radius-full)', cursor: disabled ? 'not-allowed' : 'pointer',
            border: '1px solid ' + (disabled ? 'var(--color-border-default)' : 'var(--color-bg-primary)'),
            background: disabled ? 'var(--color-bg-disable)' : 'var(--color-bg-primary)',
            color: disabled ? 'var(--color-fg-disable)' : 'var(--color-fg-on-primary)',
            font: '700 var(--fs-12)/1.2 var(--font-latin)', whiteSpace: 'nowrap' }}>
          <WGIcon n={mine ? 'Check' : isAuthenticated ? 'HeartHandshake' : 'Lock'} s={14} />
          {label}
        </button>
      </div>
    );
  }

  function SiteTicketNeedCard({ marker, needs, active, isAuthenticated, viewerId, compact, onSelect, onClaim, onShare }) {
    const tk = marker.ticketMeta || {};
    return (
      /* 下內距比上內距小 —— 最後一列的按鈕本身帶著 5px 外距（觸控目標用），
         上下給一樣的 padding 會讓卡片底部看起來多一截空白。 */
      <div style={{ padding: compact ? '12px 14px 8px' : '14px 16px 10px', borderRadius: 'var(--radius-lg)',
        border: '1px solid ' + (active ? 'var(--color-brand-secondary-default)' : 'var(--color-border-default)'),
        background: active ? 'var(--color-bg-secondary-subtle)' : 'var(--color-bg-neutral-default)',
        boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)' }}>

        {/* 抬頭：一張單只印一次。整塊可點，開詳情。 */}
        <button type="button" onClick={onSelect} aria-pressed={active}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ flexShrink: 0, color: 'var(--color-fg-neutral-muted)', display: 'inline-flex' }}>
              <WGIcon n="ClipboardList" s={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0, font: '700 var(--fs-15)/1.3 var(--font-display)',
              color: 'var(--color-fg-neutral-default)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {marker.title}
            </span>
            {tk.priority === 'high' ? <Badge tone="danger" variant="solid">高優先</Badge> : null}
          </div>
          <div style={{ marginTop: 2, paddingLeft: 23, font: '400 var(--fs-12)/1.45 var(--font-body)',
            color: 'var(--color-fg-neutral-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {marker.subtitle}
          </div>
        </button>

        <div style={{ marginTop: 8 }}>
          {needs.map((row, i) => (
            <NeedLine key={row.task.id} marker={marker} task={row.task} state={row.state}
              isAuthenticated={isAuthenticated} viewerId={viewerId} compact={compact}
              divider={i > 0} onClaim={() => onClaim(row)} />
          ))}
        </div>

        {/* 分享沉到底、去掉外框，讓視覺重量留給「接這筆」。
            **手機不放** —— 每張卡片多 30px，而分享在詳情面板裡就有。 */}
        {onShare && !compact ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button type="button" onClick={onShare} aria-label="分享"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 8px',
                border: 0, background: 'none', cursor: 'pointer', borderRadius: 'var(--radius-full)',
                color: 'var(--color-fg-neutral-muted)', font: '400 var(--fs-12)/1.2 var(--font-latin)' }}>
              <WGIcon n="Share2" s={14} />分享
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  /** 列表單列：標題、分類標籤、摘要與操作；選取時切換選中樣式。 */
  function SiteListRow({ marker, active, latestReport, taskMatch, isAuthenticated, canDeleteMatchSheet,
    viewerId, onSelect, onShare, onSuggestUpdate, onClaimNeed, onDeleteMatchSheet }) {
    const isStation = marker.detailType === 'station';
    const avail = isStation ? R.resolveStationAvailability(marker.stationMeta || {}) : null;
    /* 2026-09-04：承接是需求層的動作。列表這一層**不做選擇** ——
       多筆需求時按鈕改成「查看 N 筆需求」把人帶進詳情，讓他自己挑；
       只有一筆需求時才在列表上直接接（那沒有選擇可言，不會誤導）。 */
    const needs = (taskMatch && taskMatch.needs) || [];
    const single = needs.length === 1 ? needs[0] : null;
    const singleMine = Boolean(single) && Boolean(viewerId) && (single.state.claimedBy || []).indexOf(viewerId) !== -1;
    const claimDisabled = !taskMatch ? true
      : single ? (!isAuthenticated || singleMine || single.state.status === 'matched' || single.state.status === 'deleted')
      : false;                                  // 「查看 N 筆需求」永遠可按
    const claimLabel = !taskMatch ? '接任務'
      : !single ? '查看 ' + needs.length + ' 筆需求'
      : singleMine ? '已承接'
      : single.state.status === 'matched' ? '已滿額'
      : single.state.status === 'deleted' ? '已刪除'
      : !isAuthenticated ? '登入後接任務' : '接任務';
    const claimIcon = !single ? 'ListChecks' : isAuthenticated ? 'HeartHandshake' : 'Lock';
    const onClaimClick = () => { if (single) onClaimNeed(single.task); else onSelect(); };

    return (
      <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
        border: '1px solid ' + (active ? 'var(--color-brand-secondary-default)' : 'var(--color-border-default)'),
        background: active ? 'var(--color-bg-secondary-subtle)' : 'var(--color-bg-neutral-default)',
        boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast)' }}>
        <button type="button" onClick={onSelect} aria-pressed={active}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 'var(--radius-full)', display: 'grid', placeItems: 'center',
              background: isStation ? 'var(--color-brand-secondary-default)' : 'var(--color-bg-primary)',
              color: isStation ? 'var(--color-fg-on-secondary)' : 'var(--color-fg-on-primary)' }}>
              <WGIcon n={isStation ? (R.STATION_TYPE_ICONS[marker.stationMeta && marker.stationMeta.type] || 'Package') : 'ClipboardList'} s={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ font: '700 var(--fs-15)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{marker.title}</span>
                  {/* 官方認定（2026-08-21）：只有官方站點掛 chip，非官方不掛 */}
                  {isStation && marker.stationMeta && marker.stationMeta.isOfficial
                    ? <Badge tone="secondary" variant="subtle"><WGIcon n="ShieldCheck" s={12} /> 官方</Badge> : null}
                </span>
                {/* 站點在列表上要直接回答「現在能不能去」——
                    status 與開放時間合起來算（Sucre 2026-08-09），不是只印 status。 */}
                {isStation && avail
                  ? <Badge tone={avail.tone} variant="solid">{avail.headline}</Badge>
                  : <Badge tone={isStation ? 'secondary' : R.getTicketStatusTone(marker.ticketMeta && marker.ticketMeta.status)}
                      variant={isStation ? 'subtle' : 'solid'}>{marker.label}</Badge>}
              </div>
              <div style={{ marginTop: 4, font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{marker.subtitle}</div>
            </div>
          </div>

          {latestReport ? (
            <div style={{ marginTop: 'var(--space-3)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-warning-subtle)', font: '400 var(--fs-12)/1.5 var(--font-body)',
              color: 'var(--color-fg-neutral-default)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              最新建議：{createStationReportSummary(latestReport)}
            </div>
          ) : null}

          {taskMatch ? (
            <div style={{ marginTop: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto',
              alignItems: 'center', gap: 'var(--space-2)', padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)',
              background: taskMatch.status === 'matched' ? 'var(--color-bg-success-subtle)'
                : taskMatch.status === 'deleted' ? 'var(--color-bg-danger-subtle)'
                : taskMatch.status === 'claimed' ? 'var(--color-bg-warning-subtle)' : 'var(--color-bg-neutral-sunken)' }}>
              <span style={{ font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-default)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                任務：{createTaskMatchSummary(taskMatch)}
                {needs.length > 1 ? ' · ' + needs.length + ' 筆需求' : ''}
              </span>
              <span style={{ font: '700 var(--fs-11)/1.4 var(--font-latin)', color: 'var(--color-fg-neutral-subtle)', whiteSpace: 'nowrap' }}>
                {TASK_MATCH_LABELS[taskMatch.status]}
              </span>
            </div>
          ) : null}
        </button>

        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          {onShare ? <RowAction icon="Share2" label="分享" onClick={onShare} /> : null}
          {/* 回報要登入（Sucre 2026-08-09）—— /list 與 /map 要一致 */}
          {onSuggestUpdate ? (
            <RowAction icon={isAuthenticated ? 'PencilLine' : 'Lock'}
              label={isAuthenticated ? '修改建議' : '登入後可建議'}
              onClick={onSuggestUpdate} disabled={!isAuthenticated} />
          ) : null}
          {taskMatch && onClaimNeed ? <RowAction icon={claimIcon} label={claimLabel} onClick={onClaimClick} disabled={claimDisabled} /> : null}
          {taskMatch && canDeleteMatchSheet ? (
            <RowAction icon="Trash2" label="刪除媒合單" tone="danger" onClick={onDeleteMatchSheet} disabled={taskMatch.status === 'deleted'} />
          ) : null}
        </div>
      </div>
    );
  }

  /** /list 主畫面：與地圖共用篩選狀態，選取列同步右側詳情。 */
  function SiteListView({ session, route }) {
    const { module, state, replace } = route;
    const { reportsByStationId, submitStationReport } = useStationReports(session.userId);
    const { getTaskMatchState, getNeedState, claimNeed, deleteMatchSheet, releaseClaim, myClaims } = useTaskMatches(session.userId);
    const { siteTickets, createSiteTicket } = useSiteTickets();
    const [newTicketOpen, setNewTicketOpen] = useState(false);
    /* 從矩陣某一格起手建單時帶進來的地標。列表頁沒有地圖可以點，
       所以除了這條路徑之外都是 null。 */
    const [seedLandmark, setSeedLandmark] = useState(null);
    /* 送出後的回饋：先記下新單 id，等資料層重查、marker 真的出現之後再選中它。
       立刻 setSelectedMarkerId 會落空 —— queryMarkers 有 debounce，那一刻 marker 還不存在。 */

    /* 我的任務（右上角個人選單開啟）。 */
    const [myTasksOpen, setMyTasksOpen] = useState(false);
    React.useEffect(() => {
      const onOpen = (e) => { setMyTasksOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      const ev = window.MY_TASKS_EVENT || 'wg:site-my-tasks';
      window.addEventListener(ev, onOpen);
      return () => window.removeEventListener(ev, onOpen);
    }, []);

    /* 我回報的站點（2026-09-11）。與「我的任務」是兩個獨立入口，各自一個抽屜。 */
    const [reportsOpen, setReportsOpen] = useState(false);
    React.useEffect(() => {
      const onOpen = (e) => { setReportsOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      const ev = window.STATION_REPORTS_EVENT || 'wg:site-station-reports';
      window.addEventListener(ev, onOpen);
      return () => window.removeEventListener(ev, onOpen);
    }, []);

    /* 申請成為後台人員（AC-FEAT-002）。原本頂欄那顆按鈕是死連結，見 site-shell.jsx。 */
    const [roleOpen, setRoleOpen] = useState(false);
    React.useEffect(() => {
      const onOpen = (e) => { setRoleOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      const ev = window.ROLE_ELEVATION_EVENT || 'wg:site-role-elevation';
      window.addEventListener(ev, onOpen);
      return () => window.removeEventListener(ev, onOpen);
    }, []);

    /* 從沒有這些抽屜的頁面（例如行前資訊）跳過來時，把該開的那一個打開。
       只消化一次 —— `takeOpenOnLoad` 讀完就清掉，重整不會又跳出來。 */
    React.useEffect(() => {
      const want = window.takeOpenOnLoad ? window.takeOpenOnLoad() : null;
      if (!want) return;
      if (want === 'newTicket') setNewTicketOpen(true);
      else if (want === 'myTasks') setMyTasksOpen(true);
      else if (want === 'stationReports') setReportsOpen(true);
      else if (want === 'roleElevation') setRoleOpen(true);
    }, []);

    const [createdTicket, setCreatedTicket] = useState(null);
    const [toastOpen, setToastOpen] = useState(false);
    /* 承接成功後的行前資訊引導（VB-FEAT-001，2026-09-06 裁示「flow 做足一點」）。
       接完的那一刻正好是他開始想「那我要帶什麼」—— 這是全流程時機最準的一次。
       ⚠️ toast 六秒就消失，所以它是**加分**不是主要入口；常駐的那一個在
       「我的任務 › 我承接的」頂部（見 site-actions.jsx 的 BriefingDepartureBar）。 */
    const [claimedNeed, setClaimedNeed] = useState(null);
    const claimNeedAndNudge = useCallback((marker, task) => {
      claimNeed(marker, task);
      setClaimedNeed({ name: task && task.name });
    }, [claimNeed]);
    const [pendingSelectId, setPendingSelectId] = useState(null);

    /* 請求協助的按鈕住在 shell（site-shell.jsx），抽屜住在這裡，靠 CustomEvent 串接。
       與 wg-notify.jsx 的 wg:notify-open 同一套做法。 */
    React.useEffect(() => {
      /* `preventDefault()` ＝ 告訴 shell 這一頁接得住，不要跳頁（見 site-shell.jsx）。 */
      const onNew = (e) => { setNewTicketOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      window.addEventListener(window.NEW_TICKET_EVENT || 'wg:site-new-ticket', onNew);
      return () => window.removeEventListener(window.NEW_TICKET_EVENT || 'wg:site-new-ticket', onNew);
    }, []);
    const { markers: sourceMarkers, isFetching, hasNextPage, loadNextPage, dismissMarker } = usePaginatedRescueMapMarkers(state, session.isAuthenticated);

    /* 我建立的：mock ＋ 前台 bridge 兩個來源，含已結束的單。
       實作在 `site-actions.jsx` 的 `useMyCreatedTickets` —— 地圖與列表共用一份，
       不要在這裡各寫各的（那正是 2026-09-10「我建立的永遠是空的」的成因）。 */
    const myCreated = useMyCreatedTickets(session.userId, getTaskMatchState);
    /* 我承接的：`myClaims` 只有 ticketId / taskId 與承接狀態，這裡補上標題／地址／聯絡人，
       因為履約視角要回答的是「去哪、找誰、做哪一件事」，光有編號沒有用。
       ⚠️ 一列＝一筆需求，所以同一張單可能出現兩列。`required` 要取**該筆需求**的分母，
          不是整張單的總人數 —— 用總人數會顯示成「1/12」，看起來像沒人來。 */
    const myClaimRows = useMemo(() => myClaims.map((row) => {
      const marker = sourceMarkers.find((m) => m.id === row.ticketId);
      const site = siteTickets.find((t) => t.id === row.ticketId);
      const meta = (marker && marker.ticketMeta) || {};
      const contact = [meta.contactName, meta.contactPhone].filter(Boolean).join(' · ');
      const need = ((marker && marker.tasks) || needsOf(site) || []).find((k) => k.id === row.taskId);
      return {
        ...row,
        title: (marker && marker.title) || (site && site.title) || null,
        address: (site && site.street) || (marker && marker.subtitle) || null,
        contact: contact || null,
        needName: (need && need.name) || row.match.taskName || '這筆需求',
        required: row.match.required
          || (need && typeof need.quantity === 'number' && need.quantity > 0 ? need.quantity : 1),
      };
    }), [myClaims, sourceMarkers, siteTickets]);
    const loadMoreRef = useRef(null);

    const controller = useRescueMapController({
      routeState: state, onRouteStateChange: replace, sourceMarkers,
      filterMarkersByOverlayLayers: false, filterMarkersByBbox: false,
    });
    const dataType = controller.dataType || R.SITE_FALLBACK_DATA_TYPE;
    /* ⚠️ 這一段一定要在 `controller` 宣告**之後**。
       `useEffect` 的 deps 陣列在該行執行的當下就求值 —— 放在上面會是 TDZ，
       整頁白畫面（2026-08-22 已經因為同一個原因白過兩次）。 */

    /* 從通知點進那張任務單（2026-09-10）。通知的價值一半在於**點得進去** ——
       只告訴你「有人接了」卻要自己回列表找那張單，等於沒有省下任何一步。 */
    React.useEffect(() => {
      const onOpen = (e) => {
        const id = e && e.detail && e.detail.id;
        if (!id) return;
        /* 🔴 一定要先切到「任務」維度。通知一律是關於任務單的，而使用者當下
           可能停在「站點」維度 —— 只設 selectedMarkerId 的話那張單根本不在
           目前的資料集裡，畫面上什麼都不會發生，看起來就像按了沒反應。 */
        if (controller.dataType !== 'ticket') controller.setDataType('ticket');
        controller.setSelectedMarkerId(id);
        /* 告訴 shell「這一頁接住了」，它才不會再跨頁一次。 */
        if (e.preventDefault) e.preventDefault();
      };
      const name = window.OPEN_TICKET_EVENT || 'wg:site-open-ticket';
      window.addEventListener(name, onOpen);
      return () => window.removeEventListener(name, onOpen);
    }, [controller]);

    /* 承接前的確認（2026-09-04 Sucre：列表直接接，但要確認）。 */
    const [pendingClaim, setPendingClaim] = useState(null);
    /* 已滿額的需求預設不出現，可手動叫回來（2026-09-04 Sucre）。 */
    const [showFullNeeds, setShowFullNeeds] = useState(false);
    /* 任務維度改成**需求為列**（2026-09-04 Sucre）。站點維度維持原樣。
       ⚠️ 這裡不重算篩選 —— marker 已經過 `filterRescueMapMarkers`。
          這一層只做兩件事：把需求攤平成列、依搜尋詞收斂到命中的那幾筆。 */
    const searchTerm = (state.search || '').trim().toLowerCase();
    const needRows = useMemo(() => {
      if (dataType !== 'ticket') return [];
      const rows = [];
      controller.markers.forEach((marker) => {
        if (marker.detailType !== 'ticket') return;
        const agg = getTaskMatchState(marker);
        (agg.needs || []).forEach((entry) => {
          /* 搜尋命中的是**需求名稱** → 只留命中的那幾筆（「醫療」只想看醫療的）。
             命中的是任務單標題／地址 → 該單的需求全留（他要找的是那個地點）。 */
          if (searchTerm && !R.needMatchesSearch(entry.task, searchTerm)) {
            const hitTicket = [marker.id, marker.title, marker.subtitle, marker.label]
              .join(' ').toLowerCase().includes(searchTerm);
            if (!hitTicket) return;
          }
          rows.push({ marker, task: entry.task, state: entry.state });
        });
      });
      return rows;
    }, [dataType, controller.markers, searchTerm, getTaskMatchState]);

    const hiddenFullCount = needRows.filter((r) => r.state.status === 'matched' || r.state.status === 'deleted').length;
    const visibleNeedRows = showFullNeeds
      ? needRows
      : needRows.filter((r) => r.state.status !== 'matched' && r.state.status !== 'deleted');

    /* 同一張單的需求收進同一張卡（2026-09-05 Sucre）。
       ⚠️ 順序沿用 `visibleNeedRows` —— 那是資料層排好的（缺人優先／搜救優先／新到舊），
          分組只是把同一張單的相鄰列合併，**不重新排序**。 */
    const needCards = useMemo(() => {
      const byTicket = new Map();
      visibleNeedRows.forEach((row) => {
        const cur = byTicket.get(row.marker.id);
        if (cur) cur.needs.push(row);
        else byTicket.set(row.marker.id, { marker: row.marker, needs: [row] });
      });
      return [...byTicket.values()];
    }, [visibleNeedRows]);
    const { pinned, togglePinned } = usePinnedSubDataTypes(dataType);

    const [reportStation, setReportStation] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [shareTarget, setShareTarget] = useState(null);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
      const mq = window.matchMedia('(max-width: 767px)');
      const onChange = () => setIsMobile(mq.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
      const target = loadMoreRef.current;
      if (!target || !hasNextPage) return;
      const observer = new IntersectionObserver((entries) => {
        if (entries[0] && entries[0].isIntersecting) loadNextPage();
      }, { rootMargin: '320px 0px' });
      observer.observe(target);
      return () => observer.disconnect();
    }, [hasNextPage, loadNextPage]);

    const selectedMarker = useMemo(
      () => controller.markers.find((m) => m.id === controller.selectedMarkerId) || null,
      [controller.markers, controller.selectedMarkerId],
    );
    const detailOpen = Boolean(selectedMarker);
    const closeDetail = () => controller.setSelectedMarkerId(undefined);
    /* marker 一出現就選中並開詳情，讓使用者立刻看到自己剛建的那一張。 */
    React.useEffect(() => {
      if (!pendingSelectId) return;
      if (!sourceMarkers.some((m) => m.id === pendingSelectId)) return;
      controller.setSelectedMarkerId(pendingSelectId);
      setPendingSelectId(null);
    }, [pendingSelectId, sourceMarkers]);

    /* 直立地圖（2026-09-12）。與 /map 同一份邏輯 ——
       `PUB-PS-101`：兩頁共用同一個詳情面板。地圖有「查看整棟」而列表沒有，
       就等於兩頁的詳情面板長得不一樣。 */
    /* ⚠️ 這一支檔案上方（usePaginatedRescueMapMarkers）也有一個 `bridgeVersion`，
       但那是**另一個函式的區域變數**，在這裡看不到 —— 第一版直接用它，
       整頁 ReferenceError 變空白。要用就在本元件自己訂一份。 */
    const listBridgeVersion = window.WGBridge.useBridgeVersion();
    const [buildingOpen, setBuildingOpen] = useState(null);
    const [seedCell, setSeedCell] = useState(null);
    const selectedBuilding = useMemo(() => {
      if (!window.WGBridge || !selectedMarker) return null;
      if (selectedMarker.detailType !== 'ticket') return null;
      if (!session.isAuthenticated && !D.GUEST_CAN_SEE_MATRIX) return null;
      const addr = selectedMarker.ticketMeta && selectedMarker.ticketMeta.address;
      return addr ? window.WGBridge.buildingForAddress(addr) : null;
    }, [selectedMarker, session.isAuthenticated, listBridgeVersion]);
    /* 這一棟底下的**全部**任務單（含已結案、不受分頁影響）——
       理由見 site-data.js `queryBuildingMarkers` 的註解：濾掉結案的單會讓
       那一格變白，跟「從頭到尾沒人通報」混為一談。 */
    const buildingMarkers = useMemo(
      () => D.queryBuildingMarkers(buildingOpen, { isAuthenticated: session.isAuthenticated }),
      [buildingOpen, session.isAuthenticated, listBridgeVersion]);

    const openShare = (marker) => setShareTarget(createPointShareTarget({ marker, module, state, origin: window.location.origin + window.location.pathname }));

    const detailProps = selectedMarker ? {
      marker: selectedMarker, onClose: closeDetail, isAuthenticated: session.isAuthenticated,
      reports: reportsByStationId[selectedMarker.id],
      taskMatch: selectedMarker.detailType === 'ticket' ? getTaskMatchState(selectedMarker) : undefined,
      canDeleteMatchSheet: selectedMarker.detailType === 'ticket' && session.isAuthenticated
        && selectedMarker.ticketMeta.createdBy === session.userId,
      onSuggestUpdate: () => setReportStation(selectedMarker),
      onShare: () => openShare(selectedMarker),
      viewerId: session.userId,
      onClaimNeed: (task) => claimNeedAndNudge(selectedMarker, task),
      onDeleteMatchSheet: () => setPendingDelete(selectedMarker),
      building: selectedBuilding,
      onOpenBuilding: selectedBuilding ? () => setBuildingOpen(selectedBuilding) : undefined,
    } : null;

    const drawerWidth = R.RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH;

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid',
        gridTemplateColumns: !isMobile && detailOpen ? 'minmax(0,1fr) ' + drawerWidth + 'px' : 'minmax(0,1fr) 0',
        gridTemplateRows: 'minmax(0,1fr)', overflow: 'hidden', background: 'var(--color-bg-neutral-subtle)',
        transition: 'grid-template-columns var(--duration-base) var(--ease-out)' }}>
        <div style={{ gridColumn: 1, gridRow: 1, minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-6)', background: 'var(--color-bg-neutral-default)',
            borderBottom: '1px solid var(--color-border-default)' }}>
            <SiteDataTypeToggle value={dataType} onChange={controller.setDataType} />
            <SiteSubTypeFilter dataType={dataType} selected={controller.subDataTypes} pinned={pinned}
              onToggle={controller.toggleSubDataType} onTogglePinned={togglePinned} />
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              {/* 任務維度是需求為列，計數要數需求不是任務單，否則跟畫面上的列數對不起來 */}
              <span style={{ font: '400 var(--fs-13)/1.5 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>
                {dataType === 'ticket'
                  ? '共 ' + visibleNeedRows.length + ' 筆需求'
                  : '共 ' + controller.markers.length + ' 筆'}
                {controller.subDataTypes.length ? '（已篩選）' : ''}
              </span>
              {dataType === 'ticket' && hiddenFullCount > 0 ? (
                <button type="button" onClick={() => setShowFullNeeds((v) => !v)}
                  style={rowActionStyle(showFullNeeds ? undefined : 'disabled')}>
                  <WGIcon n={showFullNeeds ? 'Eye' : 'EyeOff'} s={14} />
                  含已滿額（{hiddenFullCount}）
                </button>
              ) : null}
            </span>
          </div>

          {/* wg-site-list-scroll：手機加大底部留白，避開浮動的「請求協助」按鈕。
              沒有它的話最後一列永遠被蓋住一半（site.css 的 media query）。 */}
          <div className="wg-site-list-scroll"
            style={{ minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              padding: 'var(--space-4) var(--space-6) var(--space-8)' }}>
            {(dataType === 'ticket' ? needCards.length === 0 : controller.markers.length === 0) && !isFetching ? (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-fg-neutral-muted)' }}>
                  <WGIcon n="SearchX" s={28} />
                  <span style={{ font: '400 var(--fs-14)/1.5 var(--font-body)' }}>沒有符合條件的資料</span>
                </div>
              </div>
            ) : (
              /* 卡片間距 8px（原 12）—— 手機一屏能多塞進一張卡（2026-09-05） */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
                /* 需求卡在桌機收窄到 720 —— 880 會讓「接這筆」後面拖一大片空白，
                   而且一行太長不利於掃視。站點維持 880。 */
                maxWidth: dataType === 'ticket' ? 720 : 880 }}>
                {dataType === 'ticket' ? needCards.map((card) => (
                  <SiteTicketNeedCard key={card.marker.id} marker={card.marker} needs={card.needs}
                    active={card.marker.id === controller.selectedMarkerId}
                    isAuthenticated={session.isAuthenticated} viewerId={session.userId}
                    compact={isMobile}
                    onSelect={() => controller.setSelectedMarkerId(card.marker.id)}
                    onShare={() => openShare(card.marker)}
                    onClaim={(row) => setPendingClaim(row)} />
                )) : controller.markers.map((marker) => (
                  <SiteListRow key={marker.id} marker={marker}
                    active={marker.id === controller.selectedMarkerId}
                    latestReport={(reportsByStationId[marker.id] || [])[0]}
                    taskMatch={marker.detailType === 'ticket' ? getTaskMatchState(marker) : undefined}
                    isAuthenticated={session.isAuthenticated}
                    canDeleteMatchSheet={marker.detailType === 'ticket' && session.isAuthenticated
                      && marker.ticketMeta.createdBy === session.userId}
                    onSelect={() => controller.setSelectedMarkerId(marker.id)}
                    onShare={() => openShare(marker)}
                    onSuggestUpdate={marker.detailType === 'station' ? () => setReportStation(marker) : undefined}
                    viewerId={session.userId}
                    onClaimNeed={marker.detailType === 'ticket' ? ((task) => claimNeedAndNudge(marker, task)) : undefined}
                    onDeleteMatchSheet={marker.detailType === 'ticket' ? () => setPendingDelete(marker) : undefined} />
                ))}
                <div ref={loadMoreRef} style={{ height: 1 }}></div>
                {isFetching ? (
                  <div style={{ padding: 'var(--space-3)', textAlign: 'center', font: '400 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>載入中…</div>
                ) : null}
                {!isFetching && hasNextPage ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-2)' }}>
                    <Button variant="outline" size="sm" onClick={loadNextPage} startIcon={<WGIcon n="ChevronDown" s={16} />}>載入更多</Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {!isMobile ? (
          <div style={{ gridColumn: 2, gridRow: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: drawerWidth, height: '100%' }}>
              {detailProps ? <SiteDetailDrawer {...detailProps} /> : null}
            </div>
          </div>
        ) : null}

        {isMobile && detailProps ? (
          <WGPortal>
          <div style={{ position: 'fixed', top: 'var(--wg-banner-h, 0px)', left: 0, right: 0, bottom: 0, zIndex: 1450 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.42)' }} onClick={closeDetail}></div>
            <div style={{ position: 'absolute', inset: 0, animation: 'wgSlideIn var(--duration-base) var(--ease-out)' }}>
              <SiteDetailDrawer {...detailProps} />
            </div>
          </div>
          </WGPortal>
        ) : null}

        <SiteStationReportDrawer open={Boolean(reportStation)} station={reportStation}
          reports={reportStation ? reportsByStationId[reportStation.id] : []}
          onClose={() => setReportStation(null)}
          onSubmit={(values) => { submitStationReport(reportStation, values); setReportStation(null); }} />
        {/* 承接確認（2026-09-04）：列表上一鍵可及，但按下去之前要看到「去哪、做什麼」 */}
        <NeedClaimConfirmDialog open={Boolean(pendingClaim)}
          marker={pendingClaim && pendingClaim.marker} task={pendingClaim && pendingClaim.task}
          state={(pendingClaim && pendingClaim.state) || {}}
          onCancel={() => setPendingClaim(null)}
          onConfirm={() => { claimNeedAndNudge(pendingClaim.marker, pendingClaim.task); setPendingClaim(null); }} />
        <TaskMatchDeleteConfirmDialog open={Boolean(pendingDelete)} task={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = deleteMatchSheet(pendingDelete);
            dismissMarker(id);
            if (controller.selectedMarkerId === id) controller.setSelectedMarkerId(undefined);
            setPendingDelete(null);
          }} />
        {/* 列表頁沒有地圖可點，seedLandmark 留空 —— 抽屜內的 LocationPicker 會自己請求定位，
            這正是「從按鈕進來＝現在位置」的情形。條件掛載的理由見 site-actions.jsx 註解。 */}
        {newTicketOpen ? (
          <SiteTicketCreateDrawer isAuthenticated={session.isAuthenticated} viewerId={session.userId}
            seedLandmark={seedLandmark} seedCell={seedCell}
            onClose={() => { setNewTicketOpen(false); setSeedLandmark(null); setSeedCell(null); }}
            onSignIn={() => { setNewTicketOpen(false); window.location.hash = '#/sign-in'; }}
            onSubmit={(values) => {
              const ticket = createSiteTicket({ ...values, userId: session.userId });
              setNewTicketOpen(false);
              setSeedLandmark(null);
              setSeedCell(null);
              setCreatedTicket(ticket);
              setPendingSelectId(ticket.id);
              setToastOpen(true);
              /* 使用者可能正在看「站點」維度，新單是任務 —— 不切過去就等於送出後看不到。
                 同時清掉子分類篩選，否則新單可能被篩掉。 */
              if ((state.dataType || R.SITE_FALLBACK_DATA_TYPE) !== 'ticket' || (state.subDataTypes || []).length) {
                replace({ ...state, dataType: 'ticket', subDataTypes: undefined, selectedMarkerId: undefined });
              }

            }} />
        ) : null}
        {window.BuildingDrawer ? (
          <BuildingDrawer open={Boolean(buildingOpen)} building={buildingOpen}
            markers={buildingMarkers} getTaskMatchState={getTaskMatchState}
            viewerId={session.userId} isAuthenticated={session.isAuthenticated}
            onClose={() => setBuildingOpen(null)}
            onClaimNeed={claimNeedAndNudge}
            onOpenTicket={(mk) => { setBuildingOpen(null); controller.setSelectedMarkerId(mk.id); }}
            onCreateAtCell={(cell) => {
              setBuildingOpen(null);
              setSeedCell({ building: buildingOpen, floor: cell.floor, unit: cell.unit });
              setSeedLandmark({ lat: buildingOpen.lat, lng: buildingOpen.lng, source: 'building' });
              setNewTicketOpen(true);
            }} />
        ) : null}
        <PointShareDrawer open={Boolean(shareTarget)} target={shareTarget} onClose={() => setShareTarget(null)} />


        <MyTasksDrawer open={myTasksOpen} viewerId={session.userId}
          createdTickets={myCreated} claimedRows={myClaimRows}
          onClose={() => setMyTasksOpen(false)}
          onOpenTicket={(id) => { setMyTasksOpen(false); controller.setSelectedMarkerId(id); }}
          onRelease={(row) => releaseClaim(row.ticketId, row.taskId, row.required)} />

        {/* 我回報的站點。點「看這個站點」會切到站點維度並開啟該站詳情 ——
            只設 selectedMarkerId 的話，使用者停在任務維度時會完全沒有反應。 */}
        <RoleElevationDrawer open={roleOpen} viewerId={session.userId}
          onClose={() => setRoleOpen(false)} />

        <StationReportsDrawer open={reportsOpen} viewerId={session.userId}
          onClose={() => setReportsOpen(false)}
          onOpenStation={(id) => {
            setReportsOpen(false);
            if (controller.dataType !== 'station') controller.setDataType('station');
            controller.setSelectedMarkerId(id);
          }} />

        <SiteToast open={toastOpen}
          /* 🔒 2026-09-10：**「一張單有多筆需求」這個結構第一次出現在這裡，不在表單裡。**
             填的時候他只是在說「我需要什麼」；送出之後才需要知道
             「我剛剛講的是 N 件事，志工會一件一件來接」——
             那時候這個結構是**好消息**（不用等一個人全包），不是要先學會的規則。 */
          title="你的求助單已送出"
          description={createdTicket
            ? (createdTicket.tasks && createdTicket.tasks.length > 1
                ? '裡面有 ' + createdTicket.tasks.length + ' 件事情等人來幫，志工會一件一件承接。'
                : '志工現在就看得到，可以直接承接。')
              + '　單號 ' + createdTicket.id
            : ''}
          actionLabel="查看"
          onAction={() => { if (createdTicket) controller.setSelectedMarkerId(createdTicket.id); setToastOpen(false); }}
          onClose={() => setToastOpen(false)} />
        {/* 承接成功 → 行前資訊（VB-FEAT-001）。與建單成功那一則互斥出現的機率很低，
            真的同時發生時後掛的這一則疊在上面，也還是看得到。 */}
        <SiteToast open={Boolean(claimedNeed)}
          title={'已承接　' + ((claimedNeed && claimedNeed.name) || '')}
          description="出發前先看行前資訊：怎麼過來、帶什麼、到了找誰。"
          actionLabel="看行前資訊"
          onAction={() => { window.location.href = window.BRIEFING_HREF; }}
          onClose={() => setClaimedNeed(null)} />
      </div>
    );
  }

  Object.assign(window, { SiteListView, SiteListRow, usePaginatedRescueMapMarkers });
})();
