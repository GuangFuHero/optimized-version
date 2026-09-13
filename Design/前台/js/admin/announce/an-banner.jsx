// an-banner.jsx — 全站橫幅（EA-FEAT-001 的核心元件）
//
// 這一支被**每一個頁面**載入，掛在 wg-shell.jsx（後台六頁）與
// site-shell.jsx（前台）的最頂部 —— EA-AB-141「該頻道每一頁的最頂部」
// 是字面意思，不是只有公告管理頁看得到。
//
// 設計上的四件事，每一件都對應一條規則，改之前先看規則：
//   EA-AB-142  只有一種視覺。裁示 D-1 不分級 —— 沒有 severity prop，不要加。
//   EA-AB-144  固定一行高。這是「不可關」（EA-AB-146）成立的前提。
//   EA-AB-146  沒有關閉鈕。使用者關不掉，只有發布者能關。
//   EA-AB-172  role="alert" + aria-live="assertive"。看不見的人不能只靠顏色知道。
(function () {
  const Icon = window.WGIcon;

  const BAR = {
    display: "flex", alignItems: "center", gap: 10,
    minHeight: 40, height: 40,                    // EA-AB-144：固定一行，不長高
    padding: "0 16px", boxSizing: "border-box",
    background: "var(--color-bg-danger)",
    color: "var(--color-fg-on-danger, #fff)",
    // EA-AB-173：對比度。實心紅底配白字約 5.9:1
    font: "var(--font-label-400)",
    flexShrink: 0,
  };

  /** 單純的一條橫幅外觀。草稿預覽（EA-AB-154）與正式顯示共用同一支，
   *  所以預覽看到的就是最終外觀，不是文字方塊的回放。 */
  function AnnounceBar({ text, extra, muted }) {
    return (
      <div style={{ ...BAR, opacity: muted ? 0.65 : 1 }}>
        <Icon n="Megaphone" s={17} c="currentColor" style={{ flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",  // EA-AB-144
          fontWeight: 700, fontSize: 14, lineHeight: "40px",                   // EA-AB-171：不小於 13px
        }}>{text}</span>
        {extra}
      </div>
    );
  }

  /** 掛在 shell 最頂部的實際橫幅。
   *  realm: "site" | "admin"（EA-AB-132：兩個頻道互不出現在對方那邊） */
  function WGAnnounceBanner({ realm }) {
    const [list, setList] = React.useState(() => (window.anActive ? window.anActive(realm) : []));
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
      if (!window.anSubscribe) return;
      const refresh = () => setList(window.anActive(realm));
      const off = window.anSubscribe(refresh);          // 關閉即刻生效（EA-AB-151）
      const tick = setInterval(() => { window.anPrune(); refresh(); }, 1000);  // 到期（EA-AB-152）
      refresh();
      return () => { off(); clearInterval(tick); };
    }, [realm]);

    React.useEffect(() => { if (list.length < 2) setOpen(false); }, [list.length]);

    /* ── 把橫幅高度發布成 CSS 變數 `--wg-banner-h` ────────────────────────
     *
     * 🔴 2026-09-10 回報：「緊急公告會擋住漢堡列表」「點開任務單跟站點，
     *    應該不能蓋過緊急公告」。
     *
     * 兩個症狀是同一件事的兩面：所有全螢幕浮層都是 `position:fixed; inset:0`，
     * 也就是**從視窗最頂端**開始 —— 橫幅在流裡佔的那 40px 它們完全不知道。
     * 於是 z-index 比橫幅低的（漢堡抽屜 z:90）被橫幅蓋住標題列，
     * 比橫幅高的（通知 z:2000、篩選 z:2200）則反過來把橫幅蓋掉。
     *
     * 🔒 定調：**緊急公告永遠看得見，任何浮層都不蓋它、也不被它蓋。**
     *    災害中它是最高優先的資訊 —— 一個正在讀任務單的人，
     *    最不該錯過的就是「這一區要撤離」。
     *
     * 做法是讓橫幅把自己的實際高度寫成 CSS 變數，浮層用
     * `top: var(--wg-banner-h, 0px)` 取代 `inset: 0`。
     * 為什麼不寫死 40：它會長高（「另有 N 則」展開時每則 +34），
     * 寫死的數字在展開的當下就錯了。 */
    const barRef = React.useRef(null);
    React.useEffect(() => {
      const root = document.documentElement;
      const write = () => {
        const h = (list.length && barRef.current) ? barRef.current.offsetHeight : 0;
        root.style.setProperty('--wg-banner-h', h + 'px');
      };
      write();
      const ro = (typeof ResizeObserver !== 'undefined' && barRef.current)
        ? new ResizeObserver(write) : null;
      if (ro && barRef.current) ro.observe(barRef.current);
      window.addEventListener('resize', write);
      return () => {
        if (ro) ro.disconnect();
        window.removeEventListener('resize', write);
        /* 卸載（或公告被關掉）時一定要歸零 —— 留著舊值會讓浮層永遠空一條。 */
        root.style.setProperty('--wg-banner-h', '0px');
      };
    }, [list.length, open]);

    if (!list.length) return null;

    const [head, ...rest] = list;

    return (
      // EA-AB-141：在導覽列與側邊欄之上。EA-AB-145：它是 flex 的一列，
      // 出現與消失只影響版面高度，不動內容區自己的捲動位置。
      /* 🔒 z-index 維持 300，**不要為了「蓋過浮層」把它調高**。
         浮層改成 `top: var(--wg-banner-h)` 之後，那 40px 根本沒有東西壓上來，
         橫幅自然看得見 —— 不需要靠 z-index 去贏。
         而且後台有十幾個 `inset: 0` 的抽屜與對話框（z 400〜1000），
         把橫幅調到它們之上會反過來蓋住它們的標題與關閉鈕，
         正是這次要修的那個 bug，只是換到後台發生。 */
      <div ref={barRef} role="alert" aria-live="assertive" style={{ flexShrink: 0, position: "relative", zIndex: 300 }}>
        <AnnounceBar
          text={head.text}
          extra={rest.length ? (
            // EA-AB-143：主位一則，其餘收成「另有 N 則」
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              style={{ flexShrink: 0, border: "1px solid rgba(255,255,255,.55)", background: "transparent",
                color: "inherit", font: "var(--font-label-400)", fontSize: 12, height: 24, padding: "0 10px",
                borderRadius: "var(--radius-full)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              另有 {rest.length} 則
              <Icon n={open ? "ChevronUp" : "ChevronDown"} s={13} c="currentColor" />
            </button>
          ) : null}
        />
        {/* EA-AB-146：這裡刻意沒有 ✕。使用者關不掉，只有發布者能關。 */}
        {open && rest.map((a) => (
          <div key={a.id} style={{ ...BAR, height: 34, minHeight: 34, background: "var(--color-bg-danger)",
            borderTop: "1px solid rgba(255,255,255,.25)" }}>
            <span style={{ width: 17, flexShrink: 0 }}></span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              fontSize: 13, lineHeight: "34px" }}>{a.text}</span>
          </div>
        ))}
      </div>
    );
  }

  Object.assign(window, { WGAnnounceBanner, WGAnnounceBar: AnnounceBar });
})();
