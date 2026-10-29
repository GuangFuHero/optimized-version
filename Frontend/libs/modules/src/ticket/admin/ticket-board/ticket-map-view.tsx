'use client';

import { Box, ButtonBase, IconButton, Typography } from '@mui/material';
import {
  useTicket,
  useTicketsExtent,
} from '@rescue-frontend/data-access/admin';
import { Badge, Button, Callout, designTokens } from '@rescue-frontend/ui';
import { X } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Map } from '../../../map';
import type {
  RescueMapControllerValue,
  RescueMapMarkerItem,
} from '../../../map/types';
import { stationPoint } from '../../../station/station-point';
import { getTicketPriorityBadge } from '../../status';
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
  TICKET_PRIORITY_PIN_COLORS,
  toTicketMarker,
  withMarkerSelected,
} from './model/ticket-marker';
import type { TicketPin, TicketPriority } from './model/ticket-row';

const { color, radius, shadow, typography } = designTokens;

const MAP_HEIGHT = 560;
const CLUSTER_MAX_ZOOM = 14;
const OVERLAY_INSET = 12;
/** A lone ticket, or the open one, is shown this close. */
const FOCUS_ZOOM = 16;
const FIT_PADDING: [number, number] = [48, 48];
const latLng = ([lat, lng]: MapPoint): [number, number] => [lat, lng];
/** A pan or zoom settles this long before the map asks for the tickets in view. */
const VIEWPORT_DEBOUNCE_MS = 300;

const LEGEND: { priority: TicketPriority; label: string }[] = (
  ['critical', 'high', 'medium', 'low'] as const
).map((priority) => ({ priority, label: ticketPriorityLabel(priority) }));

interface TicketMapViewProps {
  /** The board's filters: the map loads only matching tickets inside its view. */
  filters: TicketFilters;
  selectedUuid: string | null;
  onOpenTicket: (uuid: string) => void;
}

/**
 * Browse-only: pins by priority; a click on a pin opens the ticket, a click on the map does nothing.
 * On opening and on each filter change it frames every matching ticket; from there it loads the
 * matching tickets inside the view, again each time the map settles after a move.
 */
export function TicketMapView({
  filters,
  selectedUuid,
  onOpenTicket,
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
  // Built once per load; a selection change swaps only the marker whose look changes.
  const rowMarkers = useMemo(
    () =>
      rows
        .map((row) => toTicketMarker(row))
        .filter((m): m is RescueMapMarkerItem => m !== null),
    [rows],
  );
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
          無法載入求助單，請稍後再試
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
          {`此範圍有 ${tickets.totalCount} 張求助單，只顯示 ${rows.length} 張，請放大地圖。`}
        </Callout>
      ) : notice === 'none-here' ? (
        <Callout tone="info">
          此範圍沒有符合的求助單
          <Button variant="ghost" size="sm" onClick={framing.frameAgain}>
            顯示全部
          </Button>
        </Callout>
      ) : null}
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
              onOpen={onOpenTicket}
            />
          )}
        />
        <PriorityLegend />
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
  useEffect(() => {
    if (!map) return undefined;
    const read = () => {
      const bounds = map.getBounds();
      setViewport({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
        zoom: map.getZoom(),
      });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(read, VIEWPORT_DEBOUNCE_MS);
    };
    read();
    map.on('moveend', schedule);
    return () => {
      clearTimeout(timer);
      map.off('moveend', schedule);
    };
  }, [map]);
  return viewport;
}

/**
 * A picked pin opens its ticket. A picked cell with several tickets lists them to choose from.
 * The map's selection is cleared either way so the same pin or cell can be picked again.
 */
function SelectionSync({
  controller,
  rows,
  onOpen,
}: {
  controller: RescueMapControllerValue;
  rows: readonly TicketPin[];
  onOpen: (uuid: string) => void;
}) {
  const { selectedMarkerId, setSelectedMarkerId } = controller;
  const [cellUuids, setCellUuids] = useState<string[] | null>(null);
  useEffect(() => {
    if (!selectedMarkerId) return;
    const selection = resolveMapSelection(selectedMarkerId, rows);
    if (selection?.kind === 'ticket') {
      onOpen(selection.uuid);
      setCellUuids(null);
    } else if (selection?.kind === 'cell') {
      setCellUuids(selection.uuids);
    }
    setSelectedMarkerId(undefined);
  }, [selectedMarkerId, rows, onOpen, setSelectedMarkerId]);

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
      aria-label="此區求助單"
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
          此區有 {rows.length} 張求助單
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
          const badge = getTicketPriorityBadge(row.priority);
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

function PriorityLegend() {
  return (
    <Box
      component="ul"
      aria-label="優先度"
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
        優先度
      </Typography>
      {LEGEND.map(({ priority, label }) => (
        <Box
          component="li"
          key={priority}
          sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Box
            component="span"
            sx={{
              width: 13,
              height: 13,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              bgcolor: TICKET_PRIORITY_PIN_COLORS[priority],
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
    </Box>
  );
}
