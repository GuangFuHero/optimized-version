/* site-map.jsx — /map 主畫面
 * 對齊 repo：libs/modules/src/map/components/rescue-map-canvas|layer-panel|floating-actions|status-message
 *           libs/modules/src/map/site/{site-map-controls,use-site-map-live-data,markers}.ts
 * 原型以原生 Leaflet 做 imperative layer 同步（正式版為 react-leaflet 5 + react-leaflet-cluster）。 */
(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const { Badge, Button } = window.WanGuardDesignSystem_9c8f68;
  const R = window.SiteRoute;
  const D = window.SiteData;

  /* marker / leaflet / 動畫樣式集中於 js/site/site.css（兩頁共用）。 */
  const lucideSvg = (name, size) => {
    if (!window.lucide || !window.lucide[name]) return '';
    const el = window.lucide.createElement(window.lucide[name]);
    el.setAttribute('width', size); el.setAttribute('height', size);
    el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', 2);
    return el.outerHTML;
  };
  /** 把 DS token（var(--x)）解析成實際色值 —— Leaflet 會寫進 SVG stroke/fill 屬性，不支援 var()。 */
  function resolveCssToken(value) {
    const raw = String(value || '').trim();
    const matched = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw);
    if (!matched) return raw || 'currentColor';
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(matched[1]).trim();
    return resolved || 'currentColor';
  }

  const escapeHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function markerGlyphName(item) {
    if (item.detailType === 'station') return R.STATION_TYPE_ICONS[item.stationMeta && item.stationMeta.type] || 'Package';
    const s = item.ticketMeta && item.ticketMeta.status;
    if (s === 'completed') return 'CircleCheck';
    if (s === 'cancelled') return 'CircleSlash';
    if (item.variant === 'urgent-ticket') return 'TriangleAlert';
    return 'Wrench';
  }

  function createMapMarkerIcon(item, L, active) {
    const tone = item.detailType === 'station' ? 'station' : 'ticket';
    const html = '<div class="wg-marker-stack">'
      + '<div class="wg-marker wg-marker--' + tone + (active ? ' wg-marker--active' : '') + '">' + lucideSvg(markerGlyphName(item), 19) + '</div>'
      + '<div class="wg-marker__label wg-marker__label--' + tone + '">' + escapeHtml(item.label) + '</div>'
      + '</div>';
    return L.divIcon({ className: 'wg-marker-wrapper', html, iconSize: [132, 58], iconAnchor: [66, 36], popupAnchor: [0, -30] });
  }

  /** 訪客模式的格子標記：**只有數字，沒有第二個形狀**。
   *
   * 🔴 2026-09-11 Sucre：「未登入看到的任務單，有六角形又有圓形，有點複雜，
   *    簡化成一個形狀就好。」
   *
   * 原本一個格子畫了兩層：真實大小的六邊形（隨縮放，表達「這是一塊範圍」）
   * ＋ 一顆固定 52px 的圓形徽章（裝數字）。兩個形狀講的是同一件事，
   * 而且**互相矛盾** —— 圓形是固定像素、有邊框、看起來像一個「點」，
   * 正好是訪客模式最不希望被讀成的東西（AC-02：訪客拿不到門牌級座標）。
   *
   * 🔒 留下來的是**六邊形**，不是圓形。理由：六邊形會隨縮放維持真實的
   *    550 公尺大小 —— 形狀本身就在說「這一片裡面」。圓形徽章做不到這件事，
   *    放大縮小都一樣大，看起來永遠像一根釘子。
   *    數字改成直接落在六邊形中央的一行字（帶白色描邊才讀得到），不再自帶容器。
   */
  function createCellIcon(cell, L, active) {
    const html = '<div class="wg-marker-stack">'
      + '<div class="wg-cell' + (active ? ' wg-cell--active' : '') + '">'
      + '<span class="wg-cell__n">' + cell.count + '</span>'
      + '<span class="wg-cell__u">求助</span>'
      + '</div></div>';
    /* iconSize 要罩得住放大後的字，否則 Leaflet 會把它裁掉。 */
    return L.divIcon({ className: 'wg-marker-wrapper', html, iconSize: [104, 34], iconAnchor: [52, 17] });
  }

  /** 以中心點＋公尺半徑算出地理六邊形頂點（固定真實大小，隨縮放自然貼合）。 */
  function hexRing(lat, lng, meters) {
    const dLat = meters / 111320;
    const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push([lat + dLat * Math.sin(a), lng + dLng * Math.cos(a)]);
    }
    return pts;
  }

  /* ── live data（對應 use-site-map-live-data） ───────────────────────────── */
  /* 這兩支已移到 site-route.js，讓 /map 與 /list 共用同一份收斂邏輯。
     留在這裡的話列表頁載不到，兩頁的篩選就會不一致。 */
  const singleStationType = R.singleStationType;
  const singleTicketStatus = R.singleTicketStatus;

  /**
   * 依維度與子分類向資料層取數（正式版為 urql + bounds 查詢，由 viewport external store 驅動；
   * 原型資料量小，改為維度變動時取數、視角過濾交給 controller，避免每次平移都重查。
   */
  /** @param isAuthenticated 決定資料層要不要套 TM-FEAT-003 訪客邊界。
   *  正式版這個參數不存在 —— 後端看 token 自己決定回什麼，前端拿到的就已經遮好了。 */
  function useSiteMapLiveData(state, isAuthenticated) {
    /* 自己送出新單後要立刻重查，否則要等下次篩選變動才看得到自己那一筆。 */
    const bridgeVersion = window.WGBridge.useBridgeVersion();
    const [snapshot, setSnapshot] = useState({ markers: [], closureAreas: [], isFetching: true, hasFetchedOnce: false, totalCount: 0 });
    const subSignature = (state.subDataTypes || []).join('|');
    useEffect(() => {
      let cancelled = false;
      setSnapshot((cur) => ({ ...cur, isFetching: true }));
      const timer = setTimeout(() => {
        if (cancelled) return;
        const result = D.queryMarkers({
          dataType: state.dataType || R.SITE_FALLBACK_DATA_TYPE,
          stationType: singleStationType(state), ticketStatus: singleTicketStatus(state),
          skip: 0, limit: 200, isAuthenticated,
        });
        setSnapshot({
          markers: result.items, closureAreas: D.queryClosureAreas().items,
          isFetching: false, hasFetchedOnce: true, totalCount: result.pageInfo.totalCount,
        });
      }, 260);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [state.dataType, subSignature, isAuthenticated, bridgeVersion]);
    return snapshot;
  }

  /* ── 載入狀態（對應 RescueMapStatusMessage） ────────────────────────────── */
  function RescueMapStatusMessage({ message }) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 1400, display: 'grid', placeItems: 'center',
        background: 'color-mix(in oklab, var(--color-bg-neutral-subtle) 78%, transparent)' }} role="status" aria-live="polite">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: 220, height: 9, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-neutral-sunken)', overflow: 'hidden' }}>
            <div style={{ width: '34%', height: '100%', borderRadius: 'inherit', background: 'var(--color-bg-primary)',
              animation: 'wgLoadBar 1.6s var(--ease-out) infinite' }}></div>
          </div>
          <div style={{ font: '400 var(--fs-14)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>{message}</div>
        </div>
      </div>
    );
  }

  /* ── 圖層面板 ──────────────────────────────────────────────────────────── */
  function RescueMapLayerPanel({ controller }) {
    if (!controller.layerPanelOpen) return null;
    const entries = Object.entries(R.BASE_LAYER_CONFIG).filter(([, v]) => !v.hidden);
    return (
      <WGPortal>
      <div style={{ position: 'fixed', top: 'var(--wg-banner-h, 0px)', left: 0, right: 0, bottom: 0, zIndex: 1500, display: 'flex', justifyContent: 'flex-end' }}
        role="dialog" aria-modal="true" aria-label="圖層切換">
        <div onClick={controller.closeLayerPanel} style={{ position: 'absolute', inset: 0 }}></div>
        <div style={{ position: 'relative', width: 'min(360px, 100vw)', height: '100%', overflowY: 'auto',
          padding: 'var(--space-6)', background: 'var(--color-bg-neutral-default)', boxShadow: 'var(--shadow-lg)',
          animation: 'wgSlideIn var(--duration-base) var(--ease-out)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 var(--fs-20)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>圖層切換</div>
              <div style={{ marginTop: 4, font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>選擇底圖與目前可用的疊加圖層。</div>
            </div>
            <button type="button" aria-label="關閉圖層控制" onClick={controller.closeLayerPanel}
              style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'none', border: 0,
                cursor: 'pointer', borderRadius: 'var(--radius-full)', color: 'var(--color-fg-neutral-subtle)' }}>
              <WGIcon n="X" s={20} />
            </button>
          </div>

          <div style={{ marginTop: 'var(--space-6)', font: '700 var(--fs-12)/1.4 var(--font-latin)', letterSpacing: '.06em', color: 'var(--color-fg-neutral-muted)' }}>底圖</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            {entries.map(([key, cfg]) => {
              const active = key === controller.baseLayer;
              return (
                <button key={key} type="button" aria-pressed={active} onClick={() => controller.setBaseLayer(key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', textAlign: 'left',
                    padding: 'var(--space-3)', cursor: 'pointer', borderRadius: 'var(--radius-md)',
                    border: '1px solid ' + (active ? 'var(--color-border-accent)' : 'var(--color-border-default)'),
                    background: active ? 'var(--color-bg-primary-subtle)' : 'var(--color-bg-neutral-default)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none' }}>
                  <span style={{ width: 56, height: 44, flexShrink: 0, borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center',
                    border: '1px solid var(--color-border-default)',
                    background: cfg.tileSourceType === 'satellite' ? 'var(--color-fg-neutral-subtle)' : 'var(--color-bg-neutral-sunken)',
                    color: cfg.tileSourceType === 'satellite' ? 'var(--color-fg-on-secondary)' : 'var(--color-fg-neutral-subtle)' }}>
                    <WGIcon n={cfg.icon} s={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', font: '700 var(--fs-14)/1.35 var(--font-latin)', color: 'var(--color-fg-neutral-default)' }}>{cfg.label}</span>
                    {cfg.description ? <span style={{ display: 'block', marginTop: 2, font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>{cfg.description}</span> : null}
                    {cfg.licenseNote ? <span style={{ display: 'block', marginTop: 4, font: '400 var(--fs-11)/1.5 var(--font-body)', color: 'var(--color-fg-warning)' }}>{cfg.licenseNote}</span> : null}
                  </span>
                  {active ? <span style={{ color: 'var(--color-brand-primary-subtle)' }}><WGIcon n="Check" s={18} /></span> : null}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 'var(--space-6)', font: '700 var(--fs-12)/1.4 var(--font-latin)', letterSpacing: '.06em', color: 'var(--color-fg-neutral-muted)' }}>疊加圖層</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            {R.RESCUE_MAP_OVERLAY_LAYER_ORDER.map((key) => {
              const cfg = R.OVERLAY_LAYER_CONFIG[key];
              const active = controller.enabledOverlayLayers.includes(key);
              const disabled = Boolean(cfg.disabledReason);
              const meta = controller.overlayLayerMeta[key] || {};
              return (
                <button key={key} type="button" disabled={disabled} aria-pressed={active} onClick={() => controller.toggleOverlayLayer(key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', textAlign: 'left',
                    padding: 'var(--space-3)', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 'var(--radius-md)',
                    border: '1px solid ' + (active ? 'var(--color-border-accent)' : 'var(--color-border-default)'),
                    background: active ? 'var(--color-bg-warning-subtle)' : 'var(--color-bg-neutral-default)',
                    opacity: disabled ? 0.55 : 1 }}>
                  <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center',
                    background: 'var(--color-bg-neutral-subtle)', border: '1px solid var(--color-border-default)', color: cfg.color }}>
                    <WGIcon n={cfg.icon} s={18} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', font: '700 var(--fs-14)/1.35 var(--font-latin)', color: 'var(--color-fg-neutral-default)' }}>{cfg.label}</span>
                    <span style={{ display: 'block', marginTop: 2, font: '400 var(--fs-12)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                      {cfg.disabledReason || cfg.description}
                    </span>
                    <span style={{ display: 'block', marginTop: 4, font: '400 var(--fs-10)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-muted)' }}>
                      {meta.itemCount || 0} 筆 · {cfg.sourceLabel}
                    </span>
                  </span>
                  {active ? <span style={{ color: 'var(--color-brand-primary-subtle)' }}><WGIcon n="Check" s={18} /></span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      </WGPortal>
    );
  }

  /* ── KPI 浮層 ──────────────────────────────────────────────────────────── */
  function KpiCard({ label, value, accent, children, minWidth = 132 }) {
    return (
      <div style={{ minWidth, padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)',
        background: 'color-mix(in oklab, var(--color-bg-neutral-default) 92%, transparent)',
        backdropFilter: 'blur(8px)', border: '1px solid var(--color-border-accent)', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ font: '700 var(--fs-10)/1.2 var(--font-latin)', letterSpacing: '.06em', color: 'var(--color-fg-neutral-subtle)' }}>{label}</div>
        {value != null ? (
          <div style={{ marginTop: 6, font: '700 var(--fs-24)/1.2 var(--font-data)', color: accent || 'var(--color-fg-neutral-default)' }}>{value}</div>
        ) : null}
        {children}
      </div>
    );
  }

  function RescueMapFloatingActions({ stats, isMobile }) {
    const pct = stats.volunteerTarget ? Math.min(100, Math.round((stats.volunteerMatched / stats.volunteerTarget) * 100)) : 0;
    /* 手機不顯示總覽數字。
       它回答的是「整體進度如何」—— 那是協調者的問題，不是站在現場的民眾或志工的問題；
       而它會佔掉手機左下角一整塊，跟底部控制列打架。 */
    if (isMobile) return null;
    return (
      <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 1200, display: 'flex', gap: 'var(--space-3)',
        alignItems: 'stretch', pointerEvents: 'none', flexWrap: 'wrap', maxWidth: 'calc(100% - 32px)' }}>
        <KpiCard label="任務單" value={stats.ticketCount.toLocaleString('en-US')} />
        {/* 🔒 標題改成「志工到位」不是「志工數量」——
            它是**已承接 / 需要**，不是平台上有幾個志工。
            原本的字會讓人以為平台只有 37 個志工。 */}
        <KpiCard label="志工到位" minWidth={186}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 }}>
            <span style={{ font: '700 var(--fs-24)/1.2 var(--font-data)', color: 'var(--color-fg-neutral-default)' }}>{stats.volunteerMatched}</span>
            <span style={{ font: '700 var(--fs-12)/1.4 var(--font-data)', color: 'var(--color-brand-primary-subtle)' }}>/ {stats.volunteerTarget}</span>
          </div>
          <div style={{ marginTop: 8, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-neutral-sunken)', overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', borderRadius: 'inherit', background: 'var(--color-bg-primary)' }}></div>
          </div>
        </KpiCard>
        <KpiCard label="活躍站點" value={stats.stationCount} accent="var(--color-brand-secondary-subtle)" />
      </div>
    );
  }

  /* ── Leaflet 畫布 ──────────────────────────────────────────────────────── */
  function RescueMapCanvas({ controller, onSelectMarker }) {
    const hostRef = useRef(null);
    const mapRef = useRef(null);
    const tileRef = useRef(null);
    const markerLayerRef = useRef(null);
    const overlayLayerRef = useRef(null);
    const hexLayerRef = useRef(null);
    const markerRefs = useRef(new Map());
    const selectRef = useRef(onSelectMarker);
    selectRef.current = onSelectMarker;
    const viewportRef = useRef(controller.setViewportState);
    viewportRef.current = controller.setViewportState;

    useEffect(() => {
      const L = window.L;
      if (!L || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, {
        center: controller.initialView.center, zoom: controller.initialView.zoom,
        zoomControl: false, attributionControl: true, preferCanvas: false,
      });
      /* 手機不掛縮放控制 —— 雙指縮放是原生手勢，不需要按鈕；
         而右下角在手機上是拇指區，要留給主要動作。
         桌機保留，因為滑鼠沒有捏合手勢。 */
      if (!window.matchMedia('(max-width: 767px)').matches) {
        L.control.zoom({ position: 'bottomright' }).addTo(map);
      }
      /* 比例尺與版權列在手機改掛左下。
         右下是拇指區，留給主要動作；左下在手機已經空出來（總覽數字卡不顯示）。
         版權列沒有 options 可以設位置，要拿到 control 再搬。 */
      const isPhone = window.matchMedia('(max-width: 767px)').matches;
      L.control.scale({ imperial: false, position: isPhone ? 'bottomleft' : 'bottomright' }).addTo(map);
      if (isPhone && map.attributionControl) map.attributionControl.setPosition('bottomleft');
      hexLayerRef.current = L.layerGroup().addTo(map);   // 六邊形要在圖釘底下
      markerLayerRef.current = L.layerGroup().addTo(map);
      overlayLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      const publishViewport = () => {
        const c = map.getCenter(); const b = map.getBounds();
        viewportRef.current({
          center: [Number(c.lat.toFixed(7)), Number(c.lng.toFixed(7))],
          zoom: map.getZoom(),
          bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        });
      };
      const dismissBlankSpot = () => window.dispatchEvent(new CustomEvent('wg:site-map-moved'));
      map.on('movestart', dismissBlankSpot);
      map.on('zoomstart', dismissBlankSpot);
      map.on('moveend', publishViewport);
      map.on('zoomend', publishViewport);
      /* 點地圖空白處 → 浮出「在這裡新增」（2026-08-22 Sucre：點任何一個點位都可以新增任務）。
         點在 marker 上不會走到這裡 —— Leaflet 的 marker click 會先吃掉事件。
         這裡只發座標出去，泡泡由 SiteMapView 畫，因為它才知道有沒有登入。 */
      map.on('click', (e) => {
        window.dispatchEvent(new CustomEvent('wg:site-map-blank-click', {
          detail: { lat: e.latlng.lat, lng: e.latlng.lng, point: [e.containerPoint.x, e.containerPoint.y] },
        }));
      });
      publishViewport();
      const sizeTimer = setTimeout(() => { if (mapRef.current === map) map.invalidateSize(); }, 60);
      // 詳情面板展開會改變容器寬度，需同步告知 Leaflet 重新計算尺寸。
      const observer = new ResizeObserver(() => { if (mapRef.current === map) map.invalidateSize({ animate: false }); });
      observer.observe(hostRef.current);
      return () => { clearTimeout(sizeTimer); observer.disconnect(); map.remove(); mapRef.current = null; };
    }, []);

    // 底圖切換
    useEffect(() => {
      const L = window.L, map = mapRef.current;
      if (!L || !map) return;
      const cfg = controller.tileLayer;
      if (tileRef.current) map.removeLayer(tileRef.current);
      const tileOptions = { attribution: cfg.attribution, maxZoom: cfg.maxZoom || 18, crossOrigin: true };
      if (cfg.url.includes('{s}')) tileOptions.subdomains = 'abcd';
      tileRef.current = L.tileLayer(cfg.url, tileOptions).addTo(map);
      tileRef.current.bringToBack();
    }, [controller.baseLayer]);

    // marker 增量同步
    useEffect(() => {
      const L = window.L, layer = markerLayerRef.current;
      if (!L || !layer) return;
      // 訪客模式：ticket 已被吸附到格子中心，會整堆疊在一起（HC 2026-07-03 的副作用 1）。
      // 所以不畫個別圖釘，改畫格子本身 + 數量。
      const maskedTickets = controller.markers.filter((m) => m.isGuestMasked);
      const renderCells = maskedTickets.length > 0;
      const cells = renderCells ? D.groupMarkersByGridCell(maskedTickets) : [];
      const items = renderCells
        ? controller.markers.filter((m) => !m.isGuestMasked).concat(cells)
        : controller.markers;

      const nextIds = new Set(items.map((m) => m.id));
      markerRefs.current.forEach((marker, id) => {
        if (!nextIds.has(id)) { layer.removeLayer(marker); markerRefs.current.delete(id); }
      });
      items.forEach((item) => {
        const isCell = item.detailType === 'cell';
        const active = item.id === controller.selectedMarkerId;
        const icon = isCell ? createCellIcon(item, L, active) : createMapMarkerIcon(item, L, active);
        const existing = markerRefs.current.get(item.id);
        if (existing) {
          existing.setIcon(icon);
          existing.setLatLng(item.position);
          return;
        }
        const marker = L.marker(item.position, {
          icon, title: isCell ? item.count + ' 筆求助（概略區塊）' : item.title, riseOnHover: true, keyboard: true,
        });
        marker.on('click', () => selectRef.current(item.id));
        marker.addTo(layer);
        markerRefs.current.set(item.id, marker);
      });

      // 六邊形本體：讓「這是一個區塊、不是一個地點」這件事看得出來
      const hexLayer = hexLayerRef.current;
      if (hexLayer) {
        hexLayer.clearLayers();
        cells.forEach((cell) => {
          const stroke = resolveCssToken(cell.variant === 'urgent-ticket'
            ? 'var(--color-bg-danger)' : 'var(--color-bg-primary)');
          /* 選取狀態改由**六邊形自己**表達（線變粗、底色變深）。
             原本是那顆圓形徽章放大 ＋ 加外框 —— 徽章拿掉之後，
             如果不把選取搬到六邊形上，點了就會完全沒有回饋。 */
          const on = cell.id === controller.selectedMarkerId;
          L.polygon(hexRing(cell.position[0], cell.position[1], D.GUEST_GRID_DIAMETER_M / 2), {
            /* 🔒 對比**全部由這個數字負責**（2026-09-11 Sucre：「把特效拿掉，
               透明的部分更不透明」）。字上已經沒有描邊也沒有陰影了，
               所以讀不清楚時要調的是這裡，不是往字上疊效果。
               0.2 → 0.42：足以讓深色的數字浮出來，又還看得見底下的路網
               （描邊界時要對齊街廓，把底圖蓋死就失去六邊形的意義）。 */
            color: stroke, weight: on ? 4 : 2, fillColor: stroke, fillOpacity: on ? 0.58 : 0.42,
            interactive: true,
          }).on('click', () => selectRef.current(cell.id)).addTo(hexLayer);
        });
      }
    }, [controller.markers, controller.selectedMarkerId]);

    // 封閉區域疊圖
    useEffect(() => {
      const L = window.L, layer = overlayLayerRef.current;
      if (!L || !layer) return;
      layer.clearLayers();
      const closureConfig = R.OVERLAY_LAYER_CONFIG['closure-areas'];
      const strokeColor = resolveCssToken(closureConfig.color);
      const fillColor = resolveCssToken(closureConfig.fillColor);
      controller.closureAreas.forEach((area) => {
        area.polygons.forEach((rings) => {
          L.polygon(rings, {
            color: strokeColor, weight: 2, opacity: 0.9, fillColor, fillOpacity: 0.18, dashArray: '6 4',
          }).bindTooltip(area.label + ' · ' + (area.comment || ''), { direction: 'top' }).addTo(layer);
        });
      });
    }, [controller.closureAreas]);

    // 選取時平移至標記
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !controller.selectedMarkerId) return;
      const item = controller.markers.find((m) => m.id === controller.selectedMarkerId);
      if (item) map.panTo(item.position, { animate: true, duration: 0.35 });
    }, [controller.selectedMarkerId]);

    return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} aria-label="救災地圖"></div>;
  }

  /** 地圖浮層控制項：左上維度＋篩選＋釘選列，右上圖層鈕。 */
  /* ── 地圖控制項 ─────────────────────────────────────────────────────────
   *
   * 桌機：四角浮掛（畫面大、有滑鼠，掛哪個角落都搆得到）。
   * 手機：**底部固定控制列**。
   *
   * 為什麼手機不能沿用桌機那套（2026-08-22 檢討）：
   *   1. 單手持握時拇指搆得到的是螢幕下緣。把篩選放左上角是整個畫面最難按的位置。
   *   2. 左上浮層的 `maxWidth: calc(100% - 88px)` 在 360px 螢幕只剩 272px，
   *      要裝資料類型切換 ＋ 子分類篩選 ＋ 釘選列 —— 站點光類型就有 14 種，會被截斷。
   *   3. 頂欄 56 ＋ 左上浮層 ~90 ＋ 底部一堆，地圖實際可視面積被吃掉一大塊。
   *
   * 這是成熟地圖 app（Google Maps、Uber）共同的收斂結果，不是新發明。 */
  function SiteMapControls({ controller, isMobile }) {
    const dataType = controller.dataType || R.SITE_FALLBACK_DATA_TYPE;
    const { pinned, togglePinned } = usePinnedSubDataTypes(dataType);
    const pinnedOptions = R.SITE_SUB_DATA_TYPE_OPTIONS[dataType].filter((o) => pinned.includes(o.value));
    if (isMobile) {
      return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1200, pointerEvents: 'none' }}>
          {/* ── 頂部：內容切換（站點 ⇄ 任務）＋ 圖層 ───────────────────────────
           *
           * 🔒 2026-09-06 裁示 B-1：「L0（站點 ⇄ 任務）手機版放上面。低頻切換不佔拇指區。」
           *    2026-09-10 Sucre 再次指定「任務跟資源站點往上移動」，並補上理由：
           *    這一區日後還會長出別的內容形態，不是兩顆按鈕的二元切換。
           *
           * 為什麼它不該待在底部（原本的位置，y=799）：
           *   1. 它是**選擇要看什麼**，不是**對眼前這筆做什麼**。拇指區留給後者。
           *   2. 它原本緊貼「請求協助」（y=792）。兩個語意完全不同的東西並排在
           *      同一條拇指軌跡上，戴手套或在晃動的車上很容易按錯，
           *      而按錯「請求協助」會開出一張空白求助單。
           *   3. `/list` 早就把它放在頂部（y=118）。兩頁不一致本身就是 bug。
           *
           * 🔒 2026-09-11 追加：**篩選也一起上來。**
           *    Sucre：「篩選器要上去啊，自己在下面很好笑。」他是對的 ——
           *    切換與篩選是**同一類動作**（都在回答「我要看什麼」），
           *    只把其中一個搬上去，等於把一件事拆成兩個地方做。
           *    底部那一列因此只剩下唯一的主動作「請求協助」，語意乾淨：
           *    **上面是選擇，下面是行動。**
           *
           * 底部空出約 128 ＋ 44 ＋ 兩個 gap，請求協助改成整列寬。 */}
          <div style={{ position: 'absolute', top: 12, left: 12, right: 12,
            display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', pointerEvents: 'none' }}>
            <div style={{ minWidth: 0, flexShrink: 1, overflow: 'hidden', pointerEvents: 'auto' }}>
              <SiteDataTypeToggle value={dataType} onChange={controller.setDataType} />
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0, pointerEvents: 'auto' }}>
              <SiteSubTypeFilter dataType={dataType} selected={controller.subDataTypes} pinned={pinned}
                onToggle={controller.toggleSubDataType} onTogglePinned={togglePinned} compact />
            </div>
            <div style={{ flexShrink: 0, pointerEvents: 'auto' }}>
            <SiteControlSurface style={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }}>
              <button type="button" aria-label="開啟圖層控制" onClick={controller.openLayerPanel}
                style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'none', border: 0,
                  cursor: 'pointer', borderRadius: 'var(--radius-full)',
                  color: controller.layerPanelOpen ? 'var(--color-brand-primary-subtle)' : 'var(--color-fg-neutral-subtle)' }}>
                <WGIcon n="Layers" s={18} />
              </button>
            </SiteControlSurface>
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          {/* 釘選的常用篩選橫向捲動一列，貼在控制列上方。
              橫捲比換行好 —— 換行會把地圖越吃越多，且高度不可預測。
              SitePinnedFilterRow 自己已經有 overflowX，外面不要再包一層 inline-flex ——
              包了它就量不到可用寬度，橫捲會失效。 */}
          {pinnedOptions.length ? (
            <div style={{ padding: '0 var(--space-3) var(--space-2)', pointerEvents: 'auto' }}>
              <SitePinnedFilterRow items={pinnedOptions} selected={controller.subDataTypes} onToggle={controller.toggleSubDataType} />
            </div>
          ) : null}
          {/* 「請求協助」收進這一列，不再用浮動按鈕。
              浮動按鈕的位置只能寫死 offset，一旦上方多出釘選 chip 列就會疊在一起
              （2026-08-22 回報「按鈕跟文字卡在一起」）。
              收進固定列之後不可能重疊，而且它仍然在拇指區。
              篩選與圖層改成純圖示，才擠得下這四樣。 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom, 0px))',
            background: 'var(--color-bg-neutral-default)', borderTop: '1px solid var(--color-border-default)',
            pointerEvents: 'auto' }}>
            {/* 2026-09-11：選擇（切換／篩選／圖層）全部在頂部，這一列只剩**行動**。
                一顆按鈕就給整列寬 —— 只剩一顆還靠右縮著，看起來像沒排完。 */}
            <button type="button" onClick={window.openNewTicketDrawer}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 48, padding: '0 var(--space-4)', borderRadius: 'var(--radius-full)', border: 0, cursor: 'pointer',
                whiteSpace: 'nowrap', background: 'var(--color-bg-primary)', color: 'var(--color-fg-on-primary)',
                font: '700 var(--fs-15)/1.2 var(--font-body)' }}>
              <WGIcon n="HeartHandshake" s={18} />請求協助
            </button>
          </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 1200, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start', gap: 'var(--space-2)', width: 'fit-content', maxWidth: 'calc(100% - 88px)', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
            <SiteDataTypeToggle value={dataType} onChange={controller.setDataType} />
            <SiteSubTypeFilter dataType={dataType} selected={controller.subDataTypes} pinned={pinned}
              onToggle={controller.toggleSubDataType} onTogglePinned={togglePinned} />
          </div>
          <SitePinnedFilterRow items={pinnedOptions} selected={controller.subDataTypes} onToggle={controller.toggleSubDataType} />
        </div>
        <div style={{ position: 'absolute', top: 16, right: 16, pointerEvents: 'auto' }}>
          <SiteControlSurface style={{ width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
            <button type="button" aria-label="開啟圖層控制" onClick={controller.openLayerPanel}
              style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'none', border: 0,
                cursor: 'pointer', borderRadius: 'var(--radius-full)',
                color: controller.layerPanelOpen ? 'var(--color-brand-primary-subtle)' : 'var(--color-fg-neutral-subtle)' }}>
              <WGIcon n="Layers" s={18} />
            </button>
          </SiteControlSurface>
        </div>
      </div>
    );
  }

  /** /map 主畫面：畫布 + 控制項 + 圖層面板 + KPI + 詳情 + 互動抽屜。 */
  function SiteMapView({ session, route }) {
    const { module, state, replace } = route;
    const live = useSiteMapLiveData(state, session.isAuthenticated);
    const { reportsByStationId, submitStationReport } = useStationReports(session.userId);
    const { getTaskMatchState, getNeedState, claimNeed, deleteMatchSheet, releaseClaim, myClaims } = useTaskMatches(session.userId);
    const { siteTickets, createSiteTicket } = useSiteTickets();
    const [newTicketOpen, setNewTicketOpen] = useState(false);
    const [seedLandmark, setSeedLandmark] = useState(null);
    /* 送出後的回饋：先記下新單 id，等資料層重查、marker 真的出現之後再選中它。
       立刻 setSelectedMarkerId 會落空 —— queryMarkers 有 debounce，那一刻 marker 還不存在。 */

    /* 我的任務（右上角個人選單開啟）。 */
    const [myTasksOpen, setMyTasksOpen] = useState(false);
    React.useEffect(() => {
      const onOpen = (e) => { setMyTasksOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      const ev = window.MY_TASKS_EVENT || 'wg:site-my-tasks';
      window.addEventListener(ev, onOpen);
      return () => window.removeEventListener(ev, onOpen);
    }, []);

    /* 我回報的站點（2026-09-11）。與「我的任務」是兩個獨立入口，各自一個抽屜。 */
    const [reportsOpen, setReportsOpen] = useState(false);
    React.useEffect(() => {
      const onOpen = (e) => { setReportsOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      const ev = window.STATION_REPORTS_EVENT || 'wg:site-station-reports';
      window.addEventListener(ev, onOpen);
      return () => window.removeEventListener(ev, onOpen);
    }, []);

    /* 申請成為後台人員（AC-FEAT-002）。原本頂欄那顆按鈕是死連結，見 site-shell.jsx。 */
    const [roleOpen, setRoleOpen] = useState(false);
    React.useEffect(() => {
      const onOpen = (e) => { setRoleOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      const ev = window.ROLE_ELEVATION_EVENT || 'wg:site-role-elevation';
      window.addEventListener(ev, onOpen);
      return () => window.removeEventListener(ev, onOpen);
    }, []);

    /* 從沒有這些抽屜的頁面（例如行前資訊）跳過來時，把該開的那一個打開。
       只消化一次 —— `takeOpenOnLoad` 讀完就清掉，重整不會又跳出來。 */
    React.useEffect(() => {
      const want = window.takeOpenOnLoad ? window.takeOpenOnLoad() : null;
      if (!want) return;
      if (want === 'newTicket') setNewTicketOpen(true);
      else if (want === 'myTasks') setMyTasksOpen(true);
      else if (want === 'stationReports') setReportsOpen(true);
      else if (want === 'roleElevation') setRoleOpen(true);
    }, []);

    const [createdTicket, setCreatedTicket] = useState(null);
    const [toastOpen, setToastOpen] = useState(false);
    /* 承接成功後的行前資訊引導（VB-FEAT-001，2026-09-06 裁示「flow 做足一點」）。
       接完的那一刻正好是他開始想「那我要帶什麼」—— 這是全流程時機最準的一次。
       ⚠️ toast 六秒就消失，所以它是**加分**不是主要入口；常駐的那一個在
       「我的任務 › 我承接的」頂部（見 site-actions.jsx 的 BriefingDepartureBar）。 */
    const [claimedNeed, setClaimedNeed] = useState(null);
    const claimNeedAndNudge = useCallback((marker, task) => {
      claimNeed(marker, task);
      setClaimedNeed({ name: task && task.name });
    }, [claimNeed]);
    const [pendingSelectId, setPendingSelectId] = useState(null);

    /* 點地圖空白處浮出的「在這裡新增」泡泡。存 containerPoint 而不是 latlng，
       是因為泡泡要黏在游標點下的畫面位置；地圖一移動就收掉泡泡，
       否則泡泡會停在原畫面座標、指向錯的地方。 */
    const [blankSpot, setBlankSpot] = useState(null);
    React.useEffect(() => {
      const onBlank = (e) => setBlankSpot(e.detail);
      const dismiss = () => setBlankSpot(null);
      window.addEventListener('wg:site-map-blank-click', onBlank);
      window.addEventListener('wg:site-map-moved', dismiss);
      return () => {
        window.removeEventListener('wg:site-map-blank-click', onBlank);
        window.removeEventListener('wg:site-map-moved', dismiss);
      };
    }, []);
    /* 請求協助的按鈕住在 shell（site-shell.jsx），抽屜住在這裡，靠 CustomEvent 串接。
       與 wg-notify.jsx 的 wg:notify-open 同一套做法。 */
    React.useEffect(() => {
      /* `preventDefault()` ＝ 告訴 shell 這一頁接得住，不要跳頁（見 site-shell.jsx）。 */
      const onNew = (e) => { setNewTicketOpen(true); if (e && e.preventDefault) e.preventDefault(); };
      window.addEventListener(window.NEW_TICKET_EVENT || 'wg:site-new-ticket', onNew);
      return () => window.removeEventListener(window.NEW_TICKET_EVENT || 'wg:site-new-ticket', onNew);
    }, []);
    const [dismissed, setDismissed] = useState([]);

    const sourceMarkers = useMemo(
      () => live.markers.filter((m) => !dismissed.includes(m.id)),
      [live.markers, dismissed],
    );

    /* 我建立的：mock ＋ 前台 bridge 兩個來源，含已結束的單。
       實作在 `site-actions.jsx` 的 `useMyCreatedTickets` —— 地圖與列表共用一份，
       不要在這裡各寫各的（那正是 2026-09-10「我建立的永遠是空的」的成因）。 */
    const myCreated = useMyCreatedTickets(session.userId, getTaskMatchState);
    /* 我承接的：`myClaims` 只有 ticketId / taskId 與承接狀態，這裡補上標題／地址／聯絡人，
       因為履約視角要回答的是「去哪、找誰、做哪一件事」，光有編號沒有用。
       ⚠️ 一列＝一筆需求，所以同一張單可能出現兩列。`required` 要取**該筆需求**的分母，
          不是整張單的總人數 —— 用總人數會顯示成「1/12」，看起來像沒人來。 */
    const myClaimRows = useMemo(() => myClaims.map((row) => {
      const marker = sourceMarkers.find((m) => m.id === row.ticketId);
      const site = siteTickets.find((t) => t.id === row.ticketId);
      const meta = (marker && marker.ticketMeta) || {};
      const contact = [meta.contactName, meta.contactPhone].filter(Boolean).join(' · ');
      const need = ((marker && marker.tasks) || needsOf(site) || []).find((k) => k.id === row.taskId);
      return {
        ...row,
        title: (marker && marker.title) || (site && site.title) || null,
        address: (site && site.street) || (marker && marker.subtitle) || null,
        contact: contact || null,
        needName: (need && need.name) || row.match.taskName || '這筆需求',
        required: row.match.required
          || (need && typeof need.quantity === 'number' && need.quantity > 0 ? need.quantity : 1),
      };
    }), [myClaims, sourceMarkers, siteTickets]);
    const controller = useRescueMapController({
      routeState: state, onRouteStateChange: replace, sourceMarkers,
      closureAreas: live.closureAreas, filterMarkersByBbox: false,
    });

    /* ⚠️ 這一段一定要在 `controller` 宣告**之後**。
       `useEffect` 的 deps 陣列在該行執行的當下就求值 —— 放在上面會是 TDZ，
       整頁白畫面（2026-08-22 已經因為同一個原因白過兩次）。 */

    /* 從通知點進那張任務單（2026-09-10）。通知的價值一半在於**點得進去** ——
       只告訴你「有人接了」卻要自己回列表找那張單，等於沒有省下任何一步。 */
    React.useEffect(() => {
      const onOpen = (e) => {
        const id = e && e.detail && e.detail.id;
        if (!id) return;
        /* 🔴 一定要先切到「任務」維度。通知一律是關於任務單的，而使用者當下
           可能停在「站點」維度 —— 只設 selectedMarkerId 的話那張單根本不在
           目前的資料集裡，畫面上什麼都不會發生，看起來就像按了沒反應。 */
        if (controller.dataType !== 'ticket') controller.setDataType('ticket');
        controller.setSelectedMarkerId(id);
        /* 告訴 shell「這一頁接住了」，它才不會再跨頁一次。 */
        if (e.preventDefault) e.preventDefault();
      };
      const name = window.OPEN_TICKET_EVENT || 'wg:site-open-ticket';
      window.addEventListener(name, onOpen);
      return () => window.removeEventListener(name, onOpen);
    }, [controller]);

    const [reportStation, setReportStation] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [shareTarget, setShareTarget] = useState(null);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
      const mq = window.matchMedia('(max-width: 767px)');
      const onChange = () => setIsMobile(mq.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }, []);

    /* 告訴 shell 的浮動主動作要抬多高 —— FAB 住在 shell、控制列住在地圖，
       兩者沒有父子關係，用 CSS 變數當中介比把高度用 props 穿三層乾淨。
       ⚠️ 必須放在 `isMobile` 宣告**之後**：useEffect 的 deps 陣列在該行執行當下就求值，
          放在前面會撞 TDZ，整頁白畫面（2026-08-22 就是這樣壞的）。 */
    React.useEffect(() => {
      const root = document.documentElement;
      root.style.setProperty('--wg-map-bottom-bar', isMobile ? '72px' : '0px');
      /* 地圖頁的底部控制列已經有「請求協助」，通知 shell 收起浮動按鈕，
         否則兩顆同樣的主動作會同時出現、而且一定會疊在一起。 */
      window.WG_SITE_OWN_HELP_ACTION = isMobile;
      window.dispatchEvent(new CustomEvent('wg:site-help-action'));
      return () => {
        root.style.removeProperty('--wg-map-bottom-bar');
        window.WG_SITE_OWN_HELP_ACTION = false;
        window.dispatchEvent(new CustomEvent('wg:site-help-action'));
      };
    }, [isMobile]);

    // 訪客模式下選到的可能是「格子」而不是單筆 ticket，格子不在 controller.markers 裡。
    const selectedMarker = useMemo(() => {
      const id = controller.selectedMarkerId;
      if (!id) return null;
      const hit = controller.markers.find((m) => m.id === id);
      if (hit) return hit;
      if (String(id).startsWith('cell:')) {
        return D.groupMarkersByGridCell(controller.markers.filter((m) => m.isGuestMasked))
          .find((c) => c.id === id) || null;
      }
      return null;
    }, [controller.markers, controller.selectedMarkerId]);
    const detailOpen = Boolean(selectedMarker);
    const closeDetail = () => controller.setSelectedMarkerId(undefined);

    /* ── 左下角那三個數字 ────────────────────────────────────────────────
     *
     * 🔴 2026-09-11 回報兩件事，是同一段程式的兩個毛病：
     *   ①「任務單數量新增不會連動」—— 這裡讀的是 `D.TICKETS`（**只有 mock**），
     *      前台剛建的那張單存在 bridge 裡，從來沒被算進去；
     *      而且 `useMemo` 的 deps 是 `[]`，就算資料變了也永遠不重算。
     *   ②「志工數量是怎麼算的」—— 原本分子是 mock 寫死的 `matchedVolunteers` 加總，
     *      **與實際承接完全無關**：有人真的按了「接這筆」，這個數字一動也不動。
     *
     * 🔒 改成跟卡片上那些進度條**同一個來源**：逐筆需求問 `getNeedState`
     *    （它會先看 bridge 的承接紀錄，沒有才退回 mock 的基準值）。
     *    畫面上兩個地方講同一件事，就必須用同一份算式 ——
     *    否則使用者會看到卡片說「3/8」而總覽說別的數字，而他無從判斷哪個是對的。
     *
     * 分母 `volunteerTarget`：未填數量的需求以 1 計（與卡片一致）。
     * ⚠️ 這個估值只用於顯示，`ticket_tasks.quantity` 仍然誠實地存 null。 */
    const bridgeVersion = window.WGBridge.useBridgeVersion();
    const stats = useMemo(() => {
      const site = window.WGBridge.readSiteTickets();
      const all = D.TICKETS
        .map((t) => ({ id: t.uuid, status: t.status, title: t.title, tasks: t.tasks || [] }))
        .concat(site.map((t) => ({ id: t.id, status: t.status, title: t.title, tasks: t.tasks || [] })));
      const open = all.filter((t) => t.status !== 'cancelled');
      let matched = 0, target = 0;
      open.forEach((t) => {
        const st = getTaskMatchState({ id: t.id, title: t.title, tasks: t.tasks });
        matched += st.matched || 0;
        target += st.required || 0;
      });
      return {
        ticketCount: open.length,
        volunteerMatched: matched,
        volunteerTarget: target,
        stationCount: D.STATIONS.filter((s) => s.visibility === 'public').length,
      };
    }, [bridgeVersion, getTaskMatchState]);

    /* marker 一出現就選中並開詳情，讓使用者立刻看到自己剛建的那一張。 */
    React.useEffect(() => {
      if (!pendingSelectId) return;
      if (!sourceMarkers.some((m) => m.id === pendingSelectId)) return;
      controller.setSelectedMarkerId(pendingSelectId);
      setPendingSelectId(null);
    }, [pendingSelectId, sourceMarkers]);

    /* ── 直立地圖：同址多樓層 ──────────────────────────────────────────
       🔒 訪客一律看不到矩陣（`SiteData.GUEST_CAN_SEE_MATRIX`，此處為 `D`；Q7 尚未裁示，
          走最保守的一路）。就算之後改成 true，資料層對訪客根本不放 floor／room
          進物件，所以訪客拿到的會是一張全部落在「未定位」的矩陣 ——
          要真的讓訪客看到分層資訊，得先解決後端沒有欄位級遮罩這件事。 */
    const [buildingOpen, setBuildingOpen] = useState(null);
    /* 從矩陣某一格起手建單時，把「哪一戶」帶進表單。 */
    const [seedCell, setSeedCell] = useState(null);
    const selectedBuilding = useMemo(() => {
      if (!window.WGBridge || !selectedMarker) return null;
      if (selectedMarker.detailType !== 'ticket') return null;
      if (!session.isAuthenticated && !D.GUEST_CAN_SEE_MATRIX) return null;
      const addr = selectedMarker.ticketMeta && selectedMarker.ticketMeta.address;
      return addr ? window.WGBridge.buildingForAddress(addr) : null;
    }, [selectedMarker, session.isAuthenticated, bridgeVersion]);

    /* 這一棟底下的**全部**任務單（含已結案、不受分頁影響）——
       理由見 site-data.js `queryBuildingMarkers` 的註解：濾掉結案的單會讓
       那一格變白，跟「從頭到尾沒人通報」混為一談。 */
    const buildingMarkers = useMemo(
      () => D.queryBuildingMarkers(buildingOpen, { isAuthenticated: session.isAuthenticated }),
      [buildingOpen, session.isAuthenticated, bridgeVersion]);

    const openShare = (marker) => setShareTarget(createPointShareTarget({ marker, module, state, origin: window.location.origin + window.location.pathname }));
    const detailProps = selectedMarker ? {
      marker: selectedMarker,
      onClose: closeDetail,
      isAuthenticated: session.isAuthenticated,
      reports: reportsByStationId[selectedMarker.id],
      taskMatch: selectedMarker.detailType === 'ticket' ? getTaskMatchState(selectedMarker) : undefined,
      canDeleteMatchSheet: selectedMarker.detailType === 'ticket' && session.isAuthenticated
        && selectedMarker.ticketMeta.createdBy === session.userId,
      onSelectMember: (id) => controller.setSelectedMarkerId(id),
      onSuggestUpdate: () => setReportStation(selectedMarker),
      onShare: () => openShare(selectedMarker),
      viewerId: session.userId,
      onClaimNeed: (task) => claimNeedAndNudge(selectedMarker, task),
      onDeleteMatchSheet: () => setPendingDelete(selectedMarker),
      /* 直立地圖（2026-09-12）：這個地址有沒有被後台開成「幾樓幾戶」。
         沒開就是 null，詳情面板照原本的單張單流程走，什麼都不多出來。 */
      building: selectedBuilding,
      onOpenBuilding: selectedBuilding ? () => setBuildingOpen(selectedBuilding) : undefined,
    } : null;

    const drawerWidth = R.RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH;

    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid',
        gridTemplateColumns: !isMobile && detailOpen ? 'minmax(0,1fr) ' + drawerWidth + 'px' : 'minmax(0,1fr) 0',
        gridTemplateRows: 'minmax(0,1fr)', overflow: 'hidden',
        transition: 'grid-template-columns var(--duration-base) var(--ease-out)' }}>
        <div style={{ gridColumn: 1, gridRow: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
          <RescueMapCanvas controller={controller} onSelectMarker={controller.setSelectedMarkerId} />
          <SiteMapControls controller={controller} isMobile={isMobile} />
        {/* 點地圖空白處浮出的動作泡泡。未登入也顯示 —— 擋在送出前，不擋在入口前。 */}
          {/* 十字準星：標出「剛剛點到的到底是哪一點」。
              沒有它的話，泡泡浮在上方 12px，使用者無法確認基準點落在哪裡 ——
              而這個點會直接變成任務單的地標，錯了就是救援端導航到錯的地方。
              pointerEvents:none 讓它不擋住底下的地圖互動。 */}
          {blankSpot ? (
            <div aria-hidden="true" style={{ position: 'absolute', zIndex: 899, pointerEvents: 'none',
              left: blankSpot.point[0], top: blankSpot.point[1], transform: 'translate(-50%, -50%)' }}>
              <svg width="44" height="44" viewBox="0 0 44 44">
                {/* 外圈用白色描邊墊底，深色底圖上也看得見 */}
                <circle cx="22" cy="22" r="13" fill="none" stroke="#fff" strokeWidth="4" opacity=".9" />
                <circle cx="22" cy="22" r="13" fill="none" stroke="var(--color-bg-primary)" strokeWidth="2" />
                <line x1="22" y1="2" x2="22" y2="13" stroke="#fff" strokeWidth="4" opacity=".9" />
                <line x1="22" y1="31" x2="22" y2="42" stroke="#fff" strokeWidth="4" opacity=".9" />
                <line x1="2" y1="22" x2="13" y2="22" stroke="#fff" strokeWidth="4" opacity=".9" />
                <line x1="31" y1="22" x2="42" y2="22" stroke="#fff" strokeWidth="4" opacity=".9" />
                <line x1="22" y1="2" x2="22" y2="13" stroke="var(--color-bg-primary)" strokeWidth="2" />
                <line x1="22" y1="31" x2="22" y2="42" stroke="var(--color-bg-primary)" strokeWidth="2" />
                <line x1="2" y1="22" x2="13" y2="22" stroke="var(--color-bg-primary)" strokeWidth="2" />
                <line x1="31" y1="22" x2="42" y2="22" stroke="var(--color-bg-primary)" strokeWidth="2" />
                <circle cx="22" cy="22" r="2.5" fill="var(--color-bg-primary)" />
              </svg>
            </div>
          ) : null}

          {blankSpot ? (
            <div style={{ position: 'absolute', zIndex: 900,
              left: blankSpot.point[0], top: blankSpot.point[1],
              transform: 'translate(-50%, calc(-100% - 30px))', pointerEvents: 'auto' }}>
              <button type="button"
                onClick={() => {
                  setSeedLandmark({ lat: blankSpot.lat, lng: blankSpot.lng, source: 'manual' });
                  setNewTicketOpen(true);
                  setBlankSpot(null);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 var(--space-4)',
                  borderRadius: 'var(--radius-full)', border: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: 'var(--color-bg-primary)', color: 'var(--color-fg-on-primary)',
                  boxShadow: 'var(--shadow-lg)', font: '700 var(--fs-13)/1.2 var(--font-body)',
                  animation: 'wgPop var(--duration-fast) var(--ease-spring)' }}>
                <WGIcon n="MapPinPlus" s={16} />在這裡新增
              </button>
            </div>
          ) : null}

          <RescueMapFloatingActions stats={stats} isMobile={isMobile} />
          {!live.hasFetchedOnce && live.isFetching ? <RescueMapStatusMessage message="正在載入救災圖資…" /> : null}
          {live.hasFetchedOnce && controller.markers.length === 0 ? (
            <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 1250,
              padding: 'var(--space-3) var(--space-6)', borderRadius: 'var(--radius-full)',
              background: 'var(--color-bg-neutral-default)', border: '1px solid var(--color-border-default)',
              boxShadow: 'var(--shadow-md)', font: '400 var(--fs-13)/1.5 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
              目前視角內沒有符合條件的{R.SITE_DATA_TYPE_LABELS[controller.dataType || 'station']}
            </div>
          ) : null}
        </div>

        {!isMobile ? (
          <div style={{ gridColumn: 2, gridRow: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: drawerWidth, height: '100%' }}>
              {detailProps ? <SiteDetailDrawer {...detailProps} /> : null}
            </div>
          </div>
        ) : null}

        {isMobile && detailProps ? (
          <WGPortal>
          <div style={{ position: 'fixed', top: 'var(--wg-banner-h, 0px)', left: 0, right: 0, bottom: 0, zIndex: 1450 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.42)' }} onClick={closeDetail}></div>
            <div style={{ position: 'absolute', inset: 0, animation: 'wgSlideIn var(--duration-base) var(--ease-out)' }}>
              <SiteDetailDrawer {...detailProps} />
            </div>
          </div>
          </WGPortal>
        ) : null}

        <RescueMapLayerPanel controller={controller} />
        <SiteStationReportDrawer open={Boolean(reportStation)} station={reportStation}
          reports={reportStation ? reportsByStationId[reportStation.id] : []}
          onClose={() => setReportStation(null)}
          onSubmit={(values) => { submitStationReport(reportStation, values); setReportStation(null); }} />
        <TaskMatchDeleteConfirmDialog open={Boolean(pendingDelete)} task={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = deleteMatchSheet(pendingDelete);
            setDismissed((cur) => [...cur, id]);
            if (controller.selectedMarkerId === id) controller.setSelectedMarkerId(undefined);
            setPendingDelete(null);
          }} />
        {/* 條件掛載（非 open prop）：每次開啟都要是全新 mount，
            否則 LocationPicker 會在地圖帶入的座標之前先自動抓 GPS 蓋掉它。
            詳見 site-actions.jsx 的 SiteTicketCreateDrawer 註解。 */}
        {newTicketOpen ? (
          <SiteTicketCreateDrawer isAuthenticated={session.isAuthenticated} viewerId={session.userId}
            seedLandmark={seedLandmark} seedCell={seedCell}
            onClose={() => { setNewTicketOpen(false); setSeedLandmark(null); setSeedCell(null); }}
            onSignIn={() => { setNewTicketOpen(false); window.location.hash = '#/sign-in'; }}
            onSubmit={(values) => {
              const ticket = createSiteTicket({ ...values, userId: session.userId });
              setNewTicketOpen(false);
              setSeedLandmark(null);
              setSeedCell(null);
              setCreatedTicket(ticket);
              setPendingSelectId(ticket.id);
              setToastOpen(true);
              /* 使用者可能正在看「站點」維度，新單是任務 —— 不切過去就等於送出後看不到。
                 同時清掉子分類篩選，否則新單可能被篩掉。 */
              if ((state.dataType || R.SITE_FALLBACK_DATA_TYPE) !== 'ticket' || (state.subDataTypes || []).length) {
                replace({ ...state, dataType: 'ticket', subDataTypes: undefined, selectedMarkerId: undefined });
              }

            }} />
        ) : null}
        {window.BuildingDrawer ? (
          <BuildingDrawer open={Boolean(buildingOpen)} building={buildingOpen}
            markers={buildingMarkers} getTaskMatchState={getTaskMatchState}
            viewerId={session.userId} isAuthenticated={session.isAuthenticated}
            onClose={() => setBuildingOpen(null)}
            onClaimNeed={claimNeedAndNudge}
            onOpenTicket={(mk) => { setBuildingOpen(null); controller.setSelectedMarkerId(mk.id); }}
            onCreateAtCell={(cell) => {
              /* 從矩陣的某一格起手建單：帶著樓層與戶室進表單（Q16 解讀 A）。
                 地標座標用整棟的座標 —— 同一棟的每一戶經緯度本來就一樣，
                 真正指認「哪一戶」的是 floor/room，不是座標。 */
              setBuildingOpen(null);
              setSeedCell({ building: buildingOpen, floor: cell.floor, unit: cell.unit });
              setSeedLandmark({ lat: buildingOpen.lat, lng: buildingOpen.lng, source: 'building' });
              setNewTicketOpen(true);
            }} />
        ) : null}
        <PointShareDrawer open={Boolean(shareTarget)} target={shareTarget} onClose={() => setShareTarget(null)} />


        <MyTasksDrawer open={myTasksOpen} viewerId={session.userId}
          createdTickets={myCreated} claimedRows={myClaimRows}
          onClose={() => setMyTasksOpen(false)}
          onOpenTicket={(id) => { setMyTasksOpen(false); controller.setSelectedMarkerId(id); }}
          onRelease={(row) => releaseClaim(row.ticketId, row.taskId, row.required)} />

        {/* 我回報的站點。點「看這個站點」會切到站點維度並開啟該站詳情 ——
            只設 selectedMarkerId 的話，使用者停在任務維度時會完全沒有反應。 */}
        <RoleElevationDrawer open={roleOpen} viewerId={session.userId}
          onClose={() => setRoleOpen(false)} />

        <StationReportsDrawer open={reportsOpen} viewerId={session.userId}
          onClose={() => setReportsOpen(false)}
          onOpenStation={(id) => {
            setReportsOpen(false);
            if (controller.dataType !== 'station') controller.setDataType('station');
            controller.setSelectedMarkerId(id);
          }} />

        <SiteToast open={toastOpen}
          /* 🔒 2026-09-10：**「一張單有多筆需求」這個結構第一次出現在這裡，不在表單裡。**
             填的時候他只是在說「我需要什麼」；送出之後才需要知道
             「我剛剛講的是 N 件事，志工會一件一件來接」——
             那時候這個結構是**好消息**（不用等一個人全包），不是要先學會的規則。 */
          title="你的求助單已送出"
          description={createdTicket
            ? (createdTicket.tasks && createdTicket.tasks.length > 1
                ? '裡面有 ' + createdTicket.tasks.length + ' 件事情等人來幫，志工會一件一件承接。'
                : '志工現在就看得到，可以直接承接。')
              + '　單號 ' + createdTicket.id
            : ''}
          actionLabel="查看"
          onAction={() => { if (createdTicket) controller.setSelectedMarkerId(createdTicket.id); setToastOpen(false); }}
          onClose={() => setToastOpen(false)} />
        {/* 承接成功 → 行前資訊（VB-FEAT-001）。與建單成功那一則互斥出現的機率很低，
            真的同時發生時後掛的這一則疊在上面，也還是看得到。 */}
        <SiteToast open={Boolean(claimedNeed)}
          title={'已承接　' + ((claimedNeed && claimedNeed.name) || '')}
          description="出發前先看行前資訊：怎麼過來、帶什麼、到了找誰。"
          actionLabel="看行前資訊"
          onAction={() => { window.location.href = window.BRIEFING_HREF; }}
          onClose={() => setClaimedNeed(null)} />
      </div>
    );
  }

  Object.assign(window, { SiteMapView, SiteMapControls, RescueMapCanvas, RescueMapLayerPanel, RescueMapFloatingActions, RescueMapStatusMessage, useSiteMapLiveData, createMapMarkerIcon });
})();
