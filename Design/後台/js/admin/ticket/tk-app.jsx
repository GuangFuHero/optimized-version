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
  const PERMS = {
    super:   { escalate: true,  delete: true,  assign: true,  assignMember: true,  create: true,  activate: true  },
    gov:     { escalate: false, delete: false, assign: true,  assignMember: false, create: true, activate: true  },
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
    const can = tk.can;

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
        <window.TicketTable onOpen={(t) => setDetail(t)} onNew={can.create ? () => setForm({ new: true }) : null} />
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
    const can = PERMS[role];

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
      actTypes, actHistory, activeTypes, openConfirm: setConfirm,
      bannerSeen, dismissBanner: (tid, type) => setBannerSeen((m) => ({ ...m, [`${tid}:${type}`]: true })),
      view, setView,
      colOrder, colHidden, visibleCols,
      cols: visibleCols.map((c) => c.width).join(" ") + " 44px",
      pad: t.density === "compact" ? "10px 16px" : "14px 16px",
      fieldOrder,

      immediateRescue: (tkt) => { patch(tkt.id, (x) => ({ ...x, priority: "critical", updatedMin: 0 })); toast(`${tkt.id} 已升為生命危急`, "danger"); },
      deleteTicket: (tkt) => setConfirm({ title: `刪除任務 #${tkt.id}`, body: "刪除後不可復原，僅 Super Admin 可執行。", confirmLabel: "確認刪除", danger: true, onConfirm: () => { setTickets((ts) => ts.filter((x) => x.id !== tkt.id)); toast(`已刪除 ${tkt.id}`, "danger"); } }),
      assignOne: (tkt) => setAssignTicket(tkt),
      setTeam: (id, team) => { patch(id, (x) => ({ ...x, team, updatedMin: 0 })); toast(`${id} 已指派給 ${team}`); },
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
          patch(id, (x) => ({ ...x, title: vals.title, street: vals.address, county: "", city: "", no: "", floor: vals.floor || null, contact_name: vals.contact_name, contact_phone: vals.contact_phone || null, desc: vals.desc, priority: vals.priority, photos: vals.photos || x.photos || [], tasks: mkTasks(tasks), updatedMin: 0 }));
          toast(`已儲存 ${id}`);
        } else {
          // 記住這次選的歸屬單位，下次開單直接帶入（取代全域身份切換器）
          // 建單時選了別隊 → 同步把目前身份切過去（共用 store，跨頁一致）
          if (vals.team && window.wgSetActingTeamId) {
            const hit = (window.wgMemberships ? window.wgMemberships(persona) : []).find((m) => m.name === vals.team);
            if (hit) window.wgSetActingTeamId(persona, hit.id);
          }
          const nid = "T-" + (1100 + Math.floor(Math.random() * 800));
          setTickets((ts) => [{ id: nid, title: vals.title, county: "", city: "", street: vals.address, no: "", floor: vals.floor || null, contact_name: vals.contact_name, contact_phone: vals.contact_phone || null, priority: vals.priority, status: "pending", team: vals.team || defaultTeam || null, region: "光復鄉", intake: "staff", visibility: "restricted", verification: null, createdAt: stamp(), updatedMin: 0, desc: vals.desc, fields: {}, photos: vals.photos || [], tasks: mkTasks(tasks) }, ...ts]);
          toast(`已建立 ${nid}`);
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
        {modal === "building" && window.BuildingSetupModal && <window.BuildingSetupModal onClose={() => setModal(null)} />}
        {assignTicket && <window.AssignTeamModal ticket={tickets.find((x) => x.id === assignTicket.id) || assignTicket} onClose={() => setAssignTicket(null)} />}
        {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
        {removeDT && <window.DisasterRemoveDialog dtKey={removeDT} onClose={() => setRemoveDT(null)} />}
        <ToastHost toasts={toasts} />
      </TKCtx.Provider>
    );
  }

  Object.assign(window, { TKApp });
})();
