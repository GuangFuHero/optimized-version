// wg-profile.jsx — 頂欄人名 → 下拉選單 → 個人設定 Drawer（三個後台共用）
//
// 正典：identity-and-account / IAM-FEAT-002（AC-03）
//   "The profile displays name, phone, Email, and assigned operational role,
//    with nickname optional."
// 2026-08-08 Owner 決策：
//   D-A 目標版本從 v0.2.0 提前到 v0.1.0
//   D-B 電話／Email 可編輯，但變更需驗證才生效（驗證流程本身屬 IAM-FEAT-003）
//   D-C 只用 users.name 一個名字欄位，v0.1.0 不做「暱稱」
//   P-02 角色身份要顯示 platform 角色、team 角色、以及是哪一個 team
//
// ⚠️ 已知後端缺口（見 WG_PROFILE_PENDING）：
//   user_contacts 有 UNIQUE(user_uuid, type)，同一種聯絡方式只能存一列，
//   所以「舊值還在用、新值待驗證」目前存不了。本檔以待驗證狀態示意該行為，
//   等後端確認暫存欄位／暫存表後才能落地。
(function () {
  const { Avatar, Badge, Button, Input } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // Drawer 進場動畫：資源站點兩頁的 HTML 已有 wgDrawerIn，任務管理與成員管理沒有。
  // 這裡自行補上，讓三頁行為一致。prefers-reduced-motion 由各頁的全域規則關掉。
  if (!document.getElementById("wg-profile-css")) {
    const st = document.createElement("style");
    st.id = "wg-profile-css";
    st.textContent = "@keyframes wgDrawerIn { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }";
    document.head.appendChild(st);
  }

  // ── 待確認說明（顯示在 Drawer 底部）─────────────────────────────────────
  window.WG_PROFILE_PENDING = {
    title: "聯絡方式變更流程待工程確認",
    note: "電話與 Email 在 ERD 中同時是登入識別（user_contacts UNIQUE(type, value)），"
      + "且 UNIQUE(user_uuid, type) 讓「舊值仍可登入、新值待驗證」無處可存。"
      + "驗證流程（step-up 認證、新端驗證、舊端通知）屬 IAM-FEAT-003，尚未建置。",
  };

  // ── 原型聯絡資料 ────────────────────────────────────────────────────────
  // 電話沿用 mm-data.js 既有值；**Email 全部是原型佔位值，沒有資料來源**。
  if (!window.WG_PROFILE_CONTACTS) {
    window.WG_PROFILE_CONTACTS = {
      "u-lin":   { phone: "0912-345-678", phoneVerified: true,  email: "lin@wanguard.example.tw",   emailVerified: true  },
      "u-wu":    { phone: "03-822-5101",  phoneVerified: true,  email: "wu@hl-gov.example.tw",      emailVerified: true  },
      "u-huang": { phone: "0921-334-556", phoneVerified: true,  email: "",                          emailVerified: false },
      "u-lee":   { phone: "0911-672-300", phoneVerified: false, email: "lee@example.tw",            emailVerified: false },
      "u-chang": { phone: "0933-221-004", phoneVerified: true,  email: "chang@wanguard.example.tw", emailVerified: true  },
      "u-chen":  { phone: "0976-552-810", phoneVerified: true,  email: "",                          emailVerified: false },
    };
  }

  // ── 角色解析（P-02）─────────────────────────────────────────────────────
  // ERD 的 roles.kind 區分 platform / team，兩者不是同一件事，不能混成一行。
  // 兩個後台的 RBAC 詞彙不同（TK_RBAC 的 admin/member vs MM_RBAC 的 ngo/user），
  // 這裡統一收斂。
  // 2026-08-15 Sucre 更正：`ngo` 的平台角色就是 **NGO**，不是「一般使用者」。
  // 依 8/14 裁示「加入 NGO Team 者平台角色即 NGO；加入 GOV Team 即 Government」。
  // （原本寫「一般使用者」是 8/8 時正典沒說隊員平台角色叫什麼所留下的推論，已作廢。）
  // 2026-08-17：標籤全部改讀 wg-terms.js 的 token，本檔不再自己寫一份。
  // ⚠️ `user`（一般使用者）已從對照表移除 —— 2026-08-17 Sucre：「沒有這個人！！！」
  //    進得了後台就一定是因為有某個身份，所以後台不可能顯示這個詞。
  //    對不到就回 "—"（資料錯就要看得出來，不該靜靜顯示一個假身份）。
  // TK_PERSONAS 用 admin/member 當 rbac key，那其實是團隊角色，一律推為 ngo。
  const RBAC_ALIAS = { admin: "ngo", member: "ngo" };
  const platformLabelOf = (key) => window.wgPlatformLabel(RBAC_ALIAS[key] || key);

  // ── 目前身份 acting identity ────────────────────────────────────────────
  // 2026-08-15 PM 確認：切換入口在右上角人名選單，Audit Log 依切換後的身份記錄。
  //
  // 🔄 2026-08-17 Carol（PM 本人）覆蓋 8/15「清單裡只有團隊」：
  //    **切換清單即身份清單** —— 平台身份自成一列，每個身份切著誰就是誰。
  //    組成公式與推導理由見 wg-event.js 的 wgIdentities()（那是推導不是裁示）。
  //
  //   0 個身份 → 進不了後台
  //   1 個身份 → 不出現切換器（沒得選），副標直接顯示該身份
  //   2 個以上 → 出現切換器
  //
  // activeKey：身份 key（平台是 "@super"／團隊就是 team id）。也接受團隊名以相容舊呼叫。
  function resolveRoles(persona, activeKey) {
    const identities = (window.wgIdentities ? window.wgIdentities(persona) : []).map((i) => ({
      ...i,
      // 顯示名稱：平台身份用角色名；團隊身份用團隊名（角色放副標）
      name: i.kind === "platform" ? window.wgPlatformLabel(i.role) : i.teamName,
      roleLabel: i.kind === "platform" ? window.wgPlatformLabel(i.role) : window.wgTeamRoleLabel(i.role),
      // 完整標籤一律走 wgIdentityLabel()，前綴硬規則在那裡強制執行
      fullLabel: window.wgIdentityLabel(i),
      hint: window.wgIdentityHint(i),
      id: i.key,
    }));

    const active = identities.find((i) => i.key === activeKey || i.teamName === activeKey)
      || identities[0] || null;

    // 目前身份的有效平台角色 —— 乾淨切的判斷依據，不是這個人的 persona.rbac
    const platform = active
      ? window.wgPlatformLabel(active.platformRole)
      : platformLabelOf(persona.rbac);

    const teams = identities.filter((i) => i.kind === "team");
    return {
      platform,
      platformRole: active ? active.platformRole : null,
      teamRole: active && active.kind === "team" ? active.roleLabel : null,
      teamName: active && active.kind === "team" ? active.teamName : null,
      teamType: active && active.kind === "team" ? active.teamType : null,
      memberships: teams,          // 只有團隊那幾列（個人設定頁的「我的團隊」用）
      identities,                  // 全部身份（切換器用）
      platformIdentities: identities.filter((i) => i.kind === "platform"),
      teamIdentities: teams,
      active, activeId: active ? active.key : null,
    };
  }

  // ── 小元件 ──────────────────────────────────────────────────────────────
  // 身份頭像：用團隊名首字（比照 Google 帳號切換器的頭像欄）
  function IdentityAvatar({ identity, size = 34 }) {
    const tone = identity.kind === "platform"
      ? (identity.role === "super" ? "primary" : "warning")
      : (identity.role === "admin" ? "primary" : "secondary");
    return <Avatar name={identity.name} tone={tone} size={size} />;
  }

  function VerifyBadge({ ok }) {
    return ok
      ? <Badge tone="success">已驗證</Badge>
      : <Badge tone="warning">未驗證</Badge>;
  }

  function ReadRow({ label, children, note }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "11px 0", borderTop: "1px solid var(--color-bg-neutral-sunken)" }}>
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{label}</span>
        <span style={{ font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {children}
        </span>
        {note && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{note}</span>}
      </div>
    );
  }

  function FieldLabel({ label, required, hint }) {
    return (
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span className="wg-label-sm" style={{ fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>
          {label}{required && <span style={{ color: "var(--color-fg-danger)" }}> *</span>}
        </span>
        {hint && <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{hint}</span>}
      </span>
    );
  }

  // ── 聯絡方式欄位（電話／Email 共用）──────────────────────────────────────
  // 行為：可編輯，但送出後不取代目前值，而是進入「待驗證」。
  // 依 IAM-FEAT-003 AC-04：新值需新端驗證＋舊端通知才生效。
  function ContactField({ label, hint, kind, current, verified, pending, draft, onDraft, onCancelPending, invalid, error }) {
    const changed = draft.trim() !== "" && draft.trim() !== current;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <FieldLabel label={label} hint={hint} />
        <Input value={draft} onChange={(e) => onDraft(e.target.value)} invalid={invalid}
          placeholder={kind === "email" ? "尚未設定 Email" : "尚未設定電話"}
          leadingIcon={<Icon n={kind === "email" ? "Mail" : "Phone"} s={17} c="var(--color-fg-neutral-muted)" />} />

        {/* 目前生效值 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            目前登入使用：{current || "未設定"}
          </span>
          {current ? <VerifyBadge ok={verified} /> : null}
        </div>

        {/* 待驗證的新值 */}
        {pending && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "9px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg-warning-subtle)" }}>
            <Icon n="Clock" s={15} c="var(--color-fg-warning)" />
            <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-warning)", flex: 1, minWidth: 0 }}>
              待驗證：{pending}
            </span>
            <button type="button" disabled title="驗證流程建置中（IAM-FEAT-003）"
              style={{ height: 28, padding: "0 10px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--color-border-default)", background: "var(--color-bg-disable)", color: "var(--color-fg-neutral-muted)", font: "var(--font-label-300)", cursor: "not-allowed" }}>
              發送驗證
            </button>
            <button type="button" onClick={onCancelPending}
              style={{ height: 28, padding: "0 10px", borderRadius: "var(--radius-sm)", border: "none", background: "transparent", color: "var(--color-fg-neutral-subtle)", font: "var(--font-label-300)", cursor: "pointer", textDecoration: "underline" }}>
              取消變更
            </button>
          </div>
        )}

        {error
          ? <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-danger)" }}>{error}</span>
          : changed && !pending
            ? <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-neutral-muted)" }}>儲存後不會立即生效，會先進入待驗證。</span>
            : null}
      </div>
    );
  }

  // ── 個人設定 Drawer ─────────────────────────────────────────────────────
  function WGProfileDrawer({ persona, name, activeTeamId, onSaveName, onClose }) {
    const roles = resolveRoles(persona, activeTeamId);
    const stored = (window.WG_PROFILE_CONTACTS || {})[persona.id] || { phone: "", email: "" };

    const [draftName, setDraftName] = React.useState(name);
    const [draftPhone, setDraftPhone] = React.useState(stored.phone || "");
    const [draftEmail, setDraftEmail] = React.useState(stored.email || "");
    const [pendingPhone, setPendingPhone] = React.useState(null);
    const [pendingEmail, setPendingEmail] = React.useState(null);
    const [errors, setErrors] = React.useState({});
    const [saved, setSaved] = React.useState(false);

    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const nameDirty = draftName !== name;
    const phoneDirty = draftPhone.trim() !== (stored.phone || "");
    const emailDirty = draftEmail.trim() !== (stored.email || "");
    const dirty = nameDirty || phoneDirty || emailDirty;

    function save() {
      const e = {};
      // P-06：名字不可為空。它是所有畫面代表這個人的字串。
      if (!draftName.trim()) e.name = "名字不能空白。這個名字會出現在頂欄、任務指派與操作紀錄上。";
      // Email 格式僅做最基本檢查，真正的可用性要靠驗證流程
      if (draftEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftEmail.trim())) e.email = "Email 格式看起來不對，請確認。";
      setErrors(e);
      if (Object.keys(e).length) return;

      // 名字直接生效（users.name 不是登入識別）
      if (nameDirty) onSaveName(draftName.trim());
      // 電話／Email 進待驗證，不取代目前值（IAM-FEAT-003 AC-04）
      if (phoneDirty) setPendingPhone(draftPhone.trim() || null);
      if (emailDirty) setPendingEmail(draftEmail.trim() || null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
    }

    function reset() {
      setDraftName(name);
      setDraftPhone(stored.phone || "");
      setDraftEmail(stored.email || "");
      setErrors({});
    }

    return (
      <div style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 950, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }}></div>
        <div role="dialog" aria-label="個人設定"
          style={{ position: "relative", width: "min(520px, 100vw)", height: "100%", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", animation: "wgDrawerIn var(--transition-base)" }}>

          {/* header */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <Avatar name={name} tone={persona.rbac === "super" ? "primary" : "secondary"} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="wg-data-xs" style={{ color: "var(--color-fg-neutral-muted)" }}>個人設定</div>
              <h2 className="wg-h700" style={{ fontSize: 21, marginTop: 3, overflowWrap: "anywhere" }}>{name}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="關閉"
              style={{ border: "none", background: "var(--color-bg-neutral-subtle)", borderRadius: "var(--radius-full)", width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-fg-neutral-subtle)", flexShrink: 0 }}>
              <Icon n="X" s={20} c="currentColor" />
            </button>
          </div>

          {/* body */}
          <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>

            {/* 名字 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <FieldLabel label="名字" required hint="會顯示在頂欄、任務指派與操作紀錄" />
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} invalid={!!errors.name}
                leadingIcon={<Icon n="User" s={17} c="var(--color-fg-neutral-muted)" />} />
              {errors.name
                ? <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-danger)" }}>{errors.name}</span>
                : <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>不是登入帳號，儲存後立即生效。</span>}
            </div>

            {/* 聯絡方式 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "18px 0 0", borderTop: "1px solid var(--color-border-default)" }}>
              <div style={{ display: "flex", gap: 9, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-bg-info-subtle)", alignItems: "flex-start" }}>
                <Icon n="Info" s={16} c="var(--color-fg-info)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-info)" }}>
                  電話與 Email 同時是登入方式。變更後需要驗證新的收件端、並通知舊的收件端才會生效，在那之前原本的還可以登入。
                </span>
              </div>

              <ContactField label="電話" hint="登入方式" kind="phone"
                current={stored.phone} verified={stored.phoneVerified} pending={pendingPhone}
                draft={draftPhone} onDraft={setDraftPhone}
                onCancelPending={() => { setPendingPhone(null); setDraftPhone(stored.phone || ""); }} />

              <ContactField label="Email" hint="登入方式" kind="email"
                current={stored.email} verified={stored.emailVerified} pending={pendingEmail}
                draft={draftEmail} onDraft={setDraftEmail} invalid={!!errors.email} error={errors.email}
                onCancelPending={() => { setPendingEmail(null); setDraftEmail(stored.email || ""); }} />
            </div>

            {/* 角色身份（唯讀） */}
            <div style={{ paddingTop: 18, borderTop: "1px solid var(--color-border-default)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <FieldLabel label="角色身份" />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
                  <Icon n="Lock" s={12} c="var(--color-fg-neutral-muted)" />唯讀
                </span>
              </div>

              {/* 2026-08-17：這裡顯示的是**目前身份的**平台角色。切換身份會變。 */}
              <ReadRow label="平台角色" note="由目前身份決定 —— 切換身份時這一列會變。">
                <Badge tone={window.wgPlatformTone(roles.platformRole)}>
                  {roles.platform}
                </Badge>
              </ReadRow>

              <ReadRow label="目前身份"
                note={roles.identities.length > 1
                  ? "切換身份請用右上角人名選單。各身份的權限完全切割 —— 目前身份做不到的事不會出現在畫面上，要先切換過去。"
                  : null}>
                {roles.active
                  ? <Badge tone={roles.active.kind === "platform" ? "primary" : "info"}>{roles.active.fullLabel}</Badge>
                  : <span style={{ color: "var(--color-fg-neutral-muted)" }}>無</span>}
              </ReadRow>

              <ReadRow label="所屬團隊"
                note={roles.memberships.length ? null : "未隸屬任何團隊 —— 這是合法狀態，權限來自平台角色。"}>
                {roles.memberships.length
                  ? roles.memberships.map((m) => (
                      <span key={m.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {/* 團隊名一定在，所以這裡的角色徽章不違反「不單獨出現」硬規則 */}
                        <span style={{ fontWeight: m.key === roles.activeId ? 700 : 400,
                          color: m.key === roles.activeId ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>{m.teamName}</span>
                        <Badge tone={window.wgTeamRoleTone(m.role)}>{window.wgTeamRoleLabel(m.role)}</Badge>
                        {m.key === roles.activeId && <Badge tone="info">目前身份</Badge>}
                      </span>
                    ))
                  : <span style={{ color: "var(--color-fg-neutral-muted)" }}>無</span>}
              </ReadRow>

              <div style={{ marginTop: 12, display: "flex", gap: 9, alignItems: "flex-start" }}>
                <Icon n="ShieldAlert" s={15} c="var(--color-fg-neutral-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
                  角色不能自己改。需要調整權限請提出申請：團隊角色由該隊管理員審核，平台角色由超級管理員審核。
                </span>
              </div>
            </div>

            {/* 待確認 */}
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--color-border-default)" }}>
              <window.ShellPendingChip info={window.WG_PROFILE_PENDING} label="聯絡方式變更流程待工程確認" />
            </div>
          </div>

          {/* footer */}
          <div style={{ borderTop: "1px solid var(--color-border-default)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 10 }}>
            {saved && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--font-body-300)", color: "var(--color-fg-success)" }}>
                <Icon n="Check" s={16} c="var(--color-fg-success)" />已儲存
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <Button variant="secondary" size="sm" onClick={dirty ? reset : onClose}>
                {dirty ? "還原" : "關閉"}
              </Button>
              <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>儲存</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 頂欄人名區塊 ＋ 下拉選單 ────────────────────────────────────────────
  // 取代原本 wg-shell / mm-shell 各自寫死的 persona 顯示區塊。
  function WGPersonaMenu({ persona, activeTeamId, onSwitchTeam, onLogout }) {
    const [open, setOpen] = React.useState(false);
    const [drawer, setDrawer] = React.useState(false);
    // 名字改動後頂欄要即時反映（P-07），不需重新登入
    const [name, setName] = React.useState(persona.name);
    const ref = React.useRef(null);

    React.useEffect(() => { setName(persona.name); }, [persona.id, persona.name]);

    // 讓通知的角色升級 deep-link 打得開這個 Drawer（IAM-UP-108）
    React.useEffect(() => {
      window.wgOpenProfileDrawer = () => { setOpen(false); setDrawer(true); };
      return () => { if (window.wgOpenProfileDrawer) delete window.wgOpenProfileDrawer; };
    }, []);

    React.useEffect(() => {
      if (!open) return;
      const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
      document.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
      return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
    }, [open]);

    // 2026-08-08 Sucre：拿掉原本停用的「通知設定」。
    // 正典沒有定義通知設定——IAM-FEAT-002 處理「通知過多」的唯一手段是聚合
    // （IAM-UP-106），沒有任何靜音或訂閱規則。正典偏好清單裡雖有
    // `watched task types 關注任務類型`，但從未說明「關注」會產生什麼效果，
    // 那條線在正典裡是斷的。要不要做成開關已列為開會第六題，決議前不放佔位項目。
    const items = [
      { id: "profile", label: "個人設定", icon: "User", onClick: () => { setOpen(false); setDrawer(true); } },
      { id: "logout", label: "登出", icon: "LogOut", onClick: () => { setOpen(false); (onLogout || (() => {}))(); } },
    ];

    // ── 目前身份 ───────────────────────────────────────────────────────────
    // 2026-08-17 Carol（PM）：清單＝**所有身份**，平台身份自成一列。
    // activeTeamId 這個 prop 名稱沿用舊的，實際傳的是身份 key（相容團隊 id）。
    const roles = resolveRoles(persona, activeTeamId);
    const identities = roles.identities;
    const canSwitch = identities.length > 1 && typeof onSwitchTeam === "function";
    // 副標：目前身份的完整標籤（團隊身份一定帶團隊名前綴，見 wg-terms.js 硬規則）
    const subtitle = roles.active ? roles.active.fullLabel : persona.title;

    // 分兩組。Carol 的「不知道代表哪個身分」要在這裡被回答 —— 光靠一列一列排，
    // 使用者仍分不出「超級管理員」和「慈濟基金會 · 管理員」是兩種不同層級的東西。
    const GROUPS = [
      ["平台身份", roles.platformIdentities],
      ["團隊身份", roles.teamIdentities],
    ].filter(([, list]) => list.length);

    return (
      <div ref={ref} style={{ position: "relative" }}>
        <button type="button" onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu" aria-expanded={open}
          title={canSwitch ? "切換身份 / 個人設定" : "個人設定"}
          style={{ display: "flex", alignItems: "center", gap: 10, border: "none", cursor: "pointer",
            background: open ? "var(--color-bg-neutral-subtle)" : "transparent",
            padding: "5px 9px 5px 5px", borderRadius: "var(--radius-full)", textAlign: "left",
            transition: "background var(--transition-fast)" }}>
          <Avatar name={name} tone={persona.rbacTone === "primary" || persona.rbac === "super" ? "primary" : "secondary"} size={36} />
          <span style={{ lineHeight: 1.25 }}>
            <span style={{ font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", display: "flex", alignItems: "center", gap: 6 }}>
              {name}
              {/* 2026-08-17：徽章顯示**目前身份的**平台角色，不是這個人的 persona.rbac。
                  切換身份時這顆要跟著變 —— Carol 的「不知道代表哪個身分」也包含這裡。 */}
              {roles.platformRole && <Badge tone={window.wgPlatformTone(roles.platformRole)}>{window.wgPlatformLabel(roles.platformRole)}</Badge>}
            </span>
            <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", display: "flex", alignItems: "center", gap: 5 }}>
              {canSwitch && <Icon n="ArrowLeftRight" s={12} c="var(--color-fg-neutral-muted)" />}
              {subtitle}
            </span>
          </span>
          <Icon n={open ? "ChevronUp" : "ChevronDown"} s={16} c="var(--color-fg-neutral-muted)" />
        </button>

        {open && (
          <div role="menu"
            style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: canSwitch ? 300 : 208, zIndex: 200,
              background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 6 }}>

            {/* 身份切換：比照 Google／FB 的帳號切換器 —— 目前身份放最上面（大頭像），
                其餘身份分「平台身份／團隊身份」兩組列在下方，點一下直接換。
                只有一個身份時整區不出現，因為沒得選。

                每一列的副標寫「這個身份能做什麼」（wg-terms.js 的 IDENTITY_HINTS）。
                這是 D-3 乾淨切的補償：越權的功能整個不 render，使用者找不到功能時
                答案要在他正要按的這個選單裡。 */}
            {canSwitch && (
              <React.Fragment>
                {/* 目前代表誰 —— Carol 8/17「不知道他在下這個決策的時候是代表哪個
                    身分」的直接答案，所以放最上面、字最大。 */}
                <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 10px 11px" }}>
                  <IdentityAvatar identity={roles.active} size={40} />
                  <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                    <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", display: "block" }}>目前代表</span>
                    <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)", display: "block" }}>{roles.active.fullLabel}</span>
                  </span>
                </div>

                <div style={{ margin: "0 4px 6px", height: 1, background: "var(--color-bg-neutral-sunken)" }} />

                {/* ⚠️ 兩組都完整列出，**不把目前身份從清單裡抽掉**。
                    抽掉的話，切在平台身份時「平台身份」這個小標就整組消失，使用者
                    看到的會是一份殘缺的結構 —— 那正好是 Carol 想解的「不知道代表
                    哪個身分」。目前那一列改成不可點、打勾標示。 */}
                {GROUPS.map(([groupLabel, list]) => (
                  <React.Fragment key={groupLabel}>
                    <div style={{ padding: "4px 10px 5px" }}>
                      <span style={{ font: "var(--font-data-300)", fontWeight: 700, letterSpacing: "0.04em",
                        color: "var(--color-fg-neutral-muted)" }}>{groupLabel}</span>
                    </div>
                    {list.map((m) => {
                      const isActive = m.key === roles.activeId;
                      return (
                        <button key={m.key} type="button" role="menuitemradio" aria-checked={isActive}
                          disabled={isActive}
                          onClick={() => { if (!isActive) { onSwitchTeam(m.key); setOpen(false); } }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, minHeight: 48, padding: "6px 10px",
                            border: "none", borderRadius: "var(--radius-sm)", textAlign: "left",
                            cursor: isActive ? "default" : "pointer",
                            background: isActive ? "var(--color-bg-primary-subtle)" : "transparent",
                            transition: "background var(--transition-fast)" }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                          <IdentityAvatar identity={m} size={34} />
                          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                            <span style={{ font: isActive ? "var(--font-label-500)" : "var(--font-label-400)", color: "var(--color-fg-neutral-default)", display: "block" }}>{m.fullLabel}</span>
                            <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", display: "block",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.hint}</span>
                          </span>
                          {isActive && <Icon n="Check" s={17} c="var(--color-bg-primary)" />}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
                <div style={{ margin: "6px 4px", height: 1, background: "var(--color-bg-neutral-sunken)" }} />
              </React.Fragment>
            )}

            {items.map((it) => (
              <button key={it.id} type="button" role="menuitem" disabled={it.disabled}
                onClick={it.onClick} title={it.disabled ? it.note : undefined}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, height: 38, padding: "0 10px",
                  border: "none", borderRadius: "var(--radius-sm)", background: "transparent", textAlign: "left",
                  cursor: it.disabled ? "not-allowed" : "pointer",
                  color: it.disabled ? "var(--color-fg-neutral-muted)" : "var(--color-fg-neutral-default)",
                  font: "var(--font-label-400)" }}
                onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <Icon n={it.icon} s={17} c="currentColor" />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.note && <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>{it.note}</span>}
              </button>
            ))}
          </div>
        )}

        {drawer && (
          <WGProfileDrawer persona={persona} name={name} activeTeamId={activeTeamId}
            onSaveName={setName} onClose={() => setDrawer(false)} />
        )}
      </div>
    );
  }

  Object.assign(window, { WGPersonaMenu, WGProfileDrawer, wgResolveProfileRoles: resolveRoles });
})();
