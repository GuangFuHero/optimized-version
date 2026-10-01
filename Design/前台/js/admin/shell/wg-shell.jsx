// wg-shell.jsx — 三個後台頁面共用的 Console 外殼（側邊欄 + 頂欄 + 原型角色列）
//
// 取代原本各自為政的 tk-shell.jsx(TKShell) 與 station-shell.jsx(ConsoleShell)。
// 頁面專屬的東西一律透過 props 傳入，shell 本身不認識任何一個模組。
//
// 事件脈絡的「移除災害 X」與「事件設定」只有在對應的 callback 有傳入時才出現；
// 沒傳＝唯讀（資源站點頁就是唯讀，2026-08-07 決策）。
(function () {
  const { SidebarItem, Avatar, Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // ── 「資料待確認」小標籤（shell 自帶，不依賴任何模組）─────────────────────
  function ShellPendingChip({ info, label = "資料待確認" }) {
    return (
      <span title={info ? `${info.title}｜${info.note}` : undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 20, padding: "0 8px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
          border: "1px dashed var(--color-border-default)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", cursor: "help" }}>
        <Icon n="CircleHelp" s={11} c="var(--color-fg-neutral-muted)" />{label}
      </span>
    );
  }

  // 災害標籤：任務管理頁有完整的 DisasterTag（含撤銷、新增動畫），優先用它；
  // 其他頁面沒載入 tk-shared 時，退回一個等價外觀的簡化版。
  function DisasterChip({ type, isNew, onRemove }) {
    if (window.DisasterTag) {
      return <window.DisasterTag type={type} size="sm" mono isNew={isNew} onRemove={onRemove} />;
    }
    const raw = (window.TK_DISASTERS || {})[type];
    if (!raw) return null;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", height: 22, padding: "0 9px", borderRadius: "var(--radius-full)",
        background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", flexShrink: 0, background: "var(--color-fg-neutral-subtle)" }}></span>
        <span style={{ font: "var(--font-data-300)", fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>{raw.label}</span>
      </span>
    );
  }

  // ── 前後台互跳（IAM-FEAT-004 / IAM-PS-104、105）─────────────────────────
  // 常態出現：三個後台頁共用 WGShell，所以只在這裡放一顆，三頁同時生效。
  //
  // 位置＝側邊欄「場域列」，在品牌區下方、導覽清單上方（2026-08-16 改；原本在頂欄右上）。
  //   移過來的理由：① 後台頂欄右上已有審核鈴鐺＋通知鈴鐺＋人名兩行，是全頁最擠的一塊
  //   ② 前台行動版頂欄只有 56px，帶文字的按鈕放不下，一挪位「固定位置」（IAM-PS-102）就破了
  //   ③ 左上是視線起點，跟前台頂欄品牌旁互為鏡像。
  //
  // 「場域標籤」與「切換按鈕」刻意拆成兩個元件：
  //   靜態標籤「管理後台」回答「我現在在哪」——不可點，避免跟按鈕混淆
  //   按鈕「回到前台」回答「我要去哪」——IAM-PS-101／104 規定的字串要完整顯示得出來
  // 曾考慮做成 [前台|後台] 分段切換，一個元件回答兩件事，但前台 General User
  // 那一態的字串是「申請成為後台人員」，塞不進分段標籤，會違反 IAM-PS-101，故放棄。
  //
  // ⚠️ 回到前台 ≠ 登出（IAM-PS-105）：不動任何憑證，前台仍是已登入狀態。
  const WG_SITE_HOME = "前台地圖 Site Map.html#/map";

  function WGRealmBar({ collapsed, href = WG_SITE_HOME }) {
    const link = encodeURI(href);
    if (collapsed) {
      return (
        <div style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border-default)", display: "flex", justifyContent: "center" }}>
          <a href={link} aria-label="回到前台" title="你在管理後台　·　回到前台（不會登出）"
            style={{ width: 40, height: 32, display: "grid", placeItems: "center", borderRadius: "var(--radius-sm)",
              textDecoration: "none", color: "var(--color-fg-neutral-subtle)" }}>
            <Icon n="ArrowLeftRight" s={18} c="currentColor" />
          </a>
        </div>
      );
    }
    return (
      <div style={{ padding: "9px 20px", borderBottom: "1px solid var(--color-border-default)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* 場域標籤：靜態，只回答「我在哪」。 */}
        <span title="你目前在管理後台"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", flexShrink: 0,
            borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)",
            font: "var(--font-data-300)", fontWeight: 700, color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>
          <Icon n="ShieldCheck" s={12} c="var(--color-fg-neutral-muted)" />管理後台
        </span>
        {/* 切換按鈕：只回答「我要去哪」。 */}
        <a href={link} title="回到前台（不會登出）"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, flexShrink: 0,
            textDecoration: "none", font: "var(--font-data-300)", fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>
          回到前台<Icon n="ArrowLeftRight" s={13} c="currentColor" />
        </a>
      </div>
    );
  }

  // 相容舊呼叫點（原本頂欄那顆）。新版一律走 WGRealmBar。
  function WGBackToSite({ href = WG_SITE_HOME }) {
    return (
      <a href={encodeURI(href)} title="回到前台（不會登出）"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px",
          borderRadius: "var(--radius-full)", textDecoration: "none", whiteSpace: "nowrap",
          border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)",
          font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>
        <Icon n="ArrowLeftRight" s={16} c="var(--color-fg-neutral-subtle)" />回到前台
      </a>
    );
  }

  // ── 事件天數與短名：唯一實作在 wg-event.js，這裡只做 null-safe 轉接 ──────
  // ⚠️ 不要在這支檔案裡再寫一份天數計算（2026-08-16 一度出現兩份並存，算法還不一樣）。
  //    wg-event.js 是三個後台頁共用的事件層來源，算法只能有一個地方。
  const eventDays = (act) => (window.wgEventDays ? window.wgEventDays(act) : null);
  const eventShortName = (act) => (window.wgEventShortName ? window.wgEventShortName(act) : (act.shortName || act.name || ""));

  // ── 事件卡（側邊欄第二行的 ⓘ 展開）────────────────────────────────────
  // 常駐區只留「事件短名」與「進行中 · 第 N 天」，其餘全部收進這裡：
  //   事件全名 · 起始時間與啟動者 · 災害類型（含移除 X）· 待確認標籤 · 事件設定
  // ⚠️ 災害類型的移除 X 是刻意從常駐區搬進來的：它原本混在標題資訊裡卻是可操作的，
  //    而「移除災害類型」是低頻的管理動作，不該跟脈絡資訊擠在同一層。
  //    出現條件不放寬 —— 仍是「有 onRemoveDisaster 且災害類型 > 1 個」。
  function WGEventCard({ act, types, canRemove, onRemoveDisaster, onOpenEventSettings, activeNav, onClose }) {
    const inPlace = typeof onOpenEventSettings === "function";
    return (
      <div role="dialog" aria-label="事件資訊"
        style={{ position: "absolute", left: 16, right: 16, top: "calc(100% - 6px)", zIndex: 200,
          display: "flex", flexDirection: "column", gap: 10, padding: 14,
          background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)" }}>

        {/* 事件全名 */}
        <span style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <Icon n="Radio" s={14} c="var(--color-brand-primary-default)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)", lineHeight: 1.35 }}>{act.name}</span>
        </span>

        {/* 起始時間 ＋ 啟動者 */}
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
          <span>起始 {act.startedAt}</span>
          {act.startedBy && <span>由 {act.startedBy} 啟動</span>}
        </span>

        {/* 災害類型（移除 X 在這裡，不在常駐區） */}
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
          <span style={{ flexShrink: 0 }}>災害類型</span>
          {types.map((t) => (
            <DisasterChip key={t.key} type={t.key} isNew={t.isNew}
              onRemove={canRemove ? () => onRemoveDisaster(t.key) : undefined} />
          ))}
        </span>

        {/* 待確認 ＋ 事件設定 */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          paddingTop: 10, borderTop: "1px solid var(--color-border-default)" }}>
          <ShellPendingChip info={window.WG_EVENT_PENDING} label="事件層資料待確認" />
          {/* 行為不變：任務管理頁就地開彈窗，其他頁跳到任務管理頁再開。點下去先關卡片。 */}
          <button className="tk-chipbtn"
            onClick={() => {
              onClose();
              if (inPlace) onOpenEventSettings();
              else if (window.wgNavigate) window.wgNavigate("ticket", activeNav);
            }}
            title={inPlace ? "事件設定與歷史" : "事件設定在任務管理頁，點擊前往"}
            style={{ marginLeft: "auto", border: "none", background: "transparent", padding: 0,
              color: "var(--color-fg-neutral-muted)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4, font: "var(--font-data-300)" }}>
            <Icon n="Settings" s={13} c="currentColor" />事件設定
          </button>
        </span>
      </div>
    );
  }

  // ── 原型角色視角列（黑底）──────────────────────────────────────────────
  // items: [{ id, name, sub, icon }]
  function WGRoleBar({ items, value, onChange, note = "各角色可見的操作依權限總表收斂" }) {
    return (
      <div style={{ flexShrink: 0, background: "#0F172A", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: 52, overflowX: "auto" }}>
        <span style={{ font: "var(--font-label-300)", color: "#94A3B8", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon n="Eye" s={15} c="#94A3B8" />原型 · 角色視角
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {items.map((it) => {
            const active = value === it.id;
            return (
              <button key={it.id} type="button" onClick={() => onChange(it.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 14px", cursor: "pointer", borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
                  border: active ? "1.5px solid var(--color-bg-primary)" : "1px solid #334155", background: active ? "var(--color-bg-primary)" : "transparent",
                  color: active ? "#111" : "#CBD5E1", font: "var(--font-label-300)" }}>
                {it.icon && <Icon n={it.icon} s={15} c={active ? "#111" : "#CBD5E1"} />}
                {it.name}
                {it.sub && <span style={{ fontSize: 11, opacity: 0.75 }}>{it.sub}</span>}
              </button>
            );
          })}
        </div>
        <span className="wg-caption" style={{ marginLeft: "auto", color: "#64748B", whiteSpace: "nowrap" }}>{note}</span>
      </div>
    );
  }

  // ── 頁面外框（三頁共用）─────────────────────────────────────────────────
  // ⚠️ 2026-08-15：三頁原本各自寫 `minHeight: "100vh"` 包住角色列＋shell。
  //    minHeight 只保證「至少一個畫面高」，不會把高度**限制**住 —— 所以側邊欄
  //    沒有被框住，導覽區的 overflowY:auto 永遠不會作用，內容一長就整頁往下長，
  //    「設定 / 登出」被推到摺線以下。視窗高 800 以下必現（13 吋筆電就是這個高度）。
  //    改成 height:100vh + overflow:hidden，側邊欄才有邊界、導覽區才會自己捲。
  //
  //    這支存在的理由跟 nav 一樣：**不要讓每頁自己寫**，寫了就會有人寫得不一樣。
  function WGPage({ roleBar, children }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {roleBar}
        {children}
      </div>
    );
  }

  // ── 主 shell ───────────────────────────────────────────────────────────
  // props:
  //   nav / active / onNavigate      導覽（預設 window.WG_NAV）
  //   persona {name, rbacLabel, rbacTone, title}
  //   activation                     事件資料（預設 window.TK_ACTIVATION）
  //   disasterTypes  [{key,isNew}]   要顯示的災害（預設 window.wgActiveDisasters()）
  //   onRemoveDisaster(key)          有傳才出現 X；沒傳＝唯讀
  //   onOpenEventSettings()          有傳才出現「事件設定」；沒傳＝唯讀
  //   headerExtra                    頁面標題右邊的專屬區塊（例：列表/地圖切換）
  //   onLogout
  function WGShell({
    nav, active: activeNav, onNavigate, persona,
    activation, disasterTypes, onRemoveDisaster, onOpenEventSettings,
    headerExtra, headerActions, sidebarExtra, onLogout, children,
  }) {
    const [collapsed, setCollapsed] = React.useState(false);
    // 目前身份（一人多身份）。共用來源在 wg-event.js，三頁同一份、跨頁保留。
    // 2026-08-17：從「目前團隊」升級成「目前身份」—— 平台身份也是可切的一列
    // （Carol 8/14＋8/17 裁示，覆蓋 8/15）。切換會連帶改變側邊欄（見下方 NAV）。
    const [actingIdentity, setActingIdentity] = window.useWGActingIdentity
      ? window.useWGActingIdentity(persona)
      : [null, undefined];
    const actingKey = actingIdentity ? actingIdentity.key : undefined;
    // ⚠️ 導覽由 shell 自己算，**不要讓頁面傳 nav**。
    // 2026-08-15：三頁不同步的根因就是「每頁自己排一份」——
    // 任務管理吃整份 WG_NAV、成員管理自己依角色濾、資源站點又是另一份。
    // 現在唯一來源是 nav.js 的 wgNavFor(persona)，頁面連傳的機會都沒有。
    // nav prop 保留只為了相容還沒改完的呼叫點，正式用法是不傳。
    //
    // 2026-08-17 D-3 乾淨切：wgNavFor 現在讀「目前身份」的平台角色，不是 persona.rbac。
    // actingKey 進相依陣列，切換身份時側邊欄要重畫（切到某隊成員時「成員與權限」
    // 與「資料檢核」整個消失，不是灰掉）。
    const NAV = React.useMemo(
      () => nav || (window.wgNavFor ? window.wgNavFor(persona) : window.WG_NAV),
      [nav, persona && persona.id, actingKey]
    );
    const act = activation || window.TK_ACTIVATION || {};
    const types = disasterTypes || (window.wgActiveDisasters ? window.wgActiveDisasters() : []);
    const current = NAV.find((n) => n[0] === activeNav) || NAV[0];
    const canRemove = typeof onRemoveDisaster === "function" && types.length > 1;

    // 事件卡：三種關閉方式 —— 點卡片外面、Esc、收合側邊欄。
    const [eventCardOpen, setEventCardOpen] = React.useState(false);
    const eventHeadRef = React.useRef(null);
    const days = eventDays(act);
    React.useEffect(() => { if (collapsed) setEventCardOpen(false); }, [collapsed]);
    React.useEffect(() => {
      if (!eventCardOpen) return;
      const onDown = (e) => { if (eventHeadRef.current && !eventHeadRef.current.contains(e.target)) setEventCardOpen(false); };
      const onKey = (e) => { if (e.key === "Escape") setEventCardOpen(false); };
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [eventCardOpen]);

    return (
      /* 2026-08-29：外面多包一層直向 flex，第一列是全站橫幅（EA-FEAT-001）。
         橫幅要在側邊欄與頂欄「之上」，所以掛在這裡而不是內容區 ——
         EA-AB-141 的「每一頁最頂部」是字面意思。
         an-banner.jsx 未載入時整段不 render，還沒改 script 標籤的頁面不會壞掉。 */
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {window.WGAnnounceBanner ? <window.WGAnnounceBanner realm="admin" /> : null}
      {/* flex:1 + minHeight:0 —— 不寫死 100vh，否則上方有角色列時會把「登出」擠出畫面 */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, background: "var(--color-bg-neutral-subtle)" }}>
        <aside style={{ width: collapsed ? 76 : 252, flexShrink: 0, background: "var(--color-bg-neutral-subtle)", borderRight: "1px solid var(--color-border-default)", display: "flex", flexDirection: "column", transition: "width var(--transition-base)" }}>

          {/* ── 事件脈絡：常駐只有兩行（2026-08-16 改）────────────────────────
              第一行  [logo] 事件短名                    [收合鈕]
              第二行  ● 進行中 · 第 N 天                 ⓘ
              其餘資訊（全名／起始／災害類型／待確認／事件設定）全部進 ⓘ 事件卡。
              ⚠️ 第一行是「事件短名」不是品牌名 —— 後台側邊欄不再出現任何品牌字樣。 */}
          <div ref={eventHeadRef}
            style={{ position: "relative", padding: collapsed ? "14px 0 12px" : "16px 20px 14px", borderBottom: "1px solid var(--color-border-default)" }}>

            {collapsed ? (
              /* 收合：logo ＋ 狀態圓點 ＋ 展開鈕，整組 title 帶事件全名與天數。
                 不整塊隱藏 —— 收合後仍要看得出自己在哪個事件（2026-08-16）。 */
              <div title={act.name ? `${act.name}　進行中${days != null ? ` · 第 ${days} 天` : ""}` : undefined}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ width: 36, height: 26, display: "inline-flex", flexShrink: 0, color: "var(--color-bg-primary)" }}
                  dangerouslySetInnerHTML={{ __html: window.WGMark }}></span>
                {act.name && (
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", flexShrink: 0, background: "var(--color-brand-primary-default)" }}></span>
                )}
                <button type="button" onClick={() => setCollapsed(false)} aria-label="展開選單"
                  style={{ width: "100%", display: "grid", placeItems: "center", border: "none", background: "transparent",
                    cursor: "pointer", lineHeight: 0, color: "var(--color-fg-neutral-default)", padding: "4px 0", borderRadius: "var(--radius-sm)" }}>
                  <Icon n="PanelLeftOpen" s={22} />
                </button>
              </div>
            ) : (
              <React.Fragment>
                {/* 第一行：logo ＋ 事件短名 ＋ 收合鈕 */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 36, height: 26, display: "inline-flex", flexShrink: 0, color: "var(--color-bg-primary)" }}
                    dangerouslySetInnerHTML={{ __html: window.WGMark }}></span>
                  <span title={act.name || undefined}
                    style={{ font: "var(--font-label-500)", fontSize: 18, color: "var(--color-fg-neutral-default)",
                      minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {eventShortName(act)}
                  </span>
                  <button type="button" onClick={() => setCollapsed(true)} aria-label="收合選單"
                    style={{ border: "none", background: "transparent", cursor: "pointer", lineHeight: 0, flexShrink: 0,
                      color: "var(--color-fg-neutral-default)", padding: 6, borderRadius: "var(--radius-sm)" }}>
                    <Icon n="PanelLeftClose" s={22} />
                  </button>
                </div>

                {/* 第二行：狀態圓點 ＋ 進行中 · 第 N 天 ＋ ⓘ 事件卡開關 */}
                {act.name && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, font: "var(--font-data-300)" }}>
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", flexShrink: 0, background: "var(--color-brand-primary-default)" }}></span>
                    <span style={{ fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>進行中</span>
                    {days != null && (
                      <React.Fragment>
                        <span style={{ color: "var(--color-fg-neutral-muted)" }}>·</span>
                        <span style={{ color: "var(--color-fg-neutral-muted)" }}>第 {days} 天</span>
                      </React.Fragment>
                    )}
                    <button type="button" onClick={() => setEventCardOpen((v) => !v)}
                      aria-label="事件資訊" aria-expanded={eventCardOpen} title="事件資訊"
                      style={{ marginLeft: 2, border: "none", background: "transparent", padding: 0, cursor: "pointer", lineHeight: 0,
                        color: eventCardOpen ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>
                      <Icon n="Info" s={14} c="currentColor" />
                    </button>
                  </div>
                )}
              </React.Fragment>
            )}

            {eventCardOpen && !collapsed && act.name && (
              <WGEventCard act={act} types={types} canRemove={canRemove} onRemoveDisaster={onRemoveDisaster}
                onOpenEventSettings={onOpenEventSettings} activeNav={activeNav}
                onClose={() => setEventCardOpen(false)} />
            )}
          </div>

          {/* 場域列：我在管理後台 ＋ 回到前台（IAM-FEAT-004）。
              刻意獨立成一列，不塞進上面那兩行 —— 事件脈絡與「我在哪個場域」是兩件事。 */}
          <WGRealmBar collapsed={collapsed} />

          {/* 導覽 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: collapsed ? "16px 10px" : 16, alignItems: collapsed ? "center" : "stretch", flex: 1, minHeight: 0, overflowY: "auto" }}>
            {NAV.map(([id, label, icon, badge]) => (
              id === "__sep__" ? (
                <div key="sep" style={{ margin: collapsed ? "12px 0 2px" : "14px 8px 2px" }}>
                  <div style={{ height: 1, background: "var(--color-border-default)" }}></div>
                  {!collapsed && <div className="wg-caption" style={{ marginTop: 12, color: "var(--color-fg-neutral-muted)", fontWeight: 700, letterSpacing: ".04em" }}>{label}</div>}
                </div>
              ) : (
                <SidebarItem key={id} icon={<Icon n={icon} s={22} />}
                  label={!collapsed && badge
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{label}<span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--color-bg-warning)", color: "var(--color-fg-on-warning)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badge}</span></span>
                    : label}
                  active={activeNav === id} collapsed={collapsed} onClick={() => onNavigate(id)} />
              )
            ))}
            {sidebarExtra}
          </div>

          {/* 設定 / 登出 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: collapsed ? "14px 10px" : "14px 16px", alignItems: collapsed ? "center" : "stretch", borderTop: "1px solid var(--color-border-default)" }}>
            <SidebarItem icon={<Icon n="Settings" s={22} />} label="設定" active={activeNav === "settings"} collapsed={collapsed} onClick={() => onNavigate("settings")} />
            <SidebarItem icon={<Icon n="LogOut" s={22} />} label="登出" collapsed={collapsed} onClick={onLogout || (() => {})} />
          </div>
        </aside>

        {/* 主欄 */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header style={{ height: 68, flexShrink: 0, background: "var(--color-bg-neutral-default)", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 16, padding: "0 28px", position: "sticky", top: 0, zIndex: 100 }}>
            <h1 className="wg-h700" style={{ fontSize: 20, margin: 0, whiteSpace: "nowrap" }}>{current[1]}</h1>
            {/* 2026-09-27：每一頁標題旁的「？」—— 這一頁是做什麼的（js/shared/wg-help.jsx）。
                用 activeNav 不用 current[0]：佔位頁（設定、資料檢核）查不到 NAV 時 current 會退回第一項，
                那樣會在設定頁顯示儀表板的說明。未載入 wg-help.jsx 的頁面不會壞，只是沒有問號。 */}
            {window.WGPageHelp ? <span style={{ marginLeft: -10, display: "inline-flex" }}><window.WGPageHelp pageKey={activeNav} /></span> : null}
            {headerExtra}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
              {/* 回到前台已移到側邊欄場域列（2026-08-16）。頂欄右上只留後台內部的通知與身份。 */}
              {/* 頁面專屬的頂欄動作（例：成員管理的審核佇列鈴鐺），排在個人通知鈴鐺左邊。
                  兩者是兩件事：審核佇列是「等我處理的申請」，通知收件匣是「發生了什麼事」。 */}
              {headerActions}
              {/* 鈴鐺可點：未讀徽章 → 通知 Drawer（wg-notify.jsx）。
                  wg-notify.jsx 未載入時退回原本的靜態鈴鐺，不讓頁面壞掉。 */}
              {window.WGNotifyBell
                ? <window.WGNotifyBell persona={persona} />
                : (
                  <button className="tk-iconbtn" aria-label="通知" style={{ border: "none", background: "transparent", cursor: "pointer", lineHeight: 0 }}>
                    <Icon n="Bell" s={22} c="var(--color-fg-neutral-subtle)" />
                  </button>
                )}
              {/* 人名區塊可點：下拉選單 → 個人設定 Drawer（wg-profile.jsx）。
                  wg-profile.jsx 未載入時退回原本的靜態顯示，不讓頁面壞掉。 */}
              {persona && (window.WGPersonaMenu
                ? <window.WGPersonaMenu persona={persona}
                    activeTeamId={actingKey} onSwitchTeam={setActingIdentity}
                    onLogout={onLogout} />
                : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={persona.name} tone={persona.rbacTone === "primary" ? "primary" : "secondary"} size={36} />
                    <div style={{ lineHeight: 1.25 }}>
                      <div style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", display: "flex", alignItems: "center", gap: 6 }}>
                        {persona.name}
                        {persona.rbacLabel && <Badge tone={persona.rbacTone || "neutral"}>{persona.rbacLabel}</Badge>}
                      </div>
                      <div style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>{persona.title}</div>
                    </div>
                  </div>
                ))}
            </div>
          </header>
          <div style={{ flex: 1, padding: "12px 28px 28px", overflow: "auto" }}>{children}</div>
        </div>
      </div>
      </div>
    );
  }

  // 頁面標題旁的「(N) + 分段切換」——任務管理與資源站點共用同一個外觀
  function WGViewSwitch({ count, value, onChange, options }) {
    const opts = options || [["list", "列表視圖", "List"], ["map", "地圖視圖", "Map"]];
    return (
      <React.Fragment>
        {count != null && <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>({count})</span>}
        <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-sunken)" }}>
          {opts.map(([id, label, icon]) => {
            const on = value === id;
            return (
              <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={on}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 14px", borderRadius: 8, cursor: "pointer", border: "none", whiteSpace: "nowrap",
                  background: on ? "var(--color-bg-neutral-default)" : "transparent", boxShadow: on ? "var(--shadow-sm)" : "none",
                  font: "var(--font-label-400)", fontWeight: on ? 700 : 400, color: on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>
                <Icon n={icon} s={15} c={on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)"} />{label}
              </button>
            );
          })}
        </div>
      </React.Fragment>
    );
  }

  function WGPlaceholder({ label, note }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 420, gap: 12, color: "var(--color-fg-neutral-muted)" }}>
        <Icon n="Hammer" s={40} c="var(--color-fg-neutral-muted)" />
        <div className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>{label} · 建置中</div>
        {note && <div className="wg-caption">{note}</div>}
      </div>
    );
  }

  Object.assign(window, { WGShell, WGPage, WGRoleBar, WGViewSwitch, WGPlaceholder, ShellPendingChip, WGBackToSite, WGRealmBar, WGEventCard });
})();
