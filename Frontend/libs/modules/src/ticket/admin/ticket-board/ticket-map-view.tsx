'use client';

import { Box, ButtonBase, IconButton, Typography } from '@mui/material';
import {
  useTicket,
  useTicketsExtent,
} from '@rescue-frontend/data-access/admin';
import { Badge, Button, Callout, designTokens } from '@rescue-frontend/ui';
import { Building2, ChevronRight, X } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';

import { Muted } from '../../../admin/shared/muted';
import { Map } from '../../../map';
import type {
  RescueMapControllerValue,
  RescueMapMarkerItem,
} from '../../../map/types';
import { stationPoint } from '../../../station/station-point';
import { adminTicketPriorityBadge } from './model/ticket-priority';
import { useTicketPins } from './hooks/use-ticket-pins';
import {
  framingMove,
  framingStep,
  selectedFocusStep,
  ticketMapNotice,
  type MapPoint,
} from './model/map-framing';
import { ticketPriorityLabel } from './model/ticket-detail-view';
import {
  toExtentVariables,
  toMapVariables,
  type MapViewport,
  type TicketFilters,
} from './model/ticket-filters';
import {
  resolveMapSelection,
  ticketPriorityLegend,
  toTicketMarker,
  withMarkerSelected,
} from './model/ticket-marker';
import { ticketAddressLine, type TicketPin } from './model/ticket-row';
import { PriorityCell, StatusCell } from './ticket-table';
import type { SpaceListRow } from '../space/space-analysis';
import {
  pinnedTickets,
  SPACE_LEGEND_LABEL,
  spaceIdOfMarker,
  spacesInView,
  toSpaceMarker,
} from '../space/space-map';
import { SpaceTag, StateBadge } from '../space/space-badges';
import { SpaceMapCard } from '../space/space-map-card';

const { color, radius, shadow, typography } = designTokens;

const MAP_HEIGHT = 560;
/** The side list's columns: 任務, 優先級, 狀態 (tk-map's list beside the map). */
const LIST_COLUMNS = 'minmax(0, 1fr) 92px 84px';
const CLUSTER_MAX_ZOOM = 14;
const OVERLAY_INSET = 12;
/** A lone ticket, or the open one, is shown this close. */
const FOCUS_ZOOM = 16;
const FIT_PADDING: [number, number] = [48, 48];
const latLng = ([lat, lng]: MapPoint): [number, number] => [lat, lng];
/** A pan or zoom settles this long before the map asks for the tickets in view. */
const VIEWPORT_DEBOUNCE_MS = 300;

const LEGEND = ticketPriorityLegend(ticketPriorityLabel);

interface TicketMapViewProps {
  /** The board's filters: the map loads only matching tickets inside its view. */
  filters: TicketFilters;
  selectedUuid: string | null;
  onOpenTicket: (uuid: string) => void;
  /** The spaces the filters let through: one square pin each (BE-036). */
  spaces?: readonly SpaceListRow[];
  onOpenSpace?: (uuid: string) => void;
}

const NO_SPACES: readonly SpaceListRow[] = [];

/**
 * Browse-only: the loaded tickets, after the spaces in view, listed beside pins by priority; a click
 * on a list item or a pin opens the ticket or the space, a click on the map does nothing. The open ticket is the list's highlighted item.
 * On opening and on each filter change it frames every matching ticket; from there it loads the
 * matching tickets inside the view, again each time the map settles after a move.
 */
export function TicketMapView({
  filters,
  selectedUuid,
  onOpenTicket,
  spaces = NO_SPACES,
  onOpenSpace,
}: TicketMapViewProps) {
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  const framing = useFrameMatching(leafletMap, filters, selectedUuid);
  // The first load waits for the first framing, so it is of the framed view and not the default.
  const viewport = useMapViewport(framing.ready ? leafletMap : null);
  const variables = useMemo(
    () => (viewport ? toMapVariables(filters, viewport) : {}),
    [filters, viewport],
  );
  const tickets = useTicketPins(variables, { enabled: viewport !== null });
  const rows = tickets.pins;
  const listSpaces = useMemo(
    () => spacesInView(spaces, viewport),
    [spaces, viewport],
  );
  // Built once per load; a selection change swaps only the marker whose look changes. A ticket in
  // a space draws no pin of its own: it shares the space's square one.
  const rowMarkers = useMemo(() => {
    const spaceMarkers = spaces
      .map((space) => toSpaceMarker(space))
      .filter((m): m is RescueMapMarkerItem => m !== null);
    const pinnedSpaceIds = new Set(
      spaceMarkers.map((m) => spaceIdOfMarker(m.id) ?? ''),
    );
    return [
      ...pinnedTickets(rows, pinnedSpaceIds)
        .map((row) => toTicketMarker(row))
        .filter((m): m is RescueMapMarkerItem => m !== null),
      ...spaceMarkers,
    ];
  }, [rows, spaces]);
  const markers = useMemo(
    () => rowMarkers.map((m) => withMarkerSelected(m, m.id === selectedUuid)),
    [rowMarkers, selectedUuid],
  );
  useFocusSelected(leafletMap, rowMarkers, selectedUuid);
  const notice = ticketMapNotice({
    failed: tickets.error != null || framing.failed,
    inViewTotal: tickets.isPlaceholderData ? null : tickets.totalCount,
    shown: rows.length,
    matchingTotal: framing.totalCount,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {notice === 'error' ? (
        <Callout tone="danger">
          無法載入任務單，請稍後再試
          <Button
            variant="ghost"
            size="sm"
            disabled={tickets.isFetching}
            onClick={() => {
              if (tickets.error != null) void tickets.refetch();
              if (framing.failed) framing.retry();
            }}
          >
            重試
          </Button>
        </Callout>
      ) : notice === 'zoom-in' ? (
        <Callout tone="warning">
          {`此範圍有 ${tickets.totalCount} 張任務單，只顯示 ${rows.length} 張，請放大地圖。`}
        </Callout>
      ) : notice === 'none-here' ? (
        <Callout tone="info">
          此範圍沒有符合的任務單
          <Button variant="ghost" size="sm" onClick={framing.frameAgain}>
            顯示全部
          </Button>
        </Callout>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 2fr) minmax(0, 3fr)',
          },
          gap: '16px',
        }}
      >
        <TicketMapList
          rows={rows}
          spaces={listSpaces}
          loading={viewport === null || tickets.isFetching}
          failed={tickets.error != null}
          selectedUuid={selectedUuid}
          onOpen={onOpenTicket}
          onOpenSpace={onOpenSpace}
        />
        <Box
          sx={{
            position: 'relative',
            height: MAP_HEIGHT,
            overflow: 'hidden',
            border: `1px solid ${color.border.default}`,
            borderRadius: `${radius.lg}px`,
          }}
        >
          <Map
            markers={markers}
            hideDetailDrawer
            showZoomControl
            clusterAppearance="solid"
            clusterMaxZoom={CLUSTER_MAX_ZOOM}
            onMapReady={setLeafletMap}
            renderControls={(controller) => (
              <SelectionSync
                controller={controller}
                rows={rows}
                spaces={spaces}
                onOpen={onOpenTicket}
                onOpenSpace={onOpenSpace}
              />
            )}
          />
          <PriorityLegend withSpaces={spaces.length > 0} />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Frames every ticket matching the filters, by the box `ticketsExtent` hands back: once when the
 * map opens and once per filter set, or again on `frameAgain`. Refetches after a write, and the
 * viewport loads that follow each move, leave the view alone. An open ticket keeps the view, as
 * on the station map, unless 顯示全部 asked; no match keeps it too. `ready` turns true once the
 * first framing is decided and the map has settled there (or the extent failed to load).
 */
function useFrameMatching(
  map: LeafletMap | null,
  filters: TicketFilters,
  selectedUuid: string | null,
) {
  const variables = useMemo(() => toExtentVariables(filters), [filters]);
  const extent = useTicketsExtent(variables);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = `${JSON.stringify(variables)}#${attempt}`;
  const framedRef = useRef<string | null>(null);
  const selectedRef = useRef(selectedUuid);
  selectedRef.current = selectedUuid;
  const askedRef = useRef(false);

  const box = extent.data?.ticketsExtent;
  const failed = extent.error != null;
  useEffect(() => {
    if (map && failed) setReady(true);
  }, [map, failed]);
  useEffect(() => {
    if (!map || !box) return;
    const step = framingStep(
      framedRef.current,
      request,
      selectedRef.current !== null && !askedRef.current,
    );
    if (step === 'done') return;
    framedRef.current = request;
    askedRef.current = false;
    const move = framingMove(step, box);
    // Kept, the view is final: the pins load the current view now, not on a moveend.
    if (move.kind === 'stay') {
      setReady(true);
      return;
    }
    // Leaflet ends every setView and fitBounds, even one that does not move, with moveend.
    map.once('moveend', () => setReady(true));
    const { framing } = move;
    if (framing.kind === 'point') {
      map.setView(latLng(framing.point), FOCUS_ZOOM);
    } else {
      map.fitBounds([latLng(framing.southWest), latLng(framing.northEast)], {
        padding: FIT_PADDING,
      });
    }
  }, [map, box, request]);

  return {
    /** The map may load the tickets in view. */
    ready,
    /** Matching tickets anywhere, null until known. */
    totalCount: box?.count ?? null,
    failed,
    retry: () => void extent.refetch(),
    frameAgain: () => {
      askedRef.current = true;
      setAttempt((n) => n + 1);
    },
  };
}

/**
 * Brings an open ticket whose pin is not on the map (a pasted `?ticket=` link, say) into view
 * once its detail has loaded, once per ticket.
 */
function useFocusSelected(
  map: LeafletMap | null,
  markers: readonly RescueMapMarkerItem[],
  selectedUuid: string | null,
) {
  // The detail sheet's own load: the same query, so no second request.
  const detail = useTicket({ uuid: selectedUuid ?? '' });
  const ticket = detail.data?.ticket ?? null;
  const detailLoaded = detail.data !== undefined;
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const focusedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map) return;
    const step = selectedFocusStep({
      selectedUuid,
      focusedUuid: focusedRef.current,
      loadedIds: new Set(markersRef.current.map((m) => m.id)),
      detailLoaded,
      point: ticket ? stationPoint(ticket.geometry) : null,
    });
    if (!step) return;
    focusedRef.current = selectedUuid;
    if (step.point) {
      map.setView(latLng(step.point), Math.max(map.getZoom(), FOCUS_ZOOM));
    }
  }, [map, selectedUuid, detailLoaded, ticket]);
}

/** The area the map shows, settled after each move; null until the map is built. */
function useMapViewport(map: LeafletMap | null): MapViewport | null {
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const settle = useDebounceCallback(setViewport, VIEWPORT_DEBOUNCE_MS);
  useEffect(() => {
    if (!map) return undefined;
    const read = (): MapViewport => {
      const bounds = map.getBounds();
      return {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
        zoom: map.getZoom(),
      };
    };
    const onMoveEnd = () => settle(read());
    setViewport(read());
    map.on('moveend', onMoveEnd);
    return () => {
      settle.cancel();
      map.off('moveend', onMoveEnd);
    };
  }, [map, settle]);
  return viewport;
}

/**
 * A picked pin opens its ticket. A picked cell with several tickets lists them to choose from; a
 * picked space shows its card, whose 「看各樓層」 opens its floors. The map's selection is cleared
 * either way so the same pin or cell can be picked again.
 */
function SelectionSync({
  controller,
  rows,
  spaces,
  onOpen,
  onOpenSpace,
}: {
  controller: RescueMapControllerValue;
  rows: readonly TicketPin[];
  spaces: readonly SpaceListRow[];
  onOpen: (uuid: string) => void;
  onOpenSpace?: (uuid: string) => void;
}) {
  const { selectedMarkerId, setSelectedMarkerId } = controller;
  const [cellUuids, setCellUuids] = useState<string[] | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedMarkerId) return;
    const pickedSpace = spaceIdOfMarker(selectedMarkerId);
    if (pickedSpace) {
      setSpaceId(pickedSpace);
      setCellUuids(null);
      setSelectedMarkerId(undefined);
      return;
    }
    const selection = resolveMapSelection(selectedMarkerId, rows);
    if (selection?.kind === 'ticket') {
      onOpen(selection.uuid);
      setCellUuids(null);
      setSpaceId(null);
    } else if (selection?.kind === 'cell') {
      setCellUuids(selection.uuids);
      setSpaceId(null);
    }
    setSelectedMarkerId(undefined);
  }, [selectedMarkerId, rows, onOpen, setSelectedMarkerId]);

  const space = spaceId ? spaces.find((row) => row.id === spaceId) : undefined;
  if (space) {
    return (
      <SpaceMapCard
        row={space}
        onOpenFloors={(id) => {
          setSpaceId(null);
          onOpenSpace?.(id);
        }}
        onClose={() => setSpaceId(null)}
      />
    );
  }
  const listed = cellUuids
    ? rows.filter((row) => cellUuids.includes(row.uuid))
    : [];
  if (listed.length === 0) return null;
  return (
    <CellTicketList
      rows={listed}
      onPick={onOpen}
      onClose={() => setCellUuids(null)}
    />
  );
}

/**
 * The list beside the map (tk-map's left pane): every ticket the map has loaded for its view, in
 * the order the pins came, as 任務 (title, street line, 開啟任務細節), 優先級 and 狀態. A click opens
 * the ticket as its pin does; the open ticket is highlighted and scrolled into view, wherever it
 * was opened from.
 */
/** A row of the side list, a ticket's or a space's; the open ticket's is highlighted. */
const listItemSx = (selected: boolean) => ({
  width: '100%',
  display: 'grid',
  gridTemplateColumns: LIST_COLUMNS,
  alignItems: 'center',
  gap: '12px',
  p: '12px 16px',
  textAlign: 'left',
  bgcolor: selected ? color.bg.primary.subtle : 'transparent',
  boxShadow: selected ? `inset 3px 0 0 ${color.brand.primary.default}` : 'none',
  '&:hover': {
    bgcolor: selected ? color.bg.primary.subtle : color.bg.neutral.subtle,
  },
});

const linkSx = {
  ...typography.label[300],
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  mt: '4px',
  color: color.brand.secondary.default,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
};

/**
 * The tickets loaded for the view, beside the map, after the spaces whose pin is in it
 * (`tk-table.jsx` map list, `SpaceCard`): spaces first, as on the list's first page.
 */
function TicketMapList({
  rows,
  spaces,
  loading,
  failed,
  selectedUuid,
  onOpen,
  onOpenSpace,
}: {
  rows: readonly TicketPin[];
  spaces: readonly SpaceListRow[];
  loading: boolean;
  failed: boolean;
  selectedUuid: string | null;
  onOpen: (uuid: string) => void;
  onOpenSpace?: (uuid: string) => void;
}) {
  const itemsRef = useRef(new globalThis.Map<string, HTMLElement>());
  useEffect(() => {
    if (!selectedUuid) return;
    itemsRef.current.get(selectedUuid)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedUuid, rows]);

  return (
    <Box
      role="region"
      aria-label="地圖範圍內的任務單"
      sx={{
        height: { xs: 360, md: MAP_HEIGHT },
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.lg}px`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Box
        aria-hidden
        sx={{
          display: 'grid',
          gridTemplateColumns: LIST_COLUMNS,
          gap: '12px',
          p: '12px 16px',
          borderBottom: `1px solid ${color.border.default}`,
          bgcolor: color.bg.neutral.subtle,
          ...typography.label[300],
          color: color.fg.neutral.muted,
        }}
      >
        <span>任務</span>
        <span>優先級</span>
        <span>狀態</span>
      </Box>
      {rows.length === 0 && spaces.length === 0 ? (
        <Box sx={{ p: '24px 16px', textAlign: 'center' }}>
          <Typography
            sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
          >
            {failed ? '—' : loading ? '載入中…' : '此範圍沒有任務單'}
          </Typography>
        </Box>
      ) : (
        <Box
          component="ul"
          sx={{ m: 0, p: 0, listStyle: 'none', overflowY: 'auto', flex: 1 }}
        >
          {spaces.map((space) => (
            <Box
              component="li"
              key={`space:${space.id}`}
              sx={{
                borderBottom: `1px solid ${color.border.default}`,
                bgcolor: color.bg.neutral.subtle,
              }}
            >
              <ButtonBase
                onClick={() => onOpenSpace?.(space.id)}
                disabled={!onOpenSpace}
                sx={listItemSx(false)}
              >
                <Box sx={{ minWidth: 0 }}>
                  <SpaceTag />
                  <Typography
                    noWrap
                    title={space.name}
                    sx={{
                      ...typography.label[400],
                      fontWeight: 700,
                      color: color.fg.neutral.default,
                      mt: '2px',
                    }}
                  >
                    {space.name}
                  </Typography>
                  <Typography
                    noWrap
                    title={space.summary}
                    sx={{
                      ...typography.body[300],
                      color: color.fg.neutral.muted,
                    }}
                  >
                    {space.summary}
                  </Typography>
                  <Typography component="span" sx={linkSx}>
                    看各樓層
                    <ChevronRight size={14} />
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  {space.priority ? (
                    <PriorityCell priority={space.priority} />
                  ) : (
                    <Muted cell>—</Muted>
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <StateBadge state={space.status} />
                </Box>
              </ButtonBase>
            </Box>
          ))}
          {rows.map((row) => {
            const selected = row.uuid === selectedUuid;
            const address = ticketAddressLine(row);
            return (
              <Box
                component="li"
                key={row.uuid}
                ref={(el: HTMLElement | null) => {
                  if (el) itemsRef.current.set(row.uuid, el);
                  else itemsRef.current.delete(row.uuid);
                }}
                sx={{ borderBottom: `1px solid ${color.border.default}` }}
              >
                <ButtonBase
                  onClick={() => onOpen(row.uuid)}
                  aria-current={selected ? 'true' : undefined}
                  sx={listItemSx(selected)}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      noWrap
                      title={row.title}
                      sx={{
                        ...typography.label[400],
                        fontWeight: 700,
                        color: color.fg.neutral.default,
                      }}
                    >
                      {row.title}
                    </Typography>
                    <Typography
                      noWrap
                      title={address}
                      sx={{
                        ...typography.body[300],
                        color: color.fg.neutral.muted,
                      }}
                    >
                      {address}
                    </Typography>
                    <Typography component="span" sx={linkSx}>
                      開啟任務細節
                      <ChevronRight size={14} />
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <PriorityCell priority={row.priority} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <StatusCell status={row.status} />
                  </Box>
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function CellTicketList({
  rows,
  onPick,
  onClose,
}: {
  rows: TicketPin[];
  onPick: (uuid: string) => void;
  onClose: () => void;
}) {
  return (
    <Box
      role="region"
      aria-label="此區任務單"
      sx={{
        position: 'absolute',
        zIndex: 600,
        top: OVERLAY_INSET,
        right: OVERLAY_INSET,
        width: 276,
        maxWidth: `calc(100% - ${OVERLAY_INSET * 2}px)`,
        maxHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        boxShadow: shadow.lg,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          p: '10px 14px',
        }}
      >
        <Typography sx={{ ...typography.label[500], flex: 1 }}>
          此區有 {rows.length} 張任務單
        </Typography>
        <IconButton
          aria-label="關閉"
          onClick={onClose}
          size="small"
          sx={{ width: 24, height: 24, p: 0, color: color.fg.neutral.muted }}
        >
          <X size={14} />
        </IconButton>
      </Box>
      <Box
        component="ul"
        sx={{ m: 0, p: 0, listStyle: 'none', overflowY: 'auto' }}
      >
        {rows.map((row) => {
          const badge = adminTicketPriorityBadge(row.priority);
          return (
            <Box component="li" key={row.uuid}>
              <ButtonBase
                onClick={() => onPick(row.uuid)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  p: '8px 14px',
                  textAlign: 'left',
                  borderTop: `1px solid ${color.border.default}`,
                  '&:hover': { bgcolor: color.bg.neutral.subtle },
                }}
              >
                <Typography
                  noWrap
                  sx={{ ...typography.label[400], minWidth: 0 }}
                >
                  {row.title}
                </Typography>
                {badge ? (
                  <Badge tone={badge.tone} variant={badge.variant}>
                    {badge.label}
                  </Badge>
                ) : null}
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function PriorityLegend({ withSpaces }: { withSpaces: boolean }) {
  return (
    <Box
      component="ul"
      aria-label="優先級"
      sx={{
        position: 'absolute',
        zIndex: 500,
        left: OVERLAY_INSET,
        bottom: 24,
        m: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
        p: '10px 12px',
        borderRadius: `${radius.md}px`,
        boxShadow: shadow.sm,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Typography
        component="li"
        aria-hidden
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          color: color.fg.neutral.muted,
        }}
      >
        優先級
      </Typography>
      {LEGEND.map(({ color: pinColor, label }) => (
        <Box
          component="li"
          key={pinColor}
          sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Box
            component="span"
            sx={{
              width: 13,
              height: 13,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              bgcolor: pinColor,
            }}
          />
          <Typography
            component="span"
            sx={{
              ...typography.label[300],
              color: color.fg.neutral.subtle,
            }}
          >
            {label}
          </Typography>
        </Box>
      ))}
      {withSpaces ? (
        <>
          <Box
            component="li"
            aria-hidden
            sx={{ height: '1px', my: '1px', bgcolor: color.border.default }}
          />
          <Box
            component="li"
            sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Box
              component="span"
              sx={{
                width: 15,
                height: 15,
                borderRadius: `${radius.sm}px`,
                bgcolor: color.fg.neutral.muted,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={10} color={color.bg.neutral.default} />
            </Box>
            <Typography
              component="span"
              sx={{
                ...typography.label[300],
                color: color.fg.neutral.subtle,
              }}
            >
              {SPACE_LEGEND_LABEL}
            </Typography>
          </Box>
        </>
      ) : null}
    </Box>
  );
}
