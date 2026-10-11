// map-panel.jsx — 互助地圖右側「任務面板」
//
// 🔴 2026-09-26 UX 重整（Sucre：「log 放在下面超怪」「完成後還要點左上方才能回去清單」
//    「整體的 UX 需要重新審視」→「你根據良好的 UX 做做看，我再來改」）。
//    以下原則是我定的，**未經裁示**，全部記在 CLAUDE.md 2026-09-26 節：
//
//   ① 右側面板＝「現在正在做的那一件事」。瀏覽、看細節、圈選、填資料、調整範圍
//      全都在同一個面板裡，地圖只負責「畫」。原本圈選／編輯的浮動 HUD 蓋在地圖上，
//      而且跟右側面板講同一段話 —— 兩處都拿掉重複，HUD 收進面板。
//   ② 每一種狀態都是同一個骨架：頂部標題列（返回／關閉）＋ 中間可捲 ＋ 底部固定動作列。
//      主要動作永遠在右下角，取消永遠在它左邊，破壞性動作永遠在最左邊、用 danger 字色。
//   ③ 做完一件事就回到清單，並把剛動過的那一區標亮。不必再找左上角的小字。
//      Esc 與點地圖空白處也能關掉細節。
//   ④ 操作紀錄不是「區域」的一部分，是另一個視角 → 獨立成分頁。
//   ⑤ 危險區**不會自動到期**（Sucre 2026-09-26：「沒有辦法做到 24 小時到期就關閉」），
//      改成由人按「解除危險區」。
//
// 權限（正典 AC-01）：**未授權角色不提供繪製工具，不是停用。**
(function () {
  const { Button, Badge, Alert, Checkbox, Switch, Tabs } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  const card = {
    background: "var(--color-bg-neutral-default)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
  };
  const cap = { fontWeight: 700, color: "var(--color-fg-neutral-muted)" };
  const inputStyle = { font: "var(--font-body-300)", padding: "9px 10px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)" };

  // ── 共用小件 ─────────────────────────────────────────────────────────────
  function Stat({ label, value, tone }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 64 }}>
        <span className="wg-caption" style={cap}>{label}</span>
        <span style={{ font: "var(--font-data-500)", fontSize: 20, color: tone || "var(--color-fg-neutral-default)" }}>{value}</span>
      </div>
    );
  }

  function Section({ title, children, aside }) {
    return (
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="wg-caption" style={cap}>{title}</span>
          {aside && <span style={{ marginLeft: "auto" }}>{aside}</span>}
        </div>
        {children}
      </section>
    );
  }

  /** 團隊下拉：政府／非政府組織分組（2026-09-25 Sucre）。 */
  function TeamSelect({ value, onChange, teams, emptyLabel }) {
    const groups = window.mapTeamGroups(teams);
    return (
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} style={inputStyle}>
        <option value="">{emptyLabel}</option>
        {groups.map((g) => (
          <optgroup key={g.type} label={g.label}>
            {g.teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </optgroup>
        ))}
      </select>
    );
  }

  /** 危險區固定橘白斜紋，其他區域用自己的顏色。清單、細節、地圖標籤三處同一套。 */
  function ZoneSwatch({ zone, kind, color, size }) {
    const s = size || 12;
    const k = zone ? zone.kind : kind;
    const c = zone ? zone.color : color;
    return k === "hazard"
      ? <span className="wg-hazard-swatch" style={{ display: "inline-block", width: s, height: s, borderRadius: 3, flexShrink: 0 }}></span>
      : <span style={{ display: "inline-block", width: s, height: s, borderRadius: 3, background: c, flexShrink: 0 }}></span>;
  }

  /** 前台可見。**設定型開關用 Switch**（按下就生效），不是 Checkbox（要再按儲存）。 */
  function PublicSwitch({ checked, onChange, disabled, kind }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Switch checked={!!checked} onChange={onChange} disabled={disabled} label="前台可見" />
        <p className="wg-caption" style={{ margin: 0, color: "var(--color-fg-neutral-muted)", lineHeight: 1.65 }}>
          {checked
            ? "民眾與志工在前台地圖看得到這一區的名稱、範圍與備註。" + (kind === "assign" ? "責任單位不會顯示。" : "")
            : "只有後台看得到。"}
        </p>
      </div>
    );
  }

  // ── 面板骨架：標題列 ＋ 可捲內容 ＋ 固定動作列 ─────────────────────────────
  function Frame({ title, sub, onBack, backLabel, onClose, headerExtra, footer, children }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <header style={{ flexShrink: 0, padding: title || onBack || onClose ? "14px 18px 12px" : "6px 18px 12px", borderBottom: "1px solid var(--color-border-default)" }}>
          {(title || onBack || onClose) && <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32 }}>
            {onBack && (
              <button type="button" onClick={onBack} aria-label={backLabel || "返回"} title={backLabel || "返回"}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, marginLeft: -8,
                  border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "var(--color-fg-neutral-subtle)" }}>
                <Icon n="ArrowLeft" s={18} />
              </button>
            )}
            <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>{title}</span>
            {onClose && (
              <button type="button" onClick={onClose} aria-label="關閉（Esc）" title="關閉（Esc）"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, marginRight: -8,
                  border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "var(--color-fg-neutral-subtle)" }}>
                <Icon n="X" s={18} />
              </button>
            )}
          </div>}
          {sub && <div className="wg-caption" style={{ marginTop: 4, color: "var(--color-fg-neutral-muted)", lineHeight: 1.6 }}>{sub}</div>}
          {headerExtra}
        </header>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
          {children}
        </div>
        {footer && (
          <footer style={{ flexShrink: 0, padding: "12px 18px", borderTop: "1px solid var(--color-border-default)",
            display: "flex", alignItems: "center", gap: 8, background: "var(--color-bg-neutral-default)" }}>
            {footer}
          </footer>
        )}
      </div>
    );
  }

  const Spacer = () => <span style={{ flex: 1 }}></span>;

  /** 圈選兩步驟的進度（1 畫範圍 → 2 填資料）。 */
  function Steps({ at }) {
    const items = ["畫範圍", "填資料"];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        {items.map((l, i) => {
          const n = i + 1, on = n === at, done = n < at;
          return (
            <React.Fragment key={l}>
              {i > 0 && <span style={{ flex: "0 0 18px", height: 1, background: "var(--color-border-default)" }}></span>}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  font: "700 11px/1 var(--font-data, monospace)",
                  background: on || done ? "var(--color-bg-primary)" : "var(--color-bg-neutral-sunken)",
                  color: on || done ? "#fff" : "var(--color-fg-neutral-muted)" }}>{done ? "✓" : n}</span>
                <span className="wg-caption" style={{ fontWeight: on ? 700 : 400, color: on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>{l}</span>
              </span>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // ── 地圖下方的操作提示（上方已有篩選列，放下面才不會疊在一起）（只在圈選／編輯時出現；取代原本蓋住地圖下半部的 HUD）──
  function ModeHint({ mode }) {
    const text = mode === "draw"
      ? "點地圖加轉角 · Backspace 退回 · Enter 或雙擊完成 · Esc 取消"
      : "拖曳轉角移動 · 點轉角刪除 · 點邊上的 ＋ 加轉角 · Esc 取消";
    return (
      <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 700,
        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999,
        background: "#0F172A", color: "#fff", boxShadow: "var(--shadow-lg)", whiteSpace: "nowrap" }}>
        <Icon n={mode === "draw" ? "PenTool" : "Move"} s={15} c="#fff" />
        <span style={{ font: "var(--font-label-300)", fontWeight: 600 }}>{text}</span>
      </div>
    );
  }

  // ── ① 清單（含「操作紀錄」分頁）────────────────────────────────────────
  function ZoneList({ zones, tickets, stations, flashId, onSelect, canDraw, onStartDraw, log }) {
    const [tab, setTab] = React.useState("zones");
    const byKind = (k) => zones.filter((z) => z.kind === k);
    const flashRef = React.useRef(null);
    React.useEffect(() => { if (flashId && flashRef.current) flashRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [flashId]);

    function Row({ z }) {
      const inside = window.mapInsideZone(z.ring, tickets, stations);
      const flash = z.id === flashId;
      const summary = z.kind === "assign"
        ? `${z.team || "—"} · 區內 ${inside.tickets.length} 張，${inside.tickets.filter((t) => t.team === z.team).length} 張已歸屬`
        : `區內 ${inside.tickets.length} 張任務單、${inside.stations.length} 個站點`;
      return (
        <button ref={flash ? flashRef : null} type="button" onClick={() => onSelect(z.id)}
          className={flash ? "map-flash" : ""}
          style={{ textAlign: "left", cursor: "pointer", padding: "11px 12px", borderRadius: "var(--radius-md)", width: "100%",
            border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)",
            display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ paddingTop: 3 }}><ZoneSwatch zone={z} size={14} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ font: "var(--font-label-400)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.name}</span>
              {z.publicVisible && (
                <span title="前台可見" style={{ display: "inline-flex", color: "var(--color-fg-neutral-muted)", flexShrink: 0 }}>
                  <Icon n="Eye" s={14} />
                </span>
              )}
            </span>
            <span className="wg-caption" style={{ display: "block", marginTop: 3, color: "var(--color-fg-neutral-subtle)" }}>{summary}</span>
          </span>
          <span style={{ color: "var(--color-fg-neutral-muted)", paddingTop: 2 }}><Icon n="ChevronRight" s={16} /></span>
        </button>
      );
    }

    function Group({ title, list }) {
      if (!list.length) return null;
      return (
        <Section title={`${title}（${list.length}）`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((z) => <Row key={z.id} z={z} />)}
          </div>
        </Section>
      );
    }

    return (
      <Frame
        headerExtra={
          <Tabs value={tab} onChange={setTab} style={{ marginLeft: -14, marginRight: -18, marginBottom: -12, borderBottom: "none" }}
            tabs={[{ value: "zones", label: `區域 ${zones.length}` }, { value: "log", label: `操作紀錄${log.length ? " " + log.length : ""}` }]} />
        }
        footer={tab === "zones" && canDraw ? (
          <>
            <Spacer />
            <Button variant="primary" size="md" startIcon={<Icon n="PenTool" s={15} />} onClick={onStartDraw}>圈選新區域</Button>
          </>
        ) : null}
      >
        {tab === "zones" ? (
          <>
            {!canDraw && (
              <p className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", margin: 0, lineHeight: 1.7 }}>
                你目前的身份可以看區域，不能圈選或指派。圈選由超級管理員與政府執行。
              </p>
            )}
            {/* 危險區排最前 —— 打開頁面第一眼要先看到哪裡不能去 */}
            {window.MAP_ZONE_KINDS.map((k) => <Group key={k.value} title={k.label} list={byKind(k.value)} />)}
            {!zones.length && (
              <div style={{ textAlign: "center", padding: "32px 8px", color: "var(--color-fg-neutral-muted)" }}>
                <Icon n="MapPinned" s={28} />
                <p style={{ font: "var(--font-body-300)", margin: "8px 0 0" }}>還沒有任何區域。</p>
              </div>
            )}
          </>
        ) : (
          <LogList log={log} />
        )}
      </Frame>
    );
  }

  function LogList({ log }) {
    if (!log.length) {
      return (
        <div style={{ textAlign: "center", padding: "32px 8px", color: "var(--color-fg-neutral-muted)" }}>
          <Icon n="History" s={28} />
          <p style={{ font: "var(--font-body-300)", margin: "8px 0 4px" }}>這次還沒有任何操作。</p>
          <p className="wg-caption" style={{ margin: 0, lineHeight: 1.6 }}>正式版寫入 <code>audit_logs</code>，這裡只留在本頁記憶體。</p>
        </div>
      );
    }
    return (
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {log.map((l, i) => (
          <li key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-border-default)" }}>
            <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", flexShrink: 0, paddingTop: 1 }}>{l.at}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "var(--font-body-300)", lineHeight: 1.6 }}>{l.action}</span>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{l.actor}</span>
            </span>
          </li>
        ))}
      </ol>
    );
  }

  // ── ② 單一區域的細節 ────────────────────────────────────────────────────
  function ZoneDetail({ zone, tickets, stations, canDraw, teams, onReassign, onDelete, onBack, onEdit, onClearReview, onTogglePublic }) {
    const inside = window.mapInsideZone(zone.ring, tickets, stations);
    const hazard = zone.kind === "hazard";
    const assign = zone.kind === "assign";
    const [team, setTeam] = React.useState(zone.team || "");
    React.useEffect(() => { setTeam(zone.team || ""); }, [zone.id, zone.team]);
    const split = window.mapSplitByAssignment(inside.tickets, team);
    const review = tickets.filter((t) => t.reviewZoneId === zone.id);
    const dirty = (team || "") !== (zone.team || "");
    const [showAll, setShowAll] = React.useState(false);
    const shown = showAll ? inside.tickets : inside.tickets.slice(0, 8);

    return (
      <Frame
        onBack={onBack} backLabel="回到區域清單（Esc）"
        title={<>
          <ZoneSwatch zone={zone} size={14} />
          <span style={{ font: "var(--font-label-500)", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{zone.name}</span>
          <Badge tone={hazard ? "warning" : "neutral"}>{window.mapKindLabel(zone.kind)}</Badge>
        </>}
        sub={`${zone.createdBy} 於 ${zone.createdAt} 建立 · ${window.mapAreaKm2(zone.ring).toFixed(2)} km²`}
        footer={canDraw ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => onDelete(zone)}
              style={{ color: "var(--color-fg-danger, #D32F2F)" }}>{hazard ? "解除危險區" : "刪除區域"}</Button>
            <Spacer />
            <Button variant="outline" size="sm" startIcon={<Icon n="Spline" s={15} />} onClick={() => onEdit(zone)}>調整範圍</Button>
          </>
        ) : null}
      >
        {zone.note && (
          <p style={{ margin: 0, font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)", lineHeight: 1.75 }}>{zone.note}</p>
        )}

        <div style={{ ...card, padding: "12px 14px", display: "flex", gap: 18 }}>
          <Stat label="區內任務單" value={inside.tickets.length} />
          {assign && <Stat label="已歸屬" value={inside.tickets.filter((t) => t.team === zone.team).length} />}
          {assign && <Stat label="未指派" value={inside.tickets.filter((t) => !t.team).length}
            tone={inside.tickets.some((t) => !t.team) ? "var(--color-fg-warning)" : null} />}
          <Stat label="區內站點" value={inside.stations.length} />
        </div>

        {/* 正典 Q4 的裁示落點：邊界改小之後掉出去的單留在原單位，但要在這裡被看見 */}
        {review.length > 0 && (
          <Alert tone="warning" title={`${review.length} 張單已不在這一區的範圍內`}>
            邊界調整後掉到範圍外，仍指派給 {zone.team}。要改派請到任務管理逐張處理。
            {canDraw && (
              <span style={{ display: "block", marginTop: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => onClearReview(zone)}>解除標記</Button>
              </span>
            )}
          </Alert>
        )}

        {/* 責任區：換單位。標示區：可以改成責任區（範圍保留，不用重畫）。危險區不派單位。 */}
        {!hazard && (
          <Section title={assign ? "責任單位" : "要交給單位負責嗎？"}>
            {canDraw ? (
              <>
                <TeamSelect value={team} onChange={(v) => setTeam(v || "")} teams={teams}
                  emptyLabel={assign ? "選擇單位" : "不指派（維持標示區）"} />
                {dirty && team && (
                  <div style={{ ...card, padding: "10px 12px", background: "var(--color-bg-neutral-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ font: "var(--font-body-300)", lineHeight: 1.7 }}>
                      {!assign && <>這一區會<b>改成責任區</b>。</>}
                      <b>{split.unassigned.length}</b> 張未指派的單會派給 {team}。
                      {split.others.length > 0 && <> 另有 <b>{split.others.length}</b> 張已屬其他單位，<b>不會</b>被改動。</>}
                    </span>
                    <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Button variant="ghost" size="sm" onClick={() => setTeam(zone.team || "")}>取消</Button>
                      <Button variant="primary" size="sm" onClick={() => onReassign(zone, team)}>
                        {assign ? `改派給 ${team}` : `改成責任區，交給 ${team}`}
                      </Button>
                    </span>
                  </div>
                )}
                {assign && !dirty && (
                  <span>
                    <Button variant="ghost" size="sm" onClick={() => onReassign(zone, null)}>不再指派單位，改成標示區</Button>
                  </span>
                )}
              </>
            ) : (
              <span style={{ font: "var(--font-body-300)" }}>{zone.team || "不派單位"}</span>
            )}
          </Section>
        )}

        <Section title="顯示範圍">
          {canDraw ? (
            <PublicSwitch kind={zone.kind} checked={zone.publicVisible} onChange={() => onTogglePublic(zone)} />
          ) : (
            <span className="wg-caption" style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--color-fg-neutral-subtle)" }}>
              <Icon n={zone.publicVisible ? "Eye" : "EyeOff"} s={14} />
              {zone.publicVisible ? "前台可見" : "只有後台看得到"}
            </span>
          )}
        </Section>

        <Section title={`區內任務單（${inside.tickets.length}）`}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {shown.map((t) => (
              <span key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--color-border-default)", font: "var(--font-body-300)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: (window.MAP_PRI_HEX || {})[t.priority] || "#64748B", flexShrink: 0 }}></span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span className="wg-caption" style={{ flexShrink: 0, color: t.team ? "var(--color-fg-neutral-subtle)" : "var(--color-fg-warning)" }}>
                  {t.team || "未指派"}
                </span>
              </span>
            ))}
            {inside.tickets.length > 8 && (
              <span style={{ paddingTop: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "收合" : `顯示全部 ${inside.tickets.length} 張`}
                </Button>
              </span>
            )}
          </div>
        </Section>
      </Frame>
    );
  }

  // ── ③ 圈選：第一步「畫範圍」────────────────────────────────────────────
  function DrawPanel({ draft, preview, invalid, onUndo, onFinish, onCancel, filterNote }) {
    const n = draft.length;
    const high = preview.tickets.length >= window.MAP_HIGH_VOLUME;
    return (
      <Frame
        title={<span style={{ font: "var(--font-label-500)", fontSize: 16 }}>圈選新區域</span>}
        onClose={onCancel}
        headerExtra={<Steps at={1} />}
        footer={<>
          <Button variant="ghost" size="sm" onClick={onUndo} disabled={!n}>退回一點</Button>
          <Spacer />
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button variant="primary" size="sm" onClick={onFinish} disabled={n < 3 || invalid}>下一步</Button>
        </>}
      >
        <p style={{ margin: 0, font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)", lineHeight: 1.75 }}>
          {n === 0 ? "在地圖上點第一個轉角開始。" : n < 3 ? `再點 ${3 - n} 個轉角就能成形。` : "範圍已成形，可以繼續加轉角，或按「下一步」。"}
        </p>
        <div style={{ ...card, padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Stat label="區內任務單" value={preview.tickets.length} tone={high ? "var(--color-fg-warning)" : null} />
          <Stat label="區內站點" value={preview.stations.length} />
          <Stat label="轉角" value={n} />
          <Stat label="面積 km²" value={n >= 3 ? window.mapAreaKm2(draft).toFixed(2) : "—"} />
        </div>
        {filterNote && <p className="wg-caption" style={{ margin: 0, color: "var(--color-fg-neutral-muted)", lineHeight: 1.6 }}>{filterNote}</p>}
        {invalid && (
          <Alert tone="danger" title="邊界自我交叉">多邊形的邊不能互相穿越。退回上一個轉角，或換一條不交叉的畫法。</Alert>
        )}
        {!invalid && high && (
          <Alert tone="warning" title={`這一區涵蓋 ${preview.tickets.length} 張任務單`}>
            超過 {window.MAP_HIGH_VOLUME} 張。若要指派單位，會一次改動這些單的歸屬 —— 確認範圍是不是畫太大了。
          </Alert>
        )}
      </Frame>
    );
  }

  // ── ③ 圈選：第二步「填資料」────────────────────────────────────────────
  function ZoneForm({ form, setForm, preview, onSave, onCancel, onBack, teams }) {
    const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));
    const split = window.mapSplitByAssignment(preview.tickets, form.team);
    const assigning = form.kind === "assign" && form.team;
    const canSave = !!form.kind && !!form.name.trim() && (form.kind !== "assign" || !!form.team);
    const cta = assigning ? `建立並指派 ${split.unassigned.length + (form.overwrite ? split.others.length : 0)} 張` : form.kind ? `建立${window.mapKindLabel(form.kind)}` : "建立區域";
    return (
      <Frame
        title={<span style={{ font: "var(--font-label-500)", fontSize: 16 }}>圈選新區域</span>}
        onBack={onBack} backLabel="回去改範圍" onClose={onCancel}
        headerExtra={<Steps at={2} />}
        footer={<>
          <Spacer />
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={!canSave}>{cta}</Button>
        </>}
      >
        <Section title="這一區是做什麼的？">
          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {window.MAP_ZONE_KINDS.map((k) => {
              const on = form.kind === k.value;
              return (
                <button key={k.value} type="button" role="radio" aria-checked={on}
                  // 換類型時「前台可見」跟著換成該類型的預設（危險區開，其他關）；非責任區清掉單位
                  onClick={() => setForm((s) => (s.kind === k.value ? s : {
                    ...s, kind: k.value, publicVisible: window.mapDefaultPublic(k.value),
                    team: k.value === "assign" ? s.team : null, overwrite: false,
                  }))}
                  style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px", borderRadius: "var(--radius-md)",
                    display: "flex", gap: 10, alignItems: "flex-start",
                    border: `${on ? 2 : 1}px solid ${on ? "var(--color-bg-primary)" : "var(--color-border-default)"}`,
                    background: on ? "var(--color-bg-primary-subtle)" : "transparent" }}>
                  <span style={{ paddingTop: 3 }}><ZoneSwatch kind={k.value} color="#475569" size={14} /></span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", font: "var(--font-label-400)", fontWeight: 700 }}>{k.label}</span>
                    <span style={{ display: "block", font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)", marginTop: 2 }}>{k.hint}</span>
                    <span className="wg-caption" style={{ display: "block", color: "var(--color-fg-neutral-muted)", marginTop: 2 }}>{k.example}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {form.kind && (<>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={cap}>名稱 <span style={{ color: "var(--color-fg-danger, #D32F2F)" }}>*</span></span>
          <input autoFocus value={form.name} onChange={(e) => set("name")(e.target.value)}
            placeholder={form.kind === "hazard" ? "例：馬太鞍溪堤防潰口" : form.kind === "assign" ? "例：光復鄉 大平村" : "例：糖廠志工休息區"} style={inputStyle} />
        </label>

        {form.kind === "assign" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="wg-caption" style={cap}>責任單位 <span style={{ color: "var(--color-fg-danger, #D32F2F)" }}>*</span></span>
            <TeamSelect value={form.team} onChange={set("team")} teams={teams} emptyLabel="選擇單位" />
          </label>
        )}

        {assigning && (
          <div style={{ ...card, padding: "11px 13px", background: "var(--color-bg-neutral-subtle)" }}>
            <span className="wg-caption" style={cap}>建立後會發生</span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--font-body-300)", lineHeight: 1.85 }}>
              <li><b>{split.unassigned.length}</b> 張未指派的單 → 指派給 {form.team}</li>
              <li><b>{split.others.length}</b> 張已屬其他單位 → {form.overwrite ? <span style={{ color: "var(--color-fg-warning)" }}>一併改成 {form.team}</span> : "維持原單位"}</li>
              <li><b>{split.already.length}</b> 張本來就屬於 {form.team} → 不動</li>
            </ul>
            {split.others.length > 0 && (
              <div style={{ marginTop: 9 }}>
                <Checkbox checked={!!form.overwrite} onChange={() => set("overwrite")(!form.overwrite)}
                  label={`一併覆蓋已屬其他單位的 ${split.others.length} 張`} />
              </div>
            )}
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={cap}>備註（選填）</span>
          <textarea value={form.note} onChange={(e) => set("note")(e.target.value)} rows={2}
            placeholder="這一區的狀況、要注意什麼。勾了前台可見的話，民眾也看得到"
            style={{ ...inputStyle, resize: "vertical" }} />
        </label>

        <Section title="顯示範圍">
          <PublicSwitch kind={form.kind} checked={form.publicVisible} onChange={() => set("publicVisible")(!form.publicVisible)} />
        </Section>
        </>)}
      </Frame>
    );
  }

  // ── ④ 調整既有範圍 ─────────────────────────────────────────────────────
  // 正典 Q4「邊界改動後掉到區外的單怎麼辦」，2026-08-27 Sucre 裁示：
  // **維持原指派＋標記待複核。** 所以兩個數字要分開講，不能合成一個「影響 N 張」。
  function EditPanel({ zone, draft, diff, invalid, onReset, onSave, onCancel }) {
    return (
      <Frame
        title={<><ZoneSwatch zone={zone} size={14} /><span style={{ font: "var(--font-label-500)", fontSize: 16 }}>調整範圍</span></>}
        sub={zone.name}
        onClose={onCancel}
        footer={<>
          <Button variant="ghost" size="sm" onClick={onReset}>回到原本範圍</Button>
          <Spacer />
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={draft.length < 3 || invalid}>儲存範圍</Button>
        </>}
      >
        <div style={{ ...card, padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Stat label="改完區內" value={diff.stillIn.length} />
          <Stat label="面積 km²" value={draft.length >= 3 ? window.mapAreaKm2(draft).toFixed(2) : "—"} />
          <Stat label="新納入" value={diff.movedIn.length} tone={diff.movedIn.length ? "var(--color-fg-success)" : null} />
          <Stat label="移出" value={diff.movedOut.length} tone={diff.movedOut.length ? "var(--color-fg-warning)" : null} />
        </div>
        {invalid && (
          <Alert tone="danger" title="邊界自我交叉">把交叉的那個轉角拖回來，或按「回到原本範圍」重來。</Alert>
        )}
        {!invalid && diff.movedOut.length > 0 && (
          <Alert tone="warning" title={`${diff.movedOut.length} 張已指派給 ${zone.team} 的單會掉到範圍外`}>
            這些單<b>不會</b>被收回 —— {zone.team} 可能已經到現場了。它們會留在原單位，並在這一區標成「待複核」。
          </Alert>
        )}
        {!invalid && diff.movedIn.length > 0 && zone.team && (
          <Alert tone="info" title={`新納入 ${diff.movedIn.length} 張未指派的單`}>儲存後一併指派給 {zone.team}。已屬其他單位的單不動。</Alert>
        )}
        {!invalid && !diff.movedOut.length && !diff.movedIn.length && (
          <p className="wg-caption" style={{ margin: 0, color: "var(--color-fg-neutral-muted)", lineHeight: 1.6 }}>
            目前的調整沒有讓任何任務單進出這一區。
          </p>
        )}
      </Frame>
    );
  }

  // ── 復原提示（AC-03：五秒內可完整復原）──────────────────────────────────
  function UndoToast({ label, secondsLeft, onUndo }) {
    return (
      <div className="tk-rise" role="status" style={{
        position: "absolute", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 800, maxWidth: "calc(100% - 260px)",
        display: "flex", alignItems: "center", gap: 14, padding: "10px 12px 10px 16px", borderRadius: "var(--radius-md)",
        background: "#0F172A", color: "#fff", boxShadow: "var(--shadow-lg)",
      }}>
        <Icon n="CheckCircle2" s={17} c="#4ADE80" />
        <span style={{ font: "var(--font-body-300)", lineHeight: 1.5 }}>{label}</span>
        <button type="button" onClick={onUndo}
          style={{ flexShrink: 0, border: "none", background: "transparent", color: "#FDBA74", font: "var(--font-label-400)", fontWeight: 700, cursor: "pointer", padding: "6px 8px" }}>
          復原（{secondsLeft}）
        </button>
      </div>
    );
  }

  Object.assign(window, {
    MapModeHint: ModeHint, MapDrawPanel: DrawPanel, MapEditPanel: EditPanel,
    MapZoneForm: ZoneForm, MapZoneList: ZoneList, MapZoneDetail: ZoneDetail, MapUndoToast: UndoToast,
  });
})();
