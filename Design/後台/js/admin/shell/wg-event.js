// wg-event.js — 事件層脈絡的共用來源（三個後台頁面共用）
//
// 任務管理頁的 tk-data.js 已定義 TK_ACTIVATION / TK_DISASTERS，
// 本檔在它們不存在時才補上，所以載入順序不影響任務管理頁的既有行為。
//
// ⚠️ 後端 ER diagram 目前沒有 event / activation 表，這裡的事件名稱、
//    災害類型與起始時間都沒有資料來源。見 WG_EVENT_PENDING。
//    （regions／影響區域已於 2026-08-16 移除：後端確定沒有這個儲存欄位。）
(function () {
  if (!window.TK_DISASTERS) {
    window.TK_DISASTERS = {
      earthquake: { label: "地震",   color: "#E3791E", tint: "var(--color-bg-primary-subtle)" },
      fire:       { label: "火災",   color: "#D32F2F", tint: "var(--color-bg-danger-subtle)"  },
      flood:      { label: "水災",   color: "#2592B9", tint: "var(--color-bg-info-subtle)"    },
      typhoon:    { label: "颱風",   color: "#0E7490", tint: "#E0F2F7" },
      landslide:  { label: "土石流", color: "#92400E", tint: "#FBEEE4" },
      tsunami:    { label: "海嘯",   color: "#1D4ED8", tint: "#E4ECFD" },
      radiation:  { label: "輻射",   color: "#7C3AED", tint: "#F0E9FC" },
      war:        { label: "戰爭",   color: "#475569", tint: "#EEF1F5" },
      epidemic:   { label: "流行病", color: "#2E7D32", tint: "var(--color-bg-success-subtle)" },
      other:      { label: "其他",   color: "#64748B", tint: "var(--color-bg-neutral-subtle)" },
    };
  }

  if (!window.TK_ACTIVATION) {
    window.TK_ACTIVATION = {
      name: "花蓮馬太鞍溪堰塞湖專案",
      // shortName：側邊欄品牌列用的短名。全名放事件卡與 tooltip。
      // ⚠️ 這個欄位是為了顯示而加的，後端沒有；沒設就 fallback 到 name。
      shortName: "花蓮馬太鞍溪",
      types: ["flood", "landslide"],
      // regions 已移除（2026-08-16 Sucre：後端確定沒有這個儲存欄位，不要再顯示）
      startedAt: "2026-06-10 04:18",
      startedBy: "林承翰",
      pending: true,
    };
  }

  // 「事件層資料待確認」的統一說明（比照 tk-data.js 的 TK_PENDING.activation）
  // 用 getter，讓之後才載入的 tk-data.js 的 TK_PENDING 有機會覆蓋
  const FALLBACK_PENDING = {
    title: "事件層資料待確認",
    note: "後端 ER diagram 尚無 event／activation 表。事件名稱、事件層災害類型與起始時間目前無資料來源。",
  };
  Object.defineProperty(window, "WG_EVENT_PENDING", {
    get() { return (window.TK_PENDING && window.TK_PENDING.activation) || FALLBACK_PENDING; },
    configurable: true,
  });


  // ── RBAC 5 角色與原型人物（三頁共用）──────────────────────────────────
  // 任務管理頁的 tk-data.js 已定義同名物件；這裡同樣只在不存在時才補上。
  // 對應 Notion「🛠️ RBAC — admin portal permission matrix」(BE-RBAC-3) 的後端角色：
  //   super → super_admin ／ gov → gov_manager ／ auditor → data_auditor
  //   admin(Team Admin) 與 member(Team Member) 在 Notion 屬 team_role，
  //   該矩陣沒有替它們定義任何資源站點權限。
  // 2026-08-17：標籤改讀 wg-terms.js 的 token（四頁唯一真相來源）。
  // ⚠️ 這份是**成員管理／資源站點頁實際吃到的那一份**（它們不載入 tk-data.js），
  //    所以改 tk-data.js 而漏掉這裡的話，英文標籤仍會從這裡漏出來。
  // ⚠️ `admin` / `member` 其實是團隊角色被誤放進 rbac 欄位的歷史遺留，不是平台角色。
  //    依 8/14 裁示，隸屬 NGO 隊的人平台角色就是非政府組織。
  //    真正的平台角色請讀 wgActingPlatformRole()，不要讀 persona.rbac。
  if (!window.TK_RBAC) {
    window.TK_RBAC = {
      super:   { label: window.wgPlatformLabel("super"),   tone: window.wgPlatformTone("super")   },
      gov:     { label: window.wgPlatformLabel("gov"),     tone: window.wgPlatformTone("gov")     },
      admin:   { label: window.wgPlatformLabel("ngo"),     tone: window.wgPlatformTone("ngo")     },
      member:  { label: window.wgPlatformLabel("ngo"),     tone: window.wgPlatformTone("ngo")     },
      auditor: { label: window.wgPlatformLabel("auditor"), tone: window.wgPlatformTone("auditor") },
    };
  }
  if (!window.TK_PERSONAS) {
    window.TK_PERSONAS = {
      super:   { id: "u-lin",   name: "林承翰", rbac: "super",   title: "平台管理者",            team: null },
      gov:     { id: "u-wu",    name: "吳政憲", rbac: "gov",     title: "花蓮縣政府災防辦",       team: null },
      admin:   { id: "u-huang", name: "黃曉芳", rbac: "admin",   title: "壯闊台灣 · 管理員", team: "壯闊台灣" },
      member:  { id: "u-lee",   name: "李國豪", rbac: "member",  title: "壯闊台灣 · 成員",       team: "壯闊台灣" },
      auditor: { id: "u-chang", name: "張育成", rbac: "auditor", title: "資料檢核",            team: null },
    };
  }
  window.WG_ROLE_ORDER = ["super", "gov", "admin", "member", "auditor"];

  // 側邊欄／頂欄要顯示的災害類型清單，統一成 [{ key, isNew }]
  // 任務管理頁有自己的 actTypes（含 revoked 狀態），會覆寫這個預設值。
  // 事件已進行幾天。側邊欄第二行用這個取代「起始 2026-06-10 04:18」——
  // 絕對時間永遠不變、看一次就記得；會變的是天數。
  // ⚠️ 「進行中」這個狀態是推導出來的：一部署一事件，平台在跑就代表事件在跑。
  //    後端沒有 event.status 欄位，若日後有「已結束」狀態要回頭改這裡。
  window.wgEventDays = function (act) {
    const a = act || window.TK_ACTIVATION || {};
    if (!a.startedAt) return null;
    const t = Date.parse(String(a.startedAt).replace(" ", "T"));
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  };

  // 側邊欄要顯示的短名；沒設 shortName 就用全名
  window.wgEventShortName = function (act) {
    const a = act || window.TK_ACTIVATION || {};
    return a.shortName || a.name || "";
  };

  window.wgActiveDisasters = function () {
    return (window.TK_ACTIVATION.types || []).map((k) => ({ key: k, isNew: false }));
  };

  // ══ 身份層：一人多身份的「目前身份」（三個後台頁面共用）═════════════════
  //
  // 2026-08-15 PM 確認：切換入口在右上角人名選單，Audit Log 依切換後的身份記錄。
  //
  // 🔄 2026-08-17 Carol（PM 本人）覆蓋 8/15：
  //    8/15 記的是「切換就是切 team，清單裡只有團隊；沒有『平台身份』這種可切的
  //    選項 —— 那是 agent 自行加的，已移除」。
  //    但 PM 早在 8/14 就講過相反的話：「我現在很想讓他們都只能切割開，就有點像
  //    是切換帳號這樣……data auditor 審查資料那一頁應該只能有 data auditor /
  //    super admin 能使用，現在這樣重疊感覺很容易出問題」，8/17 重申「不知道他在
  //    下這個決策的時候是代表哪個身分」。Sucre 8/17：「Carol 為主，PM 本人」。
  //    → **平台身份加回清單。8/15 那條是資訊不全下的裁示，不是 agent 亂加。**
  //
  //    連帶廢除的是「自動升權」（舊模型：超出目前範圍就改用權力更大的那一個，
  //    例如 super admin ＋ 慈濟 member，讀慈濟用 member、指派 zone 用 super admin）。
  //    **切換現在是硬邊界** —— 越權的東西一律不 render，不是灰掉（D-3 乾淨切）。
  //
  // 這一層放在 wg-event.js 而不是任一頁，因為切換要跨頁生效：
  // 在任務管理切成慈濟，跳到資源站點或成員管理必須還是慈濟。
  // 三個後台是三個獨立 HTML 檔，所以狀態存 localStorage。

  // 團隊登錄表。成員管理頁載入 mm-data.js 後以 MM_TEAMS 為準；
  // 任務管理／資源站點頁沒有 mm-data.js，用這份最小副本。
  //
  // 2026-08-17 裁示：`type` 收成兩值 `gov` / `ngo`，與 ERD 一致。
  // t5 光復福安宮志工隊、t9 鳳林鎮義消協會原本是「其他」—— 兩者都不是政府機關
  // （義消協會是民間協會，不是消防局），歸 ngo。
  // 「其他」必須拿掉的原因：8/14 裁示平台角色由 team type 推導，而「其他」推不出
  // 任何平台角色（這個洞在「任務單頁面-改版-ClaudeDesign-Prompt.md」L365 就被指出過）。
  if (!window.WG_TEAMS) {
    window.WG_TEAMS = [
      { id: "t1", name: "慈濟基金會",       type: "ngo" },
      { id: "t2", name: "壯闊台灣",         type: "ngo" },
      { id: "t3", name: "台灣世界展望會",   type: "ngo" },
      { id: "t4", name: "中華民國紅十字會", type: "ngo" },
      { id: "t5", name: "光復福安宮志工隊", type: "ngo" },
      { id: "t6", name: "花蓮縣政府災防辦", type: "gov" },
      { id: "t8", name: "馬太鞍溪志工聯隊", type: "ngo" },
      { id: "t9", name: "鳳林鎮義消協會",   type: "ngo" },
    ];
  }
  window.wgTeams = function () { return window.MM_TEAMS || window.WG_TEAMS; };

  // 隸屬表：誰在哪些隊、各隊的 team 內角色是什麼。
  // ⚠️ 這是「一人多隊」的唯一真相來源。TK_PERSONAS 只有團隊名字、沒有各隊角色，
  //    任務管理／資源站點頁又不載入 mm-data.js 的名單，所以角色必須在這裡有一份，
  //    否則會推成「她在每一隊都是 Admin」。
  //
  // 2026-08-17 補測試資料（PRD §4.2）。原本只有黃曉芳一個多隊案例，而且兩隊都是
  // NGO —— 剛好繞開所有痛點，沒有任何一筆資料會讓身份模型爆開。補的組合：
  //   T-1 超級管理員 ＋ 某隊成員（林承翰）→ 切到成員身份時「成員與權限」要消失
  //   T-2 跨型別：NGO 隊管理員 ＋ 政府隊成員（黃曉芳）→ 驗平台角色跟不跟著切
  //   T-4 資料檢核員 ＋ 某隊成員（張育成）→ Carol 的原始需求：切到成員時檢核頁要消失
  //   T-5 一隊 active、一隊 suspended（李國豪 t2 + t8）
  //   T-6 3 個以上身份（林承翰：平台 ＋ 兩隊）
  if (!window.WG_MEMBERSHIPS) {
    window.WG_MEMBERSHIPS = {
      // T-1 / T-6：超級管理員 ＋ 兩隊 → 身份數 3
      "u-lin":   [{ id: "t1", role: "member" }, { id: "t5", role: "admin" }],
      "u-wu":    [{ id: "t6", role: "admin"  }],                       // 吳政憲 花蓮縣政府災防辦
      // T-2：NGO 隊管理員 ＋ 政府隊成員 → 跨型別，身份數 3
      "u-huang": [{ id: "t2", role: "admin"  }, { id: "t1", role: "member" }, { id: "t6", role: "member" }],
      // T-5：一隊 active、一隊 suspended
      "u-lee":   [{ id: "t2", role: "member" }, { id: "t8", role: "member" }],
      // T-4：資料檢核員 ＋ 某隊成員 → Carol 的原始需求
      "u-chang": [{ id: "t3", role: "member" }],
      "u-chen":  [{ id: "t1", role: "member" }],                       // 陳小傑（單一身份，切換器不出現）
    };
  }

  // 正規化成同一份隸屬清單。優先序：
  //   1. WG_MEMBERSHIPS[persona.id]（有各隊角色，三頁一致）
  //   2. persona.teams —— MM 形狀 [{id,role}] 或 TK 形狀 ["團隊名"]
  window.wgMemberships = function (persona) {
    if (!persona) return [];
    const reg = window.wgTeams();
    const shared = window.WG_MEMBERSHIPS[persona.id];
    const raw = shared !== undefined
      ? shared
      : (Array.isArray(persona.teams) ? persona.teams : (persona.team ? [persona.team] : []));
    return raw.map((t) => {
      const isObj = t && typeof t === "object";
      const key = isObj ? t.id : t;
      const def = reg.find((x) => x.id === key || x.name === key) || {};
      let role = isObj ? t.role : null;
      if (!role) {
        const roster = (window.MM_ROSTERS || {})[def.id] || [];
        const row = roster.find((m) => m.id === persona.id);
        role = row ? row.role : "member";     // 查不到一律 member，不要推成 admin
      }
      return {
        id: def.id || key, name: def.name || key, type: def.type || null,
        role,
      };
    }).filter((m) => m.name);
  };

  // ── 原型角色視角（三頁共用）─────────────────────────────────────────────
  // ⚠️ 2026-08-15：點「Teams」從任務管理跳到成員管理時會換人，原因是
  //    **角色視角是每頁各自的 state，預設值還不一樣**（任務管理 super／成員管理 teamadmin）。
  //    而且兩頁的角色 key 根本是兩套：
  //      TK_PERSONAS  super / gov / admin / member / auditor
  //      MM_PERSONAS  super / gov / teamadmin / visitor
  //    所以不能存 key，要存**人**（persona.id），各頁再自己對回去。
  //    對不到的（例如李國豪在成員管理沒有對應視角）就退回該頁預設，不會壞掉。
  const PERSONA_KEY = "wg.personaId";

  window.wgGetPersonaId = function () {
    try { return localStorage.getItem(PERSONA_KEY); } catch (e) { return null; }
  };
  window.wgSetPersonaId = function (id) {
    try { localStorage.setItem(PERSONA_KEY, id); } catch (e) {}
    window.dispatchEvent(new CustomEvent("wg:persona", { detail: { id } }));
  };
  // personas: 該頁的 PERSONAS 物件；fallback: 對不到時用哪個 key
  window.wgRoleKeyFor = function (personas, fallback) {
    const id = window.wgGetPersonaId();
    if (id) {
      const hit = Object.keys(personas).find((k) => personas[k].id === id);
      if (hit) return hit;
    }
    return fallback;
  };
  // React hook：回傳 [roleKey, setRoleKey]，setRoleKey 會同步寫回共用 store
  window.useWGRole = function (personas, fallback) {
    const [key, setKey] = React.useState(() => window.wgRoleKeyFor(personas, fallback));
    React.useEffect(() => {
      const on = () => setKey(window.wgRoleKeyFor(personas, fallback));
      window.addEventListener("wg:persona", on);
      const onStorage = (e) => { if (e.key === PERSONA_KEY) on(); };
      window.addEventListener("storage", onStorage);
      return () => { window.removeEventListener("wg:persona", on); window.removeEventListener("storage", onStorage); };
    }, []);
    return [key, (k) => { setKey(k); if (personas[k]) window.wgSetPersonaId(personas[k].id); }];
  };

  // ══ 身份清單 ═══════════════════════════════════════════════════════════
  //
  // ⚠️ 這個組成公式是**推導的，不是裁示**（PRD §3.1.1 / J-1）：
  //
  //     切換清單 = 不由 team 推導的平台角色（超級管理員 / 資料檢核員）
  //              + 每一筆 team membership（團隊 × 該隊角色）
  //
  //    推導的理由：8/14 裁示「加入 NGO Team 者平台角色即 NGO；加入 GOV Team 即
  //    Government」。既然政府／非政府組織這兩個平台角色**由所屬團隊推導**，它們
  //    就不是獨立身份，而是內含在對應 membership 那一列裡。真正獨立於任何團隊的
  //    只有超級管理員與資料檢核員 —— 剛好就是 MM_PLATFORM 那群「無 Team 的平台級
  //    人員」。與 POPO 8/14 說的「三種」吻合。
  //
  //    ✅ 這個模型**不用改 schema**：`user_role_assign` 出平台那幾列、`team_members`
  //       出團隊那幾列，前端合併即可。比「把 platform_rbac 塞進 team_members」更輕。
  //
  // 身份物件的形狀：
  //   { key, kind: "platform"|"team", role, platformRole, teamId?, teamName?, teamType? }
  //   key：平台身份是 "@super" / "@auditor"；團隊身份就是 team id（"t1"）。
  //        用 @ 前綴讓兩者不可能撞號。
  window.wgIdentities = function (persona) {
    if (!persona) return [];
    const out = [];
    // 平台身份列（只有 super / auditor 會產生）
    if ((window.WG_TERMS.STANDALONE_PLATFORM_ROLES || []).indexOf(persona.rbac) >= 0) {
      out.push({
        key: "@" + persona.rbac, kind: "platform",
        role: persona.rbac, platformRole: persona.rbac,
      });
    }
    // 團隊身份列
    window.wgMemberships(persona).forEach((m) => {
      out.push({
        key: m.id, kind: "team", role: m.role,
        // 平台角色由團隊型別推導（8/14 裁示）
        platformRole: window.wgPlatformFromType(m.type),
        teamId: m.id, teamName: m.name, teamType: window.wgTeamTypeKey(m.type),
        status: m.status || null,
      });
    });
    return out;
  };

  const ACTING_KEY = (uid) => "wg.actingIdentity." + (uid || "anon");

  // 目前身份的 key。null ＝ 這個人沒有任何身份（進不了後台）
  window.wgGetActingIdentityKey = function (persona) {
    const ids = window.wgIdentities(persona);
    if (!ids.length) return null;
    let stored = null;
    try { stored = localStorage.getItem(ACTING_KEY(persona && persona.id)); } catch (e) { stored = null; }
    if (stored && ids.some((i) => i.key === stored)) return stored;
    return ids[0].key;   // 預設第一個（平台身份優先，因為它排在前面）
  };

  // 目前身份的完整物件；null ＝ 沒有任何身份
  window.wgActingIdentity = function (persona) {
    const key = window.wgGetActingIdentityKey(persona);
    if (!key) return null;
    return window.wgIdentities(persona).find((i) => i.key === key) || null;
  };

  window.wgSetActingIdentity = function (persona, key) {
    if (!key) return;
    try { localStorage.setItem(ACTING_KEY(persona && persona.id), key); } catch (e) {}
    window.dispatchEvent(new CustomEvent("wg:identity", {
      detail: { userId: persona && persona.id, key },
    }));
  };

  // React hook：三頁的 shell 都用這一支，切換後同頁即時重繪，跨頁靠 localStorage
  window.useWGActingIdentity = function (persona) {
    const uid = persona && persona.id;
    const read = () => window.wgActingIdentity(persona);
    const [identity, setIdentity] = React.useState(read);
    React.useEffect(() => { setIdentity(read()); }, [uid]);
    React.useEffect(() => {
      const on = (e) => { if (!e.detail || e.detail.userId === uid) setIdentity(read()); };
      const onStorage = (e) => { if (e.key === ACTING_KEY(uid)) setIdentity(read()); };
      window.addEventListener("wg:identity", on);
      window.addEventListener("storage", onStorage);
      return () => { window.removeEventListener("wg:identity", on); window.removeEventListener("storage", onStorage); };
    }, [uid]);
    return [identity, (key) => window.wgSetActingIdentity(persona, key)];
  };

  // ── 相容層（既有呼叫點沿用）─────────────────────────────────────────────
  // 目前身份是團隊 → 回該隊 id；是平台身份 → 回 null。
  // ⚠️ 語意變了：8/15 時 null 只代表「這個人沒有任何團隊」，現在也可能代表
  //    「他有團隊，但目前切在平台身份」。要區分請用 wgActingIdentity()。
  window.wgGetActingTeamId = function (persona) {
    const id = window.wgActingIdentity(persona);
    return id && id.kind === "team" ? id.teamId : null;
  };
  window.wgActingMembership = function (persona) {
    const id = window.wgActingIdentity(persona);
    if (!id || id.kind !== "team") return null;
    return window.wgMemberships(persona).find((m) => m.id === id.teamId) || null;
  };
  window.wgSetActingTeamId = function (persona, teamId) {
    if (teamId) window.wgSetActingIdentity(persona, teamId);
  };
  window.useWGActingTeam = function (persona) {
    const [identity, setIdentity] = window.useWGActingIdentity(persona);
    return [identity && identity.kind === "team" ? identity.teamId : null, setIdentity];
  };

  // 目前身份的「有效平台角色」—— 乾淨切（D-3）的判斷依據。
  // 導覽過濾、按鈕 render、API 授權全部讀這一個值，不要再讀 persona.rbac。
  window.wgActingPlatformRole = function (persona) {
    const id = window.wgActingIdentity(persona);
    return id ? id.platformRole : null;
  };
})();
