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
    const [importOpen, setImportOpen] = React.useState(false);
    const [toast, setToast] = React.useState(null);
    const seq = React.useRef(200);

    // 訂閱目前身份：右上角切換身份後，匯入匯出權限（BULK-102）要即時跟著變
    const [actingIdentity] = window.useWGActingIdentity ? window.useWGActingIdentity((window.TK_PERSONAS || {})[role]) : [null];
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

    // 批次匯入寫入（規則全文見 station-import.jsx 檔頭 SBK-1〜7）
    // plans：stationImportPreview 算好、沒有錯誤的列；kind＝create／update
    function applyImport(plans, type) {
      const actor = actorName(role);
      const ts = nowTs();
      const batchId = "B-" + Date.now().toString(36).slice(-5).toUpperCase();
      const made = [], patches = {};
      plans.forEach((p) => {
        const v = p.v;
        if (p.kind === "create") {
          const id = `RS-0${seq.current++}`;
          const addr = [v.county, v.city, v.lane, v.alley, v.no, v.floor, v.room].filter(Boolean).join("");
          made.push({
            id, name: v.name, type, area: v.city || "", address: addr || "（未填地址）",
            county: v.county || "", city: v.city || "", lane: v.lane || "", alley: v.alley || "", no: v.no || "", floor: v.floor || "", room: v.room || "",
            lat: Number(v.latitude), lng: Number(v.longitude), x: 50, y: 50,
            status: "open",                         // 🔄 2026-10-27 Carol：匯入用預設（開設中），推翻 08-06「匯入後一律關」
            supplies: [], description: v.description || "", comment: v.comment || "", level: v.level ? Number(v.level) : null,
            visibility: v.visibility || "public", source: v.source || "",
            contact: "—", phone: "—", hours: v.op_hour || "—",    // SBK-2：後端檔案沒有聯絡人、電話
            parentId: null, photos: [], assignedTeam: null,
            isOfficial: true, verified: true, verifiedBy: actor,    // 🔄 2026-10-27 Carol：匯入的是官方（後台匯入＝可信來源），推翻 08-21
            established: ts.slice(0, 10), createdBy: actor,
            updated: ts, updatedMin: 0, version: 1, deleted: false,
            history: [{ v: 1, who: actor, when: ts, note: `批次匯入建立（${batchId}，第 ${p.line} 列）`, diff: [{ field: "operational_status", old: "—", new: "開設中（匯入預設）" }] }],
          });
        } else {
          // SBK-4：只改得到說明、開放時間、level、comment、公開範圍、經緯度；空白＝不動
          const s = p.target, diff = [], patch = {};
          const put = (field, label, key, val, cur) => { if (val !== "" && val != null && String(val) !== String(cur == null ? "" : cur)) { patch[key] = val; diff.push({ field, old: String(cur == null || cur === "" ? "—" : cur), new: String(val) }); } };
          put("description", "說明", "description", v.description, s.description);
          put("op_hour", "開放時間", "hours", v.op_hour, s.hours === "—" ? "" : s.hours);
          put("level", "level", "level", v.level ? Number(v.level) : "", s.level);
          put("comment", "comment", "comment", v.comment, s.comment);
          put("visibility", "公開範圍", "visibility", v.visibility, s.visibility);
          put("latitude", "緯度", "lat", v.latitude ? Number(v.latitude) : "", s.lat);
          put("longitude", "經度", "lng", v.longitude ? Number(v.longitude) : "", s.lng);
          if (diff.length) patches[s.id] = { patch, diff };
        }
      });
      // 可能重複 → 重複審核「站點」分頁（原型模擬；正式版每列走一般建站 service，後端判斷）
      let groups = [];
      if (made.length && window.stationImportDedupGroups && window.ddLoad && window.ddSave) {
        const queue = window.ddLoad();
        const startId = queue.reduce((m, g) => Math.max(m, parseInt(String(g.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
        groups = window.stationImportDedupGroups(made, stations, { owner: `${actor}（匯入）`, at: ts.slice(5), startId });
        if (groups.length) window.ddSave(groups.concat(queue));
      }
      setStations((arr) => made.concat(arr.map((s) => patches[s.id] ? bump(Object.assign({}, s, patches[s.id].patch), `批次匯入更新（${batchId}）`, patches[s.id].diff) : s)));
      const updated = plans.filter((p) => p.kind === "update").length;
      showToast(`已匯入：新增 ${made.length}、更新 ${updated}` + (made.length ? "；新增的站點皆為「已關閉」" : ""));
      return { created: made.length, updated, batchId, groups: groups.length };
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
        return bump(copy, "核准前台修改建議", diff);
      });
      setProposals((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: "approved" } : x)));
      showToast(`已核准「${p.stationName}」的修改建議，前台資料將於 1 分鐘內反映`);
    }
    function rejectProposal(p, reason) {
      setProposals((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: "rejected", reason } : x)));
      showToast(`已拒絕「${p.stationName}」的修改建議`, "warning");
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
        onImport: () => setImportOpen(true),
        onToast: showToast,
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
      importOpen && caps.canImport && React.createElement(window.StationImportDialog, {
        existing: stations, onClose: () => setImportOpen(false), onApply: applyImport,
      }),

      // —— toast ——
      toast && React.createElement("div", { style: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 1200, display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-default)", color: "#fff", boxShadow: "var(--shadow-lg)", font: "var(--font-label-400)", animation: "wgToastIn var(--transition-spring)" } },
        React.createElement(Icon, { n: toast.tone === "warning" ? "Info" : "CircleCheck", s: 18, c: toast.tone === "warning" ? "var(--prim-color-amber-300)" : "var(--prim-color-green-300)" }),
        toast.msg
      )
    );
  }

  window.ResourceStation = ResourceStation;
})();
