/* st-app.jsx — 設定頁（2026-10-05）
 *
 * 起點（Sucre 09-13）：「設定全部藏在小框框裡不合理。」
 * 2026-10-03〜05 已定：
 *   - 一頁到底、不分頁（Q1）
 *   - 所有後台人員都看得到，只有超級管理員能改，其他人唯讀（Q5 選 A）
 *   - 不記錄開站人（後端 project_settings 沒有這一欄）
 *   - 現場分區屬於這次災害（後端沒有跨事件的建築表，每次部署重新開始）
 *   - 動態欄位要做 UI（後端 feature 018 已開表；前端還沒接）
 *
 * 🚨 我定的（未經裁示）：三區的分法與順序；ⓘ 事件卡改唯讀；現場分區的「開新地點」
 *    留在任務管理；不做必填（後端沒欄位）；災害欄位不能排序（照後端 ADR-248）；
 *    停用災害類型前要先從「這次災害」拿掉；所有說明文字。
 *
 * 🔒 text/babel 腳本不要用物件 rest 解構（09-27 的 _excluded 撞名事故）。
 */
(function () {
  const { Button, Field, Input, Alert, Badge, Switch, Checkbox } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // ── 小工具 ──────────────────────────────────────────────────────────────
  const toLocal = (s) => (s ? String(s).replace(" ", "T").slice(0, 16) : "");
  const fromLocal = (s) => (s ? s.replace("T", " ") : "");
  const nowText = () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const muted = { color: "var(--color-fg-neutral-muted)" };
  const subtle = { color: "var(--color-fg-neutral-subtle)" };

  function Dot({ color, size = 9 }) {
    return <span style={{ width: size, height: size, borderRadius: "var(--radius-full)", background: color, flexShrink: 0, display: "inline-block" }}></span>;
  }

  function TypeChip({ st, k, onRemove }) {
    const v = st.vocab.find((x) => x.key === k);
    const label = v ? v.label : k;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: onRemove ? "0 6px 0 12px" : "0 12px",
        borderRadius: "var(--radius-full)", border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)",
        font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>
        <Dot color={window.stColorFor(st, k)} />{label}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`從這次災害拿掉${label}`} title={`從這次災害拿掉「${label}」`}
            style={{ border: "none", background: "transparent", cursor: "pointer", lineHeight: 0, padding: 4, borderRadius: "var(--radius-full)" }}>
            <Icon n="X" s={14} c="var(--color-fg-neutral-muted)" />
          </button>
        )}
      </span>
    );
  }

  function PendingTag({ children, title }) {
    return (
      <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 20, padding: "0 8px", borderRadius: "var(--radius-full)",
        background: "var(--color-bg-warning-subtle)", color: "var(--color-fg-warning)", font: "var(--font-data-300)", fontWeight: 700, whiteSpace: "nowrap" }}>
        <Icon n="CircleDashed" s={12} c="currentColor" />{children}
      </span>
    );
  }

  // 名詞解釋：講欄位時一定先講定義（Sucre 10-05：「要講定義不然不知道幹嘛的」）
  function Glossary({ items }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 16, rowGap: 8, padding: "12px 16px",
        borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
        {items.map(([term, def]) => (
          <React.Fragment key={term}>
            <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap" }}>{term}</span>
            <span style={{ font: "var(--font-body-400)", ...subtle }}>{def}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  // 區塊：標題＋一句「這會影響誰」＋內容
  // phase：這一區屬於下一階段時傳 { tag, note }（2026-10-11 Sucre：10/24 之前不做，要讓前端一看就知道）。
  //   標題旁掛標籤、上方一行說明、內容整區淡灰。內容仍可點，方便看設計；data-phase="next" 給前端搜尋用。
  function Section({ id, icon, title, who, children, action, phase }) {
    return (
      <section id={id} data-st-section={id} data-phase={phase ? "next" : undefined} style={{ scrollMarginTop: 16, display: "flex", flexDirection: "column", gap: 16,
        padding: 24, borderRadius: "var(--radius-lg)", background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)" }}>
        <header style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-primary-subtle)", display: "inline-flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon n={icon} s={18} c="var(--color-brand-primary-subtle)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="wg-h600" style={{ margin: 0, font: "var(--font-heading-600)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {title}
              {phase && <PhaseTag>{phase.tag}</PhaseTag>}
            </h2>
            <div style={{ font: "var(--font-body-400)", marginTop: 2, ...muted }}>{who}</div>
          </div>
          {!phase && action}
        </header>
        {phase && (
          <div data-st="phaseNote" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-md)",
            border: "1px dashed var(--color-border-disable)", background: "var(--color-bg-neutral-sunken)", font: "var(--font-label-400)", color: "var(--color-fg-neutral-subtle)" }}>
            <Icon n="CalendarClock" s={16} c="currentColor" />{phase.note}
          </div>
        )}
        {phase
          ? <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: 0.5, filter: "grayscale(1)" }}>{children}</div>
          : children}
      </section>
    );
  }

  function PhaseTag({ children }) {
    return (
      <span data-st="phaseTag" style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 10px", borderRadius: "var(--radius-full)",
        background: "var(--color-bg-neutral-sunken)", border: "1px solid var(--color-border-disable)", color: "var(--color-fg-neutral-subtle)",
        font: "var(--font-data-300)", fontWeight: 700, whiteSpace: "nowrap" }}>
        <Icon n="Clock" s={12} c="currentColor" />{children}
      </span>
    );
  }

  function Row({ label, help, children }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "start", padding: "14px 0", borderTop: "1px solid var(--color-border-default)" }}>
        <div>
          <div style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{label}</div>
          {help && <div style={{ font: "var(--font-body-300)", marginTop: 4, ...muted }}>{help}</div>}
        </div>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    );
  }

  // 置中對話框。top 讓出緊急公告（EA-AB-147：浮層不蓋公告，用幾何不用 z-index）
  function Dialog({ title, width = 640, onClose, footer, children }) {
    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
      <div role="dialog" aria-label={title} data-st-dialog
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, top: "var(--wg-banner-bottom, 0px)", zIndex: 950,
          background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ width, maxWidth: "100%", maxHeight: "100%", display: "flex", flexDirection: "column", background: "var(--color-bg-neutral-default)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--color-border-default)" }}>
            <span style={{ flex: 1, font: "var(--font-heading-600)" }}>{title}</span>
            <button type="button" className="tk-iconbtn" aria-label="關閉" onClick={onClose}><Icon n="X" s={18} c="var(--color-fg-neutral-subtle)" /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--color-border-default)" }}>{footer}</div>
        </div>
      </div>
    );
  }

  function Confirm({ title, body, okText, danger, onOk, onClose }) {
    return (
      <Dialog title={title} width={480} onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => { onOk(); onClose(); }}>{okText}</Button>
        </>}>
        <div style={{ font: "var(--font-body-400)", ...subtle, lineHeight: 1.7 }}>{body}</div>
      </Dialog>
    );
  }

  const daysFrom = (s) => (window.wgEventDays ? window.wgEventDays({ startedAt: s }) : null);

  // 起始時間：第一次設定很順，之後要改得多一步確認（2026-10-05 Sucre）。
  // 理由：它一改，所有人側邊欄的「第 N 天」都會跳。project_settings 有進稽核紀錄。
  function StartTimeDialog({ current, onSave, onClose }) {
    const first = !current;
    const [v, setV] = React.useState(toLocal(current));
    const next = fromLocal(v);
    const future = v && Date.parse(v) > Date.now();
    const same = next === current;
    const err = !v ? "請選擇時間" : future ? "起始時間不能是未來" : null;
    return (
      <Dialog title={first ? "設定起始時間" : "修正起始時間"} width={520} onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!!err || same} onClick={() => onSave(next)} data-st="startedAtSave">{first ? "設定" : "確認修正"}</Button>
        </>}>
        <div style={{ font: "var(--font-body-400)", ...subtle }}>填<strong>災害發生</strong>的時間，不是平台上線的時間。</div>
        <Field label="起始時間" required error={v && err ? err : null}>
          <Input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} data-st="startedAtInput" style={{ maxWidth: 260 }} />
        </Field>
        {!first && !err && !same && (
          <Alert tone="warning" title="所有人都會看到天數改變">
            側邊欄會從「第 {daysFrom(current)} 天」變成「第 {daysFrom(next)} 天」。這次修改會留下紀錄（誰、什麼時候、從哪個時間改成哪個時間）。
          </Alert>
        )}
        {first && !err && <div style={{ font: "var(--font-body-300)", ...muted }}>設定後，側邊欄會顯示「第 {daysFrom(next)} 天」。</div>}
      </Dialog>
    );
  }

  // ════════ ① 這次災害 ════════════════════════════════════════════════════
  function EventSection({ st, update, canEdit, ask, goFields }) {
    const ev = st.event;
    // 起始時間不在這份草稿裡 —— 它另外走「設定／修正」對話框（2026-10-05 Sucre：不該隨手改到）
    const [draft, setDraft] = React.useState({ name: ev.name, shortName: ev.shortName });
    React.useEffect(() => { setDraft({ name: ev.name, shortName: ev.shortName }); }, [ev.name, ev.shortName]);
    const dirty = draft.name !== ev.name || draft.shortName !== ev.shortName;
    const [timeDialog, setTimeDialog] = React.useState(false);
    const nameErr = !draft.name.trim() ? "名稱不能空白" : null;

    const available = st.vocab.filter((v) => v.active && !ev.types.includes(v.key));
    const [adding, setAdding] = React.useState("");

    const B = window.WGBridge;
    const buildings = React.useMemo(() => { try { return B && B.readBuildings ? B.readBuildings() : []; } catch (e) { return []; } }, []);
    const segs = (b) => (B && B.buildingSegments ? B.buildingSegments(b) : []);

    const fieldCount = (k) => st.fields.filter((f) => f.kind === "disaster" && f.active && (f.disasterTypes || []).includes(k)).length;

    return (
      <Section id="event" icon="Radio" title="這次災害" who="這一次應變的基本資料。前台與後台所有人都會看到。">
        <Row label="災害名稱" help="事件卡與前台都會顯示。">
          <Field error={nameErr}>
            <Input value={draft.name} disabled={!canEdit} invalid={!!nameErr} data-st="name"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例：花蓮馬太鞍溪堰塞湖專案" />
          </Field>
        </Row>
        <Row label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>簡稱 <PendingTag title="後端 project_settings 只有一個 name，簡稱是原型自己加的顯示用欄位">後端沒有這一欄</PendingTag></span>}
          help="側邊欄放不下全名時用。不填就顯示全名。">
          <Input value={draft.shortName} disabled={!canEdit} data-st="shortName"
            onChange={(e) => setDraft({ ...draft, shortName: e.target.value })} placeholder="例：花蓮馬太鞍溪" />
        </Row>
        <Row label="起始時間" help="災害發生的時間，不是平台上線的時間。側邊欄的「第 N 天」從這裡算。">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minHeight: 36 }} data-st="startedAt">
            {ev.startedAt ? (
              <>
                <span style={{ font: "var(--font-data-500)", color: "var(--color-fg-neutral-default)" }}>{ev.startedAt}</span>
                <span style={{ font: "var(--font-body-300)", ...muted }}>今天是第 {daysFrom(ev.startedAt)} 天</span>
                {canEdit && <button type="button" className="tk-chipbtn" onClick={() => setTimeDialog(true)} data-st="fixStartedAt">修正起始時間</button>}
              </>
            ) : (
              canEdit
                ? <Button variant="secondary" size="sm" startIcon={<Icon n="Clock" s={14} />} onClick={() => setTimeDialog(true)} data-st="setStartedAt">設定起始時間</Button>
                : <span style={{ font: "var(--font-body-400)", ...muted }}>還沒有設定</span>
            )}
          </div>
          {timeDialog && (
            <StartTimeDialog current={ev.startedAt} onClose={() => setTimeDialog(false)}
              onSave={(v) => { setTimeDialog(false); update((s) => ({ ...s, event: { ...s.event, startedAt: v } }), ev.startedAt ? `起始時間已從 ${ev.startedAt} 修正為 ${v}` : `已設定起始時間 ${v}`); }} />
          )}
        </Row>
        {canEdit && dirty && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-warning)", marginRight: "auto" }}>有還沒儲存的修改</span>
            <Button variant="ghost" size="sm" onClick={() => setDraft({ name: ev.name, shortName: ev.shortName })}>還原</Button>
            <Button variant="primary" size="sm" disabled={!!nameErr} data-st="saveEvent"
              onClick={() => update((s) => ({ ...s, event: { ...s.event, name: draft.name.trim(), shortName: draft.shortName.trim() } }), "已儲存這次災害的基本資料")}>
              儲存
            </Button>
          </div>
        )}

        <Row label="這次用到的災害類型" help="選了哪幾種，任務單就會多出那幾種災害的專屬欄位。">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-st="eventTypes">
              {ev.types.map((k) => (
                <TypeChip key={k} st={st} k={k}
                  onRemove={canEdit && ev.types.length > 1 ? () => ask({
                    title: `從這次災害拿掉「${(st.vocab.find((v) => v.key === k) || {}).label || k}」？`,
                    body: <>新的任務單不會再出現這種災害的專屬欄位（{fieldCount(k)} 個）。<br />已經填過的值會保留，任務單上照樣看得到。</>,
                    okText: "拿掉", danger: true,
                    onOk: () => update((s) => ({ ...s, event: { ...s.event, types: s.event.types.filter((x) => x !== k) } }), "已從這次災害拿掉"),
                  }) : undefined} />
              ))}
              {!ev.types.length && <span style={{ font: "var(--font-body-400)", ...muted }}>還沒有選任何災害類型</span>}
            </div>
            {canEdit && available.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={adding} onChange={(e) => setAdding(e.target.value)} data-st="addEventType"
                  style={{ height: 36, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", font: "var(--font-body-400)", background: "var(--color-bg-neutral-default)" }}>
                  <option value="">選一種災害類型…</option>
                  {available.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
                <Button variant="secondary" size="sm" disabled={!adding} startIcon={<Icon n="Plus" s={14} />}
                  onClick={() => { const k = adding; setAdding(""); update((s) => ({ ...s, event: { ...s.event, types: [...s.event.types, k] } }), "已加入這次災害"); }}>
                  加入
                </Button>
              </div>
            )}
            {canEdit && <span style={{ font: "var(--font-body-300)", ...muted }}>清單裡沒有？到下面「災害類型」新增。</span>}
          </div>
        </Row>

        <Row label="現場分區" help="把一個地點再切成樓層、車廂或自訂區域。">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-st="buildings">
            {buildings.length ? buildings.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)" }}>
                <Icon n="Building2" s={16} c="var(--color-fg-neutral-subtle)" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ font: "var(--font-label-400)" }}>{b.alias || b.address}</div>
                  <div style={{ font: "var(--font-body-300)", ...muted }}>{segs(b).length} 個分區：{segs(b).slice(0, 4).join("、")}{segs(b).length > 4 ? "…" : ""}</div>
                </div>
              </div>
            )) : <span style={{ font: "var(--font-body-400)", ...muted }}>還沒有任何地點開啟分區。</span>}
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ font: "var(--font-body-300)", ...muted }}>開新地點要在地圖上選位置，所以在任務管理頁做。</span>
              <button type="button" className="tk-chipbtn" onClick={() => window.wgNavigate("ticket", "settings")}>
                前往任務管理 <Icon n="ArrowRight" s={12} c="currentColor" />
              </button>
            </span>
          </div>
        </Row>
      </Section>
    );
  }

  // ════════ ② 災害類型 ════════════════════════════════════════════════════
  function TypesSection({ st, update, canEdit, ask, goFields }) {
    const [adding, setAdding] = React.useState(false);
    const [form, setForm] = React.useState({ label: "", key: "" });
    const [touched, setTouched] = React.useState(false);
    const [renaming, setRenaming] = React.useState(null);
    const [renameText, setRenameText] = React.useState("");

    const keyTaken = st.vocab.some((v) => v.key === form.key.trim());
    const labelTaken = st.vocab.some((v) => v.label === form.label.trim());
    const errLabel = !form.label.trim() ? "請填名稱" : labelTaken ? "已經有同名的災害類型" : null;
    const errKey = !form.key.trim() ? "請填系統代碼" : !window.stValidKey(form.key.trim()) ? "只能用小寫英文、數字、底線，英文字母開頭，至少 2 個字" : keyTaken ? "這個代碼已經用過了（停用的也算）" : null;

    const fieldCount = (k) => st.fields.filter((f) => f.kind === "disaster" && (f.disasterTypes || []).includes(k)).length;

    const submit = () => {
      setTouched(true);
      if (errLabel || errKey) return;
      const v = { key: form.key.trim(), label: form.label.trim(), active: true };
      update((s) => ({ ...s, vocab: [...s.vocab, v] }), `已新增災害類型「${v.label}」`, {
        actionLabel: "接著幫它加欄位", action: () => goFields("disaster", v.key, true),
      });
      setForm({ label: "", key: "" }); setTouched(false); setAdding(false);
    };

    return (
      <Section id="types" icon="Tags" title="災害類型" who="平台上所有可以選的災害類型。遇到清單裡沒有的災害，可以在這裡新增。"
        action={canEdit && !adding && <Button variant="secondary" size="sm" startIcon={<Icon n="Plus" s={14} />} onClick={() => setAdding(true)} data-st="addType">新增災害類型</Button>}>
        <Glossary items={[
          ["名稱", "畫面上看到的字，例如「水災」。之後可以改。"],
          ["系統代碼", "系統內部用的英文代號，例如 flood。每張任務單、每個欄位都是用它記「我屬於哪一種災害」，所以建立後不能改 —— 改了舊資料就對不上。不想用了就停用。"],
        ]} />

        {adding && (
          <div data-st="typeForm" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: "var(--radius-md)", border: "1.5px solid var(--color-border-accent)", background: "var(--color-bg-primary-subtle)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="名稱" required error={touched ? errLabel : null}>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="例：核災" invalid={touched && !!errLabel} data-st="typeLabel" />
              </Field>
              <Field label="系統代碼" required helper={!(touched && errKey) ? "建立後不能改" : null} error={touched ? errKey : null}>
                <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })} placeholder="例：nuclear" invalid={touched && !!errKey} data-st="typeKey" style={{ fontFamily: "var(--font-data)" }} />
              </Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setTouched(false); setForm({ label: "", key: "" }); }}>取消</Button>
              <Button variant="primary" size="sm" onClick={submit} data-st="typeSubmit">新增</Button>
            </div>
          </div>
        )}

        <div role="table" data-st="vocab" style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr) 120px 110px 180px", gap: 12, padding: "10px 16px",
            background: "var(--color-bg-neutral-subtle)", font: "var(--font-label-300)", fontWeight: 700, ...subtle }}>
            <span>名稱</span><span>系統代碼</span><span>專屬欄位</span><span>這次災害</span><span></span>
          </div>
          {st.vocab.map((v) => {
            const inEvent = st.event.types.includes(v.key);
            const n = fieldCount(v.key);
            return (
              <div role="row" key={v.key} data-st-type={v.key} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr) 120px 110px 180px", gap: 12, alignItems: "center",
                padding: "10px 16px", borderTop: "1px solid var(--color-border-default)", opacity: v.active ? 1 : 0.55 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Dot color={window.stColorFor(st, v.key)} />
                  {renaming === v.key ? (
                    <Input value={renameText} autoFocus onChange={(e) => setRenameText(e.target.value)} style={{ height: 32 }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameText.trim()) { update((s) => ({ ...s, vocab: s.vocab.map((x) => x.key === v.key ? { ...x, label: renameText.trim() } : x) }), "已改名稱"); setRenaming(null); }
                        if (e.key === "Escape") setRenaming(null);
                      }} />
                  ) : (
                    <span style={{ font: "var(--font-label-400)" }}>{v.label}{!v.active && <span style={{ marginLeft: 8, font: "var(--font-data-300)", ...muted }}>已停用</span>}</span>
                  )}
                </span>
                <code style={{ justifySelf: "start" }}>{v.key}</code>
                <button type="button" className="tk-chipbtn" style={{ justifySelf: "start" }} onClick={() => goFields("disaster", v.key)}>{n} 個 <Icon n="ArrowDown" s={12} c="currentColor" /></button>
                <span>{inEvent ? <Badge tone="success">使用中</Badge> : <span style={{ font: "var(--font-data-300)", ...muted }}>—</span>}</span>
                <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {canEdit && renaming !== v.key && <button type="button" className="tk-chipbtn" onClick={() => { setRenaming(v.key); setRenameText(v.label); }}>改名稱</button>}
                  {canEdit && renaming === v.key && <button type="button" className="tk-chipbtn" onClick={() => setRenaming(null)}>取消</button>}
                  {canEdit && v.active && (
                    <button type="button" className="tk-chipbtn" disabled={inEvent}
                      title={inEvent ? "這次災害正在用，要先從上面「這次用到的災害類型」拿掉" : undefined}
                      style={inEvent ? { opacity: 0.5, cursor: "not-allowed" } : { color: "var(--color-fg-danger)" }}
                      onClick={() => ask({
                        title: `停用「${v.label}」？`,
                        body: <>停用後，新的任務單與欄位都不能再選這種災害。<br />已經存在的資料不會被刪，照樣看得到。之後可以恢復。</>,
                        okText: "停用", danger: true,
                        onOk: () => update((s) => ({ ...s, vocab: s.vocab.map((x) => x.key === v.key ? { ...x, active: false } : x) }), `已停用「${v.label}」`),
                      })}>停用</button>
                  )}
                  {canEdit && !v.active && <button type="button" className="tk-chipbtn" onClick={() => update((s) => ({ ...s, vocab: s.vocab.map((x) => x.key === v.key ? { ...x, active: true } : x) }), `已恢復「${v.label}」`)}>恢復</button>}
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    );
  }

  // ════════ ③ 表單欄位 ════════════════════════════════════════════════════
  const GROUPS = {
    disaster: { label: "災害專屬欄位", icon: "CloudRain", desc: "跟著災害走。例如水災要問積水深度、土石流要問掩埋範圍。一個欄位可以同時屬於好幾種災害。", scopeLabel: "災害" },
    task:     { label: "需求欄位",     icon: "ClipboardList", desc: "跟著需求類型走。例如搜救要問受困人數、物資要問物品名稱。", scopeLabel: "需求類型" },
    station:  { label: "站點欄位",     icon: "Package", desc: "跟著站點類型走。例如供水點、醫療站各自要多記的東西。", scopeLabel: "站點類型" },
  };
  const scopesOf = (kind) => kind === "task" ? window.ST_TASK_TYPES : kind === "station" ? window.ST_STATION_TYPES : null;

  function FieldDialog({ st, kind, initial, defaultScope, onSave, onClose }) {
    const isNew = !initial;
    const [f, setF] = React.useState(() => initial ? { ...initial, optionsText: (initial.options || []).join("\n") } : {
      kind, scope: kind === "disaster" ? undefined : defaultScope, key: "", label: "", dataType: "text", optionsText: "", unit: "", hint: "",
      disasterTypes: kind === "disaster" && defaultScope ? [defaultScope] : [], active: true,
    });
    const [touched, setTouched] = React.useState(false);
    const sel = f.dataType === "single_select" || f.dataType === "multi_select";
    const options = f.optionsText.split("\n").map((x) => x.trim()).filter(Boolean);
    const sameGroup = st.fields.filter((x) => x.kind === kind && (kind === "disaster" || x.scope === f.scope) && x.id !== (initial && initial.id));
    const errLabel = !f.label.trim() ? "請填欄位名稱" : null;
    const errKey = !isNew ? null : !f.key.trim() ? "請填欄位代碼" : !window.stValidKey(f.key.trim()) ? "只能用小寫英文、數字、底線，英文字母開頭" : sameGroup.some((x) => x.key === f.key.trim()) ? "這一組已經有同樣代碼的欄位（停用的也算）" : null;
    const errOpt = sel && !options.length ? "至少要有一個選項" : null;
    const similar = f.label.trim() && sameGroup.find((x) => x.label === f.label.trim());
    const typeChanged = !isNew && initial.dataType !== f.dataType;
    const vocab = st.vocab.filter((v) => v.active || f.disasterTypes.includes(v.key));
    const toggleType = (k) => setF({ ...f, disasterTypes: f.disasterTypes.includes(k) ? f.disasterTypes.filter((x) => x !== k) : [...f.disasterTypes, k] });

    const save = () => {
      setTouched(true);
      if (errLabel || errKey || errOpt) return;
      const out = { ...f, key: f.key.trim(), label: f.label.trim(), options: sel ? options : [], unit: f.dataType === "number" ? f.unit.trim() : "", hint: (f.hint || "").trim() };
      delete out.optionsText;
      onSave(out);
    };

    return (
      <Dialog title={isNew ? `新增${GROUPS[kind].label.replace("欄位", "")}欄位` : `編輯欄位「${initial.label}」`} onClose={onClose}
        footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={save} data-st="fieldSave">{isNew ? "新增欄位" : "儲存"}</Button></>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="欄位名稱" required error={touched ? errLabel : null} helper={!(touched && errLabel) ? "填單的人看到的題目，之後可以改" : null}>
            <Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="例：積水深度" data-st="fieldLabel" />
          </Field>
          <Field label="欄位代碼" required error={touched ? errKey : null} helper={!(touched && errKey) ? (isNew ? "系統存值用的英文代號，建立後不能改" : "建立後不能改") : null}>
            <Input value={f.key} disabled={!isNew} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase() })} placeholder="例：water_depth" data-st="fieldKey" style={{ fontFamily: "var(--font-data)" }} />
          </Field>
        </div>
        {similar && <Alert tone="warning" title="已經有同名的欄位">這一組已經有「{similar.label}」。如果是同一件事，建議直接用那一個，不要開兩個。（只是提醒，仍可以新增）</Alert>}

        {kind !== "disaster" && (
          <Field label={GROUPS[kind].scopeLabel} required>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(scopesOf(kind)).map(([k, d]) => (
                <button key={k} type="button" disabled={!isNew} onClick={() => setF({ ...f, scope: k })}
                  style={{ height: 34, padding: "0 14px", borderRadius: "var(--radius-full)", cursor: isNew ? "pointer" : "default",
                    border: f.scope === k ? "1.5px solid var(--color-bg-primary)" : "1px solid var(--color-border-default)",
                    background: f.scope === k ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)", font: "var(--font-label-400)", opacity: !isNew && f.scope !== k ? 0.45 : 1 }}>{d.label}</button>
              ))}
            </div>
          </Field>
        )}

        <Field label="填寫方式" required>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }} data-st="dataTypes">
            {Object.entries(window.ST_DATA_TYPES).map(([k, d]) => {
              const on = f.dataType === k;
              return (
                <button key={k} type="button" onClick={() => setF({ ...f, dataType: k })} data-st-dt={k}
                  style={{ textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius-md)", cursor: "pointer",
                    border: on ? "1.5px solid var(--color-bg-primary)" : "1px solid var(--color-border-default)",
                    background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)" }}>
                  <div style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{d.label}</div>
                  <div style={{ font: "var(--font-body-300)", marginTop: 2, ...muted }}>{d.hint}</div>
                </button>
              );
            })}
          </div>
        </Field>
        {typeChanged && <Alert tone="warning" title="改了填寫方式">已經填過的值會原樣保留。跟新的填寫方式對不上的值會被標出來，不會被改掉或刪掉。</Alert>}

        {sel && (
          <Field label="選項" required error={touched ? errOpt : null} helper={!(touched && errOpt) ? "一行一個。拿掉的選項，已經填過的值照樣保留。" : null}>
            <textarea value={f.optionsText} onChange={(e) => setF({ ...f, optionsText: e.target.value })} rows={4} data-st="fieldOptions"
              placeholder={"例：\n上升\n持平\n退去"}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", font: "var(--font-body-400)", resize: "vertical" }} />
          </Field>
        )}
        {f.dataType === "number" && (
          <Field label="單位" helper="選填，最多 20 字，例如 cm、人">
            <Input value={f.unit || ""} maxLength={20} onChange={(e) => setF({ ...f, unit: e.target.value })} style={{ maxWidth: 200 }} />
          </Field>
        )}
        {kind === "disaster" && (
          <Field label="提示" helper={`選填。顯示在欄位下方，用來提醒安全或說明怎麼填（${(f.hint || "").length}/200）`}>
            <Input value={f.hint || ""} maxLength={200} onChange={(e) => setF({ ...f, hint: e.target.value })} placeholder="例：不可為了量測進入危險區" />
          </Field>
        )}

        <Field label="適用災害" helper={f.disasterTypes.length ? null : "都不勾＝所有災害都會出現這個欄位"}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }} data-st="fieldTypes">
            {vocab.map((v) => (
              <Checkbox key={v.key} checked={f.disasterTypes.includes(v.key)} onChange={() => toggleType(v.key)}
                label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Dot color={window.stColorFor(st, v.key)} size={8} />{v.label}</span>} />
            ))}
          </div>
        </Field>
      </Dialog>
    );
  }

  function FieldRow({ st, f, canEdit, canOrder, isFirst, isLast, onMove, onEdit, onToggle, flash }) {
    const dt = window.ST_DATA_TYPES[f.dataType] || { label: f.dataType };
    const detail = f.options && f.options.length ? f.options.join("／")
      : (f.dataType === "single_select" || f.dataType === "multi_select") ? "（還沒有選項）"
      : f.unit ? `單位：${f.unit}` : "";
    return (
      <div role="row" data-st-field={f.key} style={{ display: "grid", gridTemplateColumns: (canOrder ? "56px " : "") + "minmax(0,1.4fr) 80px minmax(0,1.4fr) minmax(0,1.2fr) 112px",
        gap: 12, alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--color-border-default)",
        background: flash ? "var(--color-bg-primary-subtle)" : "transparent", transition: "background var(--transition-slow)" }}>
        {canOrder && (
          <span style={{ display: "inline-flex", gap: 2 }}>
            <button type="button" className="tk-iconbtn" aria-label="往上" disabled={!canEdit || isFirst} onClick={() => onMove(-1)} style={{ width: 26, height: 26, opacity: !canEdit || isFirst ? 0.3 : 1 }}><Icon n="ChevronUp" s={16} /></button>
            <button type="button" className="tk-iconbtn" aria-label="往下" disabled={!canEdit || isLast} onClick={() => onMove(1)} style={{ width: 26, height: 26, opacity: !canEdit || isLast ? 0.3 : 1 }}><Icon n="ChevronDown" s={16} /></button>
          </span>
        )}
        <span style={{ minWidth: 0, opacity: f.active ? 1 : 0.5 }}>
          <span style={{ font: "var(--font-label-400)", display: "block" }}>{f.label}{!f.active && <span style={{ marginLeft: 8, font: "var(--font-data-300)", ...muted }}>已停用</span>}</span>
          <code style={{ fontSize: 11 }}>{f.key}</code>
        </span>
        <span><Badge tone="neutral">{dt.label}</Badge></span>
        <span style={{ minWidth: 0, font: "var(--font-body-300)", ...subtle, opacity: f.active ? 1 : 0.5 }}>
          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={detail}>{detail || <span style={muted}>—</span>}</span>
          {f.hint && <span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}><Icon n="MessageSquareText" s={12} c="currentColor" />提示：{f.hint}</span>}
        </span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4, opacity: f.active ? 1 : 0.5 }}>
          {(f.disasterTypes || []).length ? f.disasterTypes.map((k) => {
            const v = st.vocab.find((x) => x.key === k);
            return <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "var(--font-data-300)", ...subtle }}><Dot color={window.stColorFor(st, k)} size={7} />{v ? v.label : k}</span>;
          }) : <span style={{ font: "var(--font-data-300)", ...muted }}>所有災害</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <Switch checked={f.active} disabled={!canEdit} onChange={onToggle} aria-label={f.active ? "停用這個欄位" : "啟用這個欄位"} />
          {canEdit && <button type="button" className="tk-chipbtn" onClick={onEdit}>編輯</button>}
        </span>
      </div>
    );
  }

  function FieldsSection({ st, update, canEdit, focus, ask }) {
    const [kind, setKind] = React.useState("disaster");
    const [scope, setScope] = React.useState("all");
    const [dialog, setDialog] = React.useState(null);   // { initial } | { new: true }
    const [flashKey, setFlashKey] = React.useState(null);

    // 從別區跳過來（例如「災害類型」那一列的「N 個」，或新增類型後的「接著幫它加欄位」）
    React.useEffect(() => {
      if (!focus) return;
      setKind(focus.kind); setScope(focus.scope || "all");
      if (focus.openNew && canEdit) setDialog({ new: true, scope: focus.scope });
    }, [focus && focus.n]);

    const scopes = kind === "disaster" ? null : scopesOf(kind);
    React.useEffect(() => { if (kind !== "disaster" && !(scope in scopesOf(kind))) setScope(Object.keys(scopesOf(kind))[0]); }, [kind]);

    const all = st.fields.filter((f) => f.kind === kind);
    let list;
    if (kind === "disaster") {
      list = all.filter((f) => scope === "all" || (f.disasterTypes || []).includes(scope) || !(f.disasterTypes || []).length);
      list = list.slice().sort((a, b) => a.key.localeCompare(b.key));   // ADR-248：照欄位代碼排，不能調
    } else {
      list = all.filter((f) => f.scope === scope).sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    const canOrder = kind !== "disaster";
    const countOf = (k) => kind === "disaster"
      ? all.filter((f) => (f.disasterTypes || []).includes(k)).length
      : all.filter((f) => f.scope === k).length;

    const move = (f, dir) => {
      const i = list.findIndex((x) => x.id === f.id); const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const ids = list.map((x) => x.id); const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      update((s) => ({ ...s, fields: s.fields.map((x) => ids.includes(x.id) ? { ...x, order: ids.indexOf(x.id) + 1 } : x) }), null);
    };
    const doFlash = (k) => { setFlashKey(k); setTimeout(() => setFlashKey(null), 2400); };

    const saveField = (out) => {
      if (dialog.initial) {
        update((s) => ({ ...s, fields: s.fields.map((x) => x.id === out.id ? out : x) }), `已儲存「${out.label}」`);
      } else {
        const order = (kind === "disaster" ? 0 : Math.max(0, ...st.fields.filter((x) => x.kind === kind && x.scope === out.scope).map((x) => x.order || 0)) + 1);
        update((s) => ({ ...s, fields: [...s.fields, { ...out, id: "n" + Date.now(), order }] }), `已新增欄位「${out.label}」`);
        if (kind !== "disaster" && out.scope !== scope) setScope(out.scope);
      }
      setDialog(null); doFlash(out.key);
    };

    const toggle = (f) => {
      if (f.active) {
        ask({
          title: `停用「${f.label}」？`,
          body: <>新的單子不會再出現這一題。<br />已經填過的值會保留，單子上照樣看得到（標示為已停用）。之後可以再打開。</>,
          okText: "停用", danger: true,
          onOk: () => update((s) => ({ ...s, fields: s.fields.map((x) => x.id === f.id ? { ...x, active: false } : x) }), `已停用「${f.label}」`),
        });
      } else {
        update((s) => ({ ...s, fields: s.fields.map((x) => x.id === f.id ? { ...x, active: true } : x) }), `已啟用「${f.label}」`);
      }
    };

    const scopeChip = (k, label, color, n) => (
      <button key={k} type="button" onClick={() => setScope(k)} data-st-scope={k}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: "var(--radius-full)", cursor: "pointer",
          border: scope === k ? "1.5px solid var(--color-bg-primary)" : "1px solid var(--color-border-default)",
          background: scope === k ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)", font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>
        {color && <Dot color={color} size={8} />}{label}{n != null && <span style={{ font: "var(--font-data-300)", ...muted }}>{n}</span>}
      </button>
    );

    return (
      <Section id="fields" icon="ListChecks" title="表單欄位" who="填任務單、建站點時要多問的題目。改了之後，所有人填的表單都會跟著變。"
        phase={{ tag: "下一階段 · 10/24 後", note: "這一區是下一階段的設計，這次不用實作。" }}
        action={canEdit && <Button variant="secondary" size="sm" startIcon={<Icon n="Plus" s={14} />} onClick={() => setDialog({ new: true, scope: scope === "all" ? null : scope })} data-st="addField">新增欄位</Button>}>
        <Glossary items={[
          ["欄位名稱", "填單的人看到的題目，例如「積水深度」。之後可以改。"],
          ["欄位代碼", "系統存答案用的英文代號，例如 water_depth。已經填過的答案都掛在它底下，所以建立後不能改。"],
          ["填寫方式", "這一題要怎麼回答：短文字、長文字、數字、是／否、單選、多選。"],
          ["適用災害", "這一題在哪幾種災害才出現。都不勾＝所有災害都出現。"],
          ["停用", "新的單子不再問這一題，已經填過的答案保留。欄位不能刪除。"],
        ]} />

        {/* 三組：這是「要看哪一組欄位」的切換，不是頁面分區 */}
        <div role="radiogroup" aria-label="欄位分組" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }} data-st="groups">
          {Object.entries(GROUPS).map(([k, g]) => {
            const on = kind === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => { setKind(k); setScope(k === "disaster" ? "all" : Object.keys(scopesOf(k))[0]); }} data-st-group={k}
                style={{ textAlign: "left", padding: "12px 14px", borderRadius: "var(--radius-md)", cursor: "pointer",
                  border: on ? "1.5px solid var(--color-bg-primary)" : "1px solid var(--color-border-default)",
                  background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>
                  <Icon n={g.icon} s={16} c="var(--color-fg-neutral-subtle)" />{g.label}
                  <span style={{ marginLeft: "auto", font: "var(--font-data-300)", ...muted }}>{st.fields.filter((f) => f.kind === k).length}</span>
                </span>
                <span style={{ display: "block", font: "var(--font-body-300)", marginTop: 4, ...muted }}>{g.desc}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ font: "var(--font-label-300)", fontWeight: 700, ...subtle, marginRight: 4 }}>{GROUPS[kind].scopeLabel}</span>
          {kind === "disaster"
            ? [scopeChip("all", "全部", null, all.length), ...st.vocab.filter((v) => v.active || countOf(v.key)).map((v) => scopeChip(v.key, v.label, window.stColorFor(st, v.key), countOf(v.key)))]
            : Object.entries(scopes).map(([k, d]) => scopeChip(k, d.label, null, countOf(k)))}
        </div>

        {kind === "disaster" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--font-body-300)", ...muted }}>
            <Icon n="Info" s={13} c="currentColor" />這一組的順序固定照欄位代碼排，不能調整（後端 ADR-248）。
          </div>
        )}

        <div role="table" data-st="fieldList" style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: (canOrder ? "56px " : "") + "minmax(0,1.4fr) 80px minmax(0,1.4fr) minmax(0,1.2fr) 112px", gap: 12, padding: "10px 16px",
            background: "var(--color-bg-neutral-subtle)", font: "var(--font-label-300)", fontWeight: 700, ...subtle }}>
            {canOrder && <span>順序</span>}<span>欄位名稱／代碼</span><span>填寫方式</span><span>選項・單位・提示</span><span>適用災害</span><span style={{ textAlign: "right" }}>啟用</span>
          </div>
          {list.map((f, i) => (
            <FieldRow key={f.id} st={st} f={f} canEdit={canEdit} canOrder={canOrder} isFirst={i === 0} isLast={i === list.length - 1}
              flash={flashKey === f.key} onMove={(d) => move(f, d)} onEdit={() => setDialog({ initial: f })} onToggle={() => toggle(f)} />
          ))}
          {!list.length && (
            <div data-st="fieldsEmpty" style={{ padding: "28px 16px", textAlign: "center", borderTop: "1px solid var(--color-border-default)" }}>
              <div style={{ font: "var(--font-body-400)", ...subtle }}>這一類還沒有欄位。</div>
              <div style={{ font: "var(--font-body-300)", marginTop: 4, ...muted }}>沒有欄位也能照常建單，只是不會多問問題。</div>
              {canEdit && <div style={{ marginTop: 12 }}><Button variant="secondary" size="sm" startIcon={<Icon n="Plus" s={14} />} onClick={() => setDialog({ new: true, scope: scope === "all" ? null : scope })}>新增第一個欄位</Button></div>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <PendingTag title="ERD 的 ticket_property_config／task_property_config／station_property_config 都沒有 required 欄位">後端沒有「必填」</PendingTag>
          <span style={{ font: "var(--font-body-300)", ...muted }}>規格（TM-CF-106）要求每個欄位能設必填或選填，但後端三張欄位設定表都沒有這一欄，所以這裡先不做。</span>
        </div>

        {dialog && (
          <FieldDialog st={st} kind={kind} initial={dialog.initial} defaultScope={dialog.scope || (kind === "disaster" ? null : scope)}
            onSave={saveField} onClose={() => setDialog(null)} />
        )}
      </Section>
    );
  }

  // ════════ 本體 ═══════════════════════════════════════════════════════════
  function SettingsBody({ persona }) {
    const role = window.wgActingPlatformRole ? window.wgActingPlatformRole(persona) : persona.rbac;
    const canEdit = role === "super";
    const [st, setSt] = React.useState(() => window.stLoad());
    const [toast, setToast] = React.useState(null);
    const [confirm, setConfirm] = React.useState(null);
    const [focus, setFocus] = React.useState(null);
    const toastTimer = React.useRef(null);
    const scrollRef = React.useRef(null);

    // update(fn, 提示文字, { actionLabel, action })
    const update = (fn, msg, extra) => {
      setSt((prev) => {
        const next = fn(prev);
        const withLog = msg ? { ...next, log: [{ at: nowText(), by: persona.name, text: msg }, ...(next.log || [])].slice(0, 50) } : next;
        window.stSave(withLog);
        return withLog;
      });
      if (msg) {
        clearTimeout(toastTimer.current);   // 09-19 bug #5：連續兩次提示，前一個計時器會把後一個提早關掉
        setToast({ msg, actionLabel: extra && extra.actionLabel, action: extra && extra.action });
        toastTimer.current = setTimeout(() => setToast(null), extra && extra.action ? 8000 : 3200);
      }
    };

    const goFields = (kind, scope, openNew) => {
      setFocus({ kind, scope, openNew, n: Date.now() });
      const el = document.getElementById("fields");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const jump = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

    React.useEffect(() => {   // #types / #fields 直接落到那一區
      const h = (location.hash || "").replace("#", "");
      if (h) setTimeout(() => jump(h), 80);
    }, []);

    const reset = () => setConfirm({
      title: "把原型資料重設回初始值？", body: "只影響這台裝置的原型示範資料。正式版沒有這個按鈕。", okText: "重設", danger: true,
      onOk: () => { window.stReset(); const s = window.stSeed(); setSt(s); window.stSave(s); },
    });

    return (
      <div ref={scrollRef}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "12px 0 48px", display: "flex", flexDirection: "column", gap: 20 }}>
          {!canEdit && (
            <Alert tone="info" title="你可以查看所有設定" data-st="readonly">只有超級管理員可以修改。想改什麼，請聯絡超級管理員。</Alert>
          )}

          {/* 頁內跳轉：一頁到底，但讓人一眼知道有哪幾區 */}
          <nav aria-label="設定分區" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[["event", "這次災害"], ["types", "災害類型"], ["fields", "表單欄位", true]].map(([id, label, next]) => (
              <button key={id} type="button" className="tk-chipbtn" style={{ height: 30, padding: "0 14px", font: "var(--font-label-400)", color: next ? "var(--color-fg-neutral-muted)" : undefined }} onClick={() => jump(id)}>
                {label}{next && <span style={{ font: "var(--font-data-300)" }}>· 下一階段</span>}
              </button>
            ))}
            <button type="button" onClick={reset} data-st-reset
              style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", font: "var(--font-data-300)", ...muted, textDecoration: "underline" }}>
              原型：重設示範資料
            </button>
          </nav>

          <EventSection st={st} update={update} canEdit={canEdit} ask={setConfirm} goFields={goFields} />
          <TypesSection st={st} update={update} canEdit={canEdit} ask={setConfirm} goFields={goFields} />
          <FieldsSection st={st} update={update} canEdit={canEdit} ask={setConfirm} focus={focus} />
        </div>

        {toast && (
          <div role="status" data-st="toast" style={{ position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 960,
            display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderRadius: "var(--radius-full)", background: "#0F172A", color: "#fff",
            font: "var(--font-label-400)", boxShadow: "var(--shadow-lg)" }}>
            <Icon n="Check" s={16} c="#fff" />{toast.msg}
            {toast.action && (
              <button type="button" onClick={() => { const a = toast.action; setToast(null); a(); }}
                style={{ border: "none", background: "transparent", color: "var(--color-bg-primary)", cursor: "pointer", font: "var(--font-label-400)" }}>{toast.actionLabel}</button>
            )}
          </div>
        )}
        {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
      </div>
    );
  }

  function SettingsApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "super");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];
    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({ id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label }))}
        value={role} onChange={setRole}
        note="所有後台人員都看得到，只有超級管理員能改（2026-10-05 Q5）" />
    );
    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="settings"
          onNavigate={(id) => window.wgNavigate(id, "settings")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}>
          <SettingsBody key={role} persona={persona} />
        </window.WGShell>
      </window.WGPage>
    );
  }

  Object.assign(window, { SettingsApp, SettingsBody });
})();
