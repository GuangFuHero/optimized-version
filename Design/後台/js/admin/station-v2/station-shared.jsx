// stationShared.jsx — shared UI atoms + role capability helper
(function () {
  const DS = window.WanGuardDesignSystem_9c8f68;
  const { Badge } = DS;
  const SD = window.StationData;

  // ── 角色權限矩陣（5 角色，與任務管理頁同一組角色）────────────────────────
  //
  // 依據：Notion「🛠️ RBAC — admin portal permission matrix」(BE-RBAC-3) 的
  //       Resources / Import-Export / Work Zones 三組矩陣列。
  //
  // ⚠️ 兩處【沒有 Notion 依據】，是 2026-08-07 由 Owner 決定的：
  //   1. Data Auditor 可審核、合併、匯出。Notion 明寫 data_auditor
  //      "has zero write access to any endpoint — any non-GET request returns 403"，
  //      且 Verify / Reject resource spot 兩列都是 ❌。此處刻意不照 Notion。
  //      （Notion 自己也矛盾：Feature #11 的 Keep Separate / Dismiss / Merge 給了 ✅）
  //   2. Team Admin / Team Member 在「被指派的站點」有完整處理權限。
  //      Notion 的 team_role 只涵蓋團隊成員管理，對資源站點沒有任何定義。
  //
  // 見 StationData.PENDING.rbacAuditor / PENDING.rbacTeam
  function caps(role) {
    const isSuper  = role === "super";
    const isGov    = role === "gov";
    const isAuditor = role === "auditor";
    const isTeam   = role === "admin" || role === "member";
    return {
      role,
      isSuper, isGov, isAuditor, isTeam,
      isTeamAdmin: role === "admin",
      persona: (window.TK_PERSONAS || {})[role] || null,
      team: ((window.TK_PERSONAS || {})[role] || {}).team || null,

      // 檢視：全角色可看（資源站點為公共資訊，AC-12）
      canView: true,
      // 匯出：Notion — super/ngo/gov/auditor 皆 ✅
      canExport: true,

      // 審核前台修改建議
      //   super ✅（Notion: Verify + Reject）
      //   gov   ✅ 僅核可，不可退回（Notion: Verify ✅ / Reject ❌）
      //   auditor ✅（Owner 決定，與 Notion 相反）
      //   team  ✅ 但僅限被指派的站點
      canReview: isSuper || isGov || isAuditor || isTeam,
      canRejectProposal: isSuper || isAuditor || isTeam,   // gov 不可退回
      // 合併重複站點（Notion Feature #11 給了 auditor ✅）
      canMerge: isSuper || isAuditor,

      // 寫入站點資料
      canCreate: isSuper || isTeam,
      canEdit: isSuper || isTeam,
      canQuickStatus: isSuper || isTeam,
      canRetire: isSuper,          // 下架＝軟刪除，AC-05 明訂僅 Super Admin
      canRollback: isSuper,
      // 責任區 polygon（Notion Work Zones：super ✅ / gov ✅ / 其餘 ❌）
      canDrawZone: isSuper || isGov,
      // 匯入 CSV：Notion 明列 Import CSV/Excel — super ✅ / ngo ✅ / gov ✅ / auditor ❌
      // ⚠️ Team Admin / Member 在 Notion 無定義，此處不給（匯入建立的是尚未指派的新站點）
      canImport: isSuper || isGov,
      // 指派站點給 Team：比照任務管理頁的 PERMS.assign（super ✅ / gov ✅）。
      // ⚠️ Notion 的 Resources 那組矩陣沒有「Assign resource spot」這一列，
      //    只有 Tickets 有「Assign ticket to NGO」。見 PENDING.rbacTeam。
      canAssign: isSuper || isGov,
      // 列表欄位設定為全域設定，只有 Super Admin 可改
    };
  }

  // 站點層級的處理權限：Team 角色只能動「指派給自己團隊」的站點。
  // ⚠️ 指派機制本身沒有正典依據（CLAUDE.md 記的是以地理判定 work_zones + team_zone_assign，
  //    ADR-049），這裡先用站點上的 assignedTeam 欄位示意。
  function canHandleStation(c, station) {
    if (!c || !station) return false;
    if (c.isSuper) return true;
    if (c.isTeam) return !!c.team && station.assignedTeam === c.team;
    return false;
  }

  const ROLE_LABEL = Object.fromEntries(
    (window.WG_ROLE_ORDER || []).map((r) => [r, ((window.TK_RBAC || {})[r] || {}).label || r])
  );

  function StatusBadge({ status, solid }) {
    // 站點群沒有營運狀態（2026-08-21 決議），以破折號佔位，不留空洞
    if (!status) return React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, "—");
    const m = SD.STATUS[status];
    return React.createElement(Badge, { tone: m.tone, variant: solid ? "solid" : "subtle" }, m.label);
  }

  function TypeChip({ type }) {
    const m = SD.TYPE[type];
    const Icon = window.WGIcon;
    return React.createElement("span", {
      style: { display: "inline-flex", alignItems: "center", gap: 6, font: "var(--font-label-400)", color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" },
    },
      React.createElement(Icon, { n: m.icon, s: 16, c: "var(--color-fg-neutral-muted)" }),
      m.label
    );
  }


  // 站點的「官方認定」標記（2026-08-21 決議）。
  // 站點來源只有一種（後台匯入），不具區別力；真正要標的是這筆是否為官方造冊。
  // 對應後端 stations.is_official。非官方不顯示任何 chip，避免列表被標籤淹沒。
  function OfficialTag({ official }) {
    const Icon = window.WGIcon;
    if (!official) return null;
    return React.createElement("span", {
      title: "由政府或公所造冊認定",
      style: {
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: "var(--radius-full)",
        font: "var(--font-label-300)", color: "var(--color-fg-info)", background: "var(--color-bg-info-subtle)",
      },
    }, React.createElement(Icon, { n: "ShieldCheck", s: 13, c: "currentColor" }), "官方");
  }

  // ⚠️ SourceTag 專供「前台建議」使用（那裡的 crowdsourced 是真的群眾投稿）。
  // 站點列表已改用 OfficialTag，勿再把 SourceTag 用在站點上。
  function SourceTag({ source }) {
    const Icon = window.WGIcon;
    const official = source === "official";
    return React.createElement("span", {
      style: {
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: "var(--radius-full)",
        font: "var(--font-label-300)",
        color: official ? "var(--color-fg-info)" : "var(--color-brand-primary-subtle)",
        background: official ? "var(--color-bg-info-subtle)" : "var(--color-bg-primary-subtle)",
      },
    },
      React.createElement(Icon, { n: official ? "ShieldCheck" : "Users", s: 13, c: "currentColor" }),
      official ? "官方" : "群眾投稿"
    );
  }

  // —— Generic dropdown menu (outside-click close) ——
  function Menu({ trigger, items, value, onSelect, align = "left", width = 200 }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (!open) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, [open]);
    const Icon = window.WGIcon;
    return React.createElement("div", { ref, style: { position: "relative", display: "inline-flex" } },
      React.createElement("div", { onClick: () => setOpen((o) => !o) }, trigger(open)),
      open && React.createElement("div", {
        style: {
          position: "absolute", top: "calc(100% + 8px)", [align]: 0, zIndex: 300, minWidth: width,
          background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 6, overflow: "hidden",
        },
      },
        items.map((it) => React.createElement("button", {
          key: it.value, type: "button",
          onClick: () => { setOpen(false); onSelect(it.value); },
          style: {
            width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
            padding: "9px 11px", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer",
            background: it.value === value ? "var(--color-bg-primary-subtle)" : "transparent",
            font: "var(--font-label-400)", color: "var(--color-fg-neutral-default)", whiteSpace: "nowrap",
          },
          onMouseEnter: (e) => { if (it.value !== value) e.currentTarget.style.background = "var(--color-bg-neutral-subtle)"; },
          onMouseLeave: (e) => { if (it.value !== value) e.currentTarget.style.background = "transparent"; },
        },
          it.dot && React.createElement("span", { style: { width: 9, height: 9, borderRadius: "50%", background: `var(--color-bg-${it.dot})`, flexShrink: 0 } }),
          it.icon && React.createElement(Icon, { n: it.icon, s: 16, c: "var(--color-fg-neutral-muted)" }),
          React.createElement("span", { style: { flex: 1 } }, it.label),
          it.value === value && React.createElement(Icon, { n: "Check", s: 15, c: "var(--color-bg-primary)" })
        ))
      )
    );
  }

  // Labeled filter dropdown button (pill)
  function FilterSelect({ label, value, items, onSelect, icon }) {
    const Icon = window.WGIcon;
    const cur = items.find((i) => i.value === value);
    const isAll = value === "all";
    return React.createElement(Menu, {
      value, items, onSelect, width: 188,
      trigger: (open) => React.createElement("button", {
        type: "button",
        style: {
          display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px",
          borderRadius: "var(--radius-full)", cursor: "pointer", font: "var(--font-label-400)",
          background: isAll ? "var(--color-bg-neutral-default)" : "var(--color-bg-primary-subtle)",
          color: isAll ? "var(--color-fg-neutral-subtle)" : "var(--color-brand-primary-subtle)",
          border: `1px solid ${isAll ? "var(--color-border-default)" : "var(--color-border-accent)"}`,
          boxShadow: open ? "0 0 0 3px var(--color-bg-secondary-subtle)" : "none", transition: "box-shadow var(--transition-fast)", whiteSpace: "nowrap",
        },
      },
        icon && React.createElement(Icon, { n: icon, s: 16, c: "currentColor" }),
        React.createElement("span", { style: { color: "var(--color-fg-neutral-muted)", fontWeight: 400 } }, label),
        React.createElement("span", { style: { fontWeight: 700 } }, cur ? cur.label : ""),
        React.createElement(Icon, { n: open ? "ChevronUp" : "ChevronDown", s: 15, c: "var(--color-fg-neutral-muted)" })
      ),
    });
  }


  // ── 資料待確認標籤（比照任務管理頁 PendingChip）─────────────────────────
  // 用於標示「此欄位／此行為在 RS-FEAT-001 正典中沒有依據，或與正典不一致」
  function PendingChip({ info, label = "資料待確認", size = "md" }) {
    const h = size === "sm" ? 18 : 20;
    return React.createElement("span", {
      title: info ? `${info.title}｜${info.note}` : undefined,
      style: { display: "inline-flex", alignItems: "center", gap: 4, height: h, padding: "0 8px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
        border: "1px dashed var(--color-border-default)", background: "var(--color-bg-neutral-subtle)", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)", cursor: "help" },
    },
      React.createElement(window.WGIcon, { n: "CircleHelp", s: 11, c: "var(--color-fg-neutral-muted)" }), label);
  }

  // ── 民眾投票票數（附議／否決）─────────────────────────────────────────
  // 刻意用線框圖示 + 純文字，與官方確認狀態的實心 badge 在視覺上區隔。
  // 用成對絕對數字而非長條：票數的意義是「多少人表態」，比例會誤導。


  // ── 相對時間與資料新鮮度 ────────────────────────────────────────────────
  function relTime(min) {
    if (min == null) return "—";
    if (min < 1) return "剛剛";
    if (min < 60) return `${min} 分前`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} 小時前`;
    return `${Math.floor(h / 24)} 天前`;
  }

  // 回傳 null / "stale" / "expired"
  function freshness(min) {
    if (min == null) return null;
    const F = SD.FRESHNESS;
    if (min >= F.expiredMin) return "expired";
    if (min >= F.staleMin) return "stale";
    return null;
  }

  // 更新時間儲存格。
  // ⚠️ 刻意不用 danger 色：站點久未更新代表「資料可能過期」，
  //    不代表站點有危險。紅色在本平台已用於任務的生命危急。
  function UpdatedCell({ station }) {
    const min = station.updatedMin;
    const lv = freshness(min);
    const txt = relTime(min);
    if (!lv) {
      return React.createElement("span", { title: station.updated,
        style: { font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)", whiteSpace: "nowrap" } }, txt);
    }
    if (lv === "stale") {
      return React.createElement("span", { title: `${station.updated}｜超過 24 小時未異動`,
        style: { display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", font: "var(--font-data-300)", color: "var(--color-fg-neutral-muted)" } },
        React.createElement(window.WGIcon, { n: "Clock", s: 12, c: "var(--color-fg-neutral-muted)" }), txt);
    }
    return React.createElement("span", { title: `${station.updated}｜超過 72 小時未異動，前往前請先確認`,
      style: { display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: "var(--radius-full)", whiteSpace: "nowrap", width: "fit-content",
        background: "var(--color-bg-warning-subtle)",
        border: "1px solid color-mix(in srgb, var(--color-fg-warning) 35%, transparent)",
        color: "var(--color-fg-warning)", font: "var(--font-data-300)", fontWeight: 700 } },
      React.createElement(window.WGIcon, { n: "Clock", s: 12, c: "var(--color-fg-warning)" }), txt);
  }

  window.StationShared = { caps, canHandleStation, ROLE_LABEL, relTime, freshness, UpdatedCell, StatusBadge, TypeChip, SourceTag, OfficialTag, Menu, FilterSelect, PendingChip };
})();
