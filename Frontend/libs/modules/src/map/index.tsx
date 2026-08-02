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
import { RescueMapFloatingActions } from './components/rescue-map-floating-actions';
import { RescueMapLayerPanel } from './components/rescue-map-layer-panel';
import { RescueMapStatusMessage } from './components/rescue-map-status-message';
import { RescueMapTopBar } from './components/rescue-map-top-bar';
import { RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH } from './constants';
import { useRescueMapController } from './hooks/use-rescue-map-controller';
import type {
  RescueMapClosureArea,
  RescueMapControllerValue,
  RescueMapMarkerItem,
  RescueMapRouteState,
  RescueMapViewportStoreLike,
} from './types';

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
    backgroundColor: 'rgba(255,255,255,0.76)',
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
    border: '3px solid rgba(255, 255, 255, 0.94)',
    boxShadow: '0 10px 20px rgba(21, 28, 34, 0.22)',
    fontWeight: 800,
    lineHeight: 1,
  },
  '.map-marker-cluster--small': {
    width: 42,
    height: 42,
    fontSize: 13,
  },
  '.map-marker-cluster--medium': {
    width: 50,
    height: 50,
    fontSize: 14,
  },
  '.map-marker-cluster--large': {
    width: 58,
    height: 58,
    fontSize: 15,
  },
  '.map-marker-cluster--ticket': {
    color: '#4C2200',
    background:
      'linear-gradient(180deg, rgba(245, 176, 109, 0.98) 0%, rgba(227, 121, 30, 0.98) 100%)',
  },
  '.map-marker-cluster--station': {
    color: '#F5FAFF',
    background:
      'linear-gradient(180deg, rgba(82, 173, 213, 0.98) 0%, rgba(0, 102, 133, 0.98) 100%)',
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
        fontSize: 11,
        fontWeight: 700,
        color: '#151c22',
        lineHeight: '16px',
        background: isTicketTone ? '#F5E2D7' : '#E8F5FB',
        backdropFilter: 'blur(6px)',
        border: 'none',
        borderTop: `5px solid ${isTicketTone ? '#F37C0E' : '#006493'}`,
        borderRadius: '0 0 12px 12px',
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
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
          bgcolor: '#d3dbe3',
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
            <>
              <RescueMapTopBar controller={controller} />
              <Box
                sx={{
                  display: { mobile: 'none', tablet: 'block' },
                }}
              >
                <RescueMapFloatingActions />
              </Box>
            </>
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
