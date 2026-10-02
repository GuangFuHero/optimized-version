// vb-view.jsx — 已發布內容的呈現（VB-FEAT-001）
//
// 🔒 **後台預覽與前台實際頁面用的是同一支 `BriefingArticle`。**
//    表 23 的「確認無誤後發布」只有在預覽＝最終外觀時才成立；
//    另外刻一份預覽，等於讓人審一個不會上線的東西。
//    （同一條原則已用在緊急公告的 AnnounceBar，見 an-banner.jsx。）
(function () {
  const { Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // 富文字的排版規則放這裡，後台預覽與前台共用。只注入一次。
  const CSS_ID = "vb-rich-style";
  if (!document.getElementById(CSS_ID)) {
    const el = document.createElement("style");
    el.id = CSS_ID;
    el.textContent = `
.vb-rich { font: var(--font-body-400); font-size: 15px; line-height: 1.85; color: var(--color-fg-neutral-default); word-break: break-word; }
.vb-rich > :first-child { margin-top: 0; }
.vb-rich > :last-child { margin-bottom: 0; }
.vb-rich p { margin: 0 0 10px; }
/* 🔒 2026-09-20：h2 是段落標題（Markdown 的兩個井字號）。09-20 之前那是系統畫的
   段落卡片標題（帶圖示的圓形徽章），現在它只是內容裡的一行字 ——
   所以份量要比 h3 明顯重，讀者才分得出「這是新的一段」還是「段裡的小節」。 */
.vb-rich h2 { font: var(--font-heading-700); font-size: 21px; line-height: 1.4; margin: 26px 0 10px;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  color: var(--color-fg-neutral-default); }
.vb-rich h2:first-child { margin-top: 0; }
.vb-changed { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 9px;
  border-radius: var(--radius-full); background: var(--color-bg-info-subtle); color: var(--color-fg-info);
  font: var(--font-label-400); font-size: 12px; font-weight: 700; }
.vb-rich h3 { font: var(--font-heading-600); font-size: 17px; line-height: 1.5; margin: 18px 0 8px; }
.vb-rich h4 { font: var(--font-heading-600); font-size: 15px; line-height: 1.5; margin: 14px 0 6px; }
.vb-rich strong, .vb-rich b { font-weight: 700; }
/* 清單縮排刻意留大一點：志工是在對照著打包，一項一項掃視要有明確的左緣 */
.vb-rich ul, .vb-rich ol { margin: 0 0 10px; padding-left: 22px; }
.vb-rich li { margin: 3px 0; }
.vb-rich a { color: var(--color-brand-secondary-subtle); text-decoration: underline; }
.vb-rich img { max-width: 100%; height: auto; border-radius: var(--radius-md); margin: 8px 0; display: block; }
.vb-rich blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--color-border-default);
  background: var(--color-bg-neutral-subtle); border-radius: 0 var(--radius-md) var(--radius-md) 0; }
.vb-rich hr { border: 0; border-top: 1px solid var(--color-border-default); margin: 16px 0; }

/* ── 裝備清單的勾選（2026-09-19 裁示）──────────────────────────────────
   一列一項。**命中區 44px**（沿用 2026-09-05 的密度基準：現場戴手套、在晃動的車上），
   視覺上的方框 20px —— 同「承接鈕視覺 32／命中區 44」的做法。 */
/* 可勾的 li：拿掉項目符號（框本身已經是那一列的標記），並把縮排還回去。
   沒標記的 li 不受影響 —— 同一張清單裡混著兩種時，編號與縮排都不會跑掉。 */
.vb-rich li.vb-check-li { list-style: none; margin-left: -1.15em; }

/* 🔒 2026-09-20：**編輯區要跟前台長一樣。**
   標成可勾項目之後，作者在編輯區必須當場看得出來哪幾行被標了 ——
   否則唯一的回饋是工具列那顆按鈕的按下狀態，那等於沒有回饋，
   而「我到底標了沒」是他每標一項都要問一次的問題。
   🔴 前台畫的是真的 <input>，**編輯區不能放** —— contentEditable 裡的表單元件
      會被游標、選取與 execCommand 弄壞（刪不掉、選不到、複製貼上會帶走）。
      所以這裡用 ::before 畫一個**度量完全相同**的空心方框：
      20px、圓角 5、1.5px 邊、對齊第一行文字的中心（VB-BR-192a 同一條算式）。
   ⚠️ 選擇器是 li[data-check]，只會命中**原始 HTML**；前台那條路徑重建成
      li.vb-check-li 且不帶這個屬性，所以不會畫兩個框。 */
.vb-rich li[data-check] {
  list-style: none; margin-left: -1.15em;
  display: flex; gap: 10px; align-items: flex-start;
  min-height: 44px; padding: 10px 0;
}
.vb-rich li[data-check]::before {
  content: ""; flex: 0 0 auto; width: 20px; height: 20px; border-radius: 5px;
  border: 1.5px solid var(--color-border-default);
  background: var(--color-bg-neutral-default);
  font: inherit; margin-top: calc((1.85em - 20px) / 2);
}
.vb-check { display: flex; gap: 10px; align-items: flex-start; min-height: 44px; cursor: pointer; }
.vb-check input {
  appearance: none; -webkit-appearance: none; margin: 0; flex: 0 0 auto;
  width: 20px; height: 20px; border-radius: 5px;
  border: 1.5px solid var(--color-border-default); background: var(--color-bg-neutral-default);
  cursor: pointer; position: relative;
  /* 🔒 對齊**第一行文字的中心**，不要用寫死的數字。
     input 預設不繼承字級，所以先 font: inherit，1.85em 才算得出行高（15px × 1.85 = 27.75px）。
     位移 = 文字的上內距 + (行高 − 方框高) / 2。
     原本寫死 margin-top:11px，跟第一行中心差約 3px —— 單行看得出歪，多行更明顯。 */
  font: inherit;
  margin-top: calc(10px + (1.85em - 20px) / 2);
}
.vb-check input:checked { background: var(--color-brand-secondary-default); border-color: var(--color-brand-secondary-default); }
.vb-check input:checked::after {
  content: ""; position: absolute; left: 6px; top: 2px; width: 4px; height: 9px;
  border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
}
.vb-check input:focus-visible { outline: 3px solid var(--color-brand-secondary-default); outline-offset: 2px; }
.vb-check input:disabled { cursor: default; }   /* 後台預覽：看得到框但不可勾，不要畫成灰的 */
.vb-check__t { flex: 1; min-width: 0; padding: 10px 0; }
/* 勾掉的變淡而**不畫刪除線** —— 項目常有兩三行的「較佳／避免」，整塊劃掉很難讀。
   掃視「還沒打包的」靠的是深色那幾列。 */
.vb-check input:checked ~ .vb-check__t { opacity: .45; }
.vb-check__t > :first-child { margin-top: 0; }
.vb-check__t > :last-child { margin-bottom: 0; }

/* 段內錨點（取代「交通分頁」，2026-09-19 裁示）。
   內容全部攤開，這一列只是讓人跳著看 —— 不是分頁，不會藏東西。 */
.vb-jump { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
.vb-jump a {
  display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px;
  border-radius: var(--radius-full); text-decoration: none;
  background: var(--color-bg-neutral-subtle); color: var(--color-fg-neutral-subtle);
  box-shadow: inset 0 0 0 1px var(--color-border-default);
  font: var(--font-label-400); font-size: 13px;
}
.vb-jump a:hover { color: var(--color-brand-secondary-subtle); text-decoration: none; }
.vb-rich h2[id], .vb-rich h3[id], .vb-check-group[id] { scroll-margin-top: 16px; }

/* ── 列印（2026-09-19 裁示：不做 PDF 產生器，用瀏覽器列印）──────────────
   做法：按下列印時 JS 複製一份文章到 .vb-print-sheet，列印時只顯示它。
   這樣不必去對抗外殼的 100dvh 與 overflow:hidden（那正是「只印得出一屏」的原因）。 */
.vb-print-sheet { display: none; }
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(.vb-print-sheet) { display: none !important; }
  .vb-print-sheet { display: block !important; }
  .vb-print-sheet .vb-rich { font-size: 11.5pt; line-height: 1.7; color: #000; }
  .vb-print-sheet h2 { font-size: 14pt; margin: 16pt 0 6pt; }
  .vb-print-sheet .vb-rich h2 { font-size: 14pt; margin: 14pt 0 6pt; break-after: avoid; }
  .vb-print-sheet .vb-rich h3 { font-size: 12pt; margin: 10pt 0 4pt; }
  .vb-print-sheet section { break-inside: auto; }
  .vb-print-sheet li.vb-check-li { list-style: none; margin-left: -1.15em; }
  .vb-print-sheet .vb-check { break-inside: avoid; min-height: 0; }
  .vb-print-sheet .vb-check__t { padding: 2pt 0; opacity: 1 !important; }
  /* 🔒 紙上一律印**空心方框**（裁示：打包時邊看邊手寫勾）。
     螢幕上勾到哪不該印出來 —— 印出來是要拿去重新核對的。
     （複製節點時 checked 是 property 不是 attribute，本來就不會被帶過去；
       這裡再用 CSS 保險一次。） */
  .vb-print-sheet .vb-check input {
    appearance: none; -webkit-appearance: none; width: 11pt; height: 11pt;
    border: 1pt solid #000 !important; border-radius: 1pt; background: #fff !important;
    /* 同上：紙上的行高是 1.7、字級 11.5pt，文字上內距 2pt */
    font: inherit; margin-top: calc(2pt + (1.7em - 11pt) / 2);
  }
  .vb-print-sheet .vb-check input::after { display: none !important; }
  /* 紙上點不了連結，把網址展開 */
  .vb-print-sheet .vb-rich a::after { content: " (" attr(href) ")"; font-size: 9pt; word-break: break-all; }
  .vb-print-sheet .vb-jump { display: none !important; }
  /* 抬頭已經寫了版本與最後更新，內文那一行會重複 */
  .vb-print-sheet [data-vb-stamp] { display: none !important; }
  /* 「這次更新」在紙上沒有意義 —— 讀者手上沒有上一版可以比 */
  .vb-print-sheet [data-vb-changed], .vb-print-sheet .vb-changed { display: none !important; }
  .vb-print-sheet img { max-width: 60mm; }
}
`;
    document.head.appendChild(el);
  }

  /** 一段清洗過的富文字。**所有**輸出路徑都要經過 vbSanitize，不要有例外。 */
  function RichText({ html }) {
    return <div className="vb-rich" dangerouslySetInnerHTML={{ __html: window.vbSanitize(html || "") }} />;
  }

  // ── 把一段富文字拆成「區塊」──────────────────────────────────────────────
  //
  // 🔒 **結構從內容的形狀推導，不新增欄位**（2026-09-19 的設計原則）：
  //      裝備段的 <li>  → 可勾的一列
  //      任何段的 <h3>  → 段內錨點
  //    後台不用學新東西，寫 li 就有框、寫 h3 就有錨點，
  //    而且「志工看到的樣子」預覽會馬上顯示效果。
  //
  // ⚠️ 只處理**最外層**的 ul/ol。巢狀清單留在項目內容裡當普通 HTML ——
  //    打包清單不會寫到三層，為那個情況做結構只會讓規則變難講。
  function parseBlocks(html) {
    const box = document.createElement("div");
    box.innerHTML = window.vbSanitize(html || "");
    return [...box.children].map((node) => {
      const tag = node.tagName.toUpperCase();
      if (tag === "UL" || tag === "OL") {
        return { kind: "list", ordered: tag === "OL", items: [...node.children]
          .filter((li) => li.tagName === "LI")
          .map((li) => ({
            html: li.innerHTML,
            text: (li.textContent || "").replace(/\s+/g, " ").trim(),
            // 🔒 作者標記的才可勾（2026-09-20）。沒標的 li 就是普通項目。
            check: li.hasAttribute("data-check"),
          })) };
      }
      return { kind: "html", tag, html: node.outerHTML, inner: node.innerHTML,
        text: (node.textContent || "").trim() };
    });
  }

  /** 這一段裡有沒有作者標記的可勾項目。 */
  function hasCheckable(blocks) {
    return blocks.some((b) => b.kind === "list" && b.items.some((it) => it.check));
  }

  // 🔄 2026-09-20：整份只有一塊內容，所以 id 不再帶段落 key。
  const slug = (level, i) => "vb-" + level + "-" + i;

  /** 段內錨點。**只有兩個以上的標題才出現** —— 一個標題的跳躍列是純噪音。 */
  function JumpBar({ heads }) {
    if (heads.length < 2) return null;
    return (
      <nav className="vb-jump" aria-label="章節">
        {heads.map((h) => (
          <a key={h.id} href={"#" + h.id}
            onClick={(e) => {
              // 不要動到網址列：這一頁的網址是要拿去轉貼的（VB-BR-164）
              e.preventDefault();
              const el = document.getElementById(h.id);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}>{h.text}</a>
        ))}
      </nav>
    );
  }

  /** 整篇內容。
   *
   *  🔒 2026-09-20 起**只有一塊內容**，`<h2>` 就是段落標題（Markdown 的 `##`）。
   *     沒有系統定義的段落了，所以這支同時負責：標題 id（錨點）、「這次更新」標記、
   *     以及把作者標記過的 `<li>` 變成可勾的一列。
   *
   *  🔴 **清單一律用原本的 ul／ol 輸出，而且只換掉被標記的那幾個 li 的內容。**
   *     09-19 那次把所有清單重建成 `<ul>`，「如何參與」的有序步驟就變成了項目符號 ——
   *     內容的意思被實作弄丟，而畫面上只差一點點。沒標記的 li 連結構都不動。 */
  function ArticleBody({ blocks, checkable, checked, onToggle, changedSet }) {
    let h2i = 0, h3i = 0;
    return (
      <div className="vb-rich" data-vb-body>
        {blocks.map((b, bi) => {
          if (b.kind === "html") {
            if (b.tag === "H2") {
              const id = slug("h2", h2i++);
              const marked = changedSet && changedSet.has(b.text);
              return (
                <h2 key={bi} id={id} data-vb-head={b.text}>
                  <span dangerouslySetInnerHTML={{ __html: b.inner }} />
                  {marked && (
                    /* 用資訊色不用警示色：內容更新是常態，不是警報。 */
                    <span data-vb-changed={b.text} className="vb-changed">
                      <Icon n="RefreshCw" s={11} c="currentColor" />這次更新
                    </span>
                  )}
                </h2>
              );
            }
            const el = document.createElement("div");
            el.innerHTML = b.html;
            if (b.tag === "H3" && el.firstElementChild) el.firstElementChild.id = slug("h3", h3i++);
            return <div key={bi} dangerouslySetInnerHTML={{ __html: el.innerHTML }} />;
          }
          const List = b.ordered ? "ol" : "ul";
          return (
            <List key={bi}>
              {b.items.map((it, ii) => {
                if (!it.check) return <li key={ii} dangerouslySetInnerHTML={{ __html: it.html }} />;
                const on = checked.has(it.text);
                return (
                  <li key={ii} className="vb-check-li">
                    <label className="vb-check" data-vb-item={it.text}>
                      <input type="checkbox" checked={on} disabled={!checkable}
                        aria-label={it.text} onChange={() => onToggle(it.text)} />
                      <span className="vb-check__t" dangerouslySetInnerHTML={{ __html: it.html }} />
                    </label>
                  </li>
                );
              })}
            </List>
          );
        })}
      </div>
    );
  }

  /** 整份內容裡所有被作者標記為可勾的項目文字，依出現順序。
   *  指紋與「已勾 N／M」的分母都取這一份，兩邊不可各算各的。 */
  window.vbCheckableTexts = function (content) {
    const out = [];
    parseBlocks(content || "").forEach((b) => {
      if (b.kind === "list") b.items.forEach((it) => { if (it.check) out.push(it.text); });
    });
    return out;
  };

  // ── 勾選狀態：**單一來源**（2026-09-19）────────────────────────────────
  //
  // 🔴 第一版把狀態放在 BriefingArticle 裡，而進度列（ChecklistTools）自己再讀一次
  //    localStorage —— 兩個問題：
  //      ① 勾了之後進度列不會更新（兄弟元件，彼此不知道）
  //      ② `vbChecklistLoad` **有副作用**（指紋不符時會刪 key），被呼叫兩次時
  //         先跑的那個把「已重置」這個事實吃掉，提示就再也不會出現
  //    → 狀態提到呼叫端，兩個元件吃同一份。**有副作用的讀取函式只能有一個呼叫點。**
  //
  // 🔒 2026-09-20 裁示：可勾的項目由**作者標記**，可能落在內容的任何地方，
  //    所以指紋只取「所有被標記項目的文字」——
  //    後台改交通那一段的敘述不該清掉別人的打包進度（VB-BR-194 的理由不變，取樣範圍變了）。
  window.useBriefChecklist = function (content) {
    const items = React.useMemo(() => window.vbCheckableTexts(content), [content]);
    const fp = window.vbHash(items.join("\u0000"));
    // `vbChecklistLoad` 是**純讀取**（見 vb-data.js 那段註解：踩過兩次才改成這樣），
    // 所以這裡想讀幾次都可以，掛載與 fp 變動各讀一次也不會互相蓋掉。
    const [st, setSt] = React.useState(() => window.vbChecklistLoad(fp));
    const [dismissed, setDismissed] = React.useState(false);
    React.useEffect(() => { setSt(window.vbChecklistLoad(fp)); setDismissed(false); }, [fp]);

    const total = items.length;
    const checkedSet = new Set(st.checked);

    return {
      fp, total, done: st.checked.length, checkedSet,
      reset: st.reset && !dismissed,
      // 按掉提示 = 認了這份新清單：把舊 fp 的殘留資料換成新的空清單，
      // 這樣提示不會再出現，而且舊勾選真的被清掉（不是只是藏起來）。
      dismissReset: () => { window.vbChecklistSave(fp, []); setSt({ checked: [], reset: false }); setDismissed(true); },
      toggle: (text) => {
        const next = checkedSet.has(text) ? st.checked.filter((t) => t !== text) : [...st.checked, text];
        window.vbChecklistSave(fp, next);
        setSt({ checked: next, reset: false });
      },
      clear: () => { window.vbChecklistSave(fp, []); setSt({ checked: [], reset: false }); },
    };
  };

  /** 一整篇行前資訊。後台預覽與前台頁面共用。
   *
   *  `changed` / `at`：2026-09-06 裁示「不發通知，改在頁面上標最近更新」。
   *  只有**這一次發布真的動到的區塊**會標，而且只在 72 小時內標 ——
   *  整篇都標等於沒標，而永遠標著會變成裝飾。
   *
   *  `checklist`：由呼叫端用 `useBriefChecklist()` 建立並傳進來（前台才有）。
   *  沒有傳就是**唯讀模式** —— 後台預覽、範本預覽、版本回看都走這條：
   *  看得到框（那是志工看到的樣子），但不可勾也不寫入。
   *  協調者在預覽裡勾一勾，不該變成他手機上的打包進度。 */
  function BriefingArticle({ content, compact, changed, at, checklist }) {
    const recent = window.vbIsRecent && window.vbIsRecent(at);
    const changedSet = new Set(recent ? (changed || []) : []);
    const checkable = Boolean(checklist);
    const checkedSet = checklist ? checklist.checkedSet : new Set();
    const toggle = checklist ? checklist.toggle : () => {};
    const blocks = React.useMemo(() => parseBlocks(content || ""), [content]);

    if (window.vbIsEmpty(content)) {
      return (
        <div style={{ padding: "28px 0", textAlign: "center", color: "var(--color-fg-neutral-muted)",
          font: "var(--font-body-400)" }}>
          這一份還沒有任何內容。
        </div>
      );
    }

    // 錨點取**最高層級**的標題：有 <h2> 就用 h2，整份沒有 h2 才退而用 h3。
    // 兩層都列會讓跳躍列變成目錄，而志工要的是「跳到那一段」不是「讀目錄」。
    const h2s = blocks.filter((b) => b.kind === "html" && b.tag === "H2")
      .map((b, i) => ({ id: slug("h2", i), text: b.text }));
    const h3s = blocks.filter((b) => b.kind === "html" && b.tag === "H3")
      .map((b, i) => ({ id: slug("h3", i), text: b.text }));
    const heads = h2s.length >= 2 ? h2s : (h2s.length ? [] : h3s);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
        <JumpBar heads={heads} />
        <ArticleBody blocks={blocks} checkable={checkable} checked={checkedSet}
          onToggle={toggle} changedSet={changedSet} />
        {checkable && checklist.reset && (
          /* 「內容改了就重置並告知」（裁示）。在災害情境下，
             叫他重看一次比默默掃錯安全。 */
          <div data-vb-check-reset style={{ display: "flex", gap: 8, alignItems: "flex-start",
            padding: "10px 12px", borderRadius: "var(--radius-md)",
            background: "var(--color-bg-info-subtle)" }}>
            <Icon n="RefreshCw" s={15} c="var(--color-fg-info)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span className="wg-caption" style={{ flex: 1, minWidth: 0, color: "var(--color-fg-info)", lineHeight: 1.7 }}>
              <strong>清單更新了，之前的勾選已清除。</strong>請重新核對一次 —— 可能有新增或改過的項目。
            </span>
            <button type="button" onClick={checklist.dismissReset}
              style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer",
                color: "var(--color-fg-info)", padding: 4, lineHeight: 0 }} aria-label="知道了">
              <Icon n="X" s={15} c="currentColor" />
            </button>
          </div>
        )}
      </div>
    );
  }

  function ChecklistTools({ checklist, at, version }) {
    if (!checklist || !checklist.total) return null;
    const { total, done } = checklist;

    function print() {
      // 🔒 不做 PDF 產生器（2026-09-19 裁示）。複製一份文章到 .vb-print-sheet 再叫
      //    瀏覽器列印 —— 這樣不必去對抗外殼的 100dvh 與 overflow:hidden，
      //    那正是「明明整頁很長卻只印得出一屏」的原因。
      const src = document.querySelector("[data-vb-print-source]");
      if (!src) return;
      const sheet = document.createElement("div");
      sheet.className = "vb-print-sheet";
      const head = document.createElement("div");
      head.innerHTML =
        '<h1 style="font-size:16pt;margin:0 0 4pt">志工行前資訊</h1>' +
        '<div style="font-size:9.5pt;color:#444;margin-bottom:10pt">' +
        (version ? "第 " + version + " 版 · " : "") +
        "最後更新 " + window.vbClock(at) + " · 列印於 " + window.vbClock(Date.now()) +
        '<br><strong>紙本會過期。出發前請再看一次線上版，交通管制與報到方式常常當天就變。</strong></div>' +
        '<hr style="border:0;border-top:1pt solid #000;margin:0 0 10pt">';
      sheet.appendChild(head);
      const clone = src.cloneNode(true);
      // 🔴 `cloneNode` **會複製 checkedness**（HTML 規格的 cloning steps 有寫）——
      //    第一版以為不會，結果紙上印出了螢幕上勾過的那幾項。
      //    裁示是「打包時邊看邊手寫勾」，所以紙上一律空框。CSS 也擋一次，這裡是根本。
      clone.querySelectorAll('input[type="checkbox"]').forEach((i) => {
        i.checked = false; i.removeAttribute("checked");
      });
      sheet.appendChild(clone);
      document.body.appendChild(sheet);
      const cleanup = () => { sheet.remove(); window.removeEventListener("afterprint", cleanup); };
      window.addEventListener("afterprint", cleanup);
      window.print();
      // Safari 不一定送 afterprint，保險再清一次
      window.setTimeout(cleanup, 3000);
    }

    return (
      <div data-vb-check-tools style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 14px", borderRadius: "var(--radius-md)",
        background: "var(--color-bg-neutral-default)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
        <Icon n="ListChecks" s={16} c="var(--color-fg-neutral-subtle)" />
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-default)" }}>
          裝備已勾 <strong data-vb-check-done>{done}</strong> / {total}
        </span>
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
          · 只存在這台裝置，換手機不會同步
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {done > 0 && (
            <button type="button" data-vb-clear onClick={checklist.clear}
              style={{ minHeight: 44, padding: "0 12px", border: "none", cursor: "pointer",
                borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)",
                color: "var(--color-fg-neutral-subtle)", font: "var(--font-label-400)", fontSize: 13 }}>
              全部清除
            </button>
          )}
          <button type="button" data-vb-print onClick={print}
            style={{ minHeight: 44, padding: "0 14px", border: "none", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)",
              color: "var(--color-fg-neutral-subtle)", font: "var(--font-label-400)", fontSize: 13,
              boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
            <Icon n="Printer" s={15} c="currentColor" />列印清單
          </button>
        </div>
      </div>
    );
  }

  /** 「這份是什麼時候發的」。志工判斷資訊新不新只靠這一行，所以它永遠要在。 */
  function BriefingStamp({ at, version, by, showBy }) {
    return (
      <div data-vb-stamp style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
        <Icon n="Clock" s={13} c="currentColor" />
        <span>最後更新 {window.vbClock(at)}（{window.vbAgo(at)}）</span>
        {version ? <Badge tone="neutral">第 {version} 版</Badge> : null}
        {showBy && by ? <span>· {by}</span> : null}
      </div>
    );
  }

  Object.assign(window, { VBRichText: RichText, BriefingArticle, BriefingStamp, ChecklistTools });
})();
