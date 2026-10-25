/* wg-geocode.js — 門牌查詢（TGOS）的原型替身（2026-10-25）
 *
 * 正式版：後端 GraphQL `reverseGeocode(lat, lng)`、`normalizeAddress(address, lat, lng)`
 *   規則全文：GuangFuHero/optimized-version main `Backend/Spec/027-address-normalization/frontend-guide.md`
 *   前台實作：PR #126（`Frontend/libs/modules/src/ticket/address-lookup.ts`）
 *
 * 🚨 下面的門牌清單**全部是編的**（照前台示範任務單的地名與座標），不是真實門牌，不可對外使用。
 *    只有「糖廠街19號」那一行的正式寫法取自後端文件的範例。
 *
 * 回傳形狀照後端 `AddressLookupType` 的子集：
 *   { status: found | not_found | ambiguous | unavailable, fullAddress, floor, room, lat, lng, distanceM, addressToken }
 *
 * 📦 交付版刻意保留這份示範門牌：它不是任務單或站點紀錄，是「查詢服務」的替身，
 *    留著前端才試得到請求協助的地址互動。接上後端後整支拿掉。
 * 測試用開關：網址加 `?tgos=down` → 每次都回 unavailable（模擬 TGOS 不通、沒有 key、逾時）。
 */
(function () {
  var DOORS = [
    { full: '花蓮縣光復鄉大進村3鄰糖廠街19號',   town: '光復鄉', lat: 23.6737, lng: 121.4256 },
    { full: '花蓮縣光復鄉大進村5鄰大進街12號',   town: '光復鄉', lat: 23.6771, lng: 121.4066 },
    { full: '花蓮縣光復鄉東富村8鄰富愛街33號',   town: '光復鄉', lat: 23.6698, lng: 121.4352 },
    { full: '花蓮縣光復鄉大華村4鄰中正路二段88號',  town: '光復鄉', lat: 23.6675, lng: 121.4223 },
    { full: '花蓮縣光復鄉大華村4鄰中正路二段120號', town: '光復鄉', lat: 23.6679, lng: 121.4229 },
    { full: '花蓮縣光復鄉大安村6鄰中山路一段20號',  town: '光復鄉', lat: 23.6714, lng: 121.4008 },
    /* 同名路段在鄰鎮也有一戶 → 只打「中山路一段20號」會是 ambiguous（要他補鄉鎮） */
    { full: '花蓮縣鳳林鎮北林里2鄰中山路一段20號', town: '鳳林鎮', lat: 23.7455, lng: 121.4520 },
  ];
  var RADIUS_M = 500;
  var DELAY_MS = 450;

  function distM(a, b) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function down() {
    try { return /[?&]tgos=down\b/.test(location.search); } catch (e) { return false; }
  }
  function later(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, DELAY_MS); }); }
  function token() { return 'mock-' + Date.now().toString(36); }

  /* 「中山路一段20號」這段：拿掉縣市、鄉鎮、村里、鄰，只留路＋段＋巷弄＋號。 */
  function core(s) {
    return String(s || '').replace(/[\s　]/g, '')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48); })
      .replace(/^.*?[縣市](?=.)/, '').replace(/^.*?[鄉鎮市區](?=.)/, '')
      .replace(/^.*?[村里](?=.)/, '').replace(/^\d+鄰/, '');
  }

  function reverseGeocode(lat, lng) {
    if (down()) return later({ status: 'unavailable' });
    var p = { lat: lat, lng: lng }, best = null;
    DOORS.forEach(function (d) { var m = distM(p, d); if (!best || m < best.m) best = { d: d, m: m }; });
    if (!best || best.m > RADIUS_M) return later({ status: 'not_found' });
    return later({ status: 'found', fullAddress: best.d.full, floor: null, room: null,
      lat: best.d.lat, lng: best.d.lng, distanceM: Math.round(best.m), addressToken: token() });
  }

  /** 打的地址 → 正式寫法。號之後的「3樓」「之1」「302室」拆到 floor／room。 */
  function normalizeAddress(text, lat, lng) {
    if (down()) return later({ status: 'unavailable' });
    var raw = String(text || '').replace(/[\s　]/g, '');
    var cut = raw.match(/^(.*?\d+(?:之\d+)?號)(.*)$/);
    if (!cut) return later({ status: 'not_found' });
    var head = cut[1], tail = cut[2];
    var fm = tail.match(/(B?\d+)(?:樓|F|f)/), rm = tail.match(/(\d+)室|之(\d+)/);
    var want = core(head);
    var town = (raw.match(/([^縣市]{1,3}[鄉鎮市區])/) || [])[1];
    var hits = DOORS.filter(function (d) { return core(d.full) === want && (!town || d.town === town); });
    if (!hits.length) return later({ status: 'not_found' });
    if (hits.length > 1) return later({ status: 'ambiguous' });
    var d = hits[0];
    var dist = (typeof lat === 'number') ? Math.round(distM({ lat: lat, lng: lng }, d)) : null;
    return later({ status: 'found', fullAddress: d.full,
      floor: fm ? fm[1] : null, room: rm ? (rm[1] || rm[2]) : null,
      lat: d.lat, lng: d.lng, distanceM: dist, addressToken: token() });
  }

  window.WGGeocode = { reverseGeocode: reverseGeocode, normalizeAddress: normalizeAddress, distM: distM, RADIUS_M: RADIUS_M };
})();
