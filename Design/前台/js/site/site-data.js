/* site-data.js — 資料層（原型）
 * 資料形狀完全對齊後端 GraphQL contract：
 *   StationFields / TicketFields / ClosureAreaFields（見 Frontend/docs/database-schema.md）
 *   分頁採 connection-style：{ items, pageInfo { totalCount hasNextPage hasPreviousPage } }
 * mapStationToMarker / mapTicketToMarker / mapClosureAreaToOverlay 與 repo
 *   libs/modules/src/map/site/markers.ts 同名同義 —— 換上 urql client 後即可直接沿用。 */
(function () {
  const { getStationTypeLabel, formatTicketStatusLabel } = window.SiteRoute;
  const ts = (d) => new Date(d).toISOString();
  const pt = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });

  /* ══════════════════════════════════════════════════════════════════════════
   * 訪客邊界（guest boundary）— TM-FEAT-003
   *
   * ⚠️ 正式版這一整段是【後端】的責任，不是前端。
   *   後端已經在做：ticket 的座標被 snap 到 H3 六角網格中心，最細 resolution
   *   因 PII 因素寫死在後端（HC 2026-07-03）。前端拿到的就已經是遮好的資料。
   *
   * 這裡在前端模擬，只是為了讓原型能同時呈現「登入前 / 登入後」兩種畫面。
   * 換上真的 GraphQL client 之後，**這一段要整段刪掉**，不要搬進正式版。
   *
   * 依據：
   *   TM-FEAT-003 AC-02  Guest responses never contain door-level coordinates.
   *   TM-FEAT-003 AC-03  Original free text, photos, review notes, creator
   *                      identity, and raw contact details are not available
   *                      to guests.
   *   TM-FEAT-003 AC-04  同一道邊界要套用在 list / single-item / nested /
   *                      mutation-response / export 全部路徑上。
   *                      → 所以遮在 queryMarkers()，不是遮在詳情面板。
   * ═══════════════════════════════════════════════════════════════════════ */

  /** HC 2026-07-03：最細網格「大約直徑 550m 的圓的 ticket 會被 mapping 在同一個點」。
   *  ⚠️ 這個數字是從聊天紀錄抄的，不是規格值，也還沒跟後端對過實際的 H3 resolution 編號。
   *  正式版不要讀這個常數，要問後端拿。 */
  const GUEST_GRID_DIAMETER_M = 550;

  /** 把座標吸附到六角網格中心。
   *  ⚠️ 這是「近似」不是真 H3 —— 真 H3 用的是球面上的固定索引，這裡是局部平面近似的
   *  axial hex lattice。兩者算出來的格子不會對齊。原型看起來對就好，不要拿去比對後端。 */
  function snapToHexGridCenter(lat, lng) {
    const size = GUEST_GRID_DIAMETER_M / 2;           // 外接圓半徑
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
    const x = lng * mPerDegLng;
    const y = lat * mPerDegLat;

    // 平面座標 → axial（pointy-top）
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
    const r = ((2 / 3) * y) / size;

    // cube rounding：先各自四捨五入，再修正誤差最大的那一軸
    let rx = Math.round(q);
    let ry = Math.round(-q - r);
    let rz = Math.round(r);
    const dx = Math.abs(rx - q);
    const dy = Math.abs(ry - (-q - r));
    const dz = Math.abs(rz - r);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;

    // axial → 平面座標（格子中心）
    const cx = size * Math.sqrt(3) * (rx + rz / 2);
    const cy = size * (3 / 2) * rz;
    return {
      lat: cy / mPerDegLat,
      lng: cx / mPerDegLng,
      cellId: 'g' + rx + '_' + rz,
    };
  }

  window.SiteGuestBoundary = { GUEST_GRID_DIAMETER_M, snapToHexGridCenter };

  // ── stations（光復鄉一帶） ─────────────────────────────────────────────────
  const STATIONS = [
    { uuid: 'st-0001', propertyName: '光復國小供水站', name: '光復國小供水站', type: 'water',
      geometry: pt(121.4212, 23.6694), description: '校門口設 6 座取水口，可接軟管', opHour: '06:00–22:00',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.96, isOfficial: true, isTemporary: false, priorityScore: 92 },
    { uuid: 'st-0002', propertyName: '光復商工避難收容所', name: '光復商工避難收容所', type: 'shelter',
      geometry: pt(121.4194, 23.6631), description: '體育館可容納 320 人，備睡墊與毯', opHour: '24 小時',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.94, isOfficial: true, isTemporary: false, priorityScore: 90 },
    { uuid: 'st-0003', propertyName: '大進村行動衛浴', name: '大進村行動衛浴', type: 'shower',
      geometry: pt(121.4058, 23.6784), description: '男女各 4 間，熱水由發電機供應', opHour: '07:00–21:00',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.88, isTemporary: true, priorityScore: 74 },
    { uuid: 'st-0004', propertyName: '中正路臨時廁所群', name: '中正路臨時廁所群', type: 'toilet',
      geometry: pt(121.4231, 23.6668), description: '流動廁所 12 座，每日清運兩次', opHour: '24 小時',
      visibility: 'public', verificationStatus: 'ai_verified',
      status: 'paused',
      confidenceScore: 0.71, isTemporary: true, priorityScore: 63 },
    { uuid: 'st-0005', propertyName: '光復車站接駁點', name: '光復車站接駁點', type: 'transport',
      geometry: pt(121.4176, 23.6707), description: '往花蓮市區接駁車每小時一班', opHour: '06:30–19:30',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.93, isOfficial: true, priorityScore: 86 },
    { uuid: 'st-0006', propertyName: '馬太鞍醫療站', name: '馬太鞍醫療站', type: 'medical',
      geometry: pt(121.4102, 23.6752), description: '駐點護理師 2 名，可換藥與基礎診療', opHour: '08:00–20:00',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.91, priorityScore: 88 },
    { uuid: 'st-0007', propertyName: '光復糖廠物資中心', name: '光復糖廠物資中心', type: 'supply',
      geometry: pt(121.4249, 23.6742), description: '主物資集散場，需先線上登記領取', opHour: '08:00–18:00',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.97, isOfficial: true, priorityScore: 95 },
    { uuid: 'st-0008', propertyName: '大同村加油據點', name: '大同村加油據點', type: 'gas_station',
      geometry: pt(121.4283, 23.6612), description: '限救災車輛，需出示派工單', opHour: '07:00–19:00',
      visibility: 'public', verificationStatus: 'ai_verified',
      status: 'closed',
      confidenceScore: 0.68, priorityScore: 58 },
    { uuid: 'st-0009', propertyName: '太巴塱充電站', name: '太巴塱充電站', type: 'charge',
      geometry: pt(121.4361, 23.6689), description: '30 組插座與行動電源租借', opHour: '08:00–22:00',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.85, priorityScore: 70 },
    { uuid: 'st-0010', propertyName: '佛祖街發電機支援點', name: '佛祖街發電機支援點', type: 'power',
      geometry: pt(121.4145, 23.6641), description: '3 台 5kW 發電機，柴油每日補充', opHour: '24 小時',
      visibility: 'public', verificationStatus: 'ai_verified',
      confidenceScore: 0.66, isTemporary: true, priorityScore: 61 },
    { uuid: 'st-0011', propertyName: '大平村通訊中繼站', name: '大平村通訊中繼站', type: 'cellular',
      geometry: pt(121.3986, 23.6598), description: 'Starlink 與衛星電話可借用', opHour: '24 小時',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.9, isOfficial: true, priorityScore: 82 },
    { uuid: 'st-0012', propertyName: '大富車站加水點', name: '大富車站加水點', type: 'water',
      geometry: pt(121.4048, 23.6428), description: '水塔 2 座，適合大型水車補水', opHour: '24 小時',
      visibility: 'public', verificationStatus: 'ai_verified',
      confidenceScore: 0.64, priorityScore: 55 },
    { uuid: 'st-0013', propertyName: '大興村避難所', name: '大興村避難所', type: 'shelter',
      geometry: pt(121.4318, 23.6851), description: '社區活動中心，約可容納 80 人', opHour: '24 小時',
      visibility: 'public', verificationStatus: 'human_verified',
      confidenceScore: 0.83, isTemporary: true, priorityScore: 72 },
    { uuid: 'st-0014', propertyName: '敦厚村物資轉運點', name: '敦厚村物資轉運點', type: 'supply',
      geometry: pt(121.4092, 23.6875), description: '上游村落轉運用，僅收乾糧與飲水', opHour: '09:00–17:00',
      visibility: 'public', verificationStatus: 'ai_verified',
      status: 'paused',
      confidenceScore: 0.59, isTemporary: true, priorityScore: 48 },
  ].map((s) => ({
    comment: null, isDuplicate: false, isOfficial: false, isTemporary: false,
    // 營運狀態三態（Sucre 2026-08-09）：open / paused / closed。
    // ⚠️ 本地偏離正典：RS-FEAT-001 寫的是 open/paused/closed/full，
    //    我們不做 full（額滿）—— 因為容量不記，額滿算不出來。
    status: 'open',
    createdBy: 'usr-ops-01', createdAt: ts('2026-07-24T02:10:00Z'), updatedAt: ts('2026-07-30T22:05:00Z'),
    ...s,
  }));

  /* ── 每張任務單的需求清單（`ticket_tasks`）──────────────────────────────────
   *
   * 🚨 **這些需求的名稱與人數是我（Claude）編的**，不是正典也不是後端資料。
   *    2026-09-04 Sucre：「開單時寫了兩個 task，但承接單子沒有問我要哪個」——
   *    先前 mock 的 ticket 只有一個總人數，連「有幾筆需求」都表達不出來，
   *    所以沒東西可以拆。這裡把既有的總人數拆成多筆，**拆完的和維持原值**
   *    （required 與 matched 都對得起來），排序與分層邏輯因此不受影響。
   *
   * 對齊的既有欄位：
   *   kind      → `ticket_tasks.task_type`，只能是 hr / supply / rescue（同 TK_TASK_KIND）
   *   quantity  → `ticket_tasks.quantity`，可為 null（「不知道要幾個」是真實答案）
   *   matched   → 前台顯示用的基準承接數，正式版是 `task_assignments` 的列數
   */
  const TICKET_NEEDS = {
    'tk-4022': [
      { id: 'K-4022-1', kind: 'hr', name: '堤岸清淤人力', quantity: 8, matched: 3 },
      { id: 'K-4022-2', kind: 'hr', name: '砂包堆疊人力', quantity: 4, matched: 0 },
    ],
    'tk-4019': [
      { id: 'K-4019-1', kind: 'hr', name: '教室鏟泥人力', quantity: 14, matched: 12 },
      { id: 'K-4019-2', kind: 'hr', name: '高壓水槍操作', quantity: 6, matched: 2 },
    ],
    'tk-4031': [
      { id: 'K-4031-1', kind: 'hr', name: '分送志工（3 人一組）', quantity: 6, matched: 2 },
      { id: 'K-4031-2', kind: 'supply', name: '飲水與熱食', quantity: 3, matched: 0 },
    ],
    'tk-4008': [
      { id: 'K-4008-1', kind: 'hr', name: '破壞剪操作', quantity: 2, matched: 2 },
      { id: 'K-4008-2', kind: 'hr', name: '圍籬搬運人力', quantity: 4, matched: 4 },
    ],
    'tk-4044': [
      { id: 'K-4044-1', kind: 'hr', name: '上屋頂鋪帆布', quantity: 5, matched: 4 },
      { id: 'K-4044-2', kind: 'hr', name: '地面遞料與固定', quantity: 3, matched: 1 },
    ],
    'tk-4051': [
      { id: 'K-4051-1', kind: 'hr', name: '入庫掃碼', quantity: 2, matched: 0 },
      { id: 'K-4051-2', kind: 'hr', name: '棧板整理', quantity: 2, matched: 0 },
    ],
    /* 單一需求的單也要有 tasks —— 少了它就會走回「整張單一個進度」的老路。 */
    'tk-3990': [
      { id: 'K-3990-1', kind: 'hr', name: '抽水機輪值看顧', quantity: 6, matched: 4 },
    ],
    'tk-4062': [
      { id: 'K-4062-1', kind: 'hr', name: '碎石清運人力', quantity: 7, matched: 1 },
      { id: 'K-4062-2', kind: 'supply', name: '獨輪車與鐵鏟', quantity: 3, matched: 0 },
    ],
    'tk-3975': [
      { id: 'K-3975-1', kind: 'hr', name: '現場警戒', quantity: 2, matched: 0 },
    ],
    'tk-4070': [
      { id: 'K-4070-1', kind: 'rescue', name: '行動不便住戶搬運', quantity: 4, matched: 0 },
      /* 🚨 這一筆是為了讓「只會醫療的志工怎麼找到事做」有東西可示範（2026-09-04）。
         ⚠️ 注意它的 `kind` 只能是 `hr` —— **前台與 ERD 都沒有「醫療」這個種類**。
            所以它只找得到、篩不出來：搜尋「醫」會命中它的名稱，但需求種類篩選
            仍然只有 搜救／人力／物資 三個軸。這正是待裁示清單的第一題。 */
      { id: 'K-4070-2', kind: 'hr', name: '隨行醫護（EMT）', quantity: 2, matched: 0 },
      { id: 'K-4070-3', kind: 'hr', name: '避難所接應', quantity: 2, matched: 0 },
    ],
  };

  // ── tickets ───────────────────────────────────────────────────────────────
  /* 🚨 2026-09-10：`address` 是**我編的**。
     在此之前 mock 的任務單**根本沒有地址欄位** —— 詳情面板的「位置資訊」
     只好拿 `description` 頂替，於是那一列顯示的是
     「一樓 6 間教室積泥，需鏟具與高壓水槍」這種**現場描述**，不是地址（09-10 回報）。
     這些門牌是照各筆既有的地名（大進村、太巴塱、糖廠…）編出來的合理值，
     **不是真實地址，不可對外使用**。正式版對應 ERD 的
     `tickets.county/city/lane/alley/no/floor`，是結構化欄位不是一條字串。 */
  const TICKETS = [
    { uuid: 'tk-4022', address: '花蓮縣光復鄉大進街堤防段（大進橋下游 200 公尺）', title: '馬太鞍溪堤岸清淤', propertyName: 'INC-4022',
      geometry: pt(121.4118, 23.6796), description: '堤岸缺口淤泥約 60 公尺，需人力清運與砂包堆疊',
      status: 'pending', priority: 'high', taskType: '清淤',
      contactName: '林淑芬', contactPhone: '0912-345-678', contactEmail: 'shufen.lin@example.org',
      reviewNote: '上游持續降雨，作業前請確認水位警戒', requiredVolunteers: 12, matchedVolunteers: 3 },
    { uuid: 'tk-4019', address: '花蓮縣光復鄉中山路一段 20 號　光復國小', title: '光復國小教室泥水清理', propertyName: 'INC-4019',
      geometry: pt(121.4008, 23.6714), description: '一樓 6 間教室積泥，需鏟具與高壓水槍',
      status: 'in_progress', priority: 'medium', taskType: '環境清理',
      contactName: '陳建華', contactPhone: '0933-221-100', contactEmail: 'jh.chen@example.org',
      reviewNote: '第二梯次志工已進場', requiredVolunteers: 20, matchedVolunteers: 14 },
    { uuid: 'tk-4031', address: '花蓮縣光復鄉大進村大進街 12 號一帶', title: '大進村獨居長者物資配送', propertyName: 'INC-4031',
      geometry: pt(121.4066, 23.6771), description: '18 戶名單已核對，需 3 人一組分送飲水與熱食',
      status: 'pending', priority: 'high', taskType: '物資配送', needKind: 'supply',
      contactName: '吳美玲', contactPhone: '0955-778-900', contactEmail: 'ml.wu@example.org',
      reviewNote: null, requiredVolunteers: 9, matchedVolunteers: 2,
      /* 🚨 2026-09-10：這兩筆的建立者是**刻意指定**給前台 demo persona「王志豪 · 建立者」的。
         在此之前 `createdBy` 由下面那條 `[...][i % 4]` 輪流指派，四個 id 裡沒有
         `usr-citizen-01` —— 於是那個 persona 的說明寫「有自己建立的任務單」，
         打開「我的任務 → 我建立的」卻永遠是空的（2026-09-10 回報）。
         選這兩筆的理由：一筆進行中（還在等人）、一筆已完成，兩種狀態都看得到。
         ⚠️ 內容仍是原本的 mock 敘述，不是真實案例。 */
      createdBy: 'usr-citizen-01' },
    { uuid: 'tk-4008', address: '花蓮縣光復鄉中正路二段 88 號旁', title: '中正路倒塌圍籬移除', propertyName: 'INC-4008',
      geometry: pt(121.4223, 23.6675), description: '鐵皮圍籬倒塌壓住人行道，需破壞剪與搬運人力',
      status: 'completed', priority: 'medium', taskType: '障礙移除',
      contactName: '張志偉', contactPhone: '0988-112-233', contactEmail: 'cw.chang@example.org',
      reviewNote: '7/29 下午完成，已回報里長', requiredVolunteers: 6, matchedVolunteers: 6,
      createdBy: 'usr-citizen-01' },
    { uuid: 'tk-4044', address: '花蓮縣光復鄉東富村富愛街 33 號', title: '太巴塱部落屋頂防水', propertyName: 'INC-4044',
      geometry: pt(121.4352, 23.6698), description: '4 戶屋頂破損，需帆布與固定重物',
      status: 'in_progress', priority: 'high', taskType: '房屋修繕',
      contactName: '高文彬', contactPhone: '0977-556-443', contactEmail: 'wb.kao@example.org',
      reviewNote: '材料已到場', requiredVolunteers: 8, matchedVolunteers: 5 },
    { uuid: 'tk-4051', address: '花蓮縣光復鄉糖廠街 19 號　花蓮觀光糖廠', title: '光復糖廠物資盤點', propertyName: 'INC-4051',
      geometry: pt(121.4256, 23.6737), description: '需 4 人協助入庫掃碼與棧板整理',
      status: 'pending', priority: 'low', taskType: '物資整理', needKind: 'supply',
      contactName: '劉佩君', contactPhone: '0966-334-521', contactEmail: 'pc.liu@example.org',
      reviewNote: null, requiredVolunteers: 4, matchedVolunteers: 0 },
    { uuid: 'tk-3990', address: '花蓮縣光復鄉大同村中華路 105 號前', title: '大同村積水抽排', propertyName: 'INC-3990',
      geometry: pt(121.4276, 23.6605), description: '低窪處積水 40 公分，抽水機已就位需輪值看顧',
      status: 'in_progress', priority: 'medium', taskType: '抽水',
      contactName: '鄭家榮', contactPhone: '0922-889-771', contactEmail: 'cj.cheng@example.org',
      reviewNote: null, requiredVolunteers: 6, matchedVolunteers: 4 },
    { uuid: 'tk-4062', address: '花蓮縣光復鄉大興村大興路二段（大興派出所往東 300 公尺）', title: '大興村道路碎石清除', propertyName: 'INC-4062',
      geometry: pt(121.4325, 23.6844), description: '產業道路碎石堆積，需獨輪車與鐵鏟',
      status: 'pending', priority: 'medium', taskType: '道路清理',
      contactName: '徐雅婷', contactPhone: '0910-664-882', contactEmail: 'yt.hsu@example.org',
      reviewNote: null, requiredVolunteers: 10, matchedVolunteers: 1 },
    { uuid: 'tk-3975', address: '花蓮縣光復鄉大平村大平路 47 號旁', title: '大平村電線桿傾倒通報', propertyName: 'INC-3975',
      geometry: pt(121.3994, 23.6604), description: '已轉台電處理，任務關閉',
      status: 'cancelled', priority: 'low', taskType: '設施通報',
      contactName: '簡文雄', contactPhone: '0918-223-664', contactEmail: 'wh.chien@example.org',
      reviewNote: '重複通報，併入 INC-3971', requiredVolunteers: 2, matchedVolunteers: 0 },
    { uuid: 'tk-4070', address: '花蓮縣光復鄉敦厚路 66 號', title: '敦厚村上游撤離協助', propertyName: 'INC-4070',
      geometry: pt(121.4085, 23.6882), description: '協助 5 戶行動不便住戶撤離至大興村避難所',
      status: 'pending', priority: 'high', taskType: '人員撤離', needKind: 'rescue',
      contactName: '潘怡君', contactPhone: '0937-441-208', contactEmail: 'yc.pan@example.org',
      reviewNote: '土石流紅色警戒，優先調度', requiredVolunteers: 8, matchedVolunteers: 0 },

    /* ══════════════════════════════════════════════════════════════════
       🚨 以下七筆是**編的**，連同它們所在的那一棟樓。
       花蓮光復鄉沒有「中正路二段 120 號」這個社區大樓，內容也不是真實案例。

       為什麼非編不可：上面 10 筆 mock 全是低矮鄉村地址（堤防、國小、部落屋頂、
       電線桿），**沒有任何一筆能示範「一個地址多層樓多戶」**。不編一棟，直立
       地圖就永遠只能看到一個空矩陣。

       刻意鋪成這些狀態，每一種格子都要出現得到：
         3-2  還缺人（兩筆需求）      → 紅格 ＋ 角標 2
         3-5  還缺人（一筆）          → 紅格，無角標
         7-1  滿額但未完成            → 黃格
         7-4  已結案                  → 灰格
         11-3 還缺人（搜救）          → 紅格
         B1-1 還缺人（地下層也要有）  → 紅格
         (無樓層) 未定位              → 落到矩陣旁的「未定位」區
       其餘 60 幾格留白 —— 白格＝這戶存在但沒有任何求助單。
       ══════════════════════════════════════════════════════════════════ */
    { uuid: 'tk-5001', address: '花蓮縣光復鄉中正路二段 120 號', floor: 3, room: 2,
      title: '3 樓 2 室積水與家具搬離', propertyName: 'INC-5001',
      geometry: pt(121.4223, 23.6675), description: '客廳積水及膝，需抽水與搬離受潮家具',
      status: 'pending', priority: 'high', taskType: '清淤',
      contactName: '簡佩樺', contactPhone: '0912-100-201', contactEmail: 'ph.chien@example.org',
      reviewNote: null, requiredVolunteers: 5, matchedVolunteers: 1 },
    { uuid: 'tk-5002', address: '花蓮縣光復鄉中正路二段 120 號', floor: 3, room: 5,
      title: '3 樓 5 室長者用藥補給', propertyName: 'INC-5002',
      geometry: pt(121.4223, 23.6675), description: '獨居長者慢性病用藥剩三日，需協助取藥',
      status: 'pending', priority: 'high', taskType: '物資配送', needKind: 'supply',
      contactName: '何淑貞', contactPhone: '0912-100-205', contactEmail: null,
      reviewNote: null, requiredVolunteers: 2, matchedVolunteers: 0 },
    { uuid: 'tk-5003', address: '花蓮縣光復鄉中正路二段 120 號', floor: 7, room: 1,
      title: '7 樓 1 室天花板漏水處理', propertyName: 'INC-5003',
      geometry: pt(121.4223, 23.6675), description: '樓上管線破裂導致天花板持續滴水',
      status: 'in_progress', priority: 'medium', taskType: '修繕',
      contactName: '邱建良', contactPhone: '0912-100-701', contactEmail: null,
      reviewNote: '志工已到場', requiredVolunteers: 3, matchedVolunteers: 3 },
    { uuid: 'tk-5004', address: '花蓮縣光復鄉中正路二段 120 號', floor: 7, room: 4,
      title: '7 樓 4 室門鎖受損更換', propertyName: 'INC-5004',
      geometry: pt(121.4223, 23.6675), description: '大門變形無法上鎖',
      status: 'completed', priority: 'low', taskType: '修繕',
      contactName: '蔡孟儒', contactPhone: '0912-100-704', contactEmail: null,
      reviewNote: '已完成', requiredVolunteers: 2, matchedVolunteers: 2 },
    { uuid: 'tk-5005', address: '花蓮縣光復鄉中正路二段 120 號', floor: 11, room: 3,
      title: '11 樓 3 室行動不便住戶撤離', propertyName: 'INC-5005',
      geometry: pt(121.4223, 23.6675), description: '電梯停用，需人力協助長者下樓',
      status: 'pending', priority: 'critical', taskType: '人員撤離', needKind: 'rescue',
      contactName: '羅世昌', contactPhone: '0912-101-103', contactEmail: null,
      reviewNote: null, requiredVolunteers: 4, matchedVolunteers: 0 },
    { uuid: 'tk-5006', address: '花蓮縣光復鄉中正路二段 120 號', floor: -1, room: 1,
      title: 'B1 機車停放區清淤', propertyName: 'INC-5006',
      geometry: pt(121.4223, 23.6675), description: '地下層淤泥約 20 公分，需鏟具',
      status: 'pending', priority: 'medium', taskType: '清淤',
      contactName: '管理室', contactPhone: '0912-100-000', contactEmail: null,
      reviewNote: null, requiredVolunteers: 6, matchedVolunteers: 2 },
    { uuid: 'tk-5007', address: '花蓮縣光復鄉中正路二段 120 號',
      title: '住戶回報：不確定樓層的漏電疑慮', propertyName: 'INC-5007',
      geometry: pt(121.4223, 23.6675), description: '鄰居代報，只知道是中間樓層，插座有焦味',
      status: 'pending', priority: 'high', taskType: '修繕',
      contactName: '鄰居代報', contactPhone: '0912-100-999', contactEmail: null,
      reviewNote: null, requiredVolunteers: 2, matchedVolunteers: 0 },
  ].map((t, i) => ({
    visibility: 'public', verificationStatus: 'human_verified',
    /* ⚠️ 別讓所有 mock 都掛在同一個 uuid 上。
       這些單子是**別人建的**（後台人員與其他民眾），前台 demo 使用者不是它們的建立者。
       先前全部寫死 `usr-ops-01`，又剛好與前台 demo session 的 userId 相同，
       結果「只有建立者能刪自己的媒合單」這條規則對每一張單都成立 ——
       畫面上每一張都出現刪除鈕（2026-08-22 回報）。
       規則本身是對的，錯在 mock 身分撞號。 */
    createdBy: ['usr-ops-01', 'usr-ops-02', 'usr-citizen-77', 'usr-citizen-42'][i % 4],
    /* `needKind` 對齊 ERD 的 `ticket_tasks.task_type`（hr / supply / rescue）。
       mock 原本只有中文的 `taskType` 敘述，排序判斷不出哪些是搜救。 */
    needKind: 'hr',
    /* 每筆給不同的建立時間 —— 原本全部共用同一個值，排序做了也看不出效果。
       由新到舊：i=0 最新。 */
    createdAt: ts(new Date(Date.parse('2026-07-31T00:40:00Z') - i * 5.5 * 3600 * 1000).toISOString()),
    updatedAt: ts('2026-07-31T00:40:00Z'), ...t,
    /* 需求清單掛在 `...t` 之後，蓋掉上面那個推測用的 `needKind` 預設值。 */
    tasks: TICKET_NEEDS[t.uuid] || [
      { id: 'K-' + t.uuid + '-1', kind: t.needKind || 'hr', name: t.taskType || '現場需求',
        quantity: t.requiredVolunteers || 1, matched: t.matchedVolunteers || 0 },
    ],
  })).map((t) => ({
    ...t,
    /* 只要有任一筆需求是搜救，整張單就算搜救（排序用）。
       先前是每張單自己寫一個 `needKind`，與需求清單可能對不起來。 */
    needKind: t.tasks.some((k) => k.kind === 'rescue') ? 'rescue' : (t.needKind || 'hr'),
  }));

  // ── closure areas ─────────────────────────────────────────────────────────
  const CLOSURE_AREAS = [
    { uuid: 'ca-001', propertyName: '馬太鞍溪上游土石流警戒區', status: 'closed',
      informationSource: '中央氣象署 · 花蓮縣政府', comment: '紅色警戒中，禁止任何作業車輛進入',
      geometry: { type: 'Polygon', coordinates: [[[121.4028, 23.6832], [121.4162, 23.6879],
        [121.4211, 23.6802], [121.4098, 23.6755], [121.4028, 23.6832]]] } },
    { uuid: 'ca-002', propertyName: '中正路南段封閉', status: 'partial',
      informationSource: '光復鄉公所', comment: '單線雙向通行，救災車輛優先',
      geometry: { type: 'Polygon', coordinates: [[[121.4198, 23.6642], [121.4262, 23.6658],
        [121.4271, 23.6618], [121.4206, 23.6602], [121.4198, 23.6642]]] } },
  ].map((c) => ({ createdBy: 'usr-ops-01', createdAt: ts('2026-07-29T05:00:00Z'), updatedAt: ts('2026-07-30T23:10:00Z'), ...c }));

  // ── markers.ts ────────────────────────────────────────────────────────────
  function readPointPosition(geometry) {
    if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) return null;
    const [lng, lat] = geometry.coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return [lat, lng];
  }
  function resolveStationVariant(station) {
    const t = station.type && station.type.trim().toLowerCase();
    if (station.isTemporary || t === 'shelter' || t === 'evacuation' || t === 'checkpoint') return 'pinned-location';
    return 'resource-station';
  }
  function createStationSubtitle(station) {
    const parts = [
      station.description && station.description.trim(),
      station.opHour && station.opHour.trim() ? '服務時間 ' + station.opHour.trim() : null,
      /* 「等級」已移除（2026-08-21）：`level` 是可推導的冗餘欄位，且語意連我們自己都問不清楚 */
    ].filter(Boolean);
    return parts[0] || getStationTypeLabel(station.type);
  }
  function resolveTicketVariant(ticket) {
    const s = ticket.status && ticket.status.trim().toLowerCase();
    const p = ticket.priority && ticket.priority.trim().toLowerCase();
    if (s === 'in_progress' || s === 'in-progress' || s === 'processing' || s === 'assigned'
      || s === 'accepted' || p === 'low' || p === 'medium') return 'in-progress';
    return 'urgent-ticket';
  }
  function mapStationToMarker(station) {
    const position = readPointPosition(station.geometry);
    if (!position) return null;
    return {
      id: station.uuid,
      title: (station.name && station.name.trim()) || (station.propertyName && station.propertyName.trim()) || station.uuid,
      subtitle: createStationSubtitle(station),
      position,
      label: getStationTypeLabel(station.type),
      variant: resolveStationVariant(station),
      detailType: 'station',
      stationMeta: {
        type: station.type, name: station.name, description: station.description,
        status: station.status,
        opHour: station.opHour, comment: station.comment,
        /* `source` 與 `level` 已於 2026-08-21 從前台移除：
           站點一律由後台建立，來源不具區別力；改以 `isOfficial` 表達「官方認定」。
           `level` 在有 parent_station_uuid 後即為可推導的冗餘欄位，建議廢除。 */
        visibility: station.visibility,
        verificationStatus: station.verificationStatus, confidenceScore: station.confidenceScore,
        isDuplicate: station.isDuplicate, isTemporary: station.isTemporary,
        isOfficial: station.isOfficial, priorityScore: station.priorityScore,
        createdAt: station.createdAt, updatedAt: station.updatedAt,
      },
    };
  }
  /** @param {{guest?: boolean}} [opts] guest=true 時套用 TM-FEAT-003 訪客邊界。 */
  function mapTicketToMarker(ticket, opts) {
    const guest = Boolean(opts && opts.guest);
    const exact = readPointPosition(ticket.geometry);
    if (!exact) return null;

    // AC-02：訪客回應絕不含門牌級座標 → 吸附到網格中心
    const cell = guest ? snapToHexGridCenter(exact[0], exact[1]) : null;
    const position = guest ? [cell.lat, cell.lng] : exact;

    return {
      id: ticket.uuid,
      title: ticket.title.trim() || (ticket.propertyName && ticket.propertyName.trim()) || ticket.uuid,
      // AC-03：原始自由文字不對訪客開放 → 只留任務類型這種結構化標籤
      subtitle: guest
        ? ((ticket.taskType && ticket.taskType.trim()) || '救災任務')
        : ((ticket.description && ticket.description.trim()) || (ticket.taskType && ticket.taskType.trim()) || '救災任務'),
      position,
      label: formatTicketStatusLabel(ticket.status, '任務'),
      variant: resolveTicketVariant(ticket),
      detailType: 'ticket',
      isGuestMasked: guest,
      gridCellId: guest ? cell.cellId : null,
      ticketMeta: {
        status: ticket.status, priority: ticket.priority, taskType: ticket.taskType,
        // AC-03：raw contact details / creator identity / review notes 一律不給訪客。
        // 注意是「不放進物件」而不是「放進去但不顯示」—— 放進去 DevTools 就看得到。
        contactName: guest ? null : ticket.contactName,
        contactEmail: guest ? null : ticket.contactEmail,
        contactPhone: guest ? null : ticket.contactPhone,
        createdBy: guest ? null : ticket.createdBy,
        /* AC-02／AC-03：門牌是可以指認到「哪一戶」的資訊，訪客一律拿不到。
           不是「拿到但不顯示」—— 放進物件 DevTools 就看得到。 */
        address: guest ? null : (ticket.address || null),
        reviewNote: guest ? null : ticket.reviewNote,
        visibility: ticket.visibility, verificationStatus: ticket.verificationStatus,
        createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
        propertyName: ticket.propertyName,
        /* 直立地圖（2026-09-12）。樓層／戶室對訪客一律不給 ——
           「哪一棟的哪一層哪一戶」是可以指認到具體住戶家門的資訊，
           比 AC-02 要遮的門牌座標更精確。與 address 同一個理由，
           而且同樣是**不放進物件**，不是放進去再不顯示。
           🔒 訪客到底看不看得到矩陣，Q7 尚未裁示；目前走最保守的一路。 */
        floor: guest ? null : (typeof ticket.floor === 'number' ? ticket.floor : null),
        room: guest ? null : (ticket.room != null ? ticket.room : null),
      },
      requiredVolunteers: ticket.requiredVolunteers,
      matchedVolunteers: ticket.matchedVolunteers,
      /* 需求清單（`ticket_tasks`）。承接的單位是這裡的每一筆，不是整張單。
         ⚠️ 訪客也看得到需求名稱與人數 —— 那是結構化資訊，不是 AC-03 要遮的
         原始自由文字／聯絡方式／門牌座標。志工要判斷「我幫得上忙嗎」靠的就是這個。 */
      tasks: (ticket.tasks || []).map((k) => ({
        id: k.id, kind: k.kind, name: k.name,
        quantity: (typeof k.quantity === 'number' && k.quantity > 0) ? k.quantity : null,
        matched: k.matched || 0,
      })),
      /* 排序用（見 queryMarkers 的 compareTickets）。不進畫面，只進比較函式。 */
      _sortAt: ticket.createdAtISO || ticket.createdAt || null,
      _hasRescue: ticket.needKind === 'rescue',
    };
  }
  function mapClosureAreaToOverlay(area) {
    const g = area.geometry;
    const toLatLng = (rings) => rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
    const polygons = !g ? []
      : g.type === 'Polygon' ? [toLatLng(g.coordinates)]
      : g.type === 'MultiPolygon' ? g.coordinates.map(toLatLng) : [];
    if (!polygons.length) return null;
    return {
      id: area.uuid, label: area.propertyName, status: area.status,
      informationSource: area.informationSource, comment: area.comment, polygons,
    };
  }

  /** HC 2026-07-03 點出的副作用：
   *    「所有的 ticket 都會被 mapping 到 h3 六角形的中央，
   *      所以當沒有登入的時候，會看到許多 ticket 疊在一起」
   *
   *  這不是 bug，是遮罩的必然結果。解法不是把它們錯開（那會造出假的精度），
   *  而是**不畫個別圖釘，改畫格子本身**，中央標數字，點開才列出裡面有幾筆。
   *  （這個做法沿用 A 原型 js/public/pub-map.jsx 的 CellDrawer。） */
  function groupMarkersByGridCell(markers) {
    const byCell = new Map();
    markers.forEach((m) => {
      if (!m.gridCellId) return;
      if (!byCell.has(m.gridCellId)) {
        byCell.set(m.gridCellId, { id: 'cell:' + m.gridCellId, detailType: 'cell', position: m.position, members: [] });
      }
      byCell.get(m.gridCellId).members.push(m);
    });
    return [...byCell.values()].map((c) => ({
      ...c,
      count: c.members.length,
      // 格子的代表色跟著裡面最急的那一筆走
      variant: c.members.some((m) => m.variant === 'urgent-ticket') ? 'urgent-ticket' : 'in-progress',
    }));
  }

  const dedupeMarkersById = (markers) => {
    const byId = new Map();
    markers.forEach((m) => { if (!byId.has(m.id)) byId.set(m.id, m); });
    return [...byId.values()];
  };

  /* ── 前台民眾建立的任務單 ────────────────────────────────────────────────
   * 2026-08-11：災情發生時由現場民眾在前台建立任務單。
   * 這些單子存在共用 store（`WGBridge`，見 js/shared/wg-bridge.js），
   * 前台地圖／列表與後台任務管理讀的是同一份，所以在這裡併進資料源。
   *
   * 形狀轉換：bridge 存的是**後台 ticket 形狀**（對齊 tk-data.js），
   * 前台資料層吃的是 GraphQL contract 形狀，兩者欄位名不同，這支負責翻譯。
   * ⚠️ 正式版沒有這一段 —— 後端本來就是同一張表，不需要合併。 */
  /* ⚠️ 任務單**沒有審核閘門**（2026-08-22 Sucre 更正）。
   *
   * 需要審核的是**資源站點的修改建議**（08-21 決議第五節：`station_update_suggestions`
   * 送交審核，通過才公開更新）。任務單不是 —— 民眾建立就直接進線上，
   * 志工看得到、可以承接。
   *
   * 後台對任務單唯一的「審核」是 AI 標記的**疑似重複**（動作是合併／不是重複，
   * 見 08-21 決議第六節），那是去重，不是放行閘門。
   *
   * ticket 的 `status: 'pending'` 意思是**待處理／待承接**，不是待審核 ——
   * 兩者差一個字，行為差一整段流程。先前把前台新單擋在公開資料源外，
   * 是我把站點那條規則錯套到任務單上，已移除。 */
  const SITE_TICKET_STATUS = 'open';   // → formatTicketStatusLabel 顯示為「待處理」
  function bridgeTicketToContract(t) {
    const site = t._site || {};
    if (typeof site.lat !== 'number' || typeof site.lng !== 'number') return null;
    return {
      uuid: t.id,
      title: t.title,
      propertyName: t.street || t.city || '',
      description: t.desc || '',
      /* 民眾填的地址。ERD 是 county/city/lane/alley/no/floor/room 分欄，
         原型先合成一條字串顯示。
         🔴 2026-09-13 修（直立地圖實測抓到）：這裡原本無條件把 county＋city
            接在 street 前面，而 `createSiteTicket` 存的 `street` 就是使用者填的
            **完整地址**（含縣市）—— 於是變成「花蓮縣光復鄉花蓮縣光復鄉中正路…」。
            平常只是顯示難看，直立地圖一來就變成**功能壞掉**：正規化後的地址
            對不上建築的 addrKey，從矩陣建的單找不回自己那一棟。
         🔴 同時把 `floor` 從這條字串裡拿掉 —— 樓層現在是獨立欄位（`floor`／`room`），
            黏在地址尾巴會讓正規化後的地址每一戶都不一樣，同樣對不上建築。 */
      address: (() => {
        const street = t.street || '';
        const prefix = [t.county, t.city].filter(Boolean).join('');
        if (!street) return prefix || null;
        return (prefix && street.indexOf(prefix) !== 0 ? prefix + street : street) || null;
      })(),
      taskType: (t.tasks && t.tasks[0] && t.tasks[0].name) || '現場需求',
      geometry: pt(site.lng, site.lat),
      status: SITE_TICKET_STATUS,
      priority: t.priority,
      contactName: t.contact_name || null,
      contactPhone: t.contact_phone || null,
      contactEmail: null,
      createdBy: site.createdBy || null,
      reviewNote: null,
      visibility: t.visibility || 'public',
      verificationStatus: null,
      createdAt: t.createdAt, updatedAt: t.createdAt,
      /* 排序用可比較的時間戳；`createdAt` 是給人看的字串，不能拿去 sort。 */
      createdAtISO: (t._site && t._site.createdAtISO) || null,
      /* 直立地圖：民眾在矩陣上點格子建的單，帶著樓層與戶室回來。 */
      floor: (typeof t.floor === 'number') ? t.floor : (t.floor ? parseInt(t.floor, 10) : null),
      room: t.room != null ? t.room : null,
      /* 只要有任一筆需求是搜救，整張單就算搜救 —— 一張單可有多筆需求。 */
      needKind: (t.tasks || []).some((x) => x.kind === 'rescue') ? 'rescue' : 'hr',
      requiredVolunteers: site.requiredVolunteers || 1,
      matchedVolunteers: site.matchedVolunteers || 0,
      /* 需求清單原封帶出來 —— 志工是以需求為單位承接的（`PUB-PS-140`）。
         `quantity` 可能是 null（民眾不知道要幾個人），顯示層要自己處理，
         **不要在這裡補 1** 假裝知道。 */
      tasks: (t.tasks || []).map((k) => ({
        id: k.id, kind: k.kind, name: k.name, quantity: k.quantity,
        matched: (k.assignees || []).length,
        siteNeed: k.siteNeed || null,
      })),
    };
  }

  /** 前台民眾建立的任務單 ＋ 既有 mock。民眾建的直接進公開資料源，沒有審核閘門。 */
  function allTickets() {
    const fromSite = (window.WGBridge ? window.WGBridge.readSiteTickets() : [])
      .map(bridgeTicketToContract).filter(Boolean);
    /* 剛送出的排最前面 —— 送完看不到自己那筆會讓人重複送單。 */
    return fromSite.concat(TICKETS);
  }

  /* ── 任務單排序（2026-08-22 裁示）────────────────────────────────────────
   *
   * 分三層，層內再排：
   *
   *   第一層  還缺人（未滿額）    ← 有動作可做，志工來這裡就是為了這個
   *   第二層  已滿額但未完成       ← 仍在進行，但沒有動作可做
   *   第三層  已完成／已取消       ← 純歷史，**預設不進公開清單**
   *
   * 第一層內：① 有搜救需求的優先  ② 建立時間新 → 舊
   *
   * ⚠️ 為什麼是「最新優先」而不是「等最久優先」——
   *   Sucre 2026-08-22：「等最久可能沒有即時更新，所以可能是過時資訊」。
   *   久沒有動靜的單子，很可能現場早就自行解決、或聯絡不上了。
   *   把它推到第一屏等於用陳舊資料佔住最顯眼的位置；
   *   最新的單反而更可能真的還在等人。
   *   （我原本推薦「等最久優先」，這條理由推翻了它。）
   *
   * ⚠️ 這裡沒有「距離我最近」這一軸。要做需要使用者定位，且列表頁沒有地圖中心可用。 */
  const CLOSED_TICKET_STATUSES = new Set(['completed', 'fulfilled', 'resolved', 'cancelled', 'canceled', 'closed']);
  const isClosedTicket = (t) => CLOSED_TICKET_STATUSES.has((t.status || '').trim().toLowerCase());

  function ticketTier(marker) {
    if (CLOSED_TICKET_STATUSES.has((marker.ticketMeta.status || '').trim().toLowerCase())) return 2;
    const need = marker.requiredVolunteers || 1;
    const got = marker.matchedVolunteers || 0;
    return got < need ? 0 : 1;
  }
  function compareTickets(a, b) {
    const ta = ticketTier(a), tb = ticketTier(b);
    if (ta !== tb) return ta - tb;
    if (a._hasRescue !== b._hasRescue) return a._hasRescue ? -1 : 1;   // 搜救優先
    /* 新 → 舊。缺時間戳的一律墊底，不要讓沒資料的浮到最上面。 */
    const va = a._sortAt ? Date.parse(a._sortAt) : -Infinity;
    const vb = b._sortAt ? Date.parse(b._sortAt) : -Infinity;
    return vb - va;
  }

  /** 對應 GetStations / GetTickets（bounds + 子分類 + 分頁）。
   *  isAuthenticated=false 時對 ticket 套用 TM-FEAT-003 訪客邊界。
   *  站點不遮 —— RS-FEAT-001：`Resource Stations are public information`，
   *  且 AC-12 `Every role can view public resource stations`。 */
  function queryMarkers({ dataType = 'station', bounds, stationType, ticketStatus, skip = 0, limit = 200, isAuthenticated = false }) {
    const guest = !isAuthenticated;
    const inBounds = (geometry) => {
      if (!bounds) return true;
      const [lng, lat] = geometry.coordinates;
      return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
    };
    /* 已完成／已取消預設不進清單 —— 對想幫忙的人零價值，只會把行動清單稀釋掉。
       使用者主動把篩選器切到那些狀態時才撈得出來（`ticketStatus` 有明確指定就照辦）。
       「我建立的」「我承接的」不走這條路徑，那兩份是自己的履歷，一律顯示。 */
    const wantsClosed = Boolean(ticketStatus) && CLOSED_TICKET_STATUSES.has(ticketStatus);
    const source = dataType === 'ticket'
      ? allTickets().filter((t) => inBounds(t.geometry)
          && (!ticketStatus || t.status === ticketStatus)
          && (wantsClosed || !isClosedTicket(t)))
      : STATIONS.filter((s) => inBounds(s.geometry) && (!stationType || s.type === stationType));
    const page = source.slice(skip, skip + limit);
    const items = dedupeMarkersById(
      page.map(dataType === 'ticket'
        ? (t) => mapTicketToMarker(t, { guest })
        : mapStationToMarker).filter(Boolean),
    );
    if (dataType === 'station') {
      items.sort((a, b) => (b.stationMeta.priorityScore || 0) - (a.stationMeta.priorityScore || 0));
    } else {
      items.sort(compareTickets);
    }
    return {
      items,
      pageInfo: {
        totalCount: source.length,
        hasNextPage: skip + limit < source.length,
        hasPreviousPage: skip > 0,
      },
    };
  }

  /** 對應 GetClosureAreas。 */
  function queryClosureAreas() {
    const items = CLOSURE_AREAS.map(mapClosureAreaToOverlay).filter(Boolean);
    return { items, pageInfo: { totalCount: items.length, hasNextPage: false, hasPreviousPage: false } };
  }

  /* ══════════════════════════════════════════════════════════════════════
     直立地圖：把任務單歸位到「樓 × 室」的格子 — 2026-09-12
     ══════════════════════════════════════════════════════════════════════ */

  /** 🔒 訪客看不看得到矩陣 —— **Q7 尚未裁示**（2026-09-12）。
   *
   *  目前走最保守的一路：`false` ＝ 未登入完全看不到矩陣，只看到地圖上的格子，
   *  等同於現況，不多揭露任何東西。
   *
   *  為什麼需要一次裁示而不是我直接選：矩陣會揭露兩件事 ——
   *    (1) 哪一戶有人在裡面需要幫忙；
   *    (2) 哪一戶從頭到尾沒有人通報（在災後可以讀成「哪幾戶現在沒人」）。
   *  參考站台（宏福苑報平安）選擇全部公開，而**那是對的** —— 它是住戶與親友
   *  自發互報的平台，登入牆會讓報平安直接死掉。但本平台是政府會接手的救災
   *  平台，同一張矩陣在這裡會變成官方發布的空屋清單。這是責任歸屬問題，
   *  不是 UX 取捨，所以留給人裁示。
   *
   *  ⚠️ 就算改成 true，也**只是前端不擋**。`mapTicketToMarker` 對訪客根本不放
   *     `floor`／`room` 進物件（資料層遮罩，`PUB-PS-121`），所以訪客拿到的會是
   *     一張全部落在「未定位」的矩陣。要真的讓訪客看到分層資訊，得先改資料層 ——
   *     而後端 `tickets.visibility` 只能遮**整列**，沒有欄位級遮罩，做不到
   *     「看得到棟、看不到戶」。那一條要提工程。 */
  const GUEST_CAN_SEE_MATRIX = false;

  /** marker 屬於哪一格。回 null 代表放不進矩陣（沒填樓層／訪客被遮）。 */
  function markerCellOf(marker) {
    const m = marker && marker.ticketMeta;
    if (!m) return null;
    const f = m.floor;
    const u = m.room;
    if (typeof f !== 'number' || !isFinite(f) || f === 0) return null;
    const un = typeof u === 'number' ? u : parseInt(u, 10);
    if (!isFinite(un) || un <= 0) return null;
    return { floor: f, unit: un };
  }

  /** 把一批 marker 分進建築的格子。
   *
   *  🔒 回傳一定含 `unplaced` —— 沒填樓層／戶室的單。**呼叫端不准把它藏起來。**
   *     災害發生在前、後台輸入建築結構在後，所以一定會有一批舊單沒有戶室；
   *     直立模式開啟後也仍然有人不知道自己在幾樓幾戶（代填的鄰居、不確定門牌的）。
   *     那一疊是還沒被放上矩陣的求助，藏起來的話矩陣看起來很完整而實際上漏了人。 */
  function groupMarkersIntoBuilding(building, markers) {
    const byCell = {};
    const unplaced = [];
    const B = window.WGBridge;
    (markers || []).forEach((mk) => {
      if (!mk || mk.detailType !== 'ticket') return;
      const cell = markerCellOf(mk);
      if (!cell) { unplaced.push(mk); return; }
      /* 超出後台輸入的範圍（例如舊單寫 15 樓、但這棟只有 12 樓）＝ 放不進去，
         不是硬塞到最近的一格。硬塞會讓矩陣顯示一筆不存在的位置。 */
      const okFloor = cell.floor > 0
        ? cell.floor <= (building.floorsAbove || 0)
        : -cell.floor <= (building.floorsBelow || 0);
      if (!okFloor || cell.unit > (building.unitsPerFloor || 0)) { unplaced.push(mk); return; }
      if (B && B.isCellMissing(building, cell.floor, cell.unit)) { unplaced.push(mk); return; }
      const key = B ? B.cellKey(cell.floor, cell.unit) : (cell.floor + '-' + cell.unit);
      (byCell[key] || (byCell[key] = [])).push(mk);
    });
    return { byCell, unplaced };
  }

  /** 一棟建築底下的**全部**任務單。
   *
   *  🔴 為什麼不沿用畫面上那批 marker（`sourceMarkers`），而要自己查一次：
   *
   *  (1) **已結案的單被公開清單濾掉了**（`queryMarkers` 的 `wantsClosed`，
   *      以及 2026-08-22「已完成／已取消預設不進公開清單」的排序裁示）。
   *      那條規則在列表裡是對的 —— 列表是一維的，結案的列會佔位把還缺人的推遠。
   *      **但矩陣是二維的，格子位置固定，結案的格子不佔任何人的位置。**
   *      濾掉它的結果是那一格變**白** —— 而白格的意思是「這戶沒有任何求助單」，
   *      於是「已經處理完的戶」會長得跟「從頭到尾沒人通報的戶」一模一樣，
   *      面板上那句「白格不等於安全」就跟著失效。
   *      → `PUB-PS-216` 與該排序裁示的適用範圍要限縮到**列表視角**。這條要進 spec。
   *      （2026-09-13 實測抓到：demo 的 7 樓 4 室已結案，矩陣上卻是白格。）
   *
   *  (2) 列表是**分頁**的，`sourceMarkers` 只有已載入的那幾頁。同一棟的單散在
   *      不同頁時，矩陣會缺格 —— 與 `PUB-PS-223`（搜尋範圍是全部資料，不是已載入
   *      的那一頁）同一種錯。
   *
   *  訪客邊界照舊走 `mapTicketToMarker`（唯一的遮罩發生點），這裡不另開後門。 */
  function queryBuildingMarkers(building, { isAuthenticated = false } = {}) {
    if (!building || !window.WGBridge) return [];
    const guest = !isAuthenticated;
    const key = building.addrKey;
    return dedupeMarkersById(
      allTickets()
        .filter((t) => t.address && window.WGBridge.normalizeAddr(t.address) === key)
        .map((t) => mapTicketToMarker(t, { guest }))
        .filter(Boolean),
    );
  }

  window.SiteData = {
    STATIONS, TICKETS, CLOSURE_AREAS,
    mapStationToMarker, mapTicketToMarker, mapClosureAreaToOverlay, dedupeMarkersById,
    queryMarkers, queryClosureAreas,
    groupMarkersByGridCell, snapToHexGridCenter, GUEST_GRID_DIAMETER_M,
    GUEST_CAN_SEE_MATRIX, markerCellOf, groupMarkersIntoBuilding, queryBuildingMarkers,
  };
})();
