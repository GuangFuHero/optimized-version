// ReviewQueue.jsx — 前台修改建議審查: 並排 diff + 樂觀並發衝突偵測 (R2/R3/RS2)
(function () {
  const { Button, Badge, Avatar } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const { SourceTag } = window.StationShared;
  const Icon = window.WGIcon;

  // current display value of a station field (for conflict detection)
  function currentVal(station, field) {
    if (!station) return "—";
    switch (field) {
      case "name": return station.name;
      case "contact_phone": return station.phone;
      case "opening_hours": return station.hours;
      case "address": return station.address;
      case "operational_status": return SD.STATUS[station.status].label;
      case "supplies": return station.supplies.map((x) => x.item).join("、") || "（無）";
      default: return station[field] != null ? String(station[field]) : "—";
    }
  }

  function ReviewQueue({ proposals, stationsById, caps, onApprove, onReject, onAdjust, onClose, initialStationId }) {
    const pending = proposals.filter((p) => p.status === "pending");
    const firstId = (initialStationId && pending.find((p) => p.stationId === initialStationId)) || pending[0];
    const [selId, setSelId] = React.useState(firstId ? firstId.id : null);
    const [resynced, setResynced] = React.useState({});
    const [rejectOpen, setRejectOpen] = React.useState(false);
    const [reason, setReason] = React.useState("");

    const sel = pending.find((p) => p.id === selId) || pending[0] || null;
    const station = sel ? stationsById[sel.stationId] : null;

    // per-proposal conflict: any field whose live value != proposal.old, unless re-synced
    const fieldRows = sel ? sel.changes.map((c) => {
      const live = currentVal(station, c.field);
      const isConflict = live !== c.old;
      return { ...c, live, isConflict };
    }) : [];
    const hasConflict = fieldRows.some((r) => r.isConflict);
    const isResynced = sel && resynced[sel.id];
    const blocked = hasConflict && !isResynced;

    const overlay = { position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
    const modal = { width: "min(1060px, 96vw)", height: "min(82vh, 760px)", background: "var(--color-bg-neutral-default)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", overflow: "hidden" };

    function approve() {
      if (blocked) return;
      onApprove(sel, fieldRows);
      setReason("");
    }
    function doReject() {
      onReject(sel, reason || "未提供原因");
      setRejectOpen(false); setReason("");
    }

    return React.createElement("div", { style: overlay, onMouseDown: (e) => { if (e.target === e.currentTarget) onClose(); } },
      React.createElement("div", { style: modal },
        // header
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid var(--color-border-default)" } },
          React.createElement("span", { style: { width: 38, height: 38, borderRadius: "var(--radius-md)", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-warning-subtle)", color: "var(--color-bg-warning)" } },
            React.createElement(Icon, { n: "GitPullRequestArrow", s: 20, c: "currentColor" })),
          React.createElement("div", { style: { flex: 1 } },
            React.createElement("h2", { className: "wg-h600", style: { fontSize: 19 } }, "前台修改建議審查"),
            React.createElement("div", { className: "wg-caption", style: { marginTop: 2 } }, `${pending.length} 筆待審 · 原資料於核准前不變動 (proposal)`)
          ),
          React.createElement("button", { type: "button", onClick: onClose, "aria-label": "關閉", style: { border: "none", background: "transparent", cursor: "pointer", color: "var(--color-fg-neutral-muted)", lineHeight: 0, padding: 6 } },
            React.createElement(Icon, { n: "X", s: 22, c: "currentColor" }))
        ),
        React.createElement("div", { style: { flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", minHeight: 0 } },
          // list
          React.createElement("div", { style: { borderRight: "1px solid var(--color-border-default)", overflow: "auto", background: "var(--color-bg-neutral-subtle)" } },
            pending.length === 0 && React.createElement("div", { style: { padding: 32, textAlign: "center", color: "var(--color-fg-neutral-muted)" } },
              React.createElement(Icon, { n: "CheckCheck", s: 32, c: "var(--color-bg-success)" }),
              React.createElement("div", { className: "wg-label", style: { marginTop: 10 } }, "佇列已清空"),
              React.createElement("div", { className: "wg-caption", style: { marginTop: 4 } }, "目前沒有待審的修改建議。")
            ),
            pending.map((p) => {
              const st = stationsById[p.stationId];
              const conflict = p.changes.some((c) => currentVal(st, c.field) !== c.old) && !resynced[p.id];
              const active = sel && p.id === sel.id;
              return React.createElement("button", { key: p.id, type: "button", onClick: () => setSelId(p.id),
                style: { width: "100%", textAlign: "left", border: "none", cursor: "pointer", padding: "14px 18px", borderBottom: "1px solid var(--color-bg-neutral-sunken)", borderLeft: active ? "3px solid var(--color-bg-primary)" : "3px solid transparent", background: active ? "var(--color-bg-neutral-default)" : "transparent" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
                  React.createElement("span", { style: { font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)" } }, p.stationName),
                  conflict
                    ? React.createElement(Badge, { tone: "danger", variant: "solid" }, "衝突")
                    : p.statusOnly ? React.createElement(Badge, { tone: "info" }, "狀態") : React.createElement(Badge, { tone: "warning" }, `${p.changes.length} 欄`)
                ),
                React.createElement("div", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)", marginTop: 5 } }, `${p.id} · ${p.submittedAt}`),
                React.createElement("div", { style: { marginTop: 7 } }, React.createElement(SourceTag, { source: p.source }))
              );
            })
          ),
          // detail
          sel ? React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0 } },
            React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 24 } },
              // submitter
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 } },
                React.createElement(Avatar, { name: sel.submittedBy.replace(/^.*· /, ""), tone: "secondary", size: 38 }),
                React.createElement("div", { style: { flex: 1 } },
                  React.createElement("div", { style: { font: "var(--font-label-400)", fontWeight: 700 } }, sel.submittedBy),
                  React.createElement("div", { className: "wg-caption" }, `提交於 ${sel.submittedAt} · 投稿時根據版本 v${sel.baseVersion}`)
                ),
                station && React.createElement(Badge, { tone: station.version === sel.baseVersion ? "success" : "warning" }, `站點現為 v${station.version}`)
              ),
              // conflict banner
              blocked && React.createElement("div", { style: { display: "flex", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--color-bg-danger-subtle)", border: "1px solid var(--color-bg-danger)", marginBottom: 18 } },
                React.createElement(Icon, { n: "TriangleAlert", s: 20, c: "var(--color-bg-danger)", style: { flexShrink: 0, marginTop: 2 } }),
                React.createElement("div", { style: { flex: 1 } },
                  React.createElement("div", { style: { font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-danger)" } }, "底稿已被變更，已阻擋盲目覆蓋"),
                  React.createElement("div", { className: "wg-caption", style: { marginTop: 3, color: "var(--color-fg-neutral-subtle)" } }, "此建議投稿後，站點同一欄位已被他人更新 (樂觀並發)。請重新比對最新底稿後再決定。"),
                  React.createElement(Button, { variant: "outline", size: "sm", style: { marginTop: 10 }, startIcon: React.createElement(Icon, { n: "RefreshCw", s: 15 }), onClick: () => setResynced((r) => ({ ...r, [sel.id]: true })) }, "重新比對最新底稿")
                )
              ),
              isResynced && hasConflict && React.createElement("div", { style: { display: "flex", gap: 10, padding: "11px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-success-subtle)", marginBottom: 18, alignItems: "center" } },
                React.createElement(Icon, { n: "CircleCheck", s: 18, c: "var(--color-bg-success)" }),
                React.createElement("span", { className: "wg-caption", style: { color: "var(--color-fg-success)" } }, "已重新比對：下方「目前最新值」為核准基準，建議值將覆蓋於其上。")
              ),
              // diff table header
              React.createElement("div", { className: "wg-label", style: { marginBottom: 10 } }, "欄位級對比 (field diff)"),
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
                fieldRows.map((r, i) => React.createElement(DiffRow, { key: i, row: r, showLive: r.isConflict }))
              )
            ),
            // action bar
            React.createElement("div", { style: { borderTop: "1px solid var(--color-border-default)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 } },
              rejectOpen
                ? React.createElement(React.Fragment, null,
                    React.createElement("input", { autoFocus: true, value: reason, onChange: (e) => setReason(e.target.value), placeholder: "拒絕原因（將回饋給投稿者）…",
                      style: { flex: 1, height: 44, padding: "0 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)", font: "var(--font-body-400)", outline: "none" } }),
                    React.createElement(Button, { variant: "ghost", size: "md", onClick: () => setRejectOpen(false) }, "取消"),
                    React.createElement(Button, { variant: "danger", size: "md", onClick: doReject }, "確認拒絕")
                  )
                : React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "wg-caption", style: { flex: 1 } }, blocked ? "需先重新比對才能核准" : "核准後前台資料將於 1 分鐘內反映"),
                    React.createElement(Button, { variant: "ghost", size: "md", startIcon: React.createElement(Icon, { n: "X", s: 16 }), onClick: () => setRejectOpen(true) }, "拒絕"),
                    React.createElement(Button, { variant: "outline", size: "md", startIcon: React.createElement(Icon, { n: "PencilLine", s: 16 }), onClick: () => onAdjust(station) }, "直接調整"),
                    React.createElement(Button, { variant: "primary", size: "md", disabled: blocked, startIcon: React.createElement(Icon, { n: "Check", s: 18 }), onClick: approve }, "核准並套用")
                  )
            )
          ) : React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-fg-neutral-muted)" } }, "—")
        )
      )
    );
  }

  function DiffRow({ row, showLive }) {
    const col = (label, value, tone) => React.createElement("div", { style: { flex: 1, minWidth: 0 } },
      React.createElement("div", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)", marginBottom: 5 } }, label),
      React.createElement("div", {
        style: {
          padding: "10px 13px", borderRadius: "var(--radius-md)", font: "var(--font-body-400)", fontSize: 15, wordBreak: "break-word",
          background: tone === "new" ? "var(--color-bg-success-subtle)" : tone === "conflict" ? "var(--color-bg-danger-subtle)" : "var(--color-bg-neutral-subtle)",
          color: tone === "new" ? "var(--color-fg-success)" : tone === "conflict" ? "var(--color-fg-danger)" : "var(--color-fg-neutral-subtle)",
          border: tone === "new" ? "1px solid var(--color-bg-success)" : "1px solid var(--color-border-default)",
        },
      }, value || "（空）")
    );
    return React.createElement("div", { style: { border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-lg)", padding: 14 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 11 } },
        React.createElement("span", { className: "wg-label-sm", style: { fontWeight: 700, color: "var(--color-fg-neutral-default)" } }, row.label),
        row.isConflict && React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, font: "var(--font-label-300)", color: "var(--color-fg-danger)" } },
          React.createElement(window.WGIcon, { n: "Zap", s: 13, c: "currentColor" }), "同欄位衝突")
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "stretch", gap: 10 } },
        col("投稿時的值", row.old, "old"),
        showLive && React.createElement(React.Fragment, null,
          React.createElement(Arrow, null),
          col("目前最新值", row.live, "conflict")
        ),
        React.createElement(Arrow, null),
        col("建議改為", row.new, "new")
      )
    );
  }
  function Arrow() {
    return React.createElement("div", { style: { display: "flex", alignItems: "center", color: "var(--color-fg-neutral-muted)", paddingTop: 22 } },
      React.createElement(window.WGIcon, { n: "ArrowRight", s: 18, c: "currentColor" }));
  }

  window.ReviewQueue = ReviewQueue;
})();
