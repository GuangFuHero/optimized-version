// StationDrawer.jsx — 站點詳情 / 編輯 / 新增 + 版本歷史 + 軟刪除/重新啟用/rollback (CRUD, R4, RS4)
(function () {
  const { Button, Badge, Tabs, Switch } = window.WanGuardDesignSystem_9c8f68;
  const SD = window.StationData;
  const { StatusBadge, TypeChip, SourceTag, LoadBar } = window.StationShared;
  const Icon = window.WGIcon;

  const selCss = { width: "100%", height: 46, padding: "0 14px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", outline: "none", appearance: "none", cursor: "pointer" };
  const inputCss = { ...selCss, cursor: "text" };

  function L({ label, children, required }) {
    return React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 5 } },
      React.createElement("span", { className: "wg-label-sm", style: { fontWeight: 700, color: "var(--color-fg-neutral-default)" } }, label, required && React.createElement("span", { style: { color: "var(--color-fg-danger)" } }, " *")),
      children
    );
  }
  function Row({ label, children }) {
    return React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: "1px solid var(--color-bg-neutral-sunken)" } },
      React.createElement("span", { className: "wg-caption", style: { flexShrink: 0 } }, label),
      React.createElement("span", { style: { textAlign: "right", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)" } }, children)
    );
  }

  function StationDrawer({ station, mode, caps, addCoords, onClose, onSave, onRetire, onReactivate, onRollback }) {
    const isNew = mode === "new";
    const [editing, setEditing] = React.useState(mode === "edit" || isNew);
    const [tab, setTab] = React.useState("info");
    const blank = { id: "", name: "", type: "supply", area: "光復鄉", address: "", status: "open", capacity: "", load: "", contact: "", phone: "", hours: "24 小時開放", lat: addCoords ? addCoords.lat : "", lng: addCoords ? addCoords.lng : "" };
    const init = station ? { ...station, capacity: station.capacity ?? "", load: station.load ?? "" } : blank;
    const [form, setForm] = React.useState(init);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    React.useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const title = isNew ? "新增資源站" : editing ? "編輯站點" : (station ? station.name : "");

    function save() {
      if (!form.name.trim()) return;
      onSave(form, isNew);
    }

    return React.createElement("div", { style: { position: "fixed", top: "var(--wg-banner-bottom, 0px)", left: 0, right: 0, bottom: 0, zIndex: 900, display: "flex", justifyContent: "flex-end" } },
      React.createElement("div", { onClick: onClose, style: { position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" } }),
      React.createElement("div", { style: { position: "relative", width: "min(540px, 100vw)", height: "100%", background: "var(--color-bg-neutral-default)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", animation: "wgDrawerIn var(--transition-base)" } },
        // header
        React.createElement("div", { style: { padding: "20px 24px", borderBottom: "1px solid var(--color-border-default)" } },
          React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 12 } },
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
              React.createElement("div", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, isNew ? "CRUD · 新增" : station.id),
              React.createElement("h2", { className: "wg-h700", style: { fontSize: 21, marginTop: 3 } }, title)
            ),
            React.createElement("button", { type: "button", onClick: onClose, "aria-label": "關閉", style: { border: "none", background: "var(--color-bg-neutral-subtle)", borderRadius: "var(--radius-full)", width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-fg-neutral-subtle)" } },
              React.createElement(Icon, { n: "X", s: 20, c: "currentColor" }))
          ),
          !editing && station && React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" } },
            React.createElement(StatusBadge, { status: station.status, solid: true }),
            React.createElement(SourceTag, { source: station.source }),
            station.verified
              ? React.createElement(Badge, { tone: "success" }, "已驗證")
              : React.createElement(Badge, { tone: "warning" }, "未驗證"),
            station.deleted && React.createElement(Badge, { tone: "neutral" }, "已下架")
          ),
          !editing && station && React.createElement("div", { style: { marginTop: 14 } },
            React.createElement(Tabs, { value: tab, onChange: setTab, tabs: [{ value: "info", label: "基本資料" }, { value: "history", label: `版本歷史 (v${station.version})` }] })
          )
        ),
        // body
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: 24 } },
          editing
            ? React.createElement(EditForm, { form, set, setForm, inputCss, selCss, isNew })
            : tab === "info"
              ? React.createElement(InfoView, { station, Row })
              : React.createElement(HistoryView, { station, caps, onRollback })
        ),
        // footer
        React.createElement("div", { style: { borderTop: "1px solid var(--color-border-default)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 10 } },
          editing
            ? React.createElement(React.Fragment, null,
                React.createElement("div", { className: "wg-caption", style: { flex: 1 } }, "儲存後自動記錄操作者與時間戳"),
                !isNew && React.createElement(Button, { variant: "ghost", size: "md", onClick: () => { setEditing(false); setForm(init); } }, "取消"),
                React.createElement(Button, { variant: "primary", size: "md", startIcon: React.createElement(Icon, { n: "Check", s: 18 }), onClick: save }, isNew ? "建立站點" : "確認送出")
              )
            : station && React.createElement(React.Fragment, null,
                station.deleted
                  ? (caps.canRetire
                      ? React.createElement(Button, { variant: "primary", size: "md", startIcon: React.createElement(Icon, { n: "RotateCcw", s: 17 }), onClick: () => onReactivate(station) }, "重新啟用站點")
                      : React.createElement("span", { className: "wg-caption", style: { flex: 1 } }, "此站點已下架（資料保留）"))
                  : React.createElement(React.Fragment, null,
                      caps.canRetire && React.createElement(Button, { variant: "ghost", size: "md", startIcon: React.createElement(Icon, { n: "Archive", s: 16 }), onClick: () => onRetire(station), style: { color: "var(--color-fg-danger)" } }, "下架"),
                      React.createElement("div", { style: { flex: 1 } }),
                      caps.canEdit
                        ? React.createElement(Button, { variant: "primary", size: "md", startIcon: React.createElement(Icon, { n: "PencilLine", s: 17 }), onClick: () => setEditing(true) }, "編輯站點")
                        : React.createElement("span", { className: "wg-caption" }, caps.isNGO ? "NGO 角色：唯讀檢視" : "")
                    ),
                station.deleted && caps.canRetire && React.createElement("div", { style: { flex: 1 } })
              )
        )
      )
    );
  }

  function InfoView({ station, Row }) {
    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 4 } }, React.createElement(TypeChip, { type: station.type })),
      Row({ label: "行政區", children: station.area }),
      Row({ label: "地址", children: station.address }),
      Row({ label: "座標", children: React.createElement("span", { className: "wg-data-xs" }, `${station.lat}, ${station.lng}`) }),
      Row({ label: "營運狀態", children: React.createElement(StatusBadge, { status: station.status }) }),
      Row({ label: "容量 / 目前使用", children: React.createElement("div", { style: { width: 160 } }, React.createElement(LoadBar, { load: station.load, capacity: station.capacity })) }),
      Row({ label: "聯絡人 / 電話", children: `${station.contact} · ${station.phone}` }),
      Row({ label: "開放時間", children: station.hours }),
      React.createElement("div", { style: { padding: "12px 0", borderTop: "1px solid var(--color-bg-neutral-sunken)" } },
        React.createElement("div", { className: "wg-caption", style: { marginBottom: 8 } }, "物資盤點"),
        station.supplies.length
          ? React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
              station.supplies.map((s, i) => React.createElement(Badge, { key: i, tone: SD.LEVEL[s.level].tone }, `${s.item}・${SD.LEVEL[s.level].label}`)))
          : React.createElement("span", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)" } }, "（無盤點資料）")
      ),
      Row({ label: "成立時間", children: station.established }),
      Row({ label: "建立者", children: station.createdBy }),
      Row({ label: "驗證", children: station.verified ? `${station.verifiedBy}` : "未驗證" }),
      Row({ label: "最後更新", children: React.createElement("span", { className: "wg-data-xs" }, station.updated) })
    );
  }

  function HistoryView({ station, caps, onRollback }) {
    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: "var(--color-fg-neutral-subtle)" } },
        React.createElement(Icon, { n: "History", s: 17, c: "var(--color-fg-neutral-muted)" }),
        React.createElement("span", { className: "wg-caption" }, "欄位級版本鏈：誰、何時、改了什麼。下架為軟刪除，歷史永久保留。")
      ),
      React.createElement("div", { style: { position: "relative", paddingLeft: 22 } },
        React.createElement("div", { style: { position: "absolute", left: 6, top: 6, bottom: 6, width: 2, background: "var(--color-bg-neutral-sunken)" } }),
        station.history.map((h, i) => React.createElement("div", { key: i, style: { position: "relative", paddingBottom: 20 } },
          React.createElement("span", { style: { position: "absolute", left: -22, top: 2, width: 14, height: 14, borderRadius: "50%", background: i === 0 ? "var(--color-bg-primary)" : "var(--color-bg-neutral-default)", border: `2.5px solid ${i === 0 ? "var(--color-bg-primary)" : "var(--color-border-default)"}` } }),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement(Badge, { tone: i === 0 ? "primary" : "neutral", variant: i === 0 ? "solid" : "subtle" }, `v${h.v}`),
            React.createElement("span", { className: "wg-label-sm", style: { fontWeight: 700, color: "var(--color-fg-neutral-default)" } }, h.note)
          ),
          React.createElement("div", { className: "wg-data-xs", style: { color: "var(--color-fg-neutral-muted)", margin: "5px 0 8px" } }, `${h.who} · ${h.when}`),
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5 } },
            h.diff.filter((d) => d.field !== "—").map((d, j) => React.createElement("div", { key: j, style: { display: "flex", alignItems: "center", gap: 7, font: "var(--font-data-300)", flexWrap: "wrap" } },
              React.createElement("code", { style: { padding: "1px 7px", borderRadius: "var(--radius-sm)", background: "var(--color-bg-neutral-sunken)", color: "var(--color-fg-neutral-subtle)" } }, d.field),
              React.createElement("span", { style: { color: "var(--color-fg-neutral-muted)", textDecoration: "line-through" } }, d.old),
              React.createElement(Icon, { n: "ArrowRight", s: 12, c: "var(--color-fg-neutral-muted)" }),
              React.createElement("span", { style: { color: "var(--color-fg-success)", fontWeight: 700 } }, d.new)
            ))
          ),
          caps.canRollback && i !== 0 && React.createElement(Button, { variant: "outline", size: "sm", style: { marginTop: 10 }, startIcon: React.createElement(Icon, { n: "RotateCcw", s: 14 }), onClick: () => onRollback(station, h.v) }, `回溯到 v${h.v}`)
        ))
      )
    );
  }

  function EditForm({ form, set, setForm, inputCss, selCss, isNew }) {
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
      isNew && React.createElement("div", { style: { display: "flex", gap: 10, padding: "11px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-primary-subtle)", alignItems: "center" } },
        React.createElement(Icon, { n: "Sparkles", s: 17, c: "var(--color-brand-primary-subtle)" }),
        React.createElement("span", { className: "wg-caption", style: { color: "var(--color-brand-primary-subtle)" } }, form.lat ? `座標已由地圖帶入：${form.lat}, ${form.lng}` : "新站點將以官方來源建立，版本從 v1 起算。")
      ),
      L({ label: "站點名稱", required: true, children: React.createElement("input", { value: form.name, onChange: set("name"), placeholder: "例：光復國中收容所", style: inputCss }) }),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
        L({ label: "類型", children: React.createElement("select", { value: form.type, onChange: set("type"), style: selCss }, SD.TYPE_ORDER.map((t) => React.createElement("option", { key: t, value: t }, SD.TYPE[t].label))) }),
        L({ label: "行政區", children: React.createElement("select", { value: form.area, onChange: set("area"), style: selCss }, SD.AREAS.map((a) => React.createElement("option", { key: a, value: a }, a))) })
      ),
      L({ label: "地址", children: React.createElement("input", { value: form.address, onChange: set("address"), placeholder: "花蓮縣光復鄉…", style: inputCss }) }),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
        L({ label: "營運狀態", children: React.createElement("select", { value: form.status, onChange: set("status"), style: selCss }, SD.STATUS_ORDER.map((s) => React.createElement("option", { key: s, value: s }, SD.STATUS[s].label))) }),
        L({ label: "開放時間", children: React.createElement("input", { value: form.hours, onChange: set("hours"), style: inputCss }) })
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
        L({ label: "容量（選填）", children: React.createElement("input", { value: form.capacity, onChange: set("capacity"), inputMode: "numeric", placeholder: "—", style: inputCss }) }),
        L({ label: "目前使用（選填）", children: React.createElement("input", { value: form.load, onChange: set("load"), inputMode: "numeric", placeholder: "—", style: inputCss }) })
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
        L({ label: "聯絡人", children: React.createElement("input", { value: form.contact, onChange: set("contact"), placeholder: "—", style: inputCss }) }),
        L({ label: "聯絡電話", children: React.createElement("input", { value: form.phone, onChange: set("phone"), placeholder: "—", style: inputCss }) })
      )
    );
  }

  window.StationDrawer = StationDrawer;
})();
