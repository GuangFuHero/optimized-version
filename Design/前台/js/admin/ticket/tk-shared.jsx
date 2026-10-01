// tk-shared.jsx — 共用元件：context、badges（優先級/SLA/狀態/災害標籤/雙徽章）、modal、drawer、menu、toast
(function () {
  const { Badge, Card, Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  const TKCtx = React.createContext(null);
  const useTK = () => React.useContext(TKCtx);

  // ── 災害類型標籤（含來源色條的 chip；支援正常/新增/撤銷/編輯狀態）──────────
  function DisasterTag({ type, size = "md", state = "active", isNew = false, mono = false, onRemove, onRestore, revokedInfo }) {
    const raw = window.TK_DISASTERS[type];
    if (!raw) return null;
    // §6：整頁僅兩處用色，事件層標籤一律灰階
    const d = mono ? { label: raw.label, color: "var(--color-fg-neutral-subtle)", tint: "var(--color-bg-neutral-subtle)" } : raw;
    const revoked = state === "revoked";
    const h = size === "sm" ? 22 : 26;
    return (
      <span className={`tk-tag${isNew && !revoked ? " tk-chip-new" : ""}`}
        title={revoked && revokedInfo ? revokedInfo : undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", height: h, padding: size === "sm" ? "0 9px" : "0 11px", borderRadius: "var(--radius-full)",
          background: revoked ? "#ECECEC" : d.tint, border: revoked ? "1px solid #D4D4D4" : (mono ? "1px solid var(--color-border-default)" : `1px solid ${d.color}33`) }}>
        <span style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", flexShrink: 0, background: revoked ? "#B0B0B0" : d.color }}></span>
        <span style={{ font: "var(--font-data-300)", fontWeight: 700, color: revoked ? "#999999" : d.color, textDecoration: revoked ? "line-through" : "none" }}>{d.label}</span>
        {revoked && <span style={{ font: "var(--font-data-300)", color: "#999999" }}>已撤銷</span>}
        {isNew && !revoked && <span style={{ font: "var(--font-data-300)", fontWeight: 800, color: d.color }}>· 新</span>}
        {onRemove && !revoked && (
          <button className="tk-chipx" onClick={onRemove} aria-label={`移除 ${d.label}`} title={`移除「${d.label}」`}>
            <Icon n="X" s={12} c="currentColor" />
          </button>
        )}
        {revoked && onRestore && (
          <button onClick={onRestore} aria-label={`恢復 ${d.label}`} title="恢復此災害類型" style={{ marginLeft: 1, border: "none", background: "transparent", cursor: "pointer", lineHeight: 0, padding: 0, display: "inline-flex" }}>
            <Icon n="RotateCcw" s={13} c="#666666" />
          </button>
        )}
      </span>
    );
  }

  // ── 優先級（§6：只有「生命危急」實心紅；緊急淡橘底；一般／低純灰文字）────────
  function PriorityBadge({ p }) {
    const def = window.TK_PRIORITY[p];
    if (!def) return null;
    if (p === "critical") return <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap", background: "var(--color-bg-danger)", color: "#fff", font: "var(--font-data-300)", fontWeight: 700 }}>{def.label}</span>;
    if (p === "high") return <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap", background: "var(--color-bg-warning-subtle)", color: "var(--color-fg-warning)", font: "var(--font-data-300)", fontWeight: 700 }}>{def.label}</span>;
    return <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>{def.label}</span>;
  }

  // ── 狀態（灰字；只有「待處理」帶一個小橘點）────────────────────────────
  function StatusBadge({ s }) {
    const def = window.TK_STATUS[s] || { label: s };
    const quiet = s !== "pending";
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", font: "var(--font-data-300)", color: quiet ? "var(--color-fg-neutral-muted)" : "var(--color-fg-neutral-default)", fontWeight: quiet ? 400 : 600 }}>
        {def.dot && <span style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: "var(--color-bg-primary)", flexShrink: 0 }}></span>}
        {def.label}
      </span>
    );
  }

  // ── 承接進度（§4「缺口優先」文案 + §6 兩階灰 4px 進度條）──────────────────
  function fillState(tasks) {
    const total = (tasks || []).length;
    if (!total) return { total: 0, label: "尚無需求", covered: 0, done: 0, open: 0 };
    const done = tasks.filter((k) => k.status === "fulfilled").length;
    const open = tasks.filter((k) => !(k.assignees || []).length && k.status !== "fulfilled" && k.status !== "canceled").length;
    const covered = total - open;
    if (open > 0) return { total, open, covered, done, label: `待承接 ${open}／${total}` };
    if (done < total) return { total, open: 0, covered, done, label: `在途 ${total - done}／${total}` };
    return { total, open: 0, covered, done, label: `${total}/${total} 完成` };
  }

  function FillBar({ tasks, showLabel = true }) {
    const f = fillState(tasks);
    if (!f.total) return <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>尚無需求 · 待補列</span>;
    const pct = Math.round((f.covered / f.total) * 100);
    return (
      <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        {showLabel && <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>{f.label}</span>}
        <span style={{ height: 4, borderRadius: 2, background: "var(--color-bg-neutral-sunken)", overflow: "hidden", display: "block" }}>
          <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--color-fg-neutral-subtle)" }}></span>
        </span>
      </span>
    );
  }

  // ── 更新時間（§4：逾時警示只對生命危急／緊急生效）────────────────────────
  function relTime(min) {
    if (min < 1) return "剛剛";
    if (min < 60) return `${min} 分前`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} 小時前`;
    return `${Math.floor(h / 24)} 天前`;
  }
  function overdueLevel(priority, min) {
    const d = window.TK_PRIORITY[priority] || {};
    if (!d.warnMin) return null;               // 一般／低永遠安靜
    if (min >= d.overMin) return "over";
    if (min >= d.warnMin) return "warn";
    return null;
  }
  function UpdatedCell({ t }) {
    const min = t.updatedMin == null ? 0 : t.updatedMin;
    const lv = overdueLevel(t.priority, min);
    if (!lv) return <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", whiteSpace: "nowrap", justifySelf: "start" }}>{relTime(min)}</span>;
    const over = lv === "over";
    const def = window.TK_PRIORITY[t.priority];
    // 色調跟著優先級（生命危急＝紅、緊急＝橘），逾時只加重不換色
    const fg = t.priority === "critical" ? "var(--color-fg-danger)" : "var(--color-fg-warning)";
    const bg = t.priority === "critical" ? "var(--color-bg-danger-subtle)" : "var(--color-bg-warning-subtle)";
    return (
      <span title={`${def.label}：逾 ${over ? def.overMin : def.warnMin} 分未異動`}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap", justifySelf: "start", width: "fit-content",
          background: bg,
          border: `1px solid color-mix(in srgb, ${fg} ${over ? 55 : 25}%, transparent)`,
          color: fg, font: "var(--font-data-300)", fontWeight: 700 }}>
        <Icon n={over ? "TriangleAlert" : "Clock"} s={12} c={fg} />{relTime(min)}
      </span>
    );
  }

  // ── 「資料待確認」佔位（§7 阻斷級事項的統一樣式）──────────────────────────
  function PendingNote({ info, compact }) {
    if (!info) return null;
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: compact ? "8px 10px" : "10px 12px", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-border-default)", background: "var(--color-bg-neutral-subtle)" }}>
        <Icon n="CircleHelp" s={15} c="var(--color-fg-neutral-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ font: "var(--font-label-300)", fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>{info.title}</span>
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{info.note}</span>
        </div>
      </div>
    );
  }
  function PendingChip({ info, label = "資料待確認" }) {
    return (
      <span title={info ? `${info.title}｜${info.note}` : undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 20, padding: "0 8px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
          border: "1px dashed var(--color-border-default)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" }}>
        <Icon n="CircleHelp" s={11} c="var(--color-fg-neutral-muted)" />{label}
      </span>
    );
  }

  // ── SLA 倒數膠囊（逾時 → 紅色升級警示）─────────────────────────────────────
  function SLAPill({ leftMin, priority }) {
    const overdue = leftMin < 0;
    const escalate = overdue && priority === "life_threatening";
    const abs = Math.abs(leftMin);
    const txt = abs >= 60 ? `${Math.floor(abs / 60)} 小時 ${abs % 60} 分` : `${abs} 分`;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
        background: overdue ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-subtle)",
        border: `1px solid ${overdue ? "var(--color-border-danger, #D32F2F)" : "var(--color-border-default)"}` }}>
        <Icon n={overdue ? "TriangleAlert" : "Clock"} s={13} c={overdue ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)"} />
        <span style={{ font: "var(--font-data-300)", fontWeight: 700, color: overdue ? "var(--color-fg-danger)" : "var(--color-fg-neutral-subtle)" }}>
          {overdue ? `逾時 ${txt}` : `剩 ${txt}`}
        </span>
        {escalate && <span className={"tk-pulse"} style={{ font: "var(--font-data-300)", fontWeight: 800, color: "#fff", background: "var(--color-bg-danger)", borderRadius: "var(--radius-full)", padding: "1px 7px", marginLeft: 2 }}>已升級</span>}
      </span>
    );
  }

  // ── 雙徽章（立刻救援 🔴 + 直立救援 🏢⚠️，並存不合併）──────────────────────
  function ResponseBadges({ immediate, vertical }) {
    if (!immediate && !vertical) return null;
    return (
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
        {immediate && (
          <span title="立刻救援（最高優先覆寫）" style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", height: 24, padding: "0 9px", borderRadius: "var(--radius-full)", background: "var(--color-bg-danger)", color: "#fff" }}>
            <Icon n="Siren" s={13} c="#fff" /><span style={{ font: "var(--font-data-300)", fontWeight: 700 }}>立刻救援</span>
          </span>
        )}
        {vertical && (
          <span title="建築直立救援已啟動" style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", height: 24, padding: "0 9px", borderRadius: "var(--radius-full)", background: "var(--color-bg-primary-subtle)", border: "1px solid var(--color-bg-primary)", color: "var(--color-brand-primary-subtle)" }}>
            <Icon n="Building2" s={13} c="var(--color-brand-primary-subtle)" /><span style={{ font: "var(--font-data-300)", fontWeight: 700 }}>直立救援</span>
          </span>
        )}
      </span>
    );
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function TKModal({ title, width = 560, onClose, children, footer, icon }) {
    React.useEffect(() => {
      const fn = (e) => { if (e.key === "Escape") onClose && onClose(); };
      window.addEventListener("keydown", fn);
      return () => window.removeEventListener("keydown", fn);
    }, [onClose]);
    return (
      <div onClick={onClose} style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 500, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="tk-rise" onClick={(e) => e.stopPropagation()}>
          <Card elevation="lg" style={{ width, maxWidth: "92vw", maxHeight: "86vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {icon}
              <h2 className="wg-h600" style={{ margin: 0, flex: 1 }}>{title}</h2>
              <button onClick={onClose} className="tk-iconbtn" aria-label="關閉"><Icon n="X" s={18} c="var(--color-fg-neutral-subtle)" /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
            {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>{footer}</div>}
          </Card>
        </div>
      </div>
    );
  }

  // ── Drawer（右側滑出，給任務表單 / Building Anchor 抽屜）────────────────────
  // tabs（選用）：[{ key, label, badge }]，固定在標題下方、不隨內容捲動。
  // 用於把「查閱型內容」從主要閱讀串分流出去，例如任務詳情 ⟷ 歷史紀錄。
  function TKDrawer({ title, sub, width = 660, onClose, children, footer, headerExtra, tabs, activeTab, onTab }) {
    React.useEffect(() => {
      const fn = (e) => { if (e.key === "Escape") onClose && onClose(); };
      window.addEventListener("keydown", fn);
      return () => window.removeEventListener("keydown", fn);
    }, [onClose]);
    return (
      <div onClick={onClose} style={{ position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 500, background: "rgba(15,23,42,0.45)", display: "flex", justifyContent: "flex-end" }}>
        <div className="tk-slide" onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: "94vw", background: "var(--color-bg-neutral-default)", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ flexShrink: 0, padding: "20px 24px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="wg-h600" style={{ margin: 0 }}>{title}</h2>
              {sub && <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", marginTop: 4 }}>{sub}</div>}
            </div>
            {headerExtra}
            <button onClick={onClose} className="tk-iconbtn" aria-label="關閉"><Icon n="X" s={20} c="var(--color-fg-neutral-subtle)" /></button>
          </div>
          {tabs && tabs.length > 0 && (
            <div role="tablist" style={{ flexShrink: 0, display: "flex", gap: 2, padding: "0 24px", borderBottom: "1px solid var(--color-border-default)" }}>
              {tabs.map((tb) => {
                const on = tb.key === activeTab;
                return (
                  <button key={tb.key} role="tab" aria-selected={on} onClick={() => onTab && onTab(tb.key)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 14px", border: "none", background: "transparent", cursor: "pointer",
                      font: "var(--font-label-400)", color: on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)",
                      boxShadow: on ? "inset 0 -2px 0 0 var(--color-bg-primary)" : "none",
                      transition: "color var(--transition-fast)" }}>
                    {tb.label}
                    {tb.badge != null && (
                      <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-sunken)", color: "var(--color-fg-neutral-subtle)", font: "var(--font-data-300)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{tb.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>{children}</div>
          {footer && <div style={{ flexShrink: 0, padding: "16px 24px", borderTop: "1px solid var(--color-border-default)", display: "flex", justifyContent: "flex-end", gap: 10, background: "var(--color-bg-neutral-default)" }}>{footer}</div>}
        </div>
      </div>
    );
  }

  // ── 確認對話框（附理由，給刪除 / 解除直立救援等）────────────────────────────
  function ConfirmDialog({ title, body, label = "理由", confirmLabel = "確認", danger, requireReason = false, onConfirm, onClose }) {
    const [reason, setReason] = React.useState("");
    const [touched, setTouched] = React.useState(false);
    const invalid = requireReason && !reason.trim();
    return (
      <TKModal title={title} width={460} onClose={onClose}
        icon={danger ? <span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-danger-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n="TriangleAlert" s={20} c="var(--color-fg-danger)" /></span> : null}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => { setTouched(true); if (invalid) return; onConfirm(reason.trim()); onClose(); }}>{confirmLabel}</Button>
        </>}>
        {body && <p style={{ margin: 0, whiteSpace: "pre-line", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" }}>{body}</p>}
        {requireReason && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-subtle)" }}>{label} <span style={{ color: "var(--color-fg-danger)" }}>*</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="請說明原因…"
              style={{ resize: "vertical", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "none", outline: "none", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", background: "var(--color-bg-neutral-subtle)", boxShadow: touched && invalid ? "inset 0 0 0 2px var(--color-bg-danger)" : "inset 0 0 0 1px var(--color-border-default)" }}></textarea>
            {touched && invalid && <span className="wg-caption" style={{ color: "var(--color-fg-danger)" }}>此操作必須附上理由。</span>}
          </div>
        )}
      </TKModal>
    );
  }

  // ── 下拉動作選單 ──────────────────────────────────────────────────────────
  function TKMenu({ items, trigger }) {
    const [open, setOpen] = React.useState(false);
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <button className="tk-iconbtn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label="更多操作">
          {trigger || <Icon n="Ellipsis" s={18} c="var(--color-fg-neutral-subtle)" />}
        </button>
        {open && (
          <span>
            <span onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 400 }}></span>
            <span className="tk-rise" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 401, background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", minWidth: 184, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {items.filter(Boolean).map((it, i) => it === "divider" ? (
                <span key={i} style={{ height: 1, background: "var(--color-border-default)", margin: "4px 6px" }}></span>
              ) : (
                <button key={i} disabled={it.disabled} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick && it.onClick(); }}
                  onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: it.disabled ? "not-allowed" : "pointer", font: "var(--font-label-300)", textAlign: "left", whiteSpace: "nowrap", color: it.danger ? "var(--color-fg-danger)" : it.disabled ? "var(--color-fg-disable)" : "var(--color-fg-neutral-default)" }}>
                  {it.icon && <Icon n={it.icon} s={16} c="currentColor" />}{it.label}
                </button>
              ))}
            </span>
          </span>
        )}
      </span>
    );
  }

  function EmptyState({ icon = "Inbox", title, caption }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "56px 24px", color: "var(--color-fg-neutral-muted)" }}>
        <span style={{ width: 56, height: 56, borderRadius: "var(--radius-full)", background: "var(--color-bg-neutral-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon n={icon} s={26} c="var(--color-fg-neutral-muted)" /></span>
        <div style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-subtle)" }}>{title}</div>
        {caption && <div className="wg-caption" style={{ textAlign: "center", maxWidth: 380 }}>{caption}</div>}
      </div>
    );
  }

  function ToastHost({ toasts }) {
    return (
      <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} className="tk-rise" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-default)", color: "#fff", boxShadow: "var(--shadow-lg)", font: "var(--font-label-300)" }}>
            <Icon n={t.tone === "danger" ? "Siren" : "Check"} s={16} c={t.tone === "danger" ? "#FCA5A5" : "#86EFAC"} />{t.msg}
          </div>
        ))}
      </div>
    );
  }

  // ── 移除災害類型的確認框（三路：取消／保留欄位／一併停用）──────────────────
  function DisasterRemoveDialog({ dtKey, onClose }) {
    const tk = useTK();
    const d = window.TK_DISASTERS[dtKey];
    if (!d) return null;
    const fields = window.TK_DISASTER_FIELDS[dtKey] || [];
    const done = (mode) => {
      tk.revokeDisaster(dtKey, fields.length ? (mode === "disable" ? `已移除「${d.label}」，${fields.length} 個欄位一併停用` : `已移除「${d.label}」，${fields.length} 個欄位保留在表單上`) : undefined);
      onClose();
    };
    return (
      <TKModal title={`移除「${d.label}」`} width={472} onClose={onClose}
        icon={<span style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-bg-danger-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n="TriangleAlert" s={20} c="var(--color-fg-danger)" /></span>}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          {fields.length > 0 && <Button variant="secondary" onClick={() => done("keep")}>保留欄位</Button>}
          <Button variant="danger" onClick={() => done("disable")}>{fields.length ? "一併停用" : "移除"}</Button>
        </>}>
        <p style={{ margin: 0, font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", textWrap: "pretty" }}>
          {fields.length
            ? <>這個災害帶進了 <b>{fields.length} 個欄位</b>，要一併停用嗎？已經填過的值都會留著。</>
            : <>這個災害沒有帶進任何欄位，移除後新建任務不再包含它。此操作可在事件設定頁恢復。</>}
        </p>
        {fields.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: "1px solid var(--color-border-default)" }}>
            <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)" }}>{d.label}帶進的欄位</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {fields.map((f) => (
                <span key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--font-body-300)", color: "var(--color-fg-neutral-subtle)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "var(--radius-full)", background: "var(--color-fg-neutral-muted)", flexShrink: 0 }}></span>
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </TKModal>
    );
  }

  Object.assign(window, { DisasterRemoveDialog, TKCtx, useTK, DisasterTag, PriorityBadge, StatusBadge, FillBar, fillState, UpdatedCell, relTime, overdueLevel, PendingNote, PendingChip, TKModal, TKDrawer, ConfirmDialog, TKMenu, EmptyState, ToastHost });
})();
