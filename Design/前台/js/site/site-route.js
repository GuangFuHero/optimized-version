/* site-route.js — 前台 /map /list 共用的路由狀態層
 * 對齊 repo：libs/modules/src/route/{constants,parse,serialize,types}.ts
 *           libs/modules/src/station/type-options.ts
 *           libs/modules/src/ticket/status.ts
 *           libs/modules/src/map/{constants,utils/filter-markers}.ts
 * 純 JS，無 React 依賴 —— 對應 Next 專案可直接搬成同名模組。 */
(function () {
  // ── station/type-options.ts ────────────────────────────────────────────────
  const STATION_TYPE_OPTIONS = [
    { value: 'water', label: '加水' },
    { value: 'shelter', label: '避難' },
    { value: 'shower', label: '洗澡' },
    { value: 'toilet', label: '廁所' },
    { value: 'transport', label: '交通' },
    { value: 'medical', label: '醫療' },
    { value: 'supply', label: '物資' },
    { value: 'gas_station', label: '加油' },
    { value: 'charge', label: '充電' },
    { value: 'power', label: '發電' },
    { value: 'cellular', label: '通訊' },
  ];
  const STATION_TYPE_LABELS = Object.fromEntries(STATION_TYPE_OPTIONS.map((o) => [o.value, o.label]));
  const STATION_TYPE_ICONS = {
    water: 'Droplets', shelter: 'Tent', shower: 'ShowerHead', toilet: 'Toilet',
    transport: 'Bus', medical: 'HeartPulse', supply: 'Package', gas_station: 'Fuel',
    charge: 'BatteryCharging', power: 'Zap', cellular: 'RadioTower',
  };
  function getStationTypeLabel(type) {
    const t = type && type.trim().toLowerCase();
    if (!t) return '站點';
    return STATION_TYPE_LABELS[t] || t;
  }

  /* ── 站點營運狀態 × 開放時間 ────────────────────────────────────────────────
   * Sucre 2026-08-09：「星期一 9-15 開放，那 15 之後就是不開放，
   *                    但是站點關閉就是 closed」
   *
   * → 這是**兩件事**：
   *   status        站點本身還在不在營運（人工切）
   *   開放時間        現在這個時段有沒有在服務（時間表推導）
   *
   * 所以 status === 'open' 不代表「現在開著」。讀者要的答案
   * （我現在過去有沒有人在）在**兩者的組合**裡。
   *
   * ⚠️ 三態不是正典值。RS-FEAT-001 寫的是 open/paused/closed/full，
   *    我們不做 full（額滿），因為容量不記、額滿算不出來。需回寫正典。
   * ─────────────────────────────────────────────────────────────────────── */
  const STATION_STATUS_META = {
    open:   { label: '營運中', tone: 'success', desc: '站點正常營運' },
    paused: { label: '暫停服務', tone: 'warning', desc: '站點還在，但目前暫停服務' },
    closed: { label: '已關閉', tone: 'neutral', desc: '這個站點已經關閉，不再營運' },
  };
  function getStationStatusMeta(v) {
    return STATION_STATUS_META[(v && v.trim().toLowerCase())] || STATION_STATUS_META.open;
  }

  /** 開放時間字串 → 現在是否在服務時段內。
   *
   *  ⚠️ 這只認得得出「HH:MM–HH:MM」與「24 小時」兩種。
   *  Sucre 舉的例子是「星期一 9-15」，代表實務上**每天可以不一樣** ——
   *  但目前資料是單一字串、沒有星期維度，存不下每週排程。
   *  已列進《資源站點-工程需求清單》第 9 項請後端評估加結構化時段表。
   *  在那之前，這個函式回 null 就代表「判斷不了，原樣顯示字串給讀者自己看」。 */
  function isWithinOpenHours(opHour, now) {
    const s = (opHour || '').trim();
    if (!s) return null;
    if (/24\s*小時|全日|24h/i.test(s)) return true;
    const m = s.match(/(\d{1,2}):(\d{2})\s*[–\-~至]\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const d = now || new Date();
    const cur = d.getHours() * 60 + d.getMinutes();
    const from = Number(m[1]) * 60 + Number(m[2]);
    const to = Number(m[3]) * 60 + Number(m[4]);
    return to >= from ? (cur >= from && cur < to) : (cur >= from || cur < to); // 跨午夜
  }

  /** status × 開放時間 → 讀者真正要看到的那一句。
   *  主要讀者是「尚未抵達的人」，他要的答案只有一個：現在過去有沒有人在。 */
  function resolveStationAvailability(station, now) {
    const meta = getStationStatusMeta(station && station.status);
    const raw = (station && station.opHour) || '';
    if (meta === STATION_STATUS_META.closed || meta === STATION_STATUS_META.paused) {
      return { headline: meta.label, tone: meta.tone, detail: meta.desc, opHour: raw, statusMeta: meta };
    }
    const within = isWithinOpenHours(raw, now);
    if (within === true)  return { headline: '現在開放', tone: 'success', detail: raw ? '服務時間 ' + raw : '', opHour: raw, statusMeta: meta };
    if (within === false) return { headline: '休息中', tone: 'neutral', detail: raw ? '服務時間 ' + raw + '，此時段沒有服務' : '', opHour: raw, statusMeta: meta };
    return { headline: '營運中', tone: 'success', detail: raw ? '服務時間 ' + raw : '服務時間未提供', opHour: raw, statusMeta: meta };
  }

  // ── ticket/status.ts ───────────────────────────────────────────────────────
  const TICKET_STATUS_OPTIONS = [
    { value: 'pending', label: '待處理' },
    { value: 'in_progress', label: '處理中' },
    { value: 'completed', label: '已完成' },
    { value: 'cancelled', label: '已取消' },
  ];
  const TICKET_STATUS_LABELS = {
    open: '待處理', pending: '待處理', assigned: '已指派', accepted: '已接案',
    in_progress: '處理中', 'in-progress': '處理中', processing: '處理中',
    fulfilled: '已完成', completed: '已完成', resolved: '已完成',
    cancelled: '已取消', canceled: '已取消', closed: '已結案',
  };
  /** 任務狀態 → DS 語意色調（Badge tone）。 */
  const TICKET_STATUS_TONES = {
    pending: 'danger', open: 'danger',
    in_progress: 'warning', 'in-progress': 'warning', processing: 'warning',
    assigned: 'warning', accepted: 'warning',
    completed: 'success', fulfilled: 'success', resolved: 'success', closed: 'success',
    cancelled: 'neutral', canceled: 'neutral',
  };
  const norm = (v) => (v && v.trim().toLowerCase()) || undefined;
  function normalizeTicketStatusForQuery(v) {
    switch (norm(v)) {
      case 'open': case 'pending': return 'pending';
      case 'in_progress': case 'in-progress': case 'processing': return 'in_progress';
      case 'fulfilled': case 'completed': case 'resolved': case 'closed': return 'completed';
      case 'cancelled': case 'canceled': return 'cancelled';
      default: return undefined;
    }
  }
  function normalizeTicketStatusForMatch(v) {
    switch (norm(v)) {
      case 'open': case 'pending': return 'pending';
      case 'assigned': case 'accepted': case 'in_progress': case 'in-progress': case 'processing': return 'in_progress';
      case 'fulfilled': case 'completed': case 'resolved': case 'closed': return 'completed';
      case 'cancelled': case 'canceled': return 'cancelled';
      default: return undefined;
    }
  }
  function formatTicketStatusLabel(v, fallback = '未提供') {
    const n = norm(v);
    if (!n) return fallback;
    return TICKET_STATUS_LABELS[n] || (v && v.trim()) || fallback;
  }
  function getTicketStatusTone(v) { return TICKET_STATUS_TONES[norm(v)] || 'neutral'; }
  function normalizeTicketStatusSelection(values) {
    return [...new Set((values || []).map(normalizeTicketStatusForQuery).filter(Boolean))];
  }
  function matchesTicketStatusSelection(value, selected) {
    const sel = normalizeTicketStatusSelection(selected);
    if (sel.length === 0) return true;
    const n = normalizeTicketStatusForMatch(value);
    return n ? sel.includes(n) : false;
  }

  // ── route/constants.ts ────────────────────────────────────────────────────
  const SITE_FALLBACK_BASE_LAYER = 'osm-direct';
  const SITE_FALLBACK_DATA_TYPE = 'station';
  const SITE_BASE_LAYERS = ['osm-direct', 'osm', 'carto', 'nasa_gibs', 'eox', 'nlsc'];
  const SITE_DATA_TYPES = ['station', 'ticket'];
  const SITE_MODULES = ['map', 'list'];
  const SITE_DATA_TYPE_LABELS = { station: '站點', ticket: '任務' };
  const SITE_SUB_DATA_TYPE_OPTIONS = { station: STATION_TYPE_OPTIONS, ticket: TICKET_STATUS_OPTIONS };
  /** 把路由的多選子分類收斂成資料層要的單一篩選值。
   *  /map 與 /list **必須用同一支**，否則兩頁吃同一份資料卻看到不同的集合
   *  （2026-08-22：先前這兩支只存在 site-map.jsx 的 IIFE 裡，
   *   列表頁載不到，於是乾脆沒傳，篩選就漏掉了）。 */
  function singleStationType(state) {
    if (state.dataType !== 'station') return undefined;
    const sel = (state.subDataTypes || []).filter(Boolean);
    return sel.length === 1 ? sel[0] : undefined;
  }
  function singleTicketStatus(state) {
    if (state.dataType !== 'ticket') return undefined;
    const sel = normalizeTicketStatusSelection(state.subDataTypes || []);
    return sel.length === 1 ? sel[0] : undefined;
  }

  const STATION_SUB_VALUES = new Set(STATION_TYPE_OPTIONS.map((o) => o.value));

  function normalizeSiteSubDataTypes(dataType, values) {
    if (!values || !values.length) return [];
    if (dataType === 'ticket') return normalizeTicketStatusSelection(values);
    return [...new Set(values.map((v) => v.trim().toLowerCase()).filter((v) => STATION_SUB_VALUES.has(v)))];
  }

  // ── map/constants.ts ──────────────────────────────────────────────────────
  /* 初始視角：光復鄉市區（repo 常數為 [23.884, 121.0]，此原型的 mock 座標採真實地理位置）。 */
  const RESCUE_MAP_INITIAL_VIEW = { center: [23.6700, 121.4180], zoom: 14 };
  const RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH = 352;

  /* 底圖設定沿用 repo 的 label/description/licenseNote；
   * url 在此原型改指向公開 tile 端點（Next 專案走 /api/map/tile/{type}/{source}/… BFF 代理）。 */
  const BASE_LAYER_CONFIG = {
    'osm-direct': {
      label: 'OSM 標準街道圖', description: '直連 OpenStreetMap', icon: 'Map',
      attribution: '&copy; OpenStreetMap contributors',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      apiPath: '/api/map/tile/road/osm-direct/{z}/{x}/{y}',
      tileSourceType: 'road', maxZoom: 19,
    },
    osm: {
      label: 'OSM 標準街道圖', description: '快取資源', icon: 'Map',
      attribution: '&copy; OpenStreetMap contributors',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      apiPath: '/api/map/tile/road/osm/{z}/{x}/{y}',
      tileSourceType: 'road', maxZoom: 19,
    },
    carto: {
      label: '街道地圖', description: 'CARTO 淺色底圖，適合查看道路與聚落位置', icon: 'Map',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      apiPath: '/api/map/tile/road/carto/{z}/{x}/{y}',
      tileSourceType: 'road', maxZoom: 19,
    },
    nasa_gibs: {
      label: '衛星影像（NASA GIBS）', description: 'NASA MODIS 真實色彩衛星影像', icon: 'Satellite',
      attribution: '&copy; NASA EOSDIS GIBS',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-09-24/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
      apiPath: '/api/map/tile/satellite/nasa_gibs/{z}/{x}/{y}',
      tileSourceType: 'satellite', maxZoom: 9,
    },
    eox: {
      label: '衛星影像（EOX）', description: '適合觀察地形與現地狀況', icon: 'Satellite',
      attribution: '&copy; EOX IT Services GmbH, contains modified Copernicus Sentinel data',
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
      apiPath: '/api/map/tile/satellite/eox/{z}/{x}/{y}',
      tileSourceType: 'satellite', maxZoom: 16,
      licenseNote: '僅限非商業用途（CC BY-NC-SA 4.0）',
    },
    nlsc: {
      label: '衛星影像（國土測繪中心）', description: '內政部國土測繪中心混合正射影像', icon: 'Satellite',
      attribution: '&copy; 內政部國土測繪中心',
      url: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}',
      apiPath: '/api/map/tile/satellite/nlsc/{z}/{x}/{y}',
      tileSourceType: 'satellite', maxZoom: 18,
      licenseNote: '禁止非商業再散布',
    },
    sinica: {
      label: '衛星影像（中研院）', description: '中央研究院 GIS 衛星影像', icon: 'Satellite',
      attribution: '&copy; 中央研究院',
      url: '', apiPath: '/api/map/tile/satellite/sinica/{z}/{x}/{y}',
      tileSourceType: 'satellite',
      licenseNote: '使用條款未確認，正式環境前需向中研院確認授權', hidden: true,
    },
  };

  const RESCUE_MAP_OVERLAY_LAYER_ORDER = ['closure-areas', 'routes', 'secondary-locations'];
  const DEFAULT_RESCUE_MAP_OVERLAY_LAYERS = ['closure-areas'];
  /* color 改綁 DS 語意 token（原 repo 為硬編 #b45309 / #2563eb / #0f766e）。 */
  const OVERLAY_LAYER_CONFIG = {
    'closure-areas': {
      label: '封閉區域', description: '危險地帶與暫時封鎖範圍', icon: 'Ban',
      color: 'var(--color-bg-warning-hover)', fillColor: 'var(--color-bg-warning)', tone: 'warning',
      sourceLabel: 'closure_areas.geometry via base_geometries',
    },
    routes: {
      label: '路線', description: '巡查路線與任務動線', icon: 'Route',
      color: 'var(--color-brand-secondary-default)', tone: 'info',
      sourceLabel: 'routes via base_geometries', disabledReason: '尚無資料',
    },
    'secondary-locations': {
      label: '次要位置', description: '地址與電線桿等輔助位置資訊', icon: 'MapPin',
      color: 'var(--color-fg-success)', tone: 'success',
      sourceLabel: 'secondary_locations via base_geometries', disabledReason: '尚無資料',
    },
  };

  // ── route/parse.ts ────────────────────────────────────────────────────────
  const decode = (v) => { if (!v) return undefined; try { return decodeURIComponent(v); } catch { return v; } };
  function parseBaseLayer(v) {
    const d = decode(v);
    if (!d) return undefined;
    return SITE_BASE_LAYERS.includes(d) ? d : SITE_FALLBACK_BASE_LAYER;
  }
  function parseDataType(v) {
    const d = decode(v);
    return d && SITE_DATA_TYPES.includes(d) ? d : SITE_FALLBACK_DATA_TYPE;
  }
  const parseSubDataTypes = (v) => (decode(v) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isViewportSegment = (v) => Boolean(v && v.startsWith('@') && v.endsWith('z'));
  function splitCompactViewportSegment(v) {
    if (!v) return { segment: undefined, viewportSegment: undefined };
    const i = v.indexOf('@');
    if (i <= 0 || !v.endsWith('z')) return { segment: v, viewportSegment: undefined };
    return { segment: v.slice(0, i) || undefined, viewportSegment: v.slice(i) };
  }
  function parseNumberTuple(v, len) {
    const nums = (v || '').replace(/[{}]/g, '').split(',').map((p) => Number(p.trim()));
    if (nums.length !== len || nums.some((n) => !Number.isFinite(n))) return undefined;
    return nums;
  }
  function parseBbox(v) {
    const nums = parseNumberTuple(v, 4);
    if (!nums) return undefined;
    const [minLng, minLat, maxLng, maxLat] = nums;
    if (minLng >= maxLng || minLat >= maxLat) return undefined;
    return [minLng, minLat, maxLng, maxLat];
  }
  function parsePositionSegment(v) {
    if (!isViewportSegment(v)) return undefined;
    const nums = parseNumberTuple(v.slice(1, -1), 3);
    if (!nums) return undefined;
    const [lat, lng, zoom] = nums;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
    return { center: [lat, lng], zoom: Math.min(18, Math.max(9, zoom)) };
  }
  function derivePositionFromBbox(bbox) {
    if (!bbox) return undefined;
    const [minLng, minLat, maxLng, maxLat] = bbox;
    return { center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2] };
  }
  /** 解析路由片段 + query → 共用 SiteRouteState。 */
  function parseSiteRouteState(module, segments, query) {
    const get = (k) => (query && typeof query.get === 'function' ? query.get(k) : null);
    const last = segments[segments.length - 1];
    const compact = module === 'map' ? splitCompactViewportSegment(last) : undefined;
    const viewportSegment = module === 'map'
      ? (isViewportSegment(last) ? last : compact && compact.viewportSegment)
      : undefined;
    const routeSegments = viewportSegment && compact && compact.viewportSegment
      ? [...segments.slice(0, -1), compact.segment].filter(Boolean)
      : viewportSegment ? segments.slice(0, -1) : [...segments];
    const [baseLayerSegment, dataTypeSegment, subSegment] = module === 'map'
      ? routeSegments : [undefined, routeSegments[0], routeSegments[1]];
    const search = (get('search') || '').trim();
    const bbox = parseBbox(get('bbox'));
    const dataType = parseDataType(dataTypeSegment);
    return {
      baseLayer: parseBaseLayer(baseLayerSegment),
      dataType,
      subDataTypes: normalizeSiteSubDataTypes(dataType, parseSubDataTypes(subSegment)),
      selectedMarkerId: get('id') || undefined,
      bbox,
      position: parsePositionSegment(viewportSegment) || derivePositionFromBbox(bbox),
      search: search || undefined,
    };
  }

  // ── route/serialize.ts ────────────────────────────────────────────────────
  function formatViewportSegment(state) {
    const p = state.position;
    const zoom = p && p.zoom;
    if (!p || typeof zoom !== 'number' || !Number.isFinite(zoom)) return null;
    const [lat, lng] = p.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const z = Number(zoom.toFixed(2)).toString().replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    return '@' + lat.toFixed(7) + ',' + lng.toFixed(7) + ',' + z + 'z';
  }
  function buildQueryString(state) {
    const params = [];
    if (state.selectedMarkerId) params.push('id=' + encodeURIComponent(state.selectedMarkerId));
    if (state.search) params.push('search=' + encodeURIComponent(state.search));
    return params.length ? '?' + params.join('&') : '';
  }
  /** UI → 網址的單一來源。map: /map/{baseLayer}/{dataType}[/{sub}][/@lat,lng,zoomz] */
  function createSiteHref(module, state) {
    const dataType = state.dataType || SITE_FALLBACK_DATA_TYPE;
    const sub = normalizeSiteSubDataTypes(dataType, state.subDataTypes || []);
    const subSeg = sub.length ? '/' + sub.join(',') : '';
    const vp = module === 'map' ? (formatViewportSegment(state) ? '/' + formatViewportSegment(state) : '') : '';
    const path = module === 'map'
      ? '/map/' + (state.baseLayer || SITE_FALLBACK_BASE_LAYER) + '/' + dataType + subSeg + vp
      : '/list/' + dataType + subSeg;
    return path + buildQueryString(state);
  }

  /* 原型以 hash 承載真實路由（靜態檔案無 Next router）；
   * pathname 部分與 createSiteHref 完全一致，可直接對照 Next 的 [[...segments]]。 */
  function readRouteFromLocation(module) {
    const raw = window.location.hash.replace(/^#/, '');
    const [pathPart, queryPart] = raw.split('?');
    const segments = pathPart.split('/').filter(Boolean);
    if (segments[0] === module) segments.shift();
    return parseSiteRouteState(module, segments, new URLSearchParams(queryPart || ''));
  }
  function writeRouteToLocation(module, state) {
    const href = createSiteHref(module, state);
    const next = '#' + href;
    if (window.location.hash !== next) history.replaceState(null, '', next);
  }

  // ── map/utils/filter-markers.ts ───────────────────────────────────────────
  /** 🔒 2026-09-04 Sucre：**搜尋要吃得到需求名稱。**
   *
   *  「任務的描述跟 task 不一定一樣，因為是人打的，一定有所出入」——
   *  先前只比對 `id / title / subtitle / label`，所以打「醫療」找不到一筆
   *  叫「EMT 醫護人力」的需求，儘管那正是有醫療技能的志工唯一想找的東西。
   *
   *  ⚠️ **這只是搜尋，不是分類。** 找得到與否取決於填單的人有沒有打「醫」這個字。
   *     真正的技能媒合需要一個「醫療」欄位，而前台的需求選項與 ERD 的
   *     `ticket_tasks.task_type`（hr / supply / rescue）都沒有這一項。
   *     見 `前台-承接與技能-待裁示-2026-09-04.md`。 */
  function markerMatchesSearch(marker, term) {
    if (!term) return true;
    const needNames = (marker.tasks || []).map((k) => k && k.name).filter(Boolean);
    return [marker.id, marker.title, marker.subtitle, marker.label]
      .concat(needNames).join(' ').toLowerCase().includes(term);
  }
  /** 這一筆需求本身是否命中搜尋。需求為列的列表用它決定要留哪幾列。 */
  function needMatchesSearch(task, term) {
    if (!term) return true;
    return String((task && task.name) || '').toLowerCase().includes(term);
  }
  function markerMatchesBbox(marker, bbox) {
    if (!bbox) return true;
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const [lat, lng] = marker.position;
    return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
  }
  /** 地圖與列表共用的標記過濾，確保兩者結果一致。 */
  function filterRescueMapMarkers(markers, state) {
    if (!state) return [...markers];
    const subSet = new Set((state.subDataTypes || []).map((v) => v.toLowerCase()));
    const selected = [...subSet];
    const term = (state.search || '').trim().toLowerCase();
    return markers.filter((marker) => {
      if (state.dataType && marker.detailType !== state.dataType) return false;
      if (subSet.size > 0) {
        if (marker.detailType === 'station') {
          const t = marker.stationMeta && marker.stationMeta.type && marker.stationMeta.type.trim().toLowerCase();
          if (!t || !subSet.has(t)) return false;
        } else if (!matchesTicketStatusSelection(marker.ticketMeta && marker.ticketMeta.status, selected)) {
          return false;
        }
      }
      return markerMatchesSearch(marker, term) && markerMatchesBbox(marker, state.bbox);
    });
  }

  window.SiteRoute = {
    needMatchesSearch,
    STATION_TYPE_OPTIONS, STATION_TYPE_ICONS, getStationTypeLabel,
    singleStationType, singleTicketStatus,
    STATION_STATUS_META, getStationStatusMeta, isWithinOpenHours, resolveStationAvailability,
    TICKET_STATUS_OPTIONS, formatTicketStatusLabel, getTicketStatusTone,
    normalizeTicketStatusSelection, matchesTicketStatusSelection,
    SITE_FALLBACK_BASE_LAYER, SITE_FALLBACK_DATA_TYPE, SITE_BASE_LAYERS, SITE_DATA_TYPES,
    SITE_MODULES, SITE_DATA_TYPE_LABELS, SITE_SUB_DATA_TYPE_OPTIONS, normalizeSiteSubDataTypes,
    RESCUE_MAP_INITIAL_VIEW, RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH,
    BASE_LAYER_CONFIG, OVERLAY_LAYER_CONFIG, RESCUE_MAP_OVERLAY_LAYER_ORDER,
    DEFAULT_RESCUE_MAP_OVERLAY_LAYERS,
    parseSiteRouteState, createSiteHref, readRouteFromLocation, writeRouteToLocation,
    filterRescueMapMarkers,
  };
})();
