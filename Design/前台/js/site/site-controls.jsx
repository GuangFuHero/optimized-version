/* site-controls.jsx — 前台共用狀態 + 篩選控制項
 * 對齊 repo：libs/modules/src/route/controls/*、libs/modules/src/map/hooks/use-rescue-map-controller.ts
 * 樣式全部取自 Wan Guard DS token，不使用硬編色值。 */
(function () {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const R = window.SiteRoute;

  /** Lucide 圖示（DS 指定 line icon，2px stroke）。 */
  function WGIcon({ n, s = 20, c = 'currentColor', style }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const host = ref.current;
      if (!host || !window.lucide || !window.lucide[n]) return;
      host.innerHTML = '';
      const el = window.lucide.createElement(window.lucide[n]);
      el.setAttribute('width', s); el.setAttribute('height', s);
      el.setAttribute('stroke', c); el.setAttribute('stroke-width', 2);
      host.appendChild(el);
    }, [n, s, c]);
    return <span ref={ref} aria-hidden="true" style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0, ...style }}></span>;
  }

  /** 把浮層送出外殼的 stacking context（外殼有 isolation:isolate，否則會被 header 蓋住）。 */
  function WGPortal({ children }) {
    return ReactDOM.createPortal(children, document.body);
  }

  /** 網址 ⇄ 狀態的單一來源（對應 useSiteRouteState）。 */
  function useSiteRouteState(module) {
    const [state, setState] = useState(() => R.readRouteFromLocation(module));
    useEffect(() => {
      const onHash = () => setState(R.readRouteFromLocation(module));
      window.addEventListener('hashchange', onHash);
      if (!window.location.hash) R.writeRouteToLocation(module, R.readRouteFromLocation(module));
      return () => window.removeEventListener('hashchange', onHash);
    }, [module]);
    const replace = useCallback((next) => {
      setState(next);
      R.writeRouteToLocation(module, next);
    }, [module]);
    return { module, state, replace };
  }

  const LAYER_PREF_KEY = 'rescue-map:layer-preferences';
  function readLayerPreferences() {
    try {
      const raw = localStorage.getItem(LAYER_PREF_KEY);
      if (!raw) return { enabledOverlayLayers: [...R.DEFAULT_RESCUE_MAP_OVERLAY_LAYERS] };
      const parsed = JSON.parse(raw);
      const set = new Set(Array.isArray(parsed.enabledOverlayLayers) ? parsed.enabledOverlayLayers : R.DEFAULT_RESCUE_MAP_OVERLAY_LAYERS);
      const baseLayer = parsed.baseLayer && R.BASE_LAYER_CONFIG[parsed.baseLayer] && !R.BASE_LAYER_CONFIG[parsed.baseLayer].hidden ? parsed.baseLayer : undefined;
      return { baseLayer, enabledOverlayLayers: R.RESCUE_MAP_OVERLAY_LAYER_ORDER.filter((l) => set.has(l)) };
    } catch {
      return { enabledOverlayLayers: [...R.DEFAULT_RESCUE_MAP_OVERLAY_LAYERS] };
    }
  }

  /** 地圖 / 列表共用控制器：受控於網址狀態，回寫由 onRouteStateChange 處理。 */
  function useRescueMapController({ routeState, onRouteStateChange, sourceMarkers = [], closureAreas: sourceClosureAreas = [], filterMarkersByOverlayLayers = true, filterMarkersByBbox = true }) {
    const [layerPreferences, setLayerPreferences] = useState({ enabledOverlayLayers: [...R.DEFAULT_RESCUE_MAP_OVERLAY_LAYERS] });
    const [layerPanelOpen, setLayerPanelOpen] = useState(false);
    useEffect(() => { setLayerPreferences(readLayerPreferences()); }, []);

    const state = routeState || {};
    const baseLayer = state.baseLayer || layerPreferences.baseLayer || R.SITE_FALLBACK_BASE_LAYER;
    const stateRef = useRef(state);
    stateRef.current = state;
    const commit = useCallback((next) => { stateRef.current = next; onRouteStateChange(next); }, [onRouteStateChange]);

    const updateLayerPreferences = useCallback((updater) => {
      setLayerPreferences((current) => {
        const next = updater(current);
        try { localStorage.setItem(LAYER_PREF_KEY, JSON.stringify(next)); } catch { /* 忽略儲存失敗 */ }
        return next;
      });
    }, []);

    const setBaseLayer = useCallback((layer) => {
      commit({ ...stateRef.current, baseLayer: layer });
      updateLayerPreferences((c) => ({ ...c, baseLayer: layer }));
    }, [commit, updateLayerPreferences]);

    const enabledOverlayLayers = useMemo(
      () => R.RESCUE_MAP_OVERLAY_LAYER_ORDER.filter((l) => (layerPreferences.enabledOverlayLayers || []).includes(l)),
      [layerPreferences.enabledOverlayLayers],
    );

    const toggleOverlayLayer = useCallback((layer) => {
      if (R.OVERLAY_LAYER_CONFIG[layer].disabledReason) return;
      updateLayerPreferences((current) => {
        const set = new Set(current.enabledOverlayLayers || []);
        set.has(layer) ? set.delete(layer) : set.add(layer);
        return { ...current, enabledOverlayLayers: R.RESCUE_MAP_OVERLAY_LAYER_ORDER.filter((l) => set.has(l)) };
      });
    }, [updateLayerPreferences]);

    const setDataType = useCallback((next) => {
      if (stateRef.current.dataType === next) return;
      commit({ ...stateRef.current, dataType: next, subDataTypes: [], selectedMarkerId: undefined });
    }, [commit]);

    const toggleSubDataType = useCallback((value) => {
      const set = new Set(stateRef.current.subDataTypes || []);
      set.has(value) ? set.delete(value) : set.add(value);
      commit({ ...stateRef.current, subDataTypes: [...set] });
    }, [commit]);

    const setSelectedMarkerId = useCallback((id) => {
      commit({ ...stateRef.current, selectedMarkerId: id });
    }, [commit]);

    const setSearch = useCallback((value) => {
      commit({ ...stateRef.current, search: value || undefined });
    }, [commit]);

    const setViewportState = useCallback((next) => {
      const cur = stateRef.current;
      const p = cur.position, b = cur.bbox;
      const sameP = p && p.zoom === next.zoom && p.center[0] === next.center[0] && p.center[1] === next.center[1];
      const sameB = b && b[0] === next.bbox[0] && b[1] === next.bbox[1] && b[2] === next.bbox[2] && b[3] === next.bbox[3];
      if (sameP && sameB) return;
      commit({ ...cur, position: { center: next.center, zoom: next.zoom }, bbox: next.bbox });
    }, [commit]);

    const filterBbox = filterMarkersByBbox ? state.bbox : undefined;
    const markerFilterState = useMemo(() => ({
      dataType: state.dataType, subDataTypes: state.subDataTypes, search: state.search, bbox: filterBbox,
    }), [filterBbox, state.dataType, state.search, state.subDataTypes]);
    const markers = useMemo(() => R.filterRescueMapMarkers(sourceMarkers, markerFilterState), [markerFilterState, sourceMarkers]);
    const closureAreas = useMemo(
      () => (!filterMarkersByOverlayLayers || enabledOverlayLayers.includes('closure-areas') ? [...sourceClosureAreas] : []),
      [enabledOverlayLayers, sourceClosureAreas, filterMarkersByOverlayLayers],
    );
    const initialView = useMemo(() => ({
      center: (state.position && state.position.center) || R.RESCUE_MAP_INITIAL_VIEW.center,
      zoom: (state.position && state.position.zoom) || R.RESCUE_MAP_INITIAL_VIEW.zoom,
    }), []);

    return {
      baseLayer, setBaseLayer, tileLayer: R.BASE_LAYER_CONFIG[baseLayer],
      dataType: state.dataType, setDataType,
      subDataTypes: state.subDataTypes || [], toggleSubDataType,
      search: state.search, setSearch,
      enabledOverlayLayers, toggleOverlayLayer,
      overlayLayerMeta: {
        'closure-areas': { itemCount: sourceClosureAreas.length, sourceLabel: R.OVERLAY_LAYER_CONFIG['closure-areas'].sourceLabel },
        routes: { itemCount: 0, sourceLabel: R.OVERLAY_LAYER_CONFIG.routes.sourceLabel },
        'secondary-locations': { itemCount: 0, sourceLabel: R.OVERLAY_LAYER_CONFIG['secondary-locations'].sourceLabel },
      },
      selectedMarkerId: state.selectedMarkerId, setSelectedMarkerId, setViewportState,
      layerPanelOpen, openLayerPanel: () => setLayerPanelOpen(true), closeLayerPanel: () => setLayerPanelOpen(false),
      markers, closureAreas, initialView,
    };
  }

  /* ── 控制項 ─────────────────────────────────────────────────────────────── */

  const surfaceBase = {
    background: 'var(--color-bg-neutral-default)',
    border: '1px solid var(--color-border-accent)',
    borderRadius: 'var(--radius-full)',
    boxShadow: 'var(--shadow-sm)',
    color: 'var(--color-fg-neutral-default)',
  };

  /** 浮層控制項共用底層（膠囊）。 */
  function SiteControlSurface({ children, style, ...rest }) {
    return <div style={{ ...surfaceBase, ...style }} {...rest}>{children}</div>;
  }

  const segmentStyle = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
    minHeight: 30, padding: '6px 16px', border: '1px solid ' + (active ? 'var(--color-brand-secondary-default)' : 'transparent'),
    borderRadius: 'var(--radius-full)', cursor: 'pointer',
    background: active ? 'var(--color-bg-secondary-subtle)' : 'transparent',
    color: active ? 'var(--color-fg-neutral-default)' : 'var(--color-fg-neutral-subtle)',
    font: '700 var(--fs-12)/1.33 var(--font-latin)', whiteSpace: 'nowrap',
    transition: 'background var(--transition-fast), color var(--transition-fast)',
  });

  /** 站點 / 任務 維度切換 —— 一次只顯示一種維度，地圖與列表共用。 */
  function SiteDataTypeToggle({ value, onChange }) {
    return (
      <SiteControlSurface style={{ display: 'inline-flex', alignItems: 'center', padding: 5, gap: 4 }} role="group" aria-label="資料維度">
        {R.SITE_DATA_TYPES.map((dataType) => (
          <button key={dataType} type="button" aria-pressed={dataType === value}
            onClick={() => onChange(dataType)} style={segmentStyle(dataType === value)}>
            <WGIcon n={dataType === 'station' ? 'Package' : 'ClipboardList'} s={14} />
            {R.SITE_DATA_TYPE_LABELS[dataType]}
          </button>
        ))}
      </SiteControlSurface>
    );
  }

  /** 篩選面板的位置。
   *
   *  ⚠️ `placement: 'up'` 是**必要的**，不是美化 ——
   *  手機把控制列移到螢幕下緣之後，往下開的面板會整個落在畫面外，
   *  按了像沒反應（2026-08-22 回報「篩選無法使用」就是這個）。
   *
   *  手機另外把左右都撐開：`minWidth: 232` 配 `left: 0` 在窄螢幕會往右溢出，
   *  釘選鈕（在最右）點不到。 */
  const buildMenuPanelStyle = (placement) => ({
    position: 'absolute', zIndex: 40,
    ...(placement === 'up'
      ? { bottom: 'calc(100% + 12px)', right: 0, width: 'min(300px, calc(100vw - 24px))' }
      : { top: 'calc(100% + 12px)', left: 0, minWidth: 232 }),
    maxHeight: 'min(60vh, 420px)', maxHeight: 'min(60dvh, 420px)',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'var(--space-2)',
    background: 'var(--color-bg-neutral-default)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
  });

  /** 本檔自己的 isMobile —— `site-actions.jsx` 那支載入順序在本檔之後，用不到。 */
  function useControlsIsMobile() {
    const [m, setM] = useState(() => window.innerWidth < 768);
    useEffect(() => {
      const mq = window.matchMedia('(max-width: 767px)');
      const on = () => setM(mq.matches);
      mq.addEventListener('change', on);
      return () => mq.removeEventListener('change', on);
    }, []);
    return m;
  }

  /* ── 手機的篩選面板：底部抽屜，不是彈出選單 ─────────────────────────────
   *
   * 🔴 2026-09-10 回報：「篩選器在手機打開會被螢幕吃掉一半。」實測比這更糟 ——
   *    在 /map 上整個面板被推到螢幕**左邊外面**（left ≈ -214px），
   *    只看得到最右邊那一排釘選圖示，所有選項文字都在畫面外。
   *
   * 根因：面板是 `position:absolute; right:0`，相對的是那顆 44px 的篩選鈕。
   *    276px 寬的面板靠右對齊一顆位在 x=18 的按鈕，左緣就落在 18+44-276 = -214。
   *    在 /list 上則是另一種壞法：面板從 top:96 一路撐到 844，整頁被蓋掉。
   *
   * 🔒 修法不是「調 offset」，是**換一種容器**。
   *    小螢幕上任何「相對某顆小按鈕定位」的浮層都會撞到邊界 —— 調得好只是這一次不撞。
   *    底部抽屜是固定在**視窗**上的，與按鈕在哪裡無關，所以不可能被推出畫面；
   *    高度也自己封頂（最多 60dvh），剩下的自己捲。
   */
  function SiteFilterSheet({ title, onClose, children }) {
    return (
      <WGPortal>
        {/* 從緊急公告下方開始，不蓋掉它（2026-09-10）。
            `--wg-banner-h` 由 an-banner.jsx 寫入，沒有公告時是 0px。 */}
        <div style={{ position: 'fixed', top: 'var(--wg-banner-h, 0px)', left: 0, right: 0, bottom: 0, zIndex: 2200, display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end' }} role="dialog" aria-modal="true" aria-label={title}>
          <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.42)' }}></div>
          <div style={{ position: 'relative', maxHeight: 'min(60dvh, 460px)', display: 'flex', flexDirection: 'column',
            background: 'var(--color-bg-neutral-default)', borderTopLeftRadius: 'var(--radius-lg)',
            borderTopRightRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border-default)' }}>
              <span style={{ font: '700 var(--fs-15)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>{title}</span>
              <button type="button" aria-label="關閉篩選" onClick={onClose}
                style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'none', border: 0,
                  cursor: 'pointer', borderRadius: 'var(--radius-full)', color: 'var(--color-fg-neutral-subtle)' }}>
                <WGIcon n="X" s={20} />
              </button>
            </div>
            {/* 底部補 safe-area：不補的話最後一列壓在 iPhone 的 home indicator 下面。 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              padding: 'var(--space-2) var(--space-3) calc(var(--space-4) + env(safe-area-inset-bottom, 0px))' }}>
              {children}
            </div>
          </div>
        </div>
      </WGPortal>
    );
  }

  /** 依目前維度提供子分類多選（站點類型 / 任務狀態）＋釘選。 */
  function SiteSubTypeFilter({ dataType, selected, pinned = [], onToggle, onTogglePinned, placement = 'down', compact = false }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const isMobile = useControlsIsMobile();
    const options = R.SITE_SUB_DATA_TYPE_OPTIONS[dataType];
    useEffect(() => {
      if (!open) return;
      /* 手機走底部抽屜（它 render 在 portal 裡，不在 wrapRef 底下），
         關閉由抽屜自己的遮罩負責 —— 這裡再掛 mousedown 會一打開就被關掉。 */
      if (isMobile) {
        const onKeyOnly = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKeyOnly);
        return () => document.removeEventListener('keydown', onKeyOnly);
      }
      const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
      const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open, isMobile]);

    return (
      <div ref={wrapRef} style={{ position: 'relative', width: (placement === 'up' && !compact) ? '100%' : undefined }}>
        <SiteControlSurface style={{ display: 'inline-flex', alignItems: 'center',
          height: compact ? 44 : 40, padding: compact ? '5px' : '5px 9px' }}>
          <button type="button" aria-label="篩選子分類" aria-haspopup="menu" aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 'var(--space-1)', padding: compact ? '0' : '0 4px',
              width: compact ? 34 : undefined, height: compact ? 34 : undefined,
              background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap',
              color: 'var(--color-fg-neutral-default)', font: '700 var(--fs-12)/1.33 var(--font-latin)' }}>
            <WGIcon n="SlidersHorizontal" s={16} />
            {/* compact：底部控制列擠不下四樣東西，篩選收成純圖示。
                計數 badge 一定要留 —— 沒有它使用者不知道自己正在被篩選，
                會以為「怎麼只剩這幾筆」。 */}
            {compact ? null : '篩選'}
            {selected.length > 0 ? (
              <span style={{ marginLeft: 2, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 'var(--radius-full)',
                background: 'var(--color-bg-primary)', color: 'var(--color-fg-on-primary)',
                font: '700 var(--fs-11)/1.64 var(--font-data)', textAlign: 'center' }}>{selected.length}</span>
            ) : null}
          </button>
        </SiteControlSurface>
        {open ? (isMobile ? (
          <SiteFilterSheet title={dataType === 'station' ? '篩選站點用途' : '篩選任務狀態'} onClose={() => setOpen(false)}>
            {renderOptions()}
          </SiteFilterSheet>
        ) : (
          <div role="menu" style={buildMenuPanelStyle(placement)}>{renderOptions()}</div>
        )) : null}
      </div>
    );

    function renderOptions() {
      return (
        <React.Fragment>
            {options.map((option) => {
              const checked = selected.includes(option.value);
              const isPinned = pinned.includes(option.value);
              return (
                <div key={option.value} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center',
                  gap: 'var(--space-2)', borderRadius: 'var(--radius-md)', paddingRight: 4 }}>
                  <button type="button" role="menuitemcheckbox" aria-checked={checked} onClick={() => onToggle(option.value)}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 40, padding: '0 var(--space-2)',
                      background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-md)', textAlign: 'left',
                      color: 'var(--color-fg-neutral-default)', font: '400 var(--fs-14)/1.5 var(--font-body)' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center',
                      border: '1px solid ' + (checked ? 'var(--color-bg-primary)' : 'var(--color-border-default)'),
                      background: checked ? 'var(--color-bg-primary)' : 'var(--color-bg-neutral-default)',
                      color: 'var(--color-fg-on-primary)', flexShrink: 0 }}>
                      {checked ? <WGIcon n="Check" s={13} /> : null}
                    </span>
                    {option.label}
                  </button>
                  {onTogglePinned ? (
                    <button type="button" aria-pressed={isPinned}
                      aria-label={(isPinned ? '取消釘選' : '釘選') + option.label}
                      onClick={() => onTogglePinned(option.value)}
                      style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)', display: 'grid', placeItems: 'center',
                        border: 0, cursor: 'pointer', flexShrink: 0,
                        background: isPinned ? 'var(--color-bg-primary-subtle)' : 'transparent',
                        color: isPinned ? 'var(--color-brand-primary-subtle)' : 'var(--color-fg-neutral-muted)' }}>
                      <WGIcon n="Pin" s={16} />
                    </button>
                  ) : null}
                </div>
              );
            })}
        </React.Fragment>
      );
    }
  }

  /** 已釘選子分類的快捷列（僅地圖使用）。 */
  function SitePinnedFilterRow({ items, selected, onToggle }) {
    if (!items.length) return null;
    const set = new Set(selected);
    return (
      <div style={{ display: 'flex', gap: 'var(--space-2)', maxWidth: '100%', overflowX: 'auto', paddingBottom: 2 }}>
        {items.map((item) => {
          const active = set.has(item.value);
          return (
            <SiteControlSurface key={item.value} style={{ flex: '0 0 auto',
              background: active ? 'var(--color-bg-secondary-subtle)' : 'var(--color-bg-neutral-default)',
              borderColor: active ? 'var(--color-brand-secondary-default)' : 'var(--color-border-accent)' }}>
              <button type="button" aria-pressed={active} onClick={() => onToggle(item.value)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 34, padding: '0 14px',
                  background: 'none', border: 0, cursor: 'pointer', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap',
                  color: active ? 'var(--color-fg-neutral-default)' : 'var(--color-fg-neutral-subtle)',
                  font: (active ? 800 : 700) + ' var(--fs-12)/1.35 var(--font-latin)' }}>
                <WGIcon n={R.STATION_TYPE_ICONS[item.value] || 'Circle'} s={14} />
                {item.label}
              </button>
            </SiteControlSurface>
          );
        })}
      </div>
    );
  }

  const PINNED_KEY = 'site-map:pinned-sub-data-types';
  /** 釘選狀態（依維度分別保存於 localStorage）。 */
  function usePinnedSubDataTypes(dataType) {
    const [byDataType, setByDataType] = useState({ station: [], ticket: [] });
    useEffect(() => {
      try {
        const raw = localStorage.getItem(PINNED_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        setByDataType({
          station: Array.isArray(parsed.station) ? parsed.station : [],
          ticket: Array.isArray(parsed.ticket) ? parsed.ticket : [],
        });
      } catch { /* 忽略讀取失敗 */ }
    }, []);
    const toggle = useCallback((value) => {
      setByDataType((current) => {
        const set = new Set(current[dataType] || []);
        set.has(value) ? set.delete(value) : set.add(value);
        const next = { ...current, [dataType]: R.SITE_SUB_DATA_TYPE_OPTIONS[dataType].map((o) => o.value).filter((v) => set.has(v)) };
        try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); } catch { /* 忽略儲存失敗 */ }
        return next;
      });
    }, [dataType]);
    return { pinned: byDataType[dataType] || [], togglePinned: toggle };
  }

  Object.assign(window, {
    WGIcon, WGPortal, useSiteRouteState, useRescueMapController,
    SiteControlSurface, SiteDataTypeToggle, SiteSubTypeFilter, SitePinnedFilterRow, usePinnedSubDataTypes,
  });
})();
