// map-app.jsx — 互助地圖頁（後台第二個導覽項；MAP-FEAT-002 責任區與危險區）
//
// 外殼沿用四頁共用的 WGPage / WGShell（js/admin/shell/wg-shell.jsx），本檔只負責
// 本頁的狀態機：瀏覽 → 圈選／編輯邊界 → 儲存表單 → 批次指派 → 五秒復原。
//
// 可視範圍：地圖本身所有後台身份都看得到（與前台同一份底圖與標點）；
// **圈選、編輯與指派只有超級管理員與政府有**（正典 AC-01；未授權者不提供工具，不是停用）。
//
// 🔒 篩選是看的方式，不是選的方式（2026-08-27 Sucre）：
//    畫面上畫什麼吃 `shownTickets` / `shownStations`；
//    區域的計數與批次指派一律吃完整的 `tickets` / `stations`。兩者不可混用。
(function () {
  const { Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  const EMPTY_PREVIEW = { tickets: [], stations: [] };

  function MapBody({ persona }) {
    const role = window.wgActingPlatformRole ? window.wgActingPlatformRole(persona) : persona.rbac;
    const canDraw = role === "super" || role === "gov";

    const [tickets, setTickets] = React.useState(() => window.mapBuildTickets());
    const [zones, setZones] = React.useState(() => window.MAP_INITIAL_ZONES.map((z) => ({ ...z })));
    const [selectedId, setSelectedId] = React.useState(null);
    const [drawing, setDrawing] = React.useState(false);
    const [editingId, setEditingId] = React.useState(null);   // 正在編輯邊界的區域
    const [draft, setDraft] = React.useState([]);             // 圈選與編輯共用
    const [form, setForm] = React.useState(null);             // 非 null＝畫完了，正在填資料
    const [undo, setUndo] = React.useState(null);
    const [left, setLeft] = React.useState(0);
    const [log, setLog] = React.useState([]);
    const [filters, setFilters] = React.useState(() => JSON.parse(JSON.stringify(window.MAP_DEFAULT_FILTERS)));
    const [filterOpen, setFilterOpen] = React.useState(false);
    // 🔴 2026-09-26：做完一件事就回清單，剛動過的那一區在清單裡閃一下（取代停在細節頁）
    const [flashId, setFlashId] = React.useState(null);
    React.useEffect(() => {
      if (!flashId) return;
      const t = setTimeout(() => setFlashId(null), 2600);
      return () => clearTimeout(t);
    }, [flashId]);
    function doneWith(id) { setSelectedId(null); setFlashId(id); }

    const stations = window.MAP_STATIONS;
    const selected = zones.find((z) => z.id === selectedId) || null;
    const editingZone = zones.find((z) => z.id === editingId) || null;
    const mode = drawing ? "draw" : editingId ? "edit" : "browse";

    // 畫面上看得到的（吃篩選）
    const shownTickets = React.useMemo(() => window.mapFilterTickets(tickets, filters), [tickets, filters]);
    const shownStations = React.useMemo(() => window.mapFilterStations(stations, filters), [stations, filters]);

    // 圈選中的即時計數（AC-02）。⚠️ 吃完整清單，不吃篩選
    const preview = React.useMemo(() => {
      if (draft.length < 3) return EMPTY_PREVIEW;
      return window.mapInsideZone(draft, tickets, stations);
    }, [draft, tickets, stations]);
    const invalid = draft.length >= 4 && window.mapSelfIntersects(draft);

    // 編輯邊界的差異（正典 Q4 的落點）
    const editDiff = React.useMemo(() => {
      if (!editingZone || draft.length < 3) return { movedIn: [], movedOut: [], stillIn: [] };
      return window.mapZoneEditDiff(editingZone.ring, draft, tickets, editingZone.team);
    }, [editingZone, draft, tickets]);

    // 篩選開著時，HUD 要同時講兩個數字，不然使用者以為只指派了看得到的那幾張
    const filterNote = React.useMemo(() => {
      if (shownTickets.length === tickets.length) return null;
      const insideShown = draft.length >= 3
        ? window.mapInsideZone(draft, shownTickets, []).tickets.length : 0;
      return `目前篩選只顯示 ${shownTickets.length} / ${tickets.length} 張。上面的區內張數是「區內全部」`
        + (draft.length >= 3 ? `，其中符合篩選的有 ${insideShown} 張` : "")
        + " —— 指派會套用到全部。";
    }, [shownTickets, tickets, draft]);

    React.useEffect(() => {
      if (!undo) return;
      const tick = () => {
        const s = Math.ceil((undo.until - Date.now()) / 1000);
        if (s <= 0) { setUndo(null); setLeft(0); } else setLeft(s);
      };
      tick();
      const id = setInterval(tick, 250);
      return () => clearInterval(id);
    }, [undo]);

    function record(action) {
      const at = new Date().toTimeString().slice(0, 5);
      setLog((l) => [{ at, actor: persona.name, action }, ...l].slice(0, 40));
    }
    function snapshot() { return { zones: zones.map((z) => ({ ...z })), tickets: tickets.map((t) => ({ ...t })) }; }
    function armUndo(snap, label) { setUndo({ snap, label, until: Date.now() + window.MAP_UNDO_SECONDS * 1000 }); }
    function doUndo() {
      if (!undo) return;
      setZones(undo.snap.zones);
      setTickets(undo.snap.tickets);
      record(`復原：${undo.label}`);          // AC-03：每一次復原都要進紀錄
      setUndo(null);
    }

    // ── 圈選新區域 ──────────────────────────────────────────────────────────
    function startDraw() { setSelectedId(null); setEditingId(null); setDraft([]); setForm(null); setDrawing(true); }
    // 從「填資料」退回「畫範圍」時，已填的內容要留著 —— 改個轉角不該讓人重打名稱
    const lastFormRef = React.useRef(null);
    function cancelDraw() { setDrawing(false); setDraft([]); setForm(null); lastFormRef.current = null; }
    function finishDraw() {
      if (draft.length < 3 || invalid) return;
      setDrawing(false);
      // 類型**不給預設值**：三種用途差很多，讓人自己選一次，不要順手帶過（2026-09-27）
      setForm(lastFormRef.current || { name: "", kind: null, team: null, note: "", overwrite: false, publicVisible: false });
    }

    function applyAssign(ring, team, overwrite, list) {
      const inside = window.mapInsideZone(ring, list, stations).tickets;
      const ids = new Set(inside.filter((t) => !t.team || (overwrite && t.team !== team)).map((t) => t.id));
      const next = list.map((t) => (ids.has(t.id) ? { ...t, team, status: t.status === "pending" ? "in_progress" : t.status } : t));
      return { next, changed: ids.size };
    }

    function saveZone() {
      const snap = snapshot();
      const id = "Z-" + String(zones.length + 1).padStart(2, "0");
      // 危險區不參與色輪替：固定橘白斜紋（js/shared/wg-hazard.js），color 只給標籤底色用
      const color = form.kind === "hazard"
        ? (window.WGHazard ? window.WGHazard.stroke() : "#E65100")
        : window.MAP_ZONE_COLORS[zones.length % window.MAP_ZONE_COLORS.length];
      const zone = {
        id, kind: form.kind, name: form.name.trim(), ring: draft, color,
        team: form.kind === "assign" ? form.team : null, note: form.note.trim(),
        publicVisible: !!form.publicVisible,
        status: "active", createdBy: persona.name,
        createdAt: new Date().toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        // 🔴 2026-09-26 Sucre：「沒有辦法做到 24 小時到期就關閉」→ 危險區不自動到期，由人手動解除
      };
      let label = `建立區域「${zone.name}」`;
      let nextTickets = tickets;
      if (form.kind === "assign" && form.team) {
        const r = applyAssign(draft, form.team, form.overwrite, tickets);
        nextTickets = r.next;
        label = `圈選「${zone.name}」批次指派 ${r.changed} 筆任務單給 ${form.team}`;
      } else if (form.kind === "mark") {
        label = `建立標示區「${zone.name}」`;
      } else if (form.kind === "hazard") {
        const inside = window.mapInsideZone(draft, tickets, stations).tickets;
        label = `建立危險區「${zone.name}」，${inside.length} 筆任務單掛上警示`;
      }
      setZones((zs) => [...zs, zone]);
      setTickets(nextTickets);
      setDraft([]); setForm(null); lastFormRef.current = null; doneWith(id);
      record(label);
      armUndo(snap, label);
    }

    // ── 編輯既有邊界 ────────────────────────────────────────────────────────
    function startEdit(zone) {
      setDrawing(false); setForm(null);
      setEditingId(zone.id);
      setDraft(zone.ring.map((p) => [p[0], p[1]]));
      setZones((zs) => zs.map((z) => ({ ...z, editing: z.id === zone.id })));
    }
    function cancelEdit() {
      setEditingId(null); setDraft([]);
      setZones((zs) => zs.map((z) => ({ ...z, editing: false })));
    }
    function resetEdit() { if (editingZone) setDraft(editingZone.ring.map((p) => [p[0], p[1]])); }

    function saveEdit() {
      if (!editingZone || draft.length < 3 || invalid) return;
      const snap = snapshot();
      const d = editDiff;
      const newRing = draft.map((p) => [p[0], p[1]]);

      // 新納入且未指派的 → 一併指派；掉出範圍且屬本區單位的 → 不動歸屬，掛待複核
      const inIds = new Set(d.movedIn.map((t) => t.id));
      const outIds = new Set(d.movedOut.map((t) => t.id));
      const nextTickets = tickets.map((t) => {
        if (inIds.has(t.id) && editingZone.team) {
          return { ...t, team: editingZone.team, status: t.status === "pending" ? "in_progress" : t.status, reviewZoneId: null };
        }
        if (outIds.has(t.id)) return { ...t, reviewZoneId: editingZone.id };   // 正典 Q4 裁示
        // 原本掛在這一區的複核標記，若又回到範圍內就解除
        if (t.reviewZoneId === editingZone.id && window.mapPointInPolygon(t.coord, newRing)) {
          return { ...t, reviewZoneId: null };
        }
        return t;
      });

      const bits = [];
      if (d.movedIn.length) bits.push(`新納入 ${d.movedIn.length} 筆指派給 ${editingZone.team}`);
      if (d.movedOut.length) bits.push(`${d.movedOut.length} 筆移出範圍，維持原指派並標記待複核`);
      const label = `調整「${editingZone.name}」的範圍${bits.length ? "：" + bits.join("；") : ""}`;

      setZones((zs) => zs.map((z) => (z.id === editingZone.id ? { ...z, ring: newRing, editing: false } : { ...z, editing: false })));
      setTickets(nextTickets);
      setEditingId(null); setDraft([]); doneWith(editingZone.id);
      record(label);
      armUndo(snap, label);
    }

    function clearReview(zone) {
      const snap = snapshot();
      const n = tickets.filter((t) => t.reviewZoneId === zone.id).length;
      setTickets((ts) => ts.map((t) => (t.reviewZoneId === zone.id ? { ...t, reviewZoneId: null } : t)));
      const label = `解除「${zone.name}」的 ${n} 筆待複核標記`;
      record(label);
      armUndo(snap, label);
    }

    function togglePublic(zone) {
      const snap = snapshot();
      const on = !zone.publicVisible;
      setZones((zs) => zs.map((z) => (z.id === zone.id ? { ...z, publicVisible: on } : z)));
      const label = on ? `「${zone.name}」改為前台可見` : `「${zone.name}」改為只有後台看得到`;
      record(label);
      armUndo(snap, label);
    }

    // 三種情況：責任區換單位／標示區改成責任區（指派）／責任區改成標示區（team=null）
    function reassign(zone, team) {
      const snap = snapshot();
      let label;
      if (team) {
        const r = applyAssign(zone.ring, team, false, tickets);
        setTickets(r.next);
        label = zone.kind === "mark"
          ? `「${zone.name}」改成責任區，交給 ${team}，${r.changed} 筆任務單一併指派`
          : `「${zone.name}」責任單位改為 ${team}，${r.changed} 筆任務單一併指派`;
      } else {
        // 改成標示區：只改區域，不收回已指派的單（與「刪除區域不收回」同一條）
        label = `「${zone.name}」改成標示區（已指派的單不收回）`;
      }
      setZones((zs) => zs.map((z) => (z.id === zone.id ? { ...z, team: team || null, kind: team ? "assign" : "mark" } : z)));
      doneWith(zone.id);
      record(label);
      armUndo(snap, label);
    }

    function removeZone(zone) {
      const snap = snapshot();
      setZones((zs) => zs.filter((z) => z.id !== zone.id));
      setTickets((ts) => ts.map((t) => (t.reviewZoneId === zone.id ? { ...t, reviewZoneId: null } : t)));
      setSelectedId(null);
      const label = zone.kind === "hazard" ? `解除危險區「${zone.name}」` : `刪除區域「${zone.name}」`;
      record(label);
      // ⚠️ 刪除區域**不會**把任務單的歸屬收回（`MAP-ZD-147`，我選的，未經裁示）。
      armUndo(snap, label);
    }

    // 🔴 2026-09-25：勾了「前台可見」的區域寫給前台地圖（經 wg-bridge，原型層）。
    //    每次區域有變就整份覆寫 —— 取消勾選、刪除、復原都會跟著從前台消失。
    React.useEffect(() => {
      if (!window.WGBridge || !window.WGBridge.writePublicZones) return;
      window.WGBridge.writePublicZones(zones.filter((z) => z.publicVisible).map(window.mapToPublicZone));
    }, [zones]);

    // Esc：一層一層退（填資料 → 取消圈選；圈選 → 取消；調整範圍 → 取消；細節 → 回清單）
    const escRef = React.useRef(null);
    escRef.current = () => {
      if (form || drawing) return cancelDraw();
      if (editingId) return cancelEdit();
      if (selectedId) return setSelectedId(null);
    };
    React.useEffect(() => {
      const on = (e) => {
        if (e.key !== "Escape") return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "SELECT") return;          // 讓下拉自己收
        escRef.current && escRef.current();
      };
      window.addEventListener("keydown", on);
      return () => window.removeEventListener("keydown", on);
    }, []);

    // 地圖上要強調的單
    const highlightIds = React.useMemo(() => {
      if (drawing || form) return preview.tickets.map((t) => t.id);
      if (editingId && draft.length >= 3) return editDiff.stillIn.map((t) => t.id);
      if (selected) return window.mapInsideZone(selected.ring, tickets, stations).tickets.map((t) => t.id);
      return null;
    }, [drawing, form, editingId, draft, editDiff, preview, selected, tickets, stations]);

    // 外殼的內容區有 padding 且 overflow:auto，`height:100%` 會多出 40px 而長出捲軸。
    // 與 tk-map.jsx 一樣改用量測高度，差別只在跟著視窗縮放。
    const [paneH, setPaneH] = React.useState(() => Math.max(460, window.innerHeight - 236));
    React.useEffect(() => {
      const on = () => setPaneH(Math.max(460, window.innerHeight - 236));
      window.addEventListener("resize", on);
      return () => window.removeEventListener("resize", on);
    }, []);

    const busy = mode !== "browse";

    return (
      <div style={{ display: "flex", height: paneH, gap: 0,
        border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {/* 地圖 */}
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <window.MapCanvas
            tickets={shownTickets} stations={shownStations} zones={zones} layers={filters.layers}
            selectedZoneId={selectedId} mode={mode} draft={draft}
            onDraftChange={setDraft} onFinishDraw={finishDraw}
            onSelectZone={(id) => { if (!busy && !form) setSelectedId(id); }}
            onBackgroundClick={() => { if (!busy && !form) setSelectedId(null); }}
            highlightIds={highlightIds}
          />

          <window.MapFilterBar
            filters={filters} setFilters={setFilters} open={filterOpen} setOpen={setFilterOpen}
            disabled={busy}
            counts={{ shownTickets: shownTickets.length, totalTickets: tickets.length,
                      shownStations: shownStations.length, totalStations: stations.length,
                      unassigned: tickets.filter((t) => !t.team).length }} />

          {/* 圖例。繪製／編輯中收起來 —— 那時候要看的是計數，不是色票 */}
          <div style={{ position: "absolute", left: 12, bottom: 28, zIndex: 500, display: busy ? "none" : "flex",
            flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: "var(--radius-md)",
            background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)" }}>
            <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)", letterSpacing: ".04em" }}>優先級</span>
            {[["#D32F2F", "生命危急"], ["#F57C00", "緊急"], ["#2592B9", "一般"], ["#64748B", "低"]].map(([c, l]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 999, background: c, boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(15,23,42,.25)", margin: "0 1px" }}></span>
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>{l}</span>
              </span>
            ))}
            <span style={{ height: 1, background: "var(--color-border-default)", margin: "2px 0" }}></span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: "#0F172A", display: "inline-flex",
                alignItems: "center", justifyContent: "center" }}>
                <Icon n="Package" s={9} c="#fff" />
              </span>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>資源站點</span>
            </span>
            {/* 2026-09-25：危險區的橘白斜紋也進圖例 —— 它是地圖上唯一的斜紋 */}
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="wg-hazard-swatch" style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0 }}></span>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>危險區</span>
            </span>
          </div>

          {/* 圈選／調整時地圖上只留一行操作提示；數字與按鈕都在右側面板（不再蓋住地圖下半部） */}
          {(mode === "draw" || mode === "edit") && <window.MapModeHint mode={mode} />}
          {!busy && undo && <window.MapUndoToast label={undo.label} secondsLeft={left} onUndo={doUndo} />}
        </div>

        {/* 右側任務面板：一次只做一件事，骨架一致（標題列／可捲內容／底部動作列） */}
        <aside style={{ width: 380, flexShrink: 0, borderLeft: "1px solid var(--color-border-default)",
          background: "var(--color-bg-neutral-default)", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <style>{`
            @keyframes mapFlash { 0% { box-shadow: 0 0 0 3px var(--color-bg-primary); background: var(--color-bg-primary-subtle); }
                                  100% { box-shadow: 0 0 0 0 transparent; } }
            .map-flash { animation: mapFlash 2.4s ease-out; }
          `}</style>
          {form ? (
            <window.MapZoneForm form={form} setForm={setForm} preview={preview} teams={window.MAP_TEAMS}
              onSave={saveZone} onCancel={cancelDraw} onBack={() => { lastFormRef.current = form; setForm(null); setDrawing(true); }} />
          ) : mode === "draw" ? (
            <window.MapDrawPanel draft={draft} preview={preview} invalid={invalid} filterNote={filterNote}
              onUndo={() => setDraft((d) => d.slice(0, -1))} onFinish={finishDraw} onCancel={cancelDraw} />
          ) : mode === "edit" && editingZone ? (
            <window.MapEditPanel zone={editingZone} draft={draft} diff={editDiff} invalid={invalid}
              onReset={resetEdit} onSave={saveEdit} onCancel={cancelEdit} />
          ) : selected ? (
            <window.MapZoneDetail zone={selected} tickets={tickets} stations={stations} canDraw={canDraw}
              teams={window.MAP_TEAMS} onReassign={reassign} onDelete={removeZone} onEdit={startEdit}
              onTogglePublic={togglePublic}
              onClearReview={clearReview} onBack={() => setSelectedId(null)} />
          ) : (
            <window.MapZoneList zones={zones} tickets={tickets} stations={stations} flashId={flashId}
              onSelect={setSelectedId} canDraw={canDraw} onStartDraw={startDraw} log={log} />
          )}
        </aside>
      </div>
    );
  }

  function MapApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "gov");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];

    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({
          id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label,
        }))}
        value={role} onChange={setRole}
        note="圈選與指派只有超級管理員與政府看得到工具（AC-01：未授權不提供工具，不是停用）" />
    );

    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="map"
          onNavigate={(id) => window.wgNavigate(id, "map")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}
        >
          <MapBody persona={persona} />
        </window.WGShell>
      </window.WGPage>
    );
  }

  Object.assign(window, { MapApp, MapBody });
})();
