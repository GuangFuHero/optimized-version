// st-data.js — 設定頁的資料層（2026-10-05）
//
// 對應後端（ERD @ main，2026-10-05 查）：
//   這次災害   → project_settings（單列）：name / disaster_types / started_at
//   災害類型   → disaster_types：key（建立後不能改）/ label / is_active
//   災害欄位   → ticket_property_config：property_name / label / data_type / enum_options /
//                unit / disaster_types / hint / is_active        —— 沒有 sort_order（ADR-248）
//   需求欄位   → task_property_config：task_type ＋ 同上 ＋ sort_order，沒有 hint
//   站點欄位   → station_property_config：station_type ＋ 同上 ＋ sort_order，沒有 hint
//
// ⚠️ 三張欄位設定表**都沒有「必填」欄位**。TM-CF-106／111 的必填度在後端無處可存，
//    所以本頁不做必填。要問後端。
// ⚠️ project_settings 沒有建立者欄位 → 不顯示「開站人」（2026-10-03 討論）。
// ⚠️ shortName（側邊欄簡稱）後端沒有，是原型自己加的顯示用欄位。
// ⚠️ 前端 vendored schema.graphql 仍是舊版（沒有災害類型、沒有災害欄位），
//    本頁全部存在 localStorage（鍵 wg.settings.v1），套用邏輯在 wg-event.js 的 wgApplySettings。
(function () {
  const KEY = "wg.settings.v1";

  // 後端 data_type 六種 → 畫面上的中文
  const ST_DATA_TYPES = {
    text:          { label: "短文字", hint: "一行字，例如門牌號" },
    long_text:     { label: "長文字", hint: "可以寫好幾行，例如現場描述" },
    number:        { label: "數字",   hint: "只能填數字，可以加單位，例如 cm" },
    boolean:       { label: "是／否", hint: "只有兩個選擇" },
    single_select: { label: "單選",   hint: "從選項裡挑一個" },
    multi_select:  { label: "多選",   hint: "從選項裡挑好幾個" },
  };

  // 需求類型（ticket_tasks.task_type，後端三值）
  const ST_TASK_TYPES = {
    rescue: { label: "搜救" },
    hr:     { label: "人力" },
    supply: { label: "物資" },
  };

  // 站點類型（與 station-v2/station-data.jsx 的 TYPE 同一份；本頁不載入那支，故鏡射一份）
  // ⚠️ 兩份要一起改。
  const ST_STATION_TYPES = {
    shelter:  { label: "避難收容" },
    supply:   { label: "物資集散" },
    medical:  { label: "醫療站" },
    water:    { label: "供水點" },
    charging: { label: "充電/通訊" },
    other:    { label: "其他" },
  };

  // 自訂災害類型的顏色輪替（避開品牌橘與危險紅）
  const ST_CUSTOM_COLORS = ["#9D174D", "#0F766E", "#4338CA", "#A16207", "#BE185D", "#334155"];

  // ── 初始值 ─────────────────────────────────────────────────────────────
  function seed() {
    const act = window.TK_ACTIVATION || {};
    return {
      event: {
        name: act.name || "",
        shortName: act.shortName || "",
        startedAt: act.startedAt || "",
        types: (act.types || []).slice(),
      },
      // 災害類型清單：照 ERD disaster_types 的 key 範例六種
      vocab: [
        { key: "flood",      label: "水災",   active: true },
        { key: "landslide",  label: "土石流", active: true },
        { key: "earthquake", label: "地震",   active: true },
        { key: "fire",       label: "火災",   active: true },
        { key: "epidemic",   label: "流行病", active: true },
        { key: "radiation",  label: "輻射",   active: true },
      ],
      // 欄位：示範資料。災害欄位取自 tk-data.js 的 TK_DISASTER_FIELDS（同一欄位跨災害只存一份）；
      // 需求欄位取自 TM-CF-120 的出廠起始欄位（選項正典沒列，故留空）；站點欄位正典沒有，留空。
      fields: [
        { id: "f1", kind: "disaster", key: "water_depth",  label: "積水深度", dataType: "number", unit: "cm", options: [], hint: "不可為了量測進入危險區", disasterTypes: ["flood"], active: true },
        { id: "f2", kind: "disaster", key: "water_trend",  label: "水位趨勢", dataType: "single_select", options: ["上升", "持平", "退去"], disasterTypes: ["flood"], active: true },
        { id: "f3", kind: "disaster", key: "road_access",  label: "聯外道路", dataType: "single_select", options: ["中斷", "單線可通", "正常"], disasterTypes: ["flood", "landslide"], active: true },
        { id: "f4", kind: "disaster", key: "power_status", label: "電力",     dataType: "single_select", options: ["停電", "不穩", "正常"], disasterTypes: ["flood"], active: true },
        { id: "f5", kind: "disaster", key: "bury_extent",  label: "掩埋範圍", dataType: "text", options: [], hint: "例如 1F 全埋、車道", disasterTypes: ["landslide"], active: true },
        { id: "f6", kind: "disaster", key: "slope_risk",   label: "二次崩塌風險", dataType: "single_select", options: ["高", "中", "低"], disasterTypes: ["landslide"], active: true },

        { id: "t1", kind: "task", scope: "rescue", key: "trapped_count", label: "受困人數", dataType: "number", unit: "人", options: [], disasterTypes: [], active: true, order: 1 },
        { id: "t2", kind: "task", scope: "rescue", key: "floor",         label: "樓層",     dataType: "number", unit: "", options: [], disasterTypes: [], active: true, order: 2 },
        { id: "t3", kind: "task", scope: "rescue", key: "door_no",       label: "門牌號",   dataType: "text", options: [], disasterTypes: [], active: true, order: 3 },
        { id: "t4", kind: "task", scope: "rescue", key: "hazard_note",   label: "危害備註", dataType: "long_text", options: [], disasterTypes: [], active: true, order: 4 },
        { id: "t5", kind: "task", scope: "supply", key: "item_name",     label: "物品名稱", dataType: "text", options: [], disasterTypes: [], active: true, order: 1 },
        { id: "t6", kind: "task", scope: "hr",     key: "skills",        label: "需要技能", dataType: "multi_select", options: [], disasterTypes: [], active: true, order: 1 },
        { id: "t7", kind: "task", scope: "hr",     key: "vehicle_type",  label: "車輛類型", dataType: "single_select", options: [], disasterTypes: [], active: true, order: 2 },
        { id: "t8", kind: "task", scope: "hr",     key: "cleanup_type",  label: "清理類型", dataType: "single_select", options: [], disasterTypes: [], active: true, order: 3 },
        { id: "t9", kind: "task", scope: "hr",     key: "tools",         label: "需要工具", dataType: "multi_select", options: [], disasterTypes: [], active: true, order: 4 },
      ],
      log: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return seed();
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (window.wgApplySettings) window.wgApplySettings();
  }
  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  // 系統代碼規則：小寫英文、數字、底線，英文字母開頭（ERD：immutable lower-case code）
  function validKey(k) { return /^[a-z][a-z0-9_]{1,49}$/.test(k || ""); }

  function colorFor(state, key) {
    const d = window.TK_DISASTERS && window.TK_DISASTERS[key];
    if (d) return d.color;
    const customs = state.vocab.filter((v) => !(window.TK_DISASTERS || {})[v.key]).map((v) => v.key);
    const i = Math.max(0, customs.indexOf(key));
    return ST_CUSTOM_COLORS[i % ST_CUSTOM_COLORS.length];
  }

  Object.assign(window, {
    ST_KEY: KEY, ST_DATA_TYPES, ST_TASK_TYPES, ST_STATION_TYPES, ST_CUSTOM_COLORS,
    stSeed: seed, stLoad: load, stSave: save, stReset: reset, stValidKey: validKey, stColorFor: colorFor,
  });
})();
