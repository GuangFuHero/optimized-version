// tk-table.jsx — 任務列表（§5 欄位自訂 · §6 灰階視覺 · §4 排序＝優先級 → 缺口 → 更新時間）
(function () {
  const { Card, Chip, Input, Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK, PriorityBadge, StatusBadge, FillBar, fillState, UpdatedCell, TKMenu, EmptyState } = window;

  function matches(t, q) {
    if (!q) return true;
    const s = q.trim().toLowerCase();
    const bag = [t.id, t.title, window.tkAddress(t), t.floor, t.desc, t.contact_name, t.team, t.region,
      window.TK_PRIORITY[t.priority] && window.TK_PRIORITY[t.priority].label,
      window.TK_STATUS[window.tkStatus(t)].label,
      ...(t.tasks || []).flatMap((k) => [k.name, window.TK_TASK_KIND[k.kind] && window.TK_TASK_KIND[k.kind].label, ...(k.assignees || []).map((a) => a.name)]),
    ];
    return bag.some((v) => v && String(v).toLowerCase().includes(s));
  }

  function TaskChip({ task }) {
    const k = window.TK_TASK_KIND[task.kind] || { label: task.kind };
    const done = task.status === "fulfilled";
    return (
      <span title={k.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", height: 22, padding: "0 9px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)", opacity: done ? 0.55 : 1 }}>
        <span style={{ font: "var(--font-data-300)", fontWeight: 600, color: "var(--color-fg-neutral-subtle)", textDecoration: done ? "line-through" : "none" }}>
          {task.name}{task.quantity ? ` ×${task.quantity}` : ""}
        </span>
      </span>
    );
  }

  // TM-FS-102：單行不換行，溢出的 chip 由 +N 收尾，完整清單掛在 title 上
  function TaskSummary({ tasks }) {
    if (!tasks || tasks.length === 0) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-fg-neutral-muted)" }}>
          <Icon n="CircleDashed" s={15} c="var(--color-fg-neutral-muted)" />
          <span className="wg-caption">尚無需求 · 待補列</span>
        </span>
      );
    }
    const full = tasks.map((t) => `${t.name}${t.quantity ? ` ×${t.quantity}` : ""}`).join("、");
    return (
      <span title={full} style={{ display: "flex", gap: 5, flexWrap: "nowrap", minWidth: 0, overflow: "hidden" }}>
        {tasks.slice(0, 3).map((t) => <TaskChip key={t.id} task={t} />)}
        {tasks.length > 3 && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", alignSelf: "center", flexShrink: 0 }}>+{tasks.length - 3}</span>}
      </span>
    );
  }

  // 每個欄位的儲存格內容
  const CELL = {
    ticket: (t, tk) => (
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>#{t.id}</span>
          {t.verification === "disputed" && (tk.persona.rbac === "auditor" || tk.persona.rbac === "super") && (
            <span title="疑似重複 · 待查核（Data Auditor／Super Admin 可見）" style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 18, padding: "0 7px", borderRadius: "var(--radius-full)", background: "var(--color-bg-warning-subtle)", border: "1px solid color-mix(in srgb, var(--color-fg-warning) 35%, transparent)", font: "var(--font-data-300)", fontWeight: 700, color: "var(--color-fg-warning)", whiteSpace: "nowrap" }}>
              <Icon n="Flag" s={10} c="var(--color-fg-warning)" />疑似重複
            </span>
          )}
          {/* TM-IMG-140：列表只給「有 N 張圖」的標記，不顯示縮圖。
              🔴 理由：一頁 50 張單同時去外部圖床抓圖，等於把列表頁的速度交給第三方。 */}
          {(() => {
            const n = (window.tkPhotoList ? window.tkPhotoList(t.photos) : []).length;
            if (!n) return null;
            return (
              <span title={`這張單有 ${n} 張圖片（開啟詳情才會載入）`} style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 18, padding: "0 7px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>
                <Icon n="Image" s={10} c="var(--color-fg-neutral-muted)" />{n}
              </span>
            );
          })()}
        </span>
        <span title={t.title} style={{ display: "block", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{t.title}</span>
        <span className="wg-caption" title={window.tkAddress(t)} style={{ display: "block", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{window.tkAddress(t)}</span>
      </span>
    ),
    tasks: (t) => (
      <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <TaskSummary tasks={t.tasks} />
        {(t.tasks || []).length > 0 && <FillBar tasks={t.tasks} />}
      </span>
    ),
    priority: (t) => <span><PriorityBadge p={t.priority} /></span>,
    status: (t) => <span><StatusBadge s={window.tkStatus(t)} /></span>,
    team: (t) => <span title={t.team || "未指派"} style={{ minWidth: 0, font: "var(--font-body-300)", color: t.team ? "var(--color-fg-neutral-subtle)" : "var(--color-fg-neutral-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.team || "未指派"}</span>,
    updated: (t) => <UpdatedCell t={t} />,
  };

  function TicketRow({ t, onOpen }) {
    const tk = useTK();
    const can = tk.can;
    const items = [
      { label: "檢視任務", icon: "PanelRightOpen", onClick: () => onOpen(t) },
      can.escalate && t.priority !== "critical" && window.tkStatus(t) !== "completed" ? { label: "升為生命危急", icon: "Siren", danger: true, onClick: () => tk.immediateRescue(t) } : null,
      can.assign ? { label: t.team ? "變更指派 Team" : "指派 Team", icon: "UserPlus", onClick: () => tk.assignOne(t) } : null,
      "divider",
      can.delete ? { label: "刪除任務", icon: "Trash2", danger: true, onClick: () => tk.deleteTicket(t) } : null,
    ].filter(Boolean);

    return (
      <div className="tk-row" onClick={() => onOpen(t)} style={{ display: "grid", gridTemplateColumns: tk.cols, gap: 12, alignItems: "center", padding: tk.pad, borderBottom: "1px solid var(--color-border-default)", cursor: "pointer" }}>
        {tk.visibleCols.map((c) => <React.Fragment key={c.key}>{CELL[c.key](t, tk)}</React.Fragment>)}
        <span onClick={(e) => e.stopPropagation()}>{items.length > 0 && <TKMenu items={items} />}</span>
      </div>
    );
  }

  // 地圖視圖的精簡卡片（任務 / 優先級 / 狀態）
  function TicketCard({ t, selected, onSelect, onOpen }) {
    return (
      <div onClick={() => onSelect(t.id)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(t.id); } }}
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 92px 78px", gap: 10, alignItems: "center", cursor: "pointer",
          padding: "12px 14px 12px 11px", borderBottom: "1px solid var(--color-border-default)",
          borderLeft: selected ? "3px solid var(--color-bg-primary)" : "3px solid transparent",
          background: selected ? "var(--color-bg-primary-subtle)" : "transparent",
          transition: "background var(--duration-fast) var(--ease-out)" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>#{t.id}</span>
          <span style={{ display: "block", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
          <span className="wg-caption" style={{ display: "block", color: "var(--color-fg-neutral-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{window.tkAddress(t)}</span>
          <button onClick={(e) => { e.stopPropagation(); onOpen(t); }}
            style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: 0, cursor: "pointer",
              font: "var(--font-body-300)", fontWeight: 400, color: "var(--color-brand-secondary-default)", textDecoration: "underline" }}>
            開啟任務細節<Icon n="ChevronRight" s={14} c="var(--color-brand-secondary-default)" />
          </button>
        </span>
        <span><PriorityBadge p={t.priority} /></span>
        <span><StatusBadge s={window.tkStatus(t)} /></span>
      </div>
    );
  }

  function TicketTable({ onOpen, onNew }) {
    const tk = useTK();
    const view = tk.view;
    const [sel, setSel] = React.useState(null);
    const [q, setQ] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [fStatus, setFStatus] = React.useState("all");
    const [fPriority, setFPriority] = React.useState("all");
    const [fKind, setFKind] = React.useState("all");
    const [fRegion, setFRegion] = React.useState("all");
    const [fTeam, setFTeam] = React.useState("all");
    const [fTime, setFTime] = React.useState("all");

    const regionOpts = React.useMemo(() => [...new Set(tk.tickets.map((t) => t.region))].map((r) => [r, r]), [tk.tickets]);
    const teamOpts = React.useMemo(() => {
      const teams = [...new Set(tk.tickets.map((t) => t.team).filter(Boolean))].map((t) => [t, t]);
      return [...teams, ["__none__", "未指派"]];
    }, [tk.tickets]);
    const timeOpts = [["today", "24 小時內"], ["earlier", "更早"]];
    const isToday = (t) => (t.updatedMin || 0) < 1440;

    const activeCount = (fStatus !== "all") + (fPriority !== "all") + (fKind !== "all") + (fRegion !== "all") + (fTeam !== "all") + (fTime !== "all");
    const reset = () => { setFStatus("all"); setFPriority("all"); setFKind("all"); setFRegion("all"); setFTeam("all"); setFTime("all"); };
    let rows = tk.tickets;
    if (fStatus !== "all") rows = rows.filter((t) => window.tkStatus(t) === fStatus);
    if (fPriority !== "all") rows = rows.filter((t) => t.priority === fPriority);
    if (fKind !== "all") rows = rows.filter((t) => t.tasks.some((k) => k.kind === fKind));
    if (fRegion !== "all") rows = rows.filter((t) => t.region === fRegion);
    if (fTeam !== "all") rows = rows.filter((t) => fTeam === "__none__" ? !t.team : t.team === fTeam);
    if (fTime !== "all") rows = rows.filter((t) => fTime === "today" ? isToday(t) : !isToday(t));
    rows = rows.filter((t) => matches(t, q));
    // §4 預設排序：優先級 → 缺口 → 更新時間
    rows = [...rows].sort((a, b) => {
      const p = window.TK_PRIORITY[b.priority].rank - window.TK_PRIORITY[a.priority].rank;
      if (p) return p;
      const g = (fillState(b.tasks).open || 0) - (fillState(a.tasks).open || 0);
      if (g) return g;
      return (b.updatedMin || 0) - (a.updatedMin || 0);
    });

    const FilterChips = ({ label, value, onChange, options }) => (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", width: 64, flexShrink: 0 }}>{label}</span>
        <Chip active={value === "all"} onClick={() => onChange("all")}>全部</Chip>
        {options.map(([k, lbl]) => <Chip key={k} active={value === k} onClick={() => onChange(k)}>{lbl}</Chip>)}
      </div>
    );

    // TM-FS-102：列表不橫向捲動。格線用 minmax(0,…) 收進視窗，過寬的值單行截斷 + hover 全文。
    const fullTable = (
      <Card padding="0">
        <div>
          <div style={{ display: "grid", gridTemplateColumns: tk.cols, gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
            {tk.visibleCols.map((c) => <span key={c.key} className="wg-caption" title={c.label} style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>)}
            <span></span>
          </div>
          {rows.length === 0 && <EmptyState icon="ClipboardList" title="此條件下沒有任務" caption="調整篩選、搜尋或切換角色視角再試。" />}
          {rows.map((t) => <TicketRow key={t.id} t={t} onOpen={onOpen} />)}
        </div>
      </Card>
    );

    const MAP_H = 560;
    const splitView = (
      <div style={{ display: "grid", gridTemplateColumns: "40fr 60fr", gap: "var(--spacing-4)", alignItems: "start" }}>
        <Card padding="0" style={{ overflow: "hidden", height: MAP_H, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 92px 78px", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--color-border-default)", flexShrink: 0 }}>
            {["任務", "優先級", "狀態"].map((h) => <span key={h} className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{h}</span>)}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {rows.length === 0 && <EmptyState icon="ClipboardList" title="此條件下沒有任務" caption="調整篩選或搜尋再試。" />}
            {rows.map((t) => <TicketCard key={t.id} t={t} selected={sel === t.id} onSelect={setSel} onOpen={onOpen} />)}
          </div>
        </Card>
        <window.TicketMapPane rows={rows} selectedId={sel} onSelect={setSel} onOpen={onOpen} height={MAP_H} />
      </div>
    );

    const TOGGLE = [["list", "列表視圖", "List"], ["map", "地圖視圖", "Map"]];

    // 範圍切換（我的單位／全部單位）已移到 header、列表／地圖切換的左邊，見 tk-shell.jsx TKScopeSwitch。
    // 這裡只在切到「全部」時補一句提醒，讓人點進別家的單之前就知道會是唯讀（AC-VS-104）。
    const scopeHint = (tk.myTeams || []).length > 0 && tk.scope === "all" && (
      <span className="wg-caption" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--color-fg-neutral-muted)" }}>
        <Icon n="Eye" s={13} c="var(--color-fg-neutral-muted)" />
        其他單位的單看得到、不能編輯
      </span>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", flexWrap: "wrap" }}>
          <button onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", background: open ? "var(--color-bg-neutral-subtle)" : "var(--color-bg-neutral-default)", cursor: "pointer", font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)" }}>
            <Icon n="SlidersHorizontal" s={16} c="var(--color-fg-neutral-subtle)" />篩選
            {activeCount > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", color: "var(--color-fg-neutral-subtle)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{activeCount}</span>}
            <Icon n={open ? "ChevronUp" : "ChevronDown"} s={15} c="var(--color-fg-neutral-muted)" />
          </button>
          <Input value={q} onChange={(e) => setQ(e.target.value)} leadingIcon={<Icon n="Search" s={16} c="var(--color-fg-neutral-muted)" />}
            placeholder="搜尋 ID／標題／地址／需求／聯絡人…" style={{ width: 320, height: 42 }} />
          {(activeCount > 0 || q) && <button onClick={() => { reset(); setQ(""); }} style={{ border: "none", background: "none", cursor: "pointer", font: "var(--font-label-300)", color: "var(--color-fg-neutral-subtle)", textDecoration: "underline" }}>清除</button>}
          {scopeHint}
          <span className="wg-caption" style={{ marginLeft: "auto", color: "var(--color-fg-neutral-muted)" }}>{rows.length} 筆任務</span>
          {/* TM-FS-101：欄位順序與「哪些欄位當列表欄位」是同一組全域設定，
              唯一維護處是欄位設定頁。此頁不再提供任何欄位控制。 */}
          {/* 🔴 2026-09-13 Sucre：「看不到直立地圖在後台哪裡可以設定。」
              它原本只活在 事件資訊 ⓘ → 事件設定 → 往下捲 —— 三層，而且第一層是
              左側事件名稱旁一顆不起眼的 ⓘ。設定頁裡仍然保留那一份（它本來就屬於
              事件層設定），但**入口要在工作的地方**：會用到直立地圖的人，正在看的
              是這張任務清單，不是事件設定頁。 */}
          {window.BuildingSetupModal && (
            <Button variant="outline" startIcon={<Icon n="Building2" s={17} />}
              onClick={() => tk.setModal("building")}>現場分區</Button>
          )}
          {onNew && <Button variant="primary" startIcon={<Icon n="Plus" s={17} />} onClick={onNew}>新增任務</Button>}
        </div>
        {open && (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FilterChips label="狀態" value={fStatus} onChange={setFStatus} options={window.TK_STATUS_EDITABLE.map((k) => [k, window.TK_STATUS[k].label])} />
              <FilterChips label="優先級" value={fPriority} onChange={setFPriority} options={Object.entries(window.TK_PRIORITY).map(([k, v]) => [k, v.label])} />
              <FilterChips label="需求" value={fKind} onChange={setFKind} options={Object.entries(window.TK_TASK_KIND).map(([k, v]) => [k, v.label])} />
              <FilterChips label="行政區域" value={fRegion} onChange={setFRegion} options={regionOpts} />
              <FilterChips label="組織分配" value={fTeam} onChange={setFTeam} options={teamOpts} />
              <FilterChips label="時間" value={fTime} onChange={setFTime} options={timeOpts} />
            </div>
          </Card>
        )}
        {view === "list" ? fullTable : splitView}
      </div>
    );
  }

  Object.assign(window, { TicketTable });
})();
