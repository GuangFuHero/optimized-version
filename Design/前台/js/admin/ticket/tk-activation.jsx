// tk-activation.jsx — Disaster Activation：啟動事件 / 增加災害種類（平台層情境，非單張 Ticket 欄位）
(function () {
  const { Button, Field, Input, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK, TKModal, DisasterTag } = window;

  // 增加災害種類（複合災害）— 只是把種類加進「當前事件」的集合，不打開任何欄位群
  function AddDisasterModal({ onClose }) {
    const tk = useTK();
    const active = window.TK_ACTIVATION.types;
    const available = Object.keys(window.TK_DISASTERS).filter((k) => !active.includes(k));
    const [pick, setPick] = React.useState(null);
    const confirm = () => { tk.addDisaster(pick); onClose(); };

    return (
      <TKModal title="增加災害種類（複合災害）" width={560} onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!pick} startIcon={<Icon n="Check" s={16} />} onClick={confirm}>加入當前事件</Button>
        </>}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>當前事件已含</span>
          {active.map((t) => <DisasterTag key={t} type={t} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>選擇要增加的災害種類</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {available.map((k) => {
              const d = window.TK_DISASTERS[k];
              const sel = pick === k;
              return (
                <button key={k} onClick={() => setPick(k)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", cursor: "pointer", border: sel ? `1.5px solid ${d.color}` : "1px solid var(--color-border-default)", background: sel ? d.tint : "var(--color-bg-neutral-default)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "var(--radius-full)", background: d.color }}></span>
                  <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)" }}>{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Alert tone="info" title="災害種類是「平台層」的情境">
          加入後，當前事件變為複合災害；所有 Ticket 一律隸屬此事件、不各自攜帶災害種類。現場「發生什麼」由各 Ticket 的需求（Task）表達。
        </Alert>
      </TKModal>
    );
  }

  // 啟動新災害事件（情境用，較少觸發）
  function StartEventModal({ onClose }) {
    const tk = useTK();
    const [name, setName] = React.useState("");
    const [types, setTypes] = React.useState([]);
    const [region, setRegion] = React.useState("");
    const [touched, setTouched] = React.useState(false);
    const toggle = (k) => setTypes((t) => t.includes(k) ? t.filter((x) => x !== k) : [...t, k]);
    const submit = () => { setTouched(true); if (!name.trim() || !types.length) return; tk.toast(`已啟動事件「${name}」並通知全體後台`); onClose(); };

    return (
      <TKModal title="啟動災害事件" width={580} onClose={onClose}
        icon={<span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-primary-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n="Radio" s={20} c="var(--color-brand-primary-subtle)" /></span>}
        footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>啟動並通知後台</Button></>}>
        <Field label="事件名稱" required error={touched && !name.trim() ? "請輸入事件名稱" : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：2026 花蓮 7.0 地震" invalid={touched && !name.trim()} />
        </Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>災害種類（可多選）<span style={{ color: "var(--color-fg-danger)" }}> *</span></span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {Object.entries(window.TK_DISASTERS).map(([k, d]) => {
              const sel = types.includes(k);
              return (
                <button key={k} onClick={() => toggle(k)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: "var(--radius-md)", cursor: "pointer", border: sel ? `1.5px solid ${d.color}` : "1px solid var(--color-border-default)", background: sel ? d.tint : "var(--color-bg-neutral-default)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "var(--radius-full)", background: d.color }}></span>
                  <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-default)" }}>{d.label}</span>
                </button>
              );
            })}
          </div>
          {touched && !types.length && <span className="wg-caption" style={{ color: "var(--color-fg-danger)" }}>請至少選擇一種災害種類</span>}
        </div>
        <Field label="影響行政區">
          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="例：花蓮縣光復鄉" />
        </Field>
      </TKModal>
    );
  }

  // 事件設定頁（詳細信息 + 歷史 + 操作，從頂部 ⚙️ 進入）
  function DisasterSettingsModal({ onClose }) {
    const tk = useTK();
    const act = window.TK_ACTIVATION;
    const canManage = tk.can.activate;
    const active = tk.actTypes.filter((t) => t.status === "active");
    const revoked = tk.actTypes.filter((t) => t.status === "revoked");
    const HLABEL = { start: "啟動應變事件", add: "新增", revoke: "移除", restore: "恢復" };

    const Section = ({ title, children, action }) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>{title}</span>
          {action}
        </div>
        {children}
      </div>
    );
    const Row = ({ k, v }) => (
      <div style={{ display: "flex", gap: 12, font: "var(--font-data-300)" }}>
        <span style={{ width: 84, flexShrink: 0, color: "var(--color-fg-neutral-muted)" }}>{k}</span>
        <span style={{ color: "var(--color-fg-neutral-default)" }}>{v}</span>
      </div>
    );

    const askRemove = (key) => tk.askRemoveDisaster(key);

    return (
      <TKModal title={`${act.name} · 設定`} width={560} onClose={onClose}
        icon={<span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-primary-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n="Settings" s={20} c="var(--color-brand-primary-subtle)" /></span>}
        footer={<>
          <Button variant="ghost" onClick={onClose}>關閉</Button>
          {canManage && <Button variant="danger" startIcon={<Icon n="Power" s={16} />} onClick={() => { tk.toast("關閉事件需附理由與結束時間（示意）"); }}>關閉事件</Button>}
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Section title="基本信息">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Row k="事件名稱" v={act.name} />
              <Row k="開始時間" v={act.startedAt} />
              <Row k="開啟者" v={`${act.startedBy}（Super Admin）`} />
            </div>
          </Section>

          {/* 直立地圖（2026-09-12）。放在事件設定裡，因為它是**平台層的情境設定**，
              不是單張 Ticket 的欄位 —— 與「當前災害類型」同一個層級。
              TODO：能開這個開關的角色尚未裁示，目前沿用 canManage。 */}
          <Section title="現場分區"
            action={canManage && <button className="tk-chipbtn" onClick={() => tk.setModal("building")} style={{ marginLeft: "auto" }}><Icon n="Plus" s={13} c="currentColor" />開啟新的地址</button>}>
            {window.BuildingSetupList ? <window.BuildingSetupList canManage={canManage} /> : null}
          </Section>

          <Section title="當前災害類型"
            action={canManage && <button className="tk-chipbtn" onClick={() => tk.setModal("addType")} style={{ marginLeft: "auto" }}><Icon n="Plus" s={13} c="currentColor" />增加新災害類型</button>}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {active.map((t) => (
                <DisasterTag key={t.key} type={t.key} isNew={t.isNew}
                  onRemove={canManage ? () => askRemove(t.key) : undefined} />
              ))}
              {!active.length && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>目前無災害類型</span>}
            </div>
            {revoked.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>已撤銷</span>
                {revoked.map((t) => (
                  <DisasterTag key={t.key} type={t.key} state="revoked"
                    onRestore={canManage ? () => tk.restoreDisaster(t.key) : undefined}
                    revokedInfo={t.revokedAt ? `此災害類型已撤銷 @ ${t.revokedAt} by ${t.revokedBy}` : undefined} />
                ))}
              </div>
            )}
          </Section>

          {/* 「影響區域」Section 已移除（2026-08-16 Sucre：後端確定沒有 regions 儲存欄位）*/}

          <Section title="歷史變更">
            <div style={{ display: "flex", flexDirection: "column" }}>
              {tk.actHistory.map((h, i) => {
                const d = window.TK_DISASTERS[h.type];
                const danger = h.action === "revoke";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--color-border-default)" : "none", font: "var(--font-data-300)" }}>
                    <span style={{ width: 118, flexShrink: 0, color: "var(--color-fg-neutral-muted)" }}>{h.at}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: 1 }}>
                      <span style={{ fontWeight: 700, color: danger ? "var(--color-fg-danger)" : "var(--color-fg-neutral-default)" }}>{HLABEL[h.action]}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: d.color }}></span>
                        <span style={{ color: d.color, fontWeight: 700 }}>{d.label}</span>
                      </span>
                    </span>
                    <span style={{ color: "var(--color-fg-neutral-muted)" }}>{h.by}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </TKModal>
    );
  }

  Object.assign(window, { AddDisasterModal, StartEventModal, DisasterSettingsModal });
})();
