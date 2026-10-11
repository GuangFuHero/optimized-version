// map-filter.jsx — 互助地圖的圖層開關與篩選器
//
// 🔒 這裡的篩選是**看的方式，不是選的方式**（2026-08-27 Sucre 裁示）。
//    圈選的計數與批次指派永遠吃完整清單，不吃篩選結果。
//    所以只要篩選還開著，繪製 HUD 與確認畫面都要同時寫出「區內 N 張（目前篩選顯示 M 張）」，
//    不然使用者會以為自己只指派了看得到的那幾張。見 spec.md 的 `MAP-ZD-128`。
//
// 站點用途類型**照抄正典** `libs/modules/src/station/type-options.ts`（11 值），
// 與前台 `js/site/site-route.js` 同一份。不要在這裡自己加類型。
(function () {
  const { Button, Badge } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  function Chip({ on, onClick, children, dot }) {
    return (
      <button type="button" onClick={onClick}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
          padding: "4px 10px", borderRadius: "var(--radius-full)",
          border: `1px solid ${on ? "var(--color-border-primary)" : "var(--color-border-default)"}`,
          background: on ? "var(--color-bg-primary-subtle)" : "var(--color-bg-neutral-default)",
          font: "var(--font-label-300)", fontWeight: on ? 700 : 400,
          color: on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)" }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: dot, flexShrink: 0 }}></span>}
        {children}
      </button>
    );
  }

  function Row({ label, children }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="wg-caption" style={{ fontWeight: 700, color: "var(--color-fg-neutral-muted)", letterSpacing: ".03em" }}>{label}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
      </div>
    );
  }

  function toggle(list, v) {
    return list.indexOf(v) >= 0 ? list.filter((x) => x !== v) : [...list, v];
  }

  const PRIORITIES = [
    ["critical", "生命危急", "#D32F2F"], ["high", "緊急", "#F57C00"],
    ["medium", "一般", "#2592B9"], ["low", "低", "#64748B"],
  ];
  const STATUSES = [["pending", "待處理"], ["in_progress", "處理中"], ["completed", "已完成"]];

  function MapFilterBar({ filters, setFilters, counts, open, setOpen, disabled }) {
    const f = filters;
    const set = (k) => (v) => setFilters((s) => ({ ...s, [k]: v }));
    const setLayer = (k) => () => setFilters((s) => ({ ...s, layers: { ...s.layers, [k]: !s.layers[k] } }));
    const active = f.priority.length + f.status.length + f.stationTypes.length + (f.assign === "all" ? 0 : 1);
    const filtered = counts.shownTickets !== counts.totalTickets || counts.shownStations !== counts.totalStations;
    const reset = () => setFilters(JSON.parse(JSON.stringify(window.MAP_DEFAULT_FILTERS)));

    return (
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 600, width: open ? 344 : "auto",
        maxWidth: "calc(100% - 24px)", borderRadius: "var(--radius-md)",
        background: "var(--color-bg-neutral-default)", border: "1px solid var(--color-border-default)",
        boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>

        {/* 摘要列 —— 收起來的時候只有這一條 */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px" }}>
          <Icon n="MapPin" s={15} c="var(--color-fg-neutral-muted)" />
          <span style={{ font: "var(--font-body-300)" }}>
            {f.layers.tickets ? `${counts.shownTickets} 張任務單` : "任務單已隱藏"}
          </span>
          <span style={{ color: "var(--color-border-default)" }}>·</span>
          <span style={{ font: "var(--font-body-300)" }}>
            {f.layers.stations ? `${counts.shownStations} 個站點` : "站點已隱藏"}
          </span>
          {/* 未指派是這一頁最常被問的數字，不能因為加了篩選器就從摘要列消失 */}
          {counts.unassigned > 0 && (
            <React.Fragment>
              <span style={{ color: "var(--color-border-default)" }}>·</span>
              <span style={{ font: "var(--font-body-300)", color: "var(--color-fg-warning)" }}>
                {counts.unassigned} 張未指派
              </span>
            </React.Fragment>
          )}
          {active > 0 && (
            <button type="button" onClick={reset}
              style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer",
                padding: "2px 4px", color: "var(--color-fg-neutral-muted)" }}>
              <span className="wg-caption" style={{ textDecoration: "underline" }}>清除</span>
            </button>
          )}
          <button type="button" onClick={() => setOpen(!open)} disabled={disabled}
            style={{ marginLeft: active > 0 ? 0 : "auto", display: "inline-flex", alignItems: "center", gap: 4, cursor: disabled ? "default" : "pointer",
              border: "none", background: "transparent", padding: "2px 4px",
              color: active ? "var(--color-fg-primary)" : "var(--color-fg-neutral-muted)", opacity: disabled ? 0.4 : 1 }}>
            <Icon n="SlidersHorizontal" s={15} c="currentColor" />
            <span className="wg-caption" style={{ fontWeight: 700 }}>篩選{active ? ` ${active}` : ""}</span>
            <Icon n={open ? "ChevronUp" : "ChevronDown"} s={13} c="currentColor" />
          </button>
        </div>

        {filtered && (
          <div style={{ padding: "6px 12px", background: "var(--color-bg-warning-subtle, #FFF6E5)",
            borderTop: "1px solid var(--color-border-default)" }}>
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", lineHeight: 1.6 }}>
              篩選只影響<b>看到什麼</b>。圈選的計數與批次指派一律算區內全部。
            </span>
          </div>
        )}

        {open && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 13,
            borderTop: "1px solid var(--color-border-default)", maxHeight: 420, overflowY: "auto" }}>

            <Row label="圖層">
              {[["tickets", "任務單"], ["stations", "資源站點"], ["zones", "區域"]].map(([k, label]) => (
                <Chip key={k} on={f.layers[k]} onClick={setLayer(k)}>{label}</Chip>
              ))}
            </Row>

            <div style={{ height: 1, background: "var(--color-border-default)" }}></div>

            <Row label="任務單 · 優先級">
              {PRIORITIES.map(([v, label, c]) => (
                <Chip key={v} dot={c} on={f.priority.indexOf(v) >= 0} onClick={() => set("priority")(toggle(f.priority, v))}>{label}</Chip>
              ))}
            </Row>

            <Row label="任務單 · 狀態">
              {STATUSES.map(([v, label]) => (
                <Chip key={v} on={f.status.indexOf(v) >= 0} onClick={() => set("status")(toggle(f.status, v))}>{label}</Chip>
              ))}
            </Row>

            <Row label="任務單 · 指派">
              {[["all", "全部"], ["unassigned", "未指派"], ["assigned", "已指派"]].map(([v, label]) => (
                <Chip key={v} on={f.assign === v} onClick={() => set("assign")(v)}>{label}</Chip>
              ))}
            </Row>

            <div style={{ height: 1, background: "var(--color-border-default)" }}></div>

            <Row label="資源站點 · 用途">
              {(window.MAP_STATION_TYPES || []).map((t) => (
                <Chip key={t.value} on={f.stationTypes.indexOf(t.value) >= 0}
                  onClick={() => set("stationTypes")(toggle(f.stationTypes, t.value))}>{t.label}</Chip>
              ))}
            </Row>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm" onClick={reset}>全部清除</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  Object.assign(window, { MapFilterBar });
})();
