// an-data.js — 緊急公告的共用狀態（EA-FEAT-001）
//
// 後台是多個獨立 HTML 檔、前台又是另一批，所以公告存 localStorage，
// 並以 storage 事件 ＋ 同頁自訂事件同步 —— 這是原型達成
// 「關閉即刻生效」（EA-AB-151 / 裁示 D-6）的方式。
//
// ⚠️ 正式版做不到這樣。現有更新機制是輪詢（平常 60 秒／災害期間 15〜30 秒），
//    輪詢做不到「即刻」，需要伺服器推送（SSE／WebSocket）。而且
//    「災害期間」從來沒有被定義過，ERD 也沒有這個欄位 —— 舊問題。見 feature.md D-6。
//
// ⚠️ announcements 表目前只有 active / display_order / content 三欄。
//    頻道、時效、發布者、發布時間**全部沒有欄位**，2026-08-29 裁示 D-2 交由工程師處理。
//    本檔的形狀是提給後端的參考。
(function () {
  const KEY = "wg.announcements.v3";     // v3：每個頻道最多一則（裁示 D-12），拿掉 display_order

  // ══════════════════════════════════════════════════════════════════════
  // 🔒 裁示 D-12（2026-09-04）—— 本檔最重要的一條不變式
  //
  //    **每個頻道同一時間最多只有一則公告。前台一則，後台一則。**
  //    沒有並存、沒有排序、沒有「另有 N 則」。發新的就是取代舊的。
  //
  //    Sucre：「從來不存在並存。前台只能顯示一個公告，後台也只能顯示一個。」
  //
  //    連帶刪掉的東西（不是遺漏，是不需要）：
  //      · display_order —— 一則不需要排序。**請告訴後端這個欄位本 Feature 用不到。**
  //      · 「保留並存」的選項與勾選框
  //      · 橫幅的「另有 N 則」展開
  //    「前後台同時」那一則同時佔用兩個頻道的位置。
  // ══════════════════════════════════════════════════════════════════════
  const EVT = "wg:announce";

  // ── 常數 ────────────────────────────────────────────────────────────────
  // EA-AB-121：50 字，以 Unicode 字符計（不是位元組）。
  // ⚠️ 表 25 原文寫「50 字符」，判定為 50 個字 —— 若指 byte，UTF-8 中文只剩 16 字。
  //    未確認，見 feature.md Q3。
  window.AN_MAX = 50;

  // EA-AB-102 / EA-AB-134：頻道，各自要寫出「誰看得到」。
  //
  // 🔒 裁示（2026-09-04）：「同時」是**一則公告帶三個值中的一個**，不是兩則。
  //    關閉就是關掉這一則，前後台同時消失；沒有「只關前台」。
  //    理由：實務上「對外解除、對內繼續協調」的那句話本來就是新內容，
  //    要重打一則後台的，不是保留原文只關一邊。
  //    → 資料層只要 target 一個欄位三個值，不需要 batch_id 或多對多。
  window.AN_REALMS = {
    site: {
      key: "site", label: "前台", icon: "Globe", tone: "warning",
      who: "所有人都看得到，包含未登入的訪客。發出後無法收回已被看到的內容。",   // 裁示 D-4
    },
    admin: {
      key: "admin", label: "後台", icon: "Lock", tone: "info",
      // 裁示 D-5：不再細分單位。這句話是「情境舉例二做不到」唯一的防線（EA-AB-134）。
      who: "所有後台使用者都看得到，包含其他單位與其他團隊。",
    },
    both: {
      key: "both", label: "前後台同時", icon: "Globe2", tone: "secondary",
      who: "前台所有人（含未登入的訪客）與所有後台使用者都看得到。發出後無法收回已被看到的內容。",
    },
  };

  // EA-AB-152（裁示 D-7「發布時可以選擇時效」）
  // ⚠️ 預設 24 小時是我取的，比照 MAP-ZD-152（危險區）。D-7 沒有指定預設值。
  window.AN_TTL_OPTIONS = [
    { h: 1, label: "1 小時" },
    { h: 3, label: "3 小時" },
    { h: 6, label: "6 小時" },
    { h: 12, label: "12 小時" },
    { h: 24, label: "24 小時" },
    { h: 72, label: "3 天" },
    { h: 0, label: "不自動到期" },
  ];
  window.AN_TTL_DEFAULT = 24;

  // ── 字數（EA-AB-121）──────────────────────────────────────────────────
  // [...s] 依 Unicode 字符切，不是 s.length（後者會把 emoji 算成 2）。
  window.anCount = function (s) { return [...String(s || "")].length; };

  // ── 讀寫 ────────────────────────────────────────────────────────────────
  //
  // 每一則公告自己帶 events[]（EA-AB-161／162）。
  // 2026-09-04 起「已關閉清單」與「操作紀錄」不再是兩塊 UI ——
  // 它們本來就是同一份資料的兩種寫法，現在合併成一條時間軸（anHistory）。
  function seed() {
    const now = Date.now();
    const ev = (at, actor, kind, note) => ({ at, actor, kind, note: note || "" });
    return [
      // 啟用中：前台一則、後台一則 —— 這是上限，不是巧合
      { id: "A-01", realm: "site", text: "大平村上游土石流警報，志工請暫停前往，改由中正路集結",
        active: true, by: "吳政憲", at: now - 26 * 60000, expiresAt: now + 22 * 3600000,
        events: [ev(now - 26 * 60000, "吳政憲", "publish")] },
      { id: "A-02", realm: "admin", text: "今日 18:00 前需回報各隊在場人數，未回報者由縣府直接致電",
        active: true, by: "吳政憲", at: now - 95 * 60000, expiresAt: now + 5 * 3600000,
        events: [ev(now - 95 * 60000, "吳政憲", "publish")] },
      { id: "A-03", realm: "site", text: "光復車站臨時接駁已恢復，班距 20 分鐘",
        active: false, by: "林承翰", at: now - 3 * 86400000, expiresAt: null,
        events: [ev(now - 3 * 86400000, "林承翰", "publish"),
                 ev(now - 2 * 86400000, "林承翰", "close")] },
      { id: "A-04", realm: "both", text: "馬太鞍溪水位回落，一級開設調整為二級",
        active: false, by: "林承翰", at: now - 5 * 86400000, expiresAt: now - 4 * 86400000,
        events: [ev(now - 5 * 86400000, "林承翰", "publish"),
                 ev(now - 4 * 86400000, "系統", "expire")] },
    ];
  }

  window.anRead = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { const s = seed(); localStorage.setItem(KEY, JSON.stringify(s)); return s; }
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : seed();
    } catch (e) { return seed(); }
  };

  window.anWrite = function (list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(EVT)); } catch (e) {}
  };

  // 同頁靠自訂事件、跨頁靠 storage 事件 —— 兩個都要，缺一個就有一邊不同步。
  window.anSubscribe = function (fn) {
    const on = () => fn();
    const onStorage = (e) => { if (e.key === KEY) fn(); };
    window.addEventListener(EVT, on);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", onStorage); };
  };

  // ── 到期（EA-AB-152 / EA-AB-163）────────────────────────────────────────
  // 到期與被人關掉，事後看紀錄必須分得出來 —— 所以 kind 是 expire 不是 close。
  window.anPrune = function () {
    const now = Date.now();
    const list = window.anRead();
    let hit = false;
    const next = list.map((a) => {
      if (a.active && a.expiresAt && a.expiresAt <= now) {
        hit = true;
        return { ...a, active: false,
          events: [...a.events, { at: a.expiresAt, actor: "系統", kind: "expire", note: "" }] };
      }
      return a;
    });
    if (hit) window.anWrite(next);
    return hit;
  };

  // ── 查詢 ────────────────────────────────────────────────────────────────
  function live(a) { return a.active && (!a.expiresAt || a.expiresAt > Date.now()); }

  // 某個場域現在顯示的那一則 —— **最多一則**（D-12），沒有就是 null。
  // 「同時」那一則同時佔用兩個頻道的位置。
  window.anCurrent = function (realm) {
    const hit = window.anRead()
      .filter((a) => live(a) && (a.realm === realm || a.realm === "both"))
      .sort((x, y) => y.at - x.at);       // 理論上只有一筆；萬一資料層沒守住不變式，取最新的
    return hit[0] || null;
  };

  // 相容舊呼叫點：回傳 0 或 1 筆的陣列
  window.anActive = function (realm) {
    const c = window.anCurrent(realm);
    return c ? [c] : [];
  };

  // 給管理頁用：目前啟用中的全部（前台的 ＋ 後台的，最多兩則；「同時」則只有一則）
  window.anActiveAll = function () {
    const seen = new Set();
    return [window.anCurrent("site"), window.anCurrent("admin")]
      .filter((a) => a && (seen.has(a.id) ? false : (seen.add(a.id), true)));
  };

  // 一條時間軸，取代原本分開的「已關閉清單」與「操作紀錄」。
  // EA-AB-162：留當時的文字全文，不是指向公告的 id —— 所以這裡把文字攤平帶上。
  window.anHistory = function () {
    const out = [];
    window.anRead().forEach((a) => {
      a.events.forEach((e) => out.push({
        ...e, id: a.id + "-" + e.at + "-" + e.kind,
        realm: a.realm, text: a.text, stillLive: live(a),
      }));
    });
    return out.sort((x, y) => y.at - x.at);
  };

  window.AN_EVENT_LABEL = {
    publish:   { label: "發布", icon: "Megaphone", tone: "primary" },
    close:     { label: "手動關閉", icon: "CircleSlash", tone: "neutral" },
    expire:    { label: "時效到期", icon: "Timer", tone: "neutral" },
    extend:    { label: "延長時效", icon: "TimerReset", tone: "neutral" },
    // EA-AB-158：「被新公告取代」與「有人手動關掉」在事後必須分得出來 ——
    // 前者是發布新公告的副作用，後者是一個獨立的判斷。混在一起就查不出
    // 那則警告到底是誰決定要撤的。
    supersede: { label: "被新公告取代", icon: "Replace", tone: "neutral" },
  };

  // ── 發布會取代掉誰（EA-AB-157a，裁示 D-10／D-12）─────────────────────────
  // 每個頻道最多一則，所以：發前台 → 最多 1 則被取代；發後台 → 最多 1 則；
  // 發「同時」→ 最多 2 則（前台那則與後台那則，若同為一則 both 則去重成 1）。
  // ⚠️ 這不是「可能會撞到」，是**一定會取代** —— 沒有並存這個選項（D-12）。
  window.anClashing = function (realm) {
    if (realm === "both") {
      const seen = new Set();
      return [window.anCurrent("site"), window.anCurrent("admin")]
        .filter((a) => a && (seen.has(a.id) ? false : (seen.add(a.id), true)));
    }
    const c = window.anCurrent(realm);
    return c ? [c] : [];
  };

  // ── 動作 ────────────────────────────────────────────────────────────────
  // 發布 = 取代。**一律**關閉目標頻道現有的那一則（D-12），沒有選項。
  // 這條不變式由這裡維持：寫入新的同時關掉舊的，是同一個動作。
  // ⚠️ 正式版必須在同一個 transaction 內 —— 中途失敗會留下「舊的關了、新的沒發出去」
  //    的空窗，在災害中那是最糟的狀態。見 validation.md B-10。
  window.anPublish = function (realm, text, ttlHours, by) {
    const kill = new Set(window.anClashing(realm).map((a) => a.id));
    const list = window.anRead();
    const now = Date.now();
    const item = {
      id: "A-" + String(now).slice(-6),
      realm, text: String(text).trim(), active: true, by, at: now,
      expiresAt: ttlHours ? now + ttlHours * 3600000 : null,
      events: [{ at: now, actor: by, kind: "publish", note: "" }],
    };
    const now2 = Date.now();
    const prev = list.map((a) => (kill.has(a.id) && a.active
      ? { ...a, active: false,
          events: [...a.events, { at: now2, actor: by, kind: "supersede",
            note: `由「${item.text}」取代` }] }
      : a));
    window.anWrite([...prev, item]);
    return item;
  };

  // EA-AB-155：關閉不是刪除。裁示（2026-09-04）：both 那則關掉就是兩邊一起消失。
  window.anClose = function (id, by) {
    window.anWrite(window.anRead().map((a) => a.id === id
      ? { ...a, active: false, events: [...a.events, { at: Date.now(), actor: by, kind: "close", note: "" }] }
      : a));
  };

  // EA-AB-153：到期前可延長。
  window.anExtend = function (id, hours, by) {
    window.anWrite(window.anRead().map((a) => a.id === id
      ? { ...a, expiresAt: (a.expiresAt || Date.now()) + hours * 3600000,
          events: [...a.events, { at: Date.now(), actor: by, kind: "extend", note: `＋${hours} 小時` }] }
      : a));
  };

  // ── 顯示用小工具 ────────────────────────────────────────────────────────
  window.anClock = function (ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  window.anLeft = function (ms) {
    if (!ms) return "不自動到期";
    const d = ms - Date.now();
    if (d <= 0) return "已到期";
    const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000);
    return h ? `剩 ${h} 小時 ${m} 分` : `剩 ${m} 分`;
  };
})();
