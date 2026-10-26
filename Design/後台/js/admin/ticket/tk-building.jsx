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
        改名要一起動 5 支檔案的呼叫端，與這次的文案改動無關。）

   ✅ 2026-10-15 Sucre：「直立地圖要改成新增地點（後台的部分）。」
      → **後台入口與用語改成「新增地點」**：任務管理工具列那顆鈕叫「新增地點」，
        點下去**直接進新增表單**（原本先進清單）；已新增的地點從表單左下角
        「看已新增的地點（N）」進去，或從事件設定／設定頁看。
      → 🚨 我定的：清單標題「已新增的地點」、按鈕圖示 MapPinPlus、
        事件設定與設定頁的區塊名稱跟著改。
      → **前台不動**，仍叫「現場分區」（`js/site/site-building.jsx`）。
   🔄 2026-10-26 Sucre（BE-036 核對）：
      → 🔒 按鈕改名「**開啟空間**」；清單叫「已開啟的空間」
      → 🔒 建立完直接關掉表單：空間會出現在任務管理列表與地圖上（tk-space.jsx SP-1），不再先進清單
      → 🔒 編輯改成名稱、地址、樓層數（tk-space.jsx SpaceEditModal，對齊 updateBuildingMap）；
         下面清單的「編輯分區」（一行一個樓層名稱）拿掉 —— 後端只存樓層數，自訂名稱是 V2（BE-037）
      → 🔒 沒權限的人看不到開啟空間按鈕（SP-5）
        前台民眾看到的是分區清單本身，沒有「新增」這個動作。 */
(function () {
  const { Button, Field, Input, Alert } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;
  const { useTK, TKModal } = window;
  const B = window.WGBridge;

  /* 🔒 2026-10-25 Sucre：「車廂」「自訂」分區是**下一階段**。
     後端 `building_maps` 只有樓層（RF＋地上 nF＋地下 Bn）與每層區域（floor_areas），
     存不了「第 1 節車廂」這種分區方式。這一階段的新增表單只做樓層。
     `SegmentEditor` 改分區名稱的功能仍在（舊資料與示範資料會用到），新建的一律走樓層。 */

  /* ── 後端契約（`Backend/app/services/building_map.py`，main @ 2026-10-25）──────────
     BM-1  createBuildingMap 必填：geometry（Point）、name（1–100 字）、
           floorsAboveGround（1–200）、floorsBelowGround（0–20）、secondaryLocation
     BM-2  secondaryLocation 只帶 fullAddress ＋ addressToken；**不可帶棟／樓／室**
     BM-3  權限：work_zone.add ＋ 必須是政府隊（原型用 tk.can.activate ＝ 超管／政府）
     BM-4  任務單歸到哪一棟靠建單時帶 buildingMapUuid，不是比對地址字串
     ── 地址查詢（Backend/Spec/027-address-normalization/frontend-guide.md）──────────
     BM-11 放下或移動大頭針 → 呼叫一次 reverseGeocode(lat, lng)（**拖曳中不要打**）
     BM-12 回傳 found：把 fullAddress 填進地址欄，留著 addressToken，送出時一起帶
     BM-13 not_found／unavailable：**不擋建立**，讓人自己打地址，存成 unverified
     BM-14 人改過地址欄 → token 作廢（後端只認「同一行字」），存成 unverified
     BM-15 每人每分鐘 30 次查詢，所以只在放下大頭針時查，不在打字時查
     ─────────────────────────────────────────────────────────────────────────── */

  const MAX_ABOVE = 200, MAX_BELOW = 20, MAX_NAME = 100;
  const MATCH_RADIUS_M = 500;   // 後端 reverseGeocode 的搜尋半徑（schema 說明「within 500 m」）

  function distM(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** 🚨 原型用的假反查：在示範任務單與已新增地點裡找最近的門牌（500 公尺內）。
   *  正式版換成 GraphQL `reverseGeocode(lat, lng)`（後端去問 TGOS），回傳形狀照後端
   *  `AddressLookupType` 的子集：{ status, fullAddress, distanceM, addressToken }。
   *  ⚠️ 交付版沒有示範任務單（測試資料已移除），所以這裡**永遠回 not_found**，畫面會一直顯示「查不到門牌，請自己填」。
   *     接上後端 reverseGeocode 之後才會自動帶地址。 */
  function mockReverseGeocode(p) {
    const doors = [];
    const coords = window.TK_COORDS || {};
    (window.TK_TICKETS || []).forEach((t) => {
      const c = coords[t.id];
      if (!c || !t.street) return;
      doors.push({ lat: c.c[0], lng: c.c[1], addr: (t.county || "") + (t.city || "") + t.street + (t.no || "") });
    });
    (B ? B.readBuildings() : []).forEach((b) => {
      if (typeof b.lat === "number" && b.address) doors.push({ lat: b.lat, lng: b.lng, addr: b.address });
    });
    let best = null;
    doors.forEach((d) => { const m = distM(p, d); if (!best || m < best.m) best = { m, d }; });
    return new Promise((res) => setTimeout(() => {
      if (!best || best.m > MATCH_RADIUS_M) { res({ status: "not_found" }); return; }
      res({ status: "found", fullAddress: best.d.addr, distanceM: Math.round(best.m), addressToken: "mock-" + Date.now() });
    }, 500));
  }

  /** 樓層清單講成人話：「B1、1F～12F、RF（共 14 層）」。不是樓層式的（舊的自訂分區）就照列。 */
  function floorSummary(segs) {
    const isFloor = (x) => /^(B\d+|\d+F|RF)$/i.test(x);
    if (!segs.length) return "";
    if (!segs.every(isFloor)) return segs.slice(0, 4).join("、") + (segs.length > 4 ? "…" : "") + "（共 " + segs.length + " 區）";
    const b = segs.filter((x) => /^B/i.test(x)).sort((x, y) => parseInt(x.slice(1), 10) - parseInt(y.slice(1), 10)), f = segs.filter((x) => /^\d+F$/i.test(x));
    const parts = [];
    if (b.length) parts.push(b.length > 1 ? b[0] + "～" + b[b.length - 1] : b[0]);
    if (f.length) parts.push(f.length > 1 ? f[0] + "～" + f[f.length - 1] : f[0]);
    if (segs.some((x) => /^RF$/i.test(x))) parts.push("RF");
    return parts.join("、") + "（共 " + segs.length + " 層）";
  }

  /* 按鈕上只放「路＋號」：拿掉縣市、鄉鎮、村里、鄰。完整的正式寫法按下去後就在地址欄裡。 */
  function shortDoor(full) {
    return String(full || '').replace(/^.*?[縣市](?=.)/, '').replace(/^.*?[鄉鎮市區](?=.)/, '')
      .replace(/^[^\d路街道巷弄]{1,4}[村里](?=\d+鄰)/, '').replace(/^\d+鄰/, '') || full;   // 村里只在後面接「N鄰」時拿掉（避免「萬里路」被切）
  }

  function BuildingSetupModal({ onClose, startNew }) {
    const tk = useTK();
    const canManage = tk.can && tk.can.activate;
    const version = B ? B.useBridgeVersion() : 0;
    const existing = React.useMemo(() => (B ? B.readBuildings() : []), [version]);
    /* 沒有權限的人永遠只看清單（唯讀），不會進到新增表單。 */
    const [mode, setMode] = React.useState(canManage && (startNew || !existing.length) ? "new" : "list");

    /* 🔒 2026-10-25 Sucre 選「先放大頭針 → 自動帶地址」：照正式前端新增站點的做法
       （station-create-drawer.tsx：地圖點一下 → 反查地址帶入），前端最好接。
       所以欄位順序是 位置 → 地址 → 名稱 → 樓層：**位置是唯一一定要先有的東西**，
       地址是從它長出來的。 */
    const [pin, setPin] = React.useState(null);           // {lat,lng,source}
    const [address, setAddress] = React.useState("");
    const [lookup, setLookup] = React.useState(null);      // null | {status:"loading"} | 後端回傳
    const [name, setName] = React.useState("");
    const [above, setAbove] = React.useState("");
    const [below, setBelow] = React.useState("0");
    const [touched, setTouched] = React.useState(false);
    const reqRef = React.useRef(0);
    /* 地址欄是不是還停在「自動帶入的那一行」。是 → 移大頭針就跟著換；
       人改過 → 不再覆蓋（BM-14），改成在下面提示「改用這個門牌」。 */
    const autoAddrRef = React.useRef("");

    /* 非同步查回來時要讀「當下」的地址欄，不是放大頭針那一刻的。 */
    const addrRef = React.useRef(address); addrRef.current = address;

    const onPin = (p) => {
      setPin(p);
      const id = ++reqRef.current;
      setLookup({ status: "loading" });
      /* BM-11：LocationPicker 只在 click 與 dragend 時回呼，拖曳中不會打 —— 一次放下一次查。 */
      mockReverseGeocode(p).then((r) => {
        if (id !== reqRef.current) return;   // 已經又移過了，丟掉舊結果
        setLookup(r);
        const cur = addrRef.current;
        if (r.status === "found" && (!cur.trim() || cur === autoAddrRef.current)) {
          setAddress(r.fullAddress); autoAddrRef.current = r.fullAddress;
        } else if (r.status !== "found" && cur && cur === autoAddrRef.current) {
          /* 大頭針移到查不到門牌的地方：上一個點自動帶的地址已經不對了，清掉，
             不然畫面會同時寫「查不到」又留著舊門牌。人自己打的不清。 */
          setAddress(""); autoAddrRef.current = "";
        }
      });
    };
    const useFound = () => { setAddress(lookup.fullAddress); autoAddrRef.current = lookup.fullAddress; };

    const nAbove = parseInt(above, 10);
    const nBelow = below.trim() === "" ? 0 : parseInt(below, 10);
    const aboveOk = nAbove >= 1 && nAbove <= MAX_ABOVE;
    const belowOk = nBelow >= 0 && nBelow <= MAX_BELOW;
    const nameLen = [...name.trim()].length;

    const segments = React.useMemo(() => {
      if (!aboveOk || !belowOk) return [];
      const out = [];
      for (let i = nBelow; i >= 1; i--) out.push("B" + i);
      for (let i = 1; i <= nAbove; i++) out.push(i + "F");
      out.push("RF");   // 後端 ADR-310：每棟都有頂樓，不用填（排最後，見 wg-bridge withRoof）
      return out;
    }, [nAbove, nBelow, aboveOk, belowOk]);

    const found = lookup && lookup.status === "found";
    /* BM-12／BM-14：只有「地址欄＝查到的那一行」才算已確認門牌。 */
    const verified = found && address.trim() === lookup.fullAddress;

    const bad = [];
    if (!pin) bad.push("位置");
    if (!address.trim()) bad.push("地址");
    if (!nameLen || nameLen > MAX_NAME) bad.push("名稱");
    if (!aboveOk) bad.push("地上樓層數");
    if (!belowOk) bad.push("地下樓層數");
    const dup = address.trim() && B ? B.buildingForAddress(address) : null;
    /* 地址字面不同、其實是同一棟（「中正路120號」vs「光復車站前」）很常見，
       所以另外用大頭針距離提醒。🚨 30 公尺是我取的。只提醒，不擋。 */
    const NEAR_M = 30;
    const near = React.useMemo(() => {
      if (!pin) return null;
      let best = null;
      existing.forEach((b) => {
        if (typeof b.lat !== "number" || b === dup) return;
        const m = distM(pin, b);
        if (m <= NEAR_M && (!best || m < best.m)) best = { b, m: Math.round(m) };
      });
      return best;
    }, [pin, existing, dup]);

    const submit = () => {
      setTouched(true);
      if (bad.length) return;
      if (dup) { tk.toast("這個地址已經新增過了", "danger"); return; }
      B.createBuilding({ address: address.trim(), alias: name.trim(),
        lat: pin.lat, lng: pin.lng, addressStatus: verified ? "verified" : "unverified",
        floorsAbove: nAbove, floorsBelow: nBelow, unitsPerFloor: 1, segments: segments,
        userId: tk.persona && tk.persona.id });
      tk.toast("已開啟空間：" + name.trim() + "（列表與地圖上看得到）");
      setPin(null); setAddress(""); setLookup(null); setName(""); setAbove(""); setBelow("0");
      autoAddrRef.current = ""; setTouched(false);
      onClose();   // 2026-10-26：建立完直接關掉，空間就在列表與地圖上（BE-036：no list in front of it）
    };

    if (mode === "list") {
      return (
        <TKModal title="已開啟的空間" width={560} onClose={onClose}
          icon={<Icon n="Building2" s={20} c="var(--color-fg-neutral-subtle)" />}
          footer={<>
            <Button variant="ghost" onClick={onClose}>關閉</Button>
            {canManage && <Button variant="primary" startIcon={<Icon n="Plus" s={16} />}
              onClick={() => setMode("new")}>開啟空間</Button>}
          </>}>
          <Alert tone="info" title="這是給「一棟建築要分樓層」的情況用的">
            新增之後，這個地點在前台會多一份<strong>樓層清單</strong>：每一層是一個框，
            裡面堆疊那一層的任務單。<strong>只有新增過的地點才會出現這份清單。</strong>
          </Alert>
          <BuildingSetupList canManage={canManage} />
        </TKModal>
      );
    }

    const LP = window.LocationPicker;
    const statusLine = (() => {
      if (!pin) return null;
      if (lookup && lookup.status === "loading")
        return { icon: "LoaderCircle", c: "var(--color-fg-neutral-muted)", t: "正在找最近的門牌…" };
      if (verified)
        return { icon: "BadgeCheck", c: "var(--color-fg-success)",
          t: "已帶入最近的門牌（距離大頭針 " + lookup.distanceM + " 公尺）。不對的話可以直接改" };
      if (found)
        return { icon: "PenLine", c: "var(--color-fg-neutral-muted)",
          /* 🔄 10-25：「改回查到的」→「用大頭針的地址」（理由見前台 site-actions.jsx A4）。
             後台保留「未確認門牌」—— 那是後台看得到的分類。 */
          t: "跟大頭針的地址不一樣，會存成「未確認門牌」", action: "用大頭針的地址：" + shortDoor(lookup.fullAddress) };
      if (lookup && lookup.status === "not_found")
        return { icon: "Info",
          c: touched && !address.trim() ? "var(--color-fg-danger)" : "var(--color-fg-neutral-muted)",
          t: "這附近 500 公尺內查不到門牌，請自己填地址（仍可建立，會存成「未確認門牌」）" };
      return null;
    })();

    return (
      <TKModal title="開啟空間" width={600} onClose={onClose}
        icon={<Icon n="MapPinPlus" s={20} c="var(--color-fg-neutral-subtle)" />}
        footer={<>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit}>建立</Button>
        </>}>

        <Field label="位置" error={touched && !pin ? "請在地圖上點那棟建築" : undefined}
          hint="先在地圖上點那棟建築，地址會自動帶出來">
          {LP ? <LP value={pin} onChange={onPin} invalid={touched && !pin} height={260}
                  autoLocate={false} pickZoom={17} emptyHint="點那棟建築放大頭針" />
              : <span className="wg-caption">地圖元件沒有載入</span>}
        </Field>

        {near && <Alert tone="warning" title={"附近 " + near.m + " 公尺已經有「" + (near.b.alias || near.b.address) + "」"}>
          是同一棟的話不用再開，到任務管理列表點那個空間改樓層就好。不是的話照常建立。
        </Alert>}

        {/* 查不到門牌時下面那行已經講了「請自己填」，不再重複掛一個「必填」 —— 同一件事講兩次，
            而且兩行顏色不同會被讀成兩個問題。 */}
        <Field label="地址" error={touched && !address.trim() && !(lookup && lookup.status === "not_found") ? "必填" : undefined}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)}
            invalid={touched && !address.trim()}
            placeholder={pin ? "例：花蓮縣光復鄉中正路二段120號" : "放好大頭針後會自動帶入"} />
        </Field>
        {statusLine && (
          <div className="wg-caption" style={{ marginTop: -6, display: "flex", alignItems: "flex-start",
            gap: 6, color: statusLine.c, lineHeight: 1.6, flexWrap: "wrap" }}>
            <Icon n={statusLine.icon} s={14} c={statusLine.c} />
            <span style={{ flex: 1, minWidth: 0 }}>{statusLine.t}</span>
            {statusLine.action && <button type="button" className="tk-chipbtn" onClick={useFound}>
              {statusLine.action}</button>}
          </div>
        )}

        <Field label="名稱"
          error={touched && !nameLen ? "必填" : nameLen > MAX_NAME ? "最多 " + MAX_NAME + " 個字" : undefined}
          hint="側欄與前台會顯示這個名字，例如：宏福苑 A 座、光復國小圖書館">
          <Input value={name} onChange={(e) => setName(e.target.value)}
            invalid={(touched && !nameLen) || nameLen > MAX_NAME} placeholder="中正路社區大樓" />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="地上樓層數" hint="不含頂樓，頂樓會自動加上"
            error={touched && !aboveOk ? "請填 1 到 " + MAX_ABOVE : undefined}>
            <Input value={above} onChange={(e) => setAbove(e.target.value)} inputMode="numeric"
              invalid={touched && !aboveOk} placeholder="12" />
          </Field>
          <Field label="地下樓層數" error={!belowOk ? "請填 0 到 " + MAX_BELOW : undefined}>
            <Input value={below} onChange={(e) => setBelow(e.target.value)} inputMode="numeric"
              invalid={!belowOk} placeholder="0" />
          </Field>
        </div>

        {segments.length > 0 && (
          <Alert tone="info" title={"會產生 " + segments.length + " 個樓層（含頂樓）"}>
            {floorSummary(segments)}
            <br />頂樓 RF 每棟都有：淹水時人會往頂樓跑。
            <br />戶別由通報的人自己填在任務單上（「302」「早餐店」「3樓之1」都可以），後台不用先定義。
          </Alert>
        )}

        {dup && <Alert tone="warning" title="這個地址已經新增過了">
          {(dup.alias || dup.address) + "：" + floorSummary(B.buildingSegments(dup))}
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
        把一棟建築依<strong>樓層</strong>分開（B1、1F…12F），每一層各自堆疊自己的任務單。
        <br /><strong>每棟都會自動加上頂樓 RF</strong>（淹水時人會往頂樓跑），不用另外填。
        <br />（車廂、自訂區域是下一階段。）
      </div>
    );

    if (!rows.length) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hint}
          <span className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)" }}>
            還沒有開啟任何空間。
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
                  {b.address}
                  {{ verified: "　✓ 已確認門牌", pin_mismatch: "　地址與標記不符", unverified: "　未確認" }[b.addressStatus] || ""}
                  {typeof b.lat !== "number" ? "（⚠️ 沒有位置）" : ""}｜{floorSummary(B.buildingSegments(b))}
                </div>
              </div>
              {/* 「編輯分區」2026-10-26 停用：編輯改在任務管理列表點空間 →「編輯」（名稱、地址、樓層數，SpaceEditModal） */}
              {false && canManage && <button className="tk-chipbtn"
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
    /* RF 刪掉也會被 wg-bridge withRoof 補回來（後端 ADR-310 每棟都有頂樓），
       所以不列進「會移除」——不然畫面說會移除，存完它又在，看起來像存檔壞掉。 */
    const removed = B.buildingSegments(b).filter((x) => lines.indexOf(x) === -1 && x !== "RF");

    const genFloors = () => {
      const n = parseInt(window.prompt("地上幾層？", String(b.floorsAbove || 12)), 10);
      const d = parseInt(window.prompt("地下幾層？（沒有就填 0）", String(b.floorsBelow || 0)), 10) || 0;
      if (!(n > 0)) return;
      const out = [];
      for (let i = d; i >= 1; i--) out.push("B" + i);
      for (let i = 1; i <= n; i++) out.push(i + "F");
      out.push("RF");
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
          hint="要與任務單上「樓層」欄填的字一致，對不上的單會落到「未定位」。頂樓 RF 每棟都有，刪掉也會保留">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
            style={{ width: "100%", resize: "vertical", padding: 8,
              borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)",
              font: "var(--font-body-300)", lineHeight: 1.6 }} />
        </Field>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="tk-chipbtn" onClick={genFloors}>用樓層產生</button>
          {/* 車廂：下一階段（2026-10-25 Sucre），按鈕先拿掉。genCars 留著。 */}
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
