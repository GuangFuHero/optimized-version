// tk-building.jsx — 現場分區的後台設定
/* 起點（Sucre 2026-09-12）：
     「後台輸入某地址他有幾樓幾戶，所以開啟這個表格，然後前台的人才能看到並且勾選。」

   🔴 **2026-09-20 裁示：矩陣退場，戶數不再輸入。**
      Sucre：「沒有表格就是列表條列而已。即使是建築物也只有樓層，
             因為這個是唯一可以掌握的。」
      → 後台只問**分區怎麼切**（地上幾層、地下幾層），不再問每層幾戶，
        也不再逐格標記不存在的戶。理由寫在 `js/site/site-building.jsx` 檔頭：
        矩陣唯一的價值在白格，白格要靠「災害當下有人去輸入每層幾戶」才成立，
        那個前提太薄。**樓層查得到，戶數查不到。**
      → 戶別從此是任務單上的一行自由文字（`302`／`早餐店`／`3樓之1`），
        後台不管它，系統也不假裝知道它有幾個。

   ⚠️ **`unitsPerFloor` 與 `missingCells` 仍留在 WGBridge 裡，但前後台都不再讀。**
      沒有一起刪是為了不動既有 localStorage 的資料形狀；正式版開表時直接不要這兩欄。

   ⚠️ **後端完全沒有建築這個東西**（ERD 沒有表、沒有可分群的欄位），
      這一份存在 WGBridge 的 localStorage，正式版要開表。

   TODO(2026-09-12)：**哪個後台角色能開這個開關尚未裁示。** 目前沿用本頁既有的
      `tk.can('manageActivation')` 判斷（＝能管事件的人），只是為了不讓每個人都能按，
      不代表這是正確答案。

   ✅ 2026-09-25 裁示：**改名為「現場分區」。** 「直立」在車廂情境不成立，
      分區名稱可自由填之後更說不通。程式內部一直用 `segment`，畫面用語與它對齊。
      （`BuildingSetupModal` / `BuildingSetupList` 等 function 名稱維持不動 ——
        改名要一起動 5 支檔案的呼叫端，與這次的文案改動無關。） */
(function () {
  const { Button, Field, Input, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK, TKModal } = window;
  const B = window.WGBridge;

  /** 從任務管理工具列進來的入口：**先看已經開了哪些，要新增才切到表單。**
   *  直接開表單是錯的 —— 多數時候人是來找「那一棟在哪裡」或來改樓層數，
   *  不是來新增第二棟。 */
  function BuildingSetupModal({ onClose }) {
    const tk = useTK();
    const canManage = tk.can && tk.can.activate;
    const version = B ? B.useBridgeVersion() : 0;
    const existing = React.useMemo(() => (B ? B.readBuildings() : []), [version]);
    const [mode, setMode] = React.useState(existing.length ? "list" : "new");
    const [address, setAddress] = React.useState("");
    const [alias, setAlias] = React.useState("");
    /* 🔴 2026-09-25 Sucre：「現場分區點下去還在問建築物要開幾層樓。」
       名字改了、資料結構改成自由文字了，但建立表單還停在樓層。
       → 先選**分區方式**，才問對應的數字。樓層只是其中一種。 */
    const [kind, setKind] = React.useState("floors");   // floors / cars / custom
    const [above, setAbove] = React.useState("");
    const [below, setBelow] = React.useState("0");
    const [cars, setCars] = React.useState("");
    const [custom, setCustom] = React.useState("");
    const [touched, setTouched] = React.useState(false);

    const nAbove = parseInt(above, 10);
    const nBelow = parseInt(below, 10) || 0;
    const nCars = parseInt(cars, 10);

    /* 三種方式最後都產出同一個東西：一串分區名稱。 */
    const segments = React.useMemo(() => {
      const out = [];
      if (kind === "floors") {
        if (!(nAbove > 0)) return [];
        for (let i = nBelow; i >= 1; i--) out.push("B" + i);
        for (let i = 1; i <= nAbove; i++) out.push(i + "F");
      } else if (kind === "cars") {
        if (!(nCars > 0)) return [];
        for (let i = 1; i <= nCars; i++) out.push("第 " + i + " 節車廂");
      } else {
        custom.split("\n").map((x) => x.trim()).filter(Boolean).forEach((x) => out.push(x));
      }
      return out;
    }, [kind, nAbove, nBelow, nCars, custom]);

    const dupSeg = segments.length !== new Set(segments).size;
    const bad = [];
    if (!address.trim()) bad.push("地點");
    if (!segments.length) bad.push(kind === "floors" ? "地上樓層數" : kind === "cars" ? "車廂數" : "分區名稱");
    const dup = address.trim() && B ? B.buildingForAddress(address) : null;

    const submit = () => {
      setTouched(true);
      if (bad.length || dupSeg) return;
      if (dup) { tk.toast("這個地點已經開過分區了", "danger"); return; }
      /* `floorsAbove/Below` 與 `unitsPerFloor` 是為了不動既有資料形狀而留的殘欄。
         真正決定畫面的是 `segments`。 */
      B.createBuilding({ address: address.trim(), alias: alias.trim(),
        floorsAbove: kind === "floors" ? nAbove : segments.length,
        floorsBelow: kind === "floors" ? nBelow : 0,
        unitsPerFloor: 1, segments: segments,
        userId: tk.persona && tk.persona.id });
      tk.toast("已開啟分區：" + (alias.trim() || address.trim()));
      /* 回清單而不是關掉整個視窗 —— 建立完下一件事通常是核對分區名稱，那在清單裡。 */
      setAddress(""); setAlias(""); setAbove(""); setBelow("0"); setCars(""); setCustom("");
      setTouched(false); setMode("list");
    };

    if (mode === "list") {
      return (
        <TKModal title="現場分區" width={560} onClose={onClose}
          icon={<Icon n="Building2" s={20} c="var(--color-fg-neutral-subtle)" />}
          footer={<>
            <Button variant="ghost" onClick={onClose}>關閉</Button>
            {canManage && <Button variant="primary" startIcon={<Icon n="Plus" s={16} />}
              onClick={() => setMode("new")}>開啟新的地點</Button>}
          </>}>
          <Alert tone="info" title="這是給「同一個地點要分成好幾區」的情況用的">
            開啟之後，這個地點在前台會多一份<strong>分區清單</strong>：每一區是一個框，
            裡面堆疊那一區的任務單。分區可以是樓層，也可以是車廂或自己命名的區域。
            <strong>只有開過分區的地點才會出現這份清單。</strong>
          </Alert>
          <BuildingSetupList canManage={canManage} />
        </TKModal>
      );
    }

    return (
      <TKModal title="開啟現場分區" width={560} onClose={onClose}
        icon={<Icon n="Building2" s={20} c="var(--color-fg-neutral-subtle)" />}
        footer={<>
          <Button variant="ghost" onClick={() => (existing.length ? setMode("list") : onClose())}>
            {existing.length ? "返回" : "取消"}
          </Button>
          <Button variant="primary" onClick={submit}>建立</Button>
        </>}>

        <Field label="地點（地址或現場名稱）" error={touched && !address.trim() ? "必填" : undefined}
          hint="要與任務單上的地址寫法一致，否則對不起來">
          <Input value={address} onChange={(e) => setAddress(e.target.value)}
            invalid={touched && !address.trim()} placeholder="花蓮縣光復鄉中正路二段 120 號" />
        </Field>

        <Field label="現場名稱（選填）" hint="現場講的是這個，不是門牌">
          <Input value={alias} onChange={(e) => setAlias(e.target.value)}
            placeholder="中正路社區大樓　／　0920 台鐵 408 次事故" />
        </Field>

        {/* 🔒 先選方式再問數字。樓層放第一個因為最常見，但它**不是預設的世界觀** ——
            車廂與自訂並列在同一排，使用者看得到這個功能不只是給大樓用的。 */}
        <Field label="怎麼分區">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["floors", "樓層", "Building2"], ["cars", "車廂", "TramFront"], ["custom", "自訂", "PenLine"]]
              .map(([k, label, icon]) => (
                <button key={k} type="button" className="tk-chipbtn"
                  onClick={() => setKind(k)}
                  style={k === kind ? {
                    borderColor: "var(--color-bg-primary)",
                    background: "var(--color-bg-primary-subtle)",
                    color: "var(--color-fg-neutral-default)" } : undefined}>
                  <Icon n={icon} s={13} c="currentColor" />{label}
                </button>
              ))}
          </div>
        </Field>

        {kind === "floors" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="地上樓層數" error={touched && !(nAbove > 0) ? "必填" : undefined}>
              <Input value={above} onChange={(e) => setAbove(e.target.value)}
                invalid={touched && !(nAbove > 0)} placeholder="12" />
            </Field>
            <Field label="地下樓層數">
              <Input value={below} onChange={(e) => setBelow(e.target.value)} placeholder="1" />
            </Field>
          </div>
        )}

        {kind === "cars" && (
          <Field label="車廂數" error={touched && !(nCars > 0) ? "必填" : undefined}
            hint="產生「第 1 節車廂」到「第 N 節車廂」，之後可以改名">
            <Input value={cars} onChange={(e) => setCars(e.target.value)}
              invalid={touched && !(nCars > 0)} placeholder="8" />
          </Field>
        )}

        {kind === "custom" && (
          <Field label="分區名稱（一行一個，由上而下就是顯示順序）"
            error={touched && !segments.length ? "至少要有一個分區" : undefined}
            hint="A 區、東側邊坡、三號倉庫……">
            <textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={6}
              placeholder={"A 區\nB 區\n東側邊坡"}
              style={{ width: "100%", resize: "vertical", padding: 8,
                borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)",
                font: "var(--font-body-300)", lineHeight: 1.6 }} />
          </Field>
        )}

        {dupSeg && <Alert tone="danger" title="分區名稱不能重複">
          重複的名稱沒辦法決定一張單該落在哪一區。
        </Alert>}

        {/* 🔒 預覽真正會產生的名字。數字換成名字，人才知道自己按了什麼。 */}
        {segments.length > 0 && !dupSeg && (
          <Alert tone="info" title={"會產生 " + segments.length + " 個分區"}>
            {segments.slice(0, 6).join("、")}{segments.length > 6 ? "…" : ""}
            <br /><strong>建立之後隨時可以改名</strong>，戶別由通報的人自己填在任務單上
            （「302」「早餐店」「3樓之1」都可以），後台不用先定義。
          </Alert>
        )}

        {dup && <Alert tone="warning" title="這個地點已經開過了">
          {(dup.alias || dup.address) + "：" + B.buildingSegments(dup).length + " 個分區"}
        </Alert>}
      </TKModal>
    );
  }

  /** 事件設定面板裡的一段：列出已開啟分區的地址，並可編輯分區名稱。 */
  function BuildingSetupList({ canManage }) {
    const tk = useTK();
    const version = B ? B.useBridgeVersion() : 0;
    const [editing, setEditing] = React.useState(null);
    const rows = React.useMemo(() => (B ? B.readBuildings() : []), [version]);

    /* 🔴 2026-09-25 Sucre：「希望後台有一些小文字說明，可以作為高樓層直立地圖
       或是車廂之類的？」——「現場分區」比「直立地圖」準確，但也更抽象，
       光看名字不知道可以拿來做什麼。**用例子解釋，不要用定義解釋。** */
    const hint = (
      <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.7 }}>
        把一個地點底下再切成幾區，每一區各自堆疊自己的任務單。分區可以是：
        <br />高樓大廈的<strong>樓層</strong>（B1、1F…12F）　·　
        出軌列車的<strong>車廂</strong>（第 1 節…第 8 節）　·　
        大範圍現場的<strong>自訂區域</strong>（A 區、東側邊坡）
        <br />先用樓層或車廂快速產生，之後隨時可以改名。
      </div>
    );

    if (!rows.length) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hint}
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            還沒有任何地點開啟分區。
          </span>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hint}
        {rows.map((b) => (
          <div key={b.id} style={{ display: "flex", flexDirection: "column", gap: 8,
            padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-default)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon n="Building2" s={16} c="var(--color-fg-neutral-subtle)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "var(--font-label-400)" }}>{b.alias || b.address}</div>
                <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
                  {b.address}｜{B.buildingSegments(b).length} 個分區：{B.buildingSegments(b).slice(0, 4).join("、")}{B.buildingSegments(b).length > 4 ? "…" : ""}
                </div>
              </div>
              {canManage && <button className="tk-chipbtn"
                onClick={() => setEditing(editing === b.id ? null : b.id)}>
                {editing === b.id ? "收合" : "編輯分區"}
              </button>}
            </div>

            {editing === b.id && <SegmentEditor b={b} tk={tk} onDone={() => setEditing(null)} />}
          </div>
        ))}
      </div>
    );
  }

  /** 編輯分區名稱。
   *  🔴 2026-09-25 Sucre：「直立樓層的樓層不是固定的，應該要可以自己寫上，
   *     例如第一節車廂第二節車廂。」
   *  ERD 查證：`secondary_locations.floor` 是 **string, nullable**，「第 1 節車廂」
   *  本來就寫得進去；全 schema 沒有任何 zone／area／section 欄位可以掛
   *  （`work_zones` 是團隊轄區，與 tickets 無關）。所以分區名稱只能靠 floor 那行字，
   *  **前後台用的字必須一樣**，否則單會落到「未定位」。 */
  function SegmentEditor({ b, tk, onDone }) {
    const [text, setText] = React.useState(B.buildingSegments(b).join("\n"));
    const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
    const dup = lines.length !== new Set(lines).size;
    const ok = lines.length > 0 && !dup;
    const removed = B.buildingSegments(b).filter((x) => lines.indexOf(x) === -1);

    const genFloors = () => {
      const n = parseInt(window.prompt("地上幾層？", String(b.floorsAbove || 12)), 10);
      const d = parseInt(window.prompt("地下幾層？（沒有就填 0）", String(b.floorsBelow || 0)), 10) || 0;
      if (!(n > 0)) return;
      const out = [];
      for (let i = d; i >= 1; i--) out.push("B" + i);
      for (let i = 1; i <= n; i++) out.push(i + "F");
      setText(out.join("\n"));
    };
    const genCars = () => {
      const n = parseInt(window.prompt("幾節車廂？", "8"), 10);
      if (!(n > 0)) return;
      const out = [];
      for (let i = 1; i <= n; i++) out.push("第 " + i + " 節車廂");
      setText(out.join("\n"));
    };

    const save = () => {
      if (!ok) { tk.toast(dup ? "分區名稱不能重複" : "至少要有一個分區", "danger"); return; }
      B.updateBuilding(b.id, { segments: lines });
      tk.toast("已更新分區");
      onDone();
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Field label="分區名稱（一行一個，由上而下就是顯示順序）"
          hint="要與任務單上「樓層」欄填的字一致，對不上的單會落到「未定位」">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
            style={{ width: "100%", resize: "vertical", padding: 8,
              borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)",
              font: "var(--font-body-300)", lineHeight: 1.6 }} />
        </Field>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="tk-chipbtn" onClick={genFloors}>用樓層產生</button>
          <button type="button" className="tk-chipbtn" onClick={genCars}>用車廂產生</button>
        </div>

        {dup && <Alert tone="danger" title="分區名稱不能重複">
          重複的名稱沒辦法決定一張單該落在哪一區。
        </Alert>}

        {/* 🔒 拿掉一個分區不會刪掉任何單，但那些單會掉進「未定位」。
            這句話要寫出來，否則沒人敢改。 */}
        {!dup && removed.length > 0 && (
          <Alert tone="warning" title={"會移除 " + removed.length + " 個分區：" + removed.join("、")}>
            原本在那幾區的任務單不會消失，會落到前台的「未定位」。把名稱改回來就會回去。
          </Alert>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm" onClick={onDone}>取消</Button>
          <Button variant="primary" size="sm" onClick={save}>儲存</Button>
        </div>
      </div>
    );
  }

  Object.assign(window, { BuildingSetupModal, BuildingSetupList });
})();
