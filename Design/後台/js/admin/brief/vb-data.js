// vb-data.js — 志工行前資訊的共用資料層（VB-FEAT-001）
//
// 後台編輯頁與前台閱覽頁**載入同一支**，所以「草稿／發布」這條界線只有一個實作。
// 前台永遠只讀 published，讀不到 draft —— 這是表 23「確保前臺顯示的永遠是已審閱過
// 的版本」唯一的技術保證，不要在前台加任何讀 draft 的路徑。
//
// ══════════════════════════════════════════════════════════════════════════
// 🔒 資料模型（2026-09-14 裁示，**推翻 09-06／09-07 的三實體模型**）
//
//    **一個部署只有「一份」行前資訊。災害類型只是建立時的起始內容（範本）。**
//
//    Sucre：「志工行前資訊應該是要點開問他要不要新增，新增的時候有幾個範本
//            可以預覽跟選擇。因為通常一個專案就是一個災害，所以不太會發佈
//            不同災害的範本。」
//
//    演進過程（三版，每一版都在收斂，不要走回頭路）：
//      09-06  三個災害類型各自維護、各自決定發不發布 → 前台有頁籤可切
//      09-07  前台只顯示一份，發布即取代            → 後台仍是三個並存的實體
//      09-14  **後台也只有一份。** 三個範本降級成唯讀的起始內容
//
//    這一版順手解掉兩件事：
//      · 「混合型災害要發哪一份」（09-07 留的 Q7）—— 範本只是起點，選完隨你改
//      · 「一次只有一份」不用再靠取代邏輯維持 —— 本來就只有一份
//
//    🔒 裁示同時定了三件事：
//      · 建立後**不保留**「這份是從哪個範本來的」。範本只是起點，選完就脫鉤
//      · **不做「改套另一個範本」**。要換就自己改內容 —— 不為例外情況做會誤觸的入口
//      · 新增時除了三個範本，**要有「空白開始」**，排在範本後面
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 後端現況（2026-09-06 實查 main 分支，非轉述）
//
//   er-diagram.md 與 vendored schema.graphql 全檔 grep
//   volunteer / briefing / draft / publish / rich_text / cms —— **兩邊都是零筆**。
//   → 全新功能，沒有任何既有的表可以接。
//
//   ✅ 一份的模型讓後端簡單很多：不需要 disaster_type 欄位，也不需要
//      「同時只能一份對外」的唯一性約束（09-07 那版要的 B-11 可以取消）。
//      需要的是**一張單列表**（比照 project_settings 的 singleton 做法）＋ 一張版本表。
//   ⚠️ 範本是**程式內建的唯讀常數**，不進資料庫 —— 它不會被使用者改，
//      也不需要跨部署同步。要讓 PM 能改範本才需要開表，那是另一個需求。
(function () {
  const KEY = "wg.briefing.v5";   // v5：整份一塊內容（2026-09-20 裁示，推翻四段模型）
  // ⚠️ v4 的舊資料**不轉換**。它是四個欄位，新模型是一個字串，轉換要自己決定
  //    段落順序與標題文字 —— 原型的資料是示範資料，不值得為它寫遷移。
  //    🔴 正式環境若已經有人寫過內容，這件事就不成立（見待裁示清單 B-4）。
  const EVT = "wg:briefing";

  // ── 🔒 2026-09-20 裁示：整份只有「一塊」內容 ──────────────────────────
  //
  //    Sucre：「沒有分四段就是一段而已。」（後端只給一個欄位）
  //
  //    四段（如何參與／交通資訊／建議攜帶裝備／行前注意事項）**降級成範本裡的
  //    `<h2>` 小標** —— 與 09-14 把災害類型降級成範本是同一個手法：
  //    結構還在，只是不再由系統保證，後台可以改字、可以刪、可以自己加第五段。
  //
  //    🔄 這推翻了 09-06 第 8 題（四段固定、後台不可增減）。
  //    連帶作廢：`VB-BR-102`（四段固定順序）、`VB-BR-105`（空段落整段不出現 ——
  //    沒寫就沒有那個 `<h2>`，不需要規則）。
  //
  //    ⚠️ 09-06 訂四段的理由（照光復超人實際用過那一頁：第一個問題不是「帶什麼」
  //       而是「我要怎麼參與」）**沒有消失**，它現在活在範本的標題順序裡。
  //       改範本之前先讀 feature.md 那一節。
  //
  //  📌 撰寫範本時仍然分段寫（`parts`），只是**存進資料庫的是接起來的那一塊**。
  //     分開寫純粹是為了原始碼好讀，不是資料模型。
  const TEMPLATE_HEADS = [
    ["join",      "如何參與"],
    ["transport", "交通資訊"],
    ["gear",      "建議攜帶裝備"],
    ["notes",     "行前注意事項"],
  ];

  const emptyContent = () => "";
  window.vbEmptyContent = emptyContent;

  // ══════════════════════════════════════════════════════════════════════
  // 富文字的清洗（前台與後台預覽都會經過這裡）
  //
  // 內容是後台人員自己打的，威脅模型不高，但**發布出去的是公開頁面**，
  // 而且正式版一定會有匯入既有文件的需求 —— 那時來源就不再可信了。
  // 白名單放在資料層而不是畫面層，是為了讓「前台看到什麼」只有一個決定點。
  //
  // 🔴 圖片：後端 photos.ref_type 只有 geometry / pole（2026-08-06 改名那次），
  //    **沒有給內容管理用的圖床**。原型允許 data: URI 只是原型 ——
  //    base64 會把內容表撐爆且無法 CDN 快取。**這一項要寫進工程需求。**
  // ══════════════════════════════════════════════════════════════════════
  const ALLOWED = {
    P: [], BR: [], DIV: [], SPAN: [],
    // H2 ＝ 09-20 之後的「段落標題」（Markdown 的 `##`）；H3 是段內小標（`###`）。
    H2: [], H3: [], H4: [], STRONG: [], B: [], EM: [], I: [], U: [],
    UL: [], OL: [],
    // 🔒 2026-09-20 裁示：可勾的項目由**作者標記**，不再由「是不是裝備段」推導。
    //    `data-check` 就是那個標記 —— 它是一個**沒有值的旗標**，不帶勾選狀態。
    // 🔴 **不可以讓它帶值**（例如 data-check="1"）。Markdown 版的 `- [ ]` / `- [x]`
    //    會把「已勾」寫進內容，後台在預覽裡勾一勾就會變成志工打開時已經勾好的清單
    //    —— 那正是 VB-BR-198 要防的事。旗標無值，這個坑就不存在。
    LI: ["data-check"], BLOCKQUOTE: [], HR: [],
    A: ["href", "title"], IMG: ["src", "alt"],
  };
  const SAFE_HREF = /^(https?:|mailto:|tel:|#)/i;
  const SAFE_SRC = /^(https?:|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,)/i;

  window.vbSanitize = function (html) {
    const box = document.createElement("div");
    box.innerHTML = String(html || "");
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        const tag = n.tagName.toUpperCase();
        if (!ALLOWED[tag]) {
          while (n.firstChild) node.insertBefore(n.firstChild, n);
          n.remove();
          return;
        }
        [...n.attributes].forEach((a) => {
          if (!ALLOWED[tag].includes(a.name.toLowerCase())) n.removeAttribute(a.name);
        });
        if (tag === "A") {
          if (!SAFE_HREF.test(n.getAttribute("href") || "")) n.removeAttribute("href");
          n.setAttribute("target", "_blank");
          n.setAttribute("rel", "noopener noreferrer");
        }
        // 🔴 `data-check` 一律**清成無值**。它是旗標不是狀態 ——
        //    留著值就給了「把已勾寫進內容」的空間（Markdown 的 `- [x]` 就是這個坑）。
        if (tag === "LI" && n.hasAttribute("data-check")) n.setAttribute("data-check", "");
        if (tag === "IMG" && !SAFE_SRC.test(n.getAttribute("src") || "")) { n.remove(); return; }
        walk(n);
      });
    };
    walk(box);
    return box.innerHTML;
  };

  /** 有沒有真的寫東西 —— 空的 <p><br></p> 不算。 */
  window.vbIsEmpty = function (html) {
    const box = document.createElement("div");
    box.innerHTML = String(html || "");
    if (box.querySelector("img, hr")) return false;
    return !(box.textContent || "").replace(/ /g, " ").trim();
  };

  window.vbWordCount = function (content) {
    const box = document.createElement("div");
    box.innerHTML = String(content || "");
    return [...(box.textContent || "").replace(/\s+/g, "")].length;
  };

  // 整份是不是空的。只有一塊內容之後它就是 vbIsEmpty 本人，留著別名是為了呼叫端好讀。
  window.vbAllEmpty = function (content) { return window.vbIsEmpty(content); };

  // ══════════════════════════════════════════════════════════════════════
  // 範本庫（唯讀）
  //
  // 🔒 這三份是**建立時的起始內容**，不是三個可以並存發布的實體（2026-09-14 裁示）。
  //    選了之後就脫鉤 —— 系統不記得「這份是從水災來的」，也不提供「改套另一個範本」。
  //
  // 📌 **內容取材自光復超人去年實際使用的行前準備頁**
  //    （gf250923.org/volunteer/preparation，2026-09-06 讀取）。
  //    用真實內容當範本的理由：假內容看不出「一段到底要寫多長」，
  //    而那正是後台人員第一次打開這一頁時最需要的參考。
  //
  // ⚠️ 但範本裡的**具體地點與時間都是示意**（接駁班距、管制路段、報到點）——
  //    使用者選了範本之後**必須逐段改成本次災害的實況**才能發布。
  //    介面上要講這句話，不然會有人直接發出去。
  // ══════════════════════════════════════════════════════════════════════
  window.VB_TEMPLATES = [
    {
      key: "flood", label: "水災", icon: "CloudRain",
      desc: "淹水、退水後清淤",
      forWhat: "積水退去後的清淤與家戶復原，人力需求大、裝備以清淤工具為主。",
      parts: {
        join:
          '<p>災區人力需求每天不同，<strong>出發前先確認今天還缺不缺人</strong>，不要直接前往。</p>' +
          '<ol><li>在本平台的地圖或列表找一筆需求，按「接任務」</li>' +
          '<li>抵達後<strong>一律先到報到處</strong>，不要直接進災戶</li>' +
          '<li>報到後由各隊帶隊，請跟著自己的隊伍行動</li>' +
          '<li>身體不適請及早到醫療站，不要撐</li>' +
          '<li>離開前把髒污衣物袋裝丟棄，不要帶回住處</li></ol>' +
          '<p>現場聯絡窗口：（請填入報到處與服務時間）</p>',
        transport:
          '<p>（請填入大眾運輸方式與接駁資訊，例：台鐵○○站下車，站前有接駁點，班距約 20 分鐘。）</p>' +
          '<ul><li>自行開車：（請填入路線與<strong>目前的交通管制範圍</strong>、停車地點）</li>' +
          '<li><strong>出發前就先訂好回程車票。</strong>末班接駁時間請填入 —— 錯過在當地叫不到車。</li></ul>',
        // 📌 寫法示範：一項一行，補充說明用 <br> 接在後面，
        //    「較佳 —」寫建議、「避免 —」寫地雷。這個格式取自光復超人那一頁 ——
        //    標了 `data-check` 的 <li> 在前台會變成一個可勾的框，所以**一個 li 就是一個
        //    要打包的東西**，不要把三樣東西寫在同一行（那樣只能一次勾掉三樣）。
        // 🔒 2026-09-20 起，可勾與否由**作者標記**（編輯器工具列的「可勾項目」），
        //    不再由「這一段是不是裝備段」推導。範本的裝備段預設全部標好。
        gear:
          '<h3>衣物與防護</h3><ul>' +
          '<li data-check>長袖、長褲<br>較佳 — 快乾透氣材質（聚酯纖維、運動布料）、深色耐髒<br>避免 — 牛仔褲、厚棉衣物、白色淺色衣物</li>' +
          '<li data-check>厚襪子<br>避免雨鞋磨破腳</li>' +
          '<li data-check>帽子</li>' +
          '<li data-check>口罩<br>較佳 — 外科手術口罩，退水後揚塵嚴重</li>' +
          '<li data-check>防蚊液<br>較佳 — 可防小黑蚊、含派卡瑞丁成分者</li>' +
          '<li data-check>乾淨的替換衣物與鞋子<br>回程換用，裝防水袋</li></ul>' +
          '<h3>鞋具與手部</h3><ul>' +
          '<li data-check>長筒雨鞋<br>較佳 — 綁帶款，無綁帶者建議高度過小腿<br>泥可能深及膝，避免被吸住或進水</li>' +
          '<li data-check>鐵鞋墊<br>防踩到釘子與碎玻璃</li>' +
          '<li data-check>防滑手套、輪胎手套</li>' +
          '<li data-check>乳膠手套<br>戴在裡層，隔絕污水</li></ul>' +
          '<h3>醫療與藥品</h3><ul>' +
          '<li data-check>個人常用藥</li><li data-check>酒精（消毒用）</li><li data-check>簡易急救包</li></ul>' +
          '<h3>食物與補給</h3><ul>' +
          '<li data-check>飲用水<br>2 公升以上，現場的水不一定能喝</li>' +
          '<li data-check>簡易乾糧、零食</li>' +
          '<li data-check>鹽糖或電解質補給品</li>' +
          '<li data-check>環保餐具</li></ul>' +
          '<h3>清淤工具</h3><ul>' +
          '<li data-check>方鏟</li><li data-check>耙子</li><li data-check>鐵畚箕、小水桶</li>' +
          '<li data-check>大塑膠袋、垃圾袋</li></ul>' +
          '<h3>其他</h3><ul>' +
          '<li data-check>行動電源與充電線</li><li data-check>頭燈<br>天黑得比想像快</li>' +
          '<li data-check>透明防水袋、夾鏈袋</li><li data-check>記得剪指甲</li></ul>',
        notes:
          '<ul><li><strong>安全第一：</strong>（請填入本次災害的特有風險，例：上游堰塞湖潰堤警報）</li>' +
          '<li><strong>結伴同行：</strong>不要單獨行動，尤其進入結構受損的建物。</li>' +
          '<li><strong>保持聯繫：</strong>手機保持電量，與隊伍約好集合時間與地點。</li>' +
          '<li><strong>飲水：</strong>消防車運送的民生用水<strong>僅供清潔，不可飲用</strong>。</li>' +
          '<li><strong>身心調適：</strong>現場景象與體力消耗都超乎預期，量力而為，累了就休息。</li>' +
          '<li><strong>保險：</strong>請於報到時確認，未投保者不得進入結構受損建物。</li></ul>',
      },
    },
    {
      key: "earthquake", label: "地震", icon: "Activity",
      desc: "建物受損、餘震",
      forWhat: "建物結構受損與餘震風險，志工活動範圍受限，安全規範比裝備更關鍵。",
      parts: {
        join:
          '<p>地震後現場由專業搜救與結構技師主導，<strong>一般志工的任務範圍會被嚴格限定</strong>。</p>' +
          '<ol><li>在本平台找一筆需求並承接，不要自行到現場找事做</li>' +
          '<li>抵達後先報到，領取識別並確認今日可進入的區域</li>' +
          '<li><strong>只在被指定的區域內活動</strong></li>' +
          '<li>聽到餘震警報立即依指示疏散到空曠處</li></ol>' +
          '<p>現場聯絡窗口：（請填入）</p>',
        transport:
          '<p>（請填入交通方式。）主要道路搶通狀況每日更新，<strong>請於出發前重新確認本頁</strong>。</p>' +
          '<ul><li>橋樑與高架可能封閉，請確認替代道路</li>' +
          '<li>停車請遠離受損建物與外牆</li></ul>',
        gear:
          '<h3>防護</h3><ul>' +
          '<li data-check><strong>安全帽</strong><br>必備。落物是地震後最常見的二次傷害</li>' +
          '<li data-check>防割手套</li><li data-check>硬底鞋或工作靴<br>避免 — 布鞋、涼鞋</li>' +
          '<li data-check>防塵口罩<br>粉塵比水災更細</li><li data-check>護目鏡</li></ul>' +
          '<h3>照明與通訊</h3><ul>' +
          '<li data-check>頭燈<br>停電機率高，要空出雙手</li><li data-check>行動電源</li>' +
          '<li data-check>哨子<br>受困時比喊叫省力</li></ul>' +
          '<h3>補給</h3><ul><li data-check>飲用水</li><li data-check>乾糧</li><li data-check>個人常用藥</li></ul>',
        notes:
          '<ul><li><strong>餘震：</strong>仍會發生。聽到警報立即離開建物，往空曠處。</li>' +
          '<li><strong>紅單建物：</strong><strong>任何人不得單獨進入</strong>，未經允許不得進入。</li>' +
          '<li><strong>不要移動任何看似在支撐重量的構件</strong>與看似不穩的瓦礫。</li>' +
          '<li><strong>結伴同行：</strong>兩人以上，保持視線可及。</li>' +
          '<li><strong>保險：</strong>請於報到時確認。</li></ul>',
      },
    },
    {
      key: "windstorm", label: "風災", icon: "Wind",
      desc: "強風豪雨、風後復原",
      forWhat: "警報期間不開放進場，內容以「先不要來」與解除後的復原工作為主。",
      parts: {
        join:
          '<p><strong>警報期間不開放志工進場。</strong>解除後會在本頁公告集結點與報到方式，' +
          '請不要自行前往。</p>' +
          '<ol><li>先在本平台確認是否已開放</li>' +
          '<li>開放後找一筆需求承接</li>' +
          '<li>依公告的集結點報到</li></ol>',
        transport:
          '<p>陸上警報發布期間，鐵路與公路可能隨時封閉。' +
          '<strong>警報解除前不要出發</strong>，解除後本段會更新為實際的交通方式。</p>',
        gear:
          '<ul><li data-check>雨衣<br>較佳 — 兩件式<br>避免 — 雨傘，強風下沒有用還會受傷</li>' +
          '<li data-check>防水手機袋</li><li data-check>行動電源</li>' +
          '<li data-check>頭燈<br>停電機率高</li>' +
          '<li data-check>防滑手套<br>清理斷枝與招牌</li><li data-check>長筒雨鞋</li></ul>',
        notes:
          '<p>陸上警報發布期間請勿自行前往災區 —— 這會佔用救災動線，' +
          '而且你可能變成需要被救援的人。</p>' +
          '<ul><li><strong>斷落電線一律視為有電</strong>，不要靠近、不要移動。</li>' +
          '<li>清理招牌與斷枝時注意頭頂，戴安全帽。</li>' +
          '<li>積水路段不要涉水，看不出深度與孔蓋位置。</li></ul>',
      },
    },
  ];
  // 把分開寫的四塊接成**一份內容**：每一塊前面加一個 <h2>。
  // 🔒 這是範本唯一的結構來源 —— 建立之後那些 <h2> 就只是普通文字，改它不會怎樣。
  window.VB_TEMPLATES.forEach((t) => {
    t.content = TEMPLATE_HEADS
      .map(([k, label]) => "<h2>" + label + "</h2>" + (t.parts[k] || ""))
      .join("");
  });
  window.VB_TEMPLATE_MAP = Object.fromEntries(window.VB_TEMPLATES.map((t) => [t.key, t]));

  /** 範本的完整內容（字串複製，呼叫端改它不會污染範本本身）。
   *  key 為 null／未知 → 空白開始（裁示：空白要有，排在範本後面）。 */
  window.vbTemplateContent = function (key) {
    const t = window.VB_TEMPLATE_MAP[key];
    return t ? String(t.content) : emptyContent();
  };

  // ══════════════════════════════════════════════════════════════════════
  // 那「一份」行前資訊
  //
  //   null            = 還沒建立（後台顯示空狀態，問要不要新增）
  //   { draft, published, versions, events }
  //
  // 🔒 沒有 `type` 欄位。建立後不記得是從哪個範本來的（2026-09-14 裁示）——
  //    內容改到面目全非之後，那個標籤只會誤導，而沒有人會記得回頭改它。
  // ══════════════════════════════════════════════════════════════════════
  function normalize(rec) {
    if (!rec) return null;
    const fill = (c) => (typeof c === "string" ? c : "");
    return {
      published: rec.published ? { ...rec.published, content: fill(rec.published.content) } : null,
      draft: rec.draft ? { ...rec.draft, content: fill(rec.draft.content) } : null,
      versions: (Array.isArray(rec.versions) ? rec.versions : []).map((v) => ({ ...v, content: fill(v.content) })),
      events: Array.isArray(rec.events) ? rec.events : [],
    };
  }

  // ── 種子 ────────────────────────────────────────────────────────────────
  //
  // ⚠️ 原型的預設狀態是**已經建立好一份、正在對外**，而不是空的 ——
  //    因為「已經有內容時長什麼樣」是比較常看到的畫面。
  //    要看「還沒建立」的流程（新增 → 選範本 → 預覽），
  //    在瀏覽器 console 執行 `localStorage.removeItem('wg.briefing.v5')` 再重整。
  //    後台介面上也有一個「重設原型資料」的入口做同一件事。
  function seed() {
    const now = Date.now();
    const ev = (at, actor, kind, note) => ({ at, actor, kind, note: note || "" });
    // 從水災範本起頭，再改成光復的實況 —— 這正是使用者會走的路徑
    // 內容是一塊字串，所以每一版就是在上一版身上做字串替換 ——
    // 這正是使用者實際會做的事（改一句管制路線、改一次報到時間）。
    const v1 = window.vbTemplateContent("flood");
    const v2 = v1
      .replace("（請填入報到處與服務時間）", "大進國小報到處（08:00–17:00）")
      .replace(
        '<p>（請填入大眾運輸方式與接駁資訊，例：台鐵○○站下車，站前有接駁點，班距約 20 分鐘。）</p>' +
        '<ul><li>自行開車：（請填入路線與<strong>目前的交通管制範圍</strong>、停車地點）</li>' +
        '<li><strong>出發前就先訂好回程車票。</strong>末班接駁時間請填入 —— 錯過在當地叫不到車。</li></ul>',
        '<p>台鐵光復站下車，站前有志工接駁點，班距約 20 分鐘，直達大進國小報到處。</p>' +
        '<ul><li>自行開車：台 9 線南下轉大進街，<strong>大進街以南目前管制</strong>，請停在糖廠停車場再步行。</li>' +
        '<li><strong>出發前就先訂好回程車票。</strong>末班接駁 17:30，錯過只能自行叫車，而當地叫不到車。</li></ul>')
      .replace("（請填入本次災害的特有風險，例：上游堰塞湖潰堤警報）",
        "上游堰塞湖仍有潰堤風險，聽到警報立刻依指示撤離。");
    const v3 = v2.replace("<strong>大進街以南目前管制</strong>",
      "<strong>大進街以南管制，範圍今日擴大到中正路口</strong>");
    const draft = v3.replace("08:00–17:00", "07:30–17:00，今日提前半小時");

    return {
      published: { content: v3, by: "林承翰", at: now - 2 * 86400000, version: 3 },
      draft: { content: draft, by: "吳政憲", at: now - 40 * 60000 },
      versions: [
        { version: 1, content: v1, by: "林承翰", at: now - 8 * 86400000 },
        { version: 2, content: v2, by: "林承翰", at: now - 6 * 86400000 },
        { version: 3, content: v3, by: "林承翰", at: now - 2 * 86400000 },
      ],
      events: [
        ev(now - 8 * 86400000, "林承翰", "create", "從「水災」範本建立"),
        ev(now - 8 * 86400000, "林承翰", "publish", "第 1 版"),
        ev(now - 6 * 86400000, "林承翰", "publish", "第 2 版"),
        ev(now - 2 * 86400000, "林承翰", "publish", "第 3 版"),
        ev(now - 40 * 60000, "吳政憲", "save_draft", "報到時間提前半小時"),
      ],
    };
  }

  // ── 讀寫 ────────────────────────────────────────────────────────────────
  window.vbRead = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) {                       // 從沒寫過 → 給種子
        const s = seed();
        localStorage.setItem(KEY, JSON.stringify(s));
        return normalize(s);
      }
      if (raw === "null") return null;          // 使用者刻意重設成「還沒建立」
      return normalize(JSON.parse(raw));
    } catch (e) { return normalize(seed()); }
  };

  window.vbWrite = function (rec) {
    try {
      localStorage.setItem(KEY, JSON.stringify(rec));
    } catch (e) {
      // 圖片轉 base64 之後最容易撞到的就是這裡（localStorage 約 5MB）。
      // 靜默失敗會讓人以為存好了，所以往外丟。
      try { window.dispatchEvent(new CustomEvent(EVT, { detail: { error: "quota" } })); } catch (e2) {}
      throw e;
    }
    try { window.dispatchEvent(new CustomEvent(EVT)); } catch (e) {}
  };

  window.vbSubscribe = function (fn) {
    const on = () => fn();
    const onStorage = (e) => { if (e.key === KEY) fn(); };
    window.addEventListener(EVT, on);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", onStorage); };
  };

  /** 原型專用：回到「還沒建立」，用來看新增流程。正式版沒有這個。 */
  window.vbResetPrototype = function () { window.vbWrite(null); };

  // ── 狀態 ────────────────────────────────────────────────────────────────
  //
  // 🔒 四種狀態是整支 Feature 的核心。任何畫面要說「現在怎樣」都讀這裡。
  //    `published` 的中文是「**對外中**」不是「已發布」—— 畫面要回答的是
  //    「現在志工看不看得到」，不是「有沒有發布過」。
  window.VB_STATE = {
    none:      { key: "none",      label: "尚未建立", tone: "neutral", pub: false },
    draft:     { key: "draft",     label: "草稿",     tone: "warning", pub: false },
    published: { key: "published", label: "對外中",   tone: "success", pub: true },
    dirty:     { key: "dirty",     label: "對外中 · 有未發布的修改", tone: "info", pub: true },
  };

  function sameContent(a, b) { return String(a || "") === String(b || ""); }
  window.vbSameContent = sameContent;

  window.vbState = function (rec) {
    if (!rec) return window.VB_STATE.none;
    if (!rec.published) {
      return rec.draft && !window.vbIsEmpty(rec.draft.content) ? window.VB_STATE.draft : window.VB_STATE.none;
    }
    if (rec.draft && !sameContent(rec.draft.content, rec.published.content)) return window.VB_STATE.dirty;
    return window.VB_STATE.published;
  };

  /** 編輯器要載入哪一份：有草稿改草稿，沒草稿就從已發布的複製一份出來改。
   *  🔒 **不能直接改 published 物件** —— 那樣按下「儲存草稿」的當下前台就變了。 */
  window.vbWorking = function (rec) {
    if (!rec) return emptyContent();
    if (rec.draft) return String(rec.draft.content || "");
    if (rec.published) return String(rec.published.content || "");
    return emptyContent();
  };

  // ── 動作 ────────────────────────────────────────────────────────────────
  function mutate(fn) {
    const next = fn(window.vbRead());
    window.vbWrite(next);
    return next;
  }
  const push = (rec, actor, kind, note) => [...(rec ? rec.events : []), { at: Date.now(), actor, kind, note: note || "" }];

  /** 從範本建立那一份（templateKey 為 null＝空白開始）。
   *  🔒 建立出來的是**草稿**，不是直接對外 —— 範本裡的地點與時間都是示意，
   *     沒改就發出去，志工會照著錯的資訊打包。 */
  window.vbCreate = function (templateKey, by) {
    const t = window.VB_TEMPLATE_MAP[templateKey];
    return mutate((rec) => ({
      published: (rec && rec.published) || null,
      draft: { content: window.vbTemplateContent(templateKey), by, at: Date.now() },
      versions: (rec && rec.versions) || [],
      events: push(rec, by, "create", t ? `從「${t.label}」範本建立` : "從空白建立"),
    }));
  };

  /** 儲存草稿：只動 draft，前台不受任何影響。 */
  window.vbSaveDraft = function (content, by) {
    const clean = window.vbSanitize(content || "");
    return mutate((rec) => ({
      published: (rec && rec.published) || null,
      draft: { content: clean, by, at: Date.now() },
      versions: (rec && rec.versions) || [],
      events: push(rec, by, "save_draft"),
    }));
  };

  /** 發布：草稿**整份**取代已發布版本。
   *  🔒 表 23「舊版本內容不會殘留」= 整份換掉，不是逐段合併。
   *     逐段合併會留下「這一段是舊的、那一段是新的」的混血版本，
   *     而志工沒有任何方式看得出哪一段過時了。
   *  ⚠️ 正式版必須是單一 transaction（寫 published ＋ 清 draft ＋ 寫版本 ＋ 記錄）。 */
  window.vbPublish = function (by, note) {
    return mutate((rec) => {
      const src = rec && rec.draft ? rec.draft.content
        : (rec && rec.published ? rec.published.content : emptyContent());
      // 版號取「歷史最大 +1」不是「目前這一份 +1」—— 下架後重發不可以讓版號倒退
      const maxSeen = ((rec && rec.versions) || []).reduce((m, v) => Math.max(m, v.version || 0), 0);
      const version = Math.max(maxSeen, (rec && rec.published && rec.published.version) || 0) + 1;
      const at = Date.now();
      return {
        published: { content: src, by, at, version },
        draft: null,     // 發布完草稿就結清，避免永遠顯示「有未發布的修改」
        // 🔒 留每一版的**全文**，但只留已發布的（2026-09-06 裁示）。
        //    草稿是過程不是事實；災害檢討要回答的是「當時到底叫志工帶什麼」。
        versions: [...((rec && rec.versions) || []), { version, content: src, by, at }],
        events: push(rec, by, "publish", note || `第 ${version} 版`),
      };
    });
  };

  /** 丟棄草稿：回到目前已發布的內容。沒有已發布版本時，等於回到「尚未建立」。 */
  window.vbDiscardDraft = function (by) {
    return mutate((rec) => ({
      published: (rec && rec.published) || null,
      draft: null,
      versions: (rec && rec.versions) || [],
      events: push(rec, by, "discard_draft"),
    }));
  };

  /** 下架：前台不再顯示。內容不刪，退回草稿。 */
  window.vbUnpublish = function (by) {
    return mutate((rec) => ({
      published: null,
      draft: (rec && rec.draft) || (rec && rec.published
        ? { content: rec.published.content, by, at: Date.now() } : null),
      versions: (rec && rec.versions) || [],
      events: push(rec, by, "unpublish"),
    }));
  };

  // ── 「這一次改了哪幾段」（2026-09-06 裁示：不發通知，改在頁面上標）──────────
  //
  // 🔒 裁示：「不發通知，但頁面上標『最近更新』」。
  //    比發通知好的地方：回頭看的人**一眼知道哪裡變了**，而通知只說「有東西變了」。
  //    這也是留版本全文換來的第一個實際好處 —— 沒有上一版就算不出差異。
  //
  // 只有兩版以上才算得出來。第一版全部都是新的，那時整頁標「更新」等於沒標。
  // 🔄 2026-09-20：沒有四段了，改成**以 `<h2>` 把整份切塊再逐塊比對**（Sucre 裁示）。
  //
  // ⚠️ 已知代價：**標題被改字時整塊會被判成新的**（舊標題找不到對應）。
  //    這是拿「不新增欄位」換來的 —— 要精準就得給每一塊一個穩定 id，
  //    那等於把四段換成 N 段，結構又回來了。在這一頁上，多標一塊比少標一塊安全。
  //
  // 第一個 `<h2>` 之前的內容自成一塊（key 為空字串），前台標不到它 —— 那裡通常是引言。
  function splitBlocks(html) {
    const box = document.createElement("div");
    box.innerHTML = window.vbSanitize(html || "");
    const out = [];
    let cur = { head: "", body: "" };
    [...box.children].forEach((n) => {
      if (n.tagName === "H2") { out.push(cur); cur = { head: (n.textContent || "").trim(), body: "" }; }
      else cur.body += n.outerHTML;
    });
    out.push(cur);
    return out.filter((b) => b.head || b.body.trim());
  }
  window.vbSplitBlocks = splitBlocks;

  window.vbChangedBlocks = function (rec) {
    const v = (rec && rec.versions) || [];
    if (v.length < 2) return [];
    const cur = splitBlocks(v[v.length - 1].content);
    const prevMap = Object.fromEntries(splitBlocks(v[v.length - 2].content).map((b) => [b.head, b.body]));
    return cur.filter((b) => b.head && prevMap[b.head] !== b.body).map((b) => b.head);
  };

  // ⚠️ 72 小時是我取的。理由：再長，「最近更新」會變成常駐裝飾而失去意義；
  //    再短，週末更新的內容週一出發的人就看不到標記了。**不是規格值。**
  window.VB_RECENT_MS = 72 * 3600000;
  window.vbIsRecent = function (at) { return Boolean(at) && (Date.now() - at) <= window.VB_RECENT_MS; };

  /** 已發布版本史（新到舊）。給後台檢討回看用。 */
  window.vbVersions = function () {
    const rec = window.vbRead();
    return rec ? [...(rec.versions || [])].sort((a, b) => b.version - a.version) : [];
  };

  // ══════════════════════════════════════════════════════════════════════
  // 前台的唯一入口
  //
  // 🔒 前台只有這一支可以呼叫，而且它**只回傳一筆或 null**。
  //
  //    兩層保證疊在一起：
  //      · 讀不到 draft  → 前台不可能看到未發布的內容
  //      · 回傳單筆      → 前台不可能長出「切換災害類型」這種東西
  //
  //    ⚠️ 不要為了「順便」把它改成陣列。前台一旦拿得到多筆，頁籤遲早會被加回來。
  // ══════════════════════════════════════════════════════════════════════
  window.vbPublicCurrent = function () {
    const rec = window.vbRead();
    if (!rec || !rec.published || window.vbIsEmpty(rec.published.content)) return null;
    return {
      content: rec.published.content,
      at: rec.published.at,
      version: rec.published.version,
      // 前台只拿「哪幾段變了」，拿不到舊版全文 —— 舊版是後台檢討用的，
      // 給志工看兩個版本只會讓他不確定該照哪一份打包。
      changed: window.vbChangedBlocks(rec),
    };
  };

  // ── 歷史 ────────────────────────────────────────────────────────────────
  window.VB_EVENT_LABEL = {
    create:        { label: "建立",     icon: "FilePlus2", tone: "primary" },
    save_draft:    { label: "儲存草稿", icon: "FileEdit",  tone: "neutral" },
    publish:       { label: "發布",     icon: "Send",      tone: "primary" },
    unpublish:     { label: "下架",     icon: "EyeOff",    tone: "neutral" },
    discard_draft: { label: "丟棄草稿", icon: "Undo2",     tone: "neutral" },
  };
  window.vbHistory = function () {
    const rec = window.vbRead();
    if (!rec) return [];
    return [...rec.events]
      .map((e, i) => ({ ...e, id: e.at + "-" + e.kind + "-" + i }))
      .sort((a, b) => b.at - a.at);
  };

  // ══════════════════════════════════════════════════════════════════════
  // 打包清單的勾選（2026-09-19 裁示；2026-09-20 取樣範圍改過，見下）
  //
  // 🔒 **只存本地，不進後端。** 這是「我這台手機的打包進度」，不是平台資料：
  //    未登入也要能用，而且沒有任何人需要看到別人勾到哪。
  //    ⚠️ 「不跨裝置」是**裁示**不是待辦（Q10 已否決）：要跨裝置就得綁帳號，
  //       而這一頁未登入的人也要能用。換手機不會同步，介面上要寫明。
  //
  // 🔒 **內容一改就重置，並且要告訴使用者。**
  //    這是這個功能真正的難點 —— 後台把「長筒雨鞋」改成「長筒雨鞋（綁帶佳）」之後：
  //      · 用項目文字當 key → 那一項靜靜掉勾，使用者不知道為什麼
  //      · 用索引當 key     → 中間插一項就全部錯位，比掉勾更糟
  //    所以改成**整份重置 ＋ 明講「清單更新了，請重新核對」**。
  //    在災害情境下，「叫他重看一次」比「默默掃錯」安全。
  //
  // ⚠️ 判斷依據是**內容指紋**，不是版本號 ——
  //    後台只改交通那一段的敘述也會讓版號進位，那不該把人的打包進度清掉。
  //
  // 🔄 **2026-09-20：指紋的取樣範圍變了。**
  //    舊：裝備段的整段 HTML（那時「可勾」是從段落推導的）
  //    新：**全文所有被作者標記為可勾的項目文字**（`vbCheckableTexts()`）
  //    → 改交通段的敘述不再清掉打包進度，而改一項裝備的字仍然會 —— 這正是要的。
  //
  // 🔴 **給正式版的前端：這一段的規則不在程式裡看得出來。**
  //    「哪些項目可勾」是**作者標記**的（原型用 li 的 data-check 旗標，
  //    Markdown 版是 GFM 的 `- [ ]`），而且**編輯器只輸出未勾、render 一律忽略 `[x]`**。
  //    照著原型實作 data-check 是錯的，那只是 Markdown 之前的替身。
  const CKEY = "wg.briefing.checklist.v1";

  /** djb2。只用來比對「內容有沒有變」，不是安全雜湊。 */
  window.vbHash = function (str) {
    let h = 5381;
    const s2 = String(str || "");
    for (let i = 0; i < s2.length; i++) h = ((h << 5) + h + s2.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  /** 讀勾選。**純讀取，沒有副作用** —— 這一點很重要，踩過兩次：
   *
   *   第一版會在指紋不符時 `removeItem`，於是：
   *     · 兩個元件各讀一次 → 先跑的把「已重置」吃掉，提示永遠不出現
   *     · `useState` 的 lazy init 與 `useEffect` 各跑一次 → 同樣互相蓋掉
   *     · 後台發布時 storage 事件即時傳過來，當場消費掉 → 使用者重整後就看不到提示了
   *   → 改成純讀取：指紋不符就回報 `reset`，**舊資料留著不刪**。
   *     真正的清除發生在下一次寫入（勾選、全部清除、或按掉提示）——
   *     那時 fp 會一起換成新的。
   *
   *  `reset` 為 true 代表「清單換過了，之前的勾選不算數」，畫面要告知。
   *  因為不刪資料，這個提示**撐得過重整**，直到使用者真的處理它為止。 */
  window.vbChecklistLoad = function (fp) {
    try {
      const raw = localStorage.getItem(CKEY);
      if (!raw) return { checked: [], reset: false };
      const v = JSON.parse(raw);
      if (!v || v.fp !== fp) {
        // 只有「本來真的有勾」才值得提示；空的就當作沒事
        return { checked: [], reset: Boolean(v && (v.checked || []).length) };
      }
      return { checked: Array.isArray(v.checked) ? v.checked : [], reset: false };
    } catch (e) { return { checked: [], reset: false }; }
  };

  window.vbChecklistSave = function (fp, checked) {
    try { localStorage.setItem(CKEY, JSON.stringify({ fp, checked, at: Date.now() })); } catch (e) {}
  };

  // ── 顯示用 ──────────────────────────────────────────────────────────────
  window.vbClock = function (ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  window.vbAgo = function (ms) {
    if (!ms) return "—";
    const d = Date.now() - ms;
    if (d < 60000) return "剛剛";
    if (d < 3600000) return Math.floor(d / 60000) + " 分鐘前";
    if (d < 86400000) return Math.floor(d / 3600000) + " 小時前";
    return Math.floor(d / 86400000) + " 天前";
  };
})();
