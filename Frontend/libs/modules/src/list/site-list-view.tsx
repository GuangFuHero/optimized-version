'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { Box, Drawer, Stack, Typography } from '@mui/material';
import { useSession } from 'next-auth/react';

import { RescueMapDetailDrawer } from '../map/components/rescue-map-detail-drawer';
import { RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH } from '../map/constants';
import { useRescueMapController } from '../map/hooks/use-rescue-map-controller';
import type { RescueMapMarkerItem } from '../map/types';
import {
  createPointShareTarget,
  PointShareDrawer,
  type PointShareTarget,
} from '../point-share';
import { SITE_FALLBACK_DATA_TYPE } from '../route';
import { useSiteRouteState } from '../route';
import { SiteDataTypeToggle } from '../route/controls/data-type-toggle';
import { SiteSubTypeFilter } from '../route/controls/sub-type-filter';
import {
  SiteStationReportDrawer,
  StationReportHistoryPanel,
  useStationReports,
} from '../station/report';
import {
  createTaskMatchTicketDetailOverrides,
  TaskMatchDeleteConfirmDialog,
  useTaskMatches,
} from '../ticket/task-match';
import { usePaginatedRescueMapMarkers } from '../map/site';
import { SiteListRow } from './site-list-row';

/**
 * 前台列表模組：與地圖共用路由狀態與篩選邏輯，支援維度切換、子分類篩選與詳情雙向綁定。
 */
export function SiteListView() {
  const { data: session, status: authStatus } = useSession();
  const { module, state, replace } = useSiteRouteState();
  const { reportsByStationId, submitStationReport } = useStationReports();
  const { getTaskMatchState, claimTask, deleteMatchSheet } = useTaskMatches();
  const isAuthenticated = authStatus === 'authenticated';
  const currentUserId =
    session?.user && 'id' in session.user ? (session.user.id ?? null) : null;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const {
    markers: sourceMarkers,
    isFetching,
    dismissMarker,
    hasNextPage,
    loadNextPage,
  } = usePaginatedRescueMapMarkers(state);

  const controller = useRescueMapController({
    routeState: state,
    onRouteStateChange: replace,
    sourceMarkers,
    filterMarkersByOverlayLayers: false,
  });

  const dataType = controller.dataType ?? SITE_FALLBACK_DATA_TYPE;

  const selectedMarker = useMemo(
    () =>
      controller.markers.find(
        (marker) => marker.id === controller.selectedMarkerId,
      ) ?? null,
    [controller.markers, controller.selectedMarkerId],
  );

  const [displayMarker, setDisplayMarker] =
    useState<RescueMapMarkerItem | null>(selectedMarker);
  const [detailOpen, setDetailOpen] = useState(Boolean(selectedMarker));
  const [reportStation, setReportStation] =
    useState<RescueMapMarkerItem | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] =
    useState<RescueMapMarkerItem | null>(null);
  const [shareTarget, setShareTarget] = useState<PointShareTarget | null>(null);

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

  useEffect(() => {
    if (!controller.selectedMarkerId || isFetching) {
      return;
    }

    const hasSelectedMarker = controller.markers.some(
      (marker) => marker.id === controller.selectedMarkerId,
    );

    if (hasSelectedMarker) {
      return;
    }

    setDetailOpen(false);
    controller.setSelectedMarkerId(undefined);
  }, [
    isFetching,
    controller.markers,
    controller.selectedMarkerId,
    controller.setSelectedMarkerId,
  ]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        loadNextPage();
      },
      {
        rootMargin: '320px 0px',
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, loadNextPage]);

  const closeDetail = () => {
    setDetailOpen(false);
    controller.setSelectedMarkerId(undefined);
  };

  const closeReportDrawer = () => {
    setReportStation(null);
  };

  const openPointShare = (marker: RescueMapMarkerItem) => {
    setShareTarget(
      createPointShareTarget({
        marker,
        module,
        state,
        origin: window.location.origin,
      }),
    );
  };

  const createTicketDetailOverrides = (marker: RescueMapMarkerItem) => {
    const taskMatchState = getTaskMatchState(marker);
    const canDeleteMatchSheet =
      Boolean(currentUserId) && marker.ticketMeta?.createdBy === currentUserId;

    return createTaskMatchTicketDetailOverrides({
      marker,
      state: taskMatchState,
      isAuthenticated,
      canDeleteMatchSheet,
      onClaimTask: () => claimTask(marker),
      onDeleteMatchSheet: () => setPendingDeleteTask(marker),
      onShare: () => openPointShare(marker),
    });
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: {
          mobile: 'minmax(0, 1fr) 0',
          tablet: detailOpen
            ? `minmax(0, 1fr) ${RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH}px`
            : 'minmax(0, 1fr) 0',
        },
        gridTemplateRows: 'minmax(0, 1fr)',
        transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        bgcolor: '#f3f5f8',
      }}
    >
      <Box
        sx={{
          gridColumn: 1,
          gridRow: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
            px: { mobile: 2, tablet: 3 },
            py: 2,
            borderBottom: '1px solid #e3e8ee',
            bgcolor: '#fff',
          }}
        >
          <SiteDataTypeToggle
            value={dataType}
            onChange={controller.setDataType}
          />
          <SiteSubTypeFilter
            dataType={dataType}
            selected={controller.subDataTypes}
            onToggle={controller.toggleSubDataType}
          />
          <Typography sx={{ ml: 'auto', fontSize: 13, color: '#564337' }}>
            共 {controller.markers.length} 筆
          </Typography>
        </Box>

        <Box
          sx={{
            minHeight: 0,
            overflowY: 'auto',
            px: { mobile: 2, tablet: 3 },
            py: 2,
          }}
        >
          {controller.markers.length === 0 ? (
            <Stack
              sx={{
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6B7280',
              }}
            >
              <Typography sx={{ fontSize: 14 }}>沒有符合條件的資料</Typography>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              {controller.markers.map((marker) => {
                const taskMatchState =
                  marker.detailType === 'ticket'
                    ? getTaskMatchState(marker)
                    : undefined;

                return (
                  <SiteListRow
                    key={marker.id}
                    marker={marker}
                    active={marker.id === controller.selectedMarkerId}
                    latestReport={reportsByStationId[marker.id]?.[0]}
                    taskMatchState={taskMatchState}
                    isAuthenticated={isAuthenticated}
                    canDeleteMatchSheet={
                      marker.detailType === 'ticket' &&
                      Boolean(currentUserId) &&
                      marker.ticketMeta?.createdBy === currentUserId
                    }
                    onSelect={() => controller.setSelectedMarkerId(marker.id)}
                    onShare={() => openPointShare(marker)}
                    onSuggestUpdate={
                      marker.detailType === 'station'
                        ? () => setReportStation(marker)
                        : undefined
                    }
                    onClaimTask={
                      marker.detailType === 'ticket'
                        ? () => claimTask(marker)
                        : undefined
                    }
                    onDeleteMatchSheet={
                      marker.detailType === 'ticket'
                        && Boolean(currentUserId) &&
                          marker.ticketMeta?.createdBy === currentUserId
                        ? () => setPendingDeleteTask(marker)
                        : undefined
                    }
                  />
                );
              })}
              <Box ref={loadMoreRef} sx={{ height: 1 }} />
              {isFetching ? (
                <Typography
                  sx={{
                    pt: 1,
                    textAlign: 'center',
                    fontSize: 13,
                    color: '#6B7280',
                  }}
                >
                  載入中...
                </Typography>
              ) : null}
            </Stack>
          )}
        </Box>
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
                ? createTicketDetailOverrides(displayMarker)
                : undefined
            }
            stationAction={
              displayMarker?.detailType === 'station'
                ? {
                    label: '建議修改',
                    icon: <EditNoteRoundedIcon />,
                    onClick: () => setReportStation(displayMarker),
                  }
                : undefined
            }
            stationSecondaryAction={
              displayMarker?.detailType === 'station'
                ? {
                    label: '分享',
                    icon: <ShareRoundedIcon />,
                    onClick: () => openPointShare(displayMarker),
                  }
                : undefined
            }
            stationPendingCorrectionCount={
              displayMarker?.detailType === 'station'
                ? (reportsByStationId[displayMarker.id]?.length ?? 0)
                : undefined
            }
            stationTabPanels={
              displayMarker?.detailType === 'station'
                ? {
                    pendingCorrections: (
                      <StationReportHistoryPanel
                        reports={reportsByStationId[displayMarker.id] ?? []}
                      />
                    ),
                  }
                : undefined
            }
          />
        </Box>
      </Box>

      <Drawer
        anchor="right"
        open={detailOpen}
        onClose={closeDetail}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          transition: { onExited: () => setDisplayMarker(null) },
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
              ? createTicketDetailOverrides(displayMarker)
              : undefined
          }
          stationAction={
            displayMarker?.detailType === 'station'
              ? {
                  label: '建議修改',
                  icon: <EditNoteRoundedIcon />,
                  onClick: () => setReportStation(displayMarker),
                }
              : undefined
          }
          stationSecondaryAction={
            displayMarker?.detailType === 'station'
              ? {
                  label: '分享',
                  icon: <ShareRoundedIcon />,
                  onClick: () => openPointShare(displayMarker),
                }
              : undefined
          }
          stationPendingCorrectionCount={
            displayMarker?.detailType === 'station'
              ? (reportsByStationId[displayMarker.id]?.length ?? 0)
              : undefined
          }
          stationTabPanels={
            displayMarker?.detailType === 'station'
              ? {
                  pendingCorrections: (
                    <StationReportHistoryPanel
                      reports={reportsByStationId[displayMarker.id] ?? []}
                    />
                  ),
                }
              : undefined
          }
        />
      </Drawer>

      <SiteStationReportDrawer
        open={Boolean(reportStation)}
        station={reportStation}
        reports={reportStation ? reportsByStationId[reportStation.id] : []}
        onClose={closeReportDrawer}
        onSubmit={(values) => {
          if (!reportStation) {
            return;
          }

          submitStationReport(reportStation, values);
          closeReportDrawer();
        }}
      />
      <TaskMatchDeleteConfirmDialog
        open={Boolean(pendingDeleteTask)}
        task={pendingDeleteTask}
        onCancel={() => setPendingDeleteTask(null)}
        onConfirm={() => {
          if (!pendingDeleteTask) {
            return;
          }

          dismissMarker(deleteMatchSheet(pendingDeleteTask));
          if (controller.selectedMarkerId === pendingDeleteTask.id) {
            controller.setSelectedMarkerId(undefined);
          }
          setPendingDeleteTask(null);
        }}
      />
      <PointShareDrawer
        open={Boolean(shareTarget)}
        target={shareTarget}
        onClose={() => setShareTarget(null)}
      />
    </Box>
  );
}
