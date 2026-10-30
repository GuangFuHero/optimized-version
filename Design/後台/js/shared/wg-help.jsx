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
      what: "藉由儀表板綜觀任務需求、志工媒合、資源站點的數量、類型及趨勢變化，了解即時熱點及尚需協助的區域。",
    },
    map: {
      title: "互助地圖",
      // 2026-10-31 對齊 Notion「這一頁怎麼用」（Notion 為準）；**包起來的字會變粗體
      what: "政府及專案管理員可於地圖劃分及指派以組織為單位的援救區域，劃分或指派後，使用者前台地圖將同步顯示，知會災害範圍民眾危險區、組織負責區，以及特別標示區。",
      sections: [{
        title: "區域標示定義",
        items: [
          "危險區：以橘白斜紋**顯示於前後台所有地圖**，提醒災害範圍內非相關人員禁止進入，例：施工區、大體挖掘區、河堤潰口等。",
          "責任區：以組織為單位，政府可分派任務區域，劃分該區內的所有援救任務單會隸屬一單位統一處理，**指派後民眾使用者端即會顯示組織名稱，並自動完成媒合**；被指派的負責組織可在「任務管理」頁面中篩選組織，即會出現區域內的任務。",
          "標示區：非指派區域及危險區域，標示區域範圍後也**可選擇「前台可見」**決定是否顯示民眾使用者前台公開。例如志工休息區、集合點",
        ],
      }],
      note: "僅超級管理員及政府單位管理員，可編輯互助地圖內的圈選劃分，區域成立後若需要取消，請回到此分頁進行區域刪除（刪除後系統操作仍會有歷史紀錄，未來仍可做科研用途查閱紀錄）",
    },
    ticket: {
      title: "任務管理",
      what: "所有求助任務單都在這裡，以同一地址為單位，每一地址可有多重任務、類型跟各任務狀態。",
      can: ["查看、搜尋、篩選任務單", "建立任務單，或處理民眾從前台送來的求助", "把任務指派給團隊或志工，並更新進度"],
      // 2026-09-27 Sucre：加「直立地圖」介紹與 RBAC。直立地圖已於 09-25 改名為「現場分區」，畫面用新名稱。
      sections: [{
        // 2026-10-15 Sucre：後台改叫「新增地點」；前台仍叫「現場分區」。
        title: "開啟空間",
        // 2026-10-26：改名「開啟空間」；空間跟任務單一樣出現在列表與地圖上（BE-036）
        body: "同一棟大樓裡有很多人需要幫忙時，按工具列的「開啟空間」：在地圖上點那棟建築（地址會自動帶出），填名稱與地上、地下幾層，每棟會自動加上頂樓 RF。開好之後，這個空間會跟任務單一起出現在列表與地圖上（方形圖釘）；點開可以看各樓層哪幾層還需要幫忙，也可以編輯名稱、地址、樓層數或刪除（刪除不會刪掉底下的任務單）。任務單的樓層寫 RF 或「頂樓」都會歸到頂樓。",
      }],
      // 依 tk-app.jsx 的 PERMS 與 canWriteTicket 整理
      roles: [
        ["超級管理員", "全部功能，包含刪除任務單、升為生命危急、開啟空間"],
        ["政府", "建立任務單、指派給團隊、開啟空間"],
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
        "設定地圖預設位置：前台與後台的地圖第一次打開就停在災區，之後停在每個人自己上次看的地方（沒設定會顯示全台）",
        "遇到清單裡沒有的災害，新增一種災害類型",
        "幫每種災害、需求、站點加上要多問的欄位",
      ],
      note: "所有後台人員都看得到這一頁，只有超級管理員可以修改。改了之後所有人的表單都會跟著變。",
    },
    dedup: {
      title: "重複審核",
      // 2026-10-31 Carol 改稿：用 A 單、B 單、預覽單；操作方式；已承接的志工與跨單位合成一句「合併規則」
      what: "系統提示兩張任務單或站點疑似重複內容，集中在這裡判斷要不要合併。",
      canTitle: "操作方式",
      can: [
        "點一對進比對畫面：例如 A 單、B 單並排，點 A 單的特定欄位，就能把欄位值放進預覽單；預覽單即合併成功後的任務單，欄位內容不只可擇一，也可直接編輯；沒勾選的其他需求與照片不會併入預覽單，請務必重複確認欄位資訊。",
        "按「合併」後可再行確認，送出後不能復原、不能拆回，變更紀錄將記在系統內可供閱覽。",
        // 以下一條是核對畫面後補的（Carol 稿沒有）：站點這一版不能合併
        "站點這一版還不能合併，只能記下「確認重複」或「不是重複」。",
      ],
      sections: [
        { title: "合併規則", body: "需求數量不得少於已承接的志工數量。合併成功後雙方開單者、承接志工皆會收到通知。" },
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
        "需要幫忙時，按「請求協助」；也可以先點地圖上的位置，再按「在這裡新增」",
        "登入後可以承接任務，或對站點提出修改建議",
      ],
      note: "沒有登入時，任務的位置會用格子顯示，也看不到地址與照片，保護求助者的隱私。",
    },
    "site:list": {
      title: "列表",
      what: "用清單的方式看資源站點與求助任務，適合搜尋與比較。",
      can: ["搜尋、篩選站點或任務", "點一筆看詳細資訊", "登入後可以承接任務，或對站點提出修改建議"],
      note: "沒有登入時，看不到任務的地址與照片，保護求助者的隱私。",
    },
    "site:brief": {
      title: "志工行前資訊",
      what: "出發當志工之前，先看這一頁。",
      can: ["了解怎麼參與、交通方式與注意事項", "勾選打包清單（只存在這台裝置）", "列印帶在身上"],
    },
  };

  // **粗體** 的簡單解析（不用物件 rest，見下方 _excluded 的說明）
  function rich(t) { return String(t).split("**").map((x, i) => (i % 2 ? <strong key={i}>{x}</strong> : x)); }

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
      const w = WG_PAGE_HELP[pageKey] && (WG_PAGE_HELP[pageKey].roles || (WG_PAGE_HELP[pageKey].sections || []).some((x) => x.items)) ? 400 : 340;
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
            <p style={{ margin: "10px 0 0", font: "var(--font-body-300)", fontSize: 14, lineHeight: 1.7, color: "var(--color-fg-neutral-default)" }}>{rich(help.what)}</p>
            {help.can && help.can.length > 0 && (
              <>
                <div style={{ marginTop: 12, font: "var(--font-label-300)", fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{help.canTitle || "你可以"}</div>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--font-body-300)", fontSize: 14, lineHeight: 1.75, color: "var(--color-fg-neutral-subtle)" }}>
                  {help.can.map((c) => <li key={c}>{rich(c)}</li>)}
                </ul>
              </>
            )}
            {(help.sections || []).map((sec) => (
              <div key={sec.title} style={{ marginTop: 12 }}>
                <div style={{ font: "var(--font-label-300)", fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{sec.title}</div>
                {sec.body && <p style={{ margin: "6px 0 0", font: "var(--font-body-300)", fontSize: 14, lineHeight: 1.75, color: "var(--color-fg-neutral-subtle)" }}>{rich(sec.body)}</p>}
                {sec.items && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--font-body-300)", fontSize: 14, lineHeight: 1.75, color: "var(--color-fg-neutral-subtle)" }}>
                    {sec.items.map((it) => <li key={it}>{rich(it)}</li>)}
                  </ul>
                )}
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
                {rich(help.note)}
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
