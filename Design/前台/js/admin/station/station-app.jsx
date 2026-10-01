// ResourceStation.jsx — 資源站管理 orchestrator: 角色、篩選、BI 統計、Table/Map、審查/匯出/詳情
(function () {
  const { Button, Badge, Switch, Card } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const { caps: makeCaps, ROLE_LABEL, FilterSelect } = window.StationShared;
  const Icon = window.WGIcon;

  function nowTs() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function matchStatus(text) {
    for (const k of SD.STATUS_ORDER) if (text.includes(SD.STATUS[k].label)) return k;
    return "open";
  }
  const ROLES = [["auditor", "Data Auditor", "ClipboardCheck"], ["admin", "Super Admin", "ShieldCheck"], ["ngo", "NGO", "HeartHandshake"]];

  function ResourceStation({ tweaks, role, setRole }) {
    const [view, setView] = React.useState("table");
    const [stations, setStations] = React.useState(() => SD.STATIONS.map((s) => ({ ...s, history: s.history.map((h) => ({ ...h })) })));
    const [proposals, setProposals] = React.useState(() => SD.PROPOSALS.map((p) => ({ ...p })));
    const [filters, setFilters] = React.useState({ area: "all", type: "all", status: "all", since: "all", q: "", showRetired: false });
    const [drawer, setDrawer] = React.useState(null);        // {mode, station, addCoords}
    const [review, setReview] = React.useState(null);        // {stationId?}
    const [exportOpen, setExportOpen] = React.useState(false);
    const [toast, setToast] = React.useState(null);
    const seq = React.useRef(200);

    const caps = makeCaps(role);
    const showToast = (msg, tone = "success") => { setToast({ msg, tone }); clearTimeout(showToast._t); showToast._t = setTimeout(() => setToast(null), 3200); };

    // role change closes review/drawer if no longer permitted
    React.useEffect(() => {
      if (!caps.canReview && review) setReview(null);
    }, [role]); // eslint-disable-line

    // 通知 deep-link（IAM-UP-108）：收到 wg:notify-open 就開該站點的 Drawer。
    // preventDefault() 告訴 wg-notify「本頁已處理，不用跨頁」。
    React.useEffect(() => {
      function onNotifyOpen(e) {
        const ref = e.detail;
        if (!ref || ref.kind !== "station") return;
        const s = stations.find((x) => x.id === ref.id);
        if (!s) return;              // 找不到就不攔
        setReview(null);
        setDrawer({ mode: "view", station: s });
        e.preventDefault();
      }
      window.addEventListener("wg:notify-open", onNotifyOpen);
      return () => window.removeEventListener("wg:notify-open", onNotifyOpen);
    }, [stations]);

    const stationsById = React.useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), [stations]);
    const pendingByStation = React.useMemo(() => {
      const m = {};
      proposals.filter((p) => p.status === "pending").forEach((p) => { m[p.stationId] = (m[p.stationId] || 0) + 1; });
      return m;
    }, [proposals]);
    const pendingCount = proposals.filter((p) => p.status === "pending").length;

    const filtered = React.useMemo(() => stations.filter((s) => {
      if (!filters.showRetired && s.deleted) return false;
      if (filters.area !== "all" && s.area !== filters.area) return false;
      if (filters.type !== "all" && s.type !== filters.type) return false;
      if (filters.status !== "all" && s.status !== filters.status) return false;
      if (filters.since !== "all") {
        const early = s.established <= "2024-09-26";
        if (filters.since === "early" && !early) return false;
        if (filters.since === "later" && early) return false;
      }
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (!(s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))) return false;
      }
      return true;
    }), [stations, filters]);

    // —— mutations ——
    function bump(s, note, diff) {
      const v = s.version + 1;
      return { ...s, version: v, updated: nowTs(), history: [{ v, who: `${ROLE_LABEL[role]}`, when: nowTs(), note, diff }, ...s.history] };
    }
    function updateStation(id, fn) { setStations((arr) => arr.map((s) => (s.id === id ? fn(s) : s))); }

    function quickStatus(id, status) {
      const s = stationsById[id];
      if (s.status === status) return;
      updateStation(id, (st) => bump({ ...st, status }, "營運狀態快速通道更新", [{ field: "operational_status", old: SD.STATUS[st.status].label, new: SD.STATUS[status].label }]));
      showToast(`已即時更新為「${SD.STATUS[status].label}」，未排入審核佇列`);
    }

    function applyChange(st, r) {
      const f = r.field, v = r.new;
      if (f === "name") st.name = v;
      else if (f === "contact_phone") st.phone = v;
      else if (f === "opening_hours") st.hours = v;
      else if (f === "address") st.address = v;
      else if (f === "operational_status") st.status = matchStatus(v);
      else if (f === "supplies") st.supplies = v.split("、").map((item) => ({ item: item.trim(), level: "full" }));
    }
    function approveProposal(p, fieldRows) {
      updateStation(p.stationId, (st) => {
        const copy = { ...st, supplies: [...st.supplies] };
        fieldRows.forEach((r) => applyChange(copy, r));
        const diff = fieldRows.map((r) => ({ field: r.field, old: r.isConflict ? r.live : r.old, new: r.new }));
        return bump(copy, `核准前台建議 ${p.id}`, diff);
      });
      setProposals((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: "approved" } : x)));
      showToast(`已核准 ${p.id}，前台資料將於 1 分鐘內反映`);
    }
    function rejectProposal(p, reason) {
      setProposals((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: "rejected", reason } : x)));
      showToast(`已拒絕 ${p.id}`, "warning");
    }
    function saveStation(form, isNew) {
      const cap = form.capacity === "" ? null : Number(form.capacity);
      const load = form.load === "" ? null : Number(form.load);
      if (isNew) {
        const id = `RS-0${seq.current++}`;
        const st = {
          id, name: form.name, type: form.type, area: form.area, address: form.address,
          lat: form.lat || 23.66, lng: form.lng || 121.42, x: form.x || 50, y: form.y || 50,
          status: form.status, capacity: cap, load, supplies: [],
          contact: form.contact || "—", phone: form.phone || "—", hours: form.hours || "—",
          source: "official", verified: true, verifiedBy: ROLE_LABEL[role], established: nowTs().slice(0, 10),
          createdBy: ROLE_LABEL[role], updated: nowTs(), version: 1, deleted: false,
          history: [{ v: 1, who: ROLE_LABEL[role], when: nowTs(), note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
        };
        setStations((arr) => [st, ...arr]);
        showToast(`已建立站點 ${st.name}`);
      } else {
        updateStation(form.id, (st) => {
          const diff = [];
          const fields = [["name", "name", "站名"], ["type", "type"], ["area", "area"], ["address", "address"], ["status", "operational_status"], ["hours", "opening_hours"], ["contact", "contact_name"], ["phone", "contact_phone"]];
          fields.forEach(([k, fld]) => { if (String(st[k]) !== String(form[k])) diff.push({ field: fld, old: String(st[k]), new: String(form[k]) }); });
          if ((st.capacity ?? "") !== (cap ?? "")) diff.push({ field: "capacity", old: String(st.capacity ?? "—"), new: String(cap ?? "—") });
          if ((st.load ?? "") !== (load ?? "")) diff.push({ field: "current_load", old: String(st.load ?? "—"), new: String(load ?? "—") });
          const merged = { ...st, name: form.name, type: form.type, area: form.area, address: form.address, status: form.status, hours: form.hours, contact: form.contact, phone: form.phone, capacity: cap, load };
          return bump(merged, "編輯站點資料", diff.length ? diff : [{ field: "—", old: "—", new: "無欄位變更" }]);
        });
        showToast("已儲存站點變更");
      }
      setDrawer(null);
    }
    function retire(st) {
      updateStation(st.id, (s) => bump({ ...s, deleted: true, status: "closed" }, "下架站點（軟刪除，資料保留）", [{ field: "operational_status", old: SD.STATUS[s.status].label, new: "已關閉" }]));
      showToast("已下架站點（軟刪除，可重新啟用）", "warning");
      setDrawer(null);
    }
    function reactivate(st) {
      updateStation(st.id, (s) => bump({ ...s, deleted: false, status: "open" }, "重新啟用站點（沿用歷史與 ID）", [{ field: "operational_status", old: "已關閉", new: "營運中" }]));
      showToast("已重新啟用站點");
      setDrawer(null);
    }
    function rollback(st, v) {
      updateStation(st.id, (s) => bump({ ...s }, `回溯到 v${v}（rollback 本身為新版本）`, [{ field: "rollback", old: `v${s.version}`, new: `v${v} 內容` }]));
      showToast(`已回溯到 v${v}（歷史保留）`);
    }

    // refresh drawer station ref after mutation
    const drawerStation = drawer && drawer.station ? stationsById[drawer.station.id] || drawer.station : null;

    return React.createElement("div", { style: { maxWidth: 1200, margin: "0 auto" } },
      // —— header ——
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 } },
        React.createElement("div", { style: { flex: 1, minWidth: 240 } },
          React.createElement("p", { className: "wg-caption", style: { marginTop: 4 } }, "管理站點資料、審查前台修改建議、掌握區域分布。資源站為公共資訊，全角色可見。")
        )
      ),

      // —— action row ——
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 } },
        React.createElement(ViewTabs, { view, setView }),
        React.createElement("div", { style: { flex: 1 } }),
        caps.canReview && React.createElement(Button, { variant: "outline", size: "md", startIcon: React.createElement(Icon, { n: "GitPullRequestArrow", s: 17 }), onClick: () => setReview({}) },
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 } }, "修改建議審查", pendingCount > 0 && React.createElement(Badge, { tone: "warning", variant: "solid" }, String(pendingCount)))
        ),
        React.createElement(Button, { variant: "outline", size: "md", startIcon: React.createElement(Icon, { n: "Download", s: 17 }), onClick: () => setExportOpen(true) }, "匯出"),
        caps.canCreate && React.createElement(Button, { variant: "primary", size: "md", startIcon: React.createElement(Icon, { n: "Plus", s: 18 }), onClick: () => setDrawer({ mode: "new" }) }, "新增站點")
      ),

      // —— BI stats ——
      tweaks.showStats && React.createElement(StatRow, { filtered, pendingCount }),

      // —— filter bar ——
      React.createElement(FilterBar, { filters, setFilters, count: filtered.length }),

      // —— content ——
      React.createElement(Card, { padding: view === "map" ? "0" : "4px 0", elevation: "sm", style: { marginTop: 16, overflow: view === "map" ? "visible" : "hidden", background: view === "map" ? "transparent" : "var(--color-bg-neutral-default)", border: view === "map" ? "none" : undefined, boxShadow: view === "map" ? "none" : undefined } },
        view === "table"
          ? React.createElement(window.StationTable, { stations: filtered, caps, pendingByStation, density: tweaks.density, onOpenStation: (s) => setDrawer({ mode: "view", station: s }), onQuickStatus: quickStatus, onOpenReviewFor: (id) => caps.canReview ? setReview({ stationId: id }) : showToast("此角色無審查權限", "warning") })
          : React.createElement(window.StationMap, { stations: filtered, caps, density: tweaks.density, onOpenStation: (s) => setDrawer({ mode: "view", station: s }), onAddStationAt: (c) => setDrawer({ mode: "new", addCoords: c }) })
      ),

      // —— overlays ——
      review && caps.canReview && React.createElement(window.ReviewQueue, {
        proposals, stationsById, caps, initialStationId: review.stationId,
        onApprove: approveProposal, onReject: rejectProposal,
        onAdjust: (st) => { setReview(null); if (st) setDrawer({ mode: "edit", station: st }); },
        onClose: () => setReview(null),
      }),
      drawer && React.createElement(window.StationDrawer, {
        station: drawerStation, mode: drawer.mode, addCoords: drawer.addCoords, caps,
        onClose: () => setDrawer(null), onSave: saveStation, onRetire: retire, onReactivate: reactivate, onRollback: rollback,
      }),
      exportOpen && React.createElement(window.ExportDialog, { caps, count: filtered.length, onClose: () => setExportOpen(false), onExport: (o) => { setExportOpen(false); showToast(`已匯出 ${o.fmt.toUpperCase()}（資料截至 ${o.ts}）`); } }),

      // —— toast ——
      toast && React.createElement("div", { style: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 1200, display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-default)", color: "#fff", boxShadow: "var(--shadow-lg)", font: "var(--font-label-400)", animation: "wgToastIn var(--transition-spring)" } },
        React.createElement(Icon, { n: toast.tone === "warning" ? "Info" : "CircleCheck", s: 18, c: toast.tone === "warning" ? "var(--prim-color-amber-300)" : "var(--prim-color-green-300)" }),
        toast.msg
      )
    );
  }

  // 頂部角色視角列（對齊任務管理頁 DemoBar：檢視角色置頂）
  function StationRoleBar({ role, setRole }) {
    const Icon = window.WGIcon;
    return React.createElement("div", { style: { flexShrink: 0, background: "#0F172A", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: 52, overflowX: "auto" } },
      React.createElement("span", { style: { font: "var(--font-label-300)", color: "#94A3B8", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 } },
        React.createElement(Icon, { n: "Eye", s: 15, c: "#94A3B8" }), "原型 · 角色視角"),
      React.createElement("div", { style: { display: "flex", gap: 6 } },
        ROLES.map(([id, label, icon]) => {
          const active = role === id;
          return React.createElement("button", { key: id, type: "button", onClick: () => setRole(id),
            style: { display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 14px", cursor: "pointer", borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
              border: active ? "1.5px solid var(--color-bg-primary)" : "1px solid #334155", background: active ? "var(--color-bg-primary)" : "transparent",
              color: active ? "#111" : "#CBD5E1", font: "var(--font-label-300)" } },
            React.createElement(Icon, { n: icon, s: 15, c: active ? "#111" : "#CBD5E1" }), label);
        })
      )
    );
  }

  function RoleSwitch({ role, setRole }) {
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" } },
      React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, "目前檢視角色"),
      React.createElement("div", { style: { display: "inline-flex", padding: 4, borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", gap: 2 } },
        ROLES.map(([id, label, icon]) => {
          const active = role === id;
          return React.createElement("button", { key: id, type: "button", onClick: () => setRole(id),
            style: { display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: "var(--radius-full)", border: "none", cursor: "pointer",
              background: active ? "var(--color-bg-neutral-default)" : "transparent", boxShadow: active ? "var(--shadow-sm)" : "none",
              font: "var(--font-label-400)", fontWeight: active ? 700 : 400, color: active ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)", transition: "all var(--transition-fast)" } },
            React.createElement(window.WGIcon, { n: icon, s: 16, c: active ? "var(--color-bg-primary)" : "currentColor" }), label
          );
        })
      )
    );
  }

  function ViewTabs({ view, setView }) {
    const Icon = window.WGIcon;
    const opt = (id, label, icon) => {
      const active = view === id;
      return React.createElement("button", { type: "button", onClick: () => setView(id),
        style: { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: "var(--radius-full)", border: "none", cursor: "pointer",
          background: active ? "var(--color-bg-primary)" : "var(--color-bg-neutral-default)", color: active ? "var(--color-fg-on-primary)" : "var(--color-fg-neutral-subtle)",
          boxShadow: active ? "var(--shadow-sm)" : "inset 0 0 0 1px var(--color-border-default)", font: "var(--font-label-400)", fontWeight: 700, transition: "all var(--transition-fast)" } },
        React.createElement(Icon, { n: icon, s: 17, c: "currentColor" }), label);
    };
    return React.createElement("div", { style: { display: "inline-flex", gap: 8 } }, opt("table", "表格視圖", "Table2"), opt("map", "地圖視圖", "Map"));
  }

  function StatRow({ filtered, pendingCount }) {
    const open = filtered.filter((s) => s.status === "open" && !s.deleted).length;
    const crowd = filtered.filter((s) => s.source === "crowdsourced").length;
    const Icon = window.WGIcon;
    const Stat = ({ icon, tone, value, label }) => React.createElement(Card, { padding: "18px 20px", elevation: "sm", style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
        React.createElement("span", { style: { width: 42, height: 42, flexShrink: 0, borderRadius: "var(--radius-md)", display: "inline-flex", alignItems: "center", justifyContent: "center", background: `var(--color-bg-${tone}-subtle)`, color: `var(--color-bg-${tone})` } },
          React.createElement(Icon, { n: icon, s: 22, c: "currentColor" })),
        React.createElement("div", null,
          React.createElement("div", { className: "wg-data", style: { fontSize: 26, lineHeight: 1.1 } }, value),
          React.createElement("div", { className: "wg-caption", style: { marginTop: 2 } }, label)
        )
      )
    );
    return React.createElement("div", { style: { display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 } },
      React.createElement(Stat, { icon: "Boxes", tone: "primary", value: filtered.length, label: "符合條件站點" }),
      React.createElement(Stat, { icon: "CircleCheck", tone: "success", value: open, label: "營運中" }),
      React.createElement(Stat, { icon: "GitPullRequestArrow", tone: "warning", value: pendingCount, label: "待審修改建議" }),
      React.createElement(Stat, { icon: "Users", tone: "info", value: crowd, label: "群眾投稿站點" })
    );
  }

  function FilterBar({ filters, setFilters, count }) {
    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
    const Icon = window.WGIcon;
    const all = (label) => ({ value: "all", label });
    const dirty = filters.area !== "all" || filters.type !== "all" || filters.status !== "all" || filters.since !== "all" || filters.q || filters.showRetired;
    return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
      // search
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-default)", boxShadow: "inset 0 0 0 1px var(--color-border-default)", minWidth: 220, flex: "0 1 280px" } },
        React.createElement(Icon, { n: "Search", s: 17, c: "var(--color-fg-neutral-muted)" }),
        React.createElement("input", { value: filters.q, onChange: (e) => set("q")(e.target.value), placeholder: "搜尋站名 / 編號 / 地址…", style: { flex: 1, border: "none", background: "transparent", outline: "none", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" } })
      ),
      React.createElement(FilterSelect, { label: "地區", icon: "MapPin", value: filters.area, onSelect: set("area"), items: [all("全部"), ...SD.AREAS.map((a) => ({ value: a, label: a }))] }),
      React.createElement(FilterSelect, { label: "類型", icon: "Shapes", value: filters.type, onSelect: set("type"), items: [all("全部"), ...SD.TYPE_ORDER.map((t) => ({ value: t, label: SD.TYPE[t].label, icon: SD.TYPE[t].icon }))] }),
      React.createElement(FilterSelect, { label: "狀態", icon: "Activity", value: filters.status, onSelect: set("status"), items: [all("全部"), ...SD.STATUS_ORDER.map((s) => ({ value: s, label: SD.STATUS[s].label, dot: SD.STATUS[s].tone === "neutral" ? "neutral-sunken" : SD.STATUS[s].tone }))] }),
      React.createElement(FilterSelect, { label: "成立", icon: "CalendarDays", value: filters.since, onSelect: set("since"), items: [all("全部"), { value: "early", label: "災後首週" }, { value: "later", label: "首週之後" }] }),
      React.createElement("label", { style: { display: "inline-flex", alignItems: "center", gap: 8, marginLeft: 2, cursor: "pointer" } },
        React.createElement(Switch, { checked: filters.showRetired, onChange: (e) => set("showRetired")(e.target.checked), label: "顯示已下架" })
      ),
      dirty && React.createElement("button", { type: "button", onClick: () => setFilters({ area: "all", type: "all", status: "all", since: "all", q: "", showRetired: false }),
        style: { display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-fg-info)", font: "var(--font-label-400)" } },
        React.createElement(Icon, { n: "X", s: 15, c: "currentColor" }), "清除"),
      React.createElement("span", { className: "wg-data-xs", style: { marginLeft: "auto", color: "var(--color-fg-neutral-muted)" } }, `共 ${count} 站`)
    );
  }

  window.ResourceStation = ResourceStation;
  window.StationRoleBar = StationRoleBar;
})();
