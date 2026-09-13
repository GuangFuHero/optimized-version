/* site-actions.jsx — 前台互動：站點修改建議、請求協助、任務媒合、分享
 * 對齊 repo：libs/modules/src/station/report/*、libs/modules/src/ticket/task-match/*、libs/modules/src/point-share/* */
(function () {
  const { useState, useCallback, useMemo } = React;
  const { Button, Badge, Field, Input, Alert, Tabs } = window.WanGuardDesignSystem_9c8f68;
  const R = window.SiteRoute;
  const Bridge = window.WGBridge;

  /* ── 站點修改建議：欄位級 ────────────────────────────────────────────────
   *
   * 2026-08-21 決議第五節：前台只能對既有站點提出「修改建議」，
   * 「這站關了／資訊錯了」視為 `operational_status` 的欄位修改，**不另立類型**。
   *
   * 舊版是「狀態 chip ＋ 一段自由文字」，送到後台審核佇列只剩一坨敘述，
   * 審核者得自己讀文字猜要改哪一欄。改成欄位級之後，
   * 每筆建議都是 `{ field, currentValue, suggestedValue }`，
   * 後台 `station-review-queue.jsx` 的 diff 才有東西可 diff，
   * 資料上也才對得上 `station_update_suggestions`。
   *
   * 排序刻意讓 `operational_status` 在第一個 —— 08-21 決議第六節：
   * 「這站關了」晚審一小時就有人白跑一趟，其餘欄位晚三天無妨。 */
  const STATION_STATUS_VALUE_OPTIONS = [
    { value: 'open', label: '開放中' },
    { value: 'paused', label: '暫停服務' },
    { value: 'closed', label: '已關閉' },
  ];

  const STATION_FIELD_OPTIONS = [
    { value: 'operational_status', label: '營運狀態', urgent: true, kind: 'enum',
      options: STATION_STATUS_VALUE_OPTIONS,
      read: (st) => st.status || 'open',
      helper: '站點現在還開不開？這一項會優先送審。' },
    { value: 'op_hour', label: '服務時間', kind: 'text',
      read: (st) => st.opHour || '',
      placeholder: '例：08:00–18:00', helper: '照現場實際看到的招牌或公告填寫。' },
    { value: 'name', label: '站點名稱', kind: 'text',
      read: (st) => st.title || '',
      placeholder: '現場實際掛的名稱' },
    { value: 'address', label: '地址／位置說明', kind: 'text',
      read: (st) => st.description || '',
      placeholder: '例：改到體育館後方，正門已封閉' },
    { value: 'station_type', label: '站點類型', kind: 'enum',
      options: () => (R.STATION_TYPE_OPTIONS || []).map((o) => ({ value: o.value, label: o.label })),
      read: (st) => st.type || '' },
    { value: 'supplies', label: '物資狀況', kind: 'text',
      read: () => '',
      placeholder: '例：飲用水見底、尿布尚有存量', helper: '缺什麼比有什麼更能驅動行動，優先寫缺的。' },
  ];
  const getStationField = (v) => STATION_FIELD_OPTIONS.find((o) => o.value === v) || STATION_FIELD_OPTIONS[0];
  const resolveFieldOptions = (field) => (typeof field.options === 'function' ? field.options() : field.options) || [];
  const labelOfValue = (field, value) => {
    const opts = resolveFieldOptions(field);
    const hit = opts.find((o) => o.value === value);
    return hit ? hit.label : (value || '未提供');
  };

  /* 站點資料在前台散在 marker 與 stationMeta 兩層，這裡收成一份給表單讀「現值」。 */
  const readStationSnapshot = (station) => {
    const meta = (station && station.stationMeta) || {};
    return {
      title: station && station.title, description: meta.description,
      status: meta.status, opHour: meta.opHour, type: meta.type,
    };
  };

  const createStationReportSummary = (report) =>
    report.fieldLabel + '：' + (report.currentLabel || '未提供') + ' → ' + report.suggestedLabel
    + (report.note ? '（' + report.note + '）' : '');
  const nowLabel = () => new Date().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  /** 站點修改建議（原型存於記憶體；正式為 `station_update_suggestions` mutation）。
   *  一筆建議 ＝ 一個欄位的 `現值 → 建議值`，這是後台審核 diff 的最小單位。 */
  /** 站點修改建議。
   *
   *  🔴 2026-09-11：從「該頁的 React state」搬到 `WGBridge`。
   *     原本送出之後只剩一個 toast，重整就沒了 —— 提報的人永遠不知道審了沒。
   *     搬進 bridge 之後才有「我回報的」這一頁可看（Sucre 要的統一顯示處）。
   *
   *  回傳的 `reportsByStationId` 形狀不變，站點詳情那一頁不用改。 */
  function useStationReports(viewerId) {
    const version = Bridge.useBridgeVersion();
    const mine = useMemo(() => Bridge.readStationReports(), [version]);
    const reportsByStationId = useMemo(() => {
      const out = {};
      mine.forEach((r) => { (out[r.stationId] = out[r.stationId] || []).push(r); });
      return out;
    }, [mine]);

    const submitStationReport = useCallback((station, values) => {
      const field = getStationField(values.field);
      const snapshot = readStationSnapshot(station);
      const current = field.read(snapshot);
      Bridge.pushStationReport({
        stationId: station.id,
        /* 站名一起存起來 —— 「我回報的」那一頁只有 id 的話，
           使用者看到的會是 `st-0004`，而他記得的是「中正路臨時廁所群」。 */
        stationTitle: station.title || station.id,
        field: field.value, fieldLabel: field.label,
        currentValue: current, currentLabel: field.kind === 'enum' ? labelOfValue(field, current) : current,
        suggestedValue: values.suggestedValue,
        suggestedLabel: field.kind === 'enum' ? labelOfValue(field, values.suggestedValue) : values.suggestedValue,
        urgent: Boolean(field.urgent),
        tone: field.urgent ? 'warning' : 'neutral',
        note: values.note,
        by: viewerId || null,
      });
    }, [viewerId]);

    return { reportsByStationId, submitStationReport };
  }

  /* ── 申請成為後台人員（AC-FEAT-002 角色升級申請）────────────────────────
   *
   * 🔴 在此之前，頂欄那顆「申請成為後台人員」是一條**死連結**：
   *    `href="#/apply-admin"`，點下去畫面毫無變化，而且**把路由狀態洗掉**
   *    （維度與篩選都寫在 hash 裡）。2026-09-11 回報後改成真的會送出。
   *
   * 照正典 `AC-RE-101`〜`107` 做，不自創流程：
   *   - `AC-RE-101` 只有沒有後台角色的人看得到入口（既有行為，不動）
   *   - `AC-RE-106` **同時只能有一筆待審** —— 已有待審就顯示那一筆，不給再送
   *   - `AC-RE-107` 被拒可以再送（2026-09-11 裁示：不設冷卻期）
   *
   * 🔒 2026-09-11 裁示（正典 Q1 BLOCKING 的答案）：
   *    **Super Admin 不列入可申請清單**（正典選項 A）。
   *    理由在正典裡：SA 只能自己降自己，發錯無法回收。
   *    日後若要開放，走選項 C —— **兩位在任的 SA 都批准才成立**，
   *    不是單一審核者。這一句要留著，不然下次有人會直接加進清單。
   *
   * 🔒 2026-09-11 裁示：**這一版只做 Government／Data Auditor 兩種。**
   *    正典 `AC-RE-102` 的第三種「加入指定團隊」**刻意不做** ——
   *    前台沒有任何團隊清單（`WG_MEMBERSHIPS` 是後台的），做它就得由我
   *    編一份團隊名單出來。團隊加入走 QR 邀請（`MEM-FEAT-002`），那條路本來就有。
   */
  const ROLE_REQUEST_OPTIONS = [
    { value: 'government', label: '政府單位人員',
      hint: '縣市政府、鄉鎮公所、各級應變中心的編制人員。審核者：超級管理員。' },
    /* 🔒 2026-09-11 Sucre：「申請成為後台人員要多一個社福團體。」
       對應平台角色 `ngo`（`AC-FEAT-001` 的五個平台角色之一），不是新角色。
       ⚠️ **與正典 `AC-RE-104` 有張力，要記著：** 那條說 NGO 這個平台角色是
          「由所屬團隊的 type **推導**出來的，不是指派的」，而且權威鏈因此仍回到
          超級管理員（團隊是他建的）。從這裡直接申請 `ngo` 等於**繞過那條推導**——
          申請人不屬於任何團隊，卻拿到 NGO 平台角色。
          目前照裁示做，但這一項要問工程：`user_role_assign` 直接寫 `ngo`
          會不會讓依賴「NGO ⇒ 有 team」的地方（例如可視範圍 scope）壞掉。 */
    { value: 'ngo', label: '社福團體人員',
      hint: '社福團體、基金會、協會等民間組織的工作人員。審核者：超級管理員。' },
    { value: 'data_auditor', label: '資料檢核員',
      hint: '協助檢查重複通報與資料正確性，唯讀為主。審核者：超級管理員。' },
  ];

  const ROLE_REQUEST_STATUS = {
    pending:  { label: '審核中', tone: 'warning' },
    approved: { label: '已通過', tone: 'success' },
    rejected: { label: '未通過', tone: 'neutral' },
  };

  function RoleElevationDrawer({ open, viewerId, onClose }) {
    const version = Bridge.useBridgeVersion();
    const mine = useMemo(() => Bridge.readRoleRequestsFor(viewerId), [viewerId, version]);
    const pending = mine.filter((r) => r.status === 'pending')[0] || null;
    const latest = mine[0] || null;

    const [role, setRole] = useState(null);
    const [reason, setReason] = useState('');
    const [contact, setContact] = useState('');
    const [touched, setTouched] = useState(false);
    React.useEffect(() => { if (open) { setRole(null); setReason(''); setContact(''); setTouched(false); } }, [open]);

    if (!open) return null;

    const opt = ROLE_REQUEST_OPTIONS.find((o) => o.value === role) || null;
    const missing = [];
    if (!opt) missing.push('要申請的身分');
    if (!reason.trim()) missing.push('申請理由');

    const submit = () => {
      setTouched(true);
      if (missing.length) return;
      Bridge.submitRoleRequest({ by: viewerId, role: opt.value, roleLabel: opt.label,
        reason: reason.trim(), contact: contact.trim() });
    };

    /* AC-RE-106：已有待審就**只顯示那一筆**，連表單都不給 ——
       「送出後被擋下」比「一開始就看得出不能送」差得多。 */
    if (pending) {
      return (
        <ActionDrawer open={open} title="申請成為後台人員" onClose={onClose}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Alert tone="info" title="你已經有一筆申請在審核中">
              同一時間只能有一筆申請。要改申請別的身分，請等這一筆有結果。
            </Alert>
            <RoleRequestCard row={pending} />
          </div>
        </ActionDrawer>
      );
    }

    return (
      <ActionDrawer open={open} title="申請成為後台人員"
        subtitle="後台人員可以派工、審核資料、管理站點。送出後由超級管理員審核。"
        onClose={onClose}
        footer={
          <React.Fragment>
            <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>取消</Button>
            <Button variant="primary" onClick={submit} style={{ flex: 2 }}>送出申請</Button>
          </React.Fragment>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* AC-RE-107：被拒過的人要看得到上一次的結果與理由，否則會重複送一模一樣的內容。 */}
          {latest && latest.status === 'rejected' ? <RoleRequestCard row={latest} /> : null}

          {/* 與建單表單的「你需要什麼幫忙」同一個問題（2026-09-13 回報）：
              自己刻的選擇區塊不會自動有 DS 的必填星號與錯誤樣式，要自己補。 */}
          <div>
            <div style={{ font: '700 var(--fs-14)/1.2 var(--font-latin)', color: 'var(--color-fg-neutral-default)',
              marginBottom: 'var(--space-2)' }}>你要申請哪一種身分？<span aria-hidden="true" style={{ color: 'var(--color-fg-danger)' }}>*</span></div>
            {touched && !opt ? (
              <span role="alert" style={{ display: 'block', marginBottom: 'var(--space-2)',
                font: '400 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-danger)' }}>
                請選擇一種身分
              </span>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {ROLE_REQUEST_OPTIONS.map((o) => {
                const active = o.value === role;
                return (
                  <button key={o.value} type="button" role="radio" aria-checked={active}
                    onClick={() => setRole(o.value)}
                    style={{ textAlign: 'left', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      border: '1px solid ' + (active ? 'var(--color-brand-secondary-default)' : 'var(--color-border-default)'),
                      background: active ? 'var(--color-bg-secondary-subtle)' : 'var(--color-bg-neutral-default)' }}>
                    <span style={{ display: 'block', font: (active ? 800 : 700) + ' var(--fs-14)/1.4 var(--font-body)',
                      color: 'var(--color-fg-neutral-default)' }}>{o.label}</span>
                    <span style={{ display: 'block', marginTop: 2, font: '400 var(--fs-12)/1.5 var(--font-body)',
                      color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>{o.hint}</span>
                  </button>
                );
              })}
            </div>
            {/* 🔒 這一段是刻意寫出來的，不是佔位文字。看不到自己要的選項時，
                使用者會以為是自己找不到 —— 直接告訴他那條路在哪裡。 */}
            <div style={{ marginTop: 'var(--space-2)', font: '400 var(--fs-12)/1.6 var(--font-body)',
              color: 'var(--color-fg-neutral-muted)', textWrap: 'pretty' }}>
              要加入某個救災團隊（NGO 或政府單位）請向該團隊索取邀請碼，不從這裡申請。
            </div>
          </div>

          <Field label="申請理由" required error={touched && !reason.trim() ? '必填' : undefined}
            helper="寫清楚你的單位、職務，以及為什麼需要後台權限">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              placeholder="例：我是光復鄉公所民政課，負責收容所名冊，需要在後台更新站點資訊。"
              style={textareaStyle}></textarea>
          </Field>

          <Field label="可聯絡到你的方式（選填）" helper="審核者可能需要向你確認身分">
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="公務電話、分機或 Email" />
          </Field>

          {touched && missing.length ? (
            <Alert tone="danger" title={'尚有 ' + missing.length + ' 項未完成'}>請補齊：{missing.join('、')}。</Alert>
          ) : null}
        </div>
      </ActionDrawer>
    );
  }

  function RoleRequestCard({ row }) {
    const meta = ROLE_REQUEST_STATUS[row.status] || ROLE_REQUEST_STATUS.pending;
    return (
      <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>
              {row.submittedAt} 送出
            </div>
            <div style={{ marginTop: 2, font: '700 var(--fs-15)/1.4 var(--font-display)',
              color: 'var(--color-fg-neutral-default)' }}>{row.roleLabel}</div>
          </div>
          <Badge tone={meta.tone} variant="subtle">{meta.label}</Badge>
        </div>
        {row.reason ? (
          <div style={{ marginTop: 'var(--space-2)', font: '400 var(--fs-13)/1.6 var(--font-body)',
            color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>{row.reason}</div>
        ) : null}
        {row.status === 'rejected' && row.decidedNote ? (
          <div style={{ marginTop: 'var(--space-2)', font: '400 var(--fs-13)/1.6 var(--font-body)',
            color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>
            審核回覆：{row.decidedNote}
          </div>
        ) : null}
      </div>
    );
  }

  /* ── 我的站點回報紀錄 ───────────────────────────────────────────────────
   *
   * 🔒 2026-09-11 Sucre：**另外開一個入口，不併進「我的任務」。**
   *    （我原本提議把兩者合併並改名「我的紀錄」，被否決 ——「加一個呀？」）
   *    他是對的：任務與站點是**兩種不同的東西**，任務是「有人要來幫我／我要去幫人」，
   *    站點回報是「這份公開資料有錯」。硬塞進同一個抽屜，分頁的標題就得抽象到
   *    「我的紀錄」那種誰都看不出內容的字，兩邊都變模糊。
   *
   * ⚠️ 審核狀態目前一律是「等待審核」——
   *    後端的 `station_update_suggestions` 不存在，沒有人會去改它。
   *    畫面把這件事講出來，不假裝有流程在跑。
   */
  const REVIEW_META = {
    pending:  { label: '等待審核', tone: 'warning', icon: 'Clock' },
    accepted: { label: '已採用',   tone: 'success', icon: 'CircleCheck' },
    rejected: { label: '未採用',   tone: 'neutral', icon: 'CircleSlash' },
  };

  function StationReportsDrawer({ open, viewerId, onClose, onOpenStation }) {
    const version = Bridge.useBridgeVersion();
    const rows = useMemo(() => Bridge.readStationReportsFor(viewerId), [viewerId, version]);
    if (!open) return null;

    return (
      <ActionDrawer open={open} title="我回報的站點"
        subtitle="你對資源站點提出的修改建議，以及審核進度"
        onClose={onClose}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-8) var(--space-4)', textAlign: 'center' }}>
            <span style={{ color: 'var(--color-fg-neutral-muted)' }}><WGIcon n="ClipboardCheck" s={28} /></span>
            <span style={{ font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
              你還沒有回報過站點。看到站點資訊不對（例如已經關了、水沒了），
              在該站點的詳情裡按「建議修改」。
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Alert tone="info" title="目前還沒有審核流程">
              建議已經送出並留下紀錄，但後台的審核介面尚未上線，所以狀態會一直停在「等待審核」。
            </Alert>
            {rows.map((r) => {
              const meta = REVIEW_META[r.review] || REVIEW_META.pending;
              return (
                <div key={r.id} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>
                        {r.submittedAt}
                      </div>
                      <div style={{ marginTop: 2, font: '700 var(--fs-15)/1.4 var(--font-display)',
                        color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>{r.stationTitle || r.stationId}</div>
                    </div>
                    <Badge tone={meta.tone} variant="subtle">{meta.label}</Badge>
                  </div>

                  {/* 🔒 一定要寫成「現值 → 建議值」。只寫建議值的話，
                      過一陣子回來看會分不出「我改了什麼」與「本來就長這樣」。 */}
                  <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    font: '400 var(--fs-13)/1.6 var(--font-body)' }}>
                    <span style={{ color: 'var(--color-fg-neutral-subtle)' }}>{r.fieldLabel}：</span>
                    <span style={{ color: 'var(--color-fg-neutral-muted)', textDecoration: 'line-through' }}>
                      {r.currentLabel || '（空白）'}
                    </span>
                    <WGIcon n="ArrowRight" s={14} c="var(--color-fg-neutral-muted)" />
                    <span style={{ font: '700 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>
                      {r.suggestedLabel || r.suggestedValue}
                    </span>
                    {r.urgent ? <Badge tone="warning" variant="subtle">優先送審</Badge> : null}
                  </div>

                  {r.note ? (
                    <div style={{ marginTop: 'var(--space-2)', font: '400 var(--fs-13)/1.6 var(--font-body)',
                      color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>{r.note}</div>
                  ) : null}

                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Button variant="outline" size="sm" onClick={() => onOpenStation(r.stationId)}>看這個站點</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ActionDrawer>
    );
  }

  /** 把一張**前台建立的**任務單（`WGBridge` 的形狀）換成 marker 用的需求清單。
   *  兩邊差在承接數：bridge 存的是 `assignees` 陣列，marker 用的是 `matched` 數字。
   *  沒有需求清單時回一筆兜底的，讓「以需求為單位」這條路徑不會有例外分支。 */
  function needsOf(ticket) {
    if (!ticket) return [];
    const rows = ticket.tasks || [];
    if (!rows.length) {
      return [{ id: (ticket.id || 'T') + '-K1', kind: 'hr', name: '現場需求', quantity: null, matched: 0 }];
    }
    return rows.map((k) => ({
      id: k.id, kind: k.kind, name: k.name, quantity: k.quantity,
      matched: typeof k.matched === 'number' ? k.matched : (k.assignees || []).length,
    }));
  }

  /** 承接狀態（接任務 / 釋出名額 / 刪除媒合單）。
   *
   *  🔒 2026-09-04 Sucre：**承接的單位是「需求」，不是「任務單」。**
   *     「開單時寫了兩個 task，但承接單子沒有問我要哪個」—— 先前整個 hook 都以
   *     `marker.id`（任務單）為鍵，所以連問這句話的地方都不存在。
   *
   *     這不是新需求，是實作沒跟上既有的兩份文件：
   *       - 正典 `PUB-PS-140`：「一張任務單可有多筆需求。志工以『需求』為單位承接。」
   *       - ERD `task_assignments`：UNIQUE(**task_uuid**, actor_uuid)
   *
   *  2026-08-22 決議：走共用 localStorage store（`WGBridge`），不再只存記憶體。
   *  理由：前台與後台是不同 HTML 檔，狀態只存 React state 的話，
   *  重整就沒了、後台也永遠看不到 —— 示範時打不開後台佐證。 */
  function useTaskMatches(viewerId) {
    const version = Bridge.useBridgeVersion();
    const stored = useMemo(() => Bridge.readTaskMatches(), [version]);

    /** 一筆需求的承接狀態。`quantity` 為 null（民眾沒填）時分母當 1 —— 這是
     *  **顯示用的估值**，`ticket_tasks.quantity` 本身仍然誠實地存 null。 */
    const getNeedState = useCallback((marker, task) => {
      const required = (typeof task.quantity === 'number' && task.quantity > 0) ? task.quantity : 1;
      const local = stored[Bridge.matchKey(marker.id, task.id)];
      if (local) return { ...local, required: local.required || required };
      const base = task.matched || 0;
      return { status: base >= required ? 'matched' : 'idle', matched: base, required, log: [] };
    }, [stored]);

    /** 整張單的彙總。給卡片與 Badge 用 —— 它回答「這張單還缺不缺人」，
     *  **不回答「按下去會接到什麼」**。要接請走 getNeedState ＋ claimNeed。 */
    const getTaskMatchState = useCallback((marker) => {
      const tasks = marker.tasks || [];
      if (!tasks.length) {
        /* 沒有需求清單的單（理論上不該存在，資料層一律補一筆）。
           不要在這裡偷偷退回任務單層 —— 那正是要修掉的行為。 */
        return { status: 'idle', matched: 0, required: marker.requiredVolunteers || 1, log: [], needs: [] };
      }
      const needs = tasks.map((task) => ({ task, state: getNeedState(marker, task) }));
      const matched = needs.reduce((n, x) => n + x.state.matched, 0);
      const required = needs.reduce((n, x) => n + x.state.required, 0);
      const status = needs.every((x) => x.state.status === 'deleted') ? 'deleted'
        : needs.every((x) => x.state.status === 'matched') ? 'matched'
        : needs.some((x) => x.state.status === 'claimed' || x.state.matched > 0) ? 'claimed'
        : 'idle';
      /* 紀錄合併時補上是哪一筆需求 —— 兩筆需求的「志工報名成功」混在一起
         會看不出誰是誰。 */
      const log = needs.flatMap((x) => (x.state.log || []).map((e) => ({ ...e, text: x.task.name + '：' + e.text })));
      return { status, matched, required, log, needs };
    }, [getNeedState]);

    /** 承接一筆需求。 */
    const claimNeed = useCallback((marker, task) => {
      const prev = getNeedState(marker, task);
      if (prev.status === 'matched' || prev.status === 'deleted') return;
      /* ERD `task_assignments` 有 **UNIQUE(task_uuid, actor_uuid)** ——
         同一個人對同一筆需求只能有一列，重複按不該讓人數往上加。
         ⚠️ 是「同一筆需求」不是「同一張單」：同一個人**可以**接同一張單的
         兩筆不同需求（2026-09-04 Sucre 確認），那是兩列合法的 assignment。 */
      const already = (prev.claimedBy || []).indexOf(viewerId) !== -1;
      if (viewerId && already) return;
      const matched = Math.min(prev.required, prev.matched + 1);
      const claimedBy = (prev.claimedBy || []).slice();
      if (viewerId) claimedBy.push(viewerId);
      Bridge.writeTaskMatch(marker.id, task.id, {
        ...prev, matched, claimedBy,
        status: matched >= prev.required ? 'matched' : 'claimed',
        /* 後台任務管理讀這幾個欄位就能顯示「前台有人接了這一筆」。 */
        claimedAt: Bridge.stamp(),
        source: 'site',
        taskName: task.name,          // 讓「我承接的」不必再回查 marker 才知道接了什麼
        ticketTitle: marker.title,
        log: [{ text: '志工報名成功，目前 ' + matched + '/' + prev.required + ' 人', at: nowLabel() }, ...(prev.log || [])],
      });

      /* ① 通知建立者：有人接了，而且是誰。 */
      const creator = ticketCreatorOf(marker);
      if (creator && creator !== viewerId) {
        Bridge.pushNotice({
          to: creator, kind: 'claimed', ticketId: marker.id, taskId: task.id,
          title: personaName(viewerId) + ' 承接了你的「' + task.name + '」',
          body: marker.title + '　目前 ' + matched + '/' + prev.required + ' 人',
          /* 同一個人接同一筆只會有一列 assignment，所以這個鍵天生唯一。 */
          dedupeKey: 'claim:' + marker.id + '#' + task.id + ':' + viewerId,
        });
      }
      /* ②-b 通知已承接的其他人：人湊齊了。
         這一則要在「這一次承接讓它變滿」的當下才發，補發沒有意義。 */
      if (matched >= prev.required) {
        (prev.claimedBy || []).forEach((uid) => {
          if (!uid || uid === viewerId) return;
          Bridge.pushNotice({
            to: uid, kind: 'need-full', ticketId: marker.id, taskId: task.id,
            title: '「' + task.name + '」已經湊齊人了',
            body: marker.title + '　你仍然在名單上，時間到請照常前往。',
            dedupeKey: 'full:' + marker.id + '#' + task.id,
          });
        });
      }
    }, [viewerId, getNeedState]);

    /** 刪除媒合單：整張單的每一筆需求一起關掉，不再接受報名。 */
    const deleteMatchSheet = useCallback((marker) => {
      const tasks = marker.tasks || [];
      const next = {};
      tasks.forEach((task) => {
        const prev = getNeedState(marker, task);
        next[task.id] = {
          ...prev, status: 'deleted', source: 'site',
          log: [{ text: '媒合單已刪除', at: nowLabel() }, ...(prev.log || [])],
        };
        /* ②-a 已經答應要去的人，一定要知道不用去了 ——
           這是這兩條通知裡唯一「不通知就會有人白跑一趟」的那一條。 */
        (prev.claimedBy || []).forEach((uid) => {
          if (!uid || uid === viewerId) return;
          Bridge.pushNotice({
            to: uid, kind: 'closed', ticketId: marker.id, taskId: task.id,
            title: '你承接的「' + task.name + '」已經取消',
            body: marker.title + '　建立者關閉了這張單，不用前往了。',
            dedupeKey: 'closed:' + marker.id + '#' + task.id + ':' + uid,
          });
        });
      });
      Bridge.writeTicketMatches(marker.id, next);
      return marker.id;
    }, [getNeedState, viewerId]);

    /** 釋出承接。答應了卻去不了，早點釋出名額比默默不出現好太多 ——
     *  建立者才有機會補人，而不是等到當天才發現沒人來。
     *  名額回銷，`claimedBy` 拿掉自己；若原本已滿額，狀態退回 `claimed`。
     *
     *  ⚠️ **ERD 沒有對應的狀態值。** `task_assignments.status` 只有
     *     `accepted / en_route / completed` —— **沒有 canceled / released**。
     *     所以正式版的「釋出」只能是**刪掉那一列**，履約紀錄會直接消失：
     *     查不出「這個人接了又放掉」，也算不出爽約率。
     *     （對照組：`ticket_tasks.status` 反而**有** `canceled`。）
     *     建議後端在 `task_assignments.status` 補一個 `released`，
     *     或加 `released_at` 讓那一列留著。這一項要回報，不是前端能自己解的。 */
    const releaseClaim = useCallback((ticketId, taskId, required) => {
      const prev = Bridge.readTaskMatch(ticketId, taskId);
      if (!prev) return;
      const claimedBy = (prev.claimedBy || []).filter((id) => id !== viewerId);
      const matched = Math.max(0, (prev.matched || 0) - 1);
      const need = required || prev.required || 1;
      Bridge.writeTaskMatch(ticketId, taskId, {
        ...prev, matched, claimedBy,
        status: matched === 0 ? 'idle' : (matched >= need ? 'matched' : 'claimed'),
        log: [{ text: '志工釋出名額，目前 ' + matched + '/' + need + ' 人', at: nowLabel() }, ...(prev.log || [])],
      });
    }, [viewerId]);

    /** 我承接的：從共用 store 反查，靠 `claimedBy` 認人。
     *  一列＝**一筆需求**，所以同一張單可能出現兩列（接了兩筆需求）。 */
    const myClaims = useMemo(() => {
      if (!viewerId) return [];
      return Object.entries(stored)
        .filter(([, m]) => m && m.status !== 'deleted' && (m.claimedBy || []).indexOf(viewerId) !== -1)
        .map(([key, m]) => {
          const { ticketId, taskId } = Bridge.splitMatchKey(key);
          return { ticketId, taskId, match: m };
        })
        .filter((row) => row.taskId);
    }, [stored, viewerId]);

    return { getTaskMatchState, getNeedState, claimNeed, deleteMatchSheet, releaseClaim, myClaims };
  }

  /* ── 前台通知的兩個發送點 ────────────────────────────────────────────────
   *
   * 🔒 2026-09-10 Sucre 裁示，**就這兩條，其他都不考慮**：
   *   ① 建立任務的人 —— 有人接了會收到通知，**而且要知道是誰接的**
   *   ② 承接任務的人 —— 那筆任務有異動也會通知他
   *
   * 「是誰接的」不是裝飾：建立者收到「有人會來」之後，下一個問題一定是
   * 「誰？我要怎麼認出他？」。只寫「有 1 人承接」等於逼他再開一次列表。
   *
   * 🚨 **「任何異動」在原型裡具體是哪些，是我判斷的（Sucre 只說「任何異動」）。**
   *    目前只有兩種真的會發生：
   *      a. 建立者把媒合單關了 → 你不用去了
   *      b. 這筆需求滿額了     → 人湊齊了
   *    正式版還會有：任務單被後台改地址／改時間／結案／取消。那些要等有編輯功能。
   */
  const personaName = (id) => {
    const list = window.SITE_PERSONAS || [];
    const hit = list.find((p) => p.id === id);
    return (hit && hit.name) || '一位志工';
  };
  const ticketCreatorOf = (marker) => (marker && marker.ticketMeta && marker.ticketMeta.createdBy)
    || (marker && marker._site && marker._site.createdBy) || null;

  /** 前台民眾建立的任務單（共用 store）。前台地圖／列表與後台任務管理讀的是同一份。 */
  function useSiteTickets() {
    const version = Bridge.useBridgeVersion();
    const siteTickets = useMemo(() => Bridge.readSiteTickets(), [version]);
    const createSiteTicket = useCallback((input) => Bridge.createSiteTicket(input), []);
    return { siteTickets, createSiteTicket };
  }

  /** 「我建立的」清單。**兩個來源都要讀**，地圖與列表共用同一支。
   *
   *  🔴 2026-09-10 修正的 bug：原本兩頁各自寫一份 `myCreated`，而且都只讀
   *     `Bridge.readSiteTickets()`（前台這一輪自己建的）。於是 persona
   *     「王志豪 · 建立者」的說明寫「有自己建立的任務單」，打開卻永遠是空的 ——
   *     他名下的單在 mock 資料裡，不在 bridge store 裡。
   *
   *  🔒 兩條刻意的規則：
   *    1. **含已結案／已完成／已取消。** 這一頁回答的是「我提過什麼、後來怎麼了」，
   *       是履歷不是待辦清單。把完成的藏起來，建立者會以為單子不見了。
   *    2. **同一個 id 以 bridge 版本為準。** 民眾自己改過的那一版才是最新的。
   */
  function useMyCreatedTickets(viewerId, getTaskMatchState) {
    const { siteTickets } = useSiteTickets();
    return useMemo(() => {
      if (!viewerId) return [];
      const D = window.SiteData;
      /* mock 那批的欄位名與 bridge 那批不同（uuid/propertyName vs id），
         在這裡正規化成同一個形狀，畫面就不必分兩種寫法。 */
      const fromMock = ((D && D.TICKETS) || [])
        .filter((t) => t.createdBy === viewerId)
        .map((t) => ({
          id: t.uuid, title: t.title, status: t.status,
          createdAt: String(t.createdAt || '').slice(5, 16).replace('T', ' ').replace('-', '/'),
          createdAtISO: t.createdAt,
          tasks: t.tasks || [],
          _site: { requiredVolunteers: t.requiredVolunteers || 1, createdBy: t.createdBy },
        }));
      const fromBridge = siteTickets.filter((t) => t._site && t._site.createdBy === viewerId);
      const byId = {};
      fromMock.concat(fromBridge).forEach((t) => { byId[t.id] = t; });   // bridge 後寫，蓋掉同 id 的 mock
      return Object.keys(byId).map((id) => byId[id])
        .sort((a, b) => String(b.createdAtISO || '').localeCompare(String(a.createdAtISO || '')))
        /* 承接改成以需求為單位之後，任務單層沒有單一列可讀了。
           這裡把整張單的需求彙總起來，只為了顯示「還缺幾人」。 */
        .map((t) => ({ ...t, _match: getTaskMatchState({ id: t.id, title: t.title, tasks: needsOf(t) }) }));
    }, [siteTickets, viewerId, getTaskMatchState]);
  }

  /* ── 共用小元件 ─────────────────────────────────────────────────────────── */

  /** 單選 chip 列。DS 沒有 Select 元件，前台原本就是手刻 chip，這裡抽出來共用。 */
  function ChipRadioGroup({ options, value, onChange, ariaLabel }) {
    return (
      <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(option.value)}
              style={{ minHeight: 40, padding: '0 16px', cursor: 'pointer', borderRadius: 'var(--radius-full)',
                border: '1px solid ' + (active ? 'var(--color-brand-secondary-default)' : 'var(--color-border-default)'),
                background: active ? 'var(--color-bg-secondary-subtle)' : 'var(--color-bg-neutral-default)',
                color: 'var(--color-fg-neutral-default)', font: (active ? 800 : 400) + ' var(--fs-13)/1.2 var(--font-latin)' }}>
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  const textareaStyle = {
    width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)',
    color: 'var(--color-fg-neutral-default)', font: '400 var(--fs-14)/1.6 var(--font-body)', resize: 'vertical',
  };

  /** 送出後的成功回饋。
   *  沒有回饋的話，使用者按下送出只看到抽屜關掉 —— 分不出「成功了」還是「壞掉了」，
   *  接著就會再送一次。這是重複單最常見的來源。
   *  auto-dismiss 給 6 秒：夠讀完，也夠按「查看」。 */
  function SiteToast({ open, title, description, actionLabel, onAction, onClose }) {
    React.useEffect(() => {
      if (!open) return undefined;
      const timer = setTimeout(onClose, 6000);
      return () => clearTimeout(timer);
    }, [open, onClose]);
    if (!open) return null;
    return (
      <WGPortal>
        <div role="status" aria-live="polite"
          style={{ position: 'fixed', zIndex: 200, left: '50%', bottom: 'var(--space-6)',
            transform: 'translateX(-50%)', width: 'min(420px, calc(100vw - 32px))',
            display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
            padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-bg-neutral-default)', boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--color-border-default)',
            animation: 'wgPop var(--duration-base) var(--ease-spring)' }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-fg-success)' }}>
            <WGIcon n="CircleCheck" s={20} c="var(--color-fg-success)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '700 var(--fs-14)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>{title}</div>
            {description ? (
              <div style={{ marginTop: 2, font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>{description}</div>
            ) : null}
            {/* ── 動作鈕：看得出是按鈕，但不搶著被按 ────────────────────────────
             *
             * 🔴 2026-09-10 回報：「看行前資訊這幾個字看起來不像是按鈕，
             *    但又不希望太顯著逼得人家不小心按過去。」
             *
             * 原本是 `variant="ghost"`（無框無底的純文字）擠在關閉的 X 旁邊。
             * 兩個問題：
             *   1. 沒有邊界的文字在 toast 裡讀起來像**說明的一部分**，不像可按的東西。
             *   2. 它就貼在關閉鈕左邊 —— 想關掉卻按到「看行前資訊」，
             *      代價是整頁跳走，而他剛承接完正想確認畫面。
             *
             * 🔒 所以改兩件事，缺一不可：
             *   ① `variant="outline"` —— **有框線**（一眼看得出可按）
             *      但**不是實心**（不會被誤認為這一步的主要動作）。
             *      加一個 ChevronRight 補上「按下去會離開這裡」的訊息。
             *   ② **移到自己的一行**，離開關閉鈕旁邊。誤觸的成本歸零，
             *      而想按的人反而更容易按到（44px 高、有明確邊界）。 */}
            {actionLabel ? (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Button variant="outline" size="sm" onClick={onAction}>
                  {actionLabel}<WGIcon n="ChevronRight" s={14} />
                </Button>
              </div>
            ) : null}
          </div>
          <button type="button" aria-label="關閉" onClick={onClose}
            style={{ flexShrink: 0, width: 28, height: 28, display: 'grid', placeItems: 'center',
              background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-full)',
              color: 'var(--color-fg-neutral-subtle)' }}>
            <WGIcon n="X" s={16} />
          </button>
        </div>
      </WGPortal>
    );
  }

  /* ── 抽屜 / 對話框外殼 ─────────────────────────────────────────────────── */

  /** 手機斷點。與 site-shell / site-map / site-list 用同一條線（767px）——
   *  三處不一致會出現「外殼收成手機版但抽屜還是桌機版」的錯位。 */
  function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    React.useEffect(() => {
      const mq = window.matchMedia('(max-width: 767px)');
      const on = (e) => setIsMobile(e.matches);
      setIsMobile(mq.matches);
      mq.addEventListener('change', on);
      return () => mq.removeEventListener('change', on);
    }, []);
    return isMobile;
  }

  /* ⚠️ z-index 必須高於地圖那些**同樣 portal 到 body** 的面板：
       圖層面板 1500、手機詳情 1450、狀態訊息 1400。
     先前寫 120 —— 在地圖頁開「請求協助」時，抽屜會被那幾個蓋住。
     它們都跳出 shell 的 isolation 直接掛在 body 上，所以只能靠數字比大小。 */
  const Z_ACTION_DRAWER = 1600;
  /* 從緊急公告下方開始，不蓋掉它（2026-09-10）。--wg-banner-h 由 an-banner.jsx 寫入，沒有公告時是 0px。 */
  const BELOW_BANNER = { position: 'fixed', top: 'var(--wg-banner-h, 0px)', left: 0, right: 0, bottom: 0 };
  const overlayStyle = { ...BELOW_BANNER, zIndex: Z_ACTION_DRAWER, display: 'flex' };
  const scrimStyle = { position: 'absolute', inset: 0, background: 'rgba(15,23,42,.42)' };

  /** 抽屜外殼。
   *
   *  **手機是 bottom sheet，桌機是右側抽屜。** 這不是裝飾 ——
   *  手機單手持握時拇指搆得到的是螢幕下緣；右側滑入的面板把主要動作推到最上面，
   *  等於要換手才按得到。底部彈出讓動作留在拇指區。
   *
   *  另外三件手機上會咬人的事：
   *   - `100vh` 在行動瀏覽器含會收起的網址列，用了會被裁掉 → 改 `dvh`
   *   - iPhone 底部有 home indicator → footer 要吃 `env(safe-area-inset-bottom)`
   *   - 內容區要 `-webkit-overflow-scrolling: touch`，否則慣性捲動很鈍 */
  function ActionDrawer({ open, title, subtitle, onClose, children, footer, fullHeight }) {
    const isMobile = useIsMobile();
    if (!open) return null;

    /* 高度交給 .wg-sheet（site.css）處理 vh/dvh 雙寫，這裡不設 maxHeight。 */
    /* `fullHeight`：內容想自己撐滿（分享面板要把 QR 放到最大，且不要捲動）。
       手機把 sheet 拉到 92dvh 的上限、桌機本來就是整條高。 */
    const panelStyle = isMobile ? {
      position: 'relative', width: '100%',
      height: fullHeight ? '92dvh' : undefined,
      marginTop: 'auto', display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg-neutral-default)', boxShadow: 'var(--shadow-lg)',
      borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
      animation: 'wgSheetUp var(--duration-base) var(--ease-out)',
    } : {
      position: 'relative', width: 'min(440px, 100vw)', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg-neutral-default)', boxShadow: 'var(--shadow-lg)',
      animation: 'wgSlideIn var(--duration-base) var(--ease-out)',
    };

    return (
      <WGPortal>
      <div style={{ ...overlayStyle, justifyContent: isMobile ? 'center' : 'flex-end' }}
        role="dialog" aria-modal="true" aria-label={title}>
        <div style={scrimStyle} onClick={onClose}></div>
        <div className={isMobile ? 'wg-sheet' : undefined} style={panelStyle}>
          {/* 手機的拖曳把手：告訴使用者這是可以往下關掉的東西。
              （目前只是視覺提示，手勢關閉未實作。） */}
          {isMobile ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, flexShrink: 0 }}>
              <span style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--color-border-default)' }}></span>
            </div>
          ) : null}

          {/* 🔴 2026-09-06 修：原本三處寫 var(--space-5)，DS 的間距刻度**跳過 5**
              （1/2/3/4/6/8/12/16/20/24）。未定義的 var() 會讓整條 padding 宣告失效 →
              **手機版每一個前台抽屜（請求協助／分享／修改建議／我的任務）的內容都貼著螢幕邊緣**，
              而且下面那條 footer 連 env(safe-area-inset-bottom) 一起失效，
              按鈕會壓在 iPhone 的 home indicator 下。
              取 --space-4（16px）：原意就是「手機比桌機的 24px 小一點」。 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', flexShrink: 0,
            padding: isMobile ? 'var(--space-4)' : 'var(--space-6)',
            borderBottom: '1px solid var(--color-border-default)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 抽屜標題：手機刻意比桌機小一階，但兩邊都走 --fs 刻度（2026-09-11 補）。 */}
              <div style={{ font: '700 var(--fs-20)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>{title}</div>
              {subtitle ? <div style={{ marginTop: 4, font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>{subtitle}</div> : null}
            </div>
            {/* 44px 是 iOS 的最小可點區建議值；原本 36px 在手機上常按不中。 */}
            <button type="button" aria-label="關閉" onClick={onClose}
              style={{ width: 44, height: 44, marginTop: -4, marginRight: -8, display: 'grid', placeItems: 'center',
                background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-full)',
                color: 'var(--color-fg-neutral-subtle)', flexShrink: 0 }}>
              <WGIcon n="X" s={20} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: fullHeight ? 'hidden' : 'auto', WebkitOverflowScrolling: 'touch',
            padding: isMobile ? 'var(--space-4)' : 'var(--space-6)' }}>{children}</div>

          {footer ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0,
              padding: isMobile
                ? 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))'
                : 'var(--space-4) var(--space-6)',
              borderTop: '1px solid var(--color-border-default)',
              background: 'var(--color-bg-neutral-default)' }}>{footer}</div>
          ) : null}
        </div>
      </div>
      </WGPortal>
    );
  }

  /** 站點修改建議 —— 欄位級（2026-08-21 決議第五節）。
   *  一次只改一個欄位：現值擺在左邊、建議值擺在右邊，送出的就是後台要 diff 的那一組。
   *  不做「回報類型」下拉 —— 決議明訂「這站關了」不另立類型，它就是 operational_status 的修改。 */
  function SiteStationReportDrawer({ open, station, reports, onClose, onSubmit }) {
    const isMobile = useIsMobile();
    const [fieldKey, setFieldKey] = useState(STATION_FIELD_OPTIONS[0].value);
    const [suggestedValue, setSuggestedValue] = useState('');
    const [note, setNote] = useState('');

    const field = getStationField(fieldKey);
    const snapshot = useMemo(() => readStationSnapshot(station), [station]);
    const currentValue = field.read(snapshot);
    const currentLabel = field.kind === 'enum' ? labelOfValue(field, currentValue) : (currentValue || '未提供');

    /* 換欄位時，建議值預填成現值 —— 使用者只需改動要改的那部分，不必整段重打。 */
    React.useEffect(() => {
      if (!open) return;
      const f = getStationField(fieldKey);
      setSuggestedValue(f.read(readStationSnapshot(station)) || '');
    }, [open, fieldKey, station && station.id]);
    React.useEffect(() => { if (open) { setFieldKey(STATION_FIELD_OPTIONS[0].value); setNote(''); } }, [open, station && station.id]);

    if (!open || !station) return null;

    const changed = String(suggestedValue || '').trim() !== String(currentValue || '').trim();
    const canSubmit = changed && String(suggestedValue || '').trim().length > 0;

    return (
      <ActionDrawer open={open} title="修改建議"
        subtitle={station.title + ' · 一次修改一個欄位，送交審核通過後才會公開更新'}
        onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose} style={{ flex: '0 0 auto' }}>取消</Button>
          <Button variant="primary" disabled={!canSubmit} style={{ flex: 1 }}
            onClick={() => onSubmit({ field: fieldKey, suggestedValue: String(suggestedValue).trim(), note: note.trim() })}>
            確認送出
          </Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          <div>
            <div style={{ font: '700 var(--fs-14)/1.2 var(--font-latin)', color: 'var(--color-fg-neutral-default)', marginBottom: 'var(--space-3)' }}>
              要修改哪一項？
            </div>
            <ChipRadioGroup ariaLabel="選擇要修改的欄位" options={STATION_FIELD_OPTIONS} value={fieldKey} onChange={setFieldKey} />
            {field.urgent ? (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Alert tone="warning" title="這一項會優先送審">
                  營運狀態的建議會排到審核佇列最前面 —— 「這站關了」晚審一小時就有人白跑一趟。
                </Alert>
              </div>
            ) : null}
          </div>

          {/* 現值 → 建議值。左右並排是刻意的：使用者送出前就看得到自己造成的 diff，
              與後台審核者看到的是同一組東西。 */}
          <div>
            <div style={{ font: '700 var(--fs-14)/1.2 var(--font-latin)', color: 'var(--color-fg-neutral-default)', marginBottom: 'var(--space-3)' }}>
              {field.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto minmax(0,1fr)',
              alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)', background: 'var(--color-bg-neutral-subtle)',
              border: '1px solid var(--color-border-default)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>目前</div>
                <div style={{ marginTop: 2, font: '400 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
                  {currentLabel || '未提供'}
                </div>
              </div>
              <span style={{ color: 'var(--color-fg-neutral-muted)' }}><WGIcon n="ArrowRight" s={16} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>你的建議</div>
                <div style={{ marginTop: 2, font: '700 var(--fs-13)/1.5 var(--font-body)',
                  color: changed ? 'var(--color-fg-neutral-default)' : 'var(--color-fg-neutral-muted)', textWrap: 'pretty' }}>
                  {(field.kind === 'enum' ? labelOfValue(field, suggestedValue) : suggestedValue) || '尚未填寫'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              {field.kind === 'enum' ? (
                <ChipRadioGroup ariaLabel={field.label} options={resolveFieldOptions(field)}
                  value={suggestedValue} onChange={setSuggestedValue} />
              ) : (
                <Input value={suggestedValue} placeholder={field.placeholder || ''}
                  aria-label={field.label} onChange={(e) => setSuggestedValue(e.target.value)} />
              )}
            </div>
            {field.helper ? (
              <div style={{ marginTop: 6, font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>{field.helper}</div>
            ) : null}
          </div>

          <Field label="補充說明（選填）" helper="只有審核人員看得到，不會公開顯示">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              placeholder="例：今天早上路過看到大門貼了公告"
              style={textareaStyle}></textarea>
          </Field>

          {(reports || []).length ? (
            <div>
              <div style={{ font: '700 var(--fs-14)/1.2 var(--font-latin)', color: 'var(--color-fg-neutral-default)', marginBottom: 'var(--space-3)' }}>已提交的建議</div>
              <StationReportHistoryPanel reports={reports} />
            </div>
          ) : null}
        </div>
      </ActionDrawer>
    );
  }

  /** 分享目標（對齊 createPointShareTarget：以路由狀態產生可重建的分享網址）。 */
  function createPointShareTarget({ marker, module, state, origin }) {
    const href = R.createSiteHref(module, { ...state, selectedMarkerId: marker.id });
    return {
      id: marker.id,
      title: marker.title + ' · 島嶼守望',
      description: marker.detailType === 'station' ? '救災站點資訊：' + marker.subtitle : '救災任務：' + marker.subtitle,
      url: (origin || '') + href,
      label: marker.label,
      detailType: marker.detailType,
    };
  }

  /* ── 分享 ────────────────────────────────────────────────────────────────
   * 2026-08-22 Sucre：分享要有 QR Code 與分享到社群的功能。
   *
   * 三條路徑，順序是**手機優先**：
   *   1. 系統分享（`navigator.share`）—— 手機上這是最短路徑，一鍵叫出原生面板，
   *      使用者裝了什麼 App 都在裡面。桌機瀏覽器多半沒有，所以不 render 而不是給顆死鈕。
   *   2. 指定通路 —— **LINE 排第一**，台灣災防現場的實際傳遞管道就是 LINE 群組。
   *   3. QR Code —— 現場列印張貼用。
   *
   * QR 用 vendored 的 `js/vendor/qrcode.js`（qrcode-generator v2.0.4），不走 CDN，
   * 理由見該檔檔頭：這張 QR 是要印出來貼在現場的，不該多一個掛掉就印不出來的相依。 */

  /** 各社群的分享網址。都是官方 web intent，不需要 SDK、不帶追蹤參數。 */
  const SHARE_TARGETS = [
    { key: 'line', label: 'LINE', icon: 'MessageCircle',
      href: (u, t) => 'https://line.me/R/msg/text/?' + encodeURIComponent(t + '\n' + u) },
    { key: 'facebook', label: 'Facebook', icon: 'Facebook',
      href: (u) => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u) },
    { key: 'threads', label: 'Threads', icon: 'AtSign',
      href: (u, t) => 'https://www.threads.net/intent/post?text=' + encodeURIComponent(t + '\n' + u) },
    { key: 'x', label: 'X', icon: 'Twitter',
      href: (u, t) => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t) + '&url=' + encodeURIComponent(u) },
  ];

  /** 產生 QR 的 SVG 字串。用 SVG 不用 canvas —— 列印不會糊，也可以直接另存。 */
  function useQrSvg(url, size) {
    return useMemo(() => {
      if (!url || !window.qrcode) return null;
      try {
        const qr = window.qrcode(0, 'M');   // 0 ＝ 自動選型號；M ＝ 中度容錯，貼在現場髒了一角仍讀得到
        qr.addData(url);
        qr.make();
        const cell = Math.max(2, Math.floor(size / (qr.getModuleCount() + 4)));
        return qr.createSvgTag({ cellSize: cell, margin: cell * 2 });
      } catch (e) {
        return null;                        // 網址過長等狀況：安靜降級成不顯示，不要整個抽屜炸掉
      }
    }, [url, size]);
  }

  function PointShareDrawer({ open, target, onClose }) {
    const isMobile = useIsMobile();
    const [copied, setCopied] = useState(false);
    /* QR 永遠產生（2026-09-11 起不再收合），所以不需要開合狀態。 */
    React.useEffect(() => { if (open) setCopied(false); }, [open, target && target.id]);

    const url = (target && target.url) || '';
    const shareText = (target && target.title) || '';
    const qrSvg = useQrSvg(open ? url : null, isMobile ? 200 : 200);
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    if (!open || !target) return null;

    const copy = () => {
      const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    };
    const nativeShare = () => {
      navigator.share({ title: target.title, text: target.description, url }).catch(() => {});
    };

    /* 分享磚：最小 76px 高，手指按得中；auto-fit 讓窄螢幕自己換行。 */
    const tile = {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 76, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)',
      color: 'var(--color-fg-neutral-default)', font: '500 var(--fs-12)/1.3 var(--font-body)',
      textDecoration: 'none', cursor: 'pointer',
    };

    /* ── 一屏放得下，不必往下捲（2026-09-11 Sucre）────────────────────────
     *
     * 「分享頁面不應該再往下滑動，滿版也沒關係，然後不用再另外打開 QR code，直接展開。」
     *
     * 分享是**一次性的動作**：打開 → 選一個管道 → 關掉。中間多一次捲動或
     * 多一次展開，都是在一個不需要思考的動作上加一層。
     *
     * 為了塞進一屏，砍掉兩樣重複的東西（不是縮小，是移除）：
     *   1. **唯讀的連結輸入框** —— 下面的「複製連結」磚做的是同一件事，
     *      而那一格是整個面板最高的一塊。真的要看網址的人按複製就有了。
     *   2. **目標卡的描述文字** —— 標題已經指名是哪一張單，描述是給還沒
     *      決定要不要分享的人看的，但他既然打開了分享就已經決定了。
     *
     * 🔒 QR 改成**永遠展開**。原本收合的理由是「多數分享是傳訊息不是掃碼」，
     *    但收合換來的是所有人都少一次選擇 —— 而要掃碼的人（現場張貼）
     *    偏偏是最不方便多按一次的那一群。 */
    return (
      <ActionDrawer open={open} title="分享" fullHeight
        onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Badge tone={target.detailType === 'station' ? 'secondary' : 'primary'} variant="subtle">{target.label}</Badge>
            <span style={{ font: '700 var(--fs-16)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>{target.title}</span>
          </div>

          {/* QR 直接展開，而且佔掉中間最大的一塊 —— 現場張貼是它唯一的用途，
              小到掃不到就完全沒有意義。`minHeight: 0` 讓它在矮螢幕上自己縮。 */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-subtle)' }}>
            {qrSvg ? (
              <React.Fragment>
                {/* 白底是必要的 —— 深色模式下 QR 反白就掃不出來 */}
                <div className="wg-share-qr"
                  style={{ background: '#fff', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', lineHeight: 0 }}
                  dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <span style={{ font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)', textAlign: 'center', textWrap: 'pretty' }}>
                  給現場的人掃，或長按另存後列印張貼。
                </span>
              </React.Fragment>
            ) : (
              <span style={{ font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>
                QR 產生器未載入，請確認 HTML 有引入 js/vendor/qrcode.js。
              </span>
            )}
          </div>

          {canNativeShare ? (
            <Button variant="primary" onClick={nativeShare} startIcon={<WGIcon n="Share2" s={16} />}>分享到⋯</Button>
          ) : null}

          <div style={{ flexShrink: 0 }}>
            <div style={{ font: '700 var(--fs-13)/1.2 var(--font-latin)', color: 'var(--color-fg-neutral-default)', marginBottom: 'var(--space-2)' }}>
              傳給別人
            </div>
            {/* 64 而不是 72：五個管道在 390px 上剛好排成一列（5×64 ＋ 4 個 gap ＝ 352）。
                72 會讓「複製連結」自己掉到第二行，為了一格多吃掉一整列的高度。 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 'var(--space-2)' }}>
              {SHARE_TARGETS.map((t) => (
                <a key={t.key} href={t.href(url, shareText)} target="_blank" rel="noopener noreferrer" style={tile}>
                  <WGIcon n={t.icon} s={20} c="var(--color-fg-neutral-subtle)" />
                  {t.label}
                </a>
              ))}
              <button type="button" onClick={copy} style={tile}>
                <WGIcon n={copied ? 'Check' : 'Link'} s={20} c="var(--color-fg-neutral-subtle)" />
                {copied ? '已複製' : '複製連結'}
              </button>
            </div>
          </div>
        </div>
      </ActionDrawer>
    );
  }

  /* ── 請求協助：前台民眾建立任務單 ──────────────────────────────────────────
   *
   * 對照後台建單（`js/admin/ticket/tk-form.jsx`）逐欄對齊，不自創欄位。
   *
   * ⚠️ 這**不是**災難報案窗口。2026-08-22 Sucre：
   *   「政府無法進入民宅協助傾土石，但是志工可以；民眾需要有人幫忙送餐點（老人）
   *     也是一種服務。當然受困也可能是⋯**但這個是少數**。」
   *
   * ── 與後台的對照 ──────────────────────────────────────────────────────
   *
   * 必填五項，與 `tk-form.jsx` 的 `missing` 檢查同一組：
   *   標題 · 地址 · 現場聯絡人 · 地標（座標）· 至少一筆需求
   *   ⚠️ 電話在後台是**選填**，前台跟著選填。先前前台把電話設成必填、姓名設成選填，
   *      正好跟後台相反，已修正。
   *
   * 需求清單（`ticket_tasks`）一個地點可有多筆，志工以「需求」為單位承接 ——
   *   這條是後台建單的既有設計，前台照做，不是簡化成一筆。
   *
   * 優先級：**前台不問**（2026-08-22 Sucre：「民眾不做優先級，應該是後台處理」）。
   *   送出時固定 `medium`，由後台人員後續調整（**不是審核閘門，單子已經在線上了**）。
   *   理由：民眾判斷不了相對急迫性 ——
   *   每個人的事對自己都是最急的，讓民眾自評只會全部變成最高優先，等於沒有優先級。
   *
   * ⚠️ 前台**沒有**歸屬單位欄位。後台建單要選「這張單開在哪一隊底下」，
   *   民眾沒有隊，這一欄由後台派工時指派。
   *
   * ── 需求種類的欄位對照（2026-08-22 補查 ERD）───────────────────────────
   *
   * ⚠️ 撞名警告（`任務管理-改版交接.md:99`）：
   *   `tickets.task_type`      = 搜救／醫療／火災／物資運送（事件性質）
   *   `ticket_tasks.task_type` = **人力 hr／物資 supply／搜救 rescue**  ← UI 用的是這個
   *
   * 唯一真相來源是 `window.TK_TASK_KIND`（`js/admin/ticket/tk-data.js:84`），只有三值。
   * 前台不直接給這三個字 —— 「人力」對阿嬤的家屬沒有意義，會亂選。
   * 前台給民眾語言，送出時映射回三值，**原始選擇寫進 `task_name`**，後台看得到民眾原話。
   *
   * ⚠️ 這層映射表是本次新增的，正典沒有。若後端日後擴充 `task_type`，這張表要跟著改。 */

  /** 民眾語言 → `ticket_tasks.task_type`。
   *  `kind` 一律是 TK_TASK_KIND 的三個 key 之一；`label` 進 `task_name`。 */
  const SITE_NEED_OPTIONS = [
    { value: 'cleanup',   label: '清淤／搬運',      kind: 'hr',     hint: '室內外清理、家具搬運、廢棄物清運' },
    { value: 'supplies',  label: '送餐／物資',      kind: 'supply', hint: '長輩、行動不便者的餐食與日用品' },
    { value: 'care',      label: '陪同／照顧',      kind: 'hr',     hint: '獨居長者探視、就醫陪同' },
    { value: 'repair',    label: '修繕',            kind: 'hr',     hint: '水電、屋頂、門窗的簡易修復' },
    { value: 'transport', label: '交通接送',        kind: 'hr',     hint: '往返收容所、醫院、市區' },
    { value: 'rescue',    label: '人員受困／急難',  kind: 'rescue', hint: '有人受困、失聯或受傷' },
  ];
  /* 找不到就回 null，**不要 fallback 到第一個**。
     回退成 SITE_NEED_OPTIONS[0] 會讓「還沒選」看起來像「選了清淤」，
     那正是先前預設值造假資料的同一個陷阱。 */
  const getNeedOption = (v) => SITE_NEED_OPTIONS.find((o) => o.value === v) || null;

  /** 前台一律送 medium，優先級由後台裁定（2026-08-22）。 */
  const SITE_DEFAULT_PRIORITY = 'medium';

  /* 需求列的空白起點。
   * ⚠️ `need` 刻意是 `null`，**不預選任何一種**。
   *    先前預設 'cleanup'，配上「至少一筆需求」的檢查，造成兩個問題：
   *      1. 檢查永遠通過（`filter(n => n.need)` 對預設值恆真）—— 死碼
   *      2. 有人來登記送餐、跳過這一段直接送出，後台收到「清淤／搬運」——
   *         **他從頭到尾沒選過清淤**。預設值靜默造假資料，比沒檢查更糟。
   * ⚠️ `quantity` 預設空字串。ERD 的 `ticket_tasks.quantity` 是 **nullable**，
   *    且 08-04 決議明載「報案當下還沒有需求⋯還沒拆成搜救幾人、物資幾件」。
   *    逼一個算不出來的人給數字，拿到的是假數字。 */
  const emptyNeed = () => ({ need: null, name: '', quantity: '' });

  /** 需求列，對齊後台 `tk-form.jsx` 的 `TaskRow`（種類／名稱／數量／可刪除）。 */
  function SiteNeedRow({ row, index, onChange, onRemove, canRemove, showIndex, invalid }) {
    const isMobile = useIsMobile();
    const opt = getNeedOption(row.need);   // 未選時為 null
    return (
      /* `invalid`：整張卡片轉成錯誤外框 ＋ 淡紅底。
         這一區沒有輸入框可以標紅（選項是 chip），所以錯誤狀態只能由**容器**承擔 ——
         只把某一顆 chip 標紅是錯的，問題是「一顆都沒選」，不是「選錯了」。 */
      <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
        border: '1px solid ' + (invalid ? 'var(--color-bg-danger)' : 'var(--color-border-default)'),
        background: invalid ? 'var(--color-bg-danger-subtle)' : 'var(--color-bg-neutral-subtle)' }}>
        {/* 🔒 2026-09-10 Sucre：**災民端全程不出現「需求」二字。**
            那是後台與志工端的詞。填單的人腦子裡是「我需要有人幫我做這件事」，
            不是「我要新增一筆 ticket_task」。
            只有一件事的時候連編號都不給 —— 一個人填一件事，不需要被告知
            他正在填的是「第 1 筆」，那只是在提前教他一個他不需要知道的結構。

            🔴 2026-09-11 修：上一版把標題字串換成空字串，但**那一列還在**，
               還帶著 marginBottom —— 於是卡片頂端多出一塊莫名其妙的空白，
               整個區塊看起來像沒排好（09-11 回報「task 都不見了，欄位要確認一下」）。
               沒有東西要顯示時就**整列不 render**，不是 render 一列空的。 */}
        {(showIndex || canRemove) ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 'var(--space-3)' }}>
            <span style={{ font: '700 var(--fs-12)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>
              {showIndex ? '第 ' + (index + 1) + ' 件' : ''}
            </span>
            {canRemove ? (
              <button type="button" onClick={onRemove} aria-label={'移除第 ' + (index + 1) + ' 件'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 0, cursor: 'pointer',
                  font: '400 var(--fs-12)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                <WGIcon n="Trash2" s={14} />移除
              </button>
            ) : null}
          </div>
        ) : null}
        <ChipRadioGroup ariaLabel={'你需要什麼幫忙（第 ' + (index + 1) + ' 件）'} options={SITE_NEED_OPTIONS}
          value={row.need} onChange={(v) => onChange({ ...row, need: v })} />

        {/* 🔒 **選了種類才問細節。**
            上一版一打開就擺著「說明」與「數量」兩個空欄位，而說明的 placeholder
            寫「先選上面的種類」—— 等於先給兩個現在不能填的欄位，再叫他回頭去填別的。
            災民看到的是一堆散落的框，不是「一件我需要的幫忙」。
            選了之後才長出來，這一塊才讀得出是一個完整的單位。 */}
        {opt ? (
          <React.Fragment>
            <div style={{ marginTop: 6, font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>
              {opt.hint || ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) 108px' : 'minmax(0,2fr) minmax(0,1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <Input value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })}
                aria-label={'第 ' + (index + 1) + ' 件的說明'}
                placeholder={opt.value === 'supplies' ? '例：晚餐便當' : '例：清淤人力、圓鍬'} />
              <Input value={row.quantity} onChange={(e) => onChange({ ...row, quantity: e.target.value })}
                type="number" min="1" aria-label={'第 ' + (index + 1) + ' 件需要幾個／幾人（選填）'} placeholder="幾個／幾人" />
            </div>
            <div style={{ marginTop: 6, font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>
              說明留空就用「{opt.label}」；數量不知道就留空，志工到現場再回報。
            </div>
          </React.Fragment>
        ) : (
          <div style={{ marginTop: 6, font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
            選一個最接近的，接著才會問細節。
          </div>
        )}
      </div>
    );
  }

  /* ── 疑似重複的比對 ────────────────────────────────────────────────────
   *
   * 起點：Sucre 2026-09-06「送求助單時，系統比對附近未結案的單，
   *      有找到相似的就跳提示給 user」；2026-09-10 定案三件事：
   *        ① 半徑不要 300 公尺（我原本提的，太大）→ **50 公尺**
   *        ② **只提示不擋，他仍然可以強行送出自己的單**
   *        ③ 「去原單留言」暫停 —— 後端沒有留言表，等之後再做
   *
   * 🔴 後端沒有任何東西可以接：ERD 27 張表 grep
   *    `suggest`/`correction`/`proposal`/`revision` 全部零筆。
   *    `ticket_tasks` 上的 `is_duplicate`/`dedup_group_id`/`confidence_score`
   *    是**後台事後**的 AI 去重，不是建單當下的比對。所以這整段是前端自己算的。
   *
   * 🚨 **50 這個數字是我取的，不是規格值。** 取捨：
   *    手機 GPS 誤差本來就有 10〜30 公尺，山區與樹下更差 —— 低於 30 公尺會被
   *    誤差本身吃掉，真的重複也比不到。50 公尺大約是「同一棟或隔壁幾戶」，
   *    再往上就會把整條街的鄰居都算成重複，提示變成雜訊。
   *    要調就改這一個常數。
   */
  const SITE_DUP_RADIUS_M = 50;

  /** 兩點間的公尺距離（haversine）。 */
  function metersBetween(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return Infinity;
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /** 中文沒有空白可斷詞，所以用 2-gram 比對。
   *  這不是斷詞，是**字面重疊** —— 「清淤」與「清理淤泥」抓得到，
   *  「清淤」與「鏟泥」抓不到。⚠️ 這是已知的上限，不是 bug。 */
  function bigrams(text) {
    const t = String(text || '').replace(/[\s，、。．.,／/（）()「」【】-]/g, '');
    const out = new Set();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  }
  function overlapRatio(a, b) {
    if (!a.size || !b.size) return 0;
    let hit = 0;
    a.forEach((g) => { if (b.has(g)) hit++; });
    return hit / Math.min(a.size, b.size);
  }

  const OPEN_TICKET_STATUSES = ['pending', 'in_progress', 'open'];

  /** 找出疑似重複的既有任務單。
   *  回傳 `[{ ticket, meters, reasons }]`，最多三筆，近的在前。
   *
   *  🔒 **三個訊號都只是「疑似」，任何一個都不足以判定。**
   *     所以每一筆都要把**理由**寫出來給人看（距離幾公尺、地址哪裡像、
   *     哪個詞重疊）—— 由填單的人決定是不是同一件事，不是由分數決定。
   *     這也是「只提示不擋」的前提：系統沒有把握，就不該替他做決定。 */
  function findPossibleDuplicates(draft) {
    const D = window.SiteData;
    const mine = { lat: draft.landmark && draft.landmark.lat, lng: draft.landmark && draft.landmark.lng };
    const myText = bigrams((draft.title || '') + (draft.needNames || []).join(''));
    const myAddr = bigrams(draft.address || '');

    const fromMock = ((D && D.TICKETS) || [])
      .filter((t) => OPEN_TICKET_STATUSES.indexOf(t.status) !== -1)
      .map((t) => ({
        /* mock 的 createdAt 是 ISO 字串，bridge 的是 "MM/DD HH:mm"。
           這裡統一成後者 —— 對話框裡要並排顯示，兩種格式混在一起讀起來像兩種東西。 */
        id: t.uuid, title: t.title, createdBy: t.createdBy,
        createdAt: String(t.createdAt || '').slice(5, 16).replace('T', ' ').replace('-', '/'),
        address: t.description || '',
        needNames: (t.tasks || []).map((k) => k.name),
        pos: (t.geometry && t.geometry.coordinates)
          ? { lat: t.geometry.coordinates[1], lng: t.geometry.coordinates[0] } : null,
      }));
    const fromBridge = Bridge.readSiteTickets()
      .filter((t) => OPEN_TICKET_STATUSES.indexOf(t.status) !== -1)
      .map((t) => ({
        id: t.id, title: t.title, createdBy: t._site && t._site.createdBy, createdAt: t.createdAt,
        address: t.street || '',
        needNames: (t.tasks || []).map((k) => k.name),
        pos: (t._site && t._site.lat != null) ? { lat: t._site.lat, lng: t._site.lng } : null,
      }));

    return fromMock.concat(fromBridge).map((t) => {
      const meters = metersBetween(mine, t.pos);
      if (!(meters <= SITE_DUP_RADIUS_M)) return null;
      const reasons = ['距離約 ' + Math.round(meters) + ' 公尺'];
      const addrHit = overlapRatio(myAddr, bigrams(t.address));
      const textHit = overlapRatio(myText, bigrams(t.title + t.needNames.join('')));
      if (addrHit >= 0.34) reasons.push('地址寫的地方很像');
      if (textHit >= 0.25) reasons.push('要幫的事情很像');
      return { ticket: t, meters, reasons, score: (addrHit + textHit) };
    }).filter(Boolean)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 3);
  }

  /** 疑似重複的提示。
   *
   *  🔒 **只提示不擋**（2026-09-10 Sucre）。所以：
   *    - 「還是要送出」是一顆**正常的按鈕**，不是灰掉、不是要再確認一次。
   *    - 標題問的是「是不是同一件事？」，不是「你確定嗎？」——
   *      後者是在暗示他做錯了，但他很可能是對的（隔壁鄰居也淹水）。
   *    - 災害中擋錯一次的代價，遠大於多一張重複單。後台本來就有去重。
   */
  function DuplicateWarnDialog({ matches, viewerId, onOpenTicket, onCancel, onSubmitAnyway }) {
    return (
      <WGPortal>
        <div style={{ ...BELOW_BANNER, zIndex: 2400, display: 'grid', placeItems: 'center',
          padding: 'var(--space-4)' }} role="dialog" aria-modal="true" aria-label="附近有類似的求助單">
          <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.5)' }}></div>
          <div style={{ position: 'relative', width: 'min(460px, 100%)', maxHeight: '84dvh',
            display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-bg-neutral-default)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-3)' }}>
              <div style={{ font: '700 var(--fs-17)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>
                附近已經有 {matches.length} 張類似的單
              </div>
              <div style={{ marginTop: 4, font: '400 var(--fs-13)/1.6 var(--font-body)',
                color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
                看一下是不是同一件事。如果不是（例如隔壁鄰居也需要幫忙），照樣送出就好。
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto',
              padding: '0 var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {matches.map((m) => (
                <button key={m.ticket.id} type="button" onClick={() => onOpenTicket(m.ticket.id)}
                  style={{ textAlign: 'left', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-subtle)',
                    cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>
                    {m.ticket.id} · {m.ticket.createdAt}
                    {m.ticket.createdBy && m.ticket.createdBy === viewerId
                      ? <Badge tone="info" variant="subtle">這是你建的</Badge> : null}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, font: '700 var(--fs-15)/1.4 var(--font-display)',
                    color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>{m.ticket.title}</span>
                  {m.ticket.needNames.length ? (
                    <span style={{ display: 'block', marginTop: 2, font: '400 var(--fs-13)/1.6 var(--font-body)',
                      color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
                      需要：{m.ticket.needNames.join('、')}
                    </span>
                  ) : null}
                  {/* 🔒 理由要寫出來。只說「疑似重複」等於要他相信一個他看不到的判斷；
                      寫出「距離約 12 公尺」他自己一秒就知道是不是同一戶。 */}
                  <span style={{ display: 'block', marginTop: 6, font: '400 var(--fs-12)/1.5 var(--font-body)',
                    color: 'var(--color-fg-neutral-muted)' }}>{m.reasons.join(' · ')}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-4)' }}>
              <Button variant="outline" onClick={onCancel} style={{ flex: 1 }}>回去修改</Button>
              <Button variant="primary" onClick={onSubmitAnyway} style={{ flex: 1 }}>不是同一件，送出</Button>
            </div>
          </div>
        </div>
      </WGPortal>
    );
  }

  /* ⚠️ 本元件由呼叫端**條件掛載**（`{open ? <SiteTicketCreateDrawer/> : null}`），不是自己 render null。
   *  這是必要的，不是風格選擇：
   *
   *  `LocationPicker` 在掛載當下如果 `value` 是空的，就會自動抓一次 GPS
   *  （`tk-locpicker.jsx:47` 的 `if (!value) locate()`，deps 是 `[]`，只看掛載那一刻）。
   *  而 React 的 effect 是**子元件先跑、父元件後跑**。
   *  先前用 `useEffect` 把 `seedLandmark` 塞進 state，跑的時機比 LocationPicker 的掛載 effect 晚，
   *  於是 GPS 回來就把使用者剛剛在地圖上點的位置蓋掉了 —— 這正是 2026-08-22 回報的 bug。
   *
   *  改成條件掛載之後，每次開啟都是全新的 mount，`useState` 的 initializer 會在
   *  **第一次 render 之前**就把座標放好，LocationPicker 掛載時 `value` 已經有值，不會自動定位。
   *
   *  行為分工（Sucre 2026-08-22）：
   *    從地圖點某個點位進來 → 地標＝**那個點**，不覆寫
   *    從頂欄「請求協助」按鈕進來 → 沒有 seed，維持自動定位＝**現在位置**
   *    任何時候按 LocationPicker 的「用目前定位」→ 明確要現在位置，才覆寫 */
  function SiteTicketCreateDrawer({ isAuthenticated, viewerId, seedLandmark, seedCell, onClose, onSubmit, onSignIn }) {
    const isMobile = useIsMobile();
    const [title, setTitle] = useState('');
    /* 直立地圖（2026-09-12，Q16 解讀 A）：從矩陣某一格起手時，地址／樓層／戶室
       都是**點出來的**，不是打出來的 —— 所以它們是結構化的（`floor` 是數字、
       `room` 是數字），而不是自由文字「3F」。
       ⚠️ 這正是既有的落差：自由文字地址拆不回 ERD 的
          county/city/lane/alley/no/floor/room 七欄。點格子建的單從此拆得回。
       lazy initializer：必須在第一次 render 前就有值（理由同下方 landmark）。 */
    const [address, setAddress] = useState(() => (seedCell && seedCell.building && seedCell.building.address) || '');
    const [floor, setFloor] = useState(() => (seedCell ? String(seedCell.floor) : ''));
    const [room, setRoom] = useState(() => (seedCell ? String(seedCell.unit) : ''));
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [desc, setDesc] = useState('');
    /* lazy initializer：必須在第一次 render 前就有值，理由見上方註解。 */
    const [landmark, setLandmark] = useState(() => seedLandmark || null);
    const [needs, setNeeds] = useState([emptyNeed()]);
    const [touched, setTouched] = useState(false);
    const open = true;

    if (!isAuthenticated) {
      return (
        <ActionDrawer open={open} title="請求協助" subtitle="登入後才能送出" onClose={onClose}
          footer={<>
            <Button variant="ghost" onClick={onClose} style={{ flex: '0 0 auto' }}>取消</Button>
            <Button variant="primary" startIcon={<WGIcon n="LogIn" s={16} />} onClick={onSignIn} style={{ flex: 1 }}>登入</Button>
          </>}>
          <Alert tone="info" title="為什麼要登入">
            志工會依照你留的資訊到現場，來源必須追得到，雙方才安心。登入可用 Email 或手機號碼註冊。
          </Alert>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Alert tone="warning" title="如果現在有人受困或受傷">
              請直接撥打 <strong>119</strong>，不要等這裡的流程。
            </Alert>
          </div>
        </ActionDrawer>
      );
    }

    /* 必填檢查與後台 tk-form.jsx 的 `missing` 同一組五項。 */
    /* 至少一筆需求 —— 三方一致：
     *   正典 TM-FEAT-004 AC-01「Citizen intake can create a Ticket **with at least one Task**」
     *   後台 `tk-form.jsx:81` 同一條檢查
     *   ERD `ticket_tasks.task_name` NOT NULL
     * 現在 `need` 預設為 null，這個 filter 才真的會擋。 */
    const namedNeeds = needs.filter((n) => n.need);
    /* 🔒 2026-09-11：missing 從「字串陣列」改成「帶 key 的物件」。
       字串只夠拿來寫那句話；要把畫面捲到那個欄位，就得知道它是**哪一個**。
       key 對應下面每個 Field 外面的 `data-field`。 */
    const missing = [];
    if (!title.trim()) missing.push({ key: 'title', label: '標題' });
    if (!landmark) missing.push({ key: 'landmark', label: '地標' });
    if (!address.trim()) missing.push({ key: 'address', label: '地址' });
    if (!contactName.trim()) missing.push({ key: 'contact', label: '現場聯絡人' });
    if (namedNeeds.length === 0) missing.push({ key: 'needs', label: '至少要選一項你需要的幫忙' });
    const needsInvalid = touched && namedNeeds.length === 0;

    /* getNeedOption 未選時回 null，所以要先取再判 —— 直接 `.kind` 會 TypeError。 */
    const hasRescue = needs.some((n) => {
      const o = getNeedOption(n.need);
      return Boolean(o) && o.kind === 'rescue';
    });

    /* 疑似重複的比對結果。`null` ＝ 還沒比對過；`[]` ＝ 比過了沒找到。 */
    const [dupMatches, setDupMatches] = useState(null);

    const buildPayload = () => ({
        title: title.trim(),
        address: address.trim(),
        floor: floor.trim() || null,
        /* 戶室與建築。三者都可為 null —— 不知道自己在幾樓幾戶的人（鄰居代報、
           不確定門牌的）仍然要能送出，那張單會落到矩陣旁的「未定位」。
           🔒 不要因為有了矩陣就把樓層變必填：填不出來的人會整張單送不出去，
              代價比資料不完整大得多。 */
        room: room.trim() || null,
        buildingId: (seedCell && seedCell.building && seedCell.building.id) || null,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        desc: desc.trim(),
        priority: SITE_DEFAULT_PRIORITY,          // 前台不問，後台調整
        landmark,
        tasks: namedNeeds.map((n) => {
          const opt = getNeedOption(n.need);
          return {
            kind: opt.kind,                        // ticket_tasks.task_type：hr / supply / rescue
            name: n.name.trim() || opt.label,      // 民眾原話進 task_name（ERD: task_name NOT NULL）
            /* 未填就送 null，不自動補 1 —— 對應 ERD 的 nullable。
               「不知道要幾個人」是真實答案，假的 1 會讓建立者以為已經講清楚了。 */
            quantity: n.quantity.trim() === '' ? null : Math.max(1, parseInt(n.quantity, 10) || 1),
            siteNeed: opt.value,                   // 保留民眾選的那一格，後台可看出原始語意
          };
        }),
      });

    /** 捲到第一個未完成的欄位並聚焦。
     *
     *  🔴 2026-09-11 Sucre：「尚有 3 項未完成…這裡應該要往上捲動到該欄位。」
     *  原本只在最底下印一句話，而缺的欄位常常在**兩螢幕以上**的地方 ——
     *  等於告訴他「有東西沒填」卻不告訴他在哪，他得自己從頭捲一遍去找。
     *  現場單手、戴手套、畫面在晃的時候，這一步就是放棄的地方。
     *
     *  🔒 `missing` 的順序**刻意與表單由上而下一致**，所以 `missing[0]`
     *     就是最上面那個缺的 —— 捲到它，其餘的自然在下面依序出現。
     *  focus 用 `preventScroll` —— 讓 scrollIntoView 決定捲到哪，
     *  不然瀏覽器自己的聚焦捲動會把欄位貼在畫面最上緣，看不到它的標籤。 */
    const scrollToMissing = () => {
      const first = missing[0];
      if (!first) return;
      const host = document.querySelector('[data-field="' + first.key + '"]');
      if (!host) return;
      host.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = host.querySelector('input, textarea, button');
      if (focusable) {
        try { focusable.focus({ preventScroll: true }); } catch (e) { /* 舊瀏覽器沒有 preventScroll */ }
      }
    };

    const submit = () => {
      setTouched(true);
      if (missing.length) { scrollToMissing(); return; }
      /* 🔒 比對只在**送出的那一刻**做一次，不是邊打字邊跳。
         打到一半就跳提示，等於在他還沒講完的時候說「你是不是在講別的東西」。 */
      if (dupMatches === null) {
        const hits = findPossibleDuplicates({
          landmark, address: address.trim(), title: title.trim(),
          needNames: namedNeeds.map((n) => n.name.trim() || (getNeedOption(n.need) || {}).label || ''),
        });
        setDupMatches(hits);
        if (hits.length) return;      // 先給他看，不擋 —— 對話框裡有「送出」
      }
      onSubmit(buildPayload());
    };

    return (
      <ActionDrawer open={open} title="請求協助"
        subtitle="說明你需要什麼幫忙，送出後志工就看得到並可以承接。"
        onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose} style={{ flex: '0 0 auto' }}>取消</Button>
          <Button variant="primary" onClick={submit} style={{ flex: 1 }}>送出</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {hasRescue ? (
            <Alert tone="danger" title="請先撥打 119">
              有人受困、失聯或受傷時，<strong>119 才是第一線</strong>。
              這張單補的是後續人力，不取代緊急救護。
            </Alert>
          ) : null}

          {/* DS 的必填星號帶 aria-hidden，讀螢幕的人聽不到 ——
              所以在表單開頭用一句話把規則講出來，不是只靠一個符號。
              放最上面而不是最下面：規則要在人開始填**之前**就知道。 */}
          <div style={{ font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
            標示 <span style={{ color: 'var(--color-fg-danger)', fontWeight: 700 }}>*</span> 的是必填，其餘可以留空。
          </div>

          {/* ── 地點資訊：欄位順序與後台建單一致 ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ font: '700 var(--fs-14)/1.2 var(--font-latin)', color: 'var(--color-fg-neutral-default)' }}>地點資訊</div>

            {/* helper 拿掉：placeholder 已經在示範同一件事，兩句話說一件事只是把表單拉長。
                `data-field` 是給驗證失敗時捲動定位用的，不是樣式掛鉤 —— 不要拿它寫 CSS。 */}
            <div data-field="title">
            <Field label="標題" required error={touched && !title.trim() ? '必填' : undefined}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)}
                invalid={touched && !title.trim()} placeholder="例：一樓客廳積泥需要幫忙清" />
            </Field>
            </div>

            {/* ── 先地標、再地址（2026-09-10 Sucre：「地標和地址要互換」）──────────
             *
             * 地標是隱藏必填（動態欄位決議 D-2）：地址是文字，山區與沒門牌的地方講不清楚；
             * 座標讓救援端可以直接導航。從地圖點進來的已經帶好，不用再點一次。
             *
             * 🔒 為什麼順序重要，不只是排版：
             *   標好點之後，「地址」要回答的問題就從「你家在哪」變成
             *   **「這個點怎麼跟人講」** —— 是對已知位置的補充，不是從零描述。
             *   反過來（先打地址再標點）等於要他用文字描述一次、再用手指描述一次同一件事。
             *   而且慌亂中打不出完整門牌的人，會卡在第一個必填欄位就放棄。 */}
            <div data-field="landmark">
            <Field label="地標" required
              helper={landmark ? undefined : '先在地圖上標好位置，下面的地址就只是補充說明'}
              error={touched && !landmark ? '請在地圖上標記位置' : undefined}>
              {/* 高度 200 → 176：地圖只要看得出「大頭針在哪一條街」就夠了，
                  它不是拿來瀏覽的（表單太長是 09-10 一起回報的）。 */}
              <window.LocationPicker value={landmark} onChange={setLandmark} invalid={touched && !landmark} height={176} />
            </Field>
            </div>

            {/* 地址與樓層併成一列 —— 手機也是。
                樓層只會填「3F」「透天」這種兩三個字，獨佔一整列不划算。 */}
            {/* 直立地圖：從矩陣某一格起手時，地址／樓層／戶室已經是點出來的，
                不要再叫他打一次 —— 那是問他一個他剛剛才回答過的問題。
                仍然保留「改一下」的出口：點格子點錯的人得有辦法改。 */}
            {seedCell ? (
              <div data-field="address" style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-secondary-subtle)', border: '1px solid var(--color-border-default)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <WGIcon n="Building2" s={18} c="var(--color-fg-neutral-subtle)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 var(--fs-13)/1.4 var(--font-body)' }}>
                    {(seedCell.building && (seedCell.building.alias || seedCell.building.address)) || address}
                    {'　'}
                    {window.WGBridge ? window.WGBridge.floorLabel(seedCell.floor) : seedCell.floor} 樓 {seedCell.unit} 室
                  </div>
                  <div style={{ font: '400 var(--fs-11)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                    {address}
                  </div>
                </div>
              </div>
            ) : (
            <div data-field="address" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) 80px 80px' : 'minmax(0,1fr) 110px 110px', gap: 'var(--space-3)' }}>
              <Field label="地址" required error={touched && !address.trim() ? '必填' : undefined}>
                <Input value={address} onChange={(e) => setAddress(e.target.value)}
                  invalid={touched && !address.trim()} placeholder="花蓮縣光復鄉中山路100號" />
              </Field>
              <Field label="樓層">
                <Input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="3" />
              </Field>
              {/* `room` 對齊 ERD `secondary_locations.room`（欄位早就存在，前台從沒寫過）。
                  維持**選填** —— 一層一戶的透天不需要它。 */}
              <Field label="戶／室">
                <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="2" />
              </Field>
            </div>
            )}

            {/* 手機也併成一列（2026-09-10 縮短表單）：兩欄都是短字串，
                而且它們回答的是同一個問題「現場找誰」，本來就該並排讀。 */}
            <div data-field="contact" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--space-3)' }}>
              {/* 填單的常常不是需要幫忙的本人（Sucre 2026-08-11：社工或在地青年代填），
                  所以問的是「現場找得到誰」。必填／選填與後台一致。 */}
              <Field label="現場聯絡人" required error={touched && !contactName.trim() ? '必填' : undefined}>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)}
                  invalid={touched && !contactName.trim()} placeholder="姓名 / 稱謂" />
              </Field>
              {/* 不限手機號碼（2026-08-22 Sucre）：「只要找得到人就好，怕有人不想填寫手機」。
                  電話對很多人是敏感資訊 —— 填不下去就整張單都不會送出。

                  ✅ 已查 ERD（`Backend/Spec/Docs/er-diagram.md`）：
                     `tickets.contact_phone` 是 `string, nullable`，**沒有格式限制**，
                     LINE ID 存得進去，不會被擋。
                  ⚠️ 但 ERD **沒有任何 IM／LINE 專用欄位**，所以這是「借用電話欄位裝別種聯絡方式」。
                     欄位名與內容語意不符，後續接手者讀 `contact_phone` 會預期是電話號碼。
                     建議後端加 `contact_im` 或把欄位改名為 `contact_method`。 */}
              <Field label="聯絡方式">
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="手機或 LINE ID" />
              </Field>
            </div>

          </div>

          {/* ── 需求清單：一個地點可有多筆，志工以「需求」為單位承接（同後台）── */}
          {/* 🔴 2026-09-13 Sucre：「沒有填『你需要什麼幫忙』那一塊，它不會變色跳警示，
              只有最下面寫還有一條未寫。」

              這一區塊是**自己刻的**，不是 DS 的 Field ——
              所以 DS 的必填星號與錯誤樣式都不會自動套上來，得自己補：
                ① 標題後面的紅色 `*`
                ② 未選時整張卡片轉成錯誤外框（見 SiteNeedRow 的 invalid）
                ③ 區塊自己的一行錯誤訊息，不是只靠最下面那個總結
              🔒 錯誤訊息放在**標題下方、卡片上方** —— 使用者的視線在這裡，
                 不是在他還沒捲到的頁尾。 */}
          <div data-field="needs" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ font: '700 var(--fs-14)/1.2 var(--font-latin)', color: 'var(--color-fg-neutral-default)' }}>
                你需要什麼幫忙？<span aria-hidden="true" style={{ color: 'var(--color-fg-danger)' }}>*</span>
              </span>
              {needs.length > 1 ? <Badge tone="neutral" variant="subtle">{needs.length}</Badge> : null}
            </div>
            {needsInvalid ? (
              <span role="alert" style={{ font: '400 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-danger)' }}>
                請至少選一項你需要的幫忙
              </span>
            ) : null}
            {needs.map((row, i) => (
              <SiteNeedRow key={i} row={row} index={i} showIndex={needs.length > 1}
                invalid={needsInvalid && !row.need}
                onChange={(next) => setNeeds((rs) => rs.map((r, idx) => (idx === i ? next : r)))}
                onRemove={() => setNeeds((rs) => rs.filter((_, idx) => idx !== i))}
                canRemove={needs.length > 1} />
            ))}
            {/* 🔒 「還需要別的嗎？」只在**上一件已經選好種類**之後才長出來。
                先前這顆按鈕一直都在，等於在人還沒填完第一件時就先告訴他
                「這裡可以填很多筆」—— 那是把後台的資料結構提前攤給災民看。
                不預先擺一列空白的第二筆，理由同上。 */}
            {needs[needs.length - 1] && needs[needs.length - 1].need ? (
              <button type="button" onClick={() => setNeeds((rs) => [...rs, emptyNeed()])}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42,
                  borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border-default)', background: 'transparent',
                  cursor: 'pointer', font: '500 var(--fs-14)/1.2 var(--font-body)', color: 'var(--color-brand-secondary-default)' }}>
                <WGIcon n="Plus" s={16} />還需要別的嗎？
              </button>
            ) : null}
          </div>

          {/* ── 補充說明擺在需求**之後** ────────────────────────────────────
           *
           * 🔴 2026-09-11 Sucre：「狀況描述在前、你需要什麼幫忙在後 ——
           *    先寫一堆字，然後才發現可以分開開單，感覺會很不好。」
           *
           * 他說中了一個會產生壞資料的問題，不只是感覺：
           * 一個「請描述你的狀況」的大方框放在最前面，人會把整件事寫成一段話
           * （「我家積泥要清，阿嬤還需要有人送飯」），**然後才被告知這要拆開選**。
           * 多數人不會回頭拆 —— 他會在下面隨便選一個，結果**兩件事只有一件
           * 會被志工看到**，而另一件永遠沒有人來。
           *
           * 🔒 所以先問結構、再給自由欄位。而且這個欄位要重新定義：
           *    它問的是**關於這個地方跟這個人**（通道、時段、狀況），
           *    不是「你需要什麼」—— 後者上面已經問完了。
           *    placeholder 因此拿掉「積泥大約到腳踝」這種描述需求本身的例子，
           *    換成巷弄與時段這類**拆不進任何一件幫忙、但志工出發前必須知道**的事。 */}
          <Field label="還有什麼要讓志工知道的？（選填）">
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              placeholder="例：巷子窄，小貨車進不來。阿嬤一個人住，早上九點到下午三點都在家。"
              style={textareaStyle}></textarea>
          </Field>

          {touched && missing.length > 0 ? (
            <Alert tone="danger" title={'尚有 ' + missing.length + ' 項未完成'}>
              請補齊：{missing.map((m) => m.label).join('、')}。
            </Alert>
          ) : null}

          {/* 疑似重複：只提示不擋。「回去修改」把結果清掉，改完再送會重新比對一次；
              「不是同一件，送出」直接送。兩條路都不會把他困在這裡。 */}
          {dupMatches && dupMatches.length ? (
            <DuplicateWarnDialog matches={dupMatches} viewerId={viewerId}
              onOpenTicket={(id) => { setDupMatches(null); onClose(); window.openSiteTicket && window.openSiteTicket(id); }}
              onCancel={() => setDupMatches(null)}
              onSubmitAnyway={() => { setDupMatches([]); onSubmit(buildPayload()); }} />
          ) : null}

        </div>
      </ActionDrawer>
    );
  }

  /* ── 我的任務 ────────────────────────────────────────────────────────────
   * 2026-08-22 Sucre：右上角個人選單要找得到自己處理過的任務單。
   *
   * 做成**一個入口兩個分頁**，不是兩個選單項 —— 對同一個人來說這是同一件事的兩面，
   * 而且操作會連動（看到自己建的單有人接了，下一步常常就想看自己接了什麼）。
   *
   * 兩個分頁的閱讀動機不同，所以呈現的重點也不同：
   *   我建立的 → **進度**：有沒有人接、接了幾個
   *   我承接的 → **履約**：在哪裡、聯絡誰，以及**釋出名額**（Sucre：要，而且要好找）
   *
   * ⚠️ 「我承接的」靠 `claimedBy` 認人（`wg-bridge.js` 的 taskMatches）。
   *    正式版是 `task_assignments.actor_uuid`，這裡是原型的等價物。 */
  function MyTasksDrawer({ open, viewerId, createdTickets, claimedRows, onClose, onOpenTicket, onRelease }) {
    const [tab, setTab] = useState('created');
    React.useEffect(() => { if (open) setTab('created'); }, [open]);
    if (!open) return null;

    const tabs = [
      { value: 'created', label: '我建立的' + (createdTickets.length ? '（' + createdTickets.length + '）' : '') },
      { value: 'claimed', label: '我承接的' + (claimedRows.length ? '（' + claimedRows.length + '）' : '') },
    ];

    const emptyBlock = (icon, text) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-6) var(--space-4)', textAlign: 'center' }}>
        <span style={{ color: 'var(--color-fg-neutral-muted)' }}><WGIcon n={icon} s={28} /></span>
        <span style={{ font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>{text}</span>
      </div>
    );

    return (
      <ActionDrawer open={open} title="我的任務"
        subtitle="你建立的需求，以及你答應要去的任務"
        onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === 'created' ? (
            createdTickets.length === 0
              ? emptyBlock('ClipboardList', '你還沒有建立過任務單。在地圖上點一個位置，或用右上角的「請求協助」。')
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {createdTickets.map((t) => {
                    const need = (t._site && t._site.requiredVolunteers) || 1;
                    const got = (t._match && t._match.matched) || 0;
                    const full = got >= need;
                    /* 已結束的單也留在這一頁（2026-09-10）——「我提過什麼、後來怎麼了」
                       是履歷，不是待辦清單。但徽章與那句進度描述都要換掉，
                       否則一張已完成的單會寫「還需要 3 位」，讀起來像還在募人。 */
                    const doneLabel = { completed: '已完成', closed: '已結案', cancelled: '已取消' }[t.status] || null;
                    return (
                      <div key={t.id} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>{t.id} · {t.createdAt}</div>
                            <div style={{ marginTop: 2, font: '700 var(--fs-15)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>{t.title}</div>
                          </div>
                          <Badge tone={doneLabel ? 'neutral' : full ? 'success' : (got > 0 ? 'warning' : 'neutral')} variant="subtle">
                            {doneLabel || (full ? '已滿' : got > 0 ? got + '/' + need : '待承接')}
                          </Badge>
                        </div>
                        {/* 建立者最想知道的是「有沒有人要來」，所以進度條擺在最顯眼的地方 */}
                        <div style={{ marginTop: 'var(--space-3)', font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                          {doneLabel
                            ? '這張單已經' + doneLabel.replace('已', '') + '，不再需要人手。'
                            : got === 0 ? '目前還沒有人承接' : '已有 ' + got + ' 位志工承接，還需要 ' + Math.max(0, need - got) + ' 位'}
                        </div>
                        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
                          <Button variant="outline" size="sm" onClick={() => onOpenTicket(t.id)}>查看</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
          ) : (
            claimedRows.length === 0
              ? emptyBlock('HandHeart', '你還沒有承接任何任務。在地圖或列表上找一筆需求，按「接任務」。')
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {/* 出發前的下一步（VB-FEAT-001）。只在真的接了東西時出現 ——
                      還沒承接的人不會出發，對他來說這只是噪音。 */}
                  <BriefingDepartureBar />
                  {/* 一列＝一筆需求。同一張單接了兩筆就會出現兩列，
                      所以 key 不能只有 ticketId。 */}
                  {claimedRows.map((row) => (
                    <div key={row.ticketId + '#' + row.taskId} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-default)', background: 'var(--color-bg-neutral-default)' }}>
                      <div style={{ font: '400 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>
                        {row.ticketId}{row.match.claimedAt ? ' · 承接於 ' + row.match.claimedAt : ''}
                      </div>
                      <div style={{ marginTop: 2, font: '700 var(--fs-15)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>
                        {row.title || row.ticketId}
                      </div>
                      {/* 你接的是**哪一件事** —— 履約當天要知道的是這個，不是單號。 */}
                      <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6,
                        font: '700 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-brand-secondary-subtle)' }}>
                        <WGIcon n="HeartHandshake" s={14} />
                        <span style={{ textWrap: 'pretty' }}>{row.needName}</span>
                      </div>
                      {/* 履約視角：要去哪、找誰。沒有這兩項，這一頁就只是一張清單，不是行動依據。 */}
                      {row.address ? (
                        <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'flex-start', gap: 6,
                          font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                          <span style={{ marginTop: 2, color: 'var(--color-fg-neutral-muted)' }}><WGIcon n="MapPin" s={14} /></span>
                          <span style={{ textWrap: 'pretty' }}>{row.address}</span>
                        </div>
                      ) : null}
                      {row.contact ? (
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6,
                          font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                          <span style={{ color: 'var(--color-fg-neutral-muted)' }}><WGIcon n="User" s={14} /></span>
                          {row.contact}
                        </div>
                      ) : null}
                      <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
                        <Button variant="outline" size="sm" onClick={() => onOpenTicket(row.ticketId)}>查看</Button>
                        {/* 釋出擺在同一列、不藏在選單裡（Sucre：要好找）。
                            去不了卻找不到地方取消，結果就是當天沒人出現。 */}
                        <Button variant="ghost" size="sm" onClick={() => onRelease(row)}
                          startIcon={<WGIcon n="UserMinus" s={14} />}>釋出名額</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      </ActionDrawer>
    );
  }

  function TaskMatchDeleteConfirmDialog({ open, task, onCancel, onConfirm }) {
    if (!open || !task) return null;
    return (
      <WGPortal>
      <div style={{ ...BELOW_BANNER, zIndex: Z_ACTION_DRAWER + 10, display: 'grid', placeItems: 'center', padding: 'var(--space-4)' }}
        role="dialog" aria-modal="true" aria-label="刪除媒合單">
        <div style={scrimStyle} onClick={onCancel}></div>
        <div style={{ position: 'relative', width: 'min(420px, 100%)', padding: 'var(--space-6)',
          borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-neutral-default)', boxShadow: 'var(--shadow-lg)',
          animation: 'wgPop var(--duration-base) var(--ease-spring)' }}>
          <div style={{ font: '700 var(--fs-20)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>刪除媒合單</div>
          <div style={{ marginTop: 'var(--space-3)', font: '400 var(--fs-14)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
            將移除「{task.title}」的媒合單，已報名的志工會收到通知。此操作無法復原。
          </div>
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Alert tone="warning" title="請確認現場已無人力需求">刪除後任務仍會保留在列表，但不再接受報名。</Alert>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
            <Button variant="ghost" onClick={onCancel} style={{ flex: 1 }}>取消</Button>
            <Button variant="danger" onClick={onConfirm} style={{ flex: 1 }}>確認刪除</Button>
          </div>
        </div>
      </div>
      </WGPortal>
    );
  }

  /* ── 行前資訊的引導（VB-FEAT-001，2026-09-06 裁示）─────────────────────────
   *
   * 🔒 Sucre：「不加第二個入口，側欄一個就好，**但是要在承接的時候引導他看，
   *    就是 flow 做足一點**。」
   *
   * 選定的兩個點（其餘兩個候選被否決，理由記在這裡免得日後又被加回來）：
   *   ✅ 「我承接的」分頁頂部常駐 —— 那是志工出發前真的會再打開的地方
   *   ✅ 承接成功後的 toast 加一顆按鈕 —— 接完的那一刻正好是他開始想「要帶什麼」
   *   ❌ 承接確認對話框裡放連結 —— 點下去就離開對話框，承接做到一半斷掉，
   *      而他會以為自己接了
   *   ❌ 手機底部控制列加第二顆 —— 2026-09-06 裁示 B-2a 已否決（360px 已塞滿，
   *      戴手套會按錯，而按錯的代價是誤承接）
   *
   * ⚠️ 連結不帶災害類型：任務單上沒有災害類型欄位（後端 `project_settings.disaster_types`
   *    是**整個部署一組**的設定，不是每張單自己的）。硬猜會猜錯，所以就開到那一頁，
   *    只有一種已發布時它本來就直接顯示那一種。 */
  const BRIEFING_HREF = encodeURI('前台行前資訊 Site Briefing.html') + '#/brief';

  /** 「我承接的」分頁頂部那一條。常駐、不可關 —— 它是這一頁的下一步，不是提示。 */
  function BriefingDepartureBar() {
    return (
      <a href={BRIEFING_HREF} data-vb-nudge="mytasks"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', textDecoration: 'none',
          minHeight: 56, padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)',
          borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary-subtle)',
          border: '1px solid var(--color-brand-secondary-default)' }}>
        <span style={{ flexShrink: 0, color: 'var(--color-brand-secondary-subtle)' }}><WGIcon n="BookOpen" s={20} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', font: '700 var(--fs-14)/1.4 var(--font-display)', color: 'var(--color-brand-secondary-subtle)' }}>
            出發前先看行前資訊
          </span>
          <span style={{ display: 'block', marginTop: 2, font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)', textWrap: 'pretty' }}>
            怎麼過來、帶什麼、到了找誰
          </span>
        </span>
        <span style={{ flexShrink: 0, color: 'var(--color-brand-secondary-subtle)' }}><WGIcon n="ChevronRight" s={18} /></span>
      </a>
    );
  }

  /** 承接確認（2026-09-04 Sucre：列表上直接接，但要確認）。
   *
   *  為什麼要確認：列表上「接這筆」與「分享」「修改建議」擠在同一排，
   *  而承接是**對現場的承諾** —— 誤觸的成本不是多一次點擊，是當天有人沒出現。
   *  對話框把「你要去哪、做什麼」寫清楚，這也是使用者按之前唯一會看到的一次。 */
  function NeedClaimConfirmDialog({ open, marker, task, state, onCancel, onConfirm }) {
    if (!open || !marker || !task) return null;
    const left = Math.max(0, (state.required || 1) - (state.matched || 0));
    const meta = marker.ticketMeta || {};
    const contact = [meta.contactName, meta.contactPhone].filter(Boolean).join(' · ');
    return (
      <WGPortal>
      <div style={{ ...BELOW_BANNER, zIndex: Z_ACTION_DRAWER + 10, display: 'grid', placeItems: 'center', padding: 'var(--space-4)' }}
        role="dialog" aria-modal="true" aria-label="確認承接">
        <div style={scrimStyle} onClick={onCancel}></div>
        <div style={{ position: 'relative', width: 'min(440px, 100%)', padding: 'var(--space-6)',
          borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-neutral-default)', boxShadow: 'var(--shadow-lg)',
          animation: 'wgPop var(--duration-base) var(--ease-spring)' }}>
          <div style={{ font: '700 var(--fs-20)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>確認承接這一筆？</div>

          <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-neutral-subtle)', border: '1px solid var(--color-border-default)' }}>
            <div style={{ font: '700 var(--fs-16)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-default)', textWrap: 'pretty' }}>
              {task.name}
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4,
              font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
              <span style={{ display: 'flex', gap: 6 }}><WGIcon n="ClipboardList" s={14} />{marker.title}</span>
              <span style={{ display: 'flex', gap: 6 }}><WGIcon n="MapPin" s={14} /><span style={{ textWrap: 'pretty' }}>{marker.subtitle}</span></span>
              {contact ? <span style={{ display: 'flex', gap: 6 }}><WGIcon n="User" s={14} />{contact}</span> : null}
              <span style={{ display: 'flex', gap: 6 }}><WGIcon n="Users" s={14} />目前 {state.matched}/{state.required} 人{left ? '，還缺 ' + left + ' 位' : ''}</span>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-4)', font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-muted)', textWrap: 'pretty' }}>
            去不了的話請到「我的任務 › 我承接的」釋出名額，讓建立者有機會補人。
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
            <Button variant="ghost" onClick={onCancel} style={{ flex: 1 }}>取消</Button>
            <Button variant="primary" onClick={onConfirm} style={{ flex: 1 }}
              startIcon={<WGIcon n="HeartHandshake" s={16} />}>確認承接</Button>
          </div>
        </div>
      </div>
      </WGPortal>
    );
  }

  Object.assign(window, {
    ChipRadioGroup, useSiteTickets, useMyCreatedTickets, SiteTicketCreateDrawer, StationReportsDrawer, RoleElevationDrawer, SiteToast, MyTasksDrawer, needsOf,
    STATION_FIELD_OPTIONS, getStationField, readStationSnapshot,
    SITE_NEED_OPTIONS, getNeedOption, SITE_DEFAULT_PRIORITY, SiteNeedRow,
    STATION_STATUS_VALUE_OPTIONS, createStationReportSummary,
    useStationReports, useTaskMatches, ActionDrawer, useIsMobile, SHARE_TARGETS, useQrSvg,
    SiteStationReportDrawer, PointShareDrawer, TaskMatchDeleteConfirmDialog, NeedClaimConfirmDialog, createPointShareTarget,
    BriefingDepartureBar, BRIEFING_HREF,
  });
})();
