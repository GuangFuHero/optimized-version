// station-data.jsx — 資源站點管理的資料層（站點 / 修改建議 / 版本歷史）
//
// 🧹 2026-10-16：**測試站點與測試修改建議已全部移除**，頁面一開是空的。
//    資料入口：後台「新增站點」、「匯入」（CSV）。（前台「建議修改」尚未接進來，見 PROPOSALS 註解）
//    這支檔案現在只放「規則與選項」（狀態、類型、新鮮度門檻…），不放任何紀錄。
//    一筆站點／修改建議的形狀見 Design/後台/docs/資源站點管理.md。
(function () {

  // —— 營運狀態 (operational_status) ——
  // 🔒 三態（2026-09-06 I-1，11-01 回 PR #232／#236 再確認）：開設中／暫停服務／已關閉，跟前台 site-route.js 同一套 key。
  //    對後端 operational_status：open＝active、paused＝temporarily_closed、closed＝permanently_closed。
  //    暫停服務＝今日異常、預期會恢復（缺水、物資空、設備壞），要寫一行原因（I-2，pauseReason）；跟「非開放時段」無關 —— 下班時間狀態仍是開設中。
  //    標籤一律淡底（元件頁標籤表）。full（額滿）不做（不記容量）。
  const STATUS = {
    open:   { label: "開設中",   tone: "success", icon: "CircleCheck" },
    paused: { label: "暫停服務", tone: "warning", icon: "CirclePause" },
    closed: { label: "已關閉",   tone: "neutral", icon: "CircleOff" },
  };
  const STATUS_ORDER = ["open", "paused", "closed"];


  // ── 「資料待確認」註記（比照任務管理頁 TK_PENDING）───────────────────────
  const PENDING = {
    status2: {
      title: "營運狀態：等後端開欄位",
      note: "三態「開設中／暫停服務／已關閉」已定案（2026-09-06，11-01 再確認）。後端 main ERD 已有 operational_status（active／temporarily_closed／permanently_closed），缺的是前端 GraphQL contract 沒暴露。以下是 2026-09-01 舊紀錄（查錯分支，已作廢）：查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。stations 表沒有任何營運狀態欄位（只有 op_hour 開放時間），前端 StationFields 也沒有。另外 RS-FEAT-001 feature.md 的 Target behavior 仍寫 open/paused/closed/full 四態，Spec 尚未同步修改。",
    },
    parent: {
      title: "站點群：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。ERD 的 stations 表有 child_station_uuid（語意正確——註解明寫「this station is a child of the referenced station」，即指向父站——但命名相反，已請更名為 parent_station_uuid）；然而前端 GraphQL 的 StationFields 根本沒有暴露這個欄位，前端目前拿不到父子關係。level 欄位用途仍未回覆。正典 RS-FEAT-001 完全未提及站點群，且 Out of scope 明列排除 Zone drawing。見《資源站點-用語與回報決議-2026-08-21》。",
    },
    photos: {
      title: "站點照片：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。photos 表的 ref_type 仍只有 ticket / pole，站點無法掛照片；前端 contract 也只有 Ticket 有照片。2026-08-05 記錄「已請工程師修改」，至今兩份文件皆未反映。RS-FEAT-001 亦未提及站點照片。",
    },
    rbacAuditor: {
      title: "Data Auditor 權限與 Notion 不一致",
      note: "本頁讓 Data Auditor 可審核、合併、匯出（2026-08-07 Owner 決定）。Notion BE-RBAC-3 明寫 data_auditor『has zero write access to any endpoint — any non-GET request returns 403』，且 Verify / Reject resource spot 兩列皆為 ❌。此為刻意偏離，需與後端確認。",
    },
    importSpec: {
      title: "匯入欄位與驗證規則未定",
      note: "Notion 的權限矩陣有「Import CSV/Excel」這一列（super/ngo/gov ✅、auditor ❌），排期見「補齊功能 - resource station&ticket 資料匯入匯出」（2026-08-02~08-14），但該卡內容為空。CSV 欄位名稱、必填規則、重複判定標準都尚未有正典規格，目前為提案版本。「匯入後預設為關」則依 2026-08-06 決策。",
    },
    rbacTeam: {
      title: "指派團隊：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。stations 表沒有任何指派團隊的欄位，前端 StationFields 也沒有——站點無從指派給團隊，此處的 assignedTeam 純為前端示意。另 Notion BE-RBAC-3 的 team_role 只涵蓋團隊成員管理，對資源站點沒有任何權限定義；CLAUDE.md 記載管轄權以地理判定（work_zones + team_zone_assign, ADR-049），與此處的直接指派不同。",
    },
    phone: {
      title: "聯絡人與電話：等後端開欄位",
      note: "查證日期 2026-09-01：ERD（docs/prd，仍為 2026-06-27 版）與前端 GraphQL contract（main 分支 Frontend/docs/database-schema.md）皆已重抓確認。stations 表沒有聯絡人與電話欄位，前端 StationFields 也沒有。此為本地決策新增（S-04 情境逼出、亦為法定通報欄位），規則是僅後台可見、公開 API 不得回傳——此揭露規則需後端一併實作，不能只靠前端不畫。RS-FEAT-001 未提及此欄位。",
    },
  };

  // —— 站點類型 (station_type) ——
  const TYPE = {
    shelter:  { label: "避難收容", icon: "Home",    tone: "secondary" },
    supply:   { label: "物資集散", icon: "Package", tone: "primary" },
    medical:  { label: "醫療站",   icon: "Cross",   tone: "danger" },
    water:    { label: "供水點",   icon: "Droplets", tone: "info" },
    charging: { label: "充電/通訊", icon: "BatteryCharging", tone: "warning" },
    other:    { label: "其他",     icon: "MapPin",  tone: "neutral" },
    // 站點群不是真的站點類型，是前端呈現層用的容器標記（2026-08-21 決議）。
    // 刻意不放進 TYPE_ORDER：類型篩選器不列它，篩特定類型時站點群會被篩掉，
    // 群內站點升為頂層並標「屬：○○」——此行為已於 2026-08-21 確認保留。
    group:    { label: "站點群",   icon: "Layers",  tone: "info" },
  };
  const TYPE_ORDER = ["shelter", "supply", "medical", "water", "charging", "other"];

  // —— 資料新鮮度門檻（分鐘）——
  // 站點的「久未更新」是資料新鮮度問題，不是危險程度，
  // 所以刻意不用 danger 色，最高只到 warning（amber）。
  // 任務單的紅色語意是「有人可能還被困著」，兩者不共用色階。
  const FRESHNESS = { staleMin: 24 * 60, expiredMin: 72 * 60 };

  // —— 可指派的 Team ——
  // ⚠️ 站點指派給 Team 沒有正典依據，見 PENDING.rbacTeam
  // 這份名單是佔位（本頁沒有載入成員管理的 MM_TEAMS）。正式版讀 teams 表、只列啟用中的隊。
  const TEAMS = ["壯闊台灣", "慈濟基金會", "鳳林救難協會", "花蓮縣消防局"];

  // —— 行政區 (admin_area) ——
  const AREAS = ["光復鄉", "鳳林鎮", "瑞穗鄉", "萬榮鄉", "花蓮市"];

  // supply level chips
  const LEVEL = { full: { label: "充足", tone: "success" }, low: { label: "偏低", tone: "warning" }, out: { label: "缺貨", tone: "danger" } };

  // —— 站點清單 ——
  // 🧹 空陣列。正式版換成 GraphQL `stations` 查詢結果（StationFields）。
  // 站點群（type: "group"）與子站（parentId）是本地決策，見 PENDING.parent。
  const STATIONS = [];

  // —— 修改建議 (StationEditSuggestion) ——
  // currentVersion = 站點現行版本；base_version < currentVersion 且同欄位被改 → 衝突
  // 🧹 空陣列。
  // ⚠️ 原型尚未接上前台：前台「建議修改」寫進 wg-bridge.js 的 stationReports，但本頁沒有讀它，
  //    所以審查佇列在原型裡永遠是空的。正式版讀後端的修改建議表（目前不存在，見文件「待後端」）。
  const PROPOSALS = [];

  // ── 可選欄位定義 ────────────────────────────────────────────────────────
  // required 的欄位不可隱藏（沒有站名就無法辨識是哪一站）
  window.STATION_COLUMNS = [
    { key: "station", label: "站點",       width: "minmax(240px,2.2fr)", required: true },
    { key: "type",    label: "類型",       width: "120px" },
    { key: "area",    label: "行政區",     width: "110px" },
    { key: "status",  label: "營運狀態",   width: "150px" },
    { key: "team",    label: "指派 Team",  width: "138px" },
    { key: "updated", label: "最後更新",   width: "130px" },
  ];
  // 2026-08-16：欄位不可自訂 —— 順序與顯示欄位一律依上方定義，不再提供設定介面，
  // 也不再讀寫 localStorage（舊的 station.colOrder / station.colHidden 一併清掉）。
  try {
    localStorage.removeItem("station.colOrder");
    localStorage.removeItem("station.colHidden");
  } catch (e) { /* 無痕模式讀不到就算了 */ }

  window.StationData = { STATUS, STATUS_ORDER, TYPE, TYPE_ORDER, AREAS, TEAMS, FRESHNESS, LEVEL, STATIONS, PROPOSALS, PENDING };
})();
