// nav.js — 三個後台頁面共用的側邊欄導覽與跨頁路由
(function () {
  // 核心模組（各頁順序一致）
  window.WG_NAV_CORE = [
    ["dashboard", "總覽儀表板", "LayoutDashboard"],
    ["map", "互助地圖", "MapPin"],
    ["ticket", "任務管理", "ClipboardList"],
    ["station", "資源站點管理", "Package"],
    ["announce", "緊急公告", "Megaphone"],
    // 2026-09-06：志工行前資訊（VB-FEAT-001，表 23／24）。獨立的內容管理模組，
    // 與其他元件依賴很弱 —— 排在核心模組最後，因為它是**出發前**看的東西，
    // 不是應變當下每天都要開的頁。
    ["brief", "志工行前資訊", "BookOpen"],
  ];
  window.WG_NAV = [
    ...window.WG_NAV_CORE,
    ["__sep__", "協作與權限"],
    ["teams", "團隊", "Building2"],
    ["members", "成員與權限", "UserCog"],
    ["audit", "資料檢核", "ShieldCheck"],
  ];

  // ── 依「目前身份」收斂導覽（三頁共用）──────────────────────────────────
  // 2026-08-15 Sucre：側邊欄要四頁同步。
  // ⚠️ 先前不同步的真正原因不是排列，是**過濾規則只寫在成員管理頁**：
  //    任務管理／資源站點固定吃整份 WG_NAV（任何角色都看得到「成員與權限」），
  //    成員管理卻會把非 Super Admin 的「成員與權限」濾掉 —— 同一個人在兩頁看到
  //    的選單就不一樣。規則搬到這裡，三頁一起吃。
  //
  // 🔄 2026-08-17 D-2 / D-3：**改讀「目前身份」，不再讀 persona.rbac。**
  //    舊版讀 persona.rbac（掛在「人」身上，切換團隊時不變），所以一個人只要有
  //    auditor 角色，不管切到哪個身份都看得到資料檢核頁 —— 那正是 Carol 8/14 說的
  //    「現在這樣重疊感覺很容易出問題」。
  //    現在讀 wgActingPlatformRole()：切著超級管理員才看得到「成員與權限」，
  //    切著資料檢核員才看得到「資料檢核」，切到某隊成員時這兩項整個不 render。
  //
  // 🔒 乾淨切（D-3）：導覽項**不 render**，不是灰掉。
  //    理由（Sucre 8/17）：「像切換帳號」—— 切到另一個帳號時，前一個帳號的東西
  //    不會留一排灰色按鈕。留著等於在暗示「你其實有權限，只是現在不給你按」，
  //    那正是 Carol 想消滅的曖昧。找不到功能的補償在切換器每一列的副標。
  //
  // 「團隊」所有身份都看得到，點進去的內容才依身份不同（超級管理員可編輯全清單／
  //   NGO 與政府是唯讀全清單＋自己那隊可管理）—— 不用導覽名稱去暗示權限。
  //
  // ⚠️ 「資料檢核」這一項是我加的（PRD 沒有列，原型也沒有這一頁）。加它的理由是
  //    Carol 的原始需求整句就是在講這一頁，沒有它就示範不出乾淨切的效果。
  //    目前指向佔位頁。
  window.wgNavFor = function (persona) {
    const role = window.wgActingPlatformRole
      ? window.wgActingPlatformRole(persona)
      : (persona && persona.rbac);
    const isSuper = role === "super";
    const isAuditor = role === "auditor";
    return window.WG_NAV.filter(([id]) => {
      // 2026-08-29 裁示 D-3：前後台公告都只有超級管理員與政府能發，沒有 Team 層級。
      // 🚨 覆蓋正典 EA-FEAT-001 AC-06 與 PRD 權限表（原本 Team Admin 可發自家 Team
      //    的後台公告），需 Owner 簽署決議記錄。
      //    見 features/EA-FEAT-001-emergency-announcements/feature.md。
      // 乾淨切（2026-08-17 D-3）：不 render，不是灰掉（EA-AB-114）。
      // ⚠️ 藏起來的只有「發布」這一頁 —— 所有後台身份仍看得到後台公告的橫幅本身
      //    （EA-AB-115），那由 wg-shell.jsx 掛的 WGAnnounceBanner 負責。
      if (id === "announce") return isSuper || role === "gov";
      // 🔒 裁示（Sucre 2026-09-06）：**超級管理員／政府**，與緊急公告同一組。
      //    表 23 只寫「後臺管理者」、適用範圍寫「協調者或管理員」，而「協調者」
      //    對不到平台上任何既有角色 —— 這個洞是原文留下的，由本次裁示補上。
      //    理由：行前資訊同樣是對全體志工的單向對外發言，寫錯會有人帶錯裝備、走錯路線。
      //    ⚠️ 連帶條件：正因為只有一組人維護，「一種災害＝一份內容」這個模型才成立。
      //    日後若要開放各隊自己維護，**資料模型要一起改**（主鍵多一個 team），
      //    否則兩隊會互相覆蓋。見 feature.md。
      if (id === "brief") return isSuper || role === "gov";
      if (id === "members") return isSuper;
      if (id === "audit") return isSuper || isAuditor;
      // Notion PRD v5.2 §3 A1：「Data Auditor 不顯示此頁」。乾淨切之後這條終於成立 ——
      // 舊版讀 persona.rbac，所以張育成加入某隊之後不管切到哪都看得到團隊頁。
      if (id === "teams") return !isAuditor;
      return true;
    });
  };

  // 各導覽項的實際落點；未獨立成頁者回成員管理頁以佔位呈現
  // 交付版：總覽儀表板／互助地圖／任務管理不在本次交付，點下去落到成員管理的「建置中」佔位頁。
  const PAGES = {
    // 2026-08-27：互助地圖獨立成頁（MAP-FEAT-002 責任區與危險區）。
    // 在此之前 WG_NAV_CORE 有 "map" 這一項但 PAGES 沒有，所以點下去會落到
    // 成員管理的佔位頁 —— 加這一行，四頁一起生效（見本檔 wgNavigate 的註解）。
    station: "資源站點管理 Resource Station v2.html",
    // 2026-08-29：緊急公告獨立成頁（EA-FEAT-001 全站橫幅）。
    // 在此之前 WG_NAV_CORE 有 "announce" 但 PAGES 沒有，點下去會落到成員管理的
    // 佔位頁 —— 與 2026-08-27 的 map 同一個狀況。
    announce: "緊急公告 Emergency Announcements.html",
    brief: "志工行前資訊 Volunteer Briefing.html",
  };
  const MEMBER_PAGE = "成員管理 Member Management.html";

  // 自己就有頁面的導覽項不必再跨頁（成員管理頁把它們當內頁 view 處理）
  const IN_PAGE = { members: ["teams", "members", "audit", "settings"] };

  // 回傳 true 表示已離開本頁；false 表示由本頁自行處理
  //
  // ⚠️ 2026-08-27：頁面**不要自己列白名單**。
  //    成員管理頁原本寫死 `if (id === "ticket" || id === "station")` 才跨頁，
  //    所以新增總覽儀表板時，任務管理／資源站點兩頁自動就通了，只有成員管理
  //    點不動 —— 那正是「明明模組化了卻還要一頁一頁改」的來源。
  //    現在哪些 id 留在本頁由這裡的 IN_PAGE 決定，頁面只要照回傳值走：
  //      onNavigate={(id) => { if (window.wgNavigate(id, "members")) return; setView(id); }}
  //    以後多一頁，只要在 PAGES 加一行，四頁一起生效。
  //
  // ⚠️ 2026-09-14：`current` 是**頁面 id**，不是目前的內頁 view id。
  //    成員管理頁把 teams／members／audit／settings 當內頁 view 處理，但 mm-app.jsx
  //    傳進來的 current 永遠是寫死的 "members" —— 於是「成員與權限」這一項的 id
  //    剛好跟頁面 id 同名，撞上舊版第一行的 `id === current`：在團隊 view 點它會被
  //    當成「原地不動」回傳 true，mm-app 直接 return，setView("members") 從來沒跑，
  //    看起來就是點了沒反應。反向（在成員 view 點「團隊」）因為 id 不同名所以是通的，
  //    所以只有這一顆按鈕死掉，很容易誤判成「側欄還沒模組化」。
  //    ✅ 修法：IN_PAGE 的判斷提到 `id === current` 之前 —— 先問「這個 id 是不是
  //       本頁自己的內頁 view」，是就交給本頁，包含回到本頁預設 view 的情況。
  //    順序不能再動：站點／任務等沒有內頁 view 的頁面靠 `id === current` 擋住點自己
  //    造成的重新載入，那一行必須留在 PAGES 之前。
  window.wgNavigate = function (id, current) {
    if ((IN_PAGE[current] || []).indexOf(id) >= 0) return false;   // 本頁自己處理（含本頁同名 id）
    if (id === current) return true;
    if (PAGES[id]) { window.location.href = PAGES[id]; return true; }
    window.location.href = MEMBER_PAGE + "#view=" + encodeURIComponent(id);
    return true;
  };
})();
