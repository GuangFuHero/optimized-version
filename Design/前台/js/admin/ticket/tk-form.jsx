// tk-form.jsx — 新增 / 編輯任務抽屜（共通欄位 + 需求清單 Task；報案不選災害）
(function () {
  const { Field, Input, Button, Badge, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK, TKDrawer } = window;

  // 簡易下拉（DS 無 Select）；options: [{value,label}]
  function Select({ value, onChange, options, invalid, placeholder = "請選擇…" }) {
    return (
      <div style={{ display: "flex", alignItems: "center", height: 48, padding: "0 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", boxShadow: invalid ? "inset 0 0 0 1.5px var(--color-bg-danger)" : "inset 0 0 0 1px var(--color-border-default)" }}>
        <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, border: "none", outline: "none", background: "transparent", font: "var(--font-body-400)", color: value ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)", appearance: "none", cursor: "pointer" }}>
          <option value="" disabled>{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Icon n="ChevronDown" s={16} c="var(--color-fg-neutral-muted)" />
      </div>
    );
  }

  const KIND_OPTS = Object.entries(window.TK_TASK_KIND || {}).map(([value, v]) => ({ value, label: v.label }));
  const PRIORITY_OPTS = () => Object.entries(window.TK_PRIORITY).map(([value, v]) => ({ value, label: v.label }));

  // 單一需求列
  function TaskRow({ task, onChange, onRemove, canRemove }) {
    const locked = !!task._existing;
    const ts = window.TK_TASK_STATUS[task.status] || null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)", background: "var(--color-bg-neutral-default)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 96px 36px", gap: 10, alignItems: "center" }}>
          <Select value={task.kind} onChange={(v) => onChange({ ...task, kind: v })} options={KIND_OPTS} placeholder="種類" />
          <Input value={task.name} onChange={(e) => onChange({ ...task, name: e.target.value })} placeholder="需求名稱，如：破拆人力 / 圓鍬 / 礦泉水" />
          <Input type="number" value={task.quantity == null ? "" : task.quantity} onChange={(e) => onChange({ ...task, quantity: e.target.value })} placeholder="數量" />
          <button className="tk-iconbtn" title={canRemove ? "移除此需求" : "至少保留一筆需求"} disabled={!canRemove} onClick={onRemove} style={{ width: 36, height: 36, opacity: canRemove ? 1 : 0.35 }}>
            <Icon n="Trash2" s={16} c="var(--color-fg-neutral-muted)" />
          </button>
        </div>
        {locked && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {ts && <span style={{ font: "var(--font-data-300)", color: "var(--color-fg-neutral-subtle)" }}>{ts.label}</span>}
            <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
              {task.assignees && task.assignees.length
                ? <>承接：{task.assignees.map((a) => a.name).join("、")}</>
                : "尚無人承接"}
            </span>
          </div>
        )}
      </div>
    );
  }

  function TicketForm({ ticket, onClose }) {
    const tk = useTK();
    const editing = !!ticket;
    const act = window.TK_ACTIVATION;

    const [vals, setVals] = React.useState(() => ({
      title: ticket ? ticket.title : "",
      address: ticket ? window.tkAddress(ticket) : "",
      floor: ticket ? ticket.floor || "" : "",
      contact_name: ticket ? ticket.contact_name : "",
      contact_phone: ticket ? ticket.contact_phone || "" : "",
      desc: ticket ? ticket.desc : "",
      priority: ticket ? ticket.priority : "medium",
      // 歸屬單位（MEM-MT-101 一人多隊）：不靠全域「目前身份」，在開單當下就地決定。
      // 單隊的人直接就是那隊，看不到這個欄位；多隊的人預設帶入上次選的。
      team: ticket ? (ticket.team || "") : (tk.defaultTeam || ""),
    }));
    const [landmark, setLandmark] = React.useState(() => (ticket && ticket.landmark) || (ticket && window.TK_COORDS && window.TK_COORDS[ticket.id] ? { lat: window.TK_COORDS[ticket.id].c[0], lng: window.TK_COORDS[ticket.id].c[1], source: "manual" } : null));
    const [tasks, setTasks] = React.useState(() =>
      ticket ? ticket.tasks.map((t) => ({ ...t, _existing: true })) : [{ kind: "hr", name: "", quantity: "" }]
    );
    const [touched, setTouched] = React.useState(false);
    // TM-IMG-101：只存網址字串，不存檔案。舊種子是字串陣列，tkPhotoList 會正規化。
    const [photos, setPhotos] = React.useState(() =>
      (window.tkPhotoList ? window.tkPhotoList(ticket && ticket.photos) : [])
    );
    const set = (k) => (v) => setVals((s) => ({ ...s, [k]: v }));

    const namedTasks = tasks.filter((t) => t.name && t.name.trim());
    const missing = [];
    if (!vals.title.trim()) missing.push("標題");
    if (!vals.address.trim()) missing.push("地址");
    if (!vals.contact_name.trim()) missing.push("現場聯絡人");
    if (!landmark) missing.push("地標");
    if (namedTasks.length === 0) missing.push("至少一筆需求");

    const updateTask = (i, next) => setTasks((ts) => ts.map((t, idx) => (idx === i ? next : t)));
    const removeTask = (i) => setTasks((ts) => ts.filter((_, idx) => idx !== i));
    const addTask = () => setTasks((ts) => [...ts, { kind: "hr", name: "", quantity: "" }]);

    const save = () => {
      setTouched(true);
      if (missing.length) return;
      tk.saveTicket({ editing, id: ticket && ticket.id, vals: { ...vals, landmark, photos }, tasks: namedTasks });
      onClose();
    };

    return (
      <TKDrawer
        title={editing ? `任務 #${ticket.id}` : "新增任務"}
        sub={`當前事件「${act.name}」（${act.types.map((t) => window.TK_DISASTERS[t].label).join("＋")}）· 系統已預設，報案無需選災害`}
        onClose={onClose}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" startIcon={<Icon n="Check" s={16} />} onClick={save}>{editing ? "儲存變更" : "建立任務"}</Button>
        </>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {editing && (() => {
            const added = tk.actTypes.filter((a) => a.status === "active" && a.addedAt && !tk.bannerSeen[`${ticket.id}:${a.key}`]);
            if (!added.length) return null;
            const labels = added.map((a) => window.TK_DISASTERS[a.key].label).join("、");
            const accent = "var(--color-border-default)";
            return (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-subtle)", border: `1px dashed ${accent}` }}>
                <Icon n="Info" s={18} c="var(--color-fg-neutral-muted)" style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ font: "var(--font-label-400)", fontWeight: 700, color: "var(--color-fg-neutral-default)" }}>新欄位可補充</span>
                  <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>{labels}欄位已新增，現有任務可選擇補充資訊。無需強制更新。</span>
                </div>
                <button className="tk-iconbtn" aria-label="關閉提示" onClick={() => added.forEach((a) => tk.dismissBanner(ticket.id, a.key))} style={{ width: 26, height: 26, flexShrink: 0 }}>
                  <Icon n="X" s={15} c="var(--color-fg-neutral-muted)" />
                </button>
              </div>
            );
          })()}
          {/* 共通欄位 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!editing && (tk.myTeams || []).length > 1 && (
              <Field label="歸屬單位" required helper="這張單開在哪一隊底下。你隸屬多個單位，所以要選一次；下次開單會帶入這次的選擇。">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tk.myTeams.map((tm) => {
                    const on = vals.team === tm;
                    return (
                      <button key={tm} type="button" onClick={() => set("team")(tm)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 15px", borderRadius: "var(--radius-md)", cursor: "pointer",
                          border: `1px solid ${on ? "var(--color-fg-neutral-subtle)" : "var(--color-border-default)"}`,
                          background: on ? "var(--color-bg-neutral-subtle)" : "transparent",
                          font: "var(--font-label-400)", fontWeight: on ? 700 : 400, color: "var(--color-fg-neutral-default)" }}>
                        <Icon n={on ? "CircleDot" : "Circle"} s={15} c={on ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)"} />{tm}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>地點資訊</span>
            <Field label="任務標題" required error={touched && !vals.title.trim() ? "必填" : undefined}>
              <Input value={vals.title} onChange={(e) => set("title")(e.target.value)} placeholder="例：中山路100號 透天半倒受困" invalid={touched && !vals.title.trim()} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
              <Field label="地址" required error={touched && !vals.address.trim() ? "必填" : undefined}>
                <Input value={vals.address} onChange={(e) => set("address")(e.target.value)} placeholder="花蓮縣光復鄉中山路100號" invalid={touched && !vals.address.trim()} />
              </Field>
              <Field label="樓層（選填）">
                <Input value={vals.floor} onChange={(e) => set("floor")(e.target.value)} placeholder="如 6F / 透天" />
              </Field>
            </div>
            <Field label="地標" required helper={landmark ? undefined : "點地圖任一處或拖曳大頭針調整；救援端以此座標導航"} error={touched && !landmark ? "請在地圖上標記地標位置" : undefined}>
              <window.LocationPicker value={landmark} onChange={setLandmark} invalid={touched && !landmark} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="現場聯絡人" required error={touched && !vals.contact_name.trim() ? "必填" : undefined}>
                <Input value={vals.contact_name} onChange={(e) => set("contact_name")(e.target.value)} placeholder="姓名 / 稱謂" invalid={touched && !vals.contact_name.trim()} />
              </Field>
              <Field label="聯絡電話（選填）">
                <Input value={vals.contact_phone} onChange={(e) => set("contact_phone")(e.target.value)} placeholder="0912-xxx-xxx" />
              </Field>
            </div>
            <Field label="狀況描述（選填）">
              <textarea value={vals.desc || ""} onChange={(e) => set("desc")(e.target.value)} rows={3} placeholder="簡述現場狀況…"
                style={{ resize: "vertical", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "none", outline: "none", font: "var(--font-body-400)", color: "var(--color-fg-neutral-default)", background: "var(--color-bg-neutral-subtle)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}></textarea>
            </Field>
          </div>

          {/* 需求清單 Task */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "var(--font-label-500)", color: "var(--color-fg-neutral-default)" }}>需求清單</span>
              <Badge tone="neutral">{tasks.length}</Badge>
              <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>一個地點可有多筆需求；志工以「需求」為單位承接</span>
            </div>
            {tasks.map((t, i) => (
              <TaskRow key={i} task={t} onChange={(next) => updateTask(i, next)} onRemove={() => removeTask(i)} canRemove={tasks.length > 1} />
            ))}
            <button onClick={addTask} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: "var(--radius-md)", border: "1px dashed var(--color-border-default)", background: "transparent", cursor: "pointer", font: "var(--font-label-400)", color: "var(--color-brand-secondary-default)" }}>
              <Icon n="Plus" s={16} c="var(--color-brand-secondary-default)" />新增需求
            </button>
          </div>

          {/* 現場照片：圖片連結（TM-FEAT-010）
              🔒 這一區沒有檔案上傳控制項，也不會有 —— D-1「平台不存圖片，只存網址」。 */}
          {window.TKPhotoLinkEditor && <window.TKPhotoLinkEditor value={photos} onChange={setPhotos} />}

          {/* 優先級 */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "end" }}>
            <Field label="優先級">
              <Select value={vals.priority} onChange={set("priority")} options={PRIORITY_OPTS()} />
            </Field>
          </div>

          {touched && missing.length > 0 && (
            <Alert tone="danger" title={`尚有 ${missing.length} 項未完成`}>請補齊：{missing.join("、")}。</Alert>
          )}
        </div>
      </TKDrawer>
    );
  }

  Object.assign(window, { TicketForm });
})();
