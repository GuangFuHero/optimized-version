// tk-app.jsx — 入口 App：角色視角、權限收斂、欄位設定狀態、動作
(function () {
  const { Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { TKCtx, ToastHost, ConfirmDialog } = window;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "density": "regular",
    "demoBar": true
  }/*EDITMODE-END*/;

  // 欄位順序與顯示＝全域設定，唯一維護處是欄位設定頁（TM-FS-101）。
  // 個人釘選已移除 —— TM-FS-101 明定無 user-level override。
  // 匯入／匯出不在這張表：依「目前身份」判斷（BULK-102，js/shared/wg-bulk.jsx 的 canBulk）。
  //   ❌ 不要加回 PERMS —— 這張表是以角色視角為鍵，分不出同一個人「在 A 隊是管理員、在 B 隊是成員」。
  const PERMS = {
    super:   { escalate: true,  delete: true,  assign: true,  assignMember: true,  create: true,  activate: true },
    gov:     { escalate: false, delete: false, assign: true,  assignMember: false, create: true, activate: true },
    admin:   { escalate: false, delete: false, assign: false, assignMember: true,  create: true, activate: false },
    member:  { escalate: false, delete: false, assign: false, assignMember: false, create: true, activate: false },
    auditor: { escalate: false, delete: false, assign: false, assignMember: false, create: false, activate: false },
  };

  // 導覽由 WGShell 自己算（nav.js 的 wgNavFor），本頁不傳
  const LS = { cols: "tk.cols", hidden: "tk.colsHidden", forder: "tk.fieldOrder" };
  const load = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : fb; } catch (e) { return fb; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  function TicketModule() {
    const tk = window.useTK();
    const [detail, setDetail] = React.useState(null);
    const [form, setForm] = React.useState(null);
    const [importing, setImporting] = React.useState(false);
    const [space, setSpace] = React.useState(null);     // 點開的空間 id（tk-space.jsx）
    const can = tk.can;
    /* 列表與地圖上的一列可能是任務單，也可能是空間（SP-1）。 */
    const openRow = (t) => { if (t && t.kind === "space") setSpace(t.id); else setDetail(t); };

    // 通知 deep-link（IAM-UP-108）：收到 wg:notify-open 就直接開該任務單的 Drawer。
    // preventDefault() 是在告訴 wg-notify「本頁已經處理掉了，不用跨頁」。
    React.useEffect(() => {
      function onNotifyOpen(e) {
        const ref = e.detail;
        if (!ref || ref.kind !== "ticket") return;
        const t = (tk.tickets || []).find((x) => x.id === ref.id)
          || (window.TK_TICKETS || []).find((x) => x.id === ref.id);
        if (!t) return;               // 找不到就不攔，讓 wg-notify 回報開不了
        setForm(null);
        setDetail(t);
        e.preventDefault();
      }
      window.addEventListener("wg:notify-open", onNotifyOpen);
      return () => window.removeEventListener("wg:notify-open", onNotifyOpen);
    }, [tk.tickets]);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <window.TicketTable onOpen={openRow} onNew={can.create ? () => setForm({ new: true }) : null}
          onImport={can.import && window.TicketImportDialog ? () => setImporting(true) : null}
          canExport={can.export && !!window.TicketExportMenu} />
        {importing && <window.TicketImportDialog onClose={() => setImporting(false)} />}
        {/* 從空間點開一張單時，兩層抽屜都在；Esc 只關最上面那層（任務單），空間留著 */}
        {space && window.SpaceDetail && <window.SpaceDetail id={space} onClose={() => { if (!detail && !form) setSpace(null); }} onOpenTicket={(t) => setDetail(t)} />}
        {detail && !form && <window.TicketDetail ticket={detail} onClose={() => setDetail(null)} onEdit={() => setForm({ ticket: detail })} />}
        {form && <window.TicketForm ticket={form.ticket} onClose={() => setForm(null)} />}
      </div>
    );
  }

  function TKApp() {
    const t = TWEAK_DEFAULTS;  // 交付版：拿掉原型用的 Tweaks 面板
    // 角色視角走共用 store（wg-event.js），跨頁不會換人
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "super");
    const [tickets, setTickets] = React.useState(window.TK_TICKETS);
    const [actTypes, setActTypes] = React.useState(() => window.TK_ACTIVATION.types.map((k) => ({ key: k, status: "active" })));
    const [actHistory, setActHistory] = React.useState(() => [
      { at: "2026-06-10 06:15", action: "add", type: "landslide", by: "林承翰" },
      { at: "2026-06-10 04:18", action: "start", type: "flood", by: "林承翰" },
    ]);
    const [bannerSeen, setBannerSeen] = React.useState({});
    const [modal, setModal] = React.useState(null);
    const [confirm, setConfirm] = React.useState(null);
    const [removeDT, setRemoveDT] = React.useState(null);
    const [assignTicket, setAssignTicket] = React.useState(null);
    const [view, setView] = React.useState(() => { try { return localStorage.getItem("tk.viewMode") || "list"; } catch (e) { return "list"; } });
    React.useEffect(() => { try { localStorage.setItem("tk.viewMode", view); } catch (e) {} }, [view]);
    const [toasts, setToasts] = React.useState([]);

    // 欄位設定：順序、顯示、必填度全部是全域設定，唯一維護處是欄位設定頁（TM-FS-101）。
    // 這頁只讀取並套用，沒有任何寫入路徑。
    const [colOrder] = React.useState(() => {
      const saved = load(LS.cols, null);
      const all = window.TK_COLUMNS.map((c) => c.key);
      return saved && saved.length === all.length && saved.every((k) => all.includes(k)) ? saved : all;
    });
    const [colHidden] = React.useState(() => load(LS.hidden, []));
    const [fieldOrder] = React.useState(() => load(LS.forder, []));

    const persona = window.TK_PERSONAS[role];
    // 訂閱目前身份：右上角切換身份後，匯入匯出權限要即時跟著變（BULK-102）
    const [actingIdentity] = window.useWGActingIdentity ? window.useWGActingIdentity(persona) : [null];
    const bulk = window.WGBulk ? window.WGBulk.canBulk(persona) : false;
    const can = Object.assign({}, PERMS[role], { import: bulk, export: bulk });

    const toast = (msg, tone) => { const id = Date.now() + Math.random(); setToasts((ts) => [...ts, { id, msg, tone }]); setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2800); };

    React.useEffect(() => { window.TK_ACTIVATION.types = actTypes.filter((a) => a.status === "active").map((a) => a.key); }, [actTypes]);
    const activeTypes = actTypes.filter((a) => a.status === "active").map((a) => a.key);
    const now = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
    const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
    const logHistory = (action, type) => setActHistory((h) => [{ at: now(), action, type, by: persona.name }, ...h]);

    // 資料可視範圍（AC-FEAT-003 / 2026-08-14 §C-1 裁示）
    //   AC-VS-101 讀取：全域開放，不做欄位遮蔽 —— 過去這裡把 admin/member 硬濾成只看自家，是錯的
    //   AC-VS-103 預設：進頁面預設「我的單位」，可切「全部」
    //   AC-VS-104 寫入：仍限自己 team，跨 team 一律 404
    // 沒有所屬 team 的角色（Super Admin／Government／Data Auditor）沒有「我的單位」可切，恆為全部。
    //
    // 一人多隊（MEM-MT-101）—— 以「目前身份」為準。
    //
    // ⚠️ 2026-08-15 Sucre 改決策：**推翻本頁原本「不做全域切換器、走所有隸屬隊聯集」的做法。**
    //   原決策的理由是「切換器要求使用者隨時記得自己現在代表誰，災區一定會忘，
    //   忘了就把單開到錯的隊底下」。今日 PM 與 Sucre 裁定改為單一目前身份：
    //   身份切換器在右上角人名選單，**可視、可寫、新建歸屬、Audit 全部跟著它走**。
    //   原決策擔心的「開到錯的隊」，改由右上角常駐顯示目前身份來緩解 —— 身份一直在畫面上。
    //
    // 兩種情況：
    //   1. 有團隊 → 我的單位＝目前那一隊；只有那一隊的單可寫（AC-VS-104）
    //   2. 沒有團隊（Super Admin／Government／Data Auditor）
    //      → 沒有「我的單位」可切，恆為全部；能不能寫由 PERMS 決定，不受本段影響
    const hasMemberships = (persona.teams || (persona.team ? [persona.team] : [])).length > 0;
    // 訂閱共用身份 store，切換後本頁要即時重繪（不能只讀一次）
    const [actingTeamId] = window.useWGActingTeam
      ? window.useWGActingTeam(persona)
      : [null];
    const acting = window.wgActingMembership ? window.wgActingMembership(persona) : null;

    const myTeams = acting ? [acting.name] : [];            // ← 單一團隊，不再聯集
    const [scope, setScope] = React.useState("mine");       // 'mine' | 'all'
    const effScope = myTeams.length ? scope : "all";
    const visibleTickets = effScope === "mine" ? tickets.filter((x) => myTeams.includes(x.team)) : tickets;

    // 這張單我能不能寫。其他單位＝唯讀（AC-VS-104）。
    // ⚠️ 未指派（team = null）的單判定為可寫 —— 它不屬於任何「別的」單位。
    //    §I #6 的裁示沒涵蓋這格，已列為待確認。
    const canWriteTicket = (t) => {
      if (!hasMemberships) return true;       // 無隊角色：由 PERMS 決定，這裡不擋
      return !t.team || myTeams.includes(t.team);
    };

    // 新建任務單的預設歸屬 ＝ 目前身份那一隊（右上角切換器決定，跨頁保留）。
    // 取代原本的 localStorage `tk.lastTeam` —— 共用 store 已經在記同一件事。
    const defaultTeam = acting ? acting.name : null;

    const visibleCols = colOrder.map((k) => window.TK_COLUMNS.find((c) => c.key === k)).filter((c) => c && (c.required || !colHidden.includes(c.key)));

    const mkTasks = (arr) => arr.map((k) => ({
      id: k.id || ("K-" + Math.random().toString(36).slice(2, 7)),
      kind: k.kind, name: (k.name || "").trim(),
      quantity: k.quantity === "" || k.quantity == null ? null : Number(k.quantity),
      status: k.status || "pending",
      assignees: k.assignees || [],
    }));
    const patch = (id, fn) => setTickets((ts) => ts.map((x) => x.id === id ? fn(x) : x));

    const ctx = {
      persona, can, toast, setModal,
      tickets: visibleTickets, allTickets: tickets, scopeRegion: null,
      myTeams, scope: effScope, setScope, canWriteTicket, defaultTeam,
      // TM-IMP-104：非政府組織匯入 → 目前身份那一隊；超管／政府匯入 → 未指派
      importTeam: hasMemberships ? (defaultTeam || null) : null,
      actTypes, actHistory, activeTypes, openConfirm: setConfirm,
      bannerSeen, dismissBanner: (tid, type) => setBannerSeen((m) => ({ ...m, [`${tid}:${type}`]: true })),
      view, setView,
      colOrder, colHidden, visibleCols,
      cols: visibleCols.map((c) => c.width).join(" ") + " 44px",
      pad: t.density === "compact" ? "10px 16px" : "14px 16px",
      fieldOrder,

      immediateRescue: (tkt) => { patch(tkt.id, (x) => ({ ...x, priority: "critical", updatedMin: 0 })); toast(`「${tkt.title}」已升為生命危急`, "danger"); },
      /* SP-3：刪除空間。🔒 底下的任務單保留，只是不再歸在這個空間（BE-036：deleteBuildingMap 後 household records stay, just unlinked）。 */
      deleteSpace: (id) => {
        const b = window.WGBridge.buildingById(id);
        const n = tickets.filter((x) => x.buildingId === id).length;
        window.WGBridge.deleteBuilding(id);
        setTickets((ts) => ts.map((x) => x.buildingId === id ? { ...x, buildingId: null } : x));
        toast(`已刪除空間「${(b && (b.alias || b.address)) || id}」` + (n ? `，${n} 張任務單保留` : ""), "danger");
      },
      deleteTicket: (tkt) => setConfirm({ title: `刪除任務「${tkt.title}」`, body: "刪除後不可復原，僅 Super Admin 可執行。", confirmLabel: "確認刪除", danger: true, onConfirm: () => { setTickets((ts) => ts.filter((x) => x.id !== tkt.id)); toast(`已刪除「${tkt.title}」`, "danger"); } }),
      assignOne: (tkt) => setAssignTicket(tkt),
      setTeam: (id, team) => { patch(id, (x) => ({ ...x, team, updatedMin: 0 })); toast(`「${(tickets.find((x) => x.id === id) || {}).title || "任務單"}」已指派給 ${team}`); },
      setTaskStatus: (id, taskId, status) => {
        patch(id, (x) => ({ ...x, updatedMin: 0, tasks: x.tasks.map((k) => k.id === taskId ? { ...k, status } : k) }));
        toast(`需求狀態改為「${window.TK_TASK_STATUS[status].label}」`);
      },
      assignMember: (id, taskId, name, qty) => {
        patch(id, (x) => ({
          ...x, updatedMin: 0,
          tasks: x.tasks.map((k) => {
            if (k.id !== taskId) return k;
            const assignees = [...(k.assignees || []), { name, qty, at: stamp().slice(6) }];
            const filled = assignees.reduce((s, a) => s + (a.qty || 1), 0);
            // 承接數達到需求量 → 自動標記為已滿足（仍可用下拉手動覆寫）
            const status = k.quantity != null && filled >= k.quantity ? "fulfilled" : "in_progress";
            return { ...k, assignees, status };
          }),
        }));
        toast(`已指派 ${name} 承接`);
      },
      addDisaster: (dt) => {
        setActTypes((a) => a.some((x) => x.key === dt)
          ? a.map((x) => x.key === dt ? { key: dt, status: "active", isNew: true, addedAt: now() } : x)
          : [...a, { key: dt, status: "active", isNew: true, addedAt: now() }]);
        setTimeout(() => setActTypes((a) => a.map((x) => x.key === dt ? { ...x, isNew: false } : x)), 1600);
        logHistory("add", dt);
        toast(`當前事件已新增災害種類：${window.TK_DISASTERS[dt].label}`);
      },
      revokeDisaster: (dt, msg) => {
        setActTypes((a) => a.map((x) => x.key === dt ? { ...x, status: "revoked", isNew: false, revokedAt: now(), revokedBy: persona.name } : x));
        logHistory("revoke", dt);
        toast(msg || `已撤銷災害類型：${window.TK_DISASTERS[dt].label}`, "danger");
      },
      askRemoveDisaster: (dt) => setRemoveDT(dt),
      restoreDisaster: (dt) => {
        setActTypes((a) => a.map((x) => x.key === dt ? { key: dt, status: "active" } : x));
        logHistory("restore", dt);
        toast(`已恢復災害類型：${window.TK_DISASTERS[dt].label}`);
      },
      // 匯入寫入（規則全文見 tk-import.jsx 檔頭 BK-1〜8、TM-IMP-*）
      // plans：tkImportPreview 算好、沒有錯誤的列。kind＝create（新單）／attach（掛到同檔案前面建立的那張）／update（既有的單）
      applyImport: (plans, type) => {
        const team = hasMemberships ? (defaultTeam || null) : null;          // TM-IMP-104
        const at = stamp();
        const batchId = "B-" + Date.now().toString(36).slice(-5).toUpperCase();
        // 編號接在目前最大號後面。❌ 不要用 saveTicket 那種亂數 —— 一次匯入幾十張，撞號機率不低。
        let n = tickets.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ""), 10) || 0), 0);
        const split = (x) => String(x || "").split(/[;；,，]/).map((y) => y.trim()).filter(Boolean);
        const propsOf = (v) => { const o = {}; Object.keys(v).forEach((k) => { if (k.indexOf("prop.") === 0 && v[k]) o[k.slice(5)] = v[k]; }); return o; };
        const mkTask = (v) => ({ id: "K-" + Math.random().toString(36).slice(2, 8), kind: type, name: v.task_name,
          quantity: v.task_quantity ? Number(v.task_quantity) : null, desc: v.task_description || "", props: propsOf(v), status: "pending", assignees: [] });
        const made = [], byKey = {}, changes = {};
        let created = 0, updated = 0;
        plans.forEach((p) => {
          const v = p.v;
          if (p.kind === "create") {
            n += 1;
            const t = { id: "T-" + n, title: v.title, county: "", city: "", street: "", no: "", floor: null,
              contact_name: v.contact_name, contact_phone: v.contact_phone || null, contact_email: v.contact_email || null,
              priority: p.priority || "medium", status: "pending", team, region: "光復鄉", intake: "import",
              visibility: v.visibility || "restricted", verification: null, createdAt: at, updatedMin: 0,
              desc: v.description || "", fields: {}, photos: [], disasterTypes: split(v.disaster_types),
              lat: Number(v.latitude), lng: Number(v.longitude), tasks: [mkTask(v)] };
            // BK-3：位置只有經緯度。登記進地圖的座標表，切到地圖才看得到這張單
            if (window.TK_COORDS) window.TK_COORDS[t.id] = { c: [t.lat, t.lng] };
            byKey[p.key] = t; made.push(t); created += 1;
          } else if (p.kind === "attach") {
            byKey[p.key].tasks.push(mkTask(v)); created += 1;
          } else {
            // BK-4：只改得到說明、狀態、優先級、災害類型、自訂欄位；空白＝不動
            const t = p.target;
            const ch = changes[t.id] = changes[t.id] || { patch: {}, log: [], tasks: [], props: {} };
            if (v.description && v.description !== t.desc) { ch.patch.desc = v.description; ch.log.push(["說明", t.desc || "（空）", v.description]); }
            if (p.priority && p.priority !== t.priority) { ch.patch.priority = p.priority; ch.log.push(["優先級", window.TK_PRIORITY[t.priority].label, window.TK_PRIORITY[p.priority].label]); }
            if (p.status && p.status !== t.status) { ch.patch.status = p.status; ch.log.push(["狀態", (window.TK_STATUS[t.status] || {}).label || t.status, window.TK_STATUS[p.status].label]); }
            if (v.disaster_types) { ch.patch.disasterTypes = split(v.disaster_types); ch.log.push(["災害類型", (t.disasterTypes || []).join("、") || "（空）", ch.patch.disasterTypes.join("、")]); }
            // 需求用「種類＋名稱」對（ADR-120）：對到就更新自訂欄位，對不到就在這張單底下新增一筆
            const hit = (t.tasks || []).find((k) => k.kind === type && String(k.name).trim() === v.task_name);
            if (hit) { const pr = propsOf(v); if (Object.keys(pr).length) { ch.props[hit.id] = pr; ch.log.push([`需求「${hit.name}」自訂欄位`, "—", Object.keys(pr).map((k) => k + "=" + pr[k]).join("、")]); } }
            else { ch.tasks.push(mkTask(v)); ch.log.push(["新增需求", "（無）", v.task_name]); }
            updated += 1;
          }
        });

        // TM-IMP-102 / BK-7：新建的單跟手動建單一樣走重複判斷（原型模擬，寫進 重複審核的佇列）
        let groups = [];
        if (made.length && window.tkImportDedupGroups && window.ddLoad && window.ddSave) {
          const queue = window.ddLoad();
          const startId = queue.reduce((m, g) => Math.max(m, parseInt(String(g.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
          groups = window.tkImportDedupGroups(made, tickets, { owner: `${persona.name}（匯入）`, at, startId });
          if (groups.length) window.ddSave(groups.concat(queue));
        }

        // History（ADR-110：跟手動操作一樣留紀錄）
        const who = { at, actor: persona.name, team: persona.team || "平台", src: "audit" };
        made.forEach((t) => window.tkPushHistory(t.id, Object.assign({}, who, { action: `批次匯入建立任務單（${batchId}）` })));
        Object.keys(changes).forEach((id) => changes[id].log.forEach((l) =>
          window.tkPushHistory(id, Object.assign({}, who, { action: `批次匯入更新（${batchId}）`, field: l[0], from: l[1], to: l[2] }))));
        groups.forEach((g) => {
          const ids = [];
          g.items.forEach((it) => { if (ids.indexOf(it.ticketId) < 0) ids.push(it.ticketId); });
          ids.forEach((tid) => window.tkPushHistory(tid, Object.assign({}, who, { action: `列入 重複審核（${g.id}，可能重複）` })));
        });

        setTickets((ts) => made.concat(ts.map((t) => {
          const ch = changes[t.id];
          if (!ch) return t;
          const tasks = (t.tasks || []).map((k) => ch.props[k.id] ? Object.assign({}, k, { props: Object.assign({}, k.props || {}, ch.props[k.id]) }) : k).concat(ch.tasks);
          return Object.assign({}, t, ch.patch, { tasks, updatedMin: 0 });
        })));
        toast(`已匯入：新增 ${created} 列、更新 ${updated} 列` + (groups.length ? `；${groups.length} 組可能重複，已送 重複審核` : ""));
        return { created, updated, batchId, groups: groups.length };
      },
      saveTicket: ({ editing, id, vals, tasks }) => {
        if (editing) {
          // TM-IMG-143：圖片連結的新增與移除各記一筆。
          // 🔒 比對的是**網址**不是索引 —— 使用者可能先刪中間那條再加一條，
          //    用索引比會記成「改了第 2 條」，事實是刪一條加一條。
          (() => {
            const prevT = tickets.find((x) => x.id === id);
            const norm = (ps) => (window.tkPhotoList ? window.tkPhotoList(ps) : []).map((p) => p.url);
            const before = norm(prevT && prevT.photos);
            const after = norm(vals.photos);
            const who = { actor: persona.name, team: persona.team || "平台", src: "audit", field: "現場照片" };
            after.filter((u) => before.indexOf(u) < 0).forEach((u) => {
              window.tkPushHistory(id, { at: stamp(), ...who, action: "新增圖片連結", from: "（無）", to: u });
            });
            before.filter((u) => after.indexOf(u) < 0).forEach((u) => {
              // 🔒 原網址留在 from。移除的是顯示，不是那張圖。
              window.tkPushHistory(id, { at: stamp(), ...who, action: "移除圖片連結（圖片仍在原網站上）", from: u, to: "（已移除）" });
            });
          })();
          patch(id, (x) => ({ ...x, title: vals.title, street: vals.address, county: "", city: "", no: "", floor: vals.floor || null, contact_name: vals.contact_name, contact_phone: vals.contact_phone || null, desc: vals.desc, priority: vals.priority, landmark: vals.landmark || x.landmark || null, photos: vals.photos || x.photos || [], tasks: mkTasks(tasks), updatedMin: 0 }));
          toast(`已儲存「${vals.title}」`);
        } else {
          // 記住這次選的歸屬單位，下次開單直接帶入（取代全域身份切換器）
          // 建單時選了別隊 → 同步把目前身份切過去（共用 store，跨頁一致）
          if (vals.team && window.wgSetActingTeamId) {
            const hit = (window.wgMemberships ? window.wgMemberships(persona) : []).find((m) => m.name === vals.team);
            if (hit) window.wgSetActingTeamId(persona, hit.id);
          }
          const nid = "T-" + (1100 + Math.floor(Math.random() * 800));
          setTickets((ts) => [{ id: nid, title: vals.title, county: "", city: "", street: vals.address, no: "", floor: vals.floor || null, contact_name: vals.contact_name, contact_phone: vals.contact_phone || null, priority: vals.priority, status: "pending", team: vals.team || defaultTeam || null, region: null, intake: "staff", visibility: "restricted", verification: null, createdAt: stamp(), updatedMin: 0, desc: vals.desc, fields: {}, landmark: vals.landmark || null, photos: vals.photos || [], tasks: mkTasks(tasks) }, ...ts]);
          toast(`已建立「${vals.title}」`);
        }
      },
    };

    return (
      <TKCtx.Provider value={ctx}>
        <window.WGPage roleBar={t.demoBar && <window.DemoBar role={role} onChange={setRole} />}>
          <window.TKShell active="ticket" onNavigate={(id) => window.wgNavigate(id, "ticket")} persona={persona}>
            <div data-screen-label={`任務管理 — ${window.TK_RBAC[persona.rbac].label} 視角`}><TicketModule /></div>
          </window.TKShell>
        </window.WGPage>
        {modal === "addType" && <window.AddDisasterModal onClose={() => setModal(null)} />}
        {modal === "disasterSettings" && <window.DisasterSettingsModal onClose={() => setModal(null)} />}
        {(modal === "building" || modal === "buildingNew") && window.BuildingSetupModal && <window.BuildingSetupModal startNew={modal === "buildingNew"} onClose={() => setModal(null)} />}
        {assignTicket && <window.AssignTeamModal ticket={tickets.find((x) => x.id === assignTicket.id) || assignTicket} onClose={() => setAssignTicket(null)} />}
        {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
        {removeDT && <window.DisasterRemoveDialog dtKey={removeDT} onClose={() => setRemoveDT(null)} />}
        <ToastHost toasts={toasts} />
      </TKCtx.Provider>
    );
  }

  Object.assign(window, { TKApp });
})();
