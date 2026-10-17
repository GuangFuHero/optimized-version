/* tk-bridge-merge.js — 把前台民眾建立的任務單與接任務狀態併進後台任務管理
 *
 * 載入順序：必須在 `tk-data.js` 之後、`tk-app.jsx` 之前。
 * 這支只做「合併」，不改後台任何既有邏輯，移除它後台就回到純 mock 狀態。
 *
 * 決策依據：
 *   2026-08-11  災情發生時由現場民眾在前台建立任務單
 *   2026-08-11  前台已登入民眾可承接任務
 *   2026-08-22  聯動採共用 localStorage store（`WGBridge`）
 *
 * ⚠️ 正式版沒有這一支。後端本來就是同一張 `tickets` 表，
 *    前台 mutation 寫進去，後台 query 讀出來，不需要任何合併程式碼。
 */
(function () {
  'use strict';
  var Bridge = window.WGBridge;
  if (!Bridge || !Array.isArray(window.TK_TICKETS)) return;

  var BASE = window.TK_TICKETS.slice();   // 原始 mock，每次重算都從這份出發

  /** 把承接狀態（前台按下的「接這筆」）反映到 ticket 的 tasks[].assignees。
   *  後台任務管理的「已承接 n/m」讀的是 assignees 長度，所以要補進去，
   *  否則前台接了需求、後台的數字不會動。
   *
   *  🔴 2026-09-04 修正：**先前整包塞進 `tasks[0]`。**
   *     舊碼寫 `var first = ticket.tasks[0]`，把前台所有承接都記在第一筆需求上。
   *     民眾開單填了「清淤人力」與「飲用水」兩筆，志工接的是第二筆，
   *     後台卻顯示第一筆有人來了 —— 派工的人會據此判斷「水還沒人送」，
   *     而事實相反。前台那一半（沒問要接哪一筆）與這一半是同一個 bug 的兩端。
   *
   *     現在承接紀錄的鍵是 `ticketId#taskId`（見 `wg-bridge.js`），
   *     所以可以逐筆對回去。
   */
  function applyMatches(ticket, byTaskId) {
    if (!byTaskId || !ticket.tasks || !ticket.tasks.length) return ticket;
    var touched = false;
    var siteMatched = 0;
    var anyStatus = null;

    var tasks = ticket.tasks.map(function (task) {
      var m = byTaskId[task.id];
      if (!m) return task;
      anyStatus = anyStatus || m.status;
      if (m.status !== 'deleted') siteMatched += (m.matched || 0);

      var already = (task.assignees || []).length;
      var toAdd = Math.max(0, (m.matched || 0) - already);
      if (!toAdd && m.status !== 'deleted') return task;
      touched = true;

      var assignees = (task.assignees || []).slice();
      for (var i = 0; i < toAdd; i += 1) {
        assignees.push({ name: '前台志工', qty: 1, at: m.claimedAt || '—', viaSite: true });
      }
      return Object.assign({}, task, {
        assignees: assignees,
        status: m.status === 'matched' ? 'in_progress' : task.status,
      });
    });

    if (!touched) return ticket;
    return Object.assign({}, ticket, {
      tasks: tasks,
      /* 讓後台一眼看得出這筆的承接來自前台，不是後台派的 */
      _siteMatched: siteMatched,
      _siteMatchStatus: anyStatus,
    });
  }

  function rebuild() {
    /* `readTicketMatches` 回傳 `{ taskId: state }` —— 鍵已經是需求層。 */
    var fromSite = Bridge.readSiteTickets().map(function (t) {
      return applyMatches(t, Bridge.readTicketMatches(t.id));
    });
    var merged = BASE.map(function (t) {
      return applyMatches(t, Bridge.readTicketMatches(t.uuid || t.id));
    });
    /* 民眾剛送出的排最前面：待審的東西壓在三天前的舊單下面等於沒送到。
       這與 08-21 決議第六節「operational_status 置頂」是同一個理由。 */
    window.TK_TICKETS = fromSite.concat(merged);
    window.TK_SITE_TICKET_COUNT = fromSite.length;
  }

  rebuild();

  /* 前台在另一個分頁送出新單時，這裡會收到 storage 事件。
     後台的 React 樹已經掛載、不會自己重讀 window.TK_TICKETS，
     所以只發一個事件出去，讓有需要的頁面自己決定要不要重繪或提示。 */
  Bridge.subscribe(function () {
    rebuild();
    try {
      window.dispatchEvent(new CustomEvent('wg:tickets-changed', {
        detail: { siteCount: window.TK_SITE_TICKET_COUNT },
      }));
    } catch (e) {}
  });
})();
