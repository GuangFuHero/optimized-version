/* ═══════════════════════════════════════════════════════════════════════════
   直立地圖 —— 樓 × 室矩陣（2026-09-12）

   起點（Sucre 2026-09-12）：
     「一個地址可能有多層樓需要不同的協助……後台輸入某地址他有幾樓幾戶，
       所以開啟這個表格，然後前台的人才能看到並且勾選。」
     「裡面的資料不用參考他們的，直接使用我們的 ticket，
       也就是可能一戶有多張 ticket 或多張 task。」
     「除了格子以外，顏色不用特別參考，他的定義跟我們的不同，
       也許只要能讓大家理解即可。」

   🔒 為什麼顏色不照參考站台（宏福苑報平安）：**照抄會讀反。**
      那個站的綠色是「報平安」，紅色是「求救」，所以使用者的閱讀習慣是
      **綠色越多越安心**。本平台的綠／紅是任務狀態：`pending` 是 danger、
      `completed` 是 success。如果沿用它的配色直覺（把「已回報」做成綠色），
      就會把「有人求助」畫成綠的。
      → 矩陣不發明第三套顏色語言，直接沿用列表／地圖已經在用的那一套。
        使用者從列表點進矩陣，紅色還是紅色。

   🔒 顏色重量是**一條軸**，不是彩虹：紅 › 黃 › 灰 › 白 › 斜線。
      8×12 格同屏，四種以上同等重量的顏色會變成看不出重點的馬賽克。
      矩陣只有一個主角 —— 還缺人的格子。

   🔒 已結案用**灰**不用綠：綠色在一片格子裡和白色一樣讀作「這格沒事」，
      兩個都沒事卻用兩種顏色，是多記一條規則換不到資訊。

   🔒 **不能只靠顏色。** 現場是陽光下的手機，還有色盲使用者。
      所以最重要的那個訊號（還缺幾人）用**文字**承載：格子上直接寫「缺 3」。

   🔒 **白格不等於安全。** 只等於「沒有人為這一戶開單」——
      可能沒事，也可能是受困沒辦法開單（斷訊、沒電、獨居長者、不會用）。
      這在矩陣裡比在地圖上更危險：地圖上空白處使用者知道是沒資料，
      但白格被一堆有顏色的格子包圍著，看起來像已經確認過了。
      → 矩陣上方固定一行說明，**不可關閉**；白格**保持可點**（點下去建單），
        讓它從「沒資訊」變成「這裡可以通報」。

   🔒 **矩陣不套用「隱藏滿額／已完成」的規則**（`PUB-PS-216` 與 2026-08-22 排序裁示）。
      那兩條在列表裡對：列表是一維的，滿額的列會**佔位**把下面推遠。
      矩陣是二維的，格子位置固定，滿額的格子不佔任何人的位置 ——
      隱藏它沒省到東西，只是把「已結案」畫成白格，與「沒人通報」混為一談，
      上面那條警告就跟著失效。
      → `PUB-PS-216` 的適用範圍要限縮到**列表視角**，這條要進 spec。
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const { useState, useMemo, useCallback } = window.React;
  const DS = window.WanGuardDesignSystem_9c8f68;
  const { Button, Badge, Alert } = DS;
  const WGIcon = window.WGIcon;
  const Bridge = window.WGBridge;
  const SD = window.SiteData;

  const CLOSED = new Set(['completed', 'fulfilled', 'resolved', 'closed', 'cancelled', 'canceled']);
  const isClosedMarker = (mk) => CLOSED.has(String((mk.ticketMeta && mk.ticketMeta.status) || '').toLowerCase());

  /* 五種格子狀態。`tone` 是內部名字，不是 DS 的 tone。 */
  const CELL_TONE = {
    missing: { bg: 'var(--color-bg-neutral-sunken)', fg: 'var(--color-fg-neutral-muted)' },
    empty:   { bg: 'var(--color-bg-neutral-default)', fg: 'var(--color-fg-neutral-muted)' },
    short:   { bg: 'var(--color-bg-danger)', fg: 'var(--color-fg-on-danger)' },
    full:    { bg: 'var(--color-bg-warning)', fg: 'var(--color-fg-on-warning)' },
    /* 🔴 2026-09-13 實測修正：原本用 `--color-bg-neutral-subtle`，量出來是
       rgb(246,250,255) —— 跟白格的 rgb(255,255,255) 只差 9 階，螢幕上**看不出來**，
       更別說陽光下的手機。已結案與「沒有求助單」長得一樣，正是這個設計要避免的事。
       改用最深的中性底 `--color-bg-neutral-sunken`（rgb(237,242,247)），
       並把勾勾提到 `-subtle`。
       ⚠️ 它與「此戶不存在」同一個底色 —— 兩者靠**斜線填充**區分，不是靠色階。
          斜線是形狀訊號，在灰階、陽光下、色盲眼裡都還在。 */
    closed:  { bg: 'var(--color-bg-neutral-sunken)', fg: 'var(--color-fg-neutral-subtle)' },
  };

  /** 一格的彙總。一戶可能有多張單、每張多筆需求（2026-09-12 裁示）。
   *  底色取「最需要人」的那一層：只要有任一筆還缺人 → 紅；否則有進行中 → 黃；
   *  否則全部結案 → 灰。
   *  「缺 N」的 N 是**這一戶所有需求還缺的總人數** —— 志工看的是「我去這戶有沒有用」，
   *  不是「最缺的那一筆缺幾個」。 */
  function summarizeCell(list, getTaskMatchState) {
    let needCount = 0, shortBy = 0, hasShort = false, hasActive = false;
    (list || []).forEach((mk) => {
      const st = getTaskMatchState(mk);
      const needs = (st && st.needs && st.needs.length) ? st.needs.length : 1;
      needCount += needs;
      if (isClosedMarker(mk)) return;
      const lack = Math.max(0, (st.required || 0) - (st.matched || 0));
      if (lack > 0) { hasShort = true; shortBy += lack; } else hasActive = true;
    });
    const tone = hasShort ? 'short' : hasActive ? 'full' : 'closed';
    return { tone, needCount, shortBy, ticketCount: (list || []).length };
  }

  /** 這個地址有沒有開啟直立模式。沒開回 null，呼叫端照原本的單張單流程走。 */
  function useBuildingForAddress(address) {
    const version = Bridge ? Bridge.useBridgeVersion() : 0;
    return useMemo(() => {
      if (!Bridge || !address) return null;
      return Bridge.buildingForAddress(address);
    }, [address, version]);
  }

  /* ── 單一格子 ──────────────────────────────────────────────────────── */
  function MatrixCell({ building, floor, unit, list, getTaskMatchState, selected, onPick }) {
    const missing = Bridge.isCellMissing(building, floor, unit);
    const sum = missing ? null : summarizeCell(list, getTaskMatchState);
    const tone = missing ? 'missing' : (!list || !list.length) ? 'empty' : sum.tone;
    const c = CELL_TONE[tone];

    /* 「不存在」用**斜線填充**，不是淺一點的白 ——
       白格與斜線格必須一眼分得出來，否則「白格不等於安全」那條警告寫不出來。 */
    const hatch = missing
      ? 'repeating-linear-gradient(45deg, transparent 0 4px, var(--color-border-default) 4px 5px)'
      : 'none';

    const label = missing ? (Bridge.floorLabel(floor) + ' ' + unit + ' 室，此戶不存在')
      : tone === 'empty' ? (Bridge.floorLabel(floor) + ' ' + unit + ' 室，沒有求助單，可以在這裡通報')
      : tone === 'short' ? (Bridge.floorLabel(floor) + ' ' + unit + ' 室，還缺 ' + sum.shortBy + ' 位，共 ' + sum.needCount + ' 筆需求')
      : tone === 'full' ? (Bridge.floorLabel(floor) + ' ' + unit + ' 室，人已滿額、尚未完成')
      : (Bridge.floorLabel(floor) + ' ' + unit + ' 室，已結案');

    return (
      <button type="button" aria-label={label} aria-pressed={selected} disabled={missing}
        onClick={() => { if (!missing) onPick({ floor, unit }); }}
        style={{
          position: 'relative', minWidth: 0, height: 44, padding: 0,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid ' + (selected ? 'var(--color-brand-secondary-default)' : 'var(--color-border-default)'),
          boxShadow: selected ? 'var(--shadow-md)' : 'none',
          background: c.bg, backgroundImage: hatch, color: c.fg,
          cursor: missing ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          font: (tone === 'short' ? '700 ' : '400 ') + 'var(--fs-12)/1.1 var(--font-body)',
        }}>
        {missing ? null
          : tone === 'short' ? ('缺 ' + sum.shortBy)
          : tone === 'full' ? <WGIcon n="Check" s={16} c="currentColor" />
          : tone === 'closed' ? <WGIcon n="Check" s={14} c="currentColor" />
          : unit}
        {/* 角標＝這一戶有幾筆需求，**只在 ≥2 時出現** —— 1 筆時的「1」是噪音。 */}
        {!missing && sum && sum.needCount >= 2 ? (
          <span aria-hidden="true" style={{
            position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 'var(--radius-full)', background: 'var(--color-bg-neutral-default)',
            border: '1px solid var(--color-border-default)', color: 'var(--color-fg-neutral-default)',
            font: '700 var(--fs-10)/16px var(--font-body)', textAlign: 'center' }}>{sum.needCount}</span>
        ) : null}
      </button>
    );
  }

  /* ── 圖例：讓人看得懂的最低成本 ────────────────────────────────────── */
  function MatrixLegend() {
    const row = (tone, text, extra) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 16, height: 16, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border-default)', background: CELL_TONE[tone].bg,
          backgroundImage: extra || 'none', flexShrink: 0 }} />
        <span>{text}</span>
      </span>
    );
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3) var(--space-4)',
        font: '400 var(--fs-11)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
        {row('short', '還缺人')}
        {row('full', '人到齊、還在進行')}
        {row('closed', '已結案')}
        {row('empty', '沒有求助單')}
        {row('missing', '此戶不存在',
          'repeating-linear-gradient(45deg, transparent 0 4px, var(--color-border-default) 4px 5px)')}
      </div>
    );
  }

  /* ── 矩陣本體 ──────────────────────────────────────────────────────── */
  function BuildingMatrix({ building, byCell, getTaskMatchState, selected, onPickCell }) {
    const floors = Bridge.buildingFloors(building);
    const units = [];
    for (let u = 1; u <= building.unitsPerFloor; u++) units.push(u);
    const selKey = selected ? Bridge.cellKey(selected.floor, selected.unit) : null;
    /* 欄寬給下限，戶數多時整個矩陣橫向捲動 —— 不壓縮格子。
       壓到 40px 以下，「缺 3」就放不下，而那是志工唯一要讀的字。 */
    const cols = '34px repeat(' + units.length + ', minmax(44px, 1fr))';

    return (
      <div style={{ overflowX: 'auto', paddingBottom: 'var(--space-2)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, minWidth: 34 + units.length * 48 }}>
          <div />
          {units.map((u) => (
            <div key={'h' + u} style={{ textAlign: 'center', font: '500 var(--fs-11)/1.2 var(--font-body)',
              color: 'var(--color-fg-neutral-subtle)', paddingBottom: 2 }}>{u}</div>
          ))}
          {floors.map((f) => [
            <div key={'f' + f} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              paddingRight: 4, font: '500 var(--fs-11)/1.2 var(--font-body)',
              color: 'var(--color-fg-neutral-subtle)' }}>{Bridge.floorLabel(f)}</div>,
            ...units.map((u) => {
              const k = Bridge.cellKey(f, u);
              return <MatrixCell key={k} building={building} floor={f} unit={u}
                list={byCell[k]} getTaskMatchState={getTaskMatchState}
                selected={selKey === k} onPick={onPickCell} />;
            }),
          ])}
        </div>
      </div>
    );
  }

  /* ── 一格點開後的內容 ──────────────────────────────────────────────── */
  function CellNeedList({ building, cell, list, getTaskMatchState, viewerId, isAuthenticated,
                          onClaimNeed, onOpenTicket, onCreateAtCell }) {
    if (!cell) return null;
    const head = Bridge.floorLabel(cell.floor) + ' 樓 ' + cell.unit + ' 室';

    if (!list || !list.length) {
      return (
        <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
          border: '1px dashed var(--color-border-default)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ font: '600 var(--fs-14)/1.4 var(--font-body)' }}>{head}</div>
          {/* 白格點開後要給的是**出口**，不是一句「沒有資料」。 */}
          <div style={{ font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
            這一戶目前沒有任何求助單。如果你知道這裡需要幫忙，可以直接在這一戶通報。
          </div>
          <Button variant="secondary" onClick={() => onCreateAtCell(cell)}
            startIcon={<WGIcon n="Plus" s={16} />}>在這一戶請求協助</Button>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {/* 這一戶有兩張以上的單 —— 這一段是**選哪一張**，不是任務單的另一種呈現。
            所以只放足以分辨的資訊（標題、每筆需求還缺幾人），點標題進詳情看完整欄位。 */}
        <div style={{ font: '600 var(--fs-14)/1.4 var(--font-body)' }}>
          {head}<span style={{ font: '400 var(--fs-12)/1.4 var(--font-body)',
            color: 'var(--color-fg-neutral-subtle)', marginLeft: 8 }}>這一戶有 {list.length} 張單，選一張查看</span>
        </div>
        {list.map((mk) => {
          const st = getTaskMatchState(mk);
          const closed = isClosedMarker(mk);
          return (
            <div key={mk.id} style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-default)', display: 'grid', gap: 'var(--space-2)' }}>
              <button type="button" onClick={() => onOpenTicket(mk)}
                style={{ appearance: 'none', background: 'none', border: 0, padding: 0, textAlign: 'left',
                  cursor: 'pointer', font: '600 var(--fs-13)/1.4 var(--font-body)',
                  color: 'var(--color-fg-neutral-default)' }}>{mk.title}</button>
              {(st.needs || []).map((n) => {
                const lack = Math.max(0, n.state.required - n.state.matched);
                const mine = viewerId && (n.state.claimedBy || []).indexOf(viewerId) !== -1;
                const done = n.state.status === 'matched' || lack === 0;
                return (
                  <div key={n.task.id} style={{ display: 'flex', alignItems: 'center',
                    gap: 'var(--space-3)', paddingTop: 'var(--space-2)',
                    borderTop: '1px solid var(--color-border-default)' }}>
                    <span style={{ flex: 1, minWidth: 0, font: '400 var(--fs-13)/1.4 var(--font-body)' }}>
                      {n.task.name}
                      <span style={{ color: 'var(--color-fg-neutral-subtle)', marginLeft: 6 }}>
                        {n.state.matched}/{n.state.required}{lack ? '，還缺 ' + lack + ' 位' : ''}
                      </span>
                    </span>
                    {/* 命中區補到 44px —— 可以再擠的是留白，不是觸控目標。 */}
                    <Button size="sm" variant={done || closed ? 'ghost' : 'primary'}
                      disabled={closed || done || mine || !isAuthenticated}
                      onClick={() => onClaimNeed(mk, n.task)}
                      style={{ minHeight: 32, margin: '6px 0', flexShrink: 0 }}>
                      {closed ? '已結案' : mine ? '已承接' : done ? '已滿額'
                        : !isAuthenticated ? '登入後接' : '接這一筆'}
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        })}
        {/* 🔒 同一戶開多張單是**明文允許**的正常行為（Sucre 2026-09-12：
            「可能一戶有多張 ticket 或多張 task」），所以這裡是中性資訊，
            不是「疑似重複」的警告 —— 系統沒有在懷疑他，而且他很可能真的是
            第二件不同的事（一樓積水 ＋ 三樓有人受困）。 */}
        <Button variant="ghost" onClick={() => onCreateAtCell(cell)}
          startIcon={<WGIcon n="Plus" s={16} />}>這一戶還有別的事要幫忙</Button>
      </div>
    );
  }

  /* ── 整棟面板 ──────────────────────────────────────────────────────── */
  function BuildingDrawer({ open, building, markers, getTaskMatchState, viewerId, isAuthenticated,
                            onClose, onClaimNeed, onOpenTicket, onCreateAtCell }) {
    const [cell, setCell] = useState(null);
    const ActionDrawer = window.ActionDrawer;
    const grouped = useMemo(
      () => (building ? SD.groupMarkersIntoBuilding(building, markers) : { byCell: {}, unplaced: [] }),
      [building, markers]);

    const totals = useMemo(() => {
      let need = 0, lack = 0;
      (markers || []).forEach((mk) => {
        if (isClosedMarker(mk)) return;
        const st = getTaskMatchState(mk);
        need += (st.needs || []).length;
        lack += Math.max(0, (st.required || 0) - (st.matched || 0));
      });
      return { need, lack };
    }, [markers, getTaskMatchState]);

    if (!open || !building || !ActionDrawer) return null;
    const selKey = cell ? Bridge.cellKey(cell.floor, cell.unit) : null;

    return (
      <ActionDrawer open={open} onClose={onClose}
        title={building.alias || building.address}
        subtitle={building.address + '｜' + totals.need + ' 筆需求，還缺 ' + totals.lack + ' 位'}>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>

          {/* 🔒 白格語意說明 —— **固定顯示、不可關閉。**
              矩陣裡的白格被一堆有顏色的格子包圍著，看起來像「已經確認過了」。
              自己刻不用 DS 的 Alert：Alert 收的是 tone 不是 variant，寫錯會安靜
              退回 info 藍，而這一條一旦變成藍色資訊框就不再像警告。 */}
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-warning-subtle)', border: '1px solid var(--color-border-accent)',
            font: '400 var(--fs-12)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-default)',
            display: 'flex', gap: 'var(--space-2)' }}>
            <WGIcon n="TriangleAlert" s={16} c="var(--color-fg-warning)" />
            <span><strong>空白的格子不代表這一戶平安</strong>，只代表沒有人替這一戶通報。
              住戶可能斷訊、手機沒電，或本來就不會用這個平台。點空白格可以替他們通報。</span>
          </div>

          <MatrixLegend />

          {/* 🔴 2026-09-18 Sucre：「直立地圖的情境沒有符合我們任務單的欄位，
              應該設計成跟任務單一樣，每一個房間點下去都有自己的任務單。」

              他是對的，而且我原本做錯了方向：我在這個面板裡自己刻了一份精簡的
              需求清單，等於**發明了任務單的第三種呈現**（地圖詳情、列表卡片，
              再加這一份）。那一份沒有聯絡人、沒有地址、沒有狀態、沒有分享 ——
              使用者點進一戶，看到的不是「那一戶的任務單」，是我摘要過的東西。

              🔒 改法：**只有一張單的格子直接開既有的詳情面板**（`PUB-PS-101`：
                 兩頁共用同一個詳情面板，不該有第三份）。詳情面板裡本來就有
                 「查看整棟」可以回來，來回成立。
                 兩張以上才留在面板裡列出來 —— 那是**選哪一張**，是真的選擇，
                 不是另一種呈現。 */}
          <BuildingMatrix building={building} byCell={grouped.byCell}
            getTaskMatchState={getTaskMatchState} selected={cell}
            onPickCell={(c) => {
              const list = grouped.byCell[Bridge.cellKey(c.floor, c.unit)] || [];
              if (list.length === 1) { onOpenTicket(list[0]); return; }
              setCell(c);
            }} />

          <CellNeedList building={building} cell={cell} list={cell ? grouped.byCell[selKey] : null}
            getTaskMatchState={getTaskMatchState} viewerId={viewerId} isAuthenticated={isAuthenticated}
            onClaimNeed={onClaimNeed} onOpenTicket={onOpenTicket} onCreateAtCell={onCreateAtCell} />

          {/* 🔒 「未定位」**一定要在、不可摺疊、不可隱藏。**
              災害發生在前、後台輸入建築結構在後，所以一定會有一批舊單沒有戶室；
              直立模式開啟後也仍然有人不知道自己在幾樓幾戶（鄰居代報、不確定門牌）。
              那一疊是還沒被放上矩陣的求助 —— 藏起來的話，矩陣看起來很完整
              而實際上漏了人。 */}
          {grouped.unplaced.length ? (
            <div style={{ display: 'grid', gap: 'var(--space-2)', paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--color-border-default)' }}>
              <div style={{ font: '600 var(--fs-13)/1.4 var(--font-body)' }}>
                未定位（{grouped.unplaced.length}）
                <span style={{ font: '400 var(--fs-11)/1.4 var(--font-body)',
                  color: 'var(--color-fg-neutral-subtle)', marginLeft: 8 }}>沒有填樓層或戶室，還沒放上矩陣</span>
              </div>
              {grouped.unplaced.map((mk) => (
                <button key={mk.id} type="button" onClick={() => onOpenTicket(mk)}
                  style={{ appearance: 'none', textAlign: 'left', cursor: 'pointer', minHeight: 44,
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    background: 'var(--color-bg-neutral-default)',
                    font: '400 var(--fs-13)/1.4 var(--font-body)',
                    color: 'var(--color-fg-neutral-default)' }}>{mk.title}</button>
              ))}
            </div>
          ) : null}
        </div>
      </ActionDrawer>
    );
  }

  Object.assign(window, {
    BuildingMatrix, MatrixLegend, MatrixCell, summarizeCell, useBuildingForAddress,
    BUILDING_CELL_TONE: CELL_TONE, isClosedBuildingMarker: isClosedMarker,
    BuildingDrawer, CellNeedList,
  });
})();
