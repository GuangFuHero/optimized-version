// tk-detail.jsx — 任務抽屜「檢視態」（預設）：摘要 / 地點 / 現場災況 / 照片 / 需求與承接 / 系統資訊
(function () {
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK, TKDrawer, TKModal, PriorityBadge, StatusBadge, FillBar, fillState, UpdatedCell, PendingNote, PendingChip } = window;

  // 純文字下拉（灰階，符合 §6）
  function PlainSelect({ value, onChange, options, disabled, width }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 8px 0 10px", width,
        borderRadius: "var(--radius-md)", background: disabled ? "transparent" : "var(--color-bg-neutral-subtle)",
        boxShadow: disabled ? "none" : "inset 0 0 0 1px var(--color-border-default)" }}>
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", appearance: "none", cursor: disabled ? "default" : "pointer",
            font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)" }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {!disabled && <Icon n="ChevronDown" s={14} c="var(--color-fg-neutral-muted)" />}
      </span>
    );
  }

  function Section({ title, right, children, collapsible, defaultOpen = true }) {
    const [open, setOpen] = React.useState(defaultOpen);
    return (
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {collapsible ? (
            <button onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", padding: 0, cursor: "pointer", font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>
              <Icon n={open ? "ChevronDown" : "ChevronRight"} s={16} c="var(--color-fg-neutral-muted)" />{title}
            </button>
          ) : (
            <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>{title}</span>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>{right}</span>
        </div>
        {(!collapsible || open) && children}
      </section>
    );
  }

  function Row({ label, children }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 12, alignItems: "start" }}>
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", paddingTop: 2 }}>{label}</span>
        <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)", minWidth: 0 }}>{children}</span>
      </div>
    );
  }

  // ── 需求與承接（指派承接＝就地下拉，不開彈窗）──────────────────────────────
  function TaskBlock({ ticket, task, canWrite = true }) {
    const tk = useTK();
    const kind = window.TK_TASK_KIND[task.kind] || { label: task.kind, icon: "Circle" };
    // AC-VS-104：跨單位唯讀 —— 指派承接與狀態下拉一併收起
    const canAssignMember = canWrite && tk.can.assignMember && !!ticket.team;
    const total = (task.assignees || []).reduce((s, a) => s + (a.qty || 1), 0);
    const isSupply = task.kind === "supply";
    const roster = window.TK_TEAM_MEMBERS[ticket.team] || [];
    const taken = (task.assignees || []).map((a) => a.name);
    const free = roster.filter((m) => !taken.includes(m.name));
    const [adding, setAdding] = React.useState(false);
    const [pick, setPick] = React.useState("");
    const [qty, setQty] = React.useState(1);
    const startAdd = () => { setPick(free.length ? free[0].name : ""); setQty(1); setAdding(true); };
    const confirm = () => { if (!pick) return; tk.assignMember(ticket.id, task.id, pick, isSupply ? (Number(qty) || 1) : 1); setAdding(false); };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon n={kind.icon} s={16} c="var(--color-fg-neutral-muted)" />
          <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{task.name}</span>
          <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
            {kind.label}{task.quantity != null ? ` · 需 ${task.quantity}` : ""}{total ? ` · 已承接 ${total}` : ""}
          </span>
          <span style={{ marginLeft: "auto" }}>
            <PlainSelect value={task.status} width={104} disabled={!canWrite}
              options={Object.entries(window.TK_TASK_STATUS).map(([value, v]) => ({ value, label: v.label }))}
              onChange={(v) => tk.setTaskStatus(ticket.id, task.id, v)} />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            {isSupply ? "已供給" : "已承接"} {total}{task.quantity != null ? `／${task.quantity}` : ""}{isSupply ? "" : " 人"}
          </span>
          {(task.assignees || []).length === 0
            ? <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>尚無人承接</span>
            : task.assignees.map((a, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>
                <Icon n="User" s={12} c="var(--color-fg-neutral-muted)" />{a.name}{a.qty > 1 ? ` ×${a.qty}` : ""}<span style={{ color: "var(--color-fg-neutral-muted)" }}>{a.at}</span>
              </span>
            ))}
          {canAssignMember && !adding && (
            <button onClick={startAdd} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 10px", borderRadius: "var(--radius-full)", border: "1px dashed var(--color-border-default)", background: "transparent", cursor: "pointer", font: "var(--font-data-300)", color: "var(--color-brand-secondary-default)" }}>
              <Icon n="UserPlus" s={12} c="var(--color-brand-secondary-default)" />指派承接
            </button>
          )}
        </div>
        {canAssignMember && adding && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
            <PlainSelect value={pick} onChange={setPick} width={180}
              options={free.length ? free.map((m) => ({ value: m.name, label: m.name })) : [{ value: "", label: `${ticket.team} 已全數指派` }]} />
            {isSupply && (
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="供給數量" placeholder="數量"
                style={{ width: 88, height: 32, padding: "0 10px", borderRadius: "var(--radius-md)", border: "none", outline: "none", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)" }} />
            )}
            <button onClick={confirm} disabled={!pick} style={{ height: 32, padding: "0 14px", borderRadius: "var(--radius-full)", border: "none", cursor: pick ? "pointer" : "not-allowed", background: "var(--color-bg-neutral-sunken)", font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)", opacity: pick ? 1 : 0.5 }}>加入</button>
            <button onClick={() => setAdding(false)} style={{ height: 32, padding: "0 8px", border: "none", background: "transparent", cursor: "pointer", font: "var(--font-label-300)", color: "var(--color-fg-neutral-muted)" }}>取消</button>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
              {isSupply ? "物資可填供給數量" : "一人承接即一人，要多人就分別加入"}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── 指派 Team（Super Admin／Government）─────────────────────────────────
  function AssignTeamModal({ ticket, onClose }) {
    const tk = useTK();
    const teams = Object.keys(window.TK_TEAM_MEMBERS);
    const [pick, setPick] = React.useState(ticket.team || teams[0]);
    return (
      <TKModal title={`指派 Team · #${ticket.id}`} width={480} onClose={onClose}
        icon={<Icon n="Users" s={20} c="var(--color-fg-neutral-subtle)" />}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={pick === ticket.team} onClick={() => { tk.setTeam(ticket.id, pick); onClose(); }}>{ticket.team ? "確認變更" : "確認指派"}</Button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ticket.team && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>目前指派：{ticket.team}</span>}
          {teams.map((name) => {
            const on = pick === name;
            const roster = window.TK_TEAM_MEMBERS[name] || [];
            return (
              <button key={name} onClick={() => setPick(name)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left",
                  border: `1px solid ${on ? "var(--color-fg-neutral-subtle)" : "var(--color-border-default)"}`,
                  background: on ? "var(--color-bg-neutral-subtle)" : "transparent" }}>
                <Icon n={on ? "CircleDot" : "Circle"} s={16} c={on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)"} />
                <span style={{ flex: 1, font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{name}</span>
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{roster.length} 人</span>
              </button>
            );
          })}
        </div>
      </TKModal>
    );
  }

  // ── 歷史紀錄時間軸（TM-FEAT-008）────────────────────────────────────────────
  // TM-RH-101 每張單都有 · TM-RH-103 時間／操作者／動作／前後值 · TM-RH-104 audit_logs
  // 與 task_assignments 交錯於同一條軸 · TM-RH-105 姓名快照 · TM-RH-106 爬蟲 badge ·
  // TM-RH-107 停用欄位的歷史照留 · TM-RH-108 唯讀（此處沒有任何可寫控制）。
  // TM-RH-102 讀取範圍與單本身一致，不另設限。
  function HistoryEntry({ e, last }) {
    const isAssign = e.src === "assign";
    return (
      <div style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 12, alignItems: "start" }}>
        {/* 軸線 */}
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch", paddingTop: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: "var(--radius-full)", flexShrink: 0,
            background: isAssign ? "var(--color-fg-neutral-subtle)" : "var(--color-bg-neutral-default)",
            border: "1.5px solid var(--color-fg-neutral-muted)" }}></span>
          {!last && <span style={{ flex: 1, width: 1, minHeight: 14, background: "var(--color-border-default)", marginTop: 3 }}></span>}
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: last ? 0 : 14, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>{e.at}</span>
            <span style={{ font: "var(--font-label-300)", color: "var(--color-fg-neutral-default)" }}>{e.actor}</span>
            {e.team && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{e.team}</span>}
            {e.actorGone && (
              <span title="此帳號已不存在。顯示的是寫入當下的姓名快照（TM-RH-105）"
                style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 19, padding: "0 7px", borderRadius: "var(--radius-full)", border: "1px solid var(--color-border-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>
                <Icon n="UserMinus" s={10} c="var(--color-fg-neutral-muted)" />帳號已移除
              </span>
            )}
            {e.crawler && (
              <span title="機器爬取，非人工填寫（TM-RH-106）"
                style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 19, padding: "0 7px", borderRadius: "var(--radius-full)", background: "var(--color-bg-info-subtle)", border: "1px solid color-mix(in srgb, var(--color-fg-info, #2592B9) 35%, transparent)", font: "var(--font-data-300)", fontWeight: 700, color: "var(--color-fg-info, #2592B9)", whiteSpace: "nowrap" }}>
                <Icon n="Bot" s={10} c="var(--color-fg-info, #2592B9)" />AI 爬取
              </span>
            )}
            {isAssign && (
              <span title="來源：task_assignments（TM-RH-104）"
                style={{ display: "inline-flex", alignItems: "center", height: 19, padding: "0 7px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>
                承接
              </span>
            )}
          </div>

          <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)", textWrap: "pretty" }}>{e.action}</span>

          {/* TM-RH-103：有值變更才出現前後對照；沒改值的事件不硬湊一組 */}
          {e.from != null && e.to != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
              {e.field && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{e.field}</span>}
              <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", textDecoration: "line-through" }}>{e.from}</span>
              <Icon n="ArrowRight" s={13} c="var(--color-fg-neutral-muted)" />
              <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-default)" }}>{e.to}</span>
              {e.fieldOff && (
                <span title="此欄位事後已停用。停用把欄位移出表單，但不會移走任何歷史（TM-RH-107）"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 20, padding: "0 8px", borderRadius: "var(--radius-full)", border: "1px dashed var(--color-border-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>
                  <Icon n="EyeOff" s={10} c="var(--color-fg-neutral-muted)" />欄位已停用
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 歷史紀錄分頁：查閱型內容，獨立於「任務詳情」的閱讀串之外。
  function TicketHistory({ ticket }) {
    const entries = window.tkHistory(ticket);   // 時間排序：新到舊（TM-RH-103）
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
          <Icon n="Info" s={15} c="var(--color-fg-neutral-muted)" />
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", textWrap: "pretty" }}>
            此單的所有異動與承接紀錄，新到舊排列。任何人都不能修改或刪除紀錄，包含 Super Admin。前台的公開更新日誌是另一條，不併入這裡。
          </span>
        </div>
        {entries.length === 0
          ? <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>尚無紀錄。</span>
          : <div style={{ display: "flex", flexDirection: "column" }}>
            {entries.map((e, i) => <HistoryEntry key={i} e={e} last={i === entries.length - 1} />)}
          </div>}
      </div>
    );
  }

  function TicketDetail({ ticket, onClose, onEdit }) {
    const tk = useTK();
    const t = tk.tickets.find((x) => x.id === ticket.id) || ticket;
    const [photo, setPhoto] = React.useState(null);
    // 歷史紀錄是查閱型內容，切成分頁不擋主要閱讀串（摘要 → 現況 → 要做什麼）
    const [tab, setTab] = React.useState("detail");
    const historyCount = window.tkHistory(t).length;
    // AC-VS-104：跨單位＝唯讀。標示出來，並把寫入控制收起，
    // 免得現場點下去才吃 404（TM-RH-102：歷史的讀取範圍與單本身一致，不受此限）
    const canWrite = tk.canWriteTicket ? tk.canWriteTicket(t) : true;
    const status = window.tkStatus(t);
    const readonlyStatus = !!window.TK_STATUS[status].readonly;
    const showVerification = t.verification === "disputed" && (tk.persona.rbac === "auditor" || tk.persona.rbac === "super");

    // 動態欄位的顯示規則
    //   TM-FS-110 護欄 2：仍在用的欄位一律顯示，沒值就顯示「未填」，不擋任何操作
    //   TM-FS-112：已停用 ＋ 該單有值 → 灰階並標「已停用」；已停用 ＋ 無值 → 完全隱藏
    //   TM-FS-109 護欄 1：已收的值永遠讀得到，停用不會讓它消失
    const hasVal = (k) => t.fields && t.fields[k] != null && t.fields[k] !== "";
    const fields = window.tkOrderFields(window.tkFieldSetAll(tk.actTypes, tk.activeTypes), tk.fieldOrder)
      .filter((fd) => !fd.disabled || hasVal(fd.key));

    const f = fillState(t.tasks);

    return (
      <TKDrawer title={`#${t.id} ${t.title}`} width={680} onClose={onClose}
        sub={`${window.TK_INTAKE[t.intake].label} · 建立於 ${t.createdAt}`}
        footer={<>
          <Button variant="ghost" onClick={onClose}>關閉</Button>
          {canWrite && <Button variant="ghost" startIcon={<Icon n="PenLine" s={16} />} onClick={onEdit}>編輯任務單</Button>}
          {canWrite && tk.can.assign && (
            <Button variant="primary" startIcon={<Icon n="Users" s={16} />} onClick={() => tk.assignOne(t)}>{t.team ? "變更指派" : "指派 Team"}</Button>
          )}
        </>}
        activeTab={tab} onTab={setTab}
        tabs={[
          { key: "detail", label: "任務詳情" },
          { key: "history", label: "歷史紀錄", badge: historyCount },
        ]}>
        {tab === "history" ? <TicketHistory ticket={t} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* 跨單位唯讀提示（AC-VS-104）*/}
          {!canWrite && (
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
              <Icon n="Eye" s={16} c="var(--color-fg-neutral-muted)" />
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", textWrap: "pretty" }}>
                <strong>其他單位的任務單 · 唯讀。</strong>
                這張單由 <strong>{t.team}</strong> 負責，你看得到完整內容（不遮蔽任何欄位），但不能編輯、改狀態或指派。歷史紀錄一樣讀得到。
              </span>
            </div>
          )}

          {/* 摘要卡 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 16, borderRadius: "var(--radius-lg)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <PriorityBadge p={t.priority} />
                <span title={readonlyStatus ? `${window.TK_STATUS[status].by}，後台唯讀` : window.TK_STATUS_RULE}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap", border: "1px solid var(--color-border-default)" }}>
                  <StatusBadge s={status} />
                </span>
                {t.visibility === "public" && <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: "var(--radius-full)", border: "1px solid var(--color-border-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>公開</span>}
                {showVerification && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 22, padding: "0 9px", borderRadius: "var(--radius-full)", border: "1px solid var(--color-border-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}><Icon n="Flag" s={11} c="var(--color-fg-neutral-subtle)" />查核中 · 疑似重複</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>承接進度</span>
                <FillBar tasks={t.tasks} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <UpdatedCell t={t} />
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>更新</span>
              </div>
              <Row label="指派 Team">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {t.team || <span style={{ color: "var(--color-fg-neutral-muted)" }}>未指派</span>}
                  {canWrite && tk.can.assign && (
                    <button onClick={() => tk.assignOne(t)} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 10px", borderRadius: "var(--radius-full)", border: "1px dashed var(--color-border-default)", background: "transparent", cursor: "pointer", font: "var(--font-data-300)", color: "var(--color-brand-secondary-default)" }}>
                      <Icon n={t.team ? "Repeat2" : "UserPlus"} s={12} c="var(--color-brand-secondary-default)" />{t.team ? "變更" : "指派 Team"}
                    </button>
                  )}
                </span>
              </Row>
            </div>
          </div>

          {/* 地點資訊 */}
          <Section title="地點資訊">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Row label="地址">{window.tkAddress(t)}</Row>
              <Row label="樓層">{t.floor || <span style={{ color: "var(--color-fg-neutral-muted)" }}>未填</span>}</Row>
              <Row label="現場聯絡人">{t.contact_name}{t.contact_phone ? ` · ${t.contact_phone}` : ""}</Row>
              <Row label="狀況描述"><span style={{ textWrap: "pretty" }}>{t.desc || "—"}</span></Row>
            </div>
          </Section>

          {/* 現場災況（動態欄位；⚠️ 欄位定義待確認）
              順序由欄位設定頁決定（TM-FS-101），此處不再提供排序或釘選（TM-FS-103） */}
          <Section title="現場災況" collapsible>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <PendingNote info={window.TK_PENDING.disasterFields} />
              {fields.length === 0
                ? <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>當前事件的災害類型尚未帶入災況欄位。</span>
                : fields.map((fd) => {
                  const val = t.fields && t.fields[fd.key];
                  const off = fd.disabled;
                  return (
                    <div key={fd.key} style={{ display: "grid", gridTemplateColumns: "104px 1fr", gap: 12, alignItems: "start", opacity: off ? 0.55 : 1 }}>
                      <span className="wg-caption" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--color-fg-neutral-muted)" }}>
                        {fd.label}
                        <span style={{ display: "inline-flex", gap: 2 }}>
                          {fd.sources.map((s) => <span key={s} title={window.TK_DISASTERS[s].label} style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-muted)" }}></span>)}
                        </span>
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", font: "var(--font-body-300)", color: off ? "var(--color-fg-neutral-muted)" : (val ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)") }}>
                        <span>{val ? `${val}${fd.hint && !isNaN(Number(val)) ? ` ${fd.hint}` : ""}` : "未填"}</span>
                        {off && (
                          <span title="此欄位已停用，不再收新值；已填的值永久保留可讀（TM-FS-109）"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 20, padding: "0 8px", borderRadius: "var(--radius-full)", border: "1px dashed var(--color-border-default)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>
                            <Icon n="EyeOff" s={11} c="var(--color-fg-neutral-muted)" />已停用
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Section>

          {/* 現場照片（有貼才顯示）—— TM-FEAT-010 圖片連結
              TM-IMG-137 縮圖列 ＋ 大圖浮層　TM-IMG-138 圖床掛掉不影響這一頁其餘內容 */}
          {(() => {
            const pics = window.tkPhotoList ? window.tkPhotoList(t.photos) : [];
            if (!pics.length) return null;
            return (
              <Section title="現場照片" right={<span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{pics.length} 張 · 平台只存網址，圖片在外部網站</span>}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {pics.map((p, i) => (
                    <window.TKPhotoThumb key={`${p.url}:${i}`} photo={p} index={i} onOpen={(x) => setPhoto(x.url)} />
                  ))}
                </div>
              </Section>
            );
          })()}

          {/* 需求與承接 */}
          <Section title="需求與承接" right={<span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{f.total ? f.label : "尚無需求"}</span>}>
            {(t.tasks || []).length === 0
              ? <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>尚無需求 · 待現場勘查後補列</span>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {t.tasks.map((k) => <TaskBlock key={k.id} ticket={t} task={k} canWrite={canWrite} />)}
              </div>}
          </Section>

          {/* 系統資訊 */}
          <Section title="系統資訊">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Row label="公開範圍">{window.TK_VISIBILITY[t.visibility].label}</Row>
              <Row label="自動封存">
                開單後 {window.TK_SETTINGS.archiveDays} 天自動封存（不論是否結案）。
                <a href={window.TK_SETTINGS.settingsHref} style={{ marginLeft: 8, whiteSpace: "nowrap", color: "var(--color-brand-secondary-default)" }}>前往設定 ↗</a>
              </Row>
              {showVerification && <Row label="查核狀態">疑似與 T-1069 重複（Data Auditor／Super Admin 可見）</Row>}
            </div>
          </Section>
        </div>
        )}

        {photo && (
          <div onClick={() => setPhoto(null)} style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 700, background: "rgba(15,23,42,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, cursor: "zoom-out" }}>
            <img src={photo} alt="現場照片原圖" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "var(--radius-md)" }} />
          </div>
        )}
      </TKDrawer>
    );
  }

  Object.assign(window, { TicketDetail, AssignTeamModal, PlainSelect });
})();
