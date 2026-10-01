/* site-auth.js — 前台登入入口的落點（原型）
 * 對齊 repo：apps/demo/src/modules/auth/session/site-shell.client.tsx 的
 * handleSignIn / handleSignOut。這一支只有導覽與身份寫入，UI 在 site-auth.jsx
 * （只有登入頁會載入那一支）。
 *
 * ⚠️ 原型專用。正式版的登入是 next-auth，這裡只是把「按了登入會發生什麼」演出來。
 */
(function () {
  const LOGIN_PAGE = '登入 Login.html';
  const MAP_PAGE = '前台地圖 Site Map.html';
  const DEFAULT_BACK = encodeURI(MAP_PAGE) + '#/map';

  /** 去登入頁，並記住「從哪一頁來的」。
   *
   *  🔒 帶的是整個 href（含 hash）—— 地圖頁的路由狀態全在 hash 裡（圖層、座標、
   *  縮放、開著的那張單），登入完要能原地回來，不是丟回地圖首頁。
   *
   *  🔴 不要用改寫 location.hash 當導覽（舊做法是 `location.hash = '#/sign-in'`）：
   *  ① `#/sign-in` 全專案沒有任何地方處理，按了完全沒反應；
   *  ② 在 /map 上改 hash 等於把地圖的路由狀態整個抹掉。
   */
  function goSignIn() {
    window.location.href =
      encodeURI(LOGIN_PAGE) + '?back=' + encodeURIComponent(window.location.href);
  }

  /** 未登入那一筆 persona（id 為 null）。唯一真相來源是 site-shell.jsx 的 SITE_PERSONAS。 */
  function guestPersona() {
    return (window.SITE_PERSONAS || []).find((p) => !p.isAuthenticated) || null;
  }

  function personaById(id) {
    return (window.SITE_PERSONAS || []).find((p) => p.id === id) || null;
  }

  /** 前台登出：留在原地變成未登入，不跳頁。
   *
   *  🔒 前台未登入本來就看得到地圖與列表（擋在送出前，不擋在入口前），
   *  把人踢去登入頁等於懲罰他登出，而且他會失去現在看的那一頁。
   */
  function signOutHere() {
    const guest = guestPersona();
    if (guest && window.writeSitePersona) window.writeSitePersona(guest);
  }

  /** 讀 `?back=`。只接受同源的落點 —— 不要讓一個網址參數把人送到站外。 */
  function readBack() {
    let raw = null;
    try {
      raw = new URLSearchParams(window.location.search).get('back');
    } catch (e) { /* 忽略解析失敗 */ }
    if (!raw) return null;
    try {
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin) return null;
      return url.href;
    } catch (e) {
      return null;
    }
  }

  /** 登入成功：寫入身份，回到來源頁。 */
  function completeSignIn(persona, back) {
    if (!persona) return;
    if (window.writeSitePersona) window.writeSitePersona(persona);
    else {
      try { localStorage.setItem('wg.sitePersonaId', persona.id || 'guest'); } catch (e) {}
    }
    window.location.href = back || DEFAULT_BACK;
  }

  Object.assign(window, {
    SiteAuth: {
      LOGIN_PAGE, MAP_PAGE, DEFAULT_BACK,
      goSignIn, signOutHere, readBack, completeSignIn, guestPersona, personaById,
    },
  });
})();
