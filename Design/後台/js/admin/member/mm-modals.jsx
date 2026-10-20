// mm-modals.jsx — 建立團隊、邀請成員、指派平台角色、QR 區塊
(function () {
  const { Button, Badge, Field, Input, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { MMModal, useMM } = window;

  // ── QR + 短連結展示區塊 ───────────────────────────────────────────────────
  /* 2026-10-20 改版（Sucre：「改一下設計稿」，起因是 PM 問「網址變成 QR 的 generator」）
   *
   * MEM-QR-112（我定的編號）：QR 由前端把邀請網址轉成圖，不另外接 QR 服務。
   *   - 用專案內 vendored 的 js/vendor/qrcode.js（qrcode-generator v2.0.4，MIT），與前台分享同一支。
   *   - ❌ 不可以改用線上 QR 產生器（goqr、qr-code-generator.com 之類）：
   *       ① 災區網路不穩，外部站掛掉就產不出 QR
   *       ② 邀請網址本身就是入隊憑證，丟給第三方等於把 token 外流
   *   - 後端只負責發網址（token、效期、人數上限、作廢）；QR 只是同一條網址的另一種樣子，
   *     所以 QR 與短連結**永遠是同一個 token**，不得各自產生。
   *
   * MEM-QR-113（我定的）：產生後要能直接送出去 —— 現場的傳遞管道就是 LINE 群組。
   *   動作順序：分享到 LINE → 系統分享（只在支援的裝置顯示，不給死鈕）→ 下載 QR 圖 → 複製連結。
   *   下載給 PNG 不給 SVG：LINE 收不了 SVG，傳到群組會變成檔案而不是圖片。 */
  // 檔名一律英數：中文檔名在部分 Chrome 會被存成「download」（2026-10-20 實測）
  function QRBlock({ link, shareText = "", fileName = "wanguard-invite", metaItems = [], otpNote = true }) {
    const mm = useMM();
    const url = "https://" + link;
    const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
    const text = shareText || "點連結或掃 QR 加入團隊";

    const copy = () => {
      const done = () => mm.toast("已複製邀請連結");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    };
    const shareLine = () => {
      // LINE 官方 web intent：手機會開 LINE App 選聊天室，桌機開 LINE 網頁版。不需 SDK。
      window.open("https://line.me/R/msg/text/?" + encodeURIComponent(text + "\n" + url), "_blank", "noopener");
    };
    const nativeShare = () => { navigator.share({ title: text, url }).catch(() => {}); };
    const download = () => {
      const ok = window.mmDownloadQrPng(url, fileName + ".png");
      mm.toast(ok ? "已下載 QR 圖片，可直接傳到 LINE 群組或列印張貼" : "QR 產生器未載入，無法下載", ok ? undefined : "danger");
    };

    return (
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ padding: 14, borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", background: "#fff", boxShadow: "var(--shadow-sm)", flexShrink: 0 }}>
          <window.MMQRCode value={url} size={168} />
        </div>
        <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button variant="primary" size="sm" startIcon={<Icon n="MessageCircle" s={15} />} onClick={shareLine}>分享到 LINE</Button>
            {canNativeShare && <Button variant="outline" size="sm" startIcon={<Icon n="Share2" s={15} />} onClick={nativeShare}>其他分享方式</Button>}
            <Button variant="outline" size="sm" startIcon={<Icon n="Download" s={15} />} onClick={download}>下載 QR 圖片</Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>邀請連結（與 QR 是同一個）</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 6px 0 14px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
              <Icon n="Link" s={16} c="var(--color-fg-neutral-muted)" />
              <span style={{ flex: 1, font: "var(--font-data-400)", color: "var(--color-fg-neutral-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</span>
              <Button size="sm" variant="ghost" startIcon={<Icon n="Copy" s={15} />} onClick={copy}>複製</Button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {metaItems.map((m, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
                <Icon n={m.icon} s={14} c="var(--color-fg-neutral-muted)" />
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>{m.text}</span>
              </span>
            ))}
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
            shareText={"邀請你成為「" + f.name + "」在島嶼守望的團隊管理員，點連結或掃 QR 加入"}
            fileName={"wanguard-admin-invite"}
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
  /* 2026-10-20 再簡化（Sucre：「後端要寫了，簡單設計就好。不要選時間，固定 24 小時；時間到就到期，也不限制人數」）
   *
   * MEM-QR-103（改寫）：一張邀請**固定 24 小時後失效，不設人數上限**，沒有任何設定可選。
   *   - 不限人數是安全的，因為掃碼**不等於入隊**：掃碼 → 手機 OTP → 進審核佇列 → 管理員核准才算數。
   *     擋人的是審核，不是名額。QR 被轉傳出去，最壞的情況是佇列裡多幾筆要按「拒絕」。
   *   - 失效只在後端判斷（掃碼時用 token 查到期時間）。前端顯示的時間只是提醒，不得拿來擋人 —— 使用者手機時間可以亂調。
   *   - 沒有「延長」：要延長就再產生一張新的。舊的照樣在自己的 24 小時內有效。
   *   - 已經在佇列裡的申請，邀請過期後照常可審（MEM-QR-105）。
   *   - ❌ 不要加回「單次／多次」「有效期選項」「人數上限」：每多一個設定，現場招人就多一個要先想的決定，後端也多一組要守的規則。
   *
   * 所以打開視窗就直接產生，不需要「產生」那一步。 */
  const INVITE_HOURS = 24;

  function InviteMemberModal({ team, onClose }) {
    const mm = useMM();
    // 打開即產生一張（原型：只在第一次 render 記一筆 audit）
    const logged = React.useRef(false);
    React.useEffect(() => {
      if (logged.current) return;
      logged.current = true;
      mm.pushAudit({ actor: mm.persona.name, action: `產生成員邀請 QR（${INVITE_HOURS} 小時）`, cat: "qr", scope: team.id });
    }, []);

    return (
      <MMModal
        title={`邀請成員加入「${team.name}」`} width={640} onClose={onClose}
        footer={<Button variant="primary" onClick={onClose}>完成</Button>}
      >
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
          把 QR 或連結傳到 LINE 群組，<b>{INVITE_HOURS} 小時內</b>誰都可以掃，不限人數。
          掃碼者完成手機驗證後進入審核佇列，<b>你核准了才會加入</b>，並以成員身份加入本隊。
        </span>
        <QRBlock
          link={`wanguard.tw/i/${team.id.replace("t", "mb")}24h`}
          shareText={`邀請你加入「${team.name}」，24 小時內點連結或掃 QR，完成手機驗證後由管理員審核`}
          fileName={`wanguard-invite-${team.id}`}
          metaItems={[
            { icon: "Clock", text: `${INVITE_HOURS} 小時後失效` },
            { icon: "Users", text: "不限人數 · 需管理員核准" },
          ]}
        />
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
