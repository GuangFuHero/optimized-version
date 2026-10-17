// an-app.jsx — 緊急公告頁（後台第五個導覽項；EA-FEAT-001）
//
// 橫幅本身**不在這裡** —— 它在 an-banner.jsx，掛在 shell 上，所以每一頁都有
// （EA-AB-141）。這一頁只負責發布與關閉。
//
// ── 2026-09-04 重整 ────────────────────────────────────────────────────────
// 原本是「常駐表單 ＋ 啟用中 ＋ 已關閉 ＋ 操作紀錄」四塊同屏，Sucre 回報太複雜。
// 改成：
//   1. 主畫面只回答一個問題 ——「現在對外／對內在公告什麼」。
//   2. 發布收進**置中的對話框**，點了才展開。
//      99% 的時間沒有人要發公告，表單不該常駐佔掉半個畫面。
//      ⚠️ 2026-09-04 第二版：原本用側邊抽屜（480px），Sucre 回報「很擁擠、不像一個
//      正常的作業區」。抽屜適合「看一串東西」（通知收件匣），不適合「填一份東西」——
//      480px 塞不下橫排的選項，每一列都被迫堆成直的。改成置中對話框 680px。
//   3. 「已關閉」與「操作紀錄」**合併成一條時間軸**，移到第二個頁籤。
//      它們本來就是同一份資料的兩種寫法：已關閉那列寫的是誰發誰關，
//      操作紀錄寫的也是誰發誰關。留兩塊只是讓人多讀一次。
//
// 🔒 裁示 D-3（2026-08-29）：前後台公告都只有超級管理員與政府能發，沒有 Team 層級。
//    這**覆蓋正典 AC-06 與 PRD 權限表**，需 Owner 簽署決議記錄。
// 🔒 裁示（2026-09-04）：「前後台同時」是一則公告的第三個值，關閉時兩邊一起消失。
// 🔒 裁示 D-12（2026-09-04，取代 D-10／D-11 的整段討論）：
//    **每個頻道同一時間最多只有一則公告。前台一則，後台一則。**
//    Sucre：「從來不存在並存。」→ 發布就是取代，沒有選項、沒有勾選框、沒有排序。
//    所以「已有公告」的提示只是**陳述後果的一行**，不是要人做決定的警示塊 ——
//    沒有選擇可做，卻天天跳紅框，只會讓警示色貶值（同 EA-AB-122 不分級的道理）。
(function () {
  const { Button, Card, Badge, Field } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // ⚠️ DS 的間距刻度是 1/2/3/4/6/8/12/16/20/24，**跳過 5**。
  //    寫 var(--space-5) 會解析失敗 → padding 變 0 → 文字整個貼邊（2026-08-29 的爆版）。
  const PAD = "var(--space-6)";

  function RealmBadge({ realm }) {
    const R = window.AN_REALMS[realm];
    return (
      <Badge tone={R.tone} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon n={R.icon} s={12} c="currentColor" />{R.label}
      </Badge>
    );
  }

  // ── 發布對話框 ──────────────────────────────────────────────────────────
  function PublishDialog({ persona, onClose, onPublished }) {
    const [realm, setRealm] = React.useState("site");
    const [text, setText] = React.useState("");
    const [confirm, setConfirm] = React.useState(false);
    // 發布會取代掉的那則（每個頻道最多一則，D-12）。
    // ⚠️ 這裡沒有「保留並存」的狀態 —— 並存這個概念不存在了。
    const replaced = window.anClashing(realm);

    const n = window.anCount(text);
    const over = n > window.AN_MAX;                       // EA-AB-123
    const empty = !text.trim();
    const R = window.AN_REALMS[realm];

    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    function publish() {
      if (over || empty) return;
      const item = window.anPublish(realm, text, persona.name);
      onPublished(item, replaced.length);
      onClose();
    }

    return (
      <div style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 950, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }}></div>
        <div role="dialog" aria-label="發布公告" aria-modal="true"
          style={{ position: "relative", width: "min(680px, 100%)", maxHeight: "min(760px, 100%)",
            background: "var(--color-bg-neutral-default)", borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          <div style={{ padding: "16px 28px 14px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="wg-h700" style={{ fontSize: 19, margin: 0 }}>發布公告</h2>
              <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: 3 }}>
                公告不分級別 · 所有公告使用同一種視覺
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="關閉"
              style={{ border: "none", background: "var(--color-bg-neutral-subtle)", borderRadius: "var(--radius-full)",
                width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--color-fg-neutral-subtle)", flexShrink: 0 }}>
              <Icon n="X" s={19} c="currentColor" />
            </button>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

            {/* 發布目標（EA-AB-102）—— 三選一，含「前後台同時」 */}
            <Field label="發布目標" required>
              {/* 680px 放得下橫排三欄 —— 三個目標是同一個層級的選擇，直排會讀成有先後 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 4 }}>
                {Object.values(window.AN_REALMS).map((r) => {
                  const on = realm === r.key;
                  return (
                    <button key={r.key} type="button" data-an-pick={r.key}
                      onClick={() => { setRealm(r.key); setConfirm(false); }} aria-pressed={on}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
                        minHeight: 68, padding: "8px", borderRadius: "var(--radius-md)", cursor: "pointer", border: "none",
                        background: on ? "var(--color-bg-secondary-subtle)" : "var(--color-bg-neutral-subtle)",
                        boxShadow: on ? "inset 0 0 0 1.5px var(--color-brand-secondary-default)" : "inset 0 0 0 1px var(--color-border-default)",
                        color: on ? "var(--color-brand-secondary-subtle)" : "var(--color-fg-neutral-subtle)",
                        font: "var(--font-label-400)", fontWeight: on ? 700 : 400 }}>
                      <Icon n={r.icon} s={19} c="currentColor" />
                      <span>{r.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 400, opacity: .8, lineHeight: 1.3 }}>
                        {r.key === "both" ? "兩邊一起關" : r.key === "site" ? "含未登入訪客" : "僅後台使用者"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* EA-AB-134：按下去之前就要知道誰會看到。
                後台那句是「情境舉例二做不到」唯一的防線（裁示 D-5）。 */}
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)",
              background: realm === "admin" ? "var(--color-bg-info-subtle)" : "var(--color-bg-warning-subtle)" }}>
              <Icon n="Eye" s={16} c={realm === "admin" ? "var(--color-fg-info)" : "var(--color-fg-warning)"}
                style={{ marginTop: 2, flexShrink: 0 }} />
              <span className="wg-caption" style={{ lineHeight: 1.65,
                color: realm === "admin" ? "var(--color-fg-info)" : "var(--color-fg-warning)" }}>
                {R.who}
                {realm !== "site" && (
                  <><br /><span style={{ opacity: .85 }}>
                    要「只給特定單位看」需要單位定向，本版本不提供（裁示 D-5）。
                  </span></>
                )}
              </span>
            </div>

            {/* 已有公告時的警告（EA-AB-157a〜157c，裁示 D-10）——
                不擋發布（緊急廣播不該被額外步驟卡住），但也不預設覆蓋
                （把還有效的警告從前台弄消失，傷害比並存大）。
                與 MAP-ZD-144 同一條原則：要蓋掉別人的東西，得主動勾。 */}
            {replaced.length > 0 && (
              // EA-AB-157a／157g：一行，寫**後果**不寫現況。
              // 沒有選項可按（D-12：發布就是取代），所以也不需要一整塊警示 ——
              // 螢幕上每天都出現的紅框會變成背景噪音，等真的要警示時沒人看。
              <div data-an-replace style={{ display: "flex", gap: 8, alignItems: "flex-start",
                padding: "10px 12px", borderRadius: "var(--radius-md)",
                background: "var(--color-bg-neutral-subtle)",
                boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
                <Icon n="Replace" s={16} c="var(--color-fg-neutral-subtle)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-default)", fontWeight: 700 }}>
                    發布後會取代{replaced.length > 1 ? "以下公告" : `目前的${window.AN_REALMS[replaced[0].realm].label}公告`}
                  </span>
                  {replaced.map((a) => (
                    <span key={a.id} data-an-replace-id={a.id} className="wg-caption"
                      style={{ color: "var(--color-fg-neutral-subtle)", minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {replaced.length > 1 && `${window.AN_REALMS[a.realm].label}　`}「{a.text}」
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 文字 ＋ 字數（EA-AB-121 / 123） */}
            <Field label="公告文字" required helper="純文字，不含連結、圖片與換行。">
              <textarea value={text} autoFocus
                onChange={(e) => { setText(e.target.value.replace(/\n/g, " ")); setConfirm(false); }}
                rows={2} placeholder="例：大平村上游土石流警報，志工請暫停前往"
                style={{ width: "100%", boxSizing: "border-box", resize: "none", padding: "12px 14px",
                  borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: "none",
                  boxShadow: over ? "inset 0 0 0 1.5px var(--color-bg-danger)" : "inset 0 0 0 1px var(--color-border-default)",
                  font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", outline: "none", lineHeight: 1.6 }} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                <span className="wg-caption" style={{ fontFamily: "var(--font-data)", fontWeight: 700,
                  color: over ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)" }}>
                  {n}／{window.AN_MAX}
                </span>
                {over && (
                  <span className="wg-caption" style={{ color: "var(--color-fg-danger)", lineHeight: 1.6 }}>
                    超過 {n - window.AN_MAX} 字，請自行縮短 —— 系統不會替你截斷。
                  </span>
                )}
              </div>
            </Field>


          </div>

          {/* 草稿預覽（EA-AB-154／187）——
              ⚠️ 釘在底部、不在捲動區內。加了「已有公告」的警告之後，內容超過一個
              畫面高，預覽會被推到摺線以下 —— 那是按下發布前最後要確認的東西，
              藏起來等於沒有。用的是 an-banner.jsx 的同一支 AnnounceBar，預覽＝最終外觀。 */}
          <div style={{ flexShrink: 0, padding: "12px 28px 0", borderTop: "1px solid var(--color-border-default)",
            background: "var(--color-bg-neutral-subtle)" }}>
            <div className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)", marginBottom: 6 }}>
              草稿預覽 · 緊急公告的實際外觀
            </div>
            <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--color-border-default)" }}>
              {text.trim()
                ? <window.WGAnnounceBar text={text.trim()} muted={over} />
                : <div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 16px",
                    background: "var(--color-bg-neutral-default)", color: "var(--color-fg-neutral-muted)", font: "var(--font-label-400)" }}>
                    打字之後這裡會顯示緊急公告實際的樣子
                  </div>}
            </div>
          </div>

          {/* 動作列釘在底部 —— 表單自己捲，按鈕不會掉出畫面 */}
          <div style={{ flexShrink: 0, padding: "14px 28px", background: "var(--color-bg-neutral-subtle)" }}>
            {!confirm ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" disabled={over || empty} onClick={() => setConfirm(true)}>預覽無誤，發布</Button>
                <Button variant="ghost" onClick={onClose}>取消</Button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="wg-caption" style={{ color: "var(--color-fg-danger)", lineHeight: 1.7 }}>
                  這則會立刻出現在<strong>{R.label}的每一頁</strong>頂部。{R.who}
                  {replaced.length > 0 && (
                    <><br />同時會<strong>取代目前的 {replaced.length} 則</strong>，它立刻停止顯示。</>
                  )}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="primary" onClick={publish}>確認發布</Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>返回修改</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 啟用中的一則 ────────────────────────────────────────────────────────
  function LiveCard({ a, onClose }) {
    const [ask, setAsk] = React.useState(false);
    const R = window.AN_REALMS[a.realm];

    return (
      <Card padding={PAD} data-an-id={a.id} data-an-realm={a.realm}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RealmBadge realm={a.realm} />
          {/* 2026-09-19：時效拔掉之後這裡不再有「剩 N 小時」與「即將到期」。
              公告只有兩種消失方式：有人按下「關閉公告」，或被下一則取代。 */}
          <span style={{ marginLeft: "auto", font: "var(--font-data-300)",
            color: "var(--color-fg-neutral-muted)" }}>顯示中</span>
        </div>

        {/* 這一頁最重要的一行：現在到底在公告什麼 */}
        <div style={{ font: "var(--font-body-500)", fontSize: 16, lineHeight: 1.65,
          color: "var(--color-fg-neutral-default)" }}>{a.text}</div>

        <div style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
          {a.by} 於 {window.anClock(a.at)} 發布
        </div>

        {ask ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12,
            borderRadius: "var(--radius-md)", background: "var(--color-bg-danger-subtle)" }}>
            <span className="wg-caption" style={{ color: "var(--color-fg-danger)", lineHeight: 1.7 }}>
              關閉後即刻從{R.label}所有頁面消失
              {a.realm === "both" && <strong>（前台與後台會同時消失）</strong>}。
              內容保留在歷史紀錄，不會被刪除。
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="primary" onClick={() => { onClose(a); setAsk(false); }}>確認關閉</Button>
              <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>取消</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => setAsk(true)}>關閉公告</Button>
          </div>
        )}
      </Card>
    );
  }

  // ── 歷史時間軸（取代原本的「已關閉」＋「操作紀錄」兩塊）────────────────────
  function HistoryTimeline() {
    const rows = window.anHistory();
    if (!rows.length) {
      return <Card padding={PAD}><span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>尚無紀錄。</span></Card>;
    }
    return (
      <Card padding={PAD} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
          發布、關閉、取代都在同一條線上。<strong>「被人關掉」與「被新公告取代」分得出來</strong>（EA-AB-158）。<br />
          每一筆都留當時的文字全文，不是指向公告的 id —— 公告會被關掉，事後回查的人要看得到內容（EA-AB-162）。<br />
          正式版寫入 <code>audit_logs</code>。
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((e, i) => {
            const K = window.AN_EVENT_LABEL[e.kind] || window.AN_EVENT_LABEL.publish;
            const last = i === rows.length - 1;
            return (
              <div key={e.id} data-an-event={e.kind} style={{ display: "flex", gap: 12 }}>
                {/* 時間軸的線與點 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 26 }}>
                  <span style={{ width: 26, height: 26, borderRadius: "var(--radius-full)", display: "grid", placeItems: "center",
                    background: e.kind === "publish" ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-sunken)",
                    color: e.kind === "publish" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)" }}>
                    <Icon n={K.icon} s={14} c="currentColor" />
                  </span>
                  {!last && <span style={{ flex: 1, width: 1, background: "var(--color-border-default)", minHeight: 14 }}></span>}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>
                      {K.label}{e.note && `　${e.note}`}
                    </span>
                    <RealmBadge realm={e.realm} />
                    {e.stillLive && <Badge tone="success">仍在顯示</Badge>}
                    <span style={{ marginLeft: "auto", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
                      {window.anClock(e.at)} · {e.actor}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, font: "var(--font-body-400)", color: "var(--color-fg-neutral-subtle)", lineHeight: 1.65 }}>
                    {e.text}
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
  function AnnounceBody({ persona }) {
    const role = window.wgActingPlatformRole ? window.wgActingPlatformRole(persona) : persona.rbac;
    // 裁示 D-3：只有超級管理員與政府。沒有 Team 層級（EA-AB-111 / 112）。
    const canPublish = role === "super" || role === "gov";

    const [, force] = React.useReducer((x) => x + 1, 0);
    const [tab, setTab] = React.useState("live");
    const [drawer, setDrawer] = React.useState(false);
    const [toast, setToast] = React.useState(null);

    React.useEffect(() => {
      const off = window.anSubscribe(force);
      /* 2026-09-19：時效拔掉後不需要每秒掃到期，只靠 anSubscribe 推。 */
      return off;
    }, []);

    // EA-AB-113：介面藏起來不算數，這裡示範的是「直接開這一頁」時的那一層。
    if (!canPublish) {
      return (
        <div style={{ maxWidth: 620, margin: "72px auto 0", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 14, textAlign: "center" }}>
          <Icon n="ShieldAlert" s={40} c="var(--color-fg-neutral-muted)" />
          <div className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>這一頁需要超級管理員或政府身份</div>
          <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.8 }}>
            2026-08-29 裁示 D-3：前台與後台公告都只有超級管理員與政府能發布，沒有 Team 層級。<br />
            側邊欄上這一項對你的身份不會出現（乾淨切）；直接開網址時由這一層擋下 —— 正式版還要有 API 那一層。<br />
            <strong>你仍然看得到別人發的後台緊急公告</strong>，那與能不能發布無關（EA-AB-115）。
          </div>
          <div className="wg-caption" style={{ marginTop: 6, padding: "10px 14px", borderRadius: "var(--radius-md)",
            background: "var(--color-bg-warning-subtle)", color: "var(--color-fg-warning)", lineHeight: 1.7 }}>
            🚨 這條裁示<strong>覆蓋正典 AC-06 與 PRD 權限表</strong>（原本 Team Admin 可發自家 Team 的後台公告），<br />
            需要 Owner 簽署決議記錄才能交付。
          </div>
        </div>
      );
    }

    const live = window.anActiveAll();

    return (
      <div style={{ maxWidth: 780, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 動作列：一顆按鈕 ＋ 兩個頁籤。這一頁的全部入口就這些。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => setDrawer(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Icon n="Megaphone" s={16} c="currentColor" />發布公告
          </Button>

          <div style={{ marginLeft: "auto", display: "inline-flex", gap: 2, padding: 3, borderRadius: 10,
            border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-sunken)" }}>
            {[["live", `目前公告${live.length ? `（${live.length}）` : ""}`], ["history", "歷史紀錄"]].map(([id, label]) => {
              const on = tab === id;
              return (
                <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={on}
                  style={{ height: 30, padding: "0 14px", borderRadius: 8, cursor: "pointer", border: "none", whiteSpace: "nowrap",
                    background: on ? "var(--color-bg-neutral-default)" : "transparent", boxShadow: on ? "var(--shadow-sm)" : "none",
                    font: "var(--font-label-400)", fontWeight: on ? 700 : 400,
                    color: on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {toast && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-md)",
            background: "var(--color-bg-success-subtle)", color: "var(--color-fg-success)", font: "var(--font-label-400)" }}>
            <Icon n="Check" s={16} c="currentColor" />{toast}
          </div>
        )}

        {tab === "live" ? (
          live.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {live.map((a) => (
                <LiveCard key={a.id} a={a}
                  onClose={(x) => { window.anClose(x.id, persona.name); flash(`已關閉：「${x.text}」`); }} />
              ))}
            </div>
          ) : (
            <Card padding={PAD}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "36px 0",
                color: "var(--color-fg-neutral-muted)", textAlign: "center" }}>
                <Icon n="Megaphone" s={34} c="var(--color-fg-neutral-muted)" />
                <span className="wg-h600" style={{ color: "var(--color-fg-neutral-subtle)" }}>目前沒有任何公告</span>
                <span className="wg-caption" style={{ lineHeight: 1.7 }}>
                  前台與後台的每一頁頂部都乾淨的。<br />要對外或對內廣播一句話時，按左上角「發布公告」。
                </span>
              </div>
            </Card>
          )
        ) : <HistoryTimeline />}

        {drawer && (
          <PublishDialog persona={persona} onClose={() => setDrawer(false)}
            onPublished={(item, killed) => {
            setTab("live");
            flash(`已發布到${window.AN_REALMS[item.realm].label}`
              + (killed ? `，並關閉原有的 ${killed} 則` : ""));
          }} />
        )}
      </div>
    );

    function flash(msg) {
      setToast(msg);
      window.setTimeout(() => setToast(null), 3200);
    }
  }

  function AnnounceApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "gov");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];

    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({
          id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label,
        }))}
        value={role} onChange={setRole}
        note="發布只有超級管理員與政府（裁示 D-3，覆蓋正典 AC-06）" />
    );

    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="announce"
          onNavigate={(id) => window.wgNavigate(id, "announce")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}
        >
          <AnnounceBody persona={persona} />
        </window.WGShell>
      </window.WGPage>
    );
  }

  Object.assign(window, { AnnounceApp, AnnounceBody });
})();
