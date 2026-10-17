// ── 成員管理原型 · 假資料（依 PRD 情境：光復鄉災後協作）─────────────────────
// 平台角色與團隊角色為兩個正交維度。標籤一律來自 wg-terms.js，本檔不自己寫字串。

// ⚠️ 2026-08-17：`user`（一般使用者）已移除。
//    Sucre：「沒有這個人！！！前台的人也不會知道自己是這個人，他只在乎自己有沒有
//    帳號，沒有 UI 呈現。」進得了後台就一定是因為有某個身份，所以後台任何一份名單
//    裡都不可能出現這個詞。`general_user` 在後端 roles 表繼續存在，只是不顯示。
window.MM_RBAC = window.WG_TERMS.PLATFORM_ROLES;

// 示範角色（原型頂部可切換視角）
// ⚠️ teams 只是相容欄位；**隸屬的唯一真相來源是 wg-event.js 的 WG_MEMBERSHIPS**，
//    測試組合也維護在那裡（PRD §4.2 的 T-1 ~ T-6）。這裡保持同步即可。
window.MM_PERSONAS = {
  // T-1 / T-6：超級管理員 ＋ 兩隊 → 身份數 3，切到團隊身份時「成員與權限」要消失
  super:     { id: "u-lin",   name: "林承翰", rbac: "super",  title: "平台管理者",      teams: [{ id: "t1", role: "member" }, { id: "t5", role: "admin" }] },
  // T-2：NGO 隊管理員 ＋ NGO 隊成員 ＋ 政府隊成員 → 跨型別，驗平台角色跟不跟著切
  teamadmin: { id: "u-huang", name: "黃曉芳", rbac: "ngo",    title: "壯闊台灣",        teams: [{ id: "t2", role: "admin" }, { id: "t1", role: "member" }, { id: "t6", role: "member" }] },
  gov:       { id: "u-wu",    name: "吳政憲", rbac: "gov",    title: "花蓮縣政府災防辦", teams: [{ id: "t6", role: "admin" }] },
  // T-4：資料檢核員 ＋ 某隊成員 → Carol 8/14 的原始需求，切到成員時「資料檢核」要消失
  auditor:   { id: "u-chang", name: "張育成", rbac: "auditor", title: "資料檢核",       teams: [{ id: "t3", role: "member" }] },
  // 單一身份 → 切換器不出現。rbac 由所屬隊（t1 慈濟＝ngo）推導
  visitor:   { id: "u-chen",  name: "陳小傑", rbac: "ngo",    title: "慈濟基金會",      teams: [{ id: "t1", role: "member" }] },
};

// 2026-08-17 裁示：`type` 收成兩值 `gov` / `ngo`，與 ERD 一致。
// t5 光復福安宮志工隊、t9 鳳林鎮義消協會原本是「其他」——「其他」推不出平台角色
// （8/14 裁示平台角色由 team type 推導）。兩者都不是政府機關，歸 ngo。
window.MM_TEAMS = [
  { id: "t1", name: "慈濟基金會",       type: "ngo", status: "active",    contact: { name: "王秀蘭", phone: "0937-221-405" }, created: "2026-05-02", zones: ["光復鄉大同村", "大平村"], tickets: 126 },
  { id: "t2", name: "壯闊台灣",         type: "ngo", status: "active",    contact: { name: "黃曉芳", phone: "0921-334-556" }, created: "2026-05-03", zones: ["大馬村", "大華村"],       tickets: 89 },
  { id: "t3", name: "台灣世界展望會",   type: "ngo", status: "active",    contact: { name: "林佩珊", phone: "0912-808-117" }, created: "2026-05-05", zones: ["北富村"],                 tickets: 41 },
  { id: "t4", name: "中華民國紅十字會", type: "ngo", status: "active",    contact: { name: "徐國堂", phone: "0989-456-230" }, created: "2026-05-05", zones: ["東富村", "西富村"],       tickets: 64 },
  { id: "t5", name: "光復福安宮志工隊", type: "ngo", status: "active",    contact: { name: "張金水", phone: "03-870-1182" },  created: "2026-06-12", zones: [],                         tickets: 7 },
  { id: "t6", name: "花蓮縣政府災防辦", type: "gov", status: "active",    contact: { name: "吳政憲", phone: "03-822-5101" },  created: "2026-05-01", zones: ["全鄉協調"],               tickets: 18 },
  { id: "t8", name: "馬太鞍溪志工聯隊", type: "ngo", status: "suspended", contact: { name: "潘正豪", phone: "0958-114-672" }, created: "2026-05-06", zones: ["待重新指派"],             tickets: 33, statusNote: "Zone 認領衝突調查中（2026-06-11 起）" },
  { id: "t9", name: "鳳林鎮義消協會",   type: "ngo", status: "inactive",  contact: { name: "李火旺", phone: "03-876-4420" },  created: "2026-05-04", zones: [],                         tickets: 21, statusNote: "已於 2026-06-06 解散，原 Ticket 保留並標示來源" },
];

// 各團隊名單。role: admin / member（2026-08-14 裁示：團隊角色移除 Guest，只留這兩種）
window.MM_ROSTERS = {
  t1: [
    { id: "u-lin",   name: "林承翰", phone: "0908-211-345", rbac: "super", role: "member", status: "active", joined: "2026-06-18", last: "剛剛", note: "同時為平台超級管理員（T-1 測試：一人跨平台與團隊身份）" },
    { id: "m-wang",  name: "王秀蘭", phone: "0937-221-405", rbac: "ngo",  role: "admin",  status: "active",    joined: "2026-05-02", last: "10 分鐘前" },
    { id: "m-lin2",  name: "林志明", phone: "0910-484-227", rbac: "ngo",  role: "admin",  status: "active",    joined: "2026-05-02", last: "1 小時前" },
    { id: "m-su",    name: "蘇麗華", phone: "0928-771-934", rbac: "ngo",  role: "member", status: "active",    joined: "2026-05-04", last: "今天 08:20" },
    { id: "m-kao",   name: "高銘輝", phone: "0987-310-665", rbac: "ngo",  role: "member", status: "active",    joined: "2026-05-06", last: "昨天 19:05" },
    { id: "m-chen",  name: "陳小傑", phone: "0976-552-810", rbac: "ngo" , role: "member", status: "active",    joined: "2026-06-09", last: "30 分鐘前" },
    { id: "m-yeh",   name: "葉佳穎", phone: "0955-208-441", rbac: "ngo",  role: "member", status: "active",    joined: "2026-05-12", last: "06-10" },
    { id: "u-huang", name: "黃曉芳", phone: "0921-334-556", rbac: "ngo",  role: "member", status: "active",    joined: "2026-06-05", last: "剛剛", note: "同時為壯闊台灣管理員（一人多身份）" },
  ],
  t2: [
    { id: "u-huang", name: "黃曉芳", phone: "0921-334-556", rbac: "ngo",  role: "admin",  status: "active",    joined: "2026-05-03", last: "剛剛" },
    { id: "m-lee",   name: "李國豪", phone: "0911-672-300", rbac: "ngo",  role: "member", status: "active",    joined: "2026-05-03", last: "5 分鐘前" },
    { id: "m-chenm", name: "陳美惠", phone: "0936-115-892", rbac: "ngo",  role: "member", status: "active",    joined: "2026-05-04", last: "今天 09:55" },
    { id: "m-liu",   name: "劉建宏", phone: "0972-440-183", rbac: "ngo",  role: "member", status: "active",    joined: "2026-05-07", last: "今天 07:42" },
    { id: "m-chang", name: "張志偉", phone: "0918-993-247", rbac: "ngo",  role: "member", status: "active",    joined: "2026-05-15", last: "昨天 21:10" },
    { id: "m-lin3",  name: "林雅婷", phone: "0930-562-778", rbac: "ngo",  role: "member", status: "suspended", joined: "2026-05-08", last: "06-08", statusNote: "借調離隊（團隊內暫停）" },
    { id: "m-chou",  name: "周庭瑜", phone: "0966-301-554", rbac: "ngo" , role: "member", status: "pending",   joined: "—",          last: "—" },
    { id: "m-panai", name: "巴奈·達瑙", phone: "0905-887-160", rbac: "ngo", role: "member", status: "active",  joined: "2026-05-20", last: "今天 06:30" },
  ],
  t3: [
    { id: "u-chang", name: "張育成", phone: "0921-008-664", rbac: "auditor", role: "member", status: "active", joined: "2026-06-18", last: "今天 09:18", note: "同時為平台資料檢核員（T-4 測試：切到成員身份時檢核頁要消失）" },
    { id: "m-linp",  name: "林佩珊", phone: "0912-808-117", rbac: "ngo",  role: "admin",  status: "active", joined: "2026-05-05", last: "1 小時前" },
    { id: "m-hsieh", name: "謝文彬", phone: "0935-664-902", rbac: "ngo",  role: "member", status: "active", joined: "2026-05-06", last: "今天 08:11" },
    { id: "m-tsao",  name: "曹雅雯", phone: "0917-228-543", rbac: "ngo",  role: "member", status: "active", joined: "2026-05-10", last: "昨天 16:48" },
    { id: "m-weng",  name: "翁啟峰", phone: "0961-770-235", rbac: "ngo",  role: "member", status: "active", joined: "2026-05-18", last: "06-11" },
  ],
  t4: [
    { id: "m-hsu",   name: "徐國堂", phone: "0989-456-230", rbac: "ngo",  role: "admin",  status: "active", joined: "2026-05-05", last: "20 分鐘前" },
    { id: "m-kuo",   name: "郭芷瑄", phone: "0926-103-887", rbac: "ngo",  role: "member", status: "active", joined: "2026-05-05", last: "今天 09:02" },
    { id: "m-tu",    name: "涂景翔", phone: "0978-554-019", rbac: "ngo",  role: "member", status: "active", joined: "2026-05-09", last: "昨天 14:33" },
    { id: "m-fang",  name: "方淑娟", phone: "0919-667-482", rbac: "ngo",  role: "member", status: "active", joined: "2026-05-14", last: "06-10" },
    { id: "m-chien", name: "錢柏宇", phone: "0958-220-794", rbac: "ngo",  role: "member", status: "active", joined: "2026-05-22", last: "06-09" },
  ],
  t5: [
    { id: "u-lin",   name: "林承翰", phone: "0908-211-345", rbac: "super", role: "admin",  status: "active", joined: "2026-06-18", last: "剛剛" },
    { id: "m-changk", name: "張金水", phone: "03-870-1182",  rbac: "ngo", role: "admin",  status: "active",  joined: "2026-06-12", last: "剛剛" },
    { id: "m-wu2",    name: "巫春枝", phone: "0920-455-661", rbac: "ngo", role: "member", status: "pending", joined: "—",          last: "—" },
    { id: "m-tien",   name: "田明德", phone: "0931-094-528", rbac: "ngo", role: "member", status: "pending", joined: "—",          last: "—" },
  ],
  t6: [
    { id: "u-huang", name: "黃曉芳", phone: "0921-334-556", rbac: "ngo",   role: "member", status: "active", joined: "2026-06-18", last: "剛剛", note: "同時為壯闊台灣管理員（T-2 測試：跨型別 —— NGO 隊與政府隊）" },
    { id: "u-wu",    name: "吳政憲", phone: "03-822-5101",  rbac: "gov", role: "admin",  status: "active", joined: "2026-05-01", last: "剛剛" },
    { id: "m-hung",  name: "洪佳蓉", phone: "03-822-5102",  rbac: "gov", role: "member", status: "active", joined: "2026-05-01", last: "今天 09:30" },
    { id: "m-chao2", name: "趙啟元", phone: "03-822-5103",  rbac: "gov", role: "member", status: "active", joined: "2026-05-02", last: "昨天 17:55" },
    { id: "m-yang",  name: "楊舒涵", phone: "03-822-5104",  rbac: "gov", role: "member", status: "active", joined: "2026-05-06", last: "06-11" },
  ],

  t8: [
    { id: "u-lee",   name: "李國豪", phone: "0911-672-300", rbac: "ngo",   role: "member", status: "suspended", joined: "2026-05-20", last: "06-11", note: "同時為壯闊台灣成員（T-5 測試：一隊 active、一隊 suspended）" },
    { id: "m-pan",   name: "潘正豪", phone: "0958-114-672", rbac: "ngo", role: "admin",  status: "suspended", joined: "2026-05-06", last: "06-11" },
    { id: "m-ku",    name: "古秀英", phone: "0924-385-710", rbac: "ngo", role: "member", status: "suspended", joined: "2026-05-07", last: "06-11" },
    { id: "m-lo",    name: "羅竣文", phone: "0970-552-906", rbac: "ngo", role: "member", status: "suspended", joined: "2026-05-13", last: "06-10" },
  ],
  t9: [
    { id: "m-lih",   name: "李火旺", phone: "03-876-4420",  rbac: "ngo", role: "admin",  status: "inactive", joined: "2026-05-04", last: "06-05" },
    { id: "m-feng",  name: "馮國彰", phone: "0916-774-358", rbac: "ngo", role: "member", status: "inactive", joined: "2026-05-04", last: "06-04" },
  ],
};

// 平台級人員（無團隊的全域角色 — UI 上的歸納，並非一種團隊）
// ⚠️ 這裡的人「也可以」同時有團隊身份（2026-08-17：林承翰、張育成都加了測試隊），
//    兩者不衝突 —— 那正是切換清單要分兩組的原因。
window.MM_PLATFORM = [
  { id: "u-lin",  name: "林承翰", phone: "0908-211-345", rbac: "super",   status: "active",    assigned: "2026-05-01", last: "剛剛", self: true },
  { id: "p-chang", name: "張育成", phone: "0921-008-664", rbac: "auditor", status: "active",    assigned: "2026-06-04", last: "今天 09:18" },
  { id: "p-su",   name: "蘇怡靜", phone: "0939-457-201", rbac: "auditor", status: "active",    assigned: "2026-06-11", last: "今天 10:02" },
  { id: "p-kao",  name: "高世豪", phone: "0911-655-090", rbac: "auditor", status: "suspended", assigned: "2026-05-20", last: "06-02" },
];

// 審核佇列。audience: "super"（平台角色申請）或 teamId（加入該團隊的申請）
window.MM_QUEUE = [
  { id: "q1", audience: "super", kind: "platform-role", applicant: "蔡承佑", phone: "0922-417-836", current: "前台帳號", request: "資料檢核員", time: "今天 09:12", note: "災後曾於光復鄉協助資料核對 14 天，熟悉站點與單據格式。" },
  { id: "q2", audience: "super", kind: "platform-role", applicant: "鄭文龍", phone: "0933-805-114", current: "前台帳號", request: "政府",   time: "昨天 17:40", note: "花蓮縣消防局第三大隊聯絡官，需檢視轄區任務單據。" },
  { id: "q3", audience: "t2",    kind: "join-team",     applicant: "王俊凱", phone: "0987-226-905", request: "加入「壯闊台灣」", time: "今天 08:55", note: "光復在地居民，平日可支援上午時段清淤與物資搬運。" },
  { id: "q4", audience: "t2",    kind: "qr-pending",    applicant: "馬耀·谷木", phone: "0905-371-448", request: "掃描成員邀請 QR", time: "今天 10:21", note: "已完成手機 OTP 驗證，等待該隊管理員確認。" },
];

// Audit Log。scope: "platform" 或 teamId；cat: team / member / rbac / qr
window.MM_AUDIT = [
  { id: "a1",  time: "今天 10:21", actor: "系統",   action: "馬耀·谷木 使用成員邀請 QR（壯闊台灣）→ 進入待確認佇列", cat: "qr",     scope: "t2" },
  { id: "a2",  time: "今天 10:05", actor: "黃曉芳", action: "產生成員邀請 QRCode（多次 · 上限 50 · 24 小時）",        cat: "qr",     scope: "t2" },
  { id: "a3",  time: "今天 09:40", actor: "林承翰", action: "建立團隊「光復福安宮志工隊」並產生 團隊邀請 QR（72 小時）", cat: "team", scope: "platform" },
  { id: "a4",  time: "昨天 18:12", actor: "林承翰", action: "暫停團隊「馬太鞍溪志工聯隊」｜理由：Zone 認領衝突調查中", cat: "team",  scope: "platform", tone: "danger" },
  { id: "a5",  time: "昨天 16:30", actor: "林承翰", action: "指派 蘇怡靜 為資料檢核員",                            cat: "rbac",   scope: "platform" },
  { id: "a6",  time: "06-09 14:02", actor: "王秀蘭", action: "邀請 陳小傑 加入 慈濟基金會（團隊角色：成員 · 平台角色隨之為非政府組織）", cat: "member", scope: "t1" },
  { id: "a7",  time: "06-08 11:46", actor: "黃曉芳", action: "將 林雅婷 設為團隊內暫停｜理由：借調離隊",             cat: "member", scope: "t2" },
  { id: "a8",  time: "06-07 09:00", actor: "系統",   action: "團隊邀請 QR（鳳林鎮義消協會）已到期，自動失效",         cat: "qr",     scope: "platform" },
  { id: "a9",  time: "06-06 15:27", actor: "林承翰", action: "解散團隊「鳳林鎮義消協會」｜原 Ticket 保留並標示來源",   cat: "team",   scope: "platform", tone: "danger" },
  { id: "a10", time: "06-05 10:14", actor: "王秀蘭", action: "將 黃曉芳 加入 慈濟基金會（團隊角色：成員）",      cat: "member", scope: "t1" },
  { id: "a11", time: "06-04 13:50", actor: "林承翰", action: "指派 張育成 為資料檢核員",                            cat: "rbac",   scope: "platform" },
  { id: "a12", time: "05-28 08:30", actor: "林承翰", action: "建立團隊「壯闊台灣」並產生 團隊邀請 QR（72 小時）",     cat: "team",   scope: "platform" },
];
