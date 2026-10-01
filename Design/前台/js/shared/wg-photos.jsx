// wg-photos.jsx — 圖片連結（TM-FEAT-010，規則前綴 TM-IMG-）
//
// 🔒 前台與後台共用同一支。三種身分（報案者／志工／後台人員）貼的是同一種東西，
//    驗證、預覽與失敗處理只能有一份 —— 兩份遲早會長出兩種「無法預覽」的樣子。
//    同 vb-view.jsx（後台預覽與前台頁面共用）、an-banner.jsx（前後台共用）的做法。
//
// 🔒 TM-IMG-101：平台只存一條網址字串。不存檔案、不存縮圖、不存 base64。
// 🔒 TM-IMG-102：這支檔案裡不會出現任何 <input type="file">、拖放區或相機入口。
//                 使用者唯一能做的動作是「貼一條網址」。
// 🔴 TM-IMG-104：不得把圖片轉 base64 存進 localStorage。
//                 志工行前資訊原型踩過（vb-data.js：約 5MB，圖片一塞就滿）。
(function () {
  const { Field, Input, Button, Badge, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // 🔒 **唯一真相來源：建議的上傳圖床。**
  //    任務單（TM-FEAT-010）與志工行前資訊（VB-FEAT-001）共用這一份 ——
  //    兩邊各寫一份的話，換圖床時一定會漏掉一邊，而漏掉的那一邊
  //    會一直把人送去一個我們已經不推薦的站。
  //
  // 2026-09-21 裁示：**從 ppt.cc 換成 duk.tw**（B-11）。實測比較見 validation 二之二。
  //   · duk.tw 上傳完**直接給 `https://duk.tw/AbCdEf.png`，本身就是圖**，沒有落地頁／圖片的分裂
  //   · **沒有任何人機驗證** —— ppt.cc 那道 reCAPTCHA 消失，所以指引回到**三步**
  //   · 預設**永不過期**
  //   · 不擋外站 referrer（實測）
  //
  // 🚨 **文案一個字都不提「密碼保護」。** duk.tw 有這個功能，但實測它
  //    **保護不到圖片本身**（帶副檔名的網址直接給圖，而那正是它叫人複製的那一條）。
  //    叫人加密碼等於給假的安心感 —— 那比沒有保護更危險，會讓人去拍原本不會拍的東西。
  //    唯一有效的防線仍然是 TM-IMG-141：不要拍到傷者面孔、門牌與證件。
  const TK_UPLOAD_HOST = {
    name: "duk.tw",
    url: "https://duk.tw/",
    // 三步，不寫教學長文。
    steps: ["開 duk.tw，把照片拖進去", "按「開始上傳」", "複製它給的網址，貼回這裡"],
  };
  const TK_PHOTO_UPLOAD_URL = TK_UPLOAD_HOST.url;
  // TM-IMG-122 ⚠️I-1：上限 10 是我取的，Sucre 沒說。
  const TK_PHOTO_MAX = 10;
  // ⚠️ 8 秒也是我取的。等太久＝空白框，等太短＝訊號差的現場會被誤判成壞網址。
  const TK_PHOTO_TIMEOUT_MS = 8000;

  // 舊資料是 ["https://…", …] 的字串陣列；新資料是 {url, caption, by, at}。
  // 🔴 兩種都要讀得出來 —— 種子資料與 localStorage 裡都還是字串。
  function tkPhotoNorm(p) {
    if (!p) return null;
    if (typeof p === "string") return { url: p, caption: "", by: null, at: null };
    return { url: p.url || "", caption: p.caption || "", by: p.by || null, at: p.at || null };
  }
  const tkPhotoList = (photos) => (photos || []).map(tkPhotoNorm).filter((p) => p && p.url);

  // 🚨 TM-IMG-134（2026-09-20 實測結案）：ppt.cc 的**短網址是落地頁，不是圖**。
  //    `https://ppt.cc/fXi6Ax`      → HTML 頁面，<img src> 拿不到圖
  //    `https://ppt.cc/fXi6Ax@.png` → 真的圖片（落地頁上「圖片連結」那一格）
  //    所以指引要叫人複製「圖片連結」，不是「產生的網址」——
  //    兩者長得很像，差一個 `@`，而貼錯的人看到的是「無法預覽」卡片，
  //    他只會覺得這個功能壞掉。
  const tkPhotoLooksLikePptLanding = (u) => /^https:\/\/ppt\.cc\/[A-Za-z0-9]+\/?$/i.test((u || "").trim());

  // 🔒 已知圖床的「落地頁 → 圖片」換算。**只放實測過的**。
  //
  // 🔴 **2026-09-21 換成 duk.tw 之後，這張表仍然留著，不要刪。**
  //    duk.tw 給的本來就是圖片網址，貼上就能預覽，這裡的 fallback 根本不會觸發。
  //    但**已經有人貼過 ppt.cc 網址的單還是要看得到圖** —— 刪掉等於讓舊單的照片一起消失。
  //    換圖床是往前的決定，不該回頭把舊資料弄壞。
  //
  // 2026-09-20 實測 ppt.cc：`@` 才是開關，**副檔名完全不參與判定** ——
  //   @ / @.png / @.jpg / @.webp / @.zzz / @@ 全部回同一張圖；
  //   `fXi6Ax.png`（有副檔名沒有 @）則失敗。
  //   → 所以補的是 `@`，不是 `@.png`。補 `@.png` 遇到 JPG 會「碰巧對」，
  //     那種對法在別的圖床上就會錯，而且錯得沒有錯誤訊息。
  //
  // 🔴 **這張表只在 render 時用來「再試一次」，不改寫存下來的網址**（TM-IMG-127 原樣儲存）。
  //    理由：如果存檔時就改寫，圖床哪天改規則，**每一張單存的網址都變成錯的**，
  //    而且分不出哪些是人貼的、哪些是我們算的。存原樣的話，最壞只是 fallback 失效，
  //    畫面退回「無法預覽」卡片 —— 那是我們已經處理好的狀態。
  const TK_PHOTO_FALLBACKS = [
    { host: "ppt.cc", test: tkPhotoLooksLikePptLanding, derive: (u) => u.trim().replace(/\/$/, "") + "@" },
  ];
  function tkPhotoDerive(u) {
    const hit = TK_PHOTO_FALLBACKS.find((f) => f.test(u));
    return hit ? hit.derive(u) : null;
  }

  // TM-IMG-121：一律要求 https。
  // 🔴 理由不是潔癖：前台是 https，貼 http:// 的圖會被瀏覽器當 mixed content 擋掉，
  //    畫面上是一片空白，而且不會報錯。擋在送出前，比讓人看空白好。
  const tkPhotoUrlOk = (u) => /^https:\/\/\S+$/i.test((u || "").trim());

  // ── 一張縮圖 ────────────────────────────────────────────────────────────
  // TM-IMG-135 預覽　TM-IMG-136 載不出來時的卡片　TM-IMG-139 固定框不改版面高度
  //
  // 🔴 實作陷阱 2：onerror 不一定會觸發。圖床回 200 但內容是 HTML 落地頁時，
  //    有些瀏覽器只是停在 complete=true / naturalWidth=0，不發 error 事件。
  //    所以「載不出來」要同時看 onerror 和 naturalWidth === 0。
  function TKPhotoThumb({ photo, index, onOpen, onRemove, compact, confirming, onConfirmRemove, onCancelRemove }) {
    const p = tkPhotoNorm(photo);
    const [state, setState] = React.useState("loading"); // loading | ok | fail
    // 實際餵給 <img> 的網址：先用使用者貼的那一條，載不出來才換成候補（TM-IMG-134e）
    const [src, setSrc] = React.useState(p.url);
    const [triedDerived, setTriedDerived] = React.useState(false);
    const ref = React.useRef(null);

    // 網址換了就重驗一次（TM-IMG-136：失敗不寫回資料，每次 render 重試）
    React.useEffect(() => { setState("loading"); setSrc(p.url); setTriedDerived(false); }, [p.url]);

    // 🔒 候補只在**這一次 render** 用，不回寫 onChange、不進資料。
    const fallback = () => {
      const alt = tkPhotoDerive(p.url);
      if (alt && !triedDerived && alt !== src) {
        setTriedDerived(true); setSrc(alt); setState("loading");
        return true;
      }
      return false;
    };

    const settle = () => {
      const el = ref.current;
      if (!el) return;
      if (el.naturalWidth > 0) { setState("ok"); return; }
      if (fallback()) return;
      setState("fail");
    };
    // 圖可能在 effect 跑到之前就從快取載完了，那時 onLoad 不會再觸發一次
    React.useEffect(() => {
      const el = ref.current;
      if (el && el.complete) settle();
    }, [p.url]);

    // 🔴 第三種失敗：既不 load 也不 error，就是一直卡著。
    //    伺服器接了連線不回應、或圖床很慢時會這樣 —— 使用者看到的是一個**永遠空白的框**，
    //    沒有訊息、沒有原網址可點，跟「破圖」一樣糟。
    //    所以給它一個時限，時限到了還沒載出來就當成載不出來（TM-IMG-136 的卡片）。
    //    ⚠️ 這不寫回資料，只是這一次 render 的結論；下次打開會重試。
    React.useEffect(() => {
      if (state !== "loading") return;
      const id = setTimeout(() => {
        const el = ref.current;
        if (el && el.naturalWidth > 0) return;
        if (fallback()) return;
        setState("fail");
      }, TK_PHOTO_TIMEOUT_MS);
      return () => clearTimeout(id);
    }, [state, src]);

    const box = {
      position: "relative", aspectRatio: "3 / 2", borderRadius: "var(--radius-md)",
      border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-subtle)",
      overflow: "hidden",
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={box}>
          {/* TM-IMG-138：每一張各自失敗，不共用載入狀態；lazy 不擋任務單其餘內容 */}
          <img
            ref={ref} src={src} alt={p.caption || `現場照片 ${index + 1}`} loading="lazy"
            onLoad={settle} onError={() => { if (!fallback()) setState("fail"); }}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              cursor: state === "ok" ? "zoom-in" : "default",
              visibility: state === "fail" ? "hidden" : "visible",
            }}
            onClick={() => { if (state === "ok" && onOpen) onOpen(p); }}
          />
          {state === "fail" && (
            // TM-IMG-136：不是破圖 icon、不是空白。中性圖示 ＋ 一句話 ＋ 原網址可點。
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 6, padding: 10, textAlign: "center" }}>
              <Icon n="ImageOff" s={20} c="var(--color-fg-neutral-muted)" />
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>這個網址載不出圖片</span>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="wg-caption"
                style={{ color: "var(--color-brand-secondary-default)", wordBreak: "break-all", lineHeight: 1.3 }}>
                {p.url}
              </a>
            </div>
          )}
          {confirming && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8, padding: 10, textAlign: "center",
              background: "var(--color-bg-neutral-default)" }}>
              <span style={{ font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>
                從任務單上移除？
              </span>
              {/* 🚨 這一行不能省 */}
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", textWrap: "pretty" }}>
                圖片本身仍在原網站上，平台刪不掉。
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Button variant="ghost" onClick={onCancelRemove}>取消</Button>
                <Button variant="danger" onClick={onConfirmRemove}>移除</Button>
              </div>
            </div>
          )}
          {onRemove && !confirming && (
            <button className="tk-iconbtn" title="移除這條圖片網址" onClick={onRemove}
              style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28,
                background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)" }}>
              <Icon n="X" s={14} c="var(--color-fg-neutral-muted)" />
            </button>
          )}
        </div>
        {!compact && p.caption && (
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", textWrap: "pretty" }}>{p.caption}</span>
        )}
      </div>
    );
  }

  // ── 表單裡的編輯區 ──────────────────────────────────────────────────────
  // TM-IMG-102 / 124 / 131 / 132 / 133 / 141
  function TKPhotoLinkEditor({ value, onChange, label, hint }) {
    const rows = tkPhotoList(value);
    const [draft, setDraft] = React.useState("");
    const [draftCap, setDraftCap] = React.useState("");
    const [err, setErr] = React.useState("");

    const full = rows.length >= TK_PHOTO_MAX;

    const add = () => {
      const u = draft.trim();
      if (!u) return;
      // TM-IMG-121：擋在送出之前，寫出為什麼
      if (!tkPhotoUrlOk(u)) { setErr("網址要以 https:// 開頭。http:// 的圖會被瀏覽器擋掉，畫面上只會是一片空白。"); return; }
      // TM-IMG-122：超過上限在送出前擋住，寫出「11／10」
      if (full) { setErr(`最多 ${TK_PHOTO_MAX} 條（${rows.length + 1}／${TK_PHOTO_MAX}）。請先移除一條再貼。`); return; }
      // TM-IMG-125：重複只提示，不阻擋
      const dup = rows.some((r) => r.url === u);
      onChange([...rows, { url: u, caption: draftCap.trim(), by: null, at: null }]);
      setDraft(""); setDraftCap("");
      // 🔒 貼到 ppt.cc 落地頁時提醒，但**不阻擋、不自動改寫他的網址**
      //    （TM-IMG-127 原樣儲存）。他可能真的想放落地頁。
      setErr(dup ? "這條網址已經在上面了，還是加上去了。"
        : tkPhotoLooksLikePptLanding(u)
          ? "這是 ppt.cc 的分享頁網址，不是圖片本身 —— 我們會自動改試圖片版（網址尾端加 @）。若還是預覽不出來，改用 " + TK_UPLOAD_HOST.name + " 重傳一次會比較單純。"
          : "");
    };

    // TM-IMG-142 / flow 四：移除要先確認，而且確認文案**必須寫出第二行**
    // （圖片仍在原網站上，平台刪不掉）。不寫的話，貼錯照片的人會以為
    // 自己已經把照片收回來了 —— 他沒有。
    // 🔴 不用 window.confirm：它會擋住整個分頁，而且塞不進第二行的語氣。
    const [pendingRemove, setPendingRemove] = React.useState(null);
    const removeAt = (i) => { onChange(rows.filter((_, idx) => idx !== i)); setPendingRemove(null); setErr(""); };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>{label || "現場照片（選填）"}</span>
          <Badge tone="neutral">{rows.length}／{TK_PHOTO_MAX}</Badge>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            {hint || "貼圖片網址即可，平台不保管圖片檔"}
          </span>
        </div>

        {/* 🚨 TM-IMG-141：常駐一行，不是 tooltip、不是 placeholder。
            這是本 Feature 風險最高的一點，而且沒有技術解 —— 能做的只有在他貼之前說這句話。 */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px",
          borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)",
          border: "1px solid var(--color-border-default)" }}>
          <Icon n="ShieldAlert" s={17} c="var(--color-fg-neutral-muted)" style={{ marginTop: 1, flexShrink: 0 }} />
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", textWrap: "pretty" }}>
            圖片存在外部網站，<strong style={{ color: "var(--color-fg-neutral-default)" }}>拿到網址的人都看得到</strong>。
            請避免拍到傷者面孔、門牌與證件。
          </span>
        </div>

        {rows.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {rows.map((p, i) => (
              <TKPhotoThumb key={`${p.url}:${i}`} photo={p} index={i}
                onRemove={() => setPendingRemove(i)}
                confirming={pendingRemove === i}
                onConfirmRemove={() => removeAt(i)}
                onCancelRemove={() => setPendingRemove(null)} />
            ))}
          </div>
        )}

        {/* 貼網址那一列。🔒 這裡沒有「選擇檔案」，也不會有。 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 84px", gap: 8, alignItems: "center" }}>
          <Input value={draft} onChange={(e) => { setDraft(e.target.value); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="貼上圖片網址，https:// 開頭" invalid={!!err} disabled={full} />
          {/* TM-IMG-124 ⚠️I-4：說明文字沒有人要求過，可刪。
              理由：救災現場一張沒有上下文的照片幫助有限。 */}
          <Input value={draftCap} onChange={(e) => setDraftCap(e.target.value)}
            placeholder="說明（選填）" disabled={full} />
          <Button variant="secondary" onClick={add} disabled={!draft.trim() || full}>加入</Button>
        </div>

        {err && <Alert tone="warning" title="這條網址">{err}</Alert>}
        {full && <Alert tone="warning" title={`已達 ${TK_PHOTO_MAX} 條上限`}>要再貼請先移除一條。</Alert>}

        {/* TM-IMG-131〜133：常駐入口 ＋ 三步，不寫教學長文。
            🔴 TM-IMG-132：一定要新分頁。同分頁開走 ＝ 正在填的任務單整張消失。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <a href={TK_PHOTO_UPLOAD_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
              borderRadius: "var(--radius-md)", border: "1px dashed var(--color-border-default)",
              font: "var(--font-label-400)", color: "var(--color-brand-secondary-default)", textDecoration: "none" }}>
            <Icon n="ExternalLink" s={15} c="var(--color-brand-secondary-default)" />
            還沒有圖片網址？到 {TK_UPLOAD_HOST.name} 上傳
          </a>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            {TK_UPLOAD_HOST.steps.map((t, i) => `${"①②③④⑤"[i]} ${t}`).join("　")}
          </span>
        </div>
      </div>
    );
  }

  Object.assign(window, { TKPhotoThumb, TKPhotoLinkEditor, tkPhotoList, tkPhotoNorm, tkPhotoUrlOk, tkPhotoLooksLikePptLanding, tkPhotoDerive, TK_UPLOAD_HOST, TK_PHOTO_MAX, TK_PHOTO_TIMEOUT_MS, TK_PHOTO_UPLOAD_URL });
})();
