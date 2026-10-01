// mm-modals.jsx — 建立團隊、邀請成員、指派平台角色、QR 區塊
(function () {
  const { Button, Badge, Field, Input, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { MMModal, FakeQR, useMM } = window;

  // ── QR + 短連結展示區塊 ───────────────────────────────────────────────────
  function QRBlock({ token, link, metaItems = [], otpNote = true }) {
    const mm = useMM();
    return (
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ padding: 14, borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", background: "#fff", boxShadow: "var(--shadow-sm)", flexShrink: 0 }}>
          <window.FakeQR token={token} size={168} />
        </div>
        <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>邀請短連結（與 QR 共享同一 token）</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 6px 0 14px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
              <Icon n="Link" s={16} c="var(--color-fg-neutral-muted)" />
              <span style={{ flex: 1, font: "var(--font-data-400)", color: "var(--color-fg-neutral-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</span>
              <Button size="sm" variant="ghost" startIcon={<Icon n="Copy" s={15} />} onClick={() => mm.toast("已複製邀請連結")}>複製</Button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {metaItems.map((m, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
                <Icon n={m.icon} s={14} c="var(--color-fg-neutral-muted)" />
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>{m.text}</span>
              </span>
            ))}
            <Button size="sm" variant="ghost" startIcon={<Icon n="Clock" s={15} />} onClick={() => mm.toast("有效期已延長")}>延長有效期</Button>
          </div>
          {otpNote && (
            <Alert tone="info" title="掃碼者需完成 OTP 驗證">
              掃描後將要求填寫手機並輸入簡訊 OTP，完成註冊才會進入佇列／團隊，避免假冒身份。
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // ── 建立團隊（限超級管理員）────────────────────────────────────────────
  function CreateTeamModal({ onClose }) {
    const mm = useMM();
    const [step, setStep] = React.useState(1);
    const [f, setF] = React.useState({ name: "", type: "ngo", taxId: "", contactName: "", contactPhone: "" });
    const [touched, setTouched] = React.useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    // 2026-08-17：平台角色由團隊型別推導（8/14 裁示），型別收兩值，本地不再自備對照表
    const derivedRole = () => window.wgPlatformLabel(window.wgPlatformFromType(f.type));

    const create = () => {
      setTouched(true);
      if (!f.name.trim()) return;
      mm.createTeam(f);
      setStep(2);
    };

    if (step === 2) {
      return (
        <MMModal
          title="團隊已建立 — 邀請 QRCode" width={640} onClose={onClose}
          icon={<span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-success-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon n="Check" s={20} c="var(--color-fg-success)" /></span>}
          footer={<Button variant="primary" onClick={onClose}>完成</Button>}
        >
          <p style={{ margin: 0, font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" }}>
            將 QR 或短連結傳給「{f.name}」的聯絡窗口。<b>第一位掃碼者將自動成為該團隊的管理員</b>；其平台角色由該隊型別推導為 {derivedRole()}。
          </p>
          <QRBlock
            token={"team-" + f.name}
            link={"wanguard.tw/i/tm-" + Math.abs(f.name.length * 7919 % 9000 + 1000)}
            metaItems={[
              { icon: "Clock", text: "有效期 72 小時" },
              { icon: "QrCode", text: "一次性 token · 用後即作廢" },
            ]}
          />
        </MMModal>
      );
    }

    const typeBtn = (t) => (
      <button
        key={t} onClick={() => setF({ ...f, type: t })}
        style={{
          flex: 1, height: 44, borderRadius: "var(--radius-full)", cursor: "pointer",
          font: "var(--font-label-400)",
          border: f.type === t ? "1.5px solid var(--color-border-accent)" : "1px solid var(--color-border-default)",
          background: f.type === t ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)",
          color: f.type === t ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-subtle)",
        }}
      >{window.wgTeamTypeLabel(t)}</button>
    );

    return (
      <MMModal
        title="新增團隊" width={560} onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" startIcon={<Icon n="QrCode" s={16} />} onClick={create}>建立並產生邀請 QR</Button>
        </>}
      >
        <Field label="團隊名稱" required error={touched && !f.name.trim() ? "請輸入團隊名稱（不可與現有團隊同名）" : undefined}>
          <Input value={f.name} onChange={set("name")} invalid={touched && !f.name.trim()} placeholder="例：壯闊台灣" />
        </Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>組織類型 <span style={{ color: "var(--color-fg-danger)" }}>*</span></span>
          {/* 2026-08-17 D-7：兩值 gov / ngo，與 ERD 一致。「其他」拿掉 —— 它推不出平台角色。 */}
          <div style={{ display: "flex", gap: 8 }}>{["ngo", "gov"].map(typeBtn)}</div>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>第一位掃碼者的平台角色由該隊型別推導為 <b>{derivedRole()}</b>。</span>
        </div>
        <Field label="對應組織統編（選填）">
          <Input value={f.taxId} onChange={set("taxId")} placeholder="8 位數統一編號" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="聯絡窗口姓名（選填）">
            <Input value={f.contactName} onChange={set("contactName")} placeholder="姓名" />
          </Field>
          <Field label="聯絡窗口電話（選填）">
            <Input value={f.contactPhone} onChange={set("contactPhone")} placeholder="0912 345 678" />
          </Field>
        </div>
      </MMModal>
    );
  }

  // ── 邀請成員（管理員 / 超級管理員）──────────────────────────────────
  function InviteMemberModal({ team, onClose }) {
    const mm = useMM();
    const [mode, setMode] = React.useState("multi");
    const [validity, setValidity] = React.useState("24");
    const [cap, setCap] = React.useState(50);
    const [generated, setGenerated] = React.useState(false);

    const generate = () => {
      setGenerated(true);
      mm.pushAudit({ actor: mm.persona.name, action: `產生成員邀請 QRCode（${mode === "multi" ? `多次 · 上限 ${cap}` : "單次"} · ${validity} 小時）`, cat: "qr", scope: team.id });
    };

    const segBtn = (val, label, sub) => (
      <button
        key={val} onClick={() => setMode(val)}
        style={{
          flex: 1, padding: "12px 14px", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left",
          border: mode === val ? "1.5px solid var(--color-border-accent)" : "1px solid var(--color-border-default)",
          background: mode === val ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)",
        }}
      >
        <div style={{ font: "var(--font-label-400)", color: mode === val ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-default)" }}>{label}</div>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: 2 }}>{sub}</div>
      </button>
    );

    return (
      <MMModal
        title={`邀請成員加入「${team.name}」`} width={640} onClose={onClose}
        footer={generated
          ? <Button variant="primary" onClick={onClose}>完成</Button>
          : <>
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button variant="primary" startIcon={<Icon n="QrCode" s={16} />} onClick={generate}>產生 QR 與短連結</Button>
            </>}
      >
        {!generated ? (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              {segBtn("single", "單次 QR", "供 1 人使用，用後即作廢")}
              {segBtn("multi", "多次 QR", "可發到 LINE 群，多人共用")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>有效期</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {["24", "48", "72"].map((v) => (
                    <button key={v} onClick={() => setValidity(v)} style={{ flex: 1, height: 40, borderRadius: "var(--radius-full)", cursor: "pointer", font: "var(--font-label-300)", border: validity === v ? "1.5px solid var(--color-border-accent)" : "1px solid var(--color-border-default)", background: validity === v ? "var(--color-bg-primary-subtle)" : "transparent", color: validity === v ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-subtle)" }}>{v} 小時</button>
                  ))}
                </div>
              </div>
              {mode === "multi" && (
                <Field label="使用人數上限">
                  <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
                </Field>
              )}
            </div>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>掃碼者將以 <b>成員</b> 身份加入本隊；其平台角色由本隊型別推導。</span>
          </>
        ) : (
          <QRBlock
            token={`invite-${team.id}-${mode}-${validity}`}
            link={`wanguard.tw/i/${team.id.replace("t", "mb")}${validity}${mode === "multi" ? "g" : "s"}7`}
            metaItems={[
              { icon: "Clock", text: `有效期 ${validity} 小時` },
              mode === "multi" ? { icon: "Users", text: `上限 ${cap} 人` } : { icon: "QrCode", text: "單次 · 用後即作廢" },
            ]}
          />
        )}
      </MMModal>
    );
  }

  // ── 指派平台級角色（限超級管理員）───────────────────────────────────────
  function AssignRoleModal({ onClose }) {
    const mm = useMM();
    const [name, setName] = React.useState("");
    const [role, setRole] = React.useState("auditor");
    const [touched, setTouched] = React.useState(false);

    const submit = () => {
      setTouched(true);
      if (!name.trim()) return;
      mm.assignPlatform(name.trim(), role);
      onClose();
    };

    const roleBtn = (val, label, sub) => (
      <button key={val} onClick={() => setRole(val)} style={{ flex: 1, padding: "12px 14px", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", border: role === val ? "1.5px solid var(--color-border-accent)" : "1px solid var(--color-border-default)", background: role === val ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)" }}>
        <div style={{ font: "var(--font-label-400)", color: role === val ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-default)" }}>{label}</div>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: 2 }}>{sub}</div>
      </button>
    );

    return (
      <MMModal
        title="指派平台級角色" width={560} onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit}>確認指派</Button>
        </>}
      >
        <Field label="成員姓名或手機 / Email" required error={touched && !name.trim() ? "請輸入要指派的成員" : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={touched && !name.trim()} placeholder="輸入現有使用者姓名、手機或 Email" />
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          {roleBtn("auditor", "資料檢核員", "全域檢核單據與糾錯，不隸屬任何團隊")}
          {roleBtn("super", "超級管理員", "最高權限，可分攤審核工作")}
        </div>
        {role === "super" && (
          <Alert tone="warning" title="指派另一位超級管理員">
            新的超級管理員將擁有與您相同的最高權限，可互相撤銷（平台至少保留 1 位）。
          </Alert>
        )}
      </MMModal>
    );
  }

  Object.assign(window, { QRBlock, CreateTeamModal, InviteMemberModal, AssignRoleModal });
})();
