/* dd-app.jsx — 重複審核：畫面（頁面檔「重複審核 Duplicate Review.html」）
 *
 * 畫面：
 *   - 清單畫面：全寬，一對一列，點了才進比對畫面
 *   - 比對畫面：獨立一頁（網址帶 #D-301，可以用瀏覽器上一頁回清單），兩張並排：
 *     欄位名稱固定在左、每張的表頭固定在上
 *   - 送出前一定先跳確認視窗（DUP-BE-402），合併的確認視窗是「合併後那張單」的預覽（DUP-BE-413）
 * 規則全文在 dd-data.js 檔頭（DUP-BE-4xx）。這裡只在實作那一行旁邊寫編號與一句話。
 *
 * 對應後端（main，Spec 025＋028）：
 *   清單        GET  /admin/duplicate-pairs
 *   比對畫面    GET  /admin/duplicate-pairs/{uuid}       → tickets.low／high（兩張完整的單，含 version）
 *   合併        POST /admin/duplicate-pairs/{uuid}/resolve（primary、expected_versions、ticket、primary_tasks、secondary_tasks、photos、disaster_details、note）
 *   不是重複    reject（Spec 025）；站點的「確認重複」＝ confirm（只記判定，不動站點）
 *
 * 🚨 設計端先定的（未經團隊裁示，實作前可再確認）：
 *   - 清單／比對分兩個畫面、比對畫面上方有「上一對／下一對」
 *   - 處理完自動跳到下一對待處理；最後一對處理完回清單
 *   - 「只看有差異的欄位」開關；值相同的列合成一格寫「兩張相同」
 *   - 其他需求、照片預設全勾（沒勾就取消，預設勾比較不會漏）
 *   - 右邊數量旁邊提示兩邊加起來是多少，但不預設加總（同一件事報兩次時加總會變兩倍）
 *   - 每一列預設用 primary（ddPrimary）那張的值；那張沒填、另一張有填，就預設用另一張的（不然那個值就不見了）
 *
 * 🔒 text/babel 腳本不要用物件 rest 解構（09-27 的 _excluded 撞名事故）。
 */
(function () {
  // 🔒 DUP-BE-430：畫面上不出現「保留哪一張」。每列挑值、其他需求與照片勾選，使用者看的是「合併後的單」
  const { Button, Badge, Alert, Tabs } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const muted = { color: "var(--color-fg-neutral-muted)" };
  const subtle = { color: "var(--color-fg-neutral-subtle)" };
  const LABEL_W = 132;   // 比對表左邊欄位名稱的寬度
  const COL_W = 300;     // 每一張最少的寬度

  const nowText = () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const itemLabel = (g, it) => (g.kind === "station" ? it.stationId : it.ticketId);
  const itemTitle = (g, it) => (g.kind === "station" ? it.name : it.ticketTitle);
  const itemShort = (g, it) => (g.kind === "station" ? it.name : it.task.name);
  // DUP-BE-410：欄位一律從 ddFieldsFor 拿（dd-data.js），不在畫面上寫死
  const fieldsOf = (g) => window.ddFieldsFor(g);
  const fid = (f) => window.ddFieldId(f);
  const show = (f, v) => window.ddShow(f, v);
  const letter = (i) => String.fromCharCode(65 + i);
  const letterOf = (g, key) => letter(g.items.findIndex((i) => i.key === key));
  const T = (t) => window.ddTime(t);
  const QTY = "task:quantity";
  const kindLabel = (k) => ((window.TK_TASK_KIND || {})[k] || {}).label || k;

  // DUP-BE-431：送給後端的 primary。預設照 ddPrimary；審核員挑了另一張的地址，就換成那一張（畫面上不講）
  const defaultKept = (items) => window.ddPrimary(items);
  // 每一列預設用哪一張的值（不跟著 primary 變，免得挑了地址其他欄位跟著跳）
  function picksFor(g) {
    const p = {};
    const F = fieldsOf(g);
    const base = g.items.find((x) => x.key === window.ddPrimary(g.items));
    const other = g.items.find((x) => x !== base);
    const empty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
    (F.ticket || []).concat(F.task || []).forEach((f) => {
      if (f.primary) return;   // 地址＝primary，另外存
      // 預設那張沒填、另一張有填 → 預設用另一張的
      p[fid(f)] = other && empty(window.ddRead(base, f)) && !empty(window.ddRead(other, f)) ? other.key : base.key;
    });
    return p;
  }
  // ── DUP-BE-432：右邊「合併後的任務單」的值 ＝ 改過的（edits）優先，沒改就用左邊選的那張 ──
  //   edits 存的是輸入框裡的字串；轉回資料型別在 fromText()
  const isArr = (f, v) => Array.isArray(v) || (f.cfg && f.cfg.dataType === "multi_select");
  const isNum = (f) => f.number || (f.cfg && f.cfg.dataType === "number");
  function toText(f, v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.join("、");
    return String(v);
  }
  function fromText(f, text, picked) {
    if (text == null) return picked;
    const t = String(text).trim();
    if (t === "") return isArr(f, picked) ? [] : "";
    if (isArr(f, picked)) return t.split(/[、,，]/).map((x) => x.trim()).filter(Boolean);
    if (isNum(f)) return isNaN(Number(t)) ? t : Number(t);
    return text;
  }
  // 一個欄位在合併後的值
  function resultOf(g, kept, picks, edits, f) {
    const src = f.primary ? g.items.find((x) => x.key === kept) : (g.items.find((x) => x.key === picks[fid(f)]) || g.items.find((x) => x.key === kept));
    const picked = window.ddRead(src, f);
    if (f.primary || f.locked) return picked;
    return fromText(f, (edits || {})[fid(f)], picked);
  }
  const isEdited = (g, kept, picks, edits, f) => {
    if (!edits || edits[fid(f)] == null || f.primary || f.locked) return false;
    const src = g.items.find((x) => x.key === picks[fid(f)]) || g.items.find((x) => x.key === kept);
    return toText(f, window.ddRead(src, f)) !== String(edits[fid(f)]);
  };

  function Chip({ icon, children, tone }) {
    const bg = tone === "warning" ? "var(--color-bg-warning-subtle)" : tone === "danger" ? "var(--color-bg-danger-subtle)" : tone === "primary" ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-subtle)";
    const fg = tone === "warning" ? "var(--color-fg-warning)" : tone === "danger" ? "var(--color-fg-danger)" : tone === "primary" ? "var(--color-bg-primary)" : "var(--color-fg-neutral-subtle)";
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 8px", borderRadius: "var(--radius-full)",
        background: bg, color: fg, font: "var(--font-data-300)", fontWeight: 700, whiteSpace: "nowrap" }}>
        {icon && <Icon n={icon} s={12} c="currentColor" />}{children}
      </span>
    );
  }

  function LetterDot({ i, on, dim }) {
    return (
      <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: "var(--radius-full)",
        background: on ? "var(--color-bg-primary)" : "var(--color-bg-neutral-sunken)",
        color: on ? "var(--color-fg-on-primary)" : "var(--color-fg-neutral-subtle)", opacity: dim ? 0.6 : 1,
        font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{letter(i)}</span>
    );
  }

  function Radio({ on }) {
    return <span style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, borderRadius: "var(--radius-full)",
      border: "2px solid " + (on ? "var(--color-bg-primary)" : "var(--color-border-default)"),
      background: on ? "var(--color-bg-primary)" : "transparent", boxShadow: on ? "inset 0 0 0 2px var(--color-bg-neutral-default)" : "none" }}></span>;
  }

  // DUP-BE-430：其他需求、照片用勾選
  function Check({ on, disabled, onChange, children, name }) {
    return (
      <label data-dd-check={name} style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "default" : "pointer", minWidth: 0 }}>
        <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
          style={{ width: 16, height: 16, flexShrink: 0, accentColor: "var(--color-bg-primary)" }} />
        {children}
      </label>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // 畫面一：清單（全寬）
  // ════════════════════════════════════════════════════════════════════════
  function GroupRow({ g, can, onOpen }) {
    // DUP-BE-411：不顯示來源
    const out = window.DD_OUTCOME[g.status];
    const teams = [];
    g.items.forEach((i) => { const t = i.team || "尚未指派單位"; if (teams.indexOf(t) < 0) teams.push(t); });
    // DUP-BE-412：最早建立的時間＋兩張前後差多久（items 已依建立時間排）
    const first = g.items[0].createdAt, last = g.items[g.items.length - 1].createdAt;
    const gap = window.ddGap(first, last);
    return (
      <button type="button" className="dd-row" onClick={onOpen} data-dd-group={g.id}>
        <div className="dd-row-score">
          {g.status === "pending"
            ? <React.Fragment>
                <span style={{ font: "var(--font-label-400)", fontSize: 18, color: "var(--color-fg-neutral-default)" }}>{Math.round(g.score * 100)}%</span>
                <span style={{ font: "var(--font-data-300)", ...muted }}>相似度</span>
              </React.Fragment>
            : <Badge tone={out.tone}>{out.label}</Badge>}
        </div>
        <div className="dd-row-main">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>可能重複</span>
            <span style={{ font: "var(--font-data-300)", ...muted }}>{g.id}</span>
            {g.status === "pending" && !can && <Chip icon="Lock">只能查看</Chip>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {g.items.map((it, i) => (
              <span key={it.key} title={`${itemLabel(g, it)} · 建立 ${it.createdAt}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px 2px 3px", borderRadius: "var(--radius-full)",
                border: "1px solid var(--color-border-default)", font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)", maxWidth: 300 }}>
                <LetterDot i={i} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {itemShort(g, it)}{g.kind === "ticket" && it.task.quantity != null ? ` ×${it.task.quantity}` : ""}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="dd-row-meta">
          <span style={{ font: "var(--font-data-300)", ...muted }}>{teams.join("、")}</span>
        </div>
        <div className="dd-row-time" data-dd-row-time>
          <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)" }}>最早 {first}</span>
          <span style={{ font: "var(--font-data-300)", ...muted }}>{gap === "同時" ? "同時建立" : `前後差 ${gap}`}</span>
        </div>
        <Icon n="ChevronRight" s={18} c="var(--color-fg-neutral-muted)" />
      </button>
    );
  }

  function ListView({ list, access, view, tab, onOpen }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-dd-list>
        {list.length === 0 && (
          <div style={{ padding: "56px 12px", textAlign: "center", display: "flex", flexDirection: "column", gap: 6, alignItems: "center",
            border: "1px dashed var(--color-border-default)", borderRadius: "var(--radius-lg, 12px)" }}>
            <Icon n="CircleCheck" s={28} c="var(--color-fg-neutral-muted)" />
            <span style={{ font: "var(--font-label-400)" }}>{view === "pending" ? "目前沒有待處理的可能重複" : "還沒有處理過的"}</span>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.8, maxWidth: 520 }}>
              {view === "pending"
                ? <>系統發現兩張{tab === "station" ? "站點" : "任務單"}可能在講同一件事，就會出現在這裡。<br />來源有三種：有人建單或改單時與既有的很像、CSV 匯入時撞到既有資料，<br />或建單者被提醒後仍選擇送出。進來之後在這裡兩張並排比對，決定{tab === "station" ? "是不是重複" : "合併或「不是重複」"}。</>
                : `在「待處理」按下${tab === "station" ? "確認重複" : "合併"}或「不是重複」之後，會留在這裡，方便事後查是誰決定的。`}
            </span>
          </div>
        )}
        {list.map((g) => (
          <GroupRow key={g.id} g={g} can={window.ddCanHandle(g, access).can} onOpen={() => onOpen(g.id)} />
        ))}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // 畫面二：比對（兩張並排）
  // ════════════════════════════════════════════════════════════════════════

  // 每一張的表頭（凍結在比對表上方）：只留一行
  function ColumnHead({ g, it, idx, t0, allSame }) {
    const first = T(it.createdAt) === T(t0);
    // DUP-BE-412：凍結表頭上一直看得到「誰最早、另一張晚多久」
    const timeTag = allSame ? null : first ? "最早" : `晚 ${window.ddGap(t0, it.createdAt)}`;
    // DUP-BE-430：不顯示「保留／整張取消」
    return (
      <div className="dd-head" data-dd-col={it.key} style={{ background: "var(--color-bg-neutral-default)" }}>
        <LetterDot i={idx} />
        <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "baseline", gap: 6 }} title={itemTitle(g, it)}>
          <span style={{ font: "var(--font-data-300)", ...muted, flexShrink: 0 }}>{itemLabel(g, it)}</span>
          <span style={{ font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemTitle(g, it)}</span>
        </div>
        {timeTag && <span data-dd-headtime={it.key} title={`建立 ${it.createdAt}`} style={{ font: "var(--font-data-300)", whiteSpace: "nowrap", flexShrink: 0,
          color: first ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)", fontWeight: first ? 700 : 400 }}>{timeTag}</span>}
      </div>
    );
  }

  function CompareTable(props) {
    const g = props.g, kept = props.kept, picks = props.picks || {}, canEdit = props.canEdit, diffOnly = props.diffOnly;
    const items = g.items;
    const n = items.length;
    const ticket = g.kind === "ticket";
    const cols = `${LABEL_W}px repeat(${n}, minmax(${COL_W}px, 1fr))`;
    // DUP-BE-410：這一對有什麼欄位就列什麼（兩張都沒填的不列）
    const F = fieldsOf(g);
    const t0 = items.reduce((m, it) => (m == null || T(it.createdAt) < T(m) ? it.createdAt : m), null);
    const allSame = items.every((it) => T(it.createdAt) === T(t0));

    const Label = ({ children, top }) => <div className="dd-label" style={{ paddingTop: top || 10 }}>{children}</div>;
    const Section = ({ title, note, id }) => (
      <div style={{ gridColumn: "1 / -1", padding: "18px 0 6px", background: "var(--color-bg-neutral-default)" }} data-dd-section={id}>
        <div style={{ position: "sticky", left: 0, display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", maxWidth: "min(100%, 860px)", paddingLeft: 4 }}>
          <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{title}</span>
          {note && <span style={{ font: "var(--font-body-300)", ...muted }}>{note}</span>}
        </div>
      </div>
    );
    const SameCell = ({ v, tail }) => (
      <div style={{ gridColumn: `2 / span ${n}`, padding: "8px 10px", font: "var(--font-body-300)", ...muted, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "var(--color-fg-neutral-default)", whiteSpace: "pre-wrap" }}>{v}</span>
        <span style={{ font: "var(--font-data-300)" }}>· {tail || "兩張相同"}</span>
      </div>
    );
    const FieldLabel = ({ f, top }) => (
      <Label top={top}>{f.label}{f.inactive && <span style={{ display: "block", font: "var(--font-data-300)", ...muted }}>已停用的欄位</span>}</Label>
    );
    let hiddenSame = 0;

    // ── 基本資料 ──
    const infoRows = [];
    const plain = (key, content) => <div key={key} className="dd-info">{content}</div>;
    infoRows.push(<React.Fragment key="who"><Label top={6}>單位 · 建立者</Label>{items.map((it) => plain(it.key, `${it.team || "尚未指派單位"} · ${it.owner}`))}</React.Fragment>);
    // DUP-BE-412：建立時間＋跟最早那張差多久
    infoRows.push(
      <React.Fragment key="when"><Label top={6}>建立時間</Label>
        {allSame ? <SameCell v={t0} tail="兩張同時建立" /> : items.map((it) => {
          const first = T(it.createdAt) === T(t0);
          return plain(it.key, <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: "var(--color-fg-neutral-default)" }}>{it.createdAt}</span>
            {first ? <Chip icon="Clock">最早</Chip> : <span style={{ font: "var(--font-data-300)", ...muted }}>比另一張晚 {window.ddGap(t0, it.createdAt)}</span>}
          </span>);
        })}
      </React.Fragment>
    );
    if (items.some((it) => it.updatedAt && it.updatedAt !== it.createdAt)) {
      infoRows.push(<React.Fragment key="upd"><Label top={6}>最後修改</Label>{items.map((it) => plain(it.key, it.updatedAt && it.updatedAt !== it.createdAt ? it.updatedAt : <span style={muted}>建立後沒改過</span>))}</React.Fragment>);
    }
    if (!ticket && items.some((it) => it.pendingSuggestions)) {
      infoRows.push(<React.Fragment key="sug"><Label top={6}>注意</Label>{items.map((it) => plain(it.key, it.pendingSuggestions ? <Chip icon="MessageSquare">待審建議 {it.pendingSuggestions}</Chip> : <span style={muted}>—</span>))}</React.Fragment>);
    }

    // 一列可以挑的欄位
    const pickRow = (f) => {
      const id = fid(f);
      const vals = items.map((it) => window.ddRead(it, f));
      const same = vals.every((v) => show(f, v) === show(f, vals[0]));
      // 站點：只並排（DUP-BE-424）
      if (!ticket) {
        if (same && diffOnly) { hiddenSame += 1; return null; }
        return (
          <React.Fragment key={id}>
            <Label top={8}>{f.label}</Label>
            {same ? <SameCell v={show(f, vals[0])} /> : items.map((it, i) => <div key={it.key} className="dd-ref">{show(f, vals[i])}</div>)}
          </React.Fragment>
        );
      }
      if (same && diffOnly) { hiddenSame += 1; return null; }
      const edited = isEdited(g, kept, picks, props.edits, f);
      const cells = same ? <SameCell v={show(f, vals[0])} tail={edited ? "兩張相同 · 右邊已修改" : null} /> : items.map((it, i) => {
        // DUP-BE-431：地址挑哪一張，那一張就是 primary
        // DUP-BE-432：右邊改過的欄位，左邊兩格都不打勾（點任一格＝放棄修改、改用這一格）
        const chosen = !edited && (f.primary ? kept === it.key : picks[id] === it.key);
        const pick = () => (f.primary ? props.onKeep(it.key) : props.onPick(id, it.key));
        return (
          <button key={it.key} type="button" disabled={!canEdit} onClick={pick} data-dd-cell={id + "=" + it.key}
            aria-pressed={chosen} className="dd-pick"
            style={{ border: "1px solid " + (chosen ? "var(--color-bg-primary)" : "var(--color-border-default)"),
              background: chosen ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)", cursor: canEdit ? "pointer" : "default" }}>
            <Radio on={chosen} />
            <span style={{ whiteSpace: "pre-wrap" }}>{show(f, vals[i])}</span>
          </button>
        );
      });
      return (
        <React.Fragment key={id}>
          <FieldLabel f={f} />
          {cells}
        </React.Fragment>
      );
    };

    const ticketRows = ticket ? F.ticket.map(pickRow).filter(Boolean) : [];
    const taskRows = ticket ? F.task.map(pickRow).filter(Boolean) : [];
    const stationRows = !ticket ? F.station.map(pickRow).filter(Boolean) : [];

    // DUP-BE-430：兩張單上的其他需求、照片全部勾選；勾的放進合併後的單，沒勾的取消
    const otherRows = [];
    const photoRows = [];
    const needOff = props.needOff || {}, photoOff = props.photoOff || {};
    if (ticket && items.some((it) => (it.others || []).length)) {
      otherRows.push(
        <React.Fragment key="others">
          <Label top={10}>其他需求</Label>
          {items.map((it) => (
            <div key={it.key} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }} data-dd-others={it.key}>
              {(it.others || []).length === 0 && <span className="dd-info" style={muted}>沒有</span>}
              {(it.others || []).map((t) => {
                const on = !needOff[t.id];
                return (
                  <div key={t.id} style={{ padding: "8px 10px", borderRadius: "var(--radius-sm, 6px)",
                    background: on ? "var(--color-bg-primary-subtle)" : "transparent", border: "1px solid " + (on ? "var(--color-bg-primary)" : "var(--color-border-default)") }}>
                    <Check name={"need:" + t.id} on={on} disabled={!canEdit} onChange={(v) => props.onNeed(t.id, v)}>
                      <span style={{ flex: 1, minWidth: 0, font: "var(--font-body-300)", color: on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>
                        {t.name} ×{t.quantity}
                        <span style={{ font: "var(--font-data-300)", ...muted }}> · {kindLabel(t.kind)}{t.claimed ? ` · ${t.claimed} 位志工承接` : ""}</span>
                      </span>
                    </Check>
                  </div>
                );
              })}
            </div>
          ))}
        </React.Fragment>
      );
    }
    if (ticket && items.some((it) => (it.photos || []).length)) {
      photoRows.push(
        <React.Fragment key="photos">
          <Label top={10}>照片</Label>
          {items.map((it) => (
            <div key={it.key} style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 0" }} data-dd-photos={it.key}>
              {(it.photos || []).length === 0 && <span className="dd-info" style={muted}>沒有</span>}
              {(it.photos || []).map((p) => {
                const on = !photoOff[p.id];
                return (
                  <div key={p.id} style={{ width: 132, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ height: 84, borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-sunken)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                      opacity: on ? 1 : 0.45, border: "1px solid " + (on ? "var(--color-bg-primary)" : "var(--color-border-default)") }}>
                      <Icon n="Image" s={22} c="var(--color-fg-neutral-muted)" />
                      <span style={{ font: "var(--font-data-300)", ...muted }}>{p.label}</span>
                    </div>
                    <Check name={"photo:" + p.id} on={on} disabled={!canEdit} onChange={(v) => props.onPhoto(p.id, v)}>
                      <span style={{ font: "var(--font-body-300)", ...subtle }}>放進去</span>
                    </Check>
                  </div>
                );
              })}
            </div>
          ))}
        </React.Fragment>
      );
    }

    return (
      <div className="dd-scroll" data-dd-compare>
        <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: 8, rowGap: 6, minWidth: LABEL_W + n * (COL_W + 8) }}>
          <div className="dd-corner">
            <span style={{ font: "var(--font-label-300)", ...subtle }}>{ticket ? "兩張任務單" : "兩個站點"}</span>
          </div>
          {items.map((it, i) => (
            <ColumnHead key={it.key} g={g} it={it} idx={i} t0={t0} allSame={allSame} />
          ))}

          <Section id="info" title="基本資料" note="依建立時間排，A 最早" />
          {infoRows}

          {ticket ? (
            <React.Fragment>
              <Section id="ticket" title="任務單的欄位" note={canEdit ? "點一格，就把那個值帶到右邊的合併結果" : "唯讀"} />
              {ticketRows}
              <Section id="task" title="重複的需求" note={canEdit ? "會合併成一筆；點一格帶到右邊" : "唯讀"} />
              {taskRows}
              {(otherRows.length > 0 || photoRows.length > 0) && (
                <Section id="rest" title="其他需求與照片" note={canEdit ? "勾的會放進合併後的任務單，沒勾的取消" : "唯讀"} />
              )}
              {otherRows}
              {photoRows}
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Section id="station" title="站點的欄位" note="只並排參考。站點這一版還不能合併，只能記下是不是重複。" />
              {stationRows}
            </React.Fragment>
          )}

          {(hiddenSame > 0 || F.empty.length > 0) && (
            <div style={{ gridColumn: "1 / -1", padding: "10px 4px 0", display: "flex", flexDirection: "column", gap: 2, font: "var(--font-data-300)", ...muted }} data-dd-fieldnote>
              {hiddenSame > 0 && <span>已隱藏 {hiddenSame} 個兩張相同的欄位</span>}
              {F.empty.length > 0 && <span data-dd-empty>兩張都沒填、所以沒列出來：{F.empty.join("、")}</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 合併後的後果：完整清單（確認視窗）＋一句短摘要（動作列）。DUP-BE-430：不講保留哪一張、搬到哪
  function effectLines(g, plan, picks) {
    const e = window.ddMergeEffects(g, plan);
    const lines = [];
    lines.push(`兩張任務單合成你在右邊看到的那一張`);
    lines.push(`重複的需求合併成一筆「${plan.taskName}」，數量 ${plan.qty === "" ? "（未填）" : plan.qty}`);
    if ((plan.edited || []).length) lines.push(`你改過的欄位：${plan.edited.join("、")}（開單的人會收到「平台人員已協助更新」）`);
    if (e.included.length) lines.push(`其他需求放進來：${e.included.map((t) => `「${t.name}」`).join("、")}`);
    if (e.dropped.length) lines.push(`沒勾的需求取消：${e.dropped.map((t) => `「${t.name}」`).join("、")}`);
    if (e.volunteersStay) lines.push(`${e.volunteersStay} 位已承接的志工繼續承接，會收到通知`);
    if (e.volunteersCanceled) lines.push(`${e.volunteersCanceled} 位志工承接的需求取消了，會收到通知`);
    if (e.photosIn.length + e.photosDropped) lines.push(`照片放進 ${e.photosIn.length} 張${e.photosDropped ? `，${e.photosDropped} 張不要` : ""}`);
    lines.push(`通知兩邊開單的人`);
    const short = ["合併成一張", `${1 + e.included.length} 項需求`];
    if (e.photosIn.length) short.push(`照片 ${e.photosIn.length} 張`);
    return { lines, short: short.join(" · "), e };
  }

  function ReadOnlyNote({ can }) {
    if (can.can) return null;
    const text = can.reason === "cross"
      ? `這一對含有「${can.teams.join("、")}」負責的資料。跨單位的由資料檢核員或超級管理員處理，你可以查看但不能處理。`
      : "這一對含有還沒指派單位的資料，由資料檢核員或超級管理員處理。你可以查看但不能處理。";
    return <Alert tone="info" title="你只能查看這一對">{text}</Alert>;
  }

  // 已處理的細節
  function DoneDetail({ g }) {
    const out = window.DD_OUTCOME[g.status];
    const r = g.result || {};
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Badge tone={out.tone}>{out.label}</Badge>
          <span style={{ font: "var(--font-data-300)", ...muted }}>{r.by} · {r.at}</span>
        </div>
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" }}>{r.summary}</div>
        {r.note && <div style={{ font: "var(--font-body-300)", ...subtle }}>備註：{r.note}</div>}
        {(r.history || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--font-label-400)" }}>已寫入變更紀錄</span>
            {r.history.map((h, i) => <span key={i} style={{ font: "var(--font-body-300)", ...subtle }}>· {h}</span>)}
          </div>
        )}
        {(r.notices || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--font-label-400)" }}>已送出的通知</span>
            {r.notices.map((n, i) => <span key={i} style={{ font: "var(--font-body-300)", ...subtle }}>· {n}</span>)}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
          {g.items.map((it, i) => {
            const isKept = g.status === "merged" && r.keptKey === it.key;
            const gone = g.status === "merged" && !isKept;
            return (
              <div key={it.key} style={{ padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", display: "flex", flexDirection: "column", gap: 4, opacity: gone ? 0.7 : 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <LetterDot i={i} on={isKept} />
                  <span style={{ font: "var(--font-data-300)", ...muted }}>{itemLabel(g, it)}</span>
                  {isKept && <Badge tone="success">合併後的單</Badge>}
                  {gone && <Badge tone="neutral">已併入</Badge>}
                </div>
                <span style={{ font: "var(--font-label-400)" }}>{itemTitle(g, it)}</span>
                {g.kind === "ticket" && <span style={{ font: "var(--font-body-300)", ...subtle }}>{it.task.name} · 數量 {it.task.quantity == null || it.task.quantity === "" ? "未填" : it.task.quantity}</span>}
                <span style={{ font: "var(--font-data-300)", ...muted }}>{it.team || "尚未指派單位"}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function CompareView(props) {
    const g = props.g;
    const editable = props.editable;
    const isDone = g.status !== "pending";
    const ticket = g.kind === "ticket";
    const [showFx, setShowFx] = React.useState(false);
    const fx = !isDone && ticket ? effectLines(g, props.plan, props.picks) : null;

    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }} data-dd-detail>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={props.onBack} startIcon={<Icon n="ArrowLeft" s={16} />} data-dd-back>回清單</Button>
          <span className="wg-h600" style={{ fontSize: 18, whiteSpace: "nowrap" }}>{ticket ? "兩張任務單可能重複" : "兩個站點可能重複"}</span>
          {g.status === "pending" ? <Badge tone="warning">相似度 {Math.round(g.score * 100)}%</Badge> : null}
          <span style={{ font: "var(--font-data-300)", ...muted }}>{g.id} · 發現於 {g.detectedAt}</span>
          <span style={{ flex: 1 }}></span>
          {props.pos && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button type="button" className="tk-iconbtn" aria-label="上一對" disabled={!props.onPrev} onClick={props.onPrev} style={{ opacity: props.onPrev ? 1 : 0.35 }}><Icon n="ChevronLeft" s={18} /></button>
              <span style={{ font: "var(--font-data-300)", ...muted, minWidth: 54, textAlign: "center" }}>第 {props.pos[0]} / {props.pos[1]} 對</span>
              <button type="button" className="tk-iconbtn" aria-label="下一對" disabled={!props.onNext} onClick={props.onNext} style={{ opacity: props.onNext ? 1 : 0.35 }}><Icon n="ChevronRight" s={18} /></button>
            </div>
          )}
        </div>

        {isDone ? (
          <div style={{ flex: 1, overflowY: "auto", padding: 20, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-lg, 12px)", background: "var(--color-bg-neutral-default)" }}>
            <DoneDetail g={g} />
          </div>
        ) : (
          <React.Fragment>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ font: "var(--font-label-300)", ...subtle }}>為什麼可能重複：</span>
              {g.signals.map((s) => <Chip key={s}>{s}</Chip>)}
              <span style={{ flex: 1 }}></span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--font-body-300)", ...subtle, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={props.diffOnly} onChange={(e) => props.setDiffOnly(e.target.checked)} data-dd-diffonly />
                只看有差異的欄位
              </label>
            </div>
            <ReadOnlyNote can={props.can} />
            {props.stale && (
              <Alert tone="warning" title="有一張在你打開後被改過">
                <span>{g.items.filter((i) => i.staleDemo).map((i) => `${i.ticketId || i.stationId} 已由${i.staleDemo.by}在 ${i.staleDemo.at} 修改`).join("；")}。為了不蓋掉剛改的內容，請先重新載入，看過最新內容再合併。</span>
                <div style={{ marginTop: 8 }}><Button variant="secondary" onClick={props.onReload} startIcon={<Icon n="RefreshCw" s={14} />}>重新載入最新內容</Button></div>
              </Alert>
            )}

            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-lg, 12px)", background: "var(--color-bg-neutral-default)", overflow: "hidden" }}>
                <CompareTable g={g} kept={props.plan.kept} picks={props.picks} edits={props.edits} needOff={props.plan.needOff} photoOff={props.plan.photoOff}
                  canEdit={!!editable} diffOnly={props.diffOnly}
                  onKeep={props.onKeep} onPick={props.onPick} onNeed={props.onNeed} onPhoto={props.onPhoto} />
              </div>
              {ticket && <ResultPanel g={g} plan={props.plan} picks={props.picks} edits={props.edits} canEdit={!!editable} onEdit={props.onEdit} />}
            </div>

            <div style={{ flexShrink: 0, position: "relative", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-lg, 12px)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 14, background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-sm)" }} data-dd-actions>
              {editable ? (
                <React.Fragment>
                  <Button variant="outline" onClick={props.onSeparate} data-dd-separate>不是重複</Button>
                  <span style={{ flex: 1 }}></span>
                  {ticket ? (
                    <React.Fragment>
                      <button type="button" onClick={() => setShowFx(!showFx)} data-dd-effect aria-expanded={showFx} title={fx.short}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, border: "none", background: "transparent", cursor: "pointer", font: "var(--font-body-300)", ...subtle, textAlign: "right" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{fx.short}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--color-fg-primary, var(--color-bg-primary))", font: "var(--font-label-300)", whiteSpace: "nowrap" }}>
                          合併後會發生什麼<Icon n={showFx ? "ChevronDown" : "ChevronUp"} s={14} c="currentColor" />
                        </span>
                      </button>
                      <Button variant="primary" onClick={props.onMerge} startIcon={<Icon n="Merge" s={16} />} data-dd-merge>合併</Button>
                      {showFx && (
                        <div role="dialog" aria-label="合併後會發生什麼" style={{ position: "absolute", right: 14, bottom: "calc(100% + 8px)", width: "min(560px, calc(100% - 28px))", zIndex: 20,
                          background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ font: "var(--font-label-400)" }}>按下合併後</span>
                          {fx.lines.map((l, i) => <span key={i} style={{ font: "var(--font-body-300)", ...subtle }}>· {l}</span>)}
                          <span style={{ font: "var(--font-data-300)", ...muted, marginTop: 4 }}>按下合併後會先預覽合併後的單子；確認送出後不能復原。</span>
                        </div>
                      )}
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      {/* DUP-BE-424：站點這一版不能合併（後端 ADR-377），只記判定 */}
                      <span style={{ font: "var(--font-body-300)", ...muted, textAlign: "right" }}>站點還不能合併，「確認重複」只記下判定，兩個站點都不會變</span>
                      <Button variant="primary" onClick={props.onConfirmDup} startIcon={<Icon n="Check" s={16} />} data-dd-confirmdup>確認重複</Button>
                    </React.Fragment>
                  )}
                </React.Fragment>
              ) : (
                <span style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 8, font: "var(--font-body-300)", ...muted }}>
                  <Icon n="Lock" s={14} c="currentColor" />
                  你只能查看這一對
                </span>
              )}
            </div>
          </React.Fragment>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // DUP-BE-432：右邊「合併後的任務單」—— 一直看得到結果，每一格可以直接改
  //   地址、需求種類不能改（只顯示）。改過的標「已修改」＋「還原」
  //   不給使用者看是哪一張被保留（DUP-BE-430）
  // ════════════════════════════════════════════════════════════════════════
  function ResultField({ g, plan, picks, edits, f, canEdit, onEdit }) {
    const id = fid(f);
    const kept = plan.kept;
    const src = f.primary ? g.items.find((x) => x.key === kept) : (g.items.find((x) => x.key === picks[id]) || g.items.find((x) => x.key === kept));
    const picked = window.ddRead(src, f);
    const fixed = f.primary || f.locked || !canEdit;
    const text = edits && edits[id] != null ? String(edits[id]) : toText(f, picked);
    const edited = isEdited(g, kept, picks, edits, f);
    const opts = f.options ? f.options() : (f.cfg && f.cfg.dataType === "single_select" && (f.cfg.options || []).length ? f.cfg.options.map((o) => [o, o]) : null);
    const box = { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "var(--radius-sm, 6px)", font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)",
      border: "1px solid " + (edited ? "var(--color-fg-warning)" : "var(--color-border-default)"), background: "var(--color-bg-neutral-default)" };
    let input;
    if (fixed) input = <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)", padding: "6px 0", whiteSpace: "pre-wrap" }}>{show(f, picked)}</span>;
    else if (opts) input = (
      <select value={text} onChange={(e) => onEdit(id, e.target.value)} style={box} data-dd-result-input={id}>
        {text !== "" && !opts.some((o) => o[0] === text) && <option value={text}>{text}</option>}
        {text === "" && <option value="">（未填）</option>}
        {opts.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
    );
    else if (f.long) input = <textarea value={text} rows={Math.min(5, Math.max(2, Math.ceil(text.length / 22)))} onChange={(e) => onEdit(id, e.target.value)} style={Object.assign({ resize: "vertical" }, box)} data-dd-result-input={id} />;
    else input = <input type={isNum(f) ? "number" : "text"} min={isNum(f) ? 0 : undefined} value={text} onChange={(e) => onEdit(id, e.target.value)} style={box} data-dd-result-input={id}
      placeholder={isArr(f, picked) ? "用「、」分開" : ""} />;
    return (
      <div data-dd-result-field={id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", borderTop: "1px solid var(--color-border-subtle, var(--color-bg-neutral-sunken))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 20 }}>
          <span style={{ font: "var(--font-label-300)", ...subtle }}>{f.label}</span>
          {f.primary && canEdit && <span style={{ font: "var(--font-data-300)", ...muted }}>· 在左邊選</span>}
          {edited && <Chip tone="warning">已修改</Chip>}
          <span style={{ flex: 1 }}></span>
          {edited && <button type="button" className="tk-chipbtn" onClick={() => onEdit(id, null)} data-dd-result-revert={id}>還原</button>}
        </div>
        {input}
        {f.key === "quantity" && f.scope === "task" && plan.qtyHint}
      </div>
    );
  }

  function ResultPanel({ g, plan, picks, edits, canEdit, onEdit }) {
    const F = fieldsOf(g);
    const e = window.ddMergeEffects(g, plan);
    const sum = g.items.reduce((s, it) => s + (Number(it.task.quantity) || 0), 0);
    // 數量：DUP-BE-422 不能少於承接人數
    const qtyHint = (
      <span style={{ font: "var(--font-data-300)", color: e.qtyTooSmall || e.qtyMissing ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)" }} data-dd-qty-hint>
        {e.qtyMissing ? "請填數量" : e.qtyTooSmall ? `不能少於承接人數 ${e.claimedTotal}` : `兩張加起來是 ${sum}${e.claimedTotal ? ` · ${e.claimedTotal} 位志工承接，不能少於 ${e.claimedTotal}` : ""}`}
      </span>
    );
    const p2 = Object.assign({}, plan, { qtyHint });
    const field = (f) => <ResultField key={fid(f)} g={g} plan={p2} picks={picks} edits={edits} f={f} canEdit={canEdit} onEdit={onEdit} />;
    return (
      <aside data-dd-result style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0,
        border: "1px solid var(--color-bg-primary)", borderRadius: "var(--radius-lg, 12px)", background: "var(--color-bg-neutral-default)", overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", background: "var(--color-bg-primary-subtle)", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon n="Merge" s={16} c="var(--color-bg-primary)" />
          <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>合併後的任務單</span>
          <span style={{ font: "var(--font-data-300)", ...muted }}>{canEdit ? "可以直接改" : ""}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px 16px" }}>
          {F.ticket.map(field)}
          <div style={{ margin: "12px 0 0", padding: "4px 12px 6px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-bg-primary)", background: "var(--color-bg-primary-subtle)" }} data-dd-result-task>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0 2px" }}>
              <span style={{ font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)" }}>合併的這一筆需求</span>
              {e.claimedTotal > 0 && <span style={{ font: "var(--font-data-300)", ...muted }}>· {e.claimedTotal} 位志工承接</span>}
            </div>
            {F.task.map(field)}
          </div>
          {(e.included.length > 0 || e.dropped.length > 0) && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ font: "var(--font-label-300)", ...subtle }}>其他需求 {e.included.length} 項 <span style={{ font: "var(--font-data-300)", ...muted }}>· 在左邊勾選</span></span>
              {e.included.map((t) => (
                <div key={t.id} style={{ padding: "6px 10px", borderRadius: "var(--radius-sm, 6px)", border: "1px solid var(--color-border-default)", font: "var(--font-body-300)" }}>
                  {t.name} ×{t.quantity}<span style={{ font: "var(--font-data-300)", ...muted }}> · {kindLabel(t.kind)}{t.claimed ? ` · ${t.claimed} 位志工承接` : ""}</span>
                </div>
              ))}
            </div>
          )}
          {(e.photosIn.length + e.photosDropped) > 0 && (
            <div style={{ marginTop: 12, font: "var(--font-label-300)", ...subtle }}>照片 {e.photosIn.length} 張 <span style={{ font: "var(--font-data-300)", ...muted }}>· 在左邊勾選</span></div>
          )}
        </div>
      </aside>
    );
  }

  // 送出前的確認（DUP-BE-402）。mode：merge／separate（不是重複）／confirm（站點確認重複，DUP-BE-424）
  function ConfirmDialog({ mode, g, plan, picks, onBack, onConfirm }) {
    const [note, setNote] = React.useState("");
    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onBack(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);
    const isMerge = mode === "merge";
    const fx = isMerge ? effectLines(g, plan, picks) : null;
    const blocked = isMerge && (fx.e.qtyTooSmall || fx.e.qtyMissing)
      ? (fx.e.qtyMissing ? "合併後的數量沒有填。" : `合併後的數量 ${plan.qty} 少於承接人數 ${fx.e.claimedTotal}，請回去改。`) : null;
    const title = isMerge ? "確認合併這兩張單？" : mode === "confirm" ? "確認這兩個站點是重複的？" : `確認這兩${g.kind === "station" ? "個站點" : "張單"}不是重複？`;
    const sub = isMerge ? "合併後的任務單就是你在右邊看到的那一張。送出後不能復原，也不能拆回。"
      : mode === "confirm" ? "只記下判定，兩個站點都不會變。站點合併後端還沒做，之後做好再處理。送出後不能復原。"
      : "送出後不能復原。這一對不會再提示，除非之後有人把它們改到相似。";
    return (
      <div role="dialog" aria-modal="true" aria-label={title} data-dd-confirm={mode}
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, top: "var(--wg-banner-bottom, 0px)", zIndex: 900,
          display: "grid", placeItems: "center", padding: 24, background: "rgba(15,23,42,0.45)" }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onBack(); }}>
        <div style={{ width: "min(600px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column",
          background: "var(--color-bg-neutral-default)", borderRadius: "var(--radius-xl, 16px)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px 12px", borderBottom: "1px solid var(--color-border-default)" }}>
            <div className="wg-h600" style={{ fontSize: 19 }}>{title}</div>
            <div style={{ marginTop: 4, font: "var(--font-body-300)", ...subtle }}>{sub}</div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16, }}>
            {isMerge ? (
              <React.Fragment>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-dd-confirm-effects>
                  <span style={{ font: "var(--font-label-400)" }}>送出後會發生</span>
                  {fx.lines.map((l, i) => <span key={i} style={{ font: "var(--font-body-300)", ...subtle }}>· {l}</span>)}
                </div>
              </React.Fragment>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-dd-confirm-effects>
                <span style={{ font: "var(--font-label-400)" }}>送出後會發生</span>
                <span style={{ font: "var(--font-body-300)", ...subtle }}>· {g.items.map((it) => `${itemLabel(g, it)} ${itemShort(g, it)}`).join("、")} 都維持原樣</span>
                <span style={{ font: "var(--font-body-300)", ...subtle }}>· 這一對移到「已處理」，記為「{mode === "confirm" ? "確認重複（未合併）" : "不是重複"}」</span>
                {mode === "separate" && g.source === "create" && <span style={{ font: "var(--font-body-300)", ...subtle }}>· 通知當初選「仍要建立」的人：你建立的單已確認不是重複</span>}
              </div>
            )}
            {/* DUP-BE-427：備註選填，上限 1000 字（後端 note） */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ font: "var(--font-label-300)" }}>備註 <span style={{ font: "var(--font-data-300)", ...muted }}>選填，例如「已電話確認是同一戶」</span></span>
              <textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} data-dd-note
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "8px 10px", borderRadius: "var(--radius-sm, 6px)", border: "1px solid var(--color-border-default)", font: "var(--font-body-300)", background: "var(--color-bg-neutral-default)" }} />
            </label>
            {blocked && <Alert tone="danger" title="還不能送出">{blocked}</Alert>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderTop: "1px solid var(--color-border-default)" }}>
            <span style={{ flex: 1, font: "var(--font-data-300)", ...muted }}>送出後不能復原</span>
            <Button variant="outline" onClick={onBack} data-dd-confirm-back>回去修改</Button>
            <Button variant="primary" onClick={() => onConfirm(note.trim())} disabled={!!blocked} data-dd-confirm-ok
              startIcon={<Icon n={isMerge ? "Merge" : "Check"} s={16} />}>{isMerge ? "確認合併，送出" : mode === "confirm" ? "確認重複，送出" : "確認不是重複，送出"}</Button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // 本體
  // ════════════════════════════════════════════════════════════════════════
  const readHash = () => { try { return decodeURIComponent((location.hash || "").slice(1)) || null; } catch (e) { return null; } };

  function DedupBody({ persona }) {
    const identity = window.useWGActingIdentity ? window.useWGActingIdentity(persona)[0] : null;
    const access = window.ddAccess(identity);
    const [groups, setGroups] = React.useState(() => window.ddLoad());
    const [tab, setTab] = React.useState("ticket");
    const [view, setView] = React.useState("pending");
    const [sort, setSort] = React.useState("score");
    const [openId, setOpenId] = React.useState(readHash);
    const [kept, setKept] = React.useState({});       // groupId → key
    const [picks, setPicks] = React.useState({});     // groupId → {欄位id: 選哪一張的 key}
    const [edits, setEdits] = React.useState({});     // groupId → {欄位id: 右邊輸入框的字串}（DUP-BE-432）
    const [needOff, setNeedOff] = React.useState({});    // groupId → {需求id: true＝沒勾}（DUP-BE-430）
    const [photoOff, setPhotoOff] = React.useState({});  // groupId → {照片id: true＝沒勾}
    const [diffOnly, setDiffOnly] = React.useState(false);
    const [stale, setStale] = React.useState(null);
    const [confirm, setConfirm] = React.useState(null);   // null／"merge"／"separate"／"confirm"

    React.useEffect(() => { window.ddSave(groups); }, [groups]);
    React.useEffect(() => {
      // 換到別的一對（含瀏覽器上一頁）時，關掉確認視窗：不然視窗會拿新那一對去算合併
      const on = () => { setOpenId(readHash()); setStale(null); setConfirm(null); };
      window.addEventListener("hashchange", on);
      return () => window.removeEventListener("hashchange", on);
    }, []);
    React.useEffect(() => {
      const g = groups.find((x) => x.id === openId);
      if (!g) return;
      if (g.kind !== tab) setTab(g.kind);
      const v = g.status === "pending" ? "pending" : "done";
      if (v !== view) setView(v);
    }, [openId]);

    if (!access.page) {
      return (
        <div style={{ maxWidth: 560, margin: "48px auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <Icon n="ShieldOff" s={36} c="var(--color-fg-neutral-muted)" />
          <span className="wg-h600" style={{ fontSize: 18 }}>你目前的身份不能使用 重複審核</span>
          <span style={{ font: "var(--font-body-400)", ...subtle }}>這一頁開給超級管理員、資料檢核員與團隊管理員。如果你在別的身份有這些角色，可以從右上角切換身份。</span>
        </div>
      );
    }

    const go = (id) => {
      if (id) location.hash = "#" + encodeURIComponent(id);
      else history.pushState("", document.title, location.pathname + location.search);
      setOpenId(id); setStale(null); setConfirm(null);
    };

    const scoped = groups.filter((g) => window.ddInScope(g, access));
    const count = (k) => scoped.filter((g) => g.kind === k && g.status === "pending").length;
    let list = scoped.filter((g) => g.kind === tab && (view === "pending" ? g.status === "pending" : g.status !== "pending"));
    // DUP-BE-411：不篩來源。DUP-BE-412：「最新建立的在前」看這對裡比較晚建立的那張
    const latest = (g) => Math.max.apply(null, g.items.map((i) => T(i.createdAt)));
    list = list.slice().sort((a, b) => (sort === "score" ? b.score - a.score : latest(b) - latest(a)));

    const current = openId ? scoped.find((g) => g.id === openId) || null : null;

    // ── 比對畫面的狀態 ──
    let curKept = null, curPicks = {}, curEdits = {}, plan = null, can = { can: false }, editable = false;
    if (current) {
      curKept = kept[current.id] || defaultKept(current.items);
      if (current.kind === "ticket") {
        curPicks = Object.assign(picksFor(current), picks[current.id] || {});
        curEdits = edits[current.id] || {};
        const F0 = fieldsOf(current);
        const values = {};
        F0.ticket.concat(F0.task).forEach((f) => { values[fid(f)] = resultOf(current, curKept, curPicks, curEdits, f); });
        const q = values[QTY];
        plan = { kept: curKept, values, qty: q == null ? "" : q, taskName: values["task:name"],
          edited: F0.ticket.concat(F0.task).filter((f) => isEdited(current, curKept, curPicks, curEdits, f)).map((f) => f.label),
          needOff: needOff[current.id] || {}, photoOff: photoOff[current.id] || {} };
      } else {
        plan = { kept: curKept };
      }
      can = window.ddCanHandle(current, access);
      editable = current.status === "pending" && can.can;
    }
    const upd = (setter, field, val) => setter((s) => Object.assign({}, s, { [current.id]: Object.assign({}, s[current.id] || {}, { [field]: val }) }));
    // DUP-BE-431：挑地址＝換 primary；其他欄位不動
    const setKeep = (key) => setKept(Object.assign({}, kept, { [current.id]: key }));
    // 左邊點一格＝改用那一格的值，右邊那一格的修改就放棄
    const setPick = (field, key) => { upd(setPicks, field, key); upd(setEdits, field, null); };
    const setEdit = (field, text) => upd(setEdits, field, text);

    const idx = current ? list.findIndex((g) => g.id === current.id) : -1;
    const pos = idx >= 0 ? [idx + 1, list.length] : null;
    const prevId = idx > 0 ? list[idx - 1].id : null;
    const nextId = idx >= 0 && idx < list.length - 1 ? list[idx + 1].id : null;
    const afterHandled = (gid) => {
      const rest = list.filter((g) => g.id !== gid && g.status === "pending");
      const i = list.findIndex((g) => g.id === gid);
      const after = rest.find((g) => list.indexOf(g) > i) || rest[0];
      go(after ? after.id : null);
    };

    const reload = () => {
      const g = current;
      const next = Object.assign({}, g, { items: g.items.map((it) => {
        if (!it.staleDemo) return it;
        const t = Object.assign({}, it.task, { [it.staleDemo.field]: it.staleDemo.to });
        return Object.assign({}, it, { task: t, updatedAt: it.staleDemo.at, staleDemo: null });
      }) });
      setGroups((gs) => gs.map((x) => (x.id === g.id ? next : x)));
      setStale(null);
    };

    // 按「合併」只打開確認視窗；被改過的先擋（後端 expected_versions 對不上回 409）
    const askMerge = () => {
      if (current.items.some((it) => it.staleDemo)) { setStale(current.id); return; }
      setConfirm("merge");
    };
    const merge = (note) => {
      const g = current;
      if (g.items.some((it) => it.staleDemo)) { setStale(g.id); setConfirm(null); return; }
      const e = window.ddMergeEffects(g, plan);
      if (e.qtyTooSmall || e.qtyMissing) return;
      const at = nowText();
      const F = fieldsOf(g);
      let k = e.kept;
      // 正式版：這裡組 resolve 的 request（primary＝k；primary 的其他需求 勾＝keep／沒勾＝cancel；另一張的 勾＝move／沒勾＝cancel；
      //         另一張的重複需求 absorb 進 primary 的重複需求；照片 勾＝keep／沒勾＝cancel）—— DUP-BE-431
      // DUP-BE-432：每個欄位寫入右邊看到的值（改過的優先）
      F.ticket.filter((f) => !f.primary).concat(F.task).forEach((f) => { k = window.ddWrite(k, f, plan.values[fid(f)]); });
      const strip = (x) => { const o = Object.assign({}, x); delete o.from; return o; };
      k = Object.assign({}, k, {
        updatedAt: at,
        task: Object.assign({}, k.task, { claimed: e.claimedTotal }),
        others: e.included.map(strip),
        photos: e.photosIn.map(strip),
      });
      const o = Object.assign({}, e.other, { canceled: true, updatedAt: at });
      const items = g.items.map((it) => (it.key === k.key ? k : o));
      const history = [], notices = [];
      history.push(`${k.ticketId}：與 ${o.ticketId} 合併，重複的需求合併成「${k.task.name}」數量 ${plan.qty}（${persona.name}，${at}）`);
      F.ticket.concat(F.task).forEach((f) => {
        if (f.primary) return;
        if (isEdited(g, curKept, curPicks, curEdits, f)) history.push(`${k.ticketId}：${f.label}改為「${window.ddShow(f, plan.values[fid(f)])}」（審核時修改）`);
        else if (curPicks[fid(f)] === o.key) history.push(`${k.ticketId}：${f.label}改用 ${o.ticketId} 的「${window.ddShow(f, window.ddRead(o, f))}」`);
      });
      e.included.filter((t) => t.from === o.key).forEach((t) => history.push(`${o.ticketId} 的「${t.name}」移到 ${k.ticketId}`));
      e.dropped.forEach((t) => history.push(`「${t.name}」取消`));
      history.push(`${o.ticketId}：整張取消，已併入 ${k.ticketId}（${persona.name}，${at}）`);
      // 通知對齊後端 Spec 028 §6
      notices.push(`給 ${o.owner}：「你的單已併入「${k.ticketTitle}」」，列出搬過去與取消的需求`);
      if (k.owner !== o.owner) notices.push(`給 ${k.owner}：「你的單已因重複審核更新」`);
      if (e.volunteersStay) notices.push(`給已承接的志工：「你承接的需求已合併到「${k.ticketTitle}」」（原本就在這張單上、沒有變動的不通知）`);
      if (e.volunteersCanceled) notices.push(`給 ${e.volunteersCanceled} 位志工：「你承接的需求已取消，改由「${k.ticketTitle}」處理」`);
      const summary = `${k.ticketId} 與 ${o.ticketId} 合成一張（${k.ticketId}），重複的需求合併成「${k.task.name}」數量 ${plan.qty}` +
        (e.included.length ? `，其他需求 ${e.included.map((t) => "「" + t.name + "」").join("、")}` : "") +
        (e.dropped.length ? `；${e.dropped.map((t) => "「" + t.name + "」").join("、")}取消` : "") + "。";
      const next = Object.assign({}, g, { items, status: "merged", result: { at, by: persona.name, keptKey: k.key, summary, history, notices, note } });
      setConfirm(null);
      setGroups((gs) => gs.map((x) => (x.id === g.id ? next : x)));
      afterHandled(g.id);
    };
    const decide = (status, note) => {
      const g = current;
      const at = nowText();
      const summary = status === "confirmed"
        ? "審核後確認這兩個站點是重複的。站點合併後端還沒做，兩個站點都維持原樣。"
        : `審核後確認這兩${g.kind === "station" ? "個站點" : "張單"}不是同一件事。這一對不會再提示，除非之後有人把它們改到相似。`;
      const next = Object.assign({}, g, { status, result: { at, by: persona.name, summary, note,
        notices: status === "separate" && g.source === "create" ? ["給當初選「仍要建立」的人：「你建立的單已確認不是重複。」"] : [] } });
      setConfirm(null);
      setGroups((gs) => gs.map((x) => (x.id === g.id ? next : x)));
      afterHandled(g.id);
    };

    const selectStyle = { height: 32, padding: "0 10px", borderRadius: "var(--radius-sm, 6px)", border: "1px solid var(--color-border-default)",
      background: "var(--color-bg-neutral-default)", font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)" };

    if (current) {
      return (
        <div style={{ height: "100%", minHeight: 560 }} data-dd-root>
          <CompareView key={current.id} g={current} plan={plan} picks={curPicks} edits={curEdits} onEdit={setEdit}
            can={can} editable={editable} stale={stale === current.id}
            diffOnly={diffOnly} setDiffOnly={setDiffOnly}
            pos={pos} onPrev={prevId ? () => go(prevId) : null} onNext={nextId ? () => go(nextId) : null}
            onBack={() => go(null)} onKeep={setKeep} onPick={setPick}
            onNeed={(id, on) => upd(setNeedOff, id, !on)} onPhoto={(id, on) => upd(setPhotoOff, id, !on)}
            onReload={reload} onMerge={askMerge} onSeparate={() => setConfirm("separate")} onConfirmDup={() => setConfirm("confirm")} />
          {confirm && editable && (
            <ConfirmDialog mode={confirm} g={current} plan={plan} picks={curPicks}
              onBack={() => setConfirm(null)}
              onConfirm={(note) => (confirm === "merge" ? merge(note) : decide(confirm === "confirm" ? "confirmed" : "separate", note))} />
          )}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1280 }} data-dd-root>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Tabs value={tab} onChange={(v) => { setTab(v); }} tabs={[
            { value: "ticket", label: <span style={{ whiteSpace: "nowrap" }} data-dd-tab="ticket">任務單（{count("ticket")}）</span> },
            { value: "station", label: <span style={{ whiteSpace: "nowrap" }} data-dd-tab="station">站點（{count("station")}）</span> },
          ]} />
          <span style={{ flex: 1 }}></span>
          <div role="group" aria-label="待處理或已處理" style={{ display: "inline-flex", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-full)", padding: 2 }}>
            {[["pending", "待處理"], ["done", "已處理"]].map(([k, l]) => (
              <button key={k} type="button" data-dd-view={k} onClick={() => setView(k)}
                style={{ border: "none", cursor: "pointer", height: 28, padding: "0 14px", borderRadius: "var(--radius-full)", font: "var(--font-label-300)",
                  background: view === k ? "var(--color-fg-neutral-default)" : "transparent", color: view === k ? "#fff" : "var(--color-fg-neutral-subtle)" }}>{l}</button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle} aria-label="排序">
            <option value="score">相似度高的在前</option>
            <option value="time">最新建立的在前</option>
          </select>
        </div>
        {tab === "station" && (
          <span style={{ font: "var(--font-body-300)", ...muted }} data-dd-station-note>站點這一版還不能合併（後端還沒做），只能記下「確認重複」或「不是重複」，兩個站點都不會變。</span>
        )}
        {!access.all && (
          <span style={{ font: "var(--font-body-300)", ...muted }}>你目前是「{access.team} · 管理員」：只看得到含有{access.team}資料的；兩張都屬於{access.team}的才能處理。</span>
        )}
        <ListView list={list} access={access} view={view} tab={tab} onOpen={go} />
      </div>
    );
  }

  function DedupApp() {
    const [role, setRole] = window.useWGRole(window.TK_PERSONAS, "auditor");
    const persona = window.TK_PERSONAS[role];
    const rbacDef = window.TK_RBAC[persona.rbac];
    const roleBar = (
      <window.WGRoleBar
        items={window.WG_ROLE_ORDER.map((key) => ({ id: key, name: window.TK_PERSONAS[key].name, sub: window.TK_RBAC[window.TK_PERSONAS[key].rbac].label }))}
        value={role} onChange={setRole} />
    );
    return (
      <window.WGPage roleBar={roleBar}>
        <window.WGShell
          active="dedup"
          onNavigate={(id) => window.wgNavigate(id, "dedup")}
          persona={{ id: persona.id, rbac: persona.rbac, team: persona.team, teams: persona.teams,
                     name: persona.name, title: persona.title, rbacLabel: rbacDef.label, rbacTone: rbacDef.tone }}>
          <DedupBody key={role} persona={persona} />
        </window.WGShell>
      </window.WGPage>
    );
  }

  Object.assign(window, { DedupApp, DedupBody });
})();
