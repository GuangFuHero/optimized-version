// mm-app.jsx — 入口 App。導覽拆成兩家：團隊（協作空間）／成員與權限（平台身份）。
// 審核佇列是頂欄全域 inbox（🔔）；原型角色視角切換、資料狀態、Tweaks。
//
// 🔄 2026-08-17：路由與佇列全部改讀「目前身份」，不再讀 persona.rbac。
//    見 wg-event.js 的 wgIdentities()（身份清單怎麼組）與本檔的 reviewAudiences。
(function () {
  const { Button, Badge, Avatar } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { MMCtx, useMM, ToastHost, BlockDialog } = window;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "density": "regular",
    "demoBar": true
  }/*EDITMODE-END*/;

  // 後台核心模組（本原型以佔位呈現，聚焦成員管理）
  const CORE = window.WG_NAV_CORE;

  // 首次進站的預設視角。與任務管理／資源站點一致都是林承翰（超級管理員），
  // 否則從別頁點「Teams」跳過來會突然換人。
  // 之後以共用 store（wg-event.js 的 wgSetPersonaId）記住的人為準。
  const DEFAULT_ROLE = "super";

  // ── 側邊欄導覽 ──────────────────────────────────────────────────────────
  // 2026-08-15 Sucre：**與任務管理／資源站點頁同步**，直接用 nav.js 的 window.WG_NAV，
  // 不再自己排一份。原本每個角色的分隔線標題與項目名稱都不一樣
  //   （super「協作與權限」/ teamadmin「我的協作空間 · 我的團隊」/ gov「協作對接」/
  //    visitor 只有一項），跨頁看起來像三個不同產品。
  // 現在四個角色的排列、圖示、分隔線標題完全一致，差別只在有沒有「成員與權限」
  //   —— 只有超級管理員進得去（正典 AC-FEAT-001 AC-02：只有 SA 能指派平台角色）。
  // 「團隊」在各身份點進去看到的內容仍然不同（超級管理員：全部團隊可編輯／團隊身份：我的團隊＋所有團隊唯讀
  //   ／政府唯讀），那是頁面內容的事，不該用導覽名稱去暗示。
  // 過濾規則在 nav.js 的 wgNavFor（三頁共用），本頁不再自己排一份。

  // 2026-08-17：pill 切的是「哪個人」，不是「哪個身份」——
  // 身份切換在右上角人名選單，一個人可能有 2~3 個身份。
  const ROLE_PILLS = [
    { key: "super",     hint: "3 個身份：超級管理員 ＋ 慈濟成員 ＋ 光復福安宮管理員（T-1／T-6）" },
    { key: "teamadmin", hint: "3 個身份：壯闊台灣管理員 ＋ 慈濟成員 ＋ 花蓮縣府成員（T-2 跨型別）" },
    { key: "auditor",   hint: "2 個身份：資料檢核員 ＋ 世界展望會成員（T-4 Carol 的原始需求）" },
    { key: "gov",       hint: "1 個身份：花蓮縣政府災防辦管理員 —— 切換器不出現" },
    { key: "visitor",   hint: "1 個身份：慈濟基金會成員 —— 切換器不出現" },
  ];

  // ── 原型角色切換列 ────────────────────────────────────────────────────────
  function DemoBar({ role, onChange }) {
    return (
      <div style={{ flexShrink: 0, background: "#0F172A", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: 52, overflowX: "auto" }}>
        <span style={{ font: "var(--font-label-300)", color: "#94A3B8", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon n="Eye" s={15} c="#94A3B8" />原型 · 角色視角
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {ROLE_PILLS.map((r) => {
            const p = window.MM_PERSONAS[r.key];
            const active = role === r.key;
            return (
              <button
                key={r.key} onClick={() => onChange(r.key)} title={r.hint}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 14px", cursor: "pointer",
                  borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
                  border: active ? "1.5px solid var(--color-bg-primary)" : "1px solid #334155",
                  background: active ? "var(--color-bg-primary)" : "transparent",
                  color: active ? "#111" : "#CBD5E1", font: "var(--font-label-300)",
                }}
              >
                {p.name}
                <span style={{ fontSize: 11, opacity: 0.75 }}>{window.wgPlatformLabel(p.rbac)}</span>
              </button>
            );
          })}
        </div>
        <span className="wg-caption" style={{ marginLeft: "auto", color: "#64748B", whiteSpace: "nowrap" }}>切換身份在右上角人名選單 · 各身份權限完全切割，不自動升權</span>
      </div>
    );
  }

  // ── App ──────────────────────────────────────────────────────────────────
  function MMApp() {
    const t = TWEAK_DEFAULTS;
    // 角色視角走共用 store（wg-event.js），跨頁不會換人
    const [role, setRole] = window.useWGRole(window.MM_PERSONAS, DEFAULT_ROLE);
    const initialView = (() => {
      const m = (window.location.hash || "").match(/view=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : "teams";
    })();
    const [view, setView] = React.useState(initialView);
    // 目前身份。來源是 wg-event.js 的共用 store（三頁同一份、跨頁保留）。
    // 2026-08-17：從「目前團隊」升級成「目前身份」—— 平台身份也是可切的一列。
    //   identity.kind === "platform" → 平台身份（超級管理員／資料檢核員）
    //   identity.kind === "team"     → 團隊身份，identity.teamId 是哪一隊
    const [identity, setIdentity] = window.useWGActingIdentity(window.MM_PERSONAS[role]);
    const teamId = identity && identity.kind === "team" ? identity.teamId : null;

    const [teams, setTeams] = React.useState(window.MM_TEAMS);
    const [rosters, setRosters] = React.useState(window.MM_ROSTERS);
    const [platform, setPlatform] = React.useState(window.MM_PLATFORM);
    const [queue, setQueue] = React.useState(window.MM_QUEUE);
    const [audit, setAudit] = React.useState(window.MM_AUDIT);
    const [toasts, setToasts] = React.useState([]);
    const [block, setBlock] = React.useState(null);
    // 核准平台角色申請後要「帶去看這個人」的目標。nonce 讓同一人連續兩次也會再觸發。
    // 2026-09-27 Sucre：核准前台的申請之後，flow 要自動跳到成員與權限看到這個帳戶的位置。
    const [focus, setFocus] = React.useState(null);

    const persona = window.MM_PERSONAS[role];

    const toast = (msg, tone) => {
      const id = Date.now() + Math.random();
      setToasts((ts) => [...ts, { id, msg, tone }]);
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2800);
    };
    // ── 目前身份 acting identity ──────────────────────────────────────────
    // 2026-08-15 PM 確認：切換入口在右上角人名選單；Audit Log 依此處的身份記錄操作者。
    // 2026-08-17 Carol（PM）：切換清單即身份清單，平台身份也是可切的一列。
    const actingTeam = teamId ? teams.find((t) => t.id === teamId) : null;
    // 目前身份的**有效平台角色** —— 乾淨切（D-3）全部讀這個，不讀 persona.rbac。
    // 差別：persona.rbac 掛在「人」身上、切換時不變；這個掛在「身份」上、切換就變。
    const actingPlatformRole = identity ? identity.platformRole : null;
    const platformLabel = window.wgPlatformLabel(actingPlatformRole);

    // 操作者身份快照：寫進 audit，讓多重身份的人的操作歸得了因。
    // ⚠️ 這正是 Carol 8/17「不知道他在下這個決策的時候是代表哪個身分」要解的東西。
    //    一律走 wgIdentityLabel()，團隊身份的前綴規則在那裡強制執行。
    const actorIdentity = window.wgIdentityLabel(identity);

    const pushAudit = (entry) => setAudit((a) => [{
      id: "a" + Date.now(), time: "剛剛",
      actorIdentity,
      actorTeamId: actingTeam ? actingTeam.id : null,   // null＝此人無團隊
      ...entry,
    }, ...a]);

    // 切換身份。key：平台身份是 "@super" / "@auditor"；團隊身份是 team id。
    const switchTeam = (key) => {
      const target = window.wgIdentities(persona).find((i) => i.key === key);
      if (!target) return;
      setIdentity(key);
      toast(`已切換為「${window.wgIdentityLabel(target)}」—— 可見範圍、可寫入範圍與 Audit 歸屬全部隨之改變`);
    };

    const ctx = {
      persona, teams, rosters, platform, queue, audit, toast, pushAudit, setBlock, focus,
      pad: t.density === "compact" ? "8px 16px" : "14px 16px",
      updateTeam: (id, patch) => setTeams((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      createTeam: (f) => {
        const id = "t" + Date.now();
        setTeams((ts) => [...ts, { id, name: f.name, type: f.type, status: "active", contact: { name: f.contactName || "—", phone: f.contactPhone || "—" }, created: "2026-06-12", zones: [], tickets: 0 }]);
        setRosters((r) => ({ ...r, [id]: [] }));
        pushAudit({ actor: persona.name, action: `建立團隊「${f.name}」並產生團隊邀請 QR（72 小時）`, cat: "team", scope: "platform" });
        toast(`已建立「${f.name}」`);
      },
      updateRoster: (tid, mid, patch) => setRosters((r) => ({ ...r, [tid]: (r[tid] || []).map((m) => (m.id === mid ? { ...m, ...patch } : m)) })),
      removeRosterMember: (tid, mid) => setRosters((r) => ({ ...r, [tid]: (r[tid] || []).filter((m) => m.id !== mid) })),
      updatePlatform: (id, patch) => setPlatform((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      assignPlatform: (name, roleKey) => {
        setPlatform((p) => [...p, { id: "p" + Date.now(), name, phone: "—", rbac: roleKey, status: "active", assigned: "2026-06-12", last: "—" }]);
        pushAudit({ actor: persona.name, action: `指派 ${name} 為 ${window.wgPlatformLabel(roleKey)}`, cat: "rbac", scope: "platform" });
        toast(`已指派 ${name} 為 ${window.wgPlatformLabel(roleKey)}`);
      },
      approveQueue: (q) => {
        setQueue((qs) => qs.filter((x) => x.id !== q.id));
        if (q.kind === "platform-role") {
          // 平台角色申請 → 由超級管理員指派平台角色（規則見 04-rbac）
          const key = q.request === "資料檢核員" ? "auditor" : "gov";
          // ⚠️ 2026-09-27 修：舊版只有資料檢核員會寫進人員資料，**核准「政府」之後這個人
          //    在畫面上哪裡都找不到**（平台級人員不收政府、全平台人員只讀 platform ＋ rosters）。
          //    現在兩種都寫進 platform；PlatformView 自己把 gov 濾掉，維持它「只放不由團隊
          //    推導的角色」的說法。全平台人員會把他標成「未分配團隊」—— 那是事實：
          //    8/14 裁示政府由 GOV 團隊推導，直接核准政府角色卻沒有團隊，本來就是個洞。
          const pid = "p" + Date.now();
          setPlatform((p) => [...p, { id: pid, name: q.applicant, phone: q.phone, rbac: key, status: "active", assigned: "2026-06-12", last: "—", fromSite: true }]);
          pushAudit({ actor: persona.name, action: `核准 ${q.applicant} 的平台角色申請（${q.request}）`, cat: "rbac", scope: "platform" });
          // 核准完直接帶去「成員與權限 → 全平台人員」，那一列閃一下並捲到可見。
          // 選全平台人員不選平台級人員：兩種角色都在那裡，且看得到「所屬團隊」。
          setView("members");
          setFocus({ personId: pid, tab: "directory", nonce: Date.now() });
          toast(`已核准 ${q.applicant} 為${window.wgPlatformLabel(key)}，已帶你到他在「全平台人員」的位置`);
          return;
        } else {
          // 加入某隊 → 以成員加入。2026-08-14 裁示：團隊角色移除 Guest，核准後一律是成員。
          //
          // ⚠️ 平台角色**不是「不變」，是由該隊的 type 推導**（8/14 裁示）。
          //    舊版寫死 rbac: "user" 並在 audit 記「平台角色不變／維持一般使用者」——
          //    那是 8/14 之前的模型，現在是錯的：入隊那一刻平台角色就被改了。
          //
          // 🔴 這句一改寫，ADR-4 的衝突就藏不住：**團隊管理員拉人進隊 ＝ 發了一個
          //    平台角色出去**，而正典 AC-FEAT-001 寫的是「只有超級管理員能指派
          //    平台角色」。原本那句「平台角色維持一般使用者」在遮蓋它。
          const joinedTeam = teams.find((t) => t.id === q.audience);
          const derived = window.wgPlatformFromType(joinedTeam && joinedTeam.type);
          const derivedLabel = window.wgPlatformLabel(derived);
          setRosters((r) => ({ ...r, [q.audience]: [...(r[q.audience] || []), { id: "m" + Date.now(), name: q.applicant, phone: q.phone, rbac: derived, role: "member", status: "active", joined: "2026-06-12", last: "剛剛" }] }));
          pushAudit({
            actor: persona.name,
            action: q.kind === "qr-pending"
              ? `確認 ${q.applicant} 加入（團隊角色：成員 · 平台角色隨之為${derivedLabel}）`
              : `核准 ${q.applicant} 加入（團隊角色：成員 · 平台角色隨之為${derivedLabel}）`,
            cat: "member", scope: q.audience,
          });
        }
        toast(`已核准 ${q.applicant} 的申請`);
      },
      rejectQueue: (q, why) => {
        setQueue((qs) => qs.filter((x) => x.id !== q.id));
        pushAudit({ actor: persona.name, action: `拒絕 ${q.applicant} 的申請｜理由：${why}`, cat: q.kind === "platform-role" ? "rbac" : "member", scope: q.audience === "super" ? "platform" : q.audience, tone: "danger" });
        toast(`已拒絕並通知 ${q.applicant}`, "danger");
      },
    };

    const switchRole = (r) => {
      setRole(r);
      // 「團隊」不一定存在於新身份的導覽（資料檢核員就沒有），落點交給上面那個
      // useEffect 校正；這裡先給一個常見預設。
      setView("teams");
      // identity 不在這裡設 —— useWGActingIdentity 會依新 persona 自行解析
    };

    const nav = window.wgNavFor(persona);   // 只給 header 標題查用；不傳給 shell

    // ⚠️ 乾淨切的副作用：切換身份後，目前這個 view 可能整個從導覽消失
    //    （切到資料檢核員時「團隊」不見了；切到團隊成員時「成員與權限」不見了）。
    //    留在原地會變成「標題是 A、內容是無權限畫面」的錯亂，所以自動落到該身份的
    //    第一個導覽項。這不是降權提示，是把使用者放到一個合法的位置。
    React.useEffect(() => {
      const ids = nav.map((n) => n[0]);
      if (view !== "settings" && !ids.includes(view)) setView(ids[0]);
    }, [role, identity && identity.key]);

    // ── 審核佇列：跟著身份收斂（2026-08-17 D-6）───────────────────────────
    //
    // ⚠️ 修掉的 bug：舊版是
    //      persona.teams.filter(ms => ms.role === "admin").map(ms => ms.id)
    //    —— 取「所有她當管理員的隊」的**聯集**，不看目前切到哪。所以切到成員身份
    //    時，頁面內部已經正確收斂（mm-myteam.jsx 只剩「夥伴列表」分頁），頂欄鈴鐺
    //    卻還顯示著另一隊的件數。那不是設計，是兩邊各算各的。
    //
    //    更嚴重的是歸因：她切在慈濟卻批准了壯闊台灣的申請時，pushAudit 會把
    //    actorIdentity 記成「慈濟基金會 · 成員」。收斂之後這條路徑消失。
    //
    //    現在只算目前身份：平台身份是超級管理員 → 審平台角色申請；
    //    團隊身份且該隊角色是管理員 → 審該隊申請；其餘一律空。
    const reviewAudiences = !identity
      ? []
      : identity.kind === "platform"
        ? (identity.role === "super" ? ["super"] : [])
        : (identity.role === "admin" ? [identity.teamId] : []);
    const queueCount = queue.filter((q) => reviewAudiences.includes(q.audience)).length;

    // ── 內容路由：依**目前身份**收斂（2026-08-17 D-2 / D-3）─────────────────
    //
    // 舊版依 role key（也就是「這是哪個人」）分支，所以同一個人不管切到哪個身份
    // 看到的都是同一頁。現在依身份分支：
    //   平台身份 · 超級管理員   → 全平台團隊管理（可編輯）
    //   平台身份 · 資料檢核員   → 團隊頁本來就不該進得來（nav 已濾掉），保險擋一層
    //   團隊身份               → 我的團隊 ＋ 所有團隊（唯讀清單）
    //
    // 🔒 乾淨切：越權的路徑不 render 內容，不是 render 一個灰掉的版本。
    let content;
    const isPlaceholder = CORE.some((c) => c[0] === view) || view === "settings" || view === "audit";
    if (isPlaceholder) {
      content = <window.MMPlaceholder label={view === "settings" ? "設定" : (nav.find((n) => n[0] === view) || [])[1] || view} />;
    } else if (view === "members") {
      // 只有切在超級管理員時才進得來（nav 已濾掉，這裡是後端 403 的前端對應）
      content = actingPlatformRole === "super"
        ? <window.MembersPermissionsView />
        : <window.MMNoAccess need="超級管理員" current={actorIdentity} />;
    } else if (actingPlatformRole === "super" && identity.kind === "platform") {
      content = <window.SuperTeamsView />;
    } else if (identity && identity.kind === "team") {
      content = <window.TeamAdminView currentTeamId={teamId} />;
    } else {
      content = <window.MMNoAccess need="任一團隊身份" current={actorIdentity} />;
    }

    // screen-label 用**目前身份**，不是這個人的 persona.rbac —— 截圖時看得出他代表誰
    const roleLabel = actorIdentity;
    const navLabel = view === "settings" ? "設定" : (nav.find((n) => n[0] === view) || [])[1] || view;

    return (
      <MMCtx.Provider value={ctx}>
        <window.WGPage roleBar={t.demoBar && <DemoBar role={role} onChange={switchRole} />}>
          <window.MMShell
            active={view} onNavigate={(id) => {
              // 跨頁與否交給 nav.js 判斷（見 wgNavigate 的註解）——
              // 這裡不再列白名單，否則每加一個新頁面都要回來改這行。
              if (window.wgNavigate(id, "members")) return;
              setView(id);
            }} persona={persona}
            activeTeamId={identity ? identity.key : null} onSwitchTeam={switchTeam}
            queueCount={queueCount} reviewAudiences={reviewAudiences}
            onGoTeam={(tid) => { setIdentity(tid); setView("teams"); }}
          >
            <div data-screen-label={`${navLabel} — ${roleLabel} 視角`}>{content}</div>
          </window.MMShell>
        </window.WGPage>
        {block && <BlockDialog {...block} onClose={() => setBlock(null)} />}
        <ToastHost toasts={toasts} />
      </MMCtx.Provider>
    );
  }

  Object.assign(window, { MMApp });
})();
