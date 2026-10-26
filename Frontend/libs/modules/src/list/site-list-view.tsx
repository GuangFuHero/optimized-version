'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { Box, Drawer, Stack, Typography, useMediaQuery } from '@mui/material';

import { BuildingDrawer } from '../building';
import { RescueMapDetailDrawer } from '../map/components/rescue-map-detail-drawer';
import { RESCUE_MAP_DESKTOP_DETAIL_DRAWER_WIDTH } from '../map/constants';
import { countDetailOpenings } from '../map/detail-openings';
import { useRescueMapController } from '../map/hooks/use-rescue-map-controller';
import type { RescueMapMarkerItem } from '../map/types';
import {
  createPointShareTarget,
  pointForMetadata,
  PointShareDrawer,
  SITE_LIST_METADATA,
  syncDocumentMetadata,
  type PointShareTarget,
} from '../point-share';
import { SITE_FALLBACK_DATA_TYPE } from '../route';
import { useSiteRouteState } from '../route';
import { SiteDataTypeToggle } from '../route/controls/data-type-toggle';
import { SiteControlSurface } from '../route/controls/control-surface';
import { SiteSubTypeFilter } from '../route/controls/sub-type-filter';
import { SiteViewSwitch } from '../route/controls/view-switch';
import { useAuthSession } from '../session/auth-session';
import { NeedClaimProvider, type ReloadedTicket } from '../ticket/needs';
import { createTaskMatchTicketDetailOverrides } from '../ticket/task-match';
import { resolveTicketSearch } from '../ticket/ticket-search';
import { usePaginatedRescueMapMarkers } from '../map/site';
import { SiteListRow } from './site-list-row';
import {
  listTickets,
  showsClosedTickets,
  type ListedTicket,
} from './ticket-list-rules';

import { designTokens, displayTextSize, RowAction } from '@rescue-frontend/ui';

const { color } = designTokens;

const ACTION_ICON = { fontSize: 14 } as const;

/**
 * 前台列表模組：與地圖共用路由狀態與篩選邏輯，支援維度切換、子分類篩選與詳情雙向綁定。
 */
export function SiteListView() {
  const { status: authStatus } = useAuthSession();
  const { module, state, replace } = useSiteRouteState();
  const isAuthenticated = authStatus === 'authenticated';
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const {
    markers: sourceMarkers,
    ticketQuery,
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
    // Tickets were searched by the backend, or wait for a second character; stations still are here.
    filterMarkersBySearch:
      (state.dataType ?? SITE_FALLBACK_DATA_TYPE) !== 'ticket',
  });

  const dataType = controller.dataType ?? SITE_FALLBACK_DATA_TYPE;

  // 含已滿額: full needs, and the tickets left with nothing else, fold away until asked for.
  const [showFullNeeds, setShowFullNeeds] = useState(false);
  // A status filter set to finished or cancelled asks for them outright: nothing left to fold.
  const closedTicketsAsked = showsClosedTickets(controller.subDataTypes);
  const ticketList = useMemo(
    () =>
      dataType === 'ticket'
        ? listTickets(controller.markers, {
            showFull: showFullNeeds || closedTicketsAsked,
            q: ticketQuery,
          })
        : null,
    [
      closedTicketsAsked,
      controller.markers,
      dataType,
      showFullNeeds,
      ticketQuery,
    ],
  );
  const listRows: readonly {
    marker: RescueMapMarkerItem;
    needs?: ListedTicket['needs'];
  }[] = ticketList?.tickets ?? controller.markers.map((marker) => ({ marker }));
  const searchTooShort =
    dataType === 'ticket' &&
    resolveTicketSearch(state.search).kind === 'too-short';

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

  // A ticket found gone (deleted) leaves the list — and, opened from a link past the loaded
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
  const [{ open: detailOpen, openings: detailOpenings }, setDetailOpen] =
    useReducer(countDetailOpenings, {
      open: Boolean(selectedMarker),
      openings: 0,
    });
  // The phone's drawer opens on a phone only. Hidden by CSS on a wider screen, it was still an open
  // modal, and MUI hid the rest of the page — the list, the detail panel — from screen readers.
  const isPhone = useMediaQuery((theme) => theme.breakpoints.down('tablet'));
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

  // The tab's title and the share tags name what is open, as on the map (point-share's
  // document-metadata.ts): picking a card here changes only `?id=`, which the server's
  // generateMetadata never sees.
  useEffect(() => {
    const point = pointForMetadata(controller.selectedMarkerId, selectedMarker);

    if (point === 'reading') {
      return;
    }

    syncDocumentMetadata(
      point
        ? createPointShareTarget({
            marker: point,
            module,
            state,
            origin: window.location.origin,
          })
        : null,
      SITE_LIST_METADATA,
    );
  }, [controller.selectedMarkerId, module, selectedMarker, state]);

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

  // 現場分區: the building a ticket's 看各樓層 opened, shut again on opening one of its tickets.
  const [buildingUuid, setBuildingUuid] = useState<string | null>(null);

  // One of a building's tickets, from its drawer or 上一張／下一張. One the list holds opens as any
  // card does; one it does not — past the loaded pages, or left out by a filter — as a linked one does.
  const openBuildingTicket = (marker: RescueMapMarkerItem) => {
    if (!controller.markers.some((listed) => listed.id === marker.id)) {
      setUnlistedMarker(marker);
    }

    controller.setSelectedMarkerId(marker.id);
  };

  const createTicketDetailOverrides = (marker: RescueMapMarkerItem) =>
    createTaskMatchTicketDetailOverrides({
      marker,
      isAuthenticated,
      onShare: () => openPointShare(marker),
      onOpenBuilding: setBuildingUuid,
      onSelectTicket: openBuildingTicket,
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
          {/* 與地圖頁同一顆（2026-09-18），只在手機：平板以上的側欄已經有地圖與列表（2026-09-21）。 */}
          <SiteControlSurface
            sx={{
              display: { mobile: 'grid', tablet: 'none' },
              width: 44,
              height: 44,
              placeItems: 'center',
            }}
          >
            <SiteViewSwitch module="list" />
          </SiteControlSurface>
          <Stack
            direction="row"
            sx={{ ml: 'auto', alignItems: 'center', gap: 1.5 }}
          >
            {/* The ticket side lists needs, so it counts them: the count matches the lines shown. */}
            <Typography
              sx={{
                fontSize: displayTextSize[13],
                color: color.fg.neutral.subtle,
              }}
            >
              {ticketList
                ? `共 ${ticketList.needCount} 筆需求`
                : `共 ${controller.markers.length} 筆`}
            </Typography>
            {ticketList &&
            ticketList.fullNeedCount > 0 &&
            !closedTicketsAsked ? (
              <RowAction
                icon={
                  showFullNeeds ? (
                    <VisibilityRoundedIcon sx={ACTION_ICON} />
                  ) : (
                    <VisibilityOffRoundedIcon sx={ACTION_ICON} />
                  )
                }
                label={`含已滿額（${ticketList.fullNeedCount}）`}
                aria-pressed={showFullNeeds}
                onClick={() => setShowFullNeeds((current) => !current)}
                // Greyed while off, as the prototype has it — but in readable greys, since it
                // still takes a tap.
                sx={
                  showFullNeeds
                    ? undefined
                    : {
                        color: color.fg.neutral.subtle,
                        background: color.bg.neutral.subtle,
                      }
                }
              />
            ) : null}
          </Stack>
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
          {searchTooShort ? (
            // The backend searches 2 to 50 characters; with one the list stays as it was.
            <Typography
              role="status"
              sx={{
                mb: 1.5,
                fontSize: displayTextSize[13],
                color: color.fg.neutral.subtle,
              }}
            >
              搜尋請輸入至少 2 個字
            </Typography>
          ) : null}
          {/* Not while a page is on its way: every search reloads the list, and it would read
              as empty between keystrokes. Nor while pages remain: the rows so far may all have
              folded away (含已滿額), and only the sentinel below can ask for the next page. */}
          {listRows.length === 0 &&
          hasFetchedOnce &&
          !isFetching &&
          !hasNextPage ? (
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
              {listRows.map(({ marker, needs }) => (
                <SiteListRow
                  key={marker.id}
                  marker={marker}
                  needs={needs}
                  active={marker.id === controller.selectedMarkerId}
                  isAuthenticated={isAuthenticated}
                  onSelect={() => controller.setSelectedMarkerId(marker.id)}
                  onShare={() => openPointShare(marker)}
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
            // A new panel at each opening, so that a ticket opened again is read again (WG-028).
            key={detailOpenings}
            marker={displayMarker}
            onClose={closeDetail}
            ticketDetailOverrides={
              displayMarker?.detailType === 'ticket'
                ? createTicketDetailOverrides(displayMarker)
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
            // The drawer's, which starts under the announcement banner if one is up.
            height: '100%',
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
          stationSecondaryAction={
            displayMarker?.detailType === 'station'
              ? {
                  label: '分享',
                  icon: <ShareRoundedIcon />,
                  onClick: () => openPointShare(displayMarker),
                }
              : undefined
          }
        />
      </Drawer>

      <PointShareDrawer
        open={Boolean(shareTarget)}
        target={shareTarget}
        onClose={() => setShareTarget(null)}
      />

      <BuildingDrawer
        buildingUuid={buildingUuid}
        isAuthenticated={isAuthenticated}
        onClose={() => setBuildingUuid(null)}
        onOpenTicket={(marker) => {
          setBuildingUuid(null);
          openBuildingTicket(marker);
        }}
      />
    </Box>
  );

  // The list keeps its own copy of each ticket — its needs, and its status on the row's badge — so
  // a claim, a release or a stop made in a row or in the drawer is reported back here to update
  // that ticket's row.
  return <NeedClaimProvider onTicketReloaded={showReloadedTicket}>{view}</NeedClaimProvider>;
}
