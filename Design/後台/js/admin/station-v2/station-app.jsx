// ResourceStation.jsx — 資源站管理 orchestrator: 角色、篩選、BI 統計、Table/Map、審查/匯出/詳情
(function () {
  const { Button, Badge, Switch, Card } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const { caps: makeCaps, canHandleStation, ROLE_LABEL, PendingChip } = window.StationShared;
  const Icon = window.WGIcon;

  function nowTs() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function actorName(role) {
    const p = (window.TK_PERSONAS || {})[role] || {};
    const label = ((window.TK_RBAC || {})[role] || {}).label || role;
    return p.name ? `${p.name}（${label}）` : label;
  }
  function matchStatus(text) {
    for (const k of SD.STATUS_ORDER) if (text.includes(SD.STATUS[k].label)) return k;
    return "open";
  }
  const ROLES = [["auditor", "Data Auditor", "ClipboardCheck"], ["admin", "Super Admin", "ShieldCheck"], ["ngo", "NGO", "HeartHandshake"]];

  function ResourceStation({ tweaks, role, setRole, view, setView, onCount }) {
    const [stations, setStations] = React.useState(() => SD.STATIONS.map((s) => ({ ...s, history: s.history.map((h) => ({ ...h })) })));
    const [proposals, setProposals] = React.useState(() => SD.PROPOSALS.map((p) => ({ ...p })));
    const [drawer, setDrawer] = React.useState(null);        // {mode, station, addCoords}
    const [review, setReview] = React.useState(null);        // {stationId?}
    const [exportOpen, setExportOpen] = React.useState(false);
    const [importOpen, setImportOpen] = React.useState(false);
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

    // —— mutations ——
    function bump(s, note, diff) {
      const v = s.version + 1;
      const p = (window.TK_PERSONAS || {})[role] || {};
      const actor = p.name ? `${p.name}（${ROLE_LABEL[role]}）` : ROLE_LABEL[role];
      return { ...s, version: v, updated: nowTs(), updatedMin: 0, history: [{ v, who: actor, when: nowTs(), note, diff }, ...s.history] };
    }
    function updateStation(id, fn) { setStations((arr) => arr.map((s) => (s.id === id ? fn(s) : s))); }

    function quickStatus(id, status) {
      const s = stationsById[id];
      if (s.status === status) return;
      updateStation(id, (st) => bump({ ...st, status }, "營運狀態快速通道更新", [{ field: "operational_status", old: SD.STATUS[st.status].label, new: SD.STATUS[status].label }]));
      showToast(`已即時更新為「${SD.STATUS[status].label}」，未排入審核佇列（AC-10 快速通道）`);
    }

    // CSV 批次匯入。匯入後營運狀態一律為「已關閉」（2026-08-06 決策：名單匯入後預設為關）
    function importStations(rows) {
      const actor = actorName(role);
      const ts = nowTs();
      const made = rows.map((r, i) => {
        const id = `RS-0${seq.current++}`;
        return {
          id, name: r.name, type: r.type, area: r.area, address: r.address,
          lat: r.lat, lng: r.lng, x: 50, y: 50,
          status: "closed",                       // ← 匯入後預設為關
          supplies: [],
          contact: r.contact, phone: r.phone, hours: r.hours,
          parentId: null, photos: [], assignedTeam: null,
          isOfficial: false, verified: true, verifiedBy: actor,   // 匯入 ≠ 官方造冊（2026-08-21）
          established: ts.slice(0, 10), createdBy: actor,
          updated: ts, updatedMin: 0, version: 1, deleted: false,
          history: [{ v: 1, who: actor, when: ts, note: `CSV 匯入（第 ${i + 1} 筆）`, diff: [{ field: "operational_status", old: "—", new: "已關閉（待現場確認後開啟）" }] }],
        };
      });
      setStations((arr) => [...made, ...arr]);
      setImportOpen(false);
      showToast(`已匯入 ${made.length} 個站點，狀態皆為「已關閉」，請現場確認後逐一開啟`);
    }

    // 指派站點給 Team。⚠️ 無正典依據，見 StationData.PENDING.rbacTeam
    function assignStation(id, team) {
      const st = stationsById[id];
      if (!st || (st.assignedTeam || null) === (team || null)) return;
      updateStation(id, (x) => bump({ ...x, assignedTeam: team || null }, team ? `指派給 ${team}` : "取消指派",
        [{ field: "assigned_team", old: x.assignedTeam || "未指派", new: team || "未指派" }]));
      showToast(team ? `已指派給 ${team}` : "已取消指派");
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
      if (isNew) {
        const id = `RS-0${seq.current++}`;
        const st = {
          id, name: form.name, type: form.type, area: form.area, address: form.address,
          lat: form.lat || 23.66, lng: form.lng || 121.42, x: form.x || 50, y: form.y || 50,
          status: form.status, supplies: [],
          contact: form.contact || "—", phone: form.phone || "—", hours: form.hours || "—",
          isOfficial: false, verified: true, verifiedBy: actorName(role), established: nowTs().slice(0, 10),   // 後台新增 ≠ 官方造冊（2026-08-21）
          createdBy: actorName(role), updated: nowTs(), updatedMin: 0, version: 1, deleted: false,
          history: [{ v: 1, who: actorName(role), when: nowTs(), note: "建立站點", diff: [{ field: "—", old: "—", new: "初始建立" }] }],
        };
        setStations((arr) => [st, ...arr]);
        showToast(`已建立站點 ${st.name}`);
      } else {
        updateStation(form.id, (st) => {
          const diff = [];
          const fields = [["name", "name", "站名"], ["type", "type"], ["area", "area"], ["address", "address"], ["status", "operational_status"], ["hours", "opening_hours"], ["contact", "contact_name"], ["phone", "contact_phone"]];
          fields.forEach(([k, fld]) => { if (String(st[k]) !== String(form[k])) diff.push({ field: fld, old: String(st[k]), new: String(form[k]) }); });
          const merged = { ...st, name: form.name, type: form.type, area: form.area, address: form.address, status: form.status, hours: form.hours, contact: form.contact, phone: form.phone };
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
      updateStation(st.id, (s) => bump({ ...s, deleted: false, status: "open" }, "重新啟用站點（沿用歷史與 ID）", [{ field: "operational_status", old: "已關閉", new: "開設中" }]));
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
      React.createElement(window.StationTable, {
        stations, caps, view, density: tweaks.density,
        pendingCount,
        onOpenStation: (s) => setDrawer({ mode: "view", station: s }),
        onQuickStatus: quickStatus,
        onAssign: assignStation,
        onNew: () => setDrawer({ mode: "new" }),
        onOpenReview: () => caps.canReview ? setReview({}) : showToast("此角色無審查權限", "warning"),
        onExport: () => setExportOpen(true),
        onImport: () => setImportOpen(true),
        onAddStationAt: (c) => setDrawer({ mode: "new", addCoords: c }),
        onCount,
      }),

      // —— overlays ——
      review && caps.canReview && React.createElement(window.ReviewQueue, {
        proposals, stationsById, caps, initialStationId: review.stationId,
        onApprove: approveProposal, onReject: rejectProposal,
        onAdjust: (st) => { setReview(null); if (st) setDrawer({ mode: "edit", station: st }); },
        onClose: () => setReview(null),
      }),
      drawer && React.createElement(window.StationDrawer, {
        station: drawerStation, mode: drawer.mode, addCoords: drawer.addCoords, caps, allStations: stations,
        onClose: () => setDrawer(null), onSave: saveStation, onRetire: retire, onReactivate: reactivate, onRollback: rollback,
      }),
      importOpen && React.createElement(window.StationImportDialog, {
        existing: stations, onClose: () => setImportOpen(false), onImport: importStations,
      }),
      exportOpen && React.createElement(window.ExportDialog, { caps, count: stations.filter((x) => !x.deleted).length, onClose: () => setExportOpen(false), onExport: (o) => { setExportOpen(false); showToast(`已匯出 ${o.fmt.toUpperCase()}（資料截至 ${o.ts}）`); } }),

      // —— toast ——
      toast && React.createElement("div", { style: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 1200, display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-default)", color: "#fff", boxShadow: "var(--shadow-lg)", font: "var(--font-label-400)", animation: "wgToastIn var(--transition-spring)" } },
        React.createElement(Icon, { n: toast.tone === "warning" ? "Info" : "CircleCheck", s: 18, c: toast.tone === "warning" ? "var(--prim-color-amber-300)" : "var(--prim-color-green-300)" }),
        toast.msg
      )
    );
  }

  window.ResourceStation = ResourceStation;
})();
