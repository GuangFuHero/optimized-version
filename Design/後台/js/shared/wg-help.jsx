/* wg-help.jsx — 每一頁標題旁的「？」：這一頁是做什麼的（前後台共用）
 *
 * 🔴 2026-09-27 Sucre：「有沒有個地方放問號或是驚嘆號，或是哪裡 hover 可以介紹這個頁面的功能？
 *    其實我是希望每個頁面都有。」
 *
 * 設計（我定的，未經裁示）：
 *   - **用「？」不用「！」**：驚嘆號在這個平台已經是警示的意思（緊急公告、危險區），
 *     拿來放說明會讓人以為出事了。
 *   - **點開，不是只有 hover**：手機沒有 hover；hover 只給一行「這一頁怎麼用」的提示，
 *     真正的內容點了才出來，Esc 或點外面關掉。
 *   - **第一次來的頁面，問號旁邊有一個小橘點**，打開過一次就消失（存在這台裝置）。
 *     很久才用一次的人，最需要被提醒「這裡有說明」。
 *   - **內容集中在本檔 `WG_PAGE_HELP`** —— 一頁一段，格式固定：一句話、你可以做的事、注意。
 *     不散在各頁程式裡，之後要改字只改這裡。
 *
 * 🚨 下面每一段說明文字都是我依原型現況寫的草稿，**沒有經過裁示**，請逐頁複核。
 */
(function () {
  // WGIcon 在前台由 site-shell 之後才定義 —— 用到時才讀，不在載入時抓

  const WG_PAGE_HELP = {
    // ── 後台（key＝nav.js 的導覽 id）──────────────────────────────────────
    dashboard: {
      title: "總覽儀表板",
      what: "一眼看這次災害應變的整體狀況。",
      can: ["看任務單、志工、資源站點的數量與變化", "找出需求最多、還沒有人處理的地方"],
    },
    map: {
      title: "互助地圖",
      what: "在地圖上圈出區域，讓大家知道哪裡危險、哪一區由誰負責。",
      can: [
        "危險區：用橘白斜紋提醒大家不要進入",
        "責任區：把一區交給一個單位，區內的任務單會一起指派給他",
        "標示區：只標出位置，例如志工休息區、集合點",
        "打開「前台可見」，民眾與志工在前台地圖也看得到",
      ],
      note: "只有超級管理員與政府可以圈選與指派。做錯了，5 秒內可以按「復原」。",
    },
    ticket: {
      title: "任務管理",
      what: "所有求助任務單都在這裡：誰需要什麼、誰去處理、處理到哪裡。",
      can: ["查看、搜尋、篩選任務單", "建立任務單，或處理民眾從前台送來的求助", "把任務指派給團隊或志工，並更新進度"],
      // 2026-09-27 Sucre：加「直立地圖」介紹與 RBAC。直立地圖已於 09-25 改名為「現場分區」，畫面用新名稱。
      sections: [{
        title: "現場分區",
        body: "同一個地址裡有很多人需要幫忙時（例如大樓、火車車廂），可以幫這個地址開「現場分區」，切成樓層、車廂或自訂的分區。開了之後，前台點這個地址會依分區（例如 1F、2F、第一節車廂）列出每一區的求助，民眾也能直接在某一區送出求助。",
      }],
      // 依 tk-app.jsx 的 PERMS 與 canWriteTicket 整理
      roles: [
        ["超級管理員", "全部功能，包含刪除任務單、升為生命危急、開現場分區"],
        ["政府", "建立任務單、指派給團隊、開現場分區"],
        ["團隊管理員", "建立任務單、把自己團隊的任務指派給隊員"],
        ["團隊成員", "建立任務單、更新自己團隊任務的進度"],
        ["資料檢核員", "查看任務單，檢核有爭議的內容"],
      ],
      note: "團隊的人只能修改自己團隊與還沒指派的任務單，其他團隊的只能看。",
    },
    station: {
      title: "資源站點管理",
      what: "管理加水、避難、醫療、物資等資源站點。",
      can: ["新增或修改站點資料", "審核民眾從前台送來的修改建議", "把站點指派給團隊負責", "用表格或地圖檢視，也可以匯入、匯出"],
      // 2026-09-27 Sucre：加 RBAC 與個別指派
      sections: [{
        title: "個別指派",
        body: "站點是一個一個指派給團隊的：在列表的「指派 Team」欄直接選，不用在地圖上圈選。指派之後，那個團隊就能修改這個站點、處理它的修改建議。站點不會因為位在互助地圖的責任區裡，就自動歸給那個團隊。",
      }],
      // 依 station-v2/station-shared.jsx 的 caps() 與 canHandleStation 整理
      roles: [
        ["超級管理員", "全部功能，包含下架站點、還原舊資料、合併重複站點"],
        ["政府", "指派站點給團隊、匯入站點、核可修改建議（不能退回）"],
        ["團隊管理員／成員", "新增站點；修改與審核指派給自己團隊的站點"],
        ["資料檢核員", "審核修改建議、合併重複站點"],
      ],
      note: "所有人都可以查看與匯出站點。",
    },
    announce: {
      title: "緊急公告",
      what: "發布會出現在每一頁最上方的紅色公告。",
      can: ["分別對前台（民眾與志工）或後台發布", "隨時關閉公告", "查看以前發過的公告"],
      note: "只有超級管理員與政府可以發布。公告沒有關閉鈕，發出去所有人都會看到，請確認內容再送出。",
    },
    brief: {
      title: "志工行前資訊",
      what: "志工出發前要看的內容：怎麼參與、怎麼到、要帶什麼、要注意什麼。",
      can: ["從範本開始編寫", "發布到前台，或從前台下架", "查看以前發布過的版本"],
      note: "前台一次只會有一份。發布新版本會直接取代舊的。",
    },
    // 2026-10-05：設定頁落地（原本是佔位頁，不放問號）
    settings: {
      title: "設定",
      what: "這次災害的基本資料、災害類型、表單要多問哪些題目，都在這一頁改。",
      can: [
        "改災害名稱與起始時間，選這次用到哪幾種災害",
        "遇到清單裡沒有的災害，新增一種災害類型",
        "幫每種災害、需求、站點加上要多問的欄位",
      ],
      note: "所有後台人員都看得到這一頁，只有超級管理員可以修改。改了之後所有人的表單都會跟著變。",
    },
    dedup: {
      title: "AI 重複審核",
      what: "系統發現可能重複的任務需求或站點，集中在這裡判斷要合併還是保留。",
      can: [
        "左邊選一組「同案」，右邊逐欄比對，挑要留下哪一筆的值",
        "按「合併」保留一筆、取消其他；按「不是重複」以後就不再提示",
        "合併後五秒內可以復原，之後不能拆回，但會留在兩邊的變更紀錄",
      ],
      sections: [
        { title: "任務單的最小單位是需求", body: "合併取消的是重複的那一筆需求。如果那張單沒有其他需求了，會自動結案「已併入其他單」並通知擁有者。" },
        { title: "跨單位的同案", body: "團隊管理員只能處理全部屬於自己團隊的同案；含有別隊或未指派單位的，由資料檢核員或超級管理員處理。" },
      ],
      note: "「可能重複」是系統依距離、時間、需求種類與文字算出來的建議，會判錯，請以實際內容為準。",
    },
    teams: {
      title: "團隊",
      what: "平台上所有參與救災的團隊（政府與非政府組織）。",
      can: ["查看各團隊與聯絡人", "如果你是團隊管理員，可以管理自己團隊的成員"],
    },
    members: {
      title: "成員與權限",
      what: "管理平台上所有人的帳號與角色。",
      can: ["查看與調整每個人的角色", "審核升級成後台人員的申請"],
      note: "只有超級管理員看得到這一頁。",
    },
    // audit／settings 目前是佔位頁，沒有功能可說明 —— 刻意不放，頁面上就不出現問號
    // ── 前台（key＝site:<module>）──────────────────────────────────────────
    "site:map": {
      title: "地圖",
      what: "看附近有哪些資源站點，以及哪裡有人需要幫忙。",
      can: [
        "切換「站點」與「任務」，點圖示看詳細資訊",
        "需要幫忙時，按「請求協助」",
        "登入後可以承接任務，或回報站點資訊有誤",
      ],
      note: "沒有登入時，任務的位置會用格子顯示，保護求助者的隱私。",
    },
    "site:list": {
      title: "列表",
      what: "用清單的方式看資源站點與求助任務，適合搜尋與比較。",
      can: ["搜尋、篩選站點或任務", "點一筆看詳細資訊", "登入後可以承接任務"],
    },
    "site:brief": {
      title: "志工行前資訊",
      what: "出發當志工之前，先看這一頁。",
      can: ["了解怎麼參與、交通方式與注意事項", "勾選打包清單（只存在這台裝置）", "列印帶在身上"],
    },
  };

  const SEEN_KEY = "wg.help.seen";
  function readSeen() { try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function markSeen(k) { try { const s = readSeen(); s[k] = 1; window.localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) {} }

  /**
   * props
   *   pageKey   WG_PAGE_HELP 的鍵
   *   align     "left"（後台標題旁）| "right"（前台頂欄右側）
   *   size      按鈕大小（px），預設 28
   */
  function WGPageHelp({ pageKey, align = "left", size = 28, variant = "icon" }) {
    const Icon = window.WGIcon;
    const help = WG_PAGE_HELP[pageKey];
    const [open, setOpen] = React.useState(false);
    const [fresh, setFresh] = React.useState(() => !readSeen()[pageKey]);
    const wrapRef = React.useRef(null);
    const btnRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const [pos, setPos] = React.useState(null);

    // 說明框用 portal 掛在 body、以按鈕位置算 fixed 座標 ——
    // 掛在頂欄裡會被頁面內容（例如地圖的篩選列、z-index 500）蓋住；
    // 前台頂欄上方還可能有緊急公告橫幅，寫死 top 會疊到頂欄。
    function place() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      if (vw < 768) { setPos({ top: 12, left: 12, right: 12, sheet: true }); return; }
      const w = WG_PAGE_HELP[pageKey] && WG_PAGE_HELP[pageKey].roles ? 400 : 340;
      let left = align === "right" ? r.right - w : r.left - 8;
      left = Math.max(12, Math.min(left, vw - w - 12));
      setPos({ top: r.bottom + 8, left, width: w });
    }

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
      const onDown = (e) => {
        if (wrapRef.current && wrapRef.current.contains(e.target)) return;
        if (panelRef.current && panelRef.current.contains(e.target)) return;
        setOpen(false);
      };
      const onResize = () => place();
      window.addEventListener("keydown", onKey, true);
      document.addEventListener("mousedown", onDown);
      window.addEventListener("resize", onResize);
      return () => { window.removeEventListener("keydown", onKey, true); document.removeEventListener("mousedown", onDown); window.removeEventListener("resize", onResize); };
    }, [open]);

    if (!help) return null;

    function toggle() {
      place();
      setOpen((v) => !v);
      if (fresh) { markSeen(pageKey); setFresh(false); }
    }

    // ⚠️ 不用物件 rest（{ sheet, ...xy }）：Babel standalone 會在全域宣告 `_excluded`，
    //    跟其他 text/babel 腳本撞名，整頁白掉（2026-09-27 實測）。
    const sheet = !!(pos && pos.sheet);
    const panelPos = pos ? { position: "fixed", top: pos.top, left: pos.left, right: pos.right, width: pos.width,
      maxHeight: `calc(100vh - ${pos.top + 16}px)`, overflowY: "auto" } : { position: "fixed" };

    return (
      <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
        {variant === "row" ? (
          <button ref={btnRef} type="button" onClick={toggle} aria-expanded={open} aria-haspopup="dialog"
            aria-label={`這一頁怎麼用：${help.title}`} className="wg-help-btn"
            style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 44,
              padding: "0 12px", border: "none", borderRadius: "var(--radius-md, 8px)", cursor: "pointer", textAlign: "left",
              background: "transparent", color: "var(--color-fg-neutral-default)", font: "var(--font-label-400)" }}>
            <Icon n="CircleHelp" s={22} />
            <span>這一頁怎麼用</span>
            {fresh && <span aria-hidden="true" className="wg-help-dot" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--color-bg-primary)" }}></span>}
          </button>
        ) : (
        <button ref={btnRef} type="button" onClick={toggle} aria-expanded={open} aria-haspopup="dialog"
          aria-label={`這一頁怎麼用：${help.title}`} title="這一頁怎麼用"
          className="wg-help-btn"
          style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "none", borderRadius: 999, cursor: "pointer",
            background: open ? "var(--color-bg-primary-subtle)" : "transparent",
            color: open ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-muted)" }}>
          <Icon n="CircleHelp" s={Math.round(size * 0.72)} />
          {fresh && (
            <span aria-hidden="true" className="wg-help-dot" style={{ position: "absolute", top: 1, right: 1, width: 8, height: 8, borderRadius: 999,
              background: "var(--color-bg-primary)", boxShadow: "0 0 0 2px var(--color-bg-neutral-default)" }}></span>
          )}
        </button>
        )}
        {open && pos && sheet && ReactDOM.createPortal(
          <div aria-hidden="true" onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 1999, background: "rgba(15,23,42,.35)" }}></div>,
          document.body
        )}
        {open && pos && ReactDOM.createPortal(
          <div ref={panelRef} role="dialog" aria-label={`${help.title}：這一頁怎麼用`}
            style={{ ...panelPos, zIndex: 2000, padding: "16px 18px", borderRadius: "var(--radius-lg, 12px)",
              background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)",
              boxShadow: "var(--shadow-lg, 0 12px 32px rgba(15,23,42,.18))", textAlign: "left", whiteSpace: "normal" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon n="CircleHelp" s={18} c="var(--color-brand-primary-default, #E3791E)" />
              <span style={{ font: "var(--font-label-500)", fontSize: 15, fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>
                {help.title}：這一頁怎麼用
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="關閉說明"
                style={{ marginLeft: "auto", width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: "none", background: "transparent", cursor: "pointer", color: "var(--color-fg-neutral-muted)", borderRadius: 6 }}>
                <Icon n="X" s={16} />
              </button>
            </div>
            <p style={{ margin: "10px 0 0", font: "var(--font-body-300)", fontSize: 14, lineHeight: 1.7, color: "var(--color-fg-neutral-default)" }}>{help.what}</p>
            {help.can && help.can.length > 0 && (
              <>
                <div style={{ marginTop: 12, font: "var(--font-label-300)", fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>你可以</div>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--font-body-300)", fontSize: 14, lineHeight: 1.75, color: "var(--color-fg-neutral-subtle)" }}>
                  {help.can.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </>
            )}
            {(help.sections || []).map((sec) => (
              <div key={sec.title} style={{ marginTop: 12 }}>
                <div style={{ font: "var(--font-label-300)", fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{sec.title}</div>
                <p style={{ margin: "6px 0 0", font: "var(--font-body-300)", fontSize: 14, lineHeight: 1.75, color: "var(--color-fg-neutral-subtle)" }}>{sec.body}</p>
              </div>
            ))}
            {help.roles && help.roles.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ font: "var(--font-label-300)", fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>誰可以做什麼</div>
                <dl style={{ margin: "6px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 6 }}>
                  {help.roles.map(([who, what]) => (
                    <React.Fragment key={who}>
                      <dt style={{ font: "var(--font-label-300)", fontWeight: 700, fontSize: 13, lineHeight: 1.65, color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap" }}>{who}</dt>
                      <dd style={{ margin: 0, font: "var(--font-body-300)", fontSize: 13, lineHeight: 1.65, color: "var(--color-fg-neutral-subtle)" }}>{what}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            )}
            {help.note && (
              <p style={{ margin: "12px 0 0", padding: "9px 11px", borderRadius: 8, background: "var(--color-bg-neutral-subtle)",
                font: "var(--font-body-300)", fontSize: 13, lineHeight: 1.65, color: "var(--color-fg-neutral-subtle)" }}>
                {help.note}
              </p>
            )}
          </div>,
          document.body
        )}
      </span>
    );
  }

  Object.assign(window, { WG_PAGE_HELP, WGPageHelp });
})();
