'use client';

import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';

import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Box, Drawer, GlobalStyles } from '@mui/material';
import dynamic from 'next/dynamic';

import type {
  StationDetailActionProps,
  StationDetailTabPanels,
} from '../station/station-detail';
import { rescueMapMarkerStyles } from './components/map-marker';
import {
  RescueMapDetailDrawer,
  type RescueMapTicketDetailOverrides,
} from './components/rescue-map-detail-drawer';
import { RescueMapLayerPanel } from './components/rescue-map-layer-panel';
import { RescueMapStatusMessage } from './components/rescue-map-status-message';
import { RescueMapTopBar } from './components/rescue-map-top-bar';
import { RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH } from './constants';
import { designTokens, displayTextSizeCss, withAlpha } from '@rescue-frontend/ui';

import { useRescueMapController } from './hooks/use-rescue-map-controller';
import type {
  RescueMapClosureArea,
  RescueMapControllerValue,
  RescueMapMarkerItem,
  RescueMapRouteState,
  RescueMapViewportStoreLike,
} from './types';

const { color, primitives, radius, shadow } = designTokens;

const RescueMapCanvas = dynamic(
  () =>
    import('./components/rescue-map-canvas').then(
      (module) => module.RescueMapCanvas,
    ),
  {
    ssr: false,
    loading: () => <RescueMapStatusMessage message="救災寶加載地圖中..." />,
  },
);

// 與資料維度無關的靜態全域樣式，避免每次 render 重建樣式物件。
const MAP_STATIC_GLOBAL_STYLES = {
  '.leaflet-container': {
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  '.leaflet-control-attribution': {
    backgroundColor: withAlpha(color.bg.neutral.default, 0.8),
    backdropFilter: 'blur(3px)',
  },
  '.leaflet-control-zoom': {
    display: 'none',
  },
  '.leaflet-control-scale': {
    marginBottom: '16px',
    marginLeft: '16px',
  },
  '.map-marker-cluster-wrapper': {
    background: 'transparent',
    border: 'none',
  },
  '.map-marker-cluster': {
    display: 'grid',
    placeItems: 'center',
    borderRadius: '999px',
    border: `3px solid ${color.bg.neutral.default}`,
    boxShadow: shadow.lg,
    fontWeight: 800,
    lineHeight: 1,
  },
  '.map-marker-cluster--small': {
    width: 42,
    height: 42,
    ...displayTextSizeCss(13),
  },
  '.map-marker-cluster--medium': {
    width: 50,
    height: 50,
    ...displayTextSizeCss(14),
  },
  '.map-marker-cluster--large': {
    width: 58,
    height: 58,
    ...displayTextSizeCss(15),
  },
  '.map-marker-cluster--ticket': {
    color: color.fg.onPrimary,
    background: `linear-gradient(180deg, ${primitives.color.orange[200]} 0%, ${color.bg.primary.default} 100%)`,
  },
  '.map-marker-cluster--station': {
    // Light-to-mid gradient, mirroring the ticket cluster above. It used to run blue-300 → blue-600,
    // which no label colour survives: black hits 2.78:1 at the dark end, white 2.20:1 at the light
    // end. Ending on `secondary` keeps the whole sweep readable with the black label (5.30:1 at the
    // darkest point).
    color: color.fg.onSecondary,
    background: `linear-gradient(180deg, ${primitives.color.blue[200]} 0%, ${color.brand.secondary.default} 100%)`,
  },
  '.map-marker-cluster__count': {
    display: 'block',
    transform: 'translateY(0.5px)',
  },
} as const;

interface MapProps {
  /** 自訂 marker 資料源；未提供時使用預設 mock data。 */
  markers?: readonly RescueMapMarkerItem[];
  /** 受控的路由狀態（前台由網址驅動）。後台不傳則使用內部狀態。 */
  routeState?: RescueMapRouteState;
  /** 受控模式下 UI 互動的寫回回呼（前台用於更新網址）。 */
  onRouteStateChange?: (next: RescueMapRouteState) => void;
  /** 自訂地圖上方控制項。未提供時使用後台預設工具列與 KPI。 */
  renderControls?: (controller: RescueMapControllerValue) => ReactNode;
  /** 自訂任務詳情內容、狀態與 footer 操作。 */
  ticketDetailOverrides?: (
    marker: RescueMapMarkerItem,
  ) => RescueMapTicketDetailOverrides | undefined;
  /** 自訂站點詳情主要操作，前台可用於站點資訊更新建議。 */
  stationDetailAction?: (
    marker: RescueMapMarkerItem,
  ) => StationDetailActionProps | undefined;
  /** 自訂站點詳情次要操作，例如分享。 */
  stationDetailSecondaryAction?: (
    marker: RescueMapMarkerItem,
  ) => StationDetailActionProps | undefined;
  /** 自訂站點詳情分頁內容，例如前台站點評論／待處理建議。 */
  stationDetailTabPanels?: (
    marker: RescueMapMarkerItem,
  ) => StationDetailTabPanels | undefined;
  /** 自訂站點待處理建議數。 */
  stationPendingCorrectionCount?: (
    marker: RescueMapMarkerItem,
  ) => number | undefined;
  /** 是否顯示比例尺。 */
  showScale?: boolean;
  /** 點擊地圖空白處時回傳經緯度。 */
  onMapClick?: (position: [number, number]) => void;
  /** 顯示在地圖上的暫存圖釘。 */
  previewMarker?: RescueMapMarkerItem | null;
  /** 覆寫地圖互動游標。 */
  cursor?: string;
  /** 封閉區域疊圖資料。 */
  closureAreas?: readonly RescueMapClosureArea[];
  /** 以 external store 提供視角狀態，避免拖動時將 viewport 更新擴散到整個 React tree。 */
  viewportStore?: RescueMapViewportStoreLike;
}

export const Map = memo(function Map({
  markers,
  routeState,
  onRouteStateChange,
  renderControls,
  ticketDetailOverrides,
  stationDetailAction,
  stationDetailSecondaryAction,
  stationDetailTabPanels,
  stationPendingCorrectionCount,
  showScale = false,
  onMapClick,
  previewMarker,
  cursor,
  closureAreas,
  viewportStore,
}: MapProps = {}) {
  const controller = useRescueMapController({
    routeState,
    onRouteStateChange,
    sourceMarkers: markers,
    closureAreas,
    // 視窗外的標記在地圖上本就不可見，關閉 bbox 過濾讓視角移動不重建 markers。
    filterMarkersByBbox: false,
  });

  const selectedMarker = useMemo(
    () =>
      controller.markers.find(
        (marker) => marker.id === controller.selectedMarkerId,
      ) ?? null,
    [controller.markers, controller.selectedMarkerId],
  );
  const isTicketTone = controller.dataType === 'ticket';
  const globalStyles = useMemo(
    () => ({
      ...rescueMapMarkerStyles,
      ...MAP_STATIC_GLOBAL_STYLES,
      '.leaflet-control-scale-line': {
        padding: '2px 8px',
        // Leaflet's own chrome stays off the display scale — `site.css` pins the scale line,
        // attribution and tooltip to raw px. It is map furniture, not content to be read at arm's
        // length, and it has to fit Leaflet's fixed control geometry.
        fontSize: 11,
        fontWeight: 700,
        color: color.fg.neutral.default,
        lineHeight: '16px',
        background: isTicketTone
          ? color.bg.primary.subtle
          : color.bg.secondary.subtle,
        backdropFilter: 'blur(6px)',
        border: 'none',
        borderTop: `5px solid ${
          isTicketTone ? color.bg.primary.default : color.brand.secondary.default
        }`,
        borderRadius: `0 0 ${radius.md}px ${radius.md}px`,
        boxShadow: shadow.sm,
      },
    }),
    [isTicketTone],
  );

  // 保留最後選取的標記，讓行動版抽屜在關閉動畫期間仍有內容可渲染。
  const [displayMarker, setDisplayMarker] =
    useState<RescueMapMarkerItem | null>(selectedMarker);
  const [detailOpen, setDetailOpen] = useState(Boolean(selectedMarker));

  useEffect(() => {
    if (selectedMarker) {
      setDisplayMarker(selectedMarker);
      setDetailOpen(true);
      return;
    }

    if (!controller.selectedMarkerId) {
      setDetailOpen(false);
    }
  }, [controller.selectedMarkerId, selectedMarker]);

  const closeDetail = () => {
    setDetailOpen(false);
    controller.setSelectedMarkerId(undefined);
  };

  const handleMobileDetailExited = () => {
    if (!detailOpen) {
      setDisplayMarker(null);
    }
  };

  const handleMarkerClick = (marker: RescueMapMarkerItem) => {
    controller.closeLayerPanel();
    controller.setSelectedMarkerId(marker.id);
  };

  return (
    <>
      <Box
        sx={{
          width: '100%',
          height: '100%',
          minHeight: '100%',
          display: 'grid',
          gridTemplateColumns: detailOpen
            ? {
                mobile: 'minmax(0, 1fr) 0',
                tablet: `minmax(0, 1fr) ${RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH}px`,
              }
            : 'minmax(0, 1fr) 0',
          gridTemplateRows: 'minmax(0, 1fr)',
          transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          isolation: 'isolate',
          overflow: 'hidden',
          bgcolor: color.bg.neutral.sunken,
        }}
      >
        <GlobalStyles styles={globalStyles} />
        <Box
          sx={{
            gridColumn: 1,
            gridRow: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <RescueMapCanvas
            controller={controller}
            onMarkerClick={handleMarkerClick}
            previewMarker={previewMarker}
            cursor={cursor}
            onMapClick={onMapClick}
            layoutKey={detailOpen ? 'detail-open' : 'detail-closed'}
            showScale={showScale}
            viewportStore={viewportStore}
          />
          {renderControls ? (
            renderControls(controller)
          ) : (
            <RescueMapTopBar controller={controller} />
          )}
        </Box>

        <Box
          sx={{
            gridColumn: 2,
            gridRow: 1,
            position: 'relative',
            minWidth: 0,
            minHeight: 0,
            display: { mobile: 'none', tablet: 'block' },
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH,
              height: '100%',
            }}
          >
            <RescueMapDetailDrawer
              marker={displayMarker}
              onClose={closeDetail}
              ticketDetailOverrides={
                displayMarker?.detailType === 'ticket'
                  ? ticketDetailOverrides?.(displayMarker)
                  : undefined
              }
              stationAction={
                displayMarker?.detailType === 'station'
                  ? stationDetailAction?.(displayMarker)
                  : undefined
              }
              stationSecondaryAction={
                displayMarker?.detailType === 'station'
                  ? stationDetailSecondaryAction?.(displayMarker)
                  : undefined
              }
              stationPendingCorrectionCount={
                displayMarker?.detailType === 'station'
                  ? stationPendingCorrectionCount?.(displayMarker)
                  : undefined
              }
              stationTabPanels={
                displayMarker?.detailType === 'station'
                  ? stationDetailTabPanels?.(displayMarker)
                  : undefined
              }
            />
          </Box>
        </Box>
      </Box>
      <RescueMapLayerPanel controller={controller} />
      <Drawer
        anchor="right"
        open={detailOpen}
        onClose={closeDetail}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          transition: {
            onExited: handleMobileDetailExited,
          },
        }}
        sx={{
          display: { mobile: 'block', tablet: 'none' },
          '& .MuiDrawer-paper': {
            width: '100vw',
            maxWidth: '100vw',
            height: '100dvh',
            overflow: 'hidden',
            bgcolor: 'transparent',
          },
        }}
      >
        <RescueMapDetailDrawer
          marker={displayMarker}
          onClose={closeDetail}
          ticketDetailOverrides={
            displayMarker?.detailType === 'ticket'
              ? ticketDetailOverrides?.(displayMarker)
              : undefined
          }
          stationAction={
            displayMarker?.detailType === 'station'
              ? stationDetailAction?.(displayMarker)
              : undefined
          }
          stationSecondaryAction={
            displayMarker?.detailType === 'station'
              ? stationDetailSecondaryAction?.(displayMarker)
              : undefined
          }
          stationPendingCorrectionCount={
            displayMarker?.detailType === 'station'
              ? stationPendingCorrectionCount?.(displayMarker)
              : undefined
          }
          stationTabPanels={
            displayMarker?.detailType === 'station'
              ? stationDetailTabPanels?.(displayMarker)
              : undefined
          }
        />
      </Drawer>
    </>
  );
});

Map.displayName = 'Map';

export type {
  RescueMapBaseLayer,
  RescueMapControllerValue,
  RescueMapDataType,
  RescueMapMarkerItem,
  RescueMapOverlayLayer,
  RescueMapRouteState,
} from './types';
export { readRescueMapMarkers } from './mock-data';
