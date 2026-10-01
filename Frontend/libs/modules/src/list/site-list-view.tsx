'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { Box, Drawer, Stack, Typography, useMediaQuery } from '@mui/material';
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
import { SiteControlSurface } from '../route/controls/control-surface';
import { SiteSubTypeFilter } from '../route/controls/sub-type-filter';
import { SiteViewSwitch } from '../route/controls/view-switch';
import {
  SiteStationReportDrawer,
  StationReportHistoryPanel,
  useStationReports,
} from '../station/report';
import { NeedClaimProvider, type ReloadedTicket } from '../ticket/needs';
import { createTaskMatchTicketDetailOverrides } from '../ticket/task-match';
import { usePaginatedRescueMapMarkers } from '../map/site';
import { SiteListRow } from './site-list-row';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color } = designTokens;

/**
 * 前台列表模組：與地圖共用路由狀態與篩選邏輯，支援維度切換、子分類篩選與詳情雙向綁定。
 */
export function SiteListView() {
  const { status: authStatus } = useSession();
  const { module, state, replace } = useSiteRouteState();
  const { reportsByStationId, submitStationReport } = useStationReports();
  const isAuthenticated = authStatus === 'authenticated';
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const {
    markers: sourceMarkers,
    isFetching,
    hasFetchedOnce,
    hasNextPage,
    loadNextPage,
    loadTicketMarker,
    replaceTicket,
  } = usePaginatedRescueMapMarkers(state);

  const controller = useRescueMapController({
    routeState: state,
    onRouteStateChange: replace,
    sourceMarkers,
    filterMarkersByOverlayLayers: false,
  });

  const dataType = controller.dataType ?? SITE_FALLBACK_DATA_TYPE;

  // A linked ticket that no loaded page holds — the list loads a page at a time — fetched on its
  // own so its drawer still opens.
  const [unlistedMarker, setUnlistedMarker] =
    useState<RescueMapMarkerItem | null>(null);
  // The last selection seen in the list. One that drops out of it afterwards was filtered out.
  const listedSelectionRef = useRef<string | undefined>(undefined);

  const selectedMarker = useMemo(
    () =>
      controller.markers.find(
        (marker) => marker.id === controller.selectedMarkerId,
      ) ??
      (unlistedMarker?.id === controller.selectedMarkerId
        ? unlistedMarker
        : null),
    [controller.markers, controller.selectedMarkerId, unlistedMarker],
  );

  // A ticket found gone (deleted, B's S7) leaves the list — and, opened from a link past the loaded
  // pages, its looked-up copy too: the selection then has nothing left to show, and its drawer
  // shuts the way a ticket filtered out does.
  const showReloadedTicket = useCallback(
    (ticketUuid: string, reloaded: ReloadedTicket | null) => {
      if (!reloaded) {
        setUnlistedMarker((current) =>
          current?.id === ticketUuid ? null : current,
        );
      }

      replaceTicket(ticketUuid, reloaded);
    },
    [replaceTicket],
  );

  const [displayMarker, setDisplayMarker] =
    useState<RescueMapMarkerItem | null>(selectedMarker);
  const [detailOpen, setDetailOpen] = useState(Boolean(selectedMarker));
  // The phone's drawer opens on a phone only. Hidden by CSS on a wider screen, it was still an open
  // modal, and MUI hid the rest of the page — the list, the detail panel — from screen readers.
  const isPhone = useMediaQuery((theme) => theme.breakpoints.down('tablet'));
  const [reportStation, setReportStation] =
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
    const selectedId = controller.selectedMarkerId;

    // Before the first page is in, every ticket looks missing: judged then, a link straight to one
    // found an empty list and closed its drawer.
    if (!selectedId || !hasFetchedOnce || isFetching) {
      return;
    }

    if (controller.markers.some((marker) => marker.id === selectedId)) {
      listedSelectionRef.current = selectedId;
      return;
    }

    if (unlistedMarker?.id === selectedId) {
      return;
    }

    const clearSelection = () => {
      setDetailOpen(false);
      controller.setSelectedMarkerId(undefined);
    };

    // Listed before and gone now: a filter left it out, and the drawer goes with it. Never listed:
    // a link to a ticket past the loaded pages, looked up on its own. Stations are not looked up.
    if (dataType !== 'ticket' || listedSelectionRef.current === selectedId) {
      clearSelection();
      return;
    }

    let cancelled = false;

    void loadTicketMarker(selectedId).then((marker) => {
      if (cancelled) {
        return;
      }

      if (marker) {
        setUnlistedMarker(marker);
        return;
      }

      clearSelection();
    });

    return () => {
      cancelled = true;
    };
  }, [
    dataType,
    hasFetchedOnce,
    isFetching,
    loadTicketMarker,
    unlistedMarker,
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

  const createTicketDetailOverrides = (marker: RescueMapMarkerItem) =>
    createTaskMatchTicketDetailOverrides({
      marker,
      isAuthenticated,
      onShare: () => openPointShare(marker),
    });

  const view = (
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
        bgcolor: color.bg.neutral.subtle,
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
            borderBottom: `1px solid ${color.border.default}`,
            bgcolor: color.bg.neutral.default,
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
          {/* 與地圖頁同一顆（2026-09-18）。兩頁都要有，否則從列表回地圖又得開漢堡選單。 */}
          <Box sx={{ display: { mobile: 'none', tablet: 'flex' } }}>
            <SiteViewSwitch module="list" variant="segmented" />
          </Box>
          <SiteControlSurface
            sx={{
              display: { mobile: 'grid', tablet: 'none' },
              width: 44,
              height: 44,
              placeItems: 'center',
            }}
          >
            <SiteViewSwitch module="list" variant="icon" />
          </SiteControlSurface>
          <Typography sx={{ ml: 'auto', fontSize: displayTextSize[13], color: color.fg.neutral.subtle }}>
            共 {controller.markers.length} 筆
          </Typography>
        </Box>

        <Box
          sx={{
            minHeight: 0,
            overflowY: 'auto',
            px: { mobile: 2, tablet: 3 },
            pt: 2,
            // On a phone the last card scrolls clear of the floating 請求協助 (52px, 16px up).
            pb: {
              mobile: 'calc(84px + env(safe-area-inset-bottom, 0px))',
              tablet: 2,
            },
          }}
        >
          {controller.markers.length === 0 ? (
            <Stack
              sx={{
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                color: color.fg.neutral.muted,
              }}
            >
              <Typography sx={{ fontSize: displayTextSize[14] }}>沒有符合條件的資料</Typography>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              {controller.markers.map((marker) => (
                <SiteListRow
                  key={marker.id}
                  marker={marker}
                  active={marker.id === controller.selectedMarkerId}
                  latestReport={reportsByStationId[marker.id]?.[0]}
                  isAuthenticated={isAuthenticated}
                  onSelect={() => controller.setSelectedMarkerId(marker.id)}
                  onShare={() => openPointShare(marker)}
                  onSuggestUpdate={
                    marker.detailType === 'station'
                      ? () => setReportStation(marker)
                      : undefined
                  }
                />
              ))}
              <Box ref={loadMoreRef} sx={{ height: 1 }} />
              {isFetching ? (
                <Typography
                  sx={{
                    pt: 1,
                    textAlign: 'center',
                    fontSize: displayTextSize[13],
                    color: color.fg.neutral.muted,
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
        // Collapsed, the panel still holds the last detail — nothing clears it now that the phone's
        // drawer stays shut here — so keep it out of reach of the keyboard and screen readers.
        inert={!detailOpen}
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
        open={detailOpen && isPhone}
        onClose={closeDetail}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          // Only once closed for good: widening past the phone's width shuts this drawer while the
          // detail stays open in the panel, which must keep its content (as the map does).
          transition: {
            onExited: () => {
              if (!detailOpen) {
                setDisplayMarker(null);
              }
            },
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
      <PointShareDrawer
        open={Boolean(shareTarget)}
        target={shareTarget}
        onClose={() => setShareTarget(null)}
      />
    </Box>
  );

  // The list keeps its own copy of each ticket — its needs, and its status on the row's badge — so
  // a claim, a release or a stop made in a row or in the drawer is reported back here to update
  // that ticket's row.
  return <NeedClaimProvider onTicketReloaded={showReloadedTicket}>{view}</NeedClaimProvider>;
}
