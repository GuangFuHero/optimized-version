// station-table.jsx (v2) — 站點列表模組：工具列 + 可收合篩選 + 列表／地圖分割視圖
// 結構比照任務管理頁 tk-table.jsx：篩選收在 Chip 面板裡，欄位可自訂順序與顯示。
(function () {
  const { Card, Chip, Input, Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const { StatusBadge, TypeChip, OfficialTag, Menu, PendingChip, canHandleStation, UpdatedCell, relTime } = window.StationShared;
  const Icon = window.WGIcon;

  // 2026-08-21：站點來源只有「後台匯入」一種，該維度不具區別力，篩選器改為「官方認定」。
  const OFFICIAL_OPTS = [["yes", "官方"], ["no", "非官方"]];
  const SINCE_OPTS = [["early", "災後首週"], ["later", "首週之後"]];

  function matches(s, q) {
    if (!q) return true;
    const k = q.trim().toLowerCase();
    const bag = [s.id, s.name, s.address, s.area, s.contact,
      SD.TYPE[s.type] && SD.TYPE[s.type].label,
      SD.STATUS[s.status] && SD.STATUS[s.status].label,
      ...(s.supplies || []).map((x) => x.item)];
    return bag.some((v) => v && String(v).toLowerCase().includes(k));
  }

  // ── 營運狀態快速通道（AC-10：不進審核佇列）────────────────────────────
  function QuickStatus({ station, canQuick, onQuickStatus }) {
    if (!canQuick) return React.createElement(StatusBadge, { status: station.status });
    const items = SD.STATUS_ORDER.map((s) => ({ value: s, label: SD.STATUS[s].label, dot: SD.STATUS[s].tone === "neutral" ? "neutral-sunken" : SD.STATUS[s].tone }));
    return React.createElement(Menu, {
      value: station.status, items, align: "left", width: 150,
      onSelect: (v) => onQuickStatus(station.id, v),
      trigger: () => React.createElement("button", {
        type: "button", title: "快速變更營運狀態（不排審）",
        style: { display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", padding: 0 },
      },
        React.createElement(StatusBadge, { status: station.status }),
        React.createElement(Icon, { n: "ChevronsUpDown", s: 13, c: "var(--color-fg-neutral-muted)" })
      ),
    });
  }

  // ── 指派 Team（有權限者可直接改）────────────────────────────────────
  function AssignTeamCell({ station, canAssign, onAssign }) {
    const label = station.assignedTeam || "未指派";
    const muted = !station.assignedTeam;
    const text = React.createElement("span", {
      style: { font: "var(--font-body-300)", color: muted ? "var(--color-fg-neutral-muted)" : "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    }, label);
    if (!canAssign) return text;
    const items = [{ value: "", label: "未指派", dot: "neutral-sunken" }, ...SD.TEAMS.map((t) => ({ value: t, label: t }))];
    return React.createElement(Menu, {
      value: station.assignedTeam || "", items, align: "left", width: 180,
      onSelect: (v) => onAssign(station.id, v || null),
      trigger: () => React.createElement("button", {
        type: "button", title: station.assignedTeam ? "變更指派 Team" : "指派 Team",
        style: { display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", padding: 0, maxWidth: "100%" },
      }, text, React.createElement(Icon, { n: "ChevronsUpDown", s: 13, c: "var(--color-fg-neutral-muted)" })),
    });
  }

  // ── 每個欄位的儲存格 ──────────────────────────────────────────────────
  const CELL = {
    station: (s, ctx) => React.createElement("span", { style: { minWidth: 0, display: "flex", alignItems: "center", gap: 10 } },
      // 群內站點的縮排與轉角接頭，讓它在視覺上掛在上一列的站點群底下
      ctx.depth === 1 && React.createElement("span", { style: { width: 22, flexShrink: 0, display: "inline-flex", justifyContent: "flex-end", alignSelf: "stretch", alignItems: "center" } },
        React.createElement(Icon, { n: "CornerDownRight", s: 15, c: "var(--color-fg-neutral-muted)" })),
      React.createElement("span", { style: { width: 36, height: 36, flexShrink: 0, borderRadius: "var(--radius-md)", display: "inline-flex", alignItems: "center", justifyContent: "center", background: `var(--color-bg-${SD.TYPE[s.type].tone === "neutral" ? "neutral-sunken" : SD.TYPE[s.type].tone + "-subtle"})`, color: `var(--color-bg-${SD.TYPE[s.type].tone === "neutral" ? "info" : SD.TYPE[s.type].tone})` } },
        React.createElement(Icon, { n: SD.TYPE[s.type].icon, s: 18, c: "currentColor" })),
      React.createElement("span", { style: { minWidth: 0 } },
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.name),
          s.isParent && React.createElement(Badge, { tone: "info" }, ctx.childCount ? `站點群 · ${ctx.childCount} 站` : "站點群"),
          s.deleted && React.createElement(Badge, { tone: "neutral" }, "已下架")
        ),
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" } },
          React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, s.id),
          React.createElement(OfficialTag, { official: s.isOfficial }),
          // 站點排在自己的站點群正下方時不必重複寫群名；若因篩選被拆散才標出來
          ctx.parentName && ctx.depth !== 1 && React.createElement("span", {
            className: "wg-data-xs", title: "此站點屬於某個站點群",
            style: { display: "inline-flex", alignItems: "center", gap: 3, color: "var(--color-fg-neutral-muted)" },
          }, React.createElement(Icon, { n: "CornerDownRight", s: 12, c: "currentColor" }), `屬：${ctx.parentName}`)
        )
      )
    ),
    type:    (s) => React.createElement("span", null, React.createElement(TypeChip, { type: s.type })),
    area:    (s) => React.createElement("span", { className: "wg-caption", style: { display: "inline-flex", alignItems: "center", gap: 4 } },
                      React.createElement(Icon, { n: "MapPin", s: 14, c: "var(--color-fg-neutral-muted)" }), s.area),
    // stopPropagation 只包住控制項本身（justifySelf: start），
    // 儲存格剩下的空白要能穿透到整列的 onClick，否則點那一欄開不了 Drawer
    status:  (s, ctx) => React.createElement("span", { onClick: (e) => e.stopPropagation(), style: { justifySelf: "start" } },
                      // 站點群是純容器，沒有營運狀態可切（2026-08-21 決議）
                      s.isParent
                        ? React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" }, title: "站點群本身沒有營運狀態，開關由群內各站各自表達" }, "—")
                        : React.createElement(QuickStatus, { station: s, canQuick: ctx.caps.canQuickStatus && canHandleStation(ctx.caps, s), onQuickStatus: ctx.onQuickStatus })),
    team:    (s, ctx) => React.createElement("span", { onClick: (e) => e.stopPropagation(), style: { justifySelf: "start", minWidth: 0, maxWidth: "100%" } },
                      React.createElement(AssignTeamCell, { station: s, canAssign: ctx.caps.canAssign, onAssign: ctx.onAssign })),
    updated: (s) => React.createElement("span", { style: { justifySelf: "start" } }, React.createElement(UpdatedCell, { station: s })),
  };

  // 表頭旁的「待確認」標籤：這兩欄與正典不一致／正典沒有
  const HEAD_PENDING = {
    status: { info: () => SD.PENDING.status2, label: "等後端開欄位" },
    team:   { info: () => SD.PENDING.rbacTeam, label: "等後端開欄位" },
  };

  function StationRow({ s, cols, gridCols, pad, ctx, onOpen }) {
    // 群內站點：靠左側細線 + 縮排 + 轉角接頭表達依附關係。
    // 不加底色——底色會跟 hover 用的 neutral-subtle 撞色，變成 hover 沒反應。
    const child = ctx.depth === 1;
    return React.createElement("div", {
      className: "tk-row", onClick: () => onOpen(s),
      style: { display: "grid", gridTemplateColumns: gridCols, gap: 12, alignItems: "center", padding: pad,
        borderBottom: "1px solid var(--color-border-default)", cursor: "pointer", opacity: s.deleted ? 0.62 : 1,
        borderLeft: child ? "3px solid var(--color-bg-info)" : "3px solid transparent" },
    },
      cols.map((c) => React.createElement(React.Fragment, { key: c.key }, CELL[c.key](s, ctx))),
      React.createElement("span", null, React.createElement(Icon, { n: "ChevronRight", s: 18, c: "var(--color-fg-neutral-muted)" }))
    );
  }

  // 地圖視圖左側的精簡卡片
  function StationCard({ s, selected, onSelect, onOpen, parentName, depth, childCount }) {
    const child = depth === 1;
    return React.createElement("div", {
      onClick: () => onSelect(s.id), role: "button", tabIndex: 0,
      className: "tk-row",
      onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.id); } },
      style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 10, alignItems: "center", cursor: "pointer",
        padding: child ? "12px 14px 12px 30px" : "12px 14px 12px 11px", borderBottom: "1px solid var(--color-border-default)",
        borderLeft: selected ? "3px solid var(--color-bg-primary)" : (child ? "3px solid var(--color-bg-info)" : "3px solid transparent"),
        // 選取態用 inline 蓋過 CSS hover；未選取的交給 .tk-row 處理
        background: selected ? "var(--color-bg-primary-subtle)" : undefined },
    },
      React.createElement("span", { style: { minWidth: 0 } },
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 6 } },
          child && React.createElement(Icon, { n: "CornerDownRight", s: 12, c: "var(--color-fg-neutral-muted)" }),
          React.createElement("span", { style: { font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" } }, s.id),
          childCount > 0 && React.createElement(Badge, { tone: "info" }, `站點群 · ${childCount} 站`)
        ),
        React.createElement("span", { style: { display: "block", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.name),
        React.createElement("span", { className: "wg-caption", style: { display: "block", color: "var(--color-fg-neutral-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          parentName && !child ? `屬：${parentName} · ${s.address}` : s.address),
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 5, flexWrap: "wrap" } },
          React.createElement("span", { className: "wg-data-xs", style: { color: s.assignedTeam ? "var(--color-fg-neutral-subtle)" : "var(--color-fg-neutral-muted)" } },
            s.assignedTeam || "未指派"),
          React.createElement(UpdatedCell, { station: s })),
        React.createElement("button", {
          onClick: (e) => { e.stopPropagation(); onOpen(s); },
          style: { marginTop: 6, display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: 0, cursor: "pointer",
            font: "var(--font-body-300)", color: "var(--color-brand-secondary-default)", textDecoration: "underline" },
        }, "開啟站點細節", React.createElement(Icon, { n: "ChevronRight", s: 14, c: "var(--color-brand-secondary-default)" }))
      ),
      React.createElement("span", null, React.createElement(StatusBadge, { status: s.status }))
    );
  }

  function EmptyState({ title, caption }) {
    return React.createElement("div", { style: { padding: "64px 0", textAlign: "center", color: "var(--color-fg-neutral-muted)" } },
      React.createElement(Icon, { n: "SearchX", s: 38, c: "var(--color-fg-neutral-muted)" }),
      React.createElement("div", { className: "wg-h600", style: { marginTop: 12, color: "var(--color-fg-neutral-subtle)" } }, title),
      React.createElement("div", { className: "wg-caption", style: { marginTop: 4 } }, caption)
    );
  }

  // ── 主元件 ────────────────────────────────────────────────────────────
  function StationTable({
    stations, caps, view, density,
    onOpenStation, onQuickStatus, onAssign, onNew, onOpenReview, onExport, onImport,
    onAddStationAt, onCount, pendingCount,
  }) {
    const [q, setQ] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [sel, setSel] = React.useState(null);
    const [fType, setFType] = React.useState("all");
    const [fStatus, setFStatus] = React.useState("all");
    const [fArea, setFArea] = React.useState("all");
    const [fSince, setFSince] = React.useState("all");
    const [fSource, setFSource] = React.useState("all");
    const [fTeam, setFTeam] = React.useState("all");
    const [showRetired, setShowRetired] = React.useState(false);

    const activeCount = (fType !== "all") + (fStatus !== "all") + (fArea !== "all") + (fSince !== "all") + (fSource !== "all") + (fTeam !== "all") + (showRetired ? 1 : 0);
    const reset = () => { setFType("all"); setFStatus("all"); setFArea("all"); setFSince("all"); setFSource("all"); setFTeam("all"); setShowRetired(false); };

    let rows = stations;
    if (!showRetired) rows = rows.filter((s) => !s.deleted);
    if (fType !== "all") rows = rows.filter((s) => s.type === fType);
    if (fStatus !== "all") rows = rows.filter((s) => s.status === fStatus);
    if (fArea !== "all") rows = rows.filter((s) => s.area === fArea);
    if (fSource !== "all") rows = rows.filter((s) => !!s.isOfficial === (fSource === "yes"));
    if (fTeam !== "all") rows = rows.filter((s) => fTeam === "__none__" ? !s.assignedTeam : s.assignedTeam === fTeam);
    if (fSince !== "all") rows = rows.filter((s) => (s.established <= "2024-09-26") === (fSince === "early"));
    rows = rows.filter((s) => matches(s, q));
    // 排序：開設中在前 → 最後更新新的在前
    const byRank = (a, b) => {
      const o = (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1); if (o) return o;
      return (a.updatedMin ?? 1e9) - (b.updatedMin ?? 1e9);
    };
    // 依附排序：群內站點緊接在自己的站點群下面，不跟著全域排序跑掉。
    // 站點群被篩掉時，群內站點升為頂層並在名稱旁標「屬：站點群名」（2026-08-21 確認保留）。
    // nested 的每一項是 { s, depth, childCount }；rows 維持平面，只用來算筆數。
    const nested = (() => {
      const present = new Set(rows.map((x) => x.id));
      const kids = {};
      rows.forEach((x) => {
        if (x.parentId && present.has(x.parentId)) (kids[x.parentId] = kids[x.parentId] || []).push(x);
      });
      const tops = rows.filter((x) => !(x.parentId && present.has(x.parentId))).sort(byRank);
      const out = [];
      tops.forEach((x) => {
        const cs = (kids[x.id] || []).sort(byRank);
        out.push({ s: x, depth: 0, childCount: cs.length });
        cs.forEach((c) => out.push({ s: c, depth: 1, childCount: 0 }));
      });
      return out;
    })();

    React.useEffect(() => { if (onCount) onCount(rows.length); }, [rows.length]); // eslint-disable-line

    const byId = React.useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), [stations]);
    const parentNameOf = (s) => (s.parentId && byId[s.parentId] ? byId[s.parentId].name : null);

    // 2026-08-16：欄位不可自訂，直接依 STATION_COLUMNS 的定義順序全部顯示
    const cols = window.STATION_COLUMNS;
    const gridCols = cols.map((c) => c.width).join(" ") + " 28px";
    const pad = density === "compact" ? "10px 16px" : "14px 16px";

    const FilterChips = ({ label, value, onChange, options }) => React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
      React.createElement("span", { className: "wg-caption", style: { color: "var(--color-fg-neutral-muted)", width: 64, flexShrink: 0 } }, label),
      React.createElement(Chip, { active: value === "all", onClick: () => onChange("all") }, "全部"),
      options.map(([k, lbl]) => React.createElement(Chip, { key: k, active: value === k, onClick: () => onChange(k) }, lbl))
    );

    const fullTable = React.createElement(Card, { padding: "0" },
      React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("div", { style: { minWidth: 1000 } },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: gridCols, gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--color-border-default)" } },
            cols.map((c) => React.createElement("span", { key: c.key, className: "wg-caption", style: { fontWeight: 700, color: "var(--color-fg-neutral-muted)", display: "inline-flex", alignItems: "center", gap: 6 } },
              c.label,
              HEAD_PENDING[c.key] && React.createElement(PendingChip, { info: HEAD_PENDING[c.key].info(), label: HEAD_PENDING[c.key].label, size: "sm" })
            )),
            React.createElement("span", null)
          ),
          rows.length === 0 && React.createElement(EmptyState, { title: "此條件下沒有站點", caption: "調整篩選、搜尋或切換角色視角再試。" }),
          nested.map((r) => React.createElement(StationRow, {
            key: r.s.id, s: r.s, cols, gridCols, pad, onOpen: onOpenStation,
            ctx: { caps, onQuickStatus, onAssign, parentName: parentNameOf(r.s), depth: r.depth, childCount: r.childCount },
          }))
        )
      )
    );

    // 地圖視圖：左清單 40 / 右地圖 60，與任務管理頁同一組比例
    const MAP_H = 560;
    const splitView = React.createElement("div", { style: { display: "grid", gridTemplateColumns: "40fr 60fr", gap: "var(--spacing-4)", alignItems: "start" } },
      React.createElement(Card, { padding: "0", style: { overflow: "hidden", height: MAP_H, display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--color-border-default)", flexShrink: 0 } },
          ["站點", "營運狀態"].map((h) => React.createElement("span", { key: h, className: "wg-caption", style: { fontWeight: 700, color: "var(--color-fg-neutral-muted)" } }, h))
        ),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto" } },
          rows.length === 0 && React.createElement(EmptyState, { title: "此條件下沒有站點", caption: "調整篩選或搜尋再試。" }),
          nested.map((r) => React.createElement(StationCard, { key: r.s.id, s: r.s, selected: sel === r.s.id, onSelect: setSel, onOpen: onOpenStation, parentName: parentNameOf(r.s), depth: r.depth, childCount: r.childCount }))
        )
      ),
      React.createElement(window.StationMap, { stations: rows, caps, selectedId: sel, onSelect: setSel, onOpenStation, onAddStationAt, height: MAP_H })
    );

    const btnCss = { display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)", cursor: "pointer", font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)" };

    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "var(--spacing-3)" } },
      // —— 工具列（單行，比照任務管理頁）——
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "var(--spacing-2)", flexWrap: "wrap" } },
        React.createElement("button", { onClick: () => setOpen((o) => !o), style: { ...btnCss, background: open ? "var(--color-bg-neutral-subtle)" : "var(--color-bg-neutral-default)" } },
          React.createElement(Icon, { n: "SlidersHorizontal", s: 16, c: "var(--color-fg-neutral-subtle)" }), "篩選",
          activeCount > 0 && React.createElement("span", { style: { minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", color: "var(--color-fg-neutral-subtle)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" } }, String(activeCount)),
          React.createElement(Icon, { n: open ? "ChevronUp" : "ChevronDown", s: 15, c: "var(--color-fg-neutral-muted)" })
        ),
        React.createElement(Input, { value: q, onChange: (e) => setQ(e.target.value),
          leadingIcon: React.createElement(Icon, { n: "Search", s: 16, c: "var(--color-fg-neutral-muted)" }),
          placeholder: "搜尋編號／站名／地址／物資／聯絡人…", style: { width: 320, height: 42 } }),
        (activeCount > 0 || q) && React.createElement("button", { onClick: () => { reset(); setQ(""); },
          style: { border: "none", background: "none", cursor: "pointer", font: "var(--font-label-300)", color: "var(--color-fg-neutral-subtle)", textDecoration: "underline" } }, "清除"),
        React.createElement("span", { className: "wg-caption", style: { marginLeft: "auto", color: "var(--color-fg-neutral-muted)" } }, `${rows.length} 站`),
        caps.canReview && React.createElement("button", { onClick: onOpenReview, title: "前台修改建議審查", style: btnCss },
          React.createElement(Icon, { n: "GitPullRequestArrow", s: 15, c: "var(--color-fg-neutral-subtle)" }), "審查",
          pendingCount > 0 && React.createElement(Badge, { tone: "warning", variant: "solid" }, String(pendingCount))
        ),
        caps.canImport && React.createElement("button", { onClick: onImport, title: "從 CSV 匯入站點名單", style: btnCss },
          React.createElement(Icon, { n: "Upload", s: 15, c: "var(--color-fg-neutral-subtle)" }), "匯入"),
        React.createElement("button", { onClick: onExport, title: "匯出離線清單", style: btnCss },
          React.createElement(Icon, { n: "Download", s: 15, c: "var(--color-fg-neutral-subtle)" }), "匯出"),
        caps.isTeam && React.createElement(PendingChip, { info: SD.PENDING.rbacTeam, label: `僅限 ${caps.team} 被指派的站點` }),
        caps.isAuditor && React.createElement(PendingChip, { info: SD.PENDING.rbacAuditor, label: "權限與 Notion 不一致" }),
        caps.canCreate && onNew && React.createElement(Button, { variant: "primary", startIcon: React.createElement(Icon, { n: "Plus", s: 17 }), onClick: onNew }, "新增站點")
      ),

      // —— 可收合篩選面板 ——
      open && React.createElement(Card, null,
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
          React.createElement(FilterChips, { label: "類型", value: fType, onChange: setFType, options: SD.TYPE_ORDER.map((t) => [t, SD.TYPE[t].label]) }),
          React.createElement(FilterChips, { label: "營運狀態", value: fStatus, onChange: setFStatus, options: SD.STATUS_ORDER.map((s) => [s, SD.STATUS[s].label]) }),
          React.createElement(FilterChips, { label: "行政區", value: fArea, onChange: setFArea, options: SD.AREAS.map((a) => [a, a]) }),
          React.createElement(FilterChips, { label: "成立", value: fSince, onChange: setFSince, options: SINCE_OPTS }),
          React.createElement(FilterChips, { label: "官方認定", value: fSource, onChange: setFSource, options: OFFICIAL_OPTS }),
          React.createElement(FilterChips, { label: "指派 Team", value: fTeam, onChange: setFTeam, options: [...SD.TEAMS.map((t) => [t, t]), ["__none__", "未指派"]] }),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", { className: "wg-caption", style: { color: "var(--color-fg-neutral-muted)", width: 64, flexShrink: 0 } }, "已下架"),
            React.createElement(Chip, { active: !showRetired, onClick: () => setShowRetired(false) }, "隱藏"),
            React.createElement(Chip, { active: showRetired, onClick: () => setShowRetired(true) }, "一併顯示")
          )
        )
      ),

      view === "map" ? splitView : fullTable
    );
  }

  window.StationTable = StationTable;
})();
