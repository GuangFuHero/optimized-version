// vb-editor.jsx — 自寫的富文字編輯器（VB-FEAT-001）
//
// 🔒 裁示（Sucre 2026-09-06）：自寫 contentEditable 工具列，不引入 Quill／Tiptap。
//    理由與互助地圖不引入 Leaflet.draw 同一條：那些套件的提示與選單是英文，
//    要改成中文得深入它的 i18n；而我們需要的只有六顆按鈕。
//
// ⚠️ 用的是 `document.execCommand`。它在 MDN 上標為 deprecated，但**所有瀏覽器都還支援**，
//    而且是唯一不用自己寫 selection model 就能做到粗體／清單的方法。
//    正式版若要更完整的編輯行為（表格、復原堆疊、協作），那時才值得引入編輯器框架。
//    這一段請照抄給工程，不要讓他們以為原型「用了什麼特別的東西」。
//
// ⚠️ 貼上一律轉純文字（圖片除外）。從 Word／Google Docs 貼過來會帶一大包 span 與
//    inline style，留著會讓每一篇的行高與字級都不一樣 —— 災害資訊頁最需要的是
//    每一篇長得一模一樣。
(function () {
  const { Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // 🔒 建議的上傳圖床：**跟任務單共用同一份**（`wg-photos.jsx` 的 `TK_UPLOAD_HOST`）。
  //    兩邊各寫一份的話，換圖床時一定會漏掉一邊，而漏掉的那一邊會一直
  //    把人送去一個我們已經不推薦的站。
  // ⚠️ 退路是寫死的同一組值 —— 本頁若沒載到 wg-photos.jsx 也不會壞掉，
  //    但那代表兩份值會開始漂移，所以 HTML 一定要載它。
  const UP = (typeof window !== "undefined" && window.TK_UPLOAD_HOST) || {
    name: "duk.tw", url: "https://duk.tw/",
    steps: ["開 duk.tw，把照片拖進去", "按「開始上傳」", "複製它給的網址，貼回這裡"],
  };

  // 貼上或選檔轉 base64 的上限。超過就擋下並說原因 ——
  // localStorage 約 5MB，三種災害各塞一張 2MB 的照片就寫不進去了（vbWrite 會丟錯）。
  // ⚠️ 這個數字是我取的。正式版不該用 base64，見 vb-data.js 的圖片註記。
  const IMG_MAX_BYTES = 400 * 1024;

  const BTN = (on) => ({
    height: 30, minWidth: 32, padding: "0 8px", borderRadius: "var(--radius-md)",
    border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
    background: on ? "var(--color-bg-secondary-subtle)" : "transparent",
    color: on ? "var(--color-brand-secondary-subtle)" : "var(--color-fg-neutral-subtle)",
    font: "var(--font-label-400)", fontSize: 13,
  });

  function Sep() {
    return <span style={{ width: 1, height: 18, background: "var(--color-border-default)", margin: "0 3px", flexShrink: 0 }} />;
  }

  /**
   * 三段富文字 ＋ 一列共用工具列。
   *
   * 工具列作用在**最後被聚焦的那一段**。按鈕用 onMouseDown + preventDefault，
   * 不讓瀏覽器把焦點從 contentEditable 拿走 —— 否則 selection 會消失，
   * execCommand 就找不到要套用的範圍（這是自寫工具列最常見的壞法）。
   */
  function BriefEditor({ docKey, content, onChange }) {
    const boxRef = React.useRef(null);
    const [askLink, setAskLink] = React.useState(false);
    const [askImage, setAskImage] = React.useState(false);
    const [url, setUrl] = React.useState("");
    const [warn, setWarn] = React.useState("");
    // 工具列上「可勾項目」那顆按鈕要反映游標目前在不在可勾項目上。
    // ⚠️ 選取變化不會自己觸發 render，所以按鍵／放開滑鼠時要推一下，
    //    否則按鈕的按下狀態會停在上一次的值（看起來像按鈕壞了）。
    const [selTick, setSelTick] = React.useState(0);
    const bumpSel = () => setSelTick((n) => n + 1);
    const fileRef = React.useRef(null);

    // 只在**換一份**（docKey 變）時把內容灌進 DOM。
    // 🔴 **不可以每次 render 都寫 innerHTML** —— 那會在每一個字之後把游標踢回開頭。
    //    這是 contentEditable + React 最經典的坑。
    React.useEffect(() => {
      if (boxRef.current) boxRef.current.innerHTML = content || "";
      setWarn("");
      setAskLink(false); setAskImage(false); setUrl("");
    }, [docKey]);   // eslint-disable-line react-hooks/exhaustive-deps

    const readBack = () => {
      if (boxRef.current) onChange(boxRef.current.innerHTML);
    };

    function run(cmd, value) {
      const el = boxRef.current;
      if (!el) return;
      el.focus();
      try { document.execCommand("styleWithCSS", false, false); } catch (e) {}
      document.execCommand(cmd, false, value);
      readBack();
    }

    // ── 可勾項目（2026-09-20 裁示）──────────────────────────────────────
    //
    // 🔒 判準是**作者的標記**，不是「這一段是不是裝備段」（推翻 09-19 的推導式做法）。
    //    標記就是 li 上的一個無值旗標 `data-check`。
    //
    // 🔴 **旗標不帶勾選狀態，而且永遠不帶。** 改 Markdown 之後它會寫成 `- [ ]`，
    //    而 Markdown 的 `[x]` 是會被存進內容的初始狀態 —— 後台在編輯區勾一勾再存檔，
    //    志工打開就看到一張已經幫他勾好的清單。編輯器**只輸出未勾**，render 時也一律當未勾。
    //
    // ⚠️ 行為是**切換**不是插入：游標所在（或選取範圍涵蓋）的那幾個 li 在
    //    「一般項目 ⇄ 可勾項目」之間切換，同粗體的開關邏輯。
    //    游標不在清單裡時，先幫他做成項目清單再標記 —— 否則按下去沒反應，
    //    而使用者不會知道原因是「你得先做成清單」。
    function toggleCheck() {
      const host = boxRef.current;
      if (!host) return;
      host.focus();
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;

      let items = selectedListItems(host, sel.getRangeAt(0));
      if (!items.length) {
        document.execCommand("insertUnorderedList");
        items = selectedListItems(host, window.getSelection().getRangeAt(0));
      }
      if (!items.length) { setWarn("請先把游標放在要標記的項目上。"); return; }

      // 混合選取時一律「全部標成可勾」，再按一次才全部取消 ——
      // 逐項各自反轉會讓同一次操作produce出交錯的結果，看起來像壞掉。
      const allOn = items.every((li) => li.hasAttribute("data-check"));
      items.forEach((li) => { if (allOn) li.removeAttribute("data-check"); else li.setAttribute("data-check", ""); });
      readBack();
      bumpSel();
      setWarn("");
    }

    /** 選取範圍涵蓋到的 <li>（含游標只是停在某一項裡的情況）。 */
    function selectedListItems(host, range) {
      const all = [...host.querySelectorAll("li")];
      const hit = all.filter((li) => range.intersectsNode && range.intersectsNode(li));
      if (hit.length) return hit;
      let n = range.startContainer;
      while (n && n !== host) {
        if (n.nodeType === 1 && n.tagName === "LI") return [n];
        n = n.parentNode;
      }
      return [];
    }

    function insertLink() {
      const href = url.trim();
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
        setWarn("連結要以 http://、https://、mailto: 或 tel: 開頭。");
        return;
      }
      run("createLink", href);
      setAskLink(false); setUrl(""); setWarn("");
    }

    function insertImageUrl() {
      const src = url.trim();
      if (!/^https?:\/\//i.test(src)) { setWarn("圖片網址要以 http:// 或 https:// 開頭。"); return; }
      run("insertImage", src);
      setAskImage(false); setUrl(""); setWarn("");
    }

    function insertImageFile(file) {
      if (!file || !/^image\//.test(file.type)) return;
      if (file.size > IMG_MAX_BYTES) {
        setWarn(`這張 ${Math.round(file.size / 1024)} KB，超過原型的 ${Math.round(IMG_MAX_BYTES / 1024)} KB 上限。`
          + "原型把圖片轉成 base64 存在瀏覽器裡，太大會存不進去。正式版需要後端提供圖床。");
        return;
      }
      const rd = new FileReader();
      rd.onload = () => { run("insertImage", rd.result); setAskImage(false); setWarn(""); };
      rd.readAsDataURL(file);
    }

    function onPaste(e) {
      const items = [...((e.clipboardData && e.clipboardData.items) || [])];
      const img = items.find((i) => /^image\//.test(i.type));
      if (img) { e.preventDefault(); insertImageFile(img.getAsFile()); return; }
      // 其餘一律吃純文字：從 Word 貼過來的樣式不留
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
      readBack();
    }

    const TOOLS = [
      { cmd: "bold", icon: "Bold", title: "粗體（Ctrl/Cmd + B）" },
      /* 🔒 2026-09-20：h2 ＝ 段落標題（Markdown 的兩個井字號），h3 ＝ 段內小標。
         整份只剩一塊內容之後，分段就是靠作者自己下 h2 —— 所以它必須在工具列上，
         而且要排在 h3 前面，順序本身就是在說「先分段、再分小節」。 */
      { cmd: "formatBlock", value: "<h2>", icon: "Heading1", title: "段落標題（分出新的一段）" },
      { cmd: "formatBlock", value: "<h3>", icon: "Heading2", title: "小標題（段裡的小節）" },
      { cmd: "formatBlock", value: "<p>", icon: "Pilcrow", title: "一般段落" },
      { sep: true },
      { cmd: "insertUnorderedList", icon: "List", title: "項目清單" },
      { cmd: "insertOrderedList", icon: "ListOrdered", title: "編號清單" },
      { sep: true },
    ];

    const checkOn = React.useMemo(() => {
      const host = boxRef.current;
      const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
      if (!host || !sel || !sel.rangeCount) return false;
      const items = selectedListItems(host, sel.getRangeAt(0));
      return items.length > 0 && items.every((li) => li.hasAttribute("data-check"));
    }, [selTick]);   // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 工具列：黏在編輯區頂部。三段共用一列，作用在游標所在的那一段。 */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
          padding: "6px 8px", borderRadius: "var(--radius-md)",
          background: "var(--color-bg-neutral-default)", boxShadow: "inset 0 0 0 1px var(--color-border-default), var(--shadow-sm)" }}>
          {TOOLS.map((t, i) => t.sep
            ? <Sep key={"s" + i} />
            : (
              <button key={t.cmd + (t.value || "")} type="button" title={t.title} aria-label={t.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(t.cmd, t.value)} style={BTN(false)}>
                <Icon n={t.icon} s={16} c="currentColor" />
              </button>
            ))}
          {/* 可勾項目。排在兩個清單按鈕後面 —— 它是清單的一種變體，不是另一類東西。 */}
          <button type="button" title="可勾項目（志工可以在前台逐項打勾）"
            aria-label="可勾項目" aria-pressed={checkOn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleCheck} style={BTN(checkOn)}>
            <Icon n="ListChecks" s={16} c="currentColor" />
          </button>
          <Sep />
          <button type="button" title="插入連結" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setAskLink((v) => !v); setAskImage(false); setUrl(""); setWarn(""); }} style={BTN(askLink)}>
            <Icon n="Link" s={16} c="currentColor" />
          </button>
          <button type="button" title="移除連結" onMouseDown={(e) => e.preventDefault()}
            onClick={() => run("unlink")} style={BTN(false)}>
            <Icon n="Link2Off" s={16} c="currentColor" />
          </button>
          <button type="button" title="插入圖片" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setAskImage((v) => !v); setAskLink(false); setUrl(""); setWarn(""); }} style={BTN(askImage)}>
            <Icon n="Image" s={16} c="currentColor" />
          </button>
          <Sep />
          <button type="button" title="清除格式" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { run("removeFormat"); run("formatBlock", "<p>"); }} style={BTN(false)}>
            <Icon n="RemoveFormatting" s={16} c="currentColor" />
          </button>
          {/* 2026-09-20：原本這裡寫「套用到『交通資訊』」——
              整份只剩一塊內容之後沒有段落可以指名，這行也就沒有意義了，拿掉。 */}
        </div>

        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7, marginTop: -6 }}>
          用<strong>段落標題</strong>分段（前台會自動長出可以點的跳躍列，兩段以上才出現）；
          段裡再細分就用<strong>小標題</strong>。<br />
          標成<strong>可勾項目</strong>的每一行，志工在前台就能一項一項打勾
          （只存在他自己的手機上，換手機不會同步；列印出來一律是空心方框）。
        </div>

        {/* 連結／圖片的輸入列。不用 window.prompt —— 它會擋住整個分頁，
            而且長得像瀏覽器的錯誤訊息，在後台介面裡很突兀。 */}
        {(askLink || askImage) && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px",
            borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)",
            boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
            <input value={url} autoFocus placeholder={askLink ? "https://example.tw/notice" : "https://example.tw/map.png"}
              onChange={(e) => { setUrl(e.target.value); setWarn(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); askLink ? insertLink() : insertImageUrl(); } }}
              style={{ flex: 1, minWidth: 220, height: 34, padding: "0 12px", borderRadius: "var(--radius-md)",
                border: "none", boxShadow: "inset 0 0 0 1px var(--color-border-default)",
                background: "var(--color-bg-neutral-default)", font: "var(--font-body-400)", outline: "none" }} />
            <Button size="sm" variant="secondary" onClick={askLink ? insertLink : insertImageUrl}>
              {askLink ? "套用到選取的文字" : "插入圖片"}
            </Button>
            {askImage && (
              <React.Fragment>
                <Button size="sm" variant="ghost" onClick={() => fileRef.current && fileRef.current.click()}>從電腦選檔</Button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { insertImageFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
              </React.Fragment>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setAskLink(false); setAskImage(false); setUrl(""); setWarn(""); }}>取消</Button>

            {/* ── 圖片：去哪裡拿網址（比照任務單 TM-IMG-131〜133）────────────────
                🔒 入口要**常駐**，不是 tooltip —— Sucre 對任務單的理由是
                   「怕他們不知道去哪裡上傳」，行前資訊這邊同一個問題。
                ⚠️ 但這裡的貼圖者是**協調單位**，不是現場志工，所以文案不寫
                   「現場拍完不知道傳哪」那一層語境。
                🔴 三步就好，不寫教學長文。
                🔒 2026-09-21：範本從 ppt.cc 換成 **duk.tw**（TM-FEAT-010 阻斷 B-11 裁示）。
                   duk.tw 上傳完**直接給圖片網址**，沒有落地頁／圖片的分裂，
                   也沒有 reCAPTCHA —— 所以第 ② 步不必再叮嚀「要複製直接連結」。
                🚨 **文案不提「密碼保護」。** duk.tw 有那個功能，但實測它保護不到圖片本身
                   （帶副檔名的網址直接給圖），叫人加密碼等於給假的安心感。 */}
            {askImage && (
              <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 6,
                paddingTop: 10, marginTop: 2, borderTop: "1px solid var(--color-border-default)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
                    還沒有圖片網址？
                  </span>
                  {/* 🔴 一定要 target="_blank" ＋ rel="noopener noreferrer"：
                      同分頁開走 ＝ 正在編的整份內容消失（未存的修改就沒了）；
                      少了 noopener，新分頁拿得到 window.opener。 */}
                  <a href={UP.url} target="_blank" rel="noopener noreferrer"
                    data-vb-upload-help
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 28,
                      color: "var(--color-brand-secondary-subtle)", font: "var(--font-label-400)",
                      fontSize: 13, fontWeight: 700, textDecoration: "underline" }}>
                    到 {UP.name} 上傳
                    <Icon n="ExternalLink" s={13} c="currentColor" />
                  </a>
                </div>
                <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.8 }}>
                  {UP.steps.map((t, i) => `${"①②③"[i]} ${t}`).join("　")}
                </div>
                {/* 🚨 隱私。常駐一行，不是 tooltip、不是 placeholder。
                    ⚠️ 與任務單（TM-IMG-141）**刻意不同**：那邊講的是現場照
                       （傷者面孔、門牌、證件），這裡多半是集合點地圖與裝備示意圖，
                       所以只留「平台管不到這張圖」這一半。 */}
                <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.8 }}>
                  圖片存在外部網站：拿到網址的人都看得到，平台刪不掉，
                  也保證不了它明天還在。
                </div>
              </div>
            )}
          </div>
        )}

        {warn && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)",
            background: "var(--color-bg-warning-subtle)", color: "var(--color-fg-warning)" }}>
            <Icon n="TriangleAlert" s={16} c="currentColor" style={{ marginTop: 2, flexShrink: 0 }} />
            <span className="wg-caption" style={{ lineHeight: 1.7 }}>{warn}</span>
          </div>
        )}

        {/* 🔒 2026-09-20 裁示：**整份只有一個編輯區**（後端只給一個欄位）。
            09-06 那版是四個各自獨立的 contentEditable，四段是系統保證的結構；
            現在段落由作者自己用「段落標題」分出來，所以這裡只有一塊。
            ⚠️ 代價：新手打開看到的是一片空白（空白開始時）或一份範本，
               沒有任何欄位在提示他「該寫哪四件事」—— 那個提示現在只活在範本裡。 */}
        <div
          ref={boxRef}
          className="vb-rich"
          contentEditable suppressContentEditableWarning
          role="textbox" aria-multiline="true" aria-label="行前資訊內容"
          onFocus={bumpSel}
          onKeyUp={bumpSel}
          onMouseUp={bumpSel}
          onInput={() => { readBack(); bumpSel(); }}
          onBlur={readBack}
          onPaste={onPaste}
          style={{ minHeight: 420, padding: "18px 20px", borderRadius: "var(--radius-md)",
            background: "var(--color-bg-neutral-default)", outline: "none",
            boxShadow: "inset 0 0 0 1px var(--color-border-default)" }} />
      </div>
    );
  }

  Object.assign(window, { BriefEditor });
})();
