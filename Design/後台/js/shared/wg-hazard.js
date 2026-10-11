/* wg-hazard.js — 危險區的橘白斜紋（前後台共用）
 *
 * 🔒 2026-09-25 Sucre 裁示：「危險區保留為橘白配色（像是危險角錐的顏色）」。
 *    危險區是地圖上唯一用斜紋的東西 —— 其他區域一律實心淡色填滿，
 *    所以斜紋本身就是「危險」的記號，不必先讀文字、也不只靠顏色（色弱看得出紋路）。
 *
 * 做法：Leaflet 的 polygon 用 `className: "wg-hazard-zone"`，
 *   CSS 的 `fill: url(#wg-hazard-stripes)` 會蓋過 Leaflet 寫進去的 fill 屬性
 *   （SVG 的 presentation attribute 優先序低於 CSS），所以 setStyle 也不會把紋路洗掉。
 *   pattern 放在 body 底部一個看不見的 <svg> 裡，整頁共用一份。
 *
 * 顏色綁 DS 語意 token：
 *   橘  --color-bg-warning       (#F57C00，amber-500)
 *   邊  --color-bg-warning-hover (#E65100，amber-700)
 *   ⚠️ 刻意不用品牌橘 --color-brand-primary-default (#E3791E)：那是按鈕與選中色，
 *      危險區若用同一個橘，會跟「目前選中」混在一起。
 */
(function () {
  'use strict';
  var PATTERN_ID = 'wg-hazard-stripes';

  function tokenValue(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function ensure() {
    if (document.getElementById(PATTERN_ID)) return;
    var orange = tokenValue('--color-bg-warning', '#F57C00');
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute'; svg.style.width = '0'; svg.style.height = '0';
    svg.innerHTML =
      '<defs><pattern id="' + PATTERN_ID + '" patternUnits="userSpaceOnUse" width="16" height="16" patternTransform="rotate(45)">' +
      '<rect width="16" height="16" fill="#FFFFFF"/>' +
      '<rect width="8" height="16" fill="' + orange + '"/>' +
      '</pattern></defs>';
    (document.body || document.documentElement).appendChild(svg);

    var style = document.createElement('style');
    style.textContent = '.wg-hazard-zone{fill:url(#' + PATTERN_ID + ');}' +
      /* 圖例與清單用的小色塊：同一組斜紋 */
      '.wg-hazard-swatch{background:repeating-linear-gradient(45deg,' + orange + ' 0 4px,#fff 4px 8px);' +
      'box-shadow:inset 0 0 0 1px ' + tokenValue('--color-bg-warning-hover', '#E65100') + ';}';
    document.head.appendChild(style);
  }

  /** Leaflet polygon 的樣式。fillOpacity 要高 —— 斜紋太淡就只剩一片髒橘色，看不出是紋路。 */
  function polygonStyle(opts) {
    opts = opts || {};
    return {
      className: 'wg-hazard-zone',
      color: tokenValue('--color-bg-warning-hover', '#E65100'),
      weight: opts.selected ? 3.5 : 2.5,
      opacity: 1,
      fillOpacity: opts.selected ? 0.75 : 0.6,
      dashArray: null,
    };
  }

  /* 載入就先放好 —— 圖例與清單的色塊不必等地圖上真的出現危險區才有樣式。
     ⚠️ 若 DS token 尚未套上，tokenValue 會拿到 fallback 色（與 token 同值）。 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
  else ensure();

  window.WGHazard = {
    PATTERN_ID: PATTERN_ID,
    ensure: ensure,
    polygonStyle: polygonStyle,
    stroke: function () { return tokenValue('--color-bg-warning-hover', '#E65100'); },
    fill: function () { return tokenValue('--color-bg-warning', '#F57C00'); },
  };
})();
