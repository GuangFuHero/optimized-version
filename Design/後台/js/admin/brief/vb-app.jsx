// vb-app.jsx — 志工行前資訊管理頁（後台第六個導覽項；VB-FEAT-001）
//
// ══════════════════════════════════════════════════════════════════════════
// 🔒 2026-09-14 裁示：**一個部署只有一份行前資訊。**
//
//    Sucre：「志工行前資訊應該是要點開問他要不要新增，新增的時候有幾個範本
//            可以預覽跟選擇。因為通常一個專案就是一個災害，所以不太會發佈
//            不同災害的範本。」
//
//    所以這一頁只有兩種樣子：
//      還沒建立 → 空狀態 ＋ 一顆「新增行前資訊」→ 選範本（可預覽）→ 進作業區
//      已經建立 → **「內容」分頁直接就是作業區**
//
//    🔒 **2026-09-14 第二次裁示：「內容」分頁是唯讀的著陸頁，點「編輯」才進作業區。**
//
//       Sucre：「他一點開這個頁面就直接進入編輯會不會有一點可怕？是不是要有一個過渡頁面，
//               就是進來然後跟他說現在是什麼樣子在前台？那你要編輯嗎？然後點擊編輯才開始。」
//
//       ⚠️ 這**推翻了同日稍早的 VB-BR-145a**，那條是我自己下的，理由是「少一次點擊」。
//          但成本算錯了：打開就是可編輯狀態，等於**隨時可能誤改已經對外的內容**。
//          誤觸的代價比多一次點擊大 —— 與「承接要確認對話框」、
//          「手機不加第二顆 FAB」是同一條原則。
//
//       🔒 著陸頁預設顯示**已發布版**（志工現在看到的那一份），不是草稿。
//          有未發布的草稿時上方提示並給一顆「看未發布的修改」，切過去**仍然是唯讀**。
//          理由：這一頁的標題是「前台現況」，預設顯示沒人看得到的內容會誤判。
//
//    ⚠️ 也**沒有**「改套另一個範本」的入口（裁示）。要換就自己改內容 ——
//       不為例外情況做一個會誤觸、而且一按就蓋掉三天工作的按鈕。
// ══════════════════════════════════════════════════════════════════════════
//
// 🔒 表 23／24 的兩個狀態在這一頁的體現：
//    「編輯」動到的永遠是草稿。前台顯示的永遠是已發布版本。
//    這條界線由 vb-data.js 守住，畫面只是把它講出來。
(function () {
  const { Button, Card, Badge, Alert, Tabs } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // ⚠️ DS 的間距刻度是 1/2/3/4/6/8/12/16/20/24，**跳過 5**。
  //    寫 var(--space-5) 不會報錯，只會讓整條宣告失效 → padding 變 0。
  const PAD = "var(--space-6)";

  // ══════════════════════════════════════════════════════════════════════
  // 🔒 裁示（2026-09-06）：編輯權限＝**超級管理員／政府**，與緊急公告同一組。
  //
  //   表 23 只寫「後臺管理者」、適用範圍寫「協調者或管理員」——「協調者」對不到
  //   平台上任何既有角色，這個洞是原文留下的，由該次裁示補上。
  //   理由：行前資訊與緊急公告一樣是**對全體志工的單向對外發言**，
  //   寫錯的後果是有人帶錯裝備、走錯路線。
  // ══════════════════════════════════════════════════════════════════════
  const canEditRoles = ["super", "gov"];

  function StateBadge({ st }) { return <Badge tone={st.tone}>{st.label}</Badge>; }

  // ── 新增：選範本（可預覽）────────────────────────────────────────────────
  //
  // 🔒 裁示：「新增的時候有幾個範本可以預覽跟選擇」。**預覽是重點** ——
  //    只給三個名字讓人選，等於要他憑災害名稱猜內容差在哪。
  //    左邊選、右邊看，選哪個右邊就換哪個。
  //
  // 🔒 「空白開始」排在範本後面（裁示）。已經有現成文案要貼進來的人
  //    不用先刪掉一堆範本內容。
  function TemplatePicker({ onCancel, onPick }) {
    const [sel, setSel] = React.useState(window.VB_TEMPLATES[0].key);
    const isBlank = sel === "__blank__";
    const t = window.VB_TEMPLATE_MAP[sel];
    const preview = window.vbTemplateContent(isBlank ? null : sel);

    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onCancel(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onCancel]);

    const options = [
      ...window.VB_TEMPLATES.map((x) => ({ key: x.key, label: x.label, icon: x.icon, sub: x.forWhat })),
      { key: "__blank__", label: "空白開始", icon: "FileText",
        sub: "完全空白，連標題都沒有。已經有現成文案要貼進來時用這個。" },
    ];

    return (
      /* 🔒 EA-AB-147（2026-09-14）：浮層**不得蓋住緊急公告**，也不得被它蓋住。
         用 `top: var(--wg-banner-bottom)` 而**不是** `inset: 0` ——
         正解是幾何不是 z-index：這個對話框 render 在 shell 的頂欄裡，
         而頂欄是 `sticky; z-index:100`，會開一個新的 stacking context，
         寫 z:950 也贏不了 z:300 的橫幅（EA-AB-148）。
         ⚠️ 後台用 `--wg-banner-bottom`（視窗座標的底部）不是前台的 `--wg-banner-h`：
            上面還有原型的角色切換列 52px，用高度會有 52px 壓在橫幅上。 */
      <div style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0,
        zIndex: 950, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }} />
        <div role="dialog" aria-modal="true" aria-label="選擇範本"
          style={{ position: "relative", width: "min(920px, 100%)", height: "min(700px, 100%)",
            background: "var(--color-bg-neutral-default)", borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          <div style={{ padding: "16px 24px 14px", borderBottom: "1px solid var(--color-border-default)",
            display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="wg-h700" style={{ fontSize: 19, margin: 0 }}>新增志工行前資訊</h2>
              <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: 3 }}>
                挑一個起點。<strong>選完就脫鉤</strong> —— 內容隨你改，系統不會記得你選的是哪一個。
              </div>
            </div>
            <button type="button" onClick={onCancel} aria-label="關閉"
              style={{ border: "none", background: "var(--color-bg-neutral-subtle)", borderRadius: "var(--radius-full)",
                width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--color-fg-neutral-subtle)", flexShrink: 0 }}>
              <Icon n="X" s={19} c="currentColor" />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            {/* 左：選項 */}
            <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid var(--color-border-default)",
              overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 6,
              background: "var(--color-bg-neutral-subtle)" }}>
              {options.map((o) => {
                const on = sel === o.key;
                return (
                  <button key={o.key} type="button" data-vb-template={o.key}
                    onClick={() => setSel(o.key)} aria-pressed={on}
                    style={{ textAlign: "left", display: "flex", gap: 10, padding: "12px 12px", minHeight: 44,
                      borderRadius: "var(--radius-md)", cursor: "pointer", border: "none",
                      background: on ? "var(--color-bg-neutral-default)" : "transparent",
                      boxShadow: on ? "inset 0 0 0 1.5px var(--color-brand-secondary-default)" : "none" }}>
                    <span style={{ flexShrink: 0, marginTop: 1,
                      color: on ? "var(--color-brand-secondary-subtle)" : "var(--color-fg-neutral-muted)" }}>
                      <Icon n={o.icon} s={18} c="currentColor" />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", font: "var(--font-label-400)", fontWeight: on ? 700 : 500,
                        color: "var(--color-fg-neutral-default)" }}>{o.label}</span>
                      <span style={{ display: "block", marginTop: 3, font: "var(--font-body-300)", fontSize: 12,
                        lineHeight: 1.55, color: "var(--color-fg-neutral-subtle)" }}>{o.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 右：預覽。用的是前台同一支呈現元件，看到的就是志工會看到的排版。 */}
            <div data-vb-preview={sel} style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "18px 24px" }}>
              {isBlank ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  padding: "80px 0", textAlign: "center", color: "var(--color-fg-neutral-muted)" }}>
                  <Icon n="FileText" s={34} c="var(--color-fg-neutral-muted)" />
                  <span className="wg-caption" style={{ lineHeight: 1.8 }}>
                    建立出來是<strong>完全空白</strong>的一份，連段落標題都沒有。<br />
                    ⚠️ 其他三個範本會帶四個段落標題（如何參與／交通資訊／建議攜帶裝備／行前注意事項）——
                    那是去年光復實際用過的順序，不確定要寫什麼時，從範本開始比從空白開始快。
                  </span>
                </div>
              ) : (
                <React.Fragment>
                  <div style={{ display: "flex", gap: 8, padding: "10px 12px", marginBottom: 16,
                    borderRadius: "var(--radius-md)", background: "var(--color-bg-warning-subtle)" }}>
                    <Icon n="TriangleAlert" s={16} c="var(--color-fg-warning)" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span className="wg-caption" style={{ color: "var(--color-fg-warning)", lineHeight: 1.7 }}>
                      範本裡的地點、時間、管制範圍都是<strong>示意</strong>，括號的地方要換成本次災害的實況。
                      <strong>不要直接發布</strong>。
                    </span>
                  </div>
                  <window.BriefingArticle content={preview} compact />
                </React.Fragment>
              )}
            </div>
          </div>

          <div style={{ flexShrink: 0, padding: "14px 24px", borderTop: "1px solid var(--color-border-default)",
            background: "var(--color-bg-neutral-subtle)", display: "flex", gap: 8, alignItems: "center" }}>
            <Button variant="primary" onClick={() => onPick(isBlank ? null : sel)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Icon n="Check" s={16} c="currentColor" />
              用{isBlank ? "空白" : `「${t.label}」範本`}建立
            </Button>
            <Button variant="ghost" onClick={onCancel}>取消</Button>
            <span className="wg-caption" style={{ marginLeft: "auto", color: "var(--color-fg-neutral-muted)" }}>
              建立出來的是<strong>草稿</strong>，不會馬上對外
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── 空狀態：還沒建立 ────────────────────────────────────────────────────
  function EmptyCreate({ canEdit, onCreate }) {
    return (
      <Card padding="var(--space-8)" data-vb-empty
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          textAlign: "center", maxWidth: 620, margin: "24px auto 0" }}>
        <Icon n="BookOpen" s={40} c="var(--color-fg-neutral-muted)" />
        <div className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>還沒有志工行前資訊</div>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.85 }}>
          志工在前台會看到一則空白提示 —— 他們得自己去問交通怎麼走、要帶什麼。<br />
          一個專案就是一場災害，所以<strong>只需要建立一份</strong>。
          可以從三個範本挑一個當起點，也可以空白開始。
        </div>
        {canEdit ? (
          <Button variant="primary" onClick={onCreate}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 2 }}>
            <Icon n="Plus" s={16} c="currentColor" />新增行前資訊
          </Button>
        ) : (
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            你的身份只能閱讀，不能建立。
          </span>
        )}
      </Card>
    );
  }

  // ── 著陸頁：唯讀，回答「現在前台是什麼樣子」（2026-09-14 第二次裁示）──────────
  //
  // 🔒 這一頁**不能編輯任何東西**。它要回答三件事，順序不能反：
  //    1. 志工現在看不看得到（以及看到的是哪一版、什麼時候發的）
  //    2. 他們看到的**實際內容**長什麼樣
  //    3. 我要不要去改
  //
  // 🔒 預設顯示**已發布版**。有未發布草稿時給一顆切換，切過去仍然唯讀 ——
  //    這一頁的標題是「前台現況」，預設顯示沒人看得到的內容會讓人誤判已經發出去了。
  function LandingView({ rec, canEdit, onEdit, persona, flash, onChanged }) {
    const st = window.vbState(rec);
    const [showDraft, setShowDraft] = React.useState(false);
    const [confirm, setConfirm] = React.useState(null);   // publish | unpublish
    const hasDraft = Boolean(rec && rec.draft && st.key === "dirty");
    const viewing = showDraft && hasDraft ? rec.draft.content
      : (rec && rec.published ? rec.published.content : (rec && rec.draft ? rec.draft.content : window.vbEmptyContent()));
    const changed = window.vbChangedBlocks(rec);
    // 🔴 **不可以用 `version - 1` 當「上一版」。** 版號取「歷史最大 +1」，
    //    下架後重發會跳號（VB-BR-135）—— 要問的是版本史裡真正的前一筆。
    const vlist = (rec && rec.versions) || [];
    const prevVer = vlist.length >= 2 ? vlist[vlist.length - 2].version : null;
    // 只有「對外中」時才有辦法標「這次更新」—— 看草稿時沒有基準可比
    const stampAt = st.pub && !showDraft ? rec.published.at : null;

    function publish() {
      const r = window.vbPublish(persona.name);
      setConfirm(null); setShowDraft(false); onChanged();
      flash(`第 ${r.published.version} 版已發布，志工現在看到的就是這一份。`);
    }
    function unpublish() {
      window.vbUnpublish(persona.name);
      setConfirm(null); onChanged();
      flash("已下架，前台不再顯示。內容保留為草稿。");
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 動作列。「編輯」是主要動作，但它在這一頁是**離開唯讀**的入口，不是預設狀態。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <StateBadge st={st} />
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            {st.pub
              ? <>第 {rec.published.version} 版 · {window.vbClock(rec.published.at)} 由 {rec.published.by} 發布</>
              : <>從未對外{((rec && rec.versions) || []).length ? "（曾發布過，目前已下架）" : ""}</>}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canEdit && (
              <Button variant="primary" onClick={onEdit} data-vb-edit-btn
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Icon n="PencilLine" s={16} c="currentColor" />編輯內容
              </Button>
            )}
            {canEdit && hasDraft && (
              <Button variant="secondary" onClick={() => setConfirm("publish")}>發布修改</Button>
            )}
            {canEdit && !st.pub && rec && rec.draft && (
              <Button variant="secondary" onClick={() => setConfirm("publish")}>發布到前台</Button>
            )}
            {canEdit && st.pub && (
              <Button variant="ghost" onClick={() => setConfirm("unpublish")}>從前台下架</Button>
            )}
          </div>
        </div>

        {confirm === "publish" && (
          <Alert tone="danger" title="確認發布？">
            <span style={{ lineHeight: 1.8 }}>
              發布後<strong>所有志工立刻看到這一份</strong>（含未登入的人）。
              {st.pub
                ? <>目前的第 {rec.published.version} 版會<strong>整份被取代</strong>。</>
                : <>這會是第一次對外。</>}
              {hasDraft && !showDraft && <><br />⚠️ 你現在看的是<strong>已發布的那一版</strong>。
                建議先按「看未發布的修改」確認要發出去的內容。</>}
              <br />
              <span style={{ display: "inline-flex", gap: 8, marginTop: 8 }}>
                <Button size="sm" variant="primary" onClick={publish}>確認發布</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>取消</Button>
              </span>
            </span>
          </Alert>
        )}

        {confirm === "unpublish" && (
          <Alert tone="danger" title="確認下架？">
            <span style={{ lineHeight: 1.8 }}>
              下架後<strong>前台的行前資訊會整個變成空白</strong>，
              正在路上的志工再打開就看不到裝備清單了。<br />
              內容不會刪除，會退回草稿，隨時可以再發布。
              <br />
              <span style={{ display: "inline-flex", gap: 8, marginTop: 8 }}>
                <Button size="sm" variant="primary" onClick={unpublish}>確認下架</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>取消</Button>
              </span>
            </span>
          </Alert>
        )}

        {/* 有未發布的修改 —— 這是編輯者最容易誤判「我已經改好了」的一刻，所以要明講。 */}
        {hasDraft && (
          <div data-vb-draft-notice style={{ display: "flex", gap: 8, alignItems: "flex-start",
            padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg-info-subtle)" }}>
            <Icon n="FileEdit" s={16} c="var(--color-fg-info)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span className="wg-caption" style={{ flex: 1, minWidth: 0, color: "var(--color-fg-info)", lineHeight: 1.7 }}>
              有一份<strong>還沒發布的修改</strong>（{window.vbAgo(rec.draft.at)}由 {rec.draft.by} 存的）。
              志工現在看到的仍是第 {rec.published.version} 版。
            </span>
            <button type="button" data-vb-toggle-draft onClick={() => setShowDraft((v) => !v)}
              style={{ flexShrink: 0, border: "none", background: "var(--color-bg-neutral-default)",
                borderRadius: "var(--radius-full)", minHeight: 30, padding: "0 12px", cursor: "pointer",
                font: "var(--font-label-400)", fontSize: 12, color: "var(--color-fg-info)",
                boxShadow: "inset 0 0 0 1px var(--color-fg-info)" }}>
              {showDraft ? "看志工目前看到的" : "看未發布的修改"}
            </button>
          </div>
        )}

        {/* 內容本體：唯讀。用的是前台同一支元件，所以這裡看到的就是志工看到的。 */}
        <Card padding={PAD} data-vb-landing={showDraft ? "draft" : "published"}
          style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Icon n={showDraft ? "FileEdit" : "Globe"} s={15}
              c={showDraft ? "var(--color-fg-info)" : "var(--color-fg-success)"} />
            <span className="wg-caption" style={{ fontWeight: 700,
              color: showDraft ? "var(--color-fg-info)" : (st.pub ? "var(--color-fg-success)" : "var(--color-fg-warning)") }}>
              {showDraft ? "未發布的修改（志工看不到）"
                : st.pub ? "志工現在在前台看到的內容" : "這一份還沒對外，志工看不到"}
            </span>
            <span className="wg-caption" style={{ marginLeft: "auto", color: "var(--color-fg-neutral-muted)" }}>
              唯讀 —— 要改請按「編輯內容」
            </span>
          </div>
          <div style={{ height: 1, background: "var(--color-border-default)" }} />
          {stampAt && <window.BriefingStamp at={stampAt} version={rec.published.version} />}
          {/* 🔒 2026-09-20：這一行原本在作業區的側欄，Sucre 回報「資料哪裡來的？看不太懂」。
              三個毛病：①作業區整區講的是「我接下來要做什麼」，這一行講的是「上次發生過什麼」
              ②沒說跟什麼比 ③**沒有 72 小時時效**，前台早就不標了它還掛著。
              → 搬到著陸頁（這一頁的職責就是「前台現況」），並補上跟誰比、什麼時候發的。 */}
          {!showDraft && changed.length > 0 && st.pub && prevVer !== null && (
            <div data-vb-changed-summary className="wg-caption"
              style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7, marginTop: -6 }}>
              第 {rec.published.version} 版跟上一版（第 {prevVer} 版）相比，
              動到的是：<strong>{changed.join("、")}</strong>
              {window.vbIsRecent(stampAt)
                ? "。這幾段在前台會標「這次更新」，發布滿 72 小時後自動取消。"
                : "。發布已超過 72 小時，前台不再標記。"}
            </div>
          )}
          <window.BriefingArticle content={viewing}
            changed={showDraft ? [] : changed} at={stampAt} />
        </Card>
      </div>
    );
  }

  // ── 作業區（按下「編輯內容」才進來）────────────────────────────────────────
  function EditView({ persona, canEdit, flash, onDone }) {
    const [rec, setRec] = React.useState(() => window.vbRead());
    const [work, setWork] = React.useState(() => window.vbWorking(window.vbRead()));
    const [preview, setPreview] = React.useState(false);
    const [confirm, setConfirm] = React.useState(null);   // publish | discard | unpublish | leave
    const [more, setMore] = React.useState(false);        // 側欄的「更多動作」（反悔區）
    const [err, setErr] = React.useState("");
    const st = window.vbState(rec);

    // 相對於「已存起來的那一份」有沒有動過。
    const saved = rec && rec.draft ? rec.draft.content
      : (rec && rec.published ? rec.published.content : window.vbEmptyContent());
    const dirty = !window.vbSameContent(work, saved);
    const empty = window.vbIsEmpty(work);

    function save() {
      try { window.vbSaveDraft(work, persona.name); setErr(""); setRec(window.vbRead());
        flash("草稿已儲存。前台沒有任何變化。"); }
      catch (e) { setErr("存不進去 —— 瀏覽器的儲存空間滿了，多半是圖片太大。請把圖片改成網址，或縮小後再插入。"); }
    }
    function publish() {
      try {
        if (dirty) window.vbSaveDraft(work, persona.name);
        const r = window.vbPublish(persona.name);
        setErr(""); setRec(r); setConfirm(null);
        flash(`第 ${r.published.version} 版已發布，志工現在看到的就是這一份。`);
      } catch (e) { setErr("發布失敗 —— 瀏覽器的儲存空間滿了。"); setConfirm(null); }
    }
    function discard() {
      window.vbDiscardDraft(persona.name);
      const r = window.vbRead();
      setRec(r); setWork(window.vbWorking(r)); setConfirm(null);
      flash(r && r.published ? "草稿已丟棄，回到目前對外的內容。" : "草稿已丟棄。");
    }
    function unpublish() {
      const r = window.vbUnpublish(persona.name);
      setRec(r); setWork(window.vbWorking(r)); setConfirm(null);
      flash("已下架，前台不再顯示。內容保留為草稿。");
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 頂列：離開 ＋ 狀態 ＋ 預覽切換。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* 🔒 有未存修改時不直接離開（2026-09-14）—— 作業區是唯一會產生
              「改了半天沒存」的地方，而編輯者切回著陸頁時腦中想的是「看一下」，
              不是「丟掉我剛打的字」。 */}
          {/* 🔒 2026-09-19：回報「離開編輯只有左上角一個箭頭，會找不到」。
              這顆從 ghost 升成 secondary，文字也從「完成」改成「完成編輯」——
              單獨一個「完成」在一堆內容旁邊讀不出它是**離開**的意思。 */}
          <Button size="sm" variant="secondary"
            onClick={() => { if (dirty) setConfirm("leave"); else onDone(); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon n="ArrowLeft" s={15} c="currentColor" />完成編輯
          </Button>
          <StateBadge st={st} />
          {dirty && <Badge tone="warning">尚未儲存</Badge>}
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            {st.pub
              ? <>第 {rec.published.version} 版 · {window.vbClock(rec.published.at)} 由 {rec.published.by} 發布</>
              : <>從未對外{(rec && rec.versions || []).length ? "（曾發布過，目前已下架）" : ""}</>}
          </span>
          <div style={{ marginLeft: "auto", display: "inline-flex", gap: 2, padding: 3, borderRadius: 10,
            border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-sunken)" }}>
            {[[false, "編輯"], [true, "志工看到的樣子"]].map(([v, label]) => (
              <button key={String(v)} type="button" onClick={() => setPreview(v)} aria-pressed={preview === v}
                style={{ height: 30, padding: "0 14px", borderRadius: 8, cursor: "pointer", border: "none", whiteSpace: "nowrap",
                  background: preview === v ? "var(--color-bg-neutral-default)" : "transparent",
                  boxShadow: preview === v ? "var(--shadow-sm)" : "none",
                  font: "var(--font-label-400)", fontWeight: preview === v ? 700 : 400,
                  color: preview === v ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {err && <Alert tone="danger" title="沒有存起來">{err}</Alert>}

        {/* 這一行必須永遠在：正在改的是草稿，不是志工現在看到的東西 */}
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)",
          background: "var(--color-bg-info-subtle)" }}>
          <Icon n="Info" s={16} c="var(--color-fg-info)" style={{ marginTop: 2, flexShrink: 0 }} />
          <span className="wg-caption" style={{ color: "var(--color-fg-info)", lineHeight: 1.7 }}>
            這裡改的是<strong>草稿</strong>。存檔不會動到前台。
            {st.pub
              ? <>志工現在看到的是 {window.vbClock(rec.published.at)} 發布的第 {rec.published.version} 版，
                  直到你按下「發布」為止。</>
              : <>前台目前<strong>沒有任何行前資訊</strong>，要按「發布」才會出現。</>}
            <br />改完按右邊的「<strong>完成編輯</strong>」回到總覽 —— 沒存的修改會先問你。
          </span>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

          <div style={{ flex: "1 1 560px", minWidth: 0 }}>
            {preview ? (
              <Card padding={PAD} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
                  這是<strong>目前編輯中的內容</strong>在前台的實際樣子（同一支元件，不是另外做的示意圖）。
                  {st.pub && "按下發布之前，志工看到的還是上一版。"}
                </div>
                <div style={{ height: 1, background: "var(--color-border-default)" }} />
                <window.BriefingArticle content={work} />
              </Card>
            ) : (
              <window.BriefEditor docKey="single" content={work}
                onChange={(html) => setWork(html)} />
            )}
          </div>

          {/* 側欄：動作。黏在上面，段落很長時不用捲回去找按鈕 */}
          <div style={{ flex: "0 1 280px", minWidth: 240, position: "sticky", top: 0,
            display: "flex", flexDirection: "column", gap: 12 }}>
            <Card padding="var(--space-4)" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {!canEdit ? (
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
                  你的身份只能閱讀，不能儲存或發布。
                </span>
              ) : confirm === "publish" ? (
                <React.Fragment>
                  <span className="wg-caption" style={{ color: "var(--color-fg-danger)", lineHeight: 1.75 }}>
                    發布後，<strong>所有志工立刻看到這一份</strong>（含未登入的人）。
                    {st.pub
                      ? <>目前的第 {rec.published.version} 版會<strong>整份被取代</strong>，舊內容不會殘留在頁面上。</>
                      : <>這會是第一次對外。</>}
                    {empty && <><br /><strong>內容是空的</strong> —— 發布一份空白內容，志工會以為系統壞了。</>}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant="primary" onClick={publish} disabled={empty}>確認發布</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>返回修改</Button>
                  </div>
                </React.Fragment>
              ) : confirm === "discard" ? (
                <React.Fragment>
                  <span className="wg-caption" style={{ color: "var(--color-fg-danger)", lineHeight: 1.75 }}>
                    丟棄後回到{st.pub ? `目前對外的第 ${rec.published.version} 版` : "空白"}，草稿的修改救不回來。
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant="primary" onClick={discard}>確認丟棄</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>取消</Button>
                  </div>
                </React.Fragment>
              ) : confirm === "leave" ? (
                <React.Fragment>
                  <span className="wg-caption" style={{ color: "var(--color-fg-warning)", lineHeight: 1.75 }}>
                    有還沒儲存的修改，離開就沒了。
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button size="sm" variant="primary" onClick={() => { save(); onDone(); }}>存成草稿再離開</Button>
                    <Button size="sm" variant="ghost" onClick={onDone}>直接離開</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>取消</Button>
                  </div>
                </React.Fragment>
              ) : confirm === "unpublish" ? (
                <React.Fragment>
                  <span className="wg-caption" style={{ color: "var(--color-fg-danger)", lineHeight: 1.75 }}>
                    下架後<strong>前台的行前資訊會整個變成空白</strong>，
                    正在路上的志工再打開就看不到裝備清單了。<br />
                    內容不會刪除，會退回草稿，隨時可以再發布。
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant="primary" onClick={unpublish}>確認下架</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>取消</Button>
                  </div>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  {/* 🔒 2026-09-20 重排。原則：**先狀態、再往前走的動作、最後才是反悔的動作。**
                      原本的順序是 儲存／發布／丟棄／下架／完成／狀態，三個問題：
                      ① **出口被埋在兩顆破壞性按鈕下面**，而「完成編輯」是存檔之後最高頻的動作 ——
                         往下點的手勢很容易掃到「丟棄草稿」，按下去剛打的字就沒了
                      ② 三顆 ghost 長得一模一樣，但一顆是「我走了」、兩顆會毀掉東西 ——
                         **份量要跟後果一致**（08-29 學到的那條）
                      ③ 狀態文字排在按鈕之後，可是它正是「要不要按儲存」的依據。先讀後做 */}
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
                    {dirty ? "有尚未儲存的修改。" : "目前沒有未儲存的修改。"}
                    <br />字數 {window.vbWordCount(work)}
                  </span>
                  <Button variant="secondary" disabled={!dirty} onClick={save}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <Icon n="Save" s={16} c="currentColor" />儲存草稿
                  </Button>
                  <Button variant="primary" onClick={() => setConfirm("publish")}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <Icon n="Send" s={16} c="currentColor" />發布到前台
                  </Button>
                  {/* 🔒 第二個出口（VB-BR-145j）。**移到這裡跟儲存／發布同一群** ——
                      它們都是「我做完了」，而不是「我反悔了」。
                      改用 secondary 而不是 ghost：它是這一區第二高頻的動作，
                      一個只有文字的 ghost 在滿版內容旁邊等於隱形。
                      兩個出口走**同一段邏輯**（有未存修改一律先問），不是兩套行為。 */}
                  <Button variant="secondary"
                    onClick={() => { if (dirty) setConfirm("leave"); else onDone(); }}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <Icon n="Check" s={16} c="currentColor" />完成編輯，回到總覽
                  </Button>

                  {/* ── 反悔區 ──────────────────────────────────────────────
                      🔒 收在分隔線下、預設折疊、文字用 danger 色。
                      ⚠️ 折疊會讓下架多一次點擊 —— **那是刻意的**：
                         「從前台下架」會讓正在路上的志工打開看到空白，它不該順手。
                      🔒 「從前台下架」排在最後，因為它是唯一會影響**已經出發的人**的動作；
                         「丟棄草稿」只影響還沒對外的東西，兩者不同級。 */}
                  {((rec && rec.draft) || st.pub) && (
                    <React.Fragment>
                      <div style={{ height: 1, background: "var(--color-border-default)", margin: "2px 0" }} />
                      <button type="button" data-vb-more onClick={() => setMore((v) => !v)}
                        aria-expanded={more}
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: "4px 0",
                          minHeight: 30, display: "inline-flex", alignItems: "center", gap: 6,
                          font: "var(--font-label-400)", fontSize: 13, color: "var(--color-fg-neutral-muted)" }}>
                        <Icon n={more ? "ChevronDown" : "ChevronRight"} s={14} c="currentColor" />更多動作
                      </button>
                      {more && (
                        <React.Fragment>
                          {(rec && rec.draft) && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirm("discard")}
                              style={{ color: "var(--color-fg-danger)" }}>丟棄草稿</Button>
                          )}
                          {st.pub && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirm("unpublish")}
                              style={{ color: "var(--color-fg-danger)" }}>從前台下架</Button>
                          )}
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  )}
                </React.Fragment>
              )}
            </Card>

            <Card padding="var(--space-4)">
              <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.75 }}>
                <strong>寫給誰看：</strong>還沒出發、對現場一無所知的人。<br />
                現場的人已經知道路怎麼走 —— 這一頁不是寫給他們的。
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ── 已發布版本全文 ──────────────────────────────────────────────────────
  //
  // 🔒 裁示（2026-09-06）：「要留，只留已發布的版本」。草稿是過程不是事實。
  //    這一區要回答的問題只有一個：**當時到底叫志工帶什麼、走哪條路。**
  //    所以每一版都是完整內容，不是 diff —— 檢討時沒有人想在腦中套用差異。
  function VersionArchive() {
    const [open, setOpen] = React.useState(null);
    const rec = window.vbRead();
    const versions = window.vbVersions();
    const live = rec && rec.published ? rec.published.version : null;

    if (!versions.length) {
      return (
        <Card padding={PAD}>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
            還沒有任何已發布的版本。<br />
            版本會在<strong>按下發布</strong>的當下留存 —— 草稿存再多次都不會出現在這裡。
          </span>
        </Card>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.75 }}>
          每一版都留當時的<strong>完整內容</strong>，不是差異。災後檢討要回答的是
          「那天我們到底叫志工帶什麼」，而不是「第 3 版改了哪一行」。<br />
          ⚠️ 只留已發布的版本；草稿不留（2026-09-06 裁示）。
          正式版這是一張版本表，不是塞在同一列裡的陣列。
        </div>
        <Card padding={PAD} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {versions.map((v) => {
            const key = "v" + v.version;
            const on = open === key;
            return (
              <div key={key} data-vb-version={key}
                style={{ borderRadius: "var(--radius-md)", boxShadow: "inset 0 0 0 1px var(--color-border-default)", overflow: "hidden" }}>
                <button type="button" onClick={() => setOpen(on ? null : key)} aria-expanded={on}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, minHeight: 44,
                    padding: "0 12px", border: "none", cursor: "pointer", textAlign: "left",
                    background: on ? "var(--color-bg-neutral-subtle)" : "var(--color-bg-neutral-default)" }}>
                  <Icon n={on ? "ChevronDown" : "ChevronRight"} s={15} c="var(--color-fg-neutral-muted)" />
                  <span style={{ font: "var(--font-label-400)", fontWeight: 700 }}>第 {v.version} 版</span>
                  {v.version === live && <Badge tone="success">目前對外的</Badge>}
                  <span style={{ marginLeft: "auto", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
                    {window.vbClock(v.at)} · {v.by}
                  </span>
                </button>
                {on && (
                  <div style={{ padding: "14px 16px", borderTop: "1px solid var(--color-border-default)" }}>
                    <window.BriefingArticle content={v.content} compact />
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    );
  }

  // ── 編輯紀錄 ────────────────────────────────────────────────────────────
  function HistoryTimeline() {
    const rows = window.vbHistory();
    if (!rows.length) {
      return <Card padding={PAD}><span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>尚無紀錄。</span></Card>;
    }
    return (
      <Card padding={PAD} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
          「存成草稿」與「發布」在這裡分得出來 —— 前者前台沒有變化，後者有。
          正式版寫入 <code>audit_logs</code>。
          <br />要回看「第 2 版當時寫什麼」，切到「已發布版本」那一頁。
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((e, i) => {
            const K = window.VB_EVENT_LABEL[e.kind] || window.VB_EVENT_LABEL.save_draft;
            const last = i === rows.length - 1;
            return (
              <div key={e.id} data-vb-event={e.kind} style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 26 }}>
                  <span style={{ width: 26, height: 26, borderRadius: "var(--radius-full)", display: "grid", placeItems: "center",
                    background: K.tone === "primary" ? "var(--color-bg-secondary-subtle)" : "var(--color-bg-neutral-sunken)",
                    color: K.tone === "primary" ? "var(--color-brand-secondary-subtle)" : "var(--color-fg-neutral-muted)" }}>
                    <Icon n={K.icon} s={14} c="currentColor" />
                  </span>
                  {!last && <span style={{ flex: 1, width: 1, background: "var(--color-border-default)", minHeight: 14 }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ font: "var(--font-label-400)", fontWeight: 700 }}>{K.label}{e.note && `　${e.note}`}</span>
                    <span style={{ marginLeft: "auto", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
                      {window.vbClock(e.at)} · {e.actor}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  // ── 本體 ────────────────────────────────────────────────────────────────
  function BriefBody({ persona }) {
    const role = window.wgActingPlatformRole ? window.wgActingPlatformRole(persona) : persona.rbac;
    const canEdit = canEditRoles.includes(role);

    const [, force] = React.useReducer((x) => x + 1, 0);
    const [tab, setTab] = React.useState("content");
    // 🔒 2026-09-14 第二次裁示：「內容」分頁預設是**唯讀的著陸頁**，
    //    點「編輯內容」才切到作業區。打開就能改，等於隨時可能誤改已對外的內容。
    const [mode, setMode] = React.useState("view");   // view | edit
    const [picking, setPicking] = React.useState(false);
    const [toast, setToast] = React.useState(null);

    React.useEffect(() => window.vbSubscribe(force), []);

    // 🔴 每次 flash 都要**先清掉上一個計時器**。
    //    原本沒清：連續兩次提示時（例：先「已重設」再「已從範本建立」），
    //    前一個的 3.6 秒計時會把**後一個**提早關掉 ——
    //    使用者剛做完一個動作，回饋卻一閃就沒了，而且完全看不出原因。
    //    ⚠️ 同樣的寫法在 `an-app.jsx`（緊急公告）也有，那支還沒修。
    const toastTimer = React.useRef(null);
    React.useEffect(() => () => window.clearTimeout(toastTimer.current), []);
    function flash(msg) {
      window.clearTimeout(toastTimer.current);
      setToast(msg);
      toastTimer.current = window.setTimeout(() => setToast(null), 3600);
    }

    if (!canEdit) {
      // 乾淨切（2026-08-17 D-3）：側邊欄對其他身份不 render 這一項；
      // 直接開網址時由這一層擋下。正式版還要有 API 那一層。
      return (
        <div style={{ maxWidth: 620, margin: "72px auto 0", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 14, textAlign: "center" }}>
          <Icon n="ShieldAlert" s={40} c="var(--color-fg-neutral-muted)" />
          <div className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>這一頁需要超級管理員或政府身份</div>
          <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.8 }}>
            2026-09-06 裁示：行前資訊由<strong>超級管理員與政府</strong>維護，與緊急公告同一組。<br />
            理由是它和公告一樣是對全體志工的單向對外發言 —— 寫錯會有人帶錯裝備、走錯路線。<br />
            側邊欄上這一項對你的身份不會出現（乾淨切）；直接開網址時由這一層擋下。
            <strong>正式版還要有 API 那一層。</strong>
          </div>
        </div>
      );
    }

    const rec = window.vbRead();
    const st = window.vbState(rec);
    const exists = Boolean(rec && (rec.published || rec.draft));

    const toastNode = toast ? (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-md)",
        background: "var(--color-bg-success-subtle)", color: "var(--color-fg-success)", font: "var(--font-label-400)" }}>
        <Icon n="Check" s={16} c="currentColor" />{toast}
      </div>
    ) : null;

    return (
      <div style={{ maxWidth: 1080, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 這一頁的第一句話：志工現在看不看得到 */}
        <div data-vb-live={st.pub ? "yes" : "no"}
          style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            background: st.pub ? "var(--color-bg-success-subtle)" : "var(--color-bg-warning-subtle)" }}>
          <Icon n={st.pub ? "Globe" : "EyeOff"} s={16}
            c={st.pub ? "var(--color-fg-success)" : "var(--color-fg-warning)"}
            style={{ marginTop: 2, flexShrink: 0 }} />
          <span className="wg-caption" style={{ lineHeight: 1.75,
            color: st.pub ? "var(--color-fg-success)" : "var(--color-fg-warning)" }}>
            {st.pub
              ? <>志工在前台<strong>看得到</strong>行前資訊：第 {rec.published.version} 版，
                  {window.vbAgo(rec.published.at)}發布。
                  {st.key === "dirty" && <> 另有一份<strong>還沒發布的修改</strong>。</>}</>
              : <>前台<strong>目前沒有行前資訊</strong>。志工打開那一頁會看到空白提示。</>}
            <br />
            <span style={{ opacity: .85 }}>
              🔒 一個專案就是一場災害，所以<strong>只有一份</strong>，民眾也不需要自己選災害類型。
            </span>
          </span>
        </div>

        {exists && (
          /* 切到別的分頁再切回來時，回到唯讀 —— 不要讓「看一下紀錄」變成
             回來就處於可編輯狀態。 */
          <Tabs value={tab} onChange={(v) => { setTab(v); if (v !== "content") setMode("view"); }}
            tabs={[{ value: "content", label: "內容" },
                   { value: "history", label: "編輯紀錄" },
                   { value: "versions", label: "已發布版本" }]} />
        )}

        {toastNode}

        {!exists
          ? <EmptyCreate canEdit={canEdit} onCreate={() => setPicking(true)} />
          : tab === "versions" ? <VersionArchive />
          : tab === "history" ? <HistoryTimeline />
          : mode === "edit"
            ? <EditView persona={persona} canEdit={canEdit} flash={flash}
                onDone={() => { setMode("view"); force(); }} />
            : <LandingView rec={rec} canEdit={canEdit} persona={persona} flash={flash}
                onEdit={() => setMode("edit")} onChanged={force} />}

        {picking && (
          <TemplatePicker onCancel={() => setPicking(false)}
            onPick={(key) => {
              window.vbCreate(key, persona.name);
              // 🔒 剛建立完直接進作業區：範本的括號處**一定要改**，
              //    這一刻讓他停在唯讀頁看範本沒有意義。
              //    （唯讀著陸頁要防的是「誤改已經對外的內容」，剛建立的還沒對外。）
              setPicking(false); setTab("content"); setMode("edit"); force();
              flash(key
                ? `已從「${window.VB_TEMPLATE_MAP[key].label}」範本建立草稿。括號的地方要換成本次災害的實況。`
                : "已建立空白草稿。");
            }} />
        )}

        {/* 原型專用：回到「還沒建立」，用來看新增流程。正式版沒有這個。 */}
        {exists && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon n="FlaskConical" s={12} c="var(--color-fg-neutral-muted)" />
            <span style={{ font: "700 11px/1.4 var(--font-data)", color: "var(--color-fg-neutral-muted)" }}>
              原型工具（正式版沒有）
            </span>
            <button type="button" data-vb-reset
              onClick={() => { window.vbResetPrototype(); force(); flash("已重設，可以重看新增流程。"); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 6px",
                font: "var(--font-label-400)", fontSize: 12, color: "var(--color-fg-neutral-subtle)",
                textDecoration: "underline" }}>
              重設成「還沒建立」
            </button>
          </div>
        )}
      </div>
    );
  }

  function BriefApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "gov");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];

    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({
          id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label,
        }))}
        value={role} onChange={setRole}
        note="編輯權限為超級管理員／政府（2026-09-06 裁示，與緊急公告同一組）" />
    );

    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="brief"
          onNavigate={(id) => window.wgNavigate(id, "brief")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}
        >
          <BriefBody persona={persona} />
        </window.WGShell>
      </window.WGPage>
    );
  }

  Object.assign(window, { BriefApp, BriefBody });
})();
