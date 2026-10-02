// wg-terms.js — 命名 token（四個後台頁面共用的唯一真相來源）
//
// 2026-08-17 Sucre 裁示：全中文，token 化收進單一檔案。
//
// ⚠️ 為什麼要有這支檔案：
//    在此之前，`Super Admin` / `Team Admin` / `Data Auditor` / `一般使用者`
//    這幾個字串**硬寫在 25 個檔案、112 處**。所以「一般使用者」是中文、其他四個
//    是英文，不是有人決定的，是 112 處各寫各的自然結果。
//    新增這類東西時不要再讓頁面自己寫一份。
//
// ══ 🔒 硬規則：團隊角色永遠不單獨出現 ══════════════════════════════════════
//
//    團隊角色（管理員 / 成員）**一律帶團隊名前綴**：`壯闊台灣 · 管理員`。
//    **不會有任何畫面只寫「管理員」三個字。**
//
//    理由：「超級管理員」與「管理員」共用後三個字。「超級」是很強的前綴，但災防
//    現場快速掃視時仍可能只讀到後三字，而這兩個身份的權力天差地遠。
//
//    唯一的例外是成員列表的角色欄 —— 該情境有欄位標題（「本隊角色」）撐著。
//    要把它搬去別的地方用之前，先回來讀這條規則。
//    → 需要完整標籤時一律用 `wgIdentityLabel()`，不要自己拼字串。
//
(function () {

  // ── 平台角色 ────────────────────────────────────────────────────────────
  // ⚠️ 沒有 `general_user`。2026-08-17 Sucre：「沒有這個人！！！前台的人也不會知道
  //    自己是這個人，他只在乎自己有沒有帳號，沒有 UI 呈現。」
  //    邏輯：進得了後台就一定是因為有某個身份（平台角色或某隊成員），所以後台
  //    任何一份名單裡都不可能出現「一般使用者」。前台則只有一顆按鈕
  //    （有後台身份→「前往後台」／沒有→「申請成為後台人員」），表達的是「有沒有」
  //    不是「叫什麼」。`general_user` 在後端 `roles` 表繼續存在，但不在任何畫面出現。
  const PLATFORM_ROLES = {
    super:   { label: "超級管理員", tone: "primary"   },
    gov:     { label: "政府",       tone: "secondary" },
    ngo:     { label: "非政府組織", tone: "info"      },
    // 「檢核」不是「稽核」：8/14 裁示給這角色的權限是「唯讀 ＋ 重複單的標記／
    // 欄位級合併／忽略」，那是檢查資料本身對不對，不是查別人的帳。
    // 「稽核」在中文帶監督人的意味，會讓現場單位以為他是來查他們的。
    auditor: { label: "資料檢核員", tone: "warning"   },
  };

  // ── 團隊角色 ────────────────────────────────────────────────────────────
  // 2026-08-14 裁示：移除 Guest，只留這兩種。
  const TEAM_ROLES = {
    admin:  { label: "管理員", tone: "primary"  },
    member: { label: "成員",   tone: "neutral"  },
  };

  // ── 團隊類型 ────────────────────────────────────────────────────────────
  // 2026-08-17 裁示：**兩值**，與 ERD 的 `teams.type` 一致。「其他」拿掉 ——
  // 8/14 裁示「平台角色由所屬 Team 的 type 推導」，而「其他」推不出任何平台角色。
  const TEAM_TYPES = {
    gov: { label: "政府",       tone: "secondary" },
    ngo: { label: "非政府組織", tone: "info"      },
  };

  // 舊資料相容：假資料裡曾用中文與「其他」當 type，統一正規化成兩值。
  const TYPE_ALIAS = {
    NGO: "ngo", ngo: "ngo", 非政府組織: "ngo", 其他: "ngo",
    政府: "gov", gov: "gov", GOV: "gov", Government: "gov",
  };

  // 平台角色 ← 團隊類型的推導（8/14 裁示）
  const PLATFORM_FROM_TYPE = { ngo: "ngo", gov: "gov" };

  // 只有這兩個平台角色是「獨立於任何團隊」的身份，會在切換清單裡自成一列。
  // 政府／非政府組織由所屬團隊推導，內含在該隊那一列裡，不獨立。
  const STANDALONE_PLATFORM_ROLES = ["super", "auditor"];

  // 切換器每一列的副標：這個身份能做什麼。
  // 2026-08-17 D-3 乾淨切之後，越權的功能整個不 render，使用者找不到功能時
  // 答案要在他正要按的那個選單裡。
  const IDENTITY_HINTS = {
    super:        "全平台管理 · 成員與權限 · 平台角色審核",
    auditor:      "資料檢核 · 重複單標記與合併",
    team_admin:   "管理本隊成員 · 審核加入申請 · 團隊紀錄",
    team_member:  "檢視本隊 · 回報任務進度",
  };

  function normalizeType(t) {
    if (!t) return null;
    return TYPE_ALIAS[t] || (TEAM_TYPES[t] ? t : null);
  }

  // ── 對外 API ────────────────────────────────────────────────────────────
  Object.assign(window, {
    WG_TERMS: { PLATFORM_ROLES, TEAM_ROLES, TEAM_TYPES, IDENTITY_HINTS, STANDALONE_PLATFORM_ROLES },

    // 平台角色標籤。查不到回 "—"（對不到就是資料錯，不該靜靜顯示一個假身份）
    wgPlatformLabel: (key) => (PLATFORM_ROLES[key] ? PLATFORM_ROLES[key].label : "—"),
    wgPlatformTone:  (key) => (PLATFORM_ROLES[key] ? PLATFORM_ROLES[key].tone : "neutral"),

    // 團隊角色標籤。⚠️ 單獨使用前先讀本檔開頭的硬規則
    wgTeamRoleLabel: (role) => (TEAM_ROLES[role] ? TEAM_ROLES[role].label : "—"),
    wgTeamRoleTone:  (role) => (TEAM_ROLES[role] ? TEAM_ROLES[role].tone : "neutral"),

    wgTeamTypeKey:   normalizeType,
    wgTeamTypeLabel: (t) => { const k = normalizeType(t); return k ? TEAM_TYPES[k].label : "—"; },
    wgTeamTypeTone:  (t) => { const k = normalizeType(t); return k ? TEAM_TYPES[k].tone : "neutral"; },

    // 團隊類型 → 平台角色（8/14 裁示）
    wgPlatformFromType: (t) => PLATFORM_FROM_TYPE[normalizeType(t)] || null,

    // 身份的完整標籤 —— 這是唯一該用來顯示身份的函式，前綴規則在這裡強制執行
    wgIdentityLabel: function (identity) {
      if (!identity) return "—";
      if (identity.kind === "platform") return window.wgPlatformLabel(identity.role);
      return `${identity.teamName} · ${window.wgTeamRoleLabel(identity.role)}`;
    },

    wgIdentityHint: function (identity) {
      if (!identity) return "";
      if (identity.kind === "platform") return IDENTITY_HINTS[identity.role] || "";
      return IDENTITY_HINTS[identity.role === "admin" ? "team_admin" : "team_member"] || "";
    },
  });
})();
