/* ═══════════════════════════════════════════════════════════════════════════
   現場分區 —— 分區 × 堆疊任務單（2026-09-20 改版，原名「直立地圖」）

   起點（Sucre 2026-09-12）：
     「一個地址可能有多層樓需要不同的協助……後台輸入某地址他有幾樓幾戶，
       所以開啟這個表格，然後前台的人才能看到並且勾選。」

   🔴 **2026-09-20 裁示：矩陣退場。**
      Sucre：「沒有表格就是列表條列而已。即使是建築物也只有樓層，
             因為這個是唯一可以掌握的。列表應該會是 1F，框框裡面有很多窄窄的
             任務單，並且可以看得到任務單的重要摘要。」
      起因（夥伴 2026-09-20）：「這個直立地圖不一定是直立。太魯閣失事可能是
             第一節第二節車廂，所以表格不合適，而是堆疊任務卡。」

   🔒 **為什麼樓層留下、戶／室拿掉：母體。**
      矩陣唯一的價值在**白格**（這一戶存在、而且沒有任何求助單）。
      白格要成立，前提是我們知道母體 —— 而母體要靠「災害當下有人去輸入
      每層幾戶」才存在，那個前提太薄。**樓層查得到、車廂數得出來；
      每層幾戶、每節幾人查不到。** 只切到查得到的那一層。
      → 戶別從此是任務單上的一行**自由文字**（`302`／`早餐店`／`3樓之1`），
        系統不再假裝它是座標。`markerFloorOf` 只看 floor，不再解析 room。

   🔴 **代價，寫在這裡免得以後有人想不起來：**
      拿掉白格＝**再也沒有辦法表達「這裡應該有人，但我們沒收到消息」**。
      剩下唯一能防誤讀的，就是最上面那條不可關閉的提醒，和空分區裡那句
      「尚未有人通報這一區。這不代表這一區沒事。」——
      **那兩句話現在是這個畫面唯一的安全裝置，不准拿掉、不准收合。**

   🔒 **隱藏滿額／已結案的規則這下全面適用了**（`PUB-PS-216` 與 2026-08-22 排序裁示）。
      之前為矩陣開的例外（格子位置固定、不佔位）隨矩陣一起作廢：
      現在全部都是一維列表，滿額與結案的單**真的會把下面推遠**。
      → 改用「只看還缺人的」這顆開關，預設關閉（看得到全部）。
        預設不是隱藏 —— 隱藏要由人主動選，因為被藏起來的是別人的求助。
      ⚠️ `queryBuildingMarkers` 仍然自己查一次全部的單（含已結案），
         不沿用列表的 `sourceMarkers`。那是**分頁**與**結案過濾**兩個問題，
         跟這顆開關無關，不要因為矩陣沒了就把它改回去。

   🔒 **顏色沿用列表／地圖的那一套，不發明第三套。**
      `pending` 是 danger、`completed` 是 neutral（不是 success 綠）——
      綠色在參考站台是「報平安」，使用者的閱讀習慣是綠越多越安心；
      在這裡一格綠色代表「這件事處理完了」，而志工要找的是紅的。照抄會讀反。
   🔒 **不能只靠顏色。** 最重要的訊號（還缺幾人）用**文字**承載，
      而且放在最左邊固定寬度的欄位 —— 志工的視線往下掃一條直線就夠。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const { useState, useMemo, useEffect, useRef } = window.React;
  const DS = window.WanGuardDesignSystem_9c8f68;
  const { Button } = DS;
  const WGIcon = window.WGIcon;
  const Bridge = window.WGBridge;
  const SD = window.SiteData;

  const CLOSED = new Set(['completed', 'fulfilled', 'resolved', 'closed', 'cancelled', 'canceled']);
  const isClosedMarker = (mk) => CLOSED.has(String((mk.ticketMeta && mk.ticketMeta.status) || '').toLowerCase());

  /* 🔴 2026-09-21 ERD 查核：**兩個 `task_type` 名字一樣、意思不一樣**，不要混用。
       `tickets.task_type`      = 這張單是什麼事（search_rescue / medical_support /
                                  fire_response / supply_delivery / …）→ 決定圖示
       `ticket_tasks.task_type` = 這筆需求要什麼（hr / supply / rescue）→ 決定要不要算缺額
     （CLAUDE.md 2026-08-22 已記過正典 `TM-CF-120` 把兩張表的值混講成「四種」。）

     🔒 **尋人硬塞 `search_rescue`**（Sucre 2026-09-21）。ERD 沒有「尋找」這一類，
        新增 enum 要同時動正典與後端；尋人在語意上本來就屬搜救。
        民眾的原話仍然保留在 `ticket_tasks.task_name`（S-6 裁示），
        標題寫「尋人：陳○○ 68 歲男性」，畫面靠標題認人，不靠分類。 */
  const TICKET_KIND = {
    search_rescue:   { icon: 'Siren',      label: '搜救' },
    medical_support: { icon: 'HeartPulse', label: '醫療' },
    fire_response:   { icon: 'Flame',      label: '火災' },
    supply_delivery: { icon: 'Package',    label: '物資' },
  };
  const TICKET_KIND_FALLBACK = { icon: 'Wrench', label: '' };
  /* ⚠️ mock 的 `taskType` 是**中文自由文字**（「清淤」「人員撤離」），與 ERD 的英文
     enum 不符 —— 這是 mock 的問題，不是規格。正式版只走上面那張表；下面這幾個
     中文對照只為了讓 mock 還看得懂，**不要拿它當規格，也不要往裡面加詞**。 */
  const MOCK_CH = { '人員撤離': 'search_rescue', '搜救': 'search_rescue', '尋人': 'search_rescue',
    '物資配送': 'supply_delivery', '物資整理': 'supply_delivery' };
  const kindKeyOf = (mk) => {
    const raw = (mk.ticketMeta && mk.ticketMeta.taskType) || '';
    return TICKET_KIND[raw] ? raw : MOCK_CH[raw];
  };
  const ticketKindOf = (mk) => TICKET_KIND[kindKeyOf(mk)] || TICKET_KIND_FALLBACK;
  const isRescueTicket = (mk) => kindKeyOf(mk) === 'search_rescue'
    || (mk.tasks || []).some((t) => t.kind === 'rescue');

  /* `tickets.priority` 是 **NOT NULL** 四值，而且 S-5 裁示「民眾不選、後台裁定」——
     它是**被判斷過的**緊急度，可信度遠高於「還缺幾個人」。
     🔒 所以緊急度走 priority，**不走缺額**。缺額退成次要訊號。 */
  /* 🔴 2026-09-25 Sucre：「實作上這個應該不會放，但可以先空著。」
     → 文字標（最急／優先）先關掉，**左緣色條留著**（沒有它，列上就完全沒有緊急度）。
       排序仍然吃 priority。要整個拿掉的話把色條那行也改成固定灰。 */
  const SHOW_PRIORITY_MARK = false;

  const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
  const PRIORITY_MARK = {
    critical: { bar: 'var(--color-bg-danger)',  text: '最急', fg: 'var(--color-fg-danger)' },
    high:     { bar: 'var(--color-bg-warning)', text: '優先', fg: 'var(--color-fg-warning)' },
  };

  /** 一張單的狀態摘要。 */
  function summarizeTicket(mk, getTaskMatchState) {
    const st = getTaskMatchState(mk) || {};
    const closed = isClosedMarker(mk);
    /* 🔒 缺額只對 `hr`／`supply` 的需求有意義。`rescue` 的「缺 3」不是志工報名補得掉
       的數字，畫出來只會讓整排都是紅字 —— 那正是 2026-09-20 的回饋。 */
    const manpower = (st.needs || []).filter((n) => n.task.kind === 'hr' || n.task.kind === 'supply');
    /* 🔴 `ticket_tasks.quantity` 是 **nullable**，S-7 裁示「數量可留空」。
       `getNeedState` 為了顯示把 null 當 1，那是估值 —— 這裡要把「沒填」和「真的缺 1」
       分開講。把沒填人數畫成「滿額」是會誤導調度的謊。 */
    const hasQty = manpower.some((n) => typeof n.task.quantity === 'number' && n.task.quantity > 0);
    let lack = 0;
    if (!closed) manpower.forEach((n) => { lack += Math.max(0, n.state.required - n.state.matched); });
    const priority = String((mk.ticketMeta && mk.ticketMeta.priority) || 'medium').toLowerCase();
    return {
      st, closed, lack, priority,
      mark: closed ? null : PRIORITY_MARK[priority] || null,
      hasManpower: manpower.length > 0,
      qtyUnknown: manpower.length > 0 && !hasQty,
      tone: lack > 0 ? 'short' : closed ? 'closed' : 'full',
    };
  }

  /** 一疊單的彙總。 */
  function summarizeList(list, getTaskMatchState) {
    let lack = 0, rescueOpen = 0, closedCount = 0;
    (list || []).forEach((mk) => {
      const s = summarizeTicket(mk, getTaskMatchState);
      lack += s.lack;
      if (s.closed) closedCount += 1;
      else if (isRescueTicket(mk)) rescueOpen += 1;
    });
    return { lack, rescueOpen, closedCount, ticketCount: (list || []).length };
  }

  /* 排序沿用 S-12 的三層（還缺人 → 已滿額未完成 → 已結案）與「搜救優先、時間新→舊」，
     **中間插入 `priority`** 當第三順位。S-12 沒有講到 priority，這是補上、不是推翻。
     （S-12 的「等最久優先」已被 Sucre 推翻：久沒動的單很可能是過時資訊。） */
  const RANK = { short: 0, full: 1, closed: 2 };
  function sortForStack(list, getTaskMatchState) {
    return (list || []).slice().sort((a, b) => {
      const sa = summarizeTicket(a, getTaskMatchState), sb = summarizeTicket(b, getTaskMatchState);
      if (RANK[sa.tone] !== RANK[sb.tone]) return RANK[sa.tone] - RANK[sb.tone];
      const ra = isRescueTicket(a) ? 0 : 1, rb = isRescueTicket(b) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const pa = PRIORITY_RANK[sa.priority] != null ? PRIORITY_RANK[sa.priority] : 2;
      const pb = PRIORITY_RANK[sb.priority] != null ? PRIORITY_RANK[sb.priority] : 2;
      if (pa !== pb) return pa - pb;
      const ta = Date.parse((a.ticketMeta && a.ticketMeta.createdAt) || '') || 0;
      const tb = Date.parse((b.ticketMeta && b.ticketMeta.createdAt) || '') || 0;
      return tb - ta;
    });
  }

  /* 🔴 2026-09-25 UX：災後第 5 天，整排都是「4 天前」—— 那一欄就不再有資訊。
     24 小時內講相對時間（還在動的事），超過就講日期（要找回去的事）。 */
  function timeAgo(iso) {
    const t = Date.parse(iso || '');
    if (!isFinite(t)) return null;
    const d = Date.now() - t;
    if (d < 60e3) return '剛剛';
    if (d < 3600e3) return Math.floor(d / 60e3) + ' 分鐘前';
    if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小時前';
    const dt = new Date(t);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  /** 這個地址有沒有開啟分區。沒開回 null，呼叫端照原本的單張單流程走。 */
  function useBuildingForAddress(address) {
    const version = Bridge ? Bridge.useBridgeVersion() : 0;
    return useMemo(() => {
      if (!Bridge || !address) return null;
      return Bridge.buildingForAddress(address);
    }, [address, version]);
  }

  /* ── 窄任務單 ──────────────────────────────────────────────────────────
     一行上放四件事：還缺幾位｜是什麼事｜在哪一戶（自由文字）｜一句摘要。
     🔒 點下去開**既有的詳情面板**（`PUB-PS-101`：兩頁共用同一個詳情面板）。
        不要在這裡再長出第四份任務單呈現 —— 2026-09-18 已經犯過一次。 */
  /* 🔒 **欄位的價值來自差異。一整欄都長一樣，它就不是資訊，是裝飾。**
     `showKind`：這一棟只有一種任務類型時（火災現場全是 fire_response），圖示欄全部
        一樣 —— 不畫。兩種以上才出現。
     `showUnit`：這一區沒有任何一張單填了戶別時（車廂情境的常態），整欄不畫，
        連「未填戶別」也不畫 —— 有人填了，「未填」才真的是缺資訊。 */
  function TicketRow({ mk, getTaskMatchState, onOpenTicket, onClaimNeed, viewerId, isAuthenticated,
                       showKind, showUnit }) {
    const s = summarizeTicket(mk, getTaskMatchState);
    const kind = ticketKindOf(mk);
    const unit = SD.markerUnitLabel ? SD.markerUnitLabel(mk) : null;
    /* 放不進任何分區時，把使用者填的樓層原字顯示出來（「頂樓加蓋」）——
       他填了東西，只是我們解析不出來，不該讓它看起來像沒填。 */
    const rawFloor = (SD.markerFloorOf && SD.markerFloorOf(mk) === null && SD.markerFloorLabelOf)
      ? SD.markerFloorLabelOf(mk) : null;
    const where = [rawFloor, unit].filter(Boolean).join(' ');
    const when = timeAgo((mk.ticketMeta && mk.ticketMeta.createdAt) || null);
    const who = (mk.ticketMeta && (mk.ticketMeta.contactName || mk.ticketMeta.propertyName)) || null;

    /* 🔒 左緣色條承載 **priority**，不是缺額。3px 的線，不是一塊紅磚 ——
       訊號留著，重量降下來。 */
    const stripe = s.mark ? s.mark.bar : 'var(--color-border-default)';

    /* 缺額：只有 hr／supply 才出現，而且是灰底小字，不跟 priority 搶紅色。
       quantity 全為 null → 說「未指定人數」，不說「滿額」。 */
    const need = !s.hasManpower || s.closed ? null
      : s.qtyUnknown ? '未指定人數'
      : s.lack > 0 ? ('缺 ' + s.lack) : '人已到齊';

    /* 🔴 2026-09-21：最常見的動作不該需要先跳進詳情再跳回來。
       🔒 **只有「這張單剛好一筆需求」才給快捷鍵。** 兩筆以上按下去等於替他選了
          一筆，那是猜 —— 那種情況仍然進詳情，讓他自己挑（`PUB-PS-166`：承接的
          單位是需求不是任務單）。 */
    const needs = s.st.needs || [];
    const solo = (!s.closed && isAuthenticated && needs.length === 1) ? needs[0] : null;
    const canClaim = solo && solo.state.status !== 'matched' && solo.state.status !== 'deleted'
      && (solo.state.claimedBy || []).indexOf(viewerId) === -1
      && solo.state.matched < solo.state.required;

    return (
      <div style={{ display: 'flex', alignItems: 'stretch',
        borderTop: '1px solid var(--color-border-default)' }}>
        <button type="button" onClick={() => onOpenTicket(mk)}
          aria-label={[mk.title, SHOW_PRIORITY_MARK && s.mark ? s.mark.text : null, mk.label, need].filter(Boolean).join('，')}
          style={{
            appearance: 'none', textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0,
            display: 'flex', gap: 'var(--space-2)', alignItems: 'stretch',
            minHeight: 44, padding: 'var(--space-2)', background: 'none', border: 0,
          }}>
          <span aria-hidden="true" style={{ width: 3, flexShrink: 0, borderRadius: 2, background: stripe }} />
          {showKind ? (
            <span style={{ flexShrink: 0, paddingTop: 2 }} title={kind.label}>
              <WGIcon n={kind.icon} s={16}
                c={s.closed ? 'var(--color-fg-neutral-muted)' : 'var(--color-fg-neutral-subtle)'} />
            </span>
          ) : null}

          <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
            <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline' }}>
              <span style={{
                font: (s.closed ? '400 ' : '600 ') + 'var(--fs-13)/1.4 var(--font-body)',
                color: s.closed ? 'var(--color-fg-neutral-subtle)' : 'var(--color-fg-neutral-default)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mk.title}</span>
              {/* 🔒 `secondary_locations.room` 是 string，台北一戶可能切成三四間隔間，
                  「之2 B房」都寫得進來。這一區有人填過戶別時，沒填的那幾張才寫
                  「未填戶別」——**那時候它才是缺資訊，而不是這種災害用不到的欄位**。 */}
              {where || showUnit ? (
                <span style={{
                  flexShrink: 0, borderRadius: 'var(--radius-sm)', padding: '0 5px',
                  font: (where ? '600 ' : '400 ') + 'var(--fs-11)/1.6 var(--font-body)',
                  fontStyle: where ? 'normal' : 'italic',
                  background: where ? 'var(--color-bg-neutral-sunken)' : 'transparent',
                  color: where ? 'var(--color-fg-neutral-subtle)' : 'var(--color-fg-neutral-muted)' }}>
                  {where || '未填戶別'}
                </span>
              ) : null}
            </span>
            {[ (mk.subtitle || '').trim(), who, when ].filter(Boolean).length ? (
              <span style={{ display: 'block', marginTop: 1,
                font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[ (mk.subtitle || '').trim(), who, when ].filter(Boolean).join('　·　')}
              </span>
            ) : null}
          </span>

          {/* 右緣：狀態在上、缺額在下。兩行都是文字，沒有實心色塊。 */}
          <span style={{ flexShrink: 0, textAlign: 'right', paddingLeft: 'var(--space-2)' }}>
            <span style={{ display: 'block', whiteSpace: 'nowrap',
              font: (SHOW_PRIORITY_MARK && s.mark ? '700 ' : '400 ') + 'var(--fs-12)/1.4 var(--font-body)',
              color: SHOW_PRIORITY_MARK && s.mark ? s.mark.fg : 'var(--color-fg-neutral-muted)' }}>
              {/* 🔴 `critical` 原本在列表與詳情都沒有任何呈現（只判斷 === 'high'），
                  比 high 更嚴重卻看不出來。這裡兩級分開講。 */}
              {SHOW_PRIORITY_MARK && s.mark ? s.mark.text + '　' : ''}{mk.label}
            </span>
            {need ? (
              <span style={{ display: 'block', whiteSpace: 'nowrap', marginTop: 1,
                font: '400 var(--fs-11)/1.5 var(--font-body)',
                color: 'var(--color-fg-neutral-muted)' }}>{need}</span>
            ) : null}
          </span>
        </button>

        {/* 承接鈕是**主要鍵的兄弟，不是它的子元素** —— 巢狀 button 是無效的 HTML，
            而且點承接時不該連帶開啟詳情。
            🔒 命中區 44px。可以再擠的是留白，不是觸控目標（現場是晃動的車上、戴手套）。 */}
        {canClaim ? (
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center',
            padding: '0 var(--space-2) 0 0' }}>
            <Button size="sm" variant="secondary"
              onClick={(e) => { e.stopPropagation(); onClaimNeed(mk, solo.task); }}
              style={{ minHeight: 32, margin: '6px 0' }}>接這一筆</Button>
          </span>
        ) : null}
      </div>
    );
  }

  function SegmentSection({ name, alias, list, getTaskMatchState, onOpenTicket, onCreateHere,
                            onClaimNeed, viewerId, isAuthenticated, showKind,
                            showClosed, forceOpen, emptyText, note, isOpen, onToggle }) {
    const sum = summarizeList(list, getTaskMatchState);
    /* 戶別是**逐區**判斷的：一棟大樓可能只有幾層是分租套房，其他層沒人填戶別。 */
    const showUnit = useMemo(
      () => (list || []).some((mk) => SD.markerUnitLabel && SD.markerUnitLabel(mk)),
      [list]);
    /* 🔴 2026-09-25：舊的「只看還缺人的」篩的是 `lack > 0`。
       缺額改成只算 hr／supply 之後，**一張純搜救的單缺額是 0** ——
       勾下去會把搜救單全部藏掉，一個還沒找到的人會因為「他不缺人手」而消失。
       → 篩選改成只藏**已結案／已取消**。滿額但還沒完成的仍然顯示：滿額不等於解決。 */
    const shown = useMemo(() => {
      const sorted = sortForStack(list, getTaskMatchState);
      return showClosed ? sorted : sorted.filter((mk) => !isClosedMarker(mk));
    }, [list, showClosed, getTaskMatchState]);

    const open = forceOpen ? true : isOpen;
    const hot = sum.rescueOpen > 0;

    return (
      <div style={{
        borderRadius: 'var(--radius-md)', overflow: 'hidden',
        border: '1px solid ' + (hot ? 'var(--color-bg-danger)' : 'var(--color-border-default)'),
        background: sum.ticketCount ? 'var(--color-bg-neutral-default)' : 'var(--color-bg-neutral-subtle)',
        borderStyle: forceOpen ? 'dashed' : 'solid' }}>

        <button type="button" disabled={Boolean(forceOpen)}
          onClick={onToggle} aria-expanded={open}
          style={{
            appearance: 'none', width: '100%', minHeight: 44, background: 'none', border: 0,
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)', textAlign: 'left',
            cursor: forceOpen ? 'default' : 'pointer', color: 'var(--color-fg-neutral-default)' }}>
          {forceOpen ? <span style={{ width: 16 }} />
            : <WGIcon n={open ? 'ChevronDown' : 'ChevronRight'} s={16} c="var(--color-fg-neutral-muted)" />}
          <span style={{ font: '700 var(--fs-15)/1.3 var(--font-body)', flexShrink: 0 }}>{name}</span>
          {alias ? <span style={{ font: '400 var(--fs-12)/1.4 var(--font-body)',
            color: 'var(--color-fg-neutral-muted)', flexShrink: 1, minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alias}</span> : null}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
            {/* 🔒 標頭的主角是**還沒解決的搜救件數**，不是缺額總和。
                指揮要的是「哪一區還有人沒找到」；缺額是志工的視角，退成灰字。 */}
            {sum.rescueOpen > 0 ? (
              <span style={{ font: '700 var(--fs-11)/1.6 var(--font-body)', borderRadius: 'var(--radius-full)',
                padding: '1px 8px', background: 'var(--color-bg-danger)', color: 'var(--color-fg-on-danger)' }}>
                搜救 {sum.rescueOpen}</span>
            ) : null}
            {sum.lack > 0 ? (
              <span style={{ font: '400 var(--fs-11)/1.6 var(--font-body)',
                color: 'var(--color-fg-neutral-muted)', whiteSpace: 'nowrap' }}>缺 {sum.lack}</span>
            ) : null}
            <span style={{ font: '400 var(--fs-11)/1.6 var(--font-body)', borderRadius: 'var(--radius-full)',
              padding: '1px 8px', border: '1px solid var(--color-border-default)',
              color: 'var(--color-fg-neutral-muted)', whiteSpace: 'nowrap' }}>
              {sum.ticketCount ? sum.ticketCount + ' 張' : '尚無通報'}</span>
          </span>
        </button>

        {open ? (
          <div style={{ padding: '0 var(--space-3) var(--space-3)' }}>
            {note ? (
              <div style={{ font: '400 var(--fs-12)/1.6 var(--font-body)',
                color: 'var(--color-fg-neutral-subtle)', paddingBottom: 'var(--space-2)' }}>{note}</div>
            ) : null}

            {/* 🔒 空分區**必須寫字**，不能留白。
                沒有矩陣就沒有白格，這句話是這個畫面唯一還能表達
                「沒有消息不等於沒事」的地方。 */}
            {!sum.ticketCount ? (
              <div style={{ font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                {emptyText || '尚未有人通報這一區。這不代表這一區沒事。'}
              </div>
            ) : !shown.length ? (
              <div style={{ font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                這一區的 {sum.ticketCount} 張單都已經結案了。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {shown.map((mk) => (
                  <TicketRow key={mk.id} mk={mk} getTaskMatchState={getTaskMatchState}
                    onOpenTicket={onOpenTicket} onClaimNeed={onClaimNeed}
                    viewerId={viewerId} isAuthenticated={isAuthenticated}
                    showKind={showKind} showUnit={showUnit} />
                ))}
              </div>
            )}

            {onCreateHere ? (
              <Button variant="ghost" size="sm" onClick={onCreateHere}
                startIcon={<WGIcon n="Plus" s={14} />}
                style={{ marginTop: 'var(--space-2)' }}>在這一區請求協助</Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  /** 分區清單**當下畫出來的順序**，攤平成一維 —— 詳情面板的「上一張／下一張」照它走。
   *  🔒 兩邊順序必須同一個來源。各算各的話，「下一張」會變成瞬間移動。 */
  function buildingTicketOrder(building, markers, getTaskMatchState) {
    if (!building || !SD.groupMarkersBySegment) return [];
    const g = SD.groupMarkersBySegment(building, markers);
    const out = [];
    Bridge.buildingSegments(building).forEach((name) => {
      sortForStack(g.bySegment[name] || [], getTaskMatchState).forEach((mk) => out.push(mk));
    });
    sortForStack(g.unplaced, getTaskMatchState).forEach((mk) => out.push(mk));
    return out;
  }

  /* 🔴 2026-09-21 Sucre：「點開 ticket 卡片後又突然跳出去，然後再回來」。
     抽屜關掉會 unmount，`useState` 全部歸零 —— 12 層捲到一半點開一張單，
     回來要重找。**把展開狀態、篩選與捲動位置記在模組層**，以建築 id 為鍵。
     刻意不放 localStorage：這是同一次操作中的短期記憶，不是使用者的偏好設定，
     隔天再打開應該回到預設。 */
  const VIEW_MEMORY = {};

  function BuildingDrawer({ open, building, markers, getTaskMatchState, viewerId, isAuthenticated,
                            onClose, onClaimNeed, onOpenTicket, onCreateAtCell }) {
    const ActionDrawer = window.ActionDrawer;
    const memo = (building && VIEW_MEMORY[building.id]) || null;
    const [showClosed, setShowClosed] = useState(memo ? memo.showClosed : true);
    const [openMap, setOpenMap] = useState(memo ? memo.openMap : {});
    const bodyRef = useRef(null);

    const grouped = useMemo(
      () => (building ? SD.groupMarkersBySegment(building, markers) : { bySegment: {}, unplaced: [] }),
      [building, markers]);

    const totals = useMemo(() => {
      const all = (markers || []).filter((mk) => mk && mk.detailType === 'ticket');
      return summarizeList(all, getTaskMatchState);
    }, [markers, getTaskMatchState]);

    /* 這一棟出現過幾種任務類型。只有一種就不畫圖示（火災現場全是 fire_response，
       整欄一樣的圖示是裝飾不是資訊）。以**整棟**為單位判斷，不逐區 ——
       同一棟裡有的分區畫圖示、有的不畫，會讓列的結構在捲動時跳動。 */
    const showKind = useMemo(() => {
      const seen = new Set();
      (markers || []).forEach((mk) => {
        if (mk && mk.detailType === 'ticket') seen.add(ticketKindOf(mk).icon);
      });
      return seen.size > 1;
    }, [markers]);

    /* 存回記憶 ＋ 還原捲動位置。捲動要等內容畫完才還原，所以放在 effect 裡。 */
    useEffect(() => {
      if (!building || !open) return;
      VIEW_MEMORY[building.id] = { ...(VIEW_MEMORY[building.id] || {}), showClosed, openMap };
    }, [building, open, showClosed, openMap]);

    useEffect(() => {
      if (!building || !open) return;
      const el = bodyRef.current;
      const top = memo && memo.scrollTop;
      if (el && top) el.scrollTop = top;
      return () => {
        if (el) VIEW_MEMORY[building.id] = { ...(VIEW_MEMORY[building.id] || {}), scrollTop: el.scrollTop };
      };
    }, [building, open]);

    const segments = building ? Bridge.buildingSegments(building) : [];
    if (!open || !building || !ActionDrawer) return null;

    /* 預設展開「有未結案搜救」或「還缺人」的分區；使用者手動開合後以他的選擇為準。
       🔒 搜救排在缺人前面 —— 一個還沒找到的人，比清淤缺五個人更該先被看見。 */
    const segOpen = (key, list) => {
      if (Object.prototype.hasOwnProperty.call(openMap, key)) return openMap[key];
      const s = summarizeList(list, getTaskMatchState);
      return s.rescueOpen > 0 || s.lack > 0;
    };
    const toggleSeg = (key, list) => setOpenMap((m) => ({ ...m, [key]: !segOpen(key, list) }));

    return (
      <ActionDrawer open={open} onClose={onClose}
        title={building.alias || building.address}
        subtitle={building.address}>
        <div ref={bodyRef} style={{ display: 'grid', gap: 'var(--space-4)' }}>

          {/* 🔒 **固定顯示、不可關閉。**
              矩陣退場後，這條和空分區那句話是畫面上僅存的兩個安全裝置。
              自己刻不用 DS 的 Alert：Alert 收的是 tone 不是 variant，寫錯會安靜
              退回 info 藍，而這一條一旦變成藍色資訊框就不再像警告。 */}
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-warning-subtle)', border: '1px solid var(--color-border-accent)',
            font: '400 var(--fs-12)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-default)',
            display: 'flex', gap: 'var(--space-2)' }}>
            <WGIcon n="TriangleAlert" s={16} c="var(--color-fg-warning)" />
            <span>這裡<strong>只看得到已經被通報的</strong>。某一層沒有單，不代表那一層沒事 ——
              住戶可能斷訊、手機沒電，或本來就不會用這個平台。你可以替他們通報。</span>
          </div>

          {/* 總計 ＋ 隱藏開關。
              🔒 預設**不隱藏** —— 被藏起來的是別人的求助，要由人主動選。 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
            paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-border-default)' }}>
            {/* 🔒 **包含式**，預設開著 —— 與列表的 `PUB-PS-216`「含已滿額（N）」同一個講法。
                被藏起來的是別人的求助，要藏得由人主動做；帶數字，他才知道自己藏掉了幾張。 */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              minHeight: 44, cursor: 'pointer', font: '400 var(--fs-13)/1.4 var(--font-body)',
              color: 'var(--color-fg-neutral-subtle)' }}>
              <input type="checkbox" id="wg-building-show-closed" checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
                style={{ width: 16, height: 16, margin: 0, accentColor: 'var(--color-bg-primary)' }} />
              含已結案（{totals.closedCount}）
            </label>
            <span style={{ marginLeft: 'auto', font: '400 var(--fs-12)/1.4 var(--font-body)',
              color: 'var(--color-fg-neutral-muted)' }}>
              {totals.rescueOpen > 0 ? '搜救 ' + totals.rescueOpen + '　·　' : ''}
              {totals.ticketCount} 張單　·　{segments.length} 個分區
            </span>
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {segments.map((name) => {
              const list = grouped.bySegment[name] || [];
              return (
                <SegmentSection key={name} name={name} list={list}
                  getTaskMatchState={getTaskMatchState}
                  showClosed={showClosed}
                  isOpen={segOpen(name, list)} onToggle={() => toggleSeg(name, list)}
                  onOpenTicket={onOpenTicket}
                  onClaimNeed={onClaimNeed} viewerId={viewerId} isAuthenticated={isAuthenticated}
                  showKind={showKind}
                  /* 分區名稱就是要寫進 `secondary_locations.floor` 的那行字。 */
                  onCreateHere={() => onCreateAtCell({ floor: name, unit: null })} />
              );
            })}

            {/* 🔒 「未定位」**一定要在、不可摺疊、不可隱藏。**
                災害發生在前、後台輸入建築結構在後，所以一定會有一批舊單沒有樓層；
                開啟之後也仍然有人不知道自己在幾樓（鄰居代報、不確定門牌）。
                那一疊是還沒被放進任何分區的求助 —— 藏起來的話，畫面看起來很完整
                而實際上漏了人。 */}
            {grouped.unplaced.length ? (
              <SegmentSection name="未定位" forceOpen
                list={grouped.unplaced}
                getTaskMatchState={getTaskMatchState}
                showClosed={showClosed}
                onOpenTicket={onOpenTicket}
                onClaimNeed={onClaimNeed} viewerId={viewerId} isAuthenticated={isAuthenticated}
                showKind={showKind}
                note="知道在這一棟，但對不到任何分區 —— 開啟分區之前進來的單，通報者說不出位置，或寫法與分區名稱不一致。" />
            ) : null}
          </div>
        </div>
      </ActionDrawer>
    );
  }

  Object.assign(window, {
    BuildingDrawer, SegmentSection, TicketRow, buildingTicketOrder,
    summarizeTicket, summarizeList, sortForStack, useBuildingForAddress,
    isClosedBuildingMarker: isClosedMarker,
  });
})();
