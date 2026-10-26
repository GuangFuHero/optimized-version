// tk-space.jsx — 開啟的空間（大樓）在任務管理裡的樣子：列表一列、地圖一個方形圖釘、點開看各樓層（2026-10-26）
/* 依據：BE-036「現場分區 V1」（Carol 10/14 決定）＋ Sucre 10-26 裁示
     🔒 按鈕名稱「開啟空間」（Sucre 10-26）
     🔒 SP-1 空間跟任務單一樣出現在任務管理列表與地圖上，點開看資訊（BE-036 #2，Sucre 同意）
     🔒 SP-2 編輯＝名稱、地址、樓層數（後端 updateBuildingMap 只存這些；BE-036 #2，Sucre 同意）
     🔒 SP-3 可以刪除（deleteBuildingMap）；底下的任務單保留，只是不再歸在這個空間（Sucre：先做給我看）
     🔒 SP-4 後台逐層檢視（buildingMapTickets 依樓層分組，看哪幾層還需要幫忙；後端沒有整棟狀態，前端算）
     🔒 SP-5 沒權限的人（超管／政府以外）看不到「開啟空間」按鈕，也不能編輯刪除；空間本身大家都看得到
   🚨 我定的（待 Sucre 看過）：
     - 列表上空間的優先級／狀態／更新時間取自裡面的任務單（後端沒有）
     - 裡面的任務單在列表上仍各自一列（後端 tickets 查詢本來就回它們），標「🏢 名稱 · 3F」
     - 地圖上只畫空間的方形圖釘，裡面的單不另外畫（點位都一樣，會疊在一起）
     - 樓層由小到大、RF 最後（沿用 09-12）；預設只列有任務單的樓層，其他收成一行
     - 每層的狀態：還需要幫忙（有單待處理或有需求沒人接）＞ 處理中 ＞ 都完成 ＞ 沒有任務單
   正式版對照：列表與地圖 → buildingMaps(bounds)；逐層 → buildingMapTickets(buildingMapUuid)；
              任務單的 buildingId → building_map_ticket_map；樓層 → secondary_locations.floor */
(function () {
  const { Button, Input, Field, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const B = window.WGBridge;

  /* 任務單上寫的樓層 → 空間的樓層名稱。對不上回 null（落到「沒寫樓層／不在樓層清單」）。 */
  function floorOf(t, segs) {
    const raw = String(t.floor == null ? "" : t.floor).trim();
    if (!raw) return { seg: null, raw: "" };
    const s = raw.toUpperCase().replace(/\s|樓/g, "");
    let key = null;
    if (/^(頂樓?|屋頂|R|RF)$/.test(s)) key = "RF";
    else if (/^(B|地下)(\d+)F?$/.test(s)) key = "B" + s.match(/(\d+)/)[1];
    else if (/^(\d+)F?$/.test(s)) key = s.match(/(\d+)/)[1] + "F";
    return { seg: key && segs.indexOf(key) !== -1 ? key : null, raw };
  }

  /* 一層的狀態（SP-4）。 */
  function floorState(tickets) {
    if (!tickets.length) return "empty";
    const st = tickets.map((t) => window.tkStatus(t)).filter((s) => s !== "canceled" && s !== "archived");
    if (!st.length) return "empty";
    if (st.some((s) => s === "pending") || tickets.some((t) => window.fillState(t.tasks).open > 0 && window.tkStatus(t) !== "completed")) return "need";
    if (st.some((s) => s === "in_progress")) return "progress";
    return "done";
  }
  const STATE = {
    need:     { label: "還需要幫忙", dot: "var(--color-fg-danger)",  fg: "var(--color-fg-danger)" },
    progress: { label: "處理中",     dot: "var(--color-fg-warning)", fg: "var(--color-fg-warning)" },
    done:     { label: "都完成",     dot: "var(--color-fg-success)", fg: "var(--color-fg-success)" },
    empty:    { label: "沒有任務單", dot: "var(--color-border-default)", fg: "var(--color-fg-neutral-muted)" },
  };

  /** 一個空間的完整分析：每層有哪些單、各層狀態、整體。 */
  function analyze(b, allTickets) {
    const segs = B.buildingSegments(b);
    const members = (allTickets || []).filter((t) => t.buildingId === b.id);
    const byFloor = {}; segs.forEach((s) => { byFloor[s] = []; });
    const noFloor = [], offList = [];
    members.forEach((t) => {
      const f = floorOf(t, segs);
      if (f.seg) byFloor[f.seg].push(t);
      else if (f.raw) offList.push(t);
      else noFloor.push(t);
    });
    const floors = segs.map((s) => ({ seg: s, tickets: byFloor[s], state: floorState(byFloor[s]) }));
    const count = (k) => floors.filter((f) => f.state === k).length;
    const overall = !members.length ? "empty"
      : (count("need") || floorState(noFloor.concat(offList)) === "need") ? "need"
      : (count("progress") || floorState(noFloor.concat(offList)) === "progress") ? "progress" : "done";
    return { segs, members, floors, noFloor, offList, overall, need: count("need"), progress: count("progress"), done: count("done") };
  }

  /** 列表／地圖用的「一列」：長得像任務單，欄位取自裡面的單。 */
  function spaceItems(allTickets) {
    if (!B) return [];
    return B.readBuildings().map((b) => {
      const a = analyze(b, allTickets);
      const live = a.members.filter((t) => window.tkStatus(t) !== "completed");
      const pri = (live.length ? live : a.members).reduce((m, t) => (!m || window.TK_PRIORITY[t.priority].rank > window.TK_PRIORITY[m].rank) ? t.priority : m, null);
      return {
        kind: "space", id: b.id, b, a,
        title: b.alias || b.address, county: "", city: "", street: b.address, no: "",
        priority: pri || "low", hasPriority: !!pri,
        tasks: a.members.flatMap((t) => t.tasks || []),
        updatedMin: a.members.length ? Math.min(...a.members.map((t) => t.updatedMin || 0)) : 99999,
        team: null, region: (a.members[0] && a.members[0].region) || "",
        lat: b.lat, lng: b.lng,
        coord: typeof b.lat === "number" ? [b.lat, b.lng] : null,   // 交付版地圖用 tkCoord(t) 讀 t.coord
      };
    });
  }

  /* 門牌狀態（2026-10-26）：欄位是 BuildingMapType.secondaryLocation.normalizationStatus（secondary_locations.normalization_status），
     三個值；顯示文字照後端 Spec 027 frontend-guide §5。null 不顯示。 */
  const ADDR_STATUS = { verified: "✓ 已確認門牌", pin_mismatch: "地址與標記不符", unverified: "未確認" };
  function addrStatusText(s) { return ADDR_STATUS[s] || ""; }

  function StateBadge({ s }) {
    const d = STATE[s];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", font: "var(--font-data-300)", fontWeight: 600, color: d.fg }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: d.dot, flexShrink: 0 }}></span>{d.label}
      </span>
    );
  }

  function SpaceTag() {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 18, padding: "0 7px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", font: "var(--font-data-300)", fontWeight: 700, color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>
        <Icon n="Building2" s={11} c="var(--color-fg-neutral-subtle)" />空間
      </span>
    );
  }

  /* 一句話講整棟：「14 層 · 5 張任務單 · 2 層還需要幫忙」 */
  function summaryLine(a) {
    const parts = [a.segs.length + " 層", a.members.length + " 張任務單"];
    if (a.need) parts.push(a.need + " 層還需要幫忙");
    else if (a.progress) parts.push(a.progress + " 層處理中");
    else if (a.members.length) parts.push("都完成");
    return parts.join(" · ");
  }

  /** 列表的一列（欄位與任務單對齊，見 tk-table.jsx CELL） */
  function SpaceRow({ s, onOpen }) {
    const tk = window.useTK();
    const cell = {
      ticket: () => (
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><SpaceTag /></span>
          <span title={s.title} style={{ display: "block", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{s.title}</span>
          <span className="wg-caption" title={s.b.address} style={{ display: "block", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.b.address}</span>
        </span>
      ),
      tasks: () => <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>{summaryLine(s.a)}</span>,
      priority: () => s.hasPriority ? <span><window.PriorityBadge p={s.priority} /></span> : <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>—</span>,
      status: () => <StateBadge s={s.a.overall} />,
      team: () => <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>—</span>,
      updated: () => s.a.members.length ? <window.UpdatedCell t={s} /> : <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>—</span>,
    };
    return (
      <div className="tk-row" data-space-row={s.id} onClick={() => onOpen(s)} style={{ display: "grid", gridTemplateColumns: tk.cols, gap: 12, alignItems: "center", padding: tk.pad, borderBottom: "1px solid var(--color-border-default)", cursor: "pointer", background: "color-mix(in srgb, var(--color-bg-neutral-subtle) 55%, transparent)" }}>
        {tk.visibleCols.map((c) => <React.Fragment key={c.key}>{(cell[c.key] || (() => <span />))()}</React.Fragment>)}
        <span></span>
      </div>
    );
  }

  /** 地圖視圖左邊清單的卡片 */
  function SpaceCard({ s, selected, onSelect, onOpen }) {
    return (
      <div onClick={() => onSelect(s.id)} role="button" tabIndex={0} data-space-card={s.id}
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 92px 78px", gap: 10, alignItems: "center", cursor: "pointer",
          padding: "12px 14px 12px 11px", borderBottom: "1px solid var(--color-border-default)",
          borderLeft: selected ? "3px solid var(--color-bg-primary)" : "3px solid transparent",
          background: selected ? "var(--color-bg-primary-subtle)" : "color-mix(in srgb, var(--color-bg-neutral-subtle) 55%, transparent)" }}>
        <span style={{ minWidth: 0 }}>
          <SpaceTag />
          <span style={{ display: "block", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          <span className="wg-caption" style={{ display: "block", color: "var(--color-fg-neutral-muted)" }}>{summaryLine(s.a)}</span>
          <button onClick={(e) => { e.stopPropagation(); onOpen(s); }}
            style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: 0, cursor: "pointer", font: "var(--font-body-300)", color: "var(--color-brand-secondary-default)", textDecoration: "underline" }}>
            看各樓層<Icon n="ChevronRight" s={14} c="var(--color-brand-secondary-default)" />
          </button>
        </span>
        <span>{s.hasPriority ? <window.PriorityBadge p={s.priority} /> : <span className="wg-caption">—</span>}</span>
        <span><StateBadge s={s.a.overall} /></span>
      </div>
    );
  }

  /** 地圖上點了空間圖釘的小卡 */
  function SpaceMapCard({ s, onOpen, onClose, cardRef }) {
    return (
      <div ref={cardRef} className="tk-rise" style={{ position: "absolute", right: 12, top: 12, width: 268, zIndex: 600, display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SpaceTag />
            <span style={{ display: "block", font: "var(--font-label-500)", fontSize: 15, color: "var(--color-fg-neutral-default)", marginTop: 3 }}>{s.title}</span>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{s.b.address}</span>
          </div>
          <button className="tk-iconbtn" aria-label="關閉" onClick={onClose} style={{ width: 24, height: 24, flexShrink: 0 }}><Icon n="X" s={14} c="var(--color-fg-neutral-muted)" /></button>
        </div>
        <StateBadge s={s.a.overall} />
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>{summaryLine(s.a)}</span>
        <Button variant="primary" size="sm" startIcon={<Icon n="Layers" s={15} />} onClick={() => { onClose(); onOpen(s); }}>看各樓層</Button>
      </div>
    );
  }

  /* 逐層裡的一張單（點了開任務單詳情） */
  function MiniTicket({ t, onOpenTicket }) {
    const f = window.fillState(t.tasks);
    return (
      <button type="button" onClick={() => onOpenTicket(t)} data-space-ticket={t.id}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-default)", cursor: "pointer" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>#{t.id}{t.room ? " · " + t.room : ""}</span>
          <span style={{ display: "block", font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
        </span>
        <span className="wg-caption" style={{ color: f.open ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>{f.label}</span>
        <window.StatusBadge s={window.tkStatus(t)} />
      </button>
    );
  }

  function FloorRow({ seg, state, tickets, onOpenTicket }) {
    return (
      <div data-space-floor={seg} style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr)", gap: 12, padding: "10px 0", borderTop: "1px solid var(--color-border-default)" }}>
        <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>{seg}{seg === "RF" ? <span className="wg-caption" style={{ display: "block", color: "var(--color-fg-neutral-muted)" }}>頂樓</span> : null}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <StateBadge s={state} />
          {tickets.map((t) => <MiniTicket key={t.id} t={t} onOpenTicket={onOpenTicket} />)}
        </span>
      </div>
    );
  }

  /** 點開空間：逐層檢視（SP-4）＋ 編輯／刪除（SP-2、SP-3） */
  function SpaceDetail({ id, onClose, onOpenTicket }) {
    const tk = window.useTK();
    const version = B.useBridgeVersion();
    const b = React.useMemo(() => B.buildingById(id), [id, version]);
    const [showAll, setShowAll] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
    if (!b) return null;
    const a = analyze(b, tk.allTickets);
    const canManage = tk.can && tk.can.activate;
    const withTickets = a.floors.filter((f) => f.tickets.length);
    const shown = showAll ? a.floors : withTickets;
    const hidden = a.floors.length - withTickets.length;

    const askDelete = () => tk.openConfirm({
      title: "刪除「" + (b.alias || b.address) + "」",
      body: a.members.length
        ? "這個空間會從列表與地圖上消失。底下 " + a.members.length + " 張任務單會保留，變回一般任務單（不再歸在這個空間），樓層與戶別照舊寫在單上。"
        : "這個空間會從列表與地圖上消失。它底下還沒有任何任務單。",
      confirmLabel: "刪除空間", danger: true,
      onConfirm: () => { tk.deleteSpace(b.id); onClose(); },
    });

    return (
      <window.TKDrawer width={640} onClose={onClose}
        title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon n="Building2" s={20} c="var(--color-fg-neutral-subtle)" />{b.alias || b.address}</span>}
        sub={<>{b.address}{addrStatusText(b.addressStatus) ? "　" + addrStatusText(b.addressStatus) : ""}</>}
        footer={canManage ? <>
          <Button variant="ghost" startIcon={<Icon n="Trash2" s={16} c="var(--color-fg-danger)" />} onClick={askDelete} style={{ marginRight: "auto", color: "var(--color-fg-danger)" }} data-space-delete>刪除空間</Button>
          <Button variant="outline" startIcon={<Icon n="PenLine" s={16} />} onClick={() => setEditing(true)} data-space-edit>編輯</Button>
        </> : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 一眼看完：整棟狀態＋各層數 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            {[["need", a.need], ["progress", a.progress], ["done", a.done], ["empty", a.floors.length - a.need - a.progress - a.done]].map(([k, n]) => (
              <div key={k} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", background: k === "need" && n ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-default)" }}>
                <div style={{ font: "var(--font-heading-700)", fontSize: 22, color: n ? STATE[k].fg : "var(--color-fg-neutral-muted)" }}>{n}</div>
                <div className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>層{STATE[k].label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: "var(--font-label-500)" }}>各樓層</span>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{a.segs.length} 層（含頂樓 RF）· {a.members.length} 張任務單</span>
            {hidden > 0 && withTickets.length > 0 && (
              <button type="button" className="tk-chipbtn" style={{ marginLeft: "auto" }} onClick={() => setShowAll((v) => !v)} data-space-showall>
                {showAll ? "只看有任務單的樓層" : "顯示全部 " + a.segs.length + " 層"}
              </button>
            )}
          </div>

          {a.members.length === 0 ? (
            <window.EmptyState icon="Layers" title="這個空間還沒有任務單"
              caption={<>民眾在前台點這個空間，選樓層後送出求助，就會出現在這裡的那一層。<br />戶別（302、早餐店）是寫在每張任務單上的。</>} />
          ) : (
            <div>
              {shown.map((f) => <FloorRow key={f.seg} {...f} onOpenTicket={onOpenTicket} />)}
              {!showAll && hidden > 0 && (
                <div className="wg-caption" style={{ padding: "10px 0", borderTop: "1px solid var(--color-border-default)", color: "var(--color-fg-neutral-muted)" }}>
                  其他 {hidden} 層沒有任務單
                </div>
              )}
              {a.noFloor.length > 0 && <FloorRow seg="？" state={floorState(a.noFloor)} tickets={a.noFloor} onOpenTicket={onOpenTicket} />}
              {a.noFloor.length > 0 && <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: -4 }}>「？」＝通報的人不知道在幾樓（後端允許不填）</div>}
              {a.offList.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Alert tone="warning" title={a.offList.length + " 張單的樓層不在這棟的樓層裡"}>
                    多半是樓層數改少了。單不會不見，樓層照原本寫的留著：{a.offList.map((t) => "#" + t.id + "（" + t.floor + "）").join("、")}
                  </Alert>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>{a.offList.map((t) => <MiniTicket key={t.id} t={t} onOpenTicket={onOpenTicket} />)}</div>
                </div>
              )}
            </div>
          )}
        </div>
        {editing && <SpaceEditModal b={b} a={a} onClose={() => setEditing(false)} />}
      </window.TKDrawer>
    );
  }

  /** 編輯（SP-2）：名稱、地址、地上／地下樓層數。 */
  function SpaceEditModal({ b, a, onClose }) {
    const tk = window.useTK();
    const [name, setName] = React.useState(b.alias || "");
    const [address, setAddress] = React.useState(b.address || "");
    const [above, setAbove] = React.useState(String(b.floorsAbove || ""));
    const [below, setBelow] = React.useState(String(b.floorsBelow || 0));
    const nA = parseInt(above, 10), nB = below.trim() === "" ? 0 : parseInt(below, 10);
    const okA = nA >= 1 && nA <= 200, okB = nB >= 0 && nB <= 20;
    const nameLen = [...name.trim()].length;
    const okName = nameLen >= 1 && nameLen <= 100, okAddr = !!address.trim();
    const nextSegs = [];
    if (okA && okB) { for (let i = nB; i >= 1; i--) nextSegs.push("B" + i); for (let i = 1; i <= nA; i++) nextSegs.push(i + "F"); nextSegs.push("RF"); }
    /* 樓層數改少 → 那幾層的單會落到「不在樓層清單」。先講清楚，不擋。 */
    const stranded = okA && okB ? a.members.filter((t) => { const f = floorOf(t, a.segs); return f.seg && nextSegs.indexOf(f.seg) === -1; }) : [];
    const save = () => {
      if (!(okA && okB && okName && okAddr)) return;
      /* 原型：樓層由數字產生，舊的 segments（自訂名稱）一併換掉。後端 updateBuildingMap 只存樓層數。 */
      B.updateBuilding(b.id, { alias: name.trim(), address: address.trim(), floorsAbove: nA, floorsBelow: nB, segments: nextSegs,
        addressStatus: address.trim() === b.address ? b.addressStatus : "unverified" });
      tk.toast("已更新「" + name.trim() + "」");
      onClose();
    };
    return (
      <window.TKModal title="編輯空間" width={520} onClose={onClose} icon={<Icon n="PenLine" s={20} c="var(--color-fg-neutral-subtle)" />}
        footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={save} disabled={!(okA && okB && okName && okAddr)} data-space-save>儲存</Button></>}>
        <Field label="名稱" error={!okName ? (nameLen ? "最多 100 個字" : "必填") : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={!okName} />
        </Field>
        <Field label="地址" error={!okAddr ? "必填" : undefined} hint={address.trim() !== b.address ? "改過的地址會存成「未確認」（重新查門牌是正式版的事）" : undefined}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} invalid={!okAddr} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="地上樓層數" hint="不含頂樓，頂樓會自動加上" error={!okA ? "請填 1 到 200" : undefined}>
            <Input value={above} onChange={(e) => setAbove(e.target.value)} inputMode="numeric" invalid={!okA} data-space-above />
          </Field>
          <Field label="地下樓層數" error={!okB ? "請填 0 到 20" : undefined}>
            <Input value={below} onChange={(e) => setBelow(e.target.value)} inputMode="numeric" invalid={!okB} />
          </Field>
        </div>
        {stranded.length > 0 && (
          <Alert tone="warning" title={"有 " + stranded.length + " 張任務單在要拿掉的樓層"}>
            {stranded.map((t) => "#" + t.id + "（" + t.floor + "）").join("、")}。儲存後它們不會不見，會列在「樓層不在這棟的樓層裡」，樓層照原本寫的留著。
          </Alert>
        )}
      </window.TKModal>
    );
  }

  Object.assign(window, { tkSpaceItems: spaceItems, tkSpaceAnalyze: analyze, SpaceRow, SpaceCard, SpaceMapCard, SpaceDetail, SpaceTag });
})();
