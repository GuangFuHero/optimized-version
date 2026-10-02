// wg-notify.jsx — 頂欄鈴鐺 → 未讀徽章 → 右側通知 Drawer（四個後台共用）
//
// 正典：identity-and-account / IAM-FEAT-002（AC-01、02、05、06、07、08、10）
// 本地規格：IAM-FEAT-002-個人資料與通知/spec.md，規則編號 IAM-UP-101~113
//
// 這支元件實作的規則：
//   IAM-UP-101  只有三種類型：任務進度 / 資料審核結果 / 角色升級結果
//   IAM-UP-102  開頁就刷新未讀數，不需手動重新整理
//   IAM-UP-103  頁面開著時做 count-only 輪詢          ← ⚠️ 間隔為原型假值，見下
//   IAM-UP-104  開清單只清徽章，不把任何一則標成已讀   ← 這條最容易被實作錯
//   IAM-UP-105  已讀只因「點開該則」或「全部標為已讀」而改變
//   IAM-UP-106  同一任務短時間內多次更新聚合成一則
//   IAM-UP-107  每則顯示類型、事件摘要、時間
//   IAM-UP-108  點開導向對應的任務／審核結果／角色區塊
//   IAM-UP-109  保留 90 天
//
// ⚠️ 這支元件是後台專屬。前台（民眾 General User）的通知另有定義，不適用這裡的規則。
(function () {
  const { Avatar, Badge, Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  if (!document.getElementById("wg-notify-css")) {
    const st = document.createElement("style");
    st.id = "wg-notify-css";
    st.textContent =
      "@keyframes wgDrawerIn { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }"
      + "@keyframes wgBellNudge { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-12deg); } 75% { transform: rotate(12deg); } }";
    document.head.appendChild(st);
  }

  // ── 待確認說明 ──────────────────────────────────────────────────────────
  window.WG_NOTIFY_PENDING = {
    title: "通知在後端尚不存在",
    note: "ERD（er-diagram.md，2026-06-27）沒有任何通知相關的表，只有 announcements 廣播橫幅。"
      + "個人收件匣、已讀狀態、通知類型、deep-link 參照、90 天保留、聚合鍵，全部都還沒有欄位可存。"
      + "另外 Open decision Q2 未解：沒有任何定義說明什麼情況算「災害啟動」，ERD 也沒有對應欄位，"
      + "所以正典寫的兩段輪詢間隔目前無法實作。",
  };

  // ── 三種類型（IAM-UP-101）────────────────────────────────────────────────
  // 這三種是正典已批准的全部。Open decision Q1 未解之前不得新增第四種。
  const TYPES = {
    task:   { label: "任務進度",     icon: "ClipboardList", tone: "info",    fg: "var(--color-fg-info)" },
    review: { label: "資料審核結果", icon: "FileCheck",     tone: "success", fg: "var(--color-fg-success)" },
    role:   { label: "角色升級結果", icon: "ShieldCheck",   tone: "warning", fg: "var(--color-fg-warning)" },
  };

  // ── 原型資料 ────────────────────────────────────────────────────────────
  // ⚠️ 全部是我編的示意內容，沒有資料來源。人名沿用 TK_PERSONAS，事件內容是虛構的。
  // `to` 決定哪個角色看得到，只是為了讓切換角色視角時內容不一樣，不是權限規則。
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  // 通知一律指向現有測試資料，不自己編號碼。
  // 任務單取自 TK_TICKETS（tk-data.js），站點取自 station-v2 的 SD.STATIONS。
  function ticketPool() {
    return (window.TK_TICKETS || []).map((t) => ({ id: t.id, title: t.title }));
  }
  function refKey(ref) {
    if (!ref) return null;
    return ref.kind === "role" ? "role" : ref.kind + ":" + ref.id;
  }

  function seed() {
    const now = Date.now();
    return [
      { id: "n1", type: "task",   to: ["u-huang", "u-lee", "u-lin"],
        summary: "明德街6F 獨居長者失聯", detail: "李國豪已接案 · 已抵達現場 · 回報破門搜救需求",
        count: 3, ts: now - 4 * MIN, seen: false, read: false,
        target: "任務單 #T-1080", ref: { kind: "ticket", id: "T-1080" } },
      { id: "n2", type: "review", to: ["u-huang", "u-chang", "u-lin"],
        summary: "你回報的「光復車站充電補給站」已通過審核", detail: "站點已上架，公開地圖上可以看到了",
        count: 1, ts: now - 38 * MIN, seen: false, read: false,
        target: "站點 RS-0166", ref: { kind: "station", id: "RS-0166" } },
      { id: "n3", type: "role",   to: ["u-lee"],
        summary: "角色升級申請未通過", detail: "壯闊台灣的管理員審核未通過，可向該隊管理員了解原因",
        count: 1, ts: now - 3 * HOUR, seen: false, read: false,
        target: "個人設定 · 角色身份", ref: { kind: "role" } },
      { id: "n4", type: "task",   to: ["u-huang", "u-lin", "u-wu"],
        summary: "大同村活動中心 物資見底", detail: "已結案",
        count: 1, ts: now - 6 * HOUR, seen: true, read: true,
        target: "任務單 #T-1067", ref: { kind: "ticket", id: "T-1067" } },
      { id: "n5", type: "review", to: ["u-chang", "u-lin"],
        summary: "「大進村物資集散中心」的修改提案被退回", detail: "營運狀態與現場回報不一致，請補充佐證",
        count: 1, ts: now - 2 * DAY, seen: true, read: false,
        target: "站點 RS-0143", ref: { kind: "station", id: "RS-0143" } },
      { id: "n6", type: "task",   to: ["u-wu", "u-lin"],
        summary: "大平村12鄰 住宅清淤", detail: "已指派給慈濟基金會",
        count: 1, ts: now - 5 * DAY, seen: true, read: true,
        target: "任務單 #T-1071", ref: { kind: "ticket", id: "T-1071" } },
    ];
  }

  // ── IAM-UP-108：導向對應物件 ────────────────────────────────────────────
  // 兩段式：先問本頁能不能自己開（同頁直接開 Drawer，不重新載入），
  // 本頁處理不了才跨頁，並用 #open= 讓落地頁自己開。
  // 落點對照沿用 nav.js 的 PAGES，不另立一份。
  const NOTIFY_PAGES = {
    station: "資源站點管理 Resource Station v2.html",
  };

  function notifyGo(ref) {
    if (!ref) return { ok: false, why: "這則通知沒有指向任何物件" };

    // 角色類：落點是個人設定 Drawer 的角色身份區塊（wg-profile.jsx）
    if (ref.kind === "role") {
      if (typeof window.wgOpenProfileDrawer === "function") { window.wgOpenProfileDrawer(); return { ok: true }; }
      return { ok: false, why: "個人設定 Drawer 尚未載入" };
    }

    // 本頁先試：有人 preventDefault 就代表本頁已經開起來了
    const ev = new CustomEvent("wg:notify-open", { detail: ref, cancelable: true });
    if (!window.dispatchEvent(ev)) return { ok: true };

    // 跨頁：帶 #open=kind:id，落地頁讀 hash 後自行開啟
    const page = NOTIFY_PAGES[ref.kind];
    if (page) {
      window.location.href = page + "#open=" + encodeURIComponent(ref.kind + ":" + ref.id);
      return { ok: true };
    }
    return { ok: false, why: "找不到這個物件的落點頁面" };
  }

  // 落地頁把 #open=kind:id 轉成一次 wg:notify-open。
  // ⚠️ 這些頁用 Babel standalone，模組是在 window load 之後才編譯執行的，
  //    所以剛 load 完時 React 還沒掛載，沒有人在聽這個事件。
  //    這裡改成重試：派事件 → 沒人接就等一下再派，直到有人接或放棄。
  function notifyConsumeHash(tries = 24, gap = 250) {
    const m = /(?:^|[#&])open=([^&]+)/.exec(window.location.hash || "");
    if (!m) return;
    const [kind, id] = decodeURIComponent(m[1]).split(":");
    if (!kind || !id) return;

    let left = tries;
    (function attempt() {
      const ev = new CustomEvent("wg:notify-open", { detail: { kind, id }, cancelable: true });
      const taken = !window.dispatchEvent(ev);   // 有人 preventDefault ＝ 接住了
      if (taken || --left <= 0) {
        // 接住了、或放棄了，都要把 hash 清掉，免得重新整理又跑一次
        try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) {}
        return;
      }
      window.setTimeout(attempt, gap);
    })();
  }

  // ── 相對時間（IAM-UP-107 的「時間」）────────────────────────────────────
  function ago(ts) {
    const d = Date.now() - ts;
    if (d < MIN) return "剛剛";
    if (d < HOUR) return `${Math.floor(d / MIN)} 分鐘前`;
    if (d < DAY) return `${Math.floor(d / HOUR)} 小時前`;
    return `${Math.floor(d / DAY)} 天前`;
  }

  // ── 單則通知 ────────────────────────────────────────────────────────────
  // 外層用 div 不用 button：右邊的靜音鈕是獨立按鈕，按鈕不能巢在按鈕裡。
  function NotifyRow({ item, muted, onOpen, onToggleMute }) {
    const t = TYPES[item.type];
    const unread = !item.read;
    const canMute = item.ref && item.ref.kind !== "role";
    const bg = unread && !muted ? "var(--color-bg-info-subtle)" : "transparent";
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "0 8px 0 0",
        borderBottom: "1px solid var(--color-bg-neutral-sunken)", background: bg, opacity: muted ? 0.62 : 1 }}>

        <button type="button" onClick={() => onOpen(item)}
          style={{ flex: 1, minWidth: 0, display: "flex", gap: 12, padding: "14px 8px 14px 16px", textAlign: "left",
            cursor: "pointer", border: "none", background: "transparent" }}>

          <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "var(--radius-full)", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-neutral-subtle)" }}>
            <Icon n={t.icon} s={18} c={t.fg} />
          </span>

          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <Badge tone={t.tone}>{t.label}</Badge>
              {/* IAM-UP-106：同一任務多次更新聚合成一則，這裡標示聚合了幾則 */}
              {item.count > 1 && (
                <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Icon n="Layers" s={12} c="var(--color-fg-neutral-muted)" />{item.count} 則更新
                </span>
              )}
              {muted && (
                <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Icon n="BellOff" s={12} c="var(--color-fg-neutral-muted)" />已關閉
                </span>
              )}
              <span style={{ marginLeft: "auto", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>
                {ago(item.ts)}
              </span>
            </span>

            <span style={{ font: "var(--font-body-400)", fontWeight: unread && !muted ? 700 : 400, color: "var(--color-fg-neutral-default)", overflowWrap: "anywhere" }}>
              {item.summary}
            </span>
            <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-muted)", overflowWrap: "anywhere" }}>
              {item.detail}
            </span>
            <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon n="ArrowUpRight" s={12} c="currentColor" />{item.target}
            </span>
          </span>

          {unread && !muted && <span aria-label="未讀" style={{ width: 9, height: 9, borderRadius: "var(--radius-full)", background: "var(--color-bg-primary)", flexShrink: 0, marginTop: 12 }}></span>}
        </button>

        {/* 關閉單一對象的後續通知（Sucre 2026-08-08 指示，正典沒有這條）*/}
        {canMute && (
          <button type="button" onClick={() => onToggleMute(item.ref)}
            aria-label={muted ? `恢復「${item.target}」的通知` : `關閉「${item.target}」的後續通知`}
            title={muted ? "恢復這個對象的通知" : "不再接收這個對象的通知"}
            style={{ marginTop: 12, flexShrink: 0, width: 30, height: 30, borderRadius: "var(--radius-full)",
              border: "none", background: "transparent", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: muted ? "var(--color-fg-warning)" : "var(--color-fg-neutral-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <Icon n={muted ? "BellOff" : "Bell"} s={16} c="currentColor" />
          </button>
        )}
      </div>
    );
  }

  // ── 通知 Drawer ─────────────────────────────────────────────────────────
  function WGNotifyDrawer({ items, muted, onMarkRead, onMarkAllRead, onToggleMute, onClose }) {
    const [toast, setToast] = React.useState(null);
    const unreadCount = items.filter((i) => !i.read && muted.indexOf(refKey(i.ref)) < 0).length;
    const mutedItems = items.filter((i) => muted.indexOf(refKey(i.ref)) >= 0);

    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // IAM-UP-108：點開 → 標為已讀 → 導向對應物件。
    // 同頁能開就直接開（Drawer 順帶關掉）；要跨頁就換頁。真的開不了才留在原地說明。
    function open(item) {
      onMarkRead(item.id);
      const r = notifyGo(item.ref);
      if (r.ok) { onClose(); return; }
      setToast(`開不了「${item.target}」：${r.why}`);
      window.setTimeout(() => setToast(null), 3400);
    }

    return (
      <div style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 950, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }}></div>
        <div role="dialog" aria-label="通知"
          style={{ position: "relative", width: "min(460px, 100vw)", height: "100%", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", animation: "wgDrawerIn var(--transition-base)" }}>

          {/* header */}
          <div style={{ padding: "18px 20px 16px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="wg-h700" style={{ fontSize: 19, margin: 0, display: "flex", alignItems: "center", gap: 9 }}>
                通知
                {unreadCount > 0 && <Badge tone="info">{unreadCount} 則未讀</Badge>}
              </h2>
              <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: 3 }}>
                後台通知 · 任務進度／資料審核／角色升級
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="關閉"
              style={{ border: "none", background: "var(--color-bg-neutral-subtle)", borderRadius: "var(--radius-full)", width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-fg-neutral-subtle)", flexShrink: 0 }}>
              <Icon n="X" s={19} c="currentColor" />
            </button>
          </div>

          {/* 全部標為已讀（IAM-UP-105：這是明確的一個動作，不是自動發生的）*/}
          <div style={{ padding: "9px 16px", borderBottom: "1px solid var(--color-bg-neutral-sunken)", display: "flex", alignItems: "center", gap: 10 }}>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
              開啟這份清單只會清掉鈴鐺上的數字，不會把任何一則標成已讀。
            </span>
            <button type="button" onClick={onMarkAllRead} disabled={unreadCount === 0}
              style={{ marginLeft: "auto", height: 28, padding: "0 10px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap",
                border: "1px solid var(--color-border-default)",
                background: unreadCount ? "var(--color-bg-neutral-default)" : "var(--color-bg-disable)",
                color: unreadCount ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)",
                font: "var(--font-label-300)", cursor: unreadCount ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon n="CheckCheck" s={14} c="currentColor" />全部標為已讀
            </button>
          </div>

          {/* list */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {items.length === 0
              ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "var(--color-fg-neutral-muted)", padding: 24 }}>
                  <Icon n="Inbox" s={34} c="var(--color-fg-neutral-muted)" />
                  <span className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>目前沒有通知</span>
                </div>
              )
              : items.map((it) => (
                  <NotifyRow key={it.id} item={it}
                    muted={muted.indexOf(refKey(it.ref)) >= 0}
                    onOpen={open} onToggleMute={onToggleMute} />
                ))}
          </div>

          {/* footer */}
          <div style={{ borderTop: "1px solid var(--color-border-default)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {toast && (
              <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: "var(--radius-md)", background: "var(--color-bg-info-subtle)", alignItems: "flex-start" }}>
                <Icon n="Info" s={15} c="var(--color-fg-info)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-info)" }}>{toast}</span>
              </div>
            )}
            {mutedItems.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 11px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)" }}>
                <Icon n="BellOff" s={15} c="var(--color-fg-neutral-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, font: "var(--font-body-300)", color: "var(--color-fg-neutral-muted)" }}>
                  已關閉 {mutedItems.length} 個對象的通知：{mutedItems.map((i) => i.target).join("、")}。
                  它們的既有通知仍在清單裡，之後不會再有新的。
                </span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
                只保留 90 天內的通知
              </span>
              <span style={{ marginLeft: "auto" }}>
                <window.ShellPendingChip info={window.WG_NOTIFY_PENDING} label="通知後端待建置" />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 頂欄鈴鐺 ────────────────────────────────────────────────────────────
  function WGNotifyBell({ persona }) {
    const pid = (persona && persona.id) || null;
    // ── 已讀／已關閉狀態跨頁同步（2026-08-15）───────────────────────────
    // 原本 seed() 每次掛載都重跑、muted 只存在記憶體，所以在任務管理點掉的未讀，
    // 跳到成員管理又全部變回未讀。三個後台是三個 HTML 檔，只能靠 localStorage。
    const ST_KEY = "wg.notify." + (pid || "anon");
    const readState = () => {
      try { return JSON.parse(localStorage.getItem(ST_KEY)) || { seen: [], read: [], muted: [] }; }
      catch (e) { return { seen: [], read: [], muted: [] }; }
    };
    const writeState = (patch) => {
      try {
        const cur = readState();
        localStorage.setItem(ST_KEY, JSON.stringify({ ...cur, ...patch }));
      } catch (e) {}
      window.dispatchEvent(new CustomEvent("wg:notify-state", { detail: { userId: pid } }));
    };

    const [all, setAll] = React.useState(() => {
      const st = readState();
      return seed().map((i) => ({
        ...i,
        seen: i.seen || st.seen.indexOf(i.id) >= 0,
        read: i.read || st.read.indexOf(i.id) >= 0,
      }));
    });
    const [open, setOpen] = React.useState(false);
    const [nudge, setNudge] = React.useState(false);
    // 已關閉通知的對象（"ticket:T-1080" / "station:RS-0166"）
    // ⚠️ 正典沒有這個功能，Sucre 2026-08-08 指示要做。原型只存在記憶體，重整就沒了。
    const [muted, setMuted] = React.useState(() => readState().muted);

    const items = React.useMemo(
      () => all.filter((i) => !pid || i.to.indexOf(pid) >= 0).sort((a, b) => b.ts - a.ts),
      [all, pid]
    );
    // 已關閉的對象不計入徽章
    const unseen = items.filter((i) => !i.seen && muted.indexOf(refKey(i.ref)) < 0).length;

    const toggleMute = React.useCallback((ref) => {
      const k = refKey(ref);
      if (!k) return;
      setMuted((m) => {
        const next = m.indexOf(k) >= 0 ? m.filter((x) => x !== k) : [...m, k];
        writeState({ muted: next });
        return next;
      });
    }, [pid]);

    // ── IAM-UP-103 的原型示意 ────────────────────────────────────────────
    // ⚠️ 20 秒是原型隨手挑的，不是規格值。
    // 正典寫的是平常 60 秒、災害啟動期間 15~30 秒，但 Open decision Q2 未解：
    // 沒有任何定義說明什麼算「災害啟動」，ERD 也沒有欄位可判斷。
    // 這裡只是讓徽章會動，實際間隔請等 Q2 決議，不要照抄這個數字。
    const PROTOTYPE_POLL_MS = 20000;
    React.useEffect(() => {
      const timer = window.setInterval(() => {
        let changed = false;
        setAll((prev) => {
          const mine = prev.filter((i) => !pid || i.to.indexOf(pid) >= 0);

          // 一半機率讓既有任務通知多聚合一則（IAM-UP-106）
          const task = mine.find((i) => i.type === "task" && muted.indexOf(refKey(i.ref)) < 0);
          if (task && Math.random() < 0.5) {
            changed = true;
            return prev.map((i) => i.id === task.id
              ? { ...i, count: i.count + 1, ts: Date.now(), seen: false, detail: "現場回報有更新" }
              : i);
          }

          // 否則長出新的一則。一律指向現有測試任務單，不自己編號碼。
          // 已在清單裡的、以及已關閉通知的，都不再挑。
          const used = mine.map((i) => i.ref && i.ref.kind === "ticket" ? i.ref.id : null);
          const pool = ticketPool().filter((t) =>
            used.indexOf(t.id) < 0 && muted.indexOf("ticket:" + t.id) < 0);
          if (!pool.length) return prev;          // 沒得挑就什麼都不做

          const pick = pool[Math.floor(Math.random() * pool.length)];
          changed = true;
          return [{
            id: "n" + Date.now(), type: "task", to: pid ? [pid] : [],
            summary: pick.title, detail: "有新的現場回報",
            count: 1, ts: Date.now(), seen: false, read: false,
            target: "任務單 #" + pick.id, ref: { kind: "ticket", id: pick.id },
          }, ...prev];
        });
        if (changed) { setNudge(true); window.setTimeout(() => setNudge(false), 700); }
      }, PROTOTYPE_POLL_MS);
      return () => window.clearInterval(timer);
    }, [pid, muted]);

    // IAM-UP-104：開清單 → 清徽章（seen），但 read 一律不動
    function openDrawer() {
      setAll((prev) => {
        const next = prev.map((i) => (!pid || i.to.indexOf(pid) >= 0) ? { ...i, seen: true } : i);
        writeState({ seen: next.filter((i) => i.seen).map((i) => i.id) });
        return next;
      });
      setOpen(true);
    }
    // IAM-UP-105：只有這兩個動作會改 read
    const persistRead = (next) => { writeState({ read: next.filter((i) => i.read).map((i) => i.id) }); return next; };
    const markRead = (id) => setAll((prev) => persistRead(prev.map((i) => i.id === id ? { ...i, read: true } : i)));
    const markAllRead = () => setAll((prev) => persistRead(prev.map((i) => (!pid || i.to.indexOf(pid) >= 0) ? { ...i, read: true } : i)));

    return (
      <React.Fragment>
        <button type="button" onClick={openDrawer} aria-label={unseen ? `通知，${unseen} 則未讀` : "通知"}
          title="通知"
          style={{ position: "relative", border: "none", background: "transparent", cursor: "pointer", lineHeight: 0, padding: 4, borderRadius: "var(--radius-sm)" }}>
          <span style={{ display: "inline-flex", animation: nudge ? "wgBellNudge 0.6s ease" : "none" }}>
            <Icon n="Bell" s={22} c="var(--color-fg-neutral-subtle)" />
          </span>
          {unseen > 0 && (
            <span style={{ position: "absolute", top: -1, right: -3, minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)",
              background: "var(--color-bg-danger)", color: "#fff", font: "var(--font-data-300)", fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-bg-neutral-default)" }}>
              {unseen > 99 ? "99+" : unseen}
            </span>
          )}
        </button>

        {open && (
          <WGNotifyDrawer items={items} muted={muted}
            onMarkRead={markRead} onMarkAllRead={markAllRead} onToggleMute={toggleMute}
            onClose={() => setOpen(false)} />
        )}
      </React.Fragment>
    );
  }

  // 落地頁載入時消化一次 #open=，讓跨頁的 deep-link 真的開到東西
  if (document.readyState === "complete") notifyConsumeHash();
  else window.addEventListener("load", () => notifyConsumeHash());

  Object.assign(window, {
    WGNotifyBell, WGNotifyDrawer, WG_NOTIFY_TYPES: TYPES,
    wgNotifyGo: notifyGo, wgNotifyConsumeHash: notifyConsumeHash,
  });
})();
