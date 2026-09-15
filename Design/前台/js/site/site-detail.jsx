/* site-detail.jsx — 標記詳情面板（站點 / 任務）
 * 對齊 repo：libs/modules/src/map/components/rescue-map-detail-drawer/index.tsx
 *           libs/modules/src/station/admin/station-detail/*、libs/modules/src/ticket/admin/ticket-detail
 *           libs/modules/src/ticket/task-match/* */
(function () {
  const { useState, useEffect } = React;
  const { Badge, Button, Tabs, Avatar } = window.WanGuardDesignSystem_9c8f68;
  const R = window.SiteRoute;

  const GRID_M = (window.SiteGuestBoundary && window.SiteGuestBoundary.GUEST_GRID_DIAMETER_M) || 550;
  const TASK_MATCH_LABELS = { idle: '未媒合', claimed: '已報名', matched: '媒合完成', deleted: '已刪除' };
  const TASK_MATCH_TONES = { idle: 'neutral', claimed: 'warning', matched: 'success', deleted: 'danger' };
  const createTaskMatchSummary = (s) => '已媒合 ' + s.matched + ' / 需求 ' + s.required + ' 人';

  /** 站點驗證狀態 → 顯示標籤與色調（對齊 formatStationStatus）。 */
  function formatStationStatus(marker) {
    const st = marker.stationMeta || {};
    if (st.visibility === 'public' && st.verificationStatus === 'human_verified') {
      return { label: st.isTemporary ? '臨時 · 已人工驗證' : '啟用 · 已人工驗證', tone: 'success' };
    }
    if (st.verificationStatus === 'ai_verified') return { label: 'AI 驗證', tone: 'warning' };
    return { label: st.visibility === 'public' ? '公開' : '未驗證', tone: 'neutral' };
  }

  /* 右內距要留 56px 給絕對定位的關閉鈕（44 ＋ 8 邊距 ＋ 一點餘裕），
     否則長標題會跑到 X 底下。 */
  const panelHead = { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-4) 56px var(--space-4) var(--space-6)' };
  const sectionLabel = { font: '700 var(--fs-11)/1.4 var(--font-latin)', letterSpacing: '.08em', color: 'var(--color-fg-neutral-muted)', marginBottom: 6 };
  const sectionValue = { font: '400 var(--fs-14)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' };
  const rowGap = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' };

  function InfoRow({ label, value, icon }) {
    return (
      <div>
        <div style={sectionLabel}>{label}</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
          {icon ? <span style={{ color: 'var(--color-fg-neutral-muted)', marginTop: 2 }}><WGIcon n={icon} s={16} /></span> : null}
          <div style={sectionValue}>{value}</div>
        </div>
      </div>
    );
  }

  function ResourceTile({ icon, label, value }) {
    return (
      <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-neutral-subtle)', border: '1px solid var(--color-border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-fg-neutral-subtle)', marginBottom: 4 }}>
          <WGIcon n={icon} s={14} />
          <span style={{ font: '400 var(--fs-11)/1.4 var(--font-latin)' }}>{label}</span>
        </div>
        <div style={{ font: '700 var(--fs-14)/1.3 var(--font-data)', color: 'var(--color-fg-neutral-default)' }}>{value}</div>
      </div>
    );
  }

  function VolunteerProgress({ matched, required, needCount }) {
    const pct = required ? Math.min(100, Math.round((matched / required) * 100)) : 0;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <span style={sectionLabel}>
            志工媒合{needCount > 1 ? ' · 共 ' + needCount + ' 筆需求' : ''}
          </span>
          <span style={{ font: '700 var(--fs-12)/1.2 var(--font-data)', color: 'var(--color-brand-primary-subtle)' }}>{matched}/{required}</span>
        </div>
        <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-neutral-sunken)', overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--color-bg-primary)', transition: 'width var(--transition-base)' }}></div>
        </div>
      </div>
    );
  }

  /* ── 需求清單（`ticket_tasks`）──────────────────────────────────────────────
   *
   * 🔒 2026-09-04 Sucre：**志工承接的是「需求」，不是整張任務單。**
   *    「開單時寫了兩個 task，但承接單子沒有問我要哪個」——
   *    先前這個面板只有一顆「接任務」，按下去等於幫使用者做了他沒做的選擇。
   *
   *    正典 `PUB-PS-140` 早就寫了「志工以『需求』為單位承接」，ERD 的
   *    `task_assignments` 也是 UNIQUE(task_uuid, actor_uuid)。是實作沒跟上。
   *
   * 每一筆需求自己一條進度與一顆按鈕（2026-09-04 Sucre 選定），不走「先按接任務
   * 再跳選擇彈窗」—— 多一層彈窗，卻少了「哪一筆還缺人」這個一眼可見的資訊。
   */
  const NEED_KIND_META = {
    rescue: { label: '搜救', icon: 'LifeBuoy' },
    hr: { label: '人力', icon: 'Users' },
    supply: { label: '物資', icon: 'Package' },
  };

  function needClaimLabel(state, isAuthenticated) {
    if (state.status === 'deleted') return '已刪除';
    if (state.status === 'matched') return '已滿';
    if (!isAuthenticated) return '登入後接';
    if (state.status === 'claimed' && state.matched > 0) return '接這筆';
    return '接這筆';
  }

  function NeedRow({ task, state, isAuthenticated, mine, onClaim }) {
    const meta = NEED_KIND_META[task.kind] || NEED_KIND_META.hr;
    const pct = state.required ? Math.min(100, Math.round((state.matched / state.required) * 100)) : 0;
    const full = state.status === 'matched';
    const disabled = !isAuthenticated || full || state.status === 'deleted' || mine;
    return (
      <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
        border: '1px solid ' + (mine ? 'var(--color-brand-secondary-default)' : 'var(--color-border-default)'),
        background: full ? 'var(--color-bg-success-subtle)' : 'var(--color-bg-neutral-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--color-fg-neutral-muted)', display: 'inline-flex' }}><WGIcon n={meta.icon} s={15} /></span>
          <span style={{ flex: 1, minWidth: 0, font: '700 var(--fs-14)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>
            {task.name}
          </span>
          <Badge tone="neutral" variant="subtle">{meta.label}</Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-neutral-sunken)', overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', borderRadius: 'var(--radius-full)',
                background: full ? 'var(--color-bg-success)' : 'var(--color-bg-primary)', transition: 'width var(--transition-base)' }}></div>
            </div>
            <div style={{ marginTop: 4, font: '400 var(--fs-12)/1.5 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>
              {state.matched}/{state.required}
              {typeof task.quantity === 'number' && task.quantity > 0 ? '' : '（未填數量，先以 1 計）'}
              {mine ? ' · 你已承接' : ''}
            </div>
          </div>
          <Button variant={mine ? 'outline' : 'primary'} size="sm" disabled={disabled}
            startIcon={<WGIcon n={mine ? 'Check' : isAuthenticated ? 'HeartHandshake' : 'Lock'} s={15} />}
            onClick={onClaim}>
            {mine ? '已承接' : needClaimLabel(state, isAuthenticated)}
          </Button>
        </div>
      </div>
    );
  }

  function NeedList({ needs, viewerId, isAuthenticated, onClaimNeed }) {
    if (!needs || !needs.length) return null;
    return (
      <div>
        <div style={{ ...sectionLabel, display: 'flex', justifyContent: 'space-between' }}>
          <span>需求（{needs.length} 筆）</span>
          {needs.length > 1 ? <span style={{ letterSpacing: 0 }}>一筆一筆接，可以接多筆</span> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {needs.map(({ task, state }) => (
            <NeedRow key={task.id} task={task} state={state} isAuthenticated={isAuthenticated}
              mine={Boolean(viewerId) && (state.claimedBy || []).indexOf(viewerId) !== -1}
              onClaim={() => onClaimNeed(task)} />
          ))}
        </div>
      </div>
    );
  }

  function StationReportHistoryPanel({ reports }) {
    if (!reports || !reports.length) {
      return <div style={{ ...sectionValue, color: 'var(--color-fg-neutral-subtle)' }}>目前沒有待處理的修改建議。</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {reports.map((report) => (
          <div key={report.id} style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-warning-subtle)', border: '1px solid var(--color-border-accent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 4 }}>
              <Badge tone={report.urgent ? 'warning' : 'neutral'} variant="subtle">{report.fieldLabel}</Badge>
              <span style={{ font: '400 var(--fs-11)/1.5 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>{report.submittedAt}</span>
            </div>
            {/* 欄位級建議（2026-08-21）：顯示的是 `現值 → 建議值`，與後台審核 diff 同一組資料 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', font: '400 var(--fs-13)/1.5 var(--font-body)' }}>
              <span style={{ color: 'var(--color-fg-neutral-muted)', textDecoration: 'line-through' }}>{report.currentLabel || '未提供'}</span>
              <WGIcon n="ArrowRight" s={14} />
              <span style={{ font: '700 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>{report.suggestedLabel}</span>
            </div>
            {report.note ? <div style={{ ...sectionValue, fontSize: 12, marginTop: 4, color: 'var(--color-fg-neutral-subtle)' }}>{report.note}</div> : null}
          </div>
        ))}
      </div>
    );
  }

  function StationDetail({ marker, reports, isAuthenticated, onSuggestUpdate, onShare }) {
    const [tab, setTab] = useState('info');
    useEffect(() => { setTab('info'); }, [marker.id]);
    const st = marker.stationMeta || {};
    const status = formatStationStatus(marker);
    const avail = R.resolveStationAvailability(st);
    const pendingCount = (reports || []).length;
    const tabs = [{ value: 'info', label: '詳情' }, { value: 'corrections', label: '修改建議' + (pendingCount ? '（' + pendingCount + '）' : '') }];

    return (
      <>
        <div style={panelHead}>
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
            background: 'var(--color-bg-secondary-subtle)', color: 'var(--color-brand-secondary-subtle)' }}>
            <WGIcon n={R.STATION_TYPE_ICONS[st.type] || 'Package'} s={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: '700 var(--fs-18)/1.35 var(--font-display)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>{marker.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ color: 'var(--color-fg-neutral-muted)' }}><WGIcon n="MapPin" s={14} /></span>
              <span style={{ font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>{marker.label}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 var(--space-6)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Badge tone={avail.tone} variant="solid">{avail.headline}</Badge>
          <Badge tone={status.tone} variant="subtle">{status.label}</Badge>
          {/* 官方認定（2026-08-21 決議）：前台不再顯示 `source`。
              站點一律由後台建立，來源不具區別力；有區別力的是「是不是官方造冊」。
              非官方一律不顯示任何 chip —— 標籤太多會把列表淹掉。 */}
          {st.isOfficial ? <Badge tone="secondary" variant="subtle"><WGIcon n="ShieldCheck" s={12} /> 官方</Badge> : null}
          {st.isTemporary ? <Badge tone="neutral" variant="subtle">臨時站點</Badge> : null}
        </div>

        {/* 「現在能不能去」是這一頁最重要的一句話，所以放在最上面、獨立一塊。
            status 與開放時間是兩件事，合起來才回答得了（Sucre 2026-08-09）。 */}
        {avail.detail ? (
          <div style={{ margin: 'var(--space-3) var(--space-6) 0', padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)', background: 'var(--color-bg-neutral-subtle)',
            border: '1px solid var(--color-border-default)', display: 'flex', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-fg-neutral-muted)', marginTop: 1 }}><WGIcon n="Clock" s={16} /></span>
            <span style={{ font: '400 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>{avail.detail}</span>
          </div>
        ) : null}

        <div style={{ padding: '0 var(--space-6)', marginTop: 'var(--space-4)' }}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4) var(--space-6) var(--space-6)' }}>
          {tab === 'info' ? (
            <div style={rowGap}>
              <InfoRow label="位置說明" value={st.description || marker.subtitle} icon="MapPin" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <ResourceTile icon="Package" label="站點類型" value={marker.label} />
                <ResourceTile icon="Clock" label="服務時間" value={(st.opHour && st.opHour.trim()) || '未提供'} />
                {/* 「可信度」tile 已移除 —— 信任制度 v0.1.0 不做，credibility_score 留空不讀。
                    「站點等級」也拿掉 —— `level` 是什麼還在問後端的清單裡，
                    對前台讀者顯示一個我們自己都不確定語意的數字沒有意義。 */}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-default)' }}>
                <Avatar name={st.isOfficial ? '官方' : '一般'} size={36} tone={st.isOfficial ? 'primary' : 'neutral'} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '700 var(--fs-13)/1.3 var(--font-latin)', color: 'var(--color-fg-neutral-default)' }}>{st.isOfficial ? '官方站點' : '一般站點'}</div>
                  <div style={{ font: '400 var(--fs-12)/1.5 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>
                    {/* `source` 已於 2026-08-21 從前台移除，只留驗證狀態 */}
                    {st.verificationStatus === 'human_verified' ? '人工驗證' : st.verificationStatus === 'ai_verified' ? 'AI 驗證' : '未驗證'}
                  </div>
                </div>
              </div>
              <InfoRow label="座標" value={marker.position[0].toFixed(6) + ', ' + marker.position[1].toFixed(6)} icon="Crosshair" />
            </div>
          ) : <StationReportHistoryPanel reports={reports} />}
        </div>

        {/* 回報要登入（Sucre 2026-08-09）。理由：未來 LINE 等通路本身內建身分認證，
            平台入口不該是唯一的匿名破口。未登入時按鈕停用並說明原因，
            不是隱藏 —— 否則讀者不知道有這個功能。
            ⚠️ 「停用可見 vs 完全隱藏」是提案 Q2，尚未定案。 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="primary" disabled={!isAuthenticated}
              startIcon={<WGIcon n={isAuthenticated ? 'PencilLine' : 'Lock'} s={16} />}
              onClick={onSuggestUpdate} style={{ flex: 1 }}>
              {isAuthenticated ? '修改建議' : '登入後可提修改建議'}
            </Button>
            <Button variant="outline" iconOnly aria-label="分享站點" onClick={onShare}><WGIcon n="Share2" s={18} /></Button>
          </div>
          {!isAuthenticated ? (
            <span style={{ font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>
              提出修改建議需要登入，可用 Email 或手機號碼註冊。
            </span>
          ) : null}
        </div>
      </>
    );
  }

  function TicketDetail({ marker, taskMatch, isAuthenticated, viewerId, canDeleteMatchSheet, onClaimNeed, onDeleteMatchSheet, onShare, building, onOpenBuilding }) {
    const [tab, setTab] = useState('details');
    useEffect(() => { setTab('details'); }, [marker.id]);
    const tk = marker.ticketMeta || {};
    // 資料層已經遮過了（queryMarkers）。這裡用 marker.isGuestMasked 決定「怎麼講」，
    // 不是用它決定「要不要遮」—— 遮已經發生在更上游。
    const masked = Boolean(marker.isGuestMasked);
    const contact = [tk.contactName && tk.contactName.trim(), tk.contactPhone && tk.contactPhone.trim()].filter(Boolean).join(' / ');
    /* 需求層才是承接的單位。`taskMatch` 只是整張單的彙總，用來畫總進度與 Badge。 */
    const needs = taskMatch.needs || [];
    const single = needs.length === 1 ? needs[0] : null;
    const singleMine = Boolean(single) && Boolean(viewerId) && (single.state.claimedBy || []).indexOf(viewerId) !== -1;
    const claimDisabled = !single || singleMine || !isAuthenticated
      || single.state.status === 'matched' || single.state.status === 'deleted';
    const claimLabel = !single ? '接任務'
      : singleMine ? '已承接'
      : single.state.status === 'matched' ? '已滿額'
      : single.state.status === 'deleted' ? '已刪除'
      : !isAuthenticated ? '登入後接任務' : '接任務';

    return (
      <>
        <div style={panelHead}>
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
            background: 'var(--color-bg-primary-subtle)', color: 'var(--color-brand-primary-subtle)' }}>
            <WGIcon n="ClipboardList" s={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>{tk.propertyName || marker.id}</div>
            <div style={{ font: '700 var(--fs-18)/1.35 var(--font-display)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>{marker.title}</div>
          </div>
        </div>

        <div style={{ padding: '0 var(--space-6)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Badge tone={R.getTicketStatusTone(tk.status)} variant="solid">{marker.label}</Badge>
          {tk.priority === 'high' ? <Badge tone="danger" variant="subtle">高優先</Badge> : null}
          <Badge tone={TASK_MATCH_TONES[taskMatch.status]} variant="subtle">{TASK_MATCH_LABELS[taskMatch.status]}</Badge>
        </div>

        <div style={{ padding: '0 var(--space-6)', marginTop: 'var(--space-4)' }}>
          <Tabs tabs={[{ value: 'details', label: '詳情' }, { value: 'log', label: '操作紀錄' }]} value={tab} onChange={setTab} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4) var(--space-6) var(--space-6)' }}>
          {tab === 'details' ? (
            <div style={rowGap}>
              <VolunteerProgress matched={taskMatch.matched} required={taskMatch.required} needCount={needs.length} />

              <NeedList needs={needs} viewerId={viewerId} isAuthenticated={isAuthenticated} onClaimNeed={onClaimNeed} />

              {masked ? (
                <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)', background: 'var(--color-bg-neutral-subtle)',
                  border: '1px solid var(--color-border-default)' }}>
                  <span style={{ color: 'var(--color-fg-neutral-muted)', marginTop: 1 }}><WGIcon n="ShieldCheck" s={16} /></span>
                  <div style={{ font: '400 var(--fs-12)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                    為保護求助者，這裡只顯示<b>概略區塊</b>與結構化資訊。
                    精確位置、狀況描述與聯絡方式不會對外公開。
                  </div>
                </div>
              ) : null}

              {/* AC-03：review notes 不對訪客開放。登入後才讀 reviewNote。 */}
              {masked ? null : (
                <InfoRow label="任務說明" value={(tk.reviewNote && tk.reviewNote.trim()) || marker.subtitle} icon="FileText" />
              )}
              <InfoRow label="任務類型" value={(tk.taskType && tk.taskType.trim()) || '未提供'} icon="Tag" />

              {/* AC-03：raw contact details 不對訪客開放。
                  未登入時 ticketMeta 裡根本沒有這幾個欄位（遮在資料層）。 */}
              {masked ? null : <InfoRow label="現場聯絡人" value={contact || '未提供'} icon="User" />}

              {/* AC-02：訪客回應絕不含門牌級座標。
                  未登入 → 只講區塊大小，不給任何數字。 */}
              <InfoRow label="位置資訊" value={
                masked ? (
                  <>
                    <div>概略區塊（約 {GRID_M} 公尺範圍）</div>
                    <div style={{ font: '400 var(--fs-12)/1.6 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>
                      同一區塊內的求助會顯示在一起，看不出是哪一戶
                    </div>
                  </>
                ) : (
                  <>
                    {/* 🔴 2026-09-10 修：這一列原本顯示 `marker.subtitle`，而 subtitle 是
                        **現場描述**（「一樓 6 間教室積泥，需鏟具與高壓水槍」）——
                        掛在「位置資訊」底下讀起來像地址，但它根本不是。
                        根因是 mock 的任務單當時沒有地址欄位，只好拿描述頂替。
                        現在有 `ticketMeta.address` 了，沒有地址時才退回描述，
                        而且會標明「未填地址」，不讓人以為那串描述就是門牌。 */}
                    <div>{(marker.ticketMeta && marker.ticketMeta.address) || '未填地址'}</div>
                    {!(marker.ticketMeta && marker.ticketMeta.address) && marker.subtitle ? (
                      <div style={{ font: '400 var(--fs-12)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                        現場描述：{marker.subtitle}
                      </div>
                    ) : null}
                    {/* 直立地圖（2026-09-12）：這個地址後台開了「幾樓幾戶」，
                        所以它不只是一個點，是一整棟。**樓層／戶室排在座標之前** ——
                        要去的人先要知道「上幾樓、哪一戶」，經緯度是最後才看的。 */}
                    {(marker.ticketMeta && marker.ticketMeta.floor != null && marker.ticketMeta.floor !== '') ? (
                      <div style={{ font: '600 var(--fs-13)/1.6 var(--font-body)' }}>
                        {/* 數字樓層走 floorLabel（-1 → B1）；使用者手打的自由文字（「3F」「透天」）
                            原樣顯示，不要硬套格式。 */}
                        {typeof marker.ticketMeta.floor === 'number'
                          ? (window.WGBridge ? window.WGBridge.floorLabel(marker.ticketMeta.floor) : marker.ticketMeta.floor) + ' 樓'
                          : marker.ticketMeta.floor}
                        {marker.ticketMeta.room != null && marker.ticketMeta.room !== '' ? ' ' + marker.ticketMeta.room + ' 室' : ''}
                      </div>
                    ) : null}
                    <div style={{ font: '400 var(--fs-12)/1.6 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>
                      緯度 {marker.position[0].toFixed(6)} / 經度 {marker.position[1].toFixed(6)}
                    </div>
                    {building && onOpenBuilding ? (
                      <Button variant="secondary" onClick={onOpenBuilding}
                        startIcon={<WGIcon n="Building2" s={16} />}
                        style={{ marginTop: 'var(--space-2)', width: '100%' }}>
                        查看整棟（{building.floorsAbove} 層 {building.unitsPerFloor} 戶）
                      </Button>
                    ) : null}
                  </>
                )
              } icon="MapPin" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {(taskMatch.log || []).length === 0 ? (
                <div style={{ ...sectionValue, color: 'var(--color-fg-neutral-subtle)' }}>尚無操作紀錄。</div>
              ) : taskMatch.log.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <span style={{ marginTop: 5, width: 8, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-primary)', flexShrink: 0 }}></span>
                  <div>
                    <div style={{ font: '400 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>{entry.text}</div>
                    <div style={{ font: '400 var(--fs-11)/1.5 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>{entry.at}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)' }}>
          {/* 只有一筆需求時底部才放主按鈕（它指的就是那一筆，不會誤導）。
              多筆需求時**刻意不放** —— 一顆按鈕沒辦法表達「你要接哪一個」，
              那正是 2026-09-04 回報的問題。改在上面每一筆各給一顆。 */}
          {single ? (
            <Button variant="primary" disabled={claimDisabled} startIcon={<WGIcon n="HeartHandshake" s={16} />}
              onClick={() => onClaimNeed(single.task)} style={{ flex: 1 }}>{claimLabel}</Button>
          ) : (
            <span style={{ flex: 1, alignSelf: 'center', font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
              這張單有 {needs.length} 筆需求，請在上面選要接哪一筆。
            </span>
          )}
          {canDeleteMatchSheet ? (
            <Button variant="outline" iconOnly aria-label="刪除媒合單" disabled={taskMatch.status === 'deleted'} onClick={onDeleteMatchSheet}>
              <WGIcon n="Trash2" s={18} />
            </Button>
          ) : null}
          <Button variant="outline" iconOnly aria-label="分享任務" onClick={onShare}><WGIcon n="Share2" s={18} /></Button>
        </div>
      </>
    );
  }

  /** 訪客模式的「概略區塊」面板 —— 一個格子裡有 N 筆求助。
   *
   *  這一頁存在的理由是 HC 2026-07-03 點出的副作用：遮罩後所有 ticket 都落在
   *  格子中心，圖釘會整堆疊在一起。所以地圖上畫的是格子，點開才在這裡列出內容。
   *
   *  ⚠️ 這裡列出的每一筆都已經是遮過的（沒有聯絡方式、沒有原始描述、沒有精確座標）。 */
  function CellDetail({ marker, onSelectMember }) {
    return (
      <>
        <div style={panelHead}>
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
            background: 'var(--color-bg-primary-subtle)', color: 'var(--color-brand-primary-subtle)' }}>
            <WGIcon n="Hexagon" s={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ font: '700 var(--fs-18)/1.35 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>
              這個區塊有 {marker.count} 筆求助
            </div>
            <div style={{ font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', marginTop: 4 }}>
              概略區塊 · 約 {GRID_M} 公尺範圍
            </div>
          </div>
        </div>

        <div style={{ margin: '0 var(--space-6)', padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)',
          borderRadius: 'var(--radius-md)', background: 'var(--color-bg-neutral-subtle)', border: '1px solid var(--color-border-default)' }}>
          <span style={{ color: 'var(--color-fg-neutral-muted)', marginTop: 1 }}><WGIcon n="ShieldCheck" s={16} /></span>
          <div style={{ font: '400 var(--fs-12)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
            為保護求助者，位置只顯示到這個區塊，<b>看不出是哪一戶</b>。
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4) var(--space-6) var(--space-6)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {marker.members.map((m) => (
            <button key={m.id} type="button" onClick={() => onSelectMember && onSelectMember(m.id)}
              style={{ textAlign: 'left', cursor: 'pointer', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-neutral-default)', border: '1px solid var(--color-border-default)',
                display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Badge tone={R.getTicketStatusTone(m.ticketMeta && m.ticketMeta.status)} variant="subtle">{m.label}</Badge>
                {m.ticketMeta && m.ticketMeta.priority === 'high'
                  ? <Badge tone="danger" variant="subtle">高優先</Badge> : null}
              </div>
              <div style={{ font: '400 var(--fs-14)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>{m.title}</div>
              <div style={{ font: '400 var(--fs-12)/1.5 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>{m.subtitle}</div>
            </button>
          ))}
        </div>
      </>
    );
  }

  /** 桌機為右側常駐面板、行動版為全螢幕抽屜（由呼叫端決定容器）。 */
  function SiteDetailDrawer(props) {
    const { marker, onClose } = props;
    if (!marker) return null;
    return (
      /* 🔴 2026-09-11 Sucre：「任務單標題跟頂部距離超遠，留空白太多。」
         原因是**上面疊了兩層留白**：一條只放關閉鈕的列（12 ＋ 36），
         下面 panelHead 又自己給 24px 上內距 —— 標題被推到 72px 以下。
         關閉鈕改成絕對定位貼在右上角，那一列整個不存在；
         標題區的上內距同時收到 16。省下約 56px，等於多半張卡的第一屏。 */
      <aside aria-label="詳情" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg-neutral-default)', borderLeft: '1px solid var(--color-border-default)',
        boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <button type="button" aria-label="關閉詳情" onClick={onClose}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 2,
            width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'none', border: 0,
            cursor: 'pointer', borderRadius: 'var(--radius-full)', color: 'var(--color-fg-neutral-subtle)' }}>
          <WGIcon n="X" s={20} />
        </button>
        {marker.detailType === 'cell' ? <CellDetail {...props} />
          : marker.detailType === 'station' ? <StationDetail {...props} />
          : <TicketDetail {...props} />}
      </aside>
    );
  }

  Object.assign(window, { SiteDetailDrawer, StationReportHistoryPanel, TASK_MATCH_LABELS, TASK_MATCH_TONES, createTaskMatchSummary, formatStationStatus });
})();
