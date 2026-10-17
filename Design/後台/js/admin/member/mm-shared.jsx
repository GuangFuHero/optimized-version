// mm-shared.jsx — 共用 UI 元件（badges、modal、選單、QR、空狀態、toast）
(function () {
  const { Badge, Card, Button, Avatar } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  // 全域 context：資料 + 動作 + tweaks
  const MMCtx = React.createContext(null);
  const useMM = () => React.useContext(MMCtx);

  // ── Badges ────────────────────────────────────────────────────────────────
  function RbacBadge({ rbac, solid }) {
    const def = window.MM_RBAC[rbac] || window.MM_RBAC.user;
    return <Badge tone={def.tone} variant={solid ? "solid" : "subtle"}>{def.label}</Badge>;
  }

  // 團隊角色兩值：管理員 / 成員（2026-08-14 裁示移除 Guest）。與平台角色正交。
  //
  // 🔒 2026-08-17 硬規則（wg-terms.js）：**團隊角色永遠不單獨出現，一律帶團隊名前綴。**
  //    這顆徽章是唯一的例外 —— 它只用在成員列表的角色欄，該情境有欄位標題
  //    （「本隊角色」）撐著，讀者知道自己在看哪一隊。
  //    ⚠️ 要把它搬去別的地方用之前，先回去讀 wg-terms.js 開頭那條規則；
  //       需要完整標籤請用 wgIdentityLabel()，不要自己拼字串。
  function TeamRoleBadge({ role }) {
    return <Badge tone={window.wgTeamRoleTone(role)}>{window.wgTeamRoleLabel(role)}</Badge>;
  }

  const MM_STATUS = {
    active:    { label: "啟用中",     tone: "success" },
    suspended: { label: "已暫停",     tone: "danger"  },
    pending:   { label: "待完成註冊", tone: "warning" },
    inactive:  { label: "已解散",     tone: "neutral" },
  };
  function StatusBadge({ status }) {
    const d = MM_STATUS[status] || MM_STATUS.active;
    return <Badge tone={d.tone}>{d.label}</Badge>;
  }

  const MM_TEAM_STATUS = {
    active:    { label: "運作中", tone: "success", solid: false },
    suspended: { label: "已暫停", tone: "danger",  solid: true  },
    inactive:  { label: "已解散", tone: "neutral", solid: false },
  };
  function TeamStatusBadge({ status }) {
    const d = MM_TEAM_STATUS[status] || MM_TEAM_STATUS.active;
    return <Badge tone={d.tone} variant={d.solid ? "solid" : "subtle"}>{d.label}</Badge>;
  }

  // 團隊類型兩值（2026-08-17 裁示：`gov` / `ngo`，與 ERD 一致，「其他」拿掉）。
  // 標籤與色調來自 wg-terms.js；wgTeamTypeKey 會把舊資料的「NGO」「政府」「其他」
  // 正規化過去，所以還沒改完的假資料不會壞。
  function TypeBadge({ type }) {
    return <Badge tone={window.wgTeamTypeTone(type)}>{window.wgTeamTypeLabel(type)}</Badge>;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function MMModal({ title, width = 560, onClose, children, footer, icon }) {
    React.useEffect(() => {
      const fn = (e) => { if (e.key === "Escape") onClose && onClose(); };
      window.addEventListener("keydown", fn);
      return () => window.removeEventListener("keydown", fn);
    }, [onClose]);
    return (
      <div onClick={onClose} style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 500, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="mm-rise" onClick={(e) => e.stopPropagation()}>
          <Card elevation="lg" style={{ width, maxWidth: "92vw", maxHeight: "86vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {icon}
              <h2 className="wg-h600" style={{ margin: 0, flex: 1 }}>{title}</h2>
              <button onClick={onClose} className="mm-iconbtn" aria-label="關閉">
                <Icon n="X" s={18} c="var(--color-fg-neutral-subtle)" />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
            {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>{footer}</div>}
          </Card>
        </div>
      </div>
    );
  }

  // ── 系統阻擋對話框（E1 / E8 等硬約束）────────────────────────────────────
  function BlockDialog({ title, body, rule, onClose }) {
    return (
      <MMModal
        title={title}
        width={480}
        onClose={onClose}
        icon={<span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-danger-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon n="ShieldAlert" s={20} c="var(--color-fg-danger)" />
        </span>}
        footer={<Button variant="primary" onClick={onClose}>我知道了</Button>}
      >
        <p style={{ margin: 0, font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" }}>{body}</p>
        {rule && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
            <Icon n="Lock" s={16} c="var(--color-fg-neutral-muted)" />
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)" }}>{rule}</span>
          </div>
        )}
      </MMModal>
    );
  }

  // ── 附理由的確認對話框（拒絕 / 暫停 / 解散均需附理由）─────────────────────
  function ReasonDialog({ title, body, label = "理由", placeholder = "請說明原因…", confirmLabel = "確認", danger, requireReason = true, onConfirm, onClose }) {
    const [reason, setReason] = React.useState("");
    const [touched, setTouched] = React.useState(false);
    const invalid = requireReason && !reason.trim();
    const submit = () => {
      setTouched(true);
      if (invalid) return;
      onConfirm(reason.trim());
      onClose();
    };
    return (
      <MMModal
        title={title} width={480} onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={submit}>{confirmLabel}</Button>
        </>}
      >
        {body && <p style={{ margin: 0, font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" }}>{body}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>
            {label}{requireReason && <span style={{ color: "var(--color-fg-danger)" }}> *</span>}
          </label>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} rows={3}
            style={{
              resize: "vertical", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "none", outline: "none",
              font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", background: "var(--color-bg-neutral-subtle)",
              boxShadow: touched && invalid ? "inset 0 0 0 2px var(--color-border-danger, #D32F2F)" : "inset 0 0 0 1px var(--color-border-default)",
            }}
          ></textarea>
          {touched && invalid && <span className="wg-caption" style={{ color: "var(--color-fg-danger)" }}>此操作必須附上理由。</span>}
        </div>
      </MMModal>
    );
  }

  // ── 下拉動作選單 ──────────────────────────────────────────────────────────
  function MMMenu({ items, trigger }) {
    const [open, setOpen] = React.useState(false);
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <button className="mm-iconbtn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label="更多操作">
          {trigger || <Icon n="Ellipsis" s={18} c="var(--color-fg-neutral-subtle)" />}
        </button>
        {open && (
          <span>
            <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }}></span>
            <span className="mm-rise" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 401, background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", minWidth: 200, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {items.filter(Boolean).map((it, i) =>
                it === "divider" ? (
                  <span key={i} style={{ height: 1, background: "var(--color-border-default)", margin: "4px 6px" }}></span>
                ) : (
                  <button
                    key={i} disabled={it.disabled}
                    onClick={() => { setOpen(false); it.onClick && it.onClick(); }}
                    onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: it.disabled ? "not-allowed" : "pointer", font: "var(--font-label-300)", textAlign: "left", whiteSpace: "nowrap", color: it.danger ? "var(--color-fg-danger)" : it.disabled ? "var(--color-fg-disable)" : "var(--color-fg-neutral-default)" }}
                  >
                    {it.icon && <Icon n={it.icon} s={16} c="currentColor" />}{it.label}
                  </button>
                )
              )}
            </span>
          </span>
        )}
      </span>
    );
  }

  // ── 示意 QRCode（依 token 決定圖樣的佔位圖）────────────────────────────────
  function FakeQR({ token = "wanguard", size = 168 }) {
    const n = 25;
    const cells = React.useMemo(() => {
      let h = 2166136261;
      for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 16777619); }
      const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
      const out = [];
      const inFinder = (r, c) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (inFinder(r, c)) continue;
        if (rand() < 0.45) out.push([r, c]);
      }
      return out;
    }, [token]);
    const finders = [[0, 0], [0, n - 7], [n - 7, 0]];
    return (
      <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" aria-label="邀請 QRCode（示意）">
        <rect width={n} height={n} fill="#fff"></rect>
        {cells.map(([r, c], i) => <rect key={i} x={c} y={r} width="1" height="1" fill="#111"></rect>)}
        {finders.map(([r, c], i) => (
          <g key={"f" + i}>
            <rect x={c} y={r} width="7" height="7" fill="#111"></rect>
            <rect x={c + 1} y={r + 1} width="5" height="5" fill="#fff"></rect>
            <rect x={c + 2} y={r + 2} width="3" height="3" fill="#111"></rect>
          </g>
        ))}
      </svg>
    );
  }

  // ── 空狀態 ────────────────────────────────────────────────────────────────
  function EmptyState({ icon = "Inbox", title, caption }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "56px 24px", color: "var(--color-fg-neutral-muted)" }}>
        <span style={{ width: 56, height: 56, borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon n={icon} s={26} c="var(--color-fg-neutral-muted)" />
        </span>
        <div style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-subtle)" }}>{title}</div>
        {caption && <div className="wg-caption" style={{ textAlign: "center", maxWidth: 380 }}>{caption}</div>}
      </div>
    );
  }

  // ── 統計小膠囊 ────────────────────────────────────────────────────────────
  function StatPill({ icon, label, value, tone, onClick }) {
    return (
      <span onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: "var(--radius-full)", background: tone === "danger" ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)", cursor: onClick ? "pointer" : "default", transition: "box-shadow var(--transition-fast)" }}
        onMouseEnter={onClick ? (e) => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; } : undefined}
        onMouseLeave={onClick ? (e) => { e.currentTarget.style.boxShadow = "none"; } : undefined}>
        <Icon n={icon} s={15} c={tone === "danger" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)"} />
        <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ font: "var(--font-data-400)", fontWeight: 700, whiteSpace: "nowrap", color: tone === "danger" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-default)" }}>{value}</span>
        {onClick && <Icon n="ChevronRight" s={14} c={tone === "danger" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)"} />}
      </span>
    );
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function ToastHost({ toasts }) {
    return (
      <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} className="mm-rise" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-default)", color: "#fff", boxShadow: "var(--shadow-lg)", font: "var(--font-label-300)" }}>
            <Icon n={t.tone === "danger" ? "CircleAlert" : "Check"} s={16} c={t.tone === "danger" ? "#FCA5A5" : "#86EFAC"} />
            {t.msg}
          </div>
        ))}
      </div>
    );
  }

  Object.assign(window, {
    MMCtx, useMM, RbacBadge, TeamRoleBadge, StatusBadge, TeamStatusBadge, TypeBadge,
    MMModal, BlockDialog, ReasonDialog, MMMenu, FakeQR, EmptyState, StatPill, ToastHost,
  });
})();
