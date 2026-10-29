'use client';

import { Box, ButtonBase, IconButton, Typography } from '@mui/material';
import { Badge, Button, designTokens } from '@rescue-frontend/ui';
import type { Map as LeafletMap } from 'leaflet';
import {
  ChevronRight,
  Group,
  MapPin,
  MapPinOff,
  PanelRightOpen,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';

import { Map } from '../../../map';
import type {
  RescueMapControllerValue,
  RescueMapMarkerItem,
} from '../../../map/types';
import {
  getPresentStationTypes,
  getStationTypePinColor,
  toStationMarker,
} from './model/station-marker';
import type { StationRow } from './model/station-row';
import { FreshnessCell } from '../../../admin/shared/freshness-cell';
import { StatusBadge } from './station-cells';
import { StationEmptyState } from './station-table';

const { color, radius, shadow, spacing, typography } = designTokens;

/** Prototype `MAP_H` (station-table.jsx): list and map share one fixed height. */
const MAP_HEIGHT = 560;
/** Below this zoom markers merge into clusters (prototype `CLUSTER_MAX_ZOOM`). */
const CLUSTER_MAX_ZOOM = 14;
/** A station picked in the list is shown at least this close. */
const FOCUS_ZOOM = 16;
/** The status column, in the list's header and in each card. */
const LIST_COLUMNS = 'minmax(0, 1fr) 96px';
/** Gap between the map's edge and the overlays on it. */
const OVERLAY_INSET = 12;

interface StationMapViewProps {
  rows: StationRow[];
  hasAnyStation: boolean;
  now: Date;
  selectedUuid: string | null;
  onSelect: (uuid: string | null) => void;
  onOpenStation: (uuid: string) => void;
  /** Set when the viewer may create stations: a click on the map starts one there. */
  onAddAt?: (position: [number, number]) => void;
  onNew?: () => void;
  onImport?: () => void;
}

export function StationMapView({
  rows,
  hasAnyStation,
  now,
  selectedUuid,
  onSelect,
  onOpenStation,
  onAddAt,
  onNew,
  onImport,
}: StationMapViewProps) {
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  const zoom = useMapZoom(leafletMap);
  const markers = useMemo(
    () =>
      rows
        .map((row) => toStationMarker(row, row.uuid === selectedUuid))
        .filter((m): m is RescueMapMarkerItem => m !== null),
    [rows, selectedUuid],
  );
  const legend = useMemo(() => getPresentStationTypes(rows), [rows]);
  const selectedRow = rows.find((row) => row.uuid === selectedUuid) ?? null;

  useFitStations(leafletMap, markers, selectedUuid);
  useFlyToSelected(leafletMap, markers, selectedUuid);

  // The zoom buttons step down below the card while it is open (prototype station-map.jsx:193-199).
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  useLayoutEffect(() => {
    setCardHeight(selectedRow ? (cardRef.current?.offsetHeight ?? 0) : 0);
  }, [selectedRow]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '40fr 60fr' },
        gridAutoRows: `${MAP_HEIGHT}px`,
        gap: `${spacing[3]}px`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          bgcolor: color.bg.neutral.default,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: LIST_COLUMNS,
            gap: '10px',
            p: '10px 14px',
            flexShrink: 0,
            borderBottom: `1px solid ${color.border.default}`,
          }}
        >
          {['站點', '營運狀態'].map((heading) => (
            <Typography
              key={heading}
              sx={{
                ...typography.label[300],
                fontWeight: 700,
                color: color.fg.neutral.muted,
              }}
            >
              {heading}
            </Typography>
          ))}
        </Box>
        <Box
          role="listbox"
          aria-label="站點"
          sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
        >
          {rows.length === 0 ? (
            <StationEmptyState
              hasAnyStation={hasAnyStation}
              onNew={onNew}
              onImport={onImport}
            />
          ) : (
            rows.map((row) => (
              <StationCard
                key={row.uuid}
                row={row}
                now={now}
                selected={row.uuid === selectedUuid}
                onSelect={() => onSelect(row.uuid)}
                onOpen={() => onOpenStation(row.uuid)}
              />
            ))
          )}
        </Box>
      </Box>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          '& .leaflet-top.leaflet-right .leaflet-control-zoom': {
            mt: cardHeight
              ? `${cardHeight + OVERLAY_INSET * 2}px`
              : `${OVERLAY_INSET}px`,
            mr: `${OVERLAY_INSET}px`,
            transition: 'margin-top 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          },
        }}
      >
        <Map
          markers={markers}
          hideDetailDrawer
          showZoomControl
          clusterAppearance="solid"
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          onMapReady={setLeafletMap}
          onMapClick={onAddAt}
          renderControls={(controller) => (
            <SelectionSync
              controller={controller}
              selectedUuid={selectedUuid}
              onSelect={onSelect}
            />
          )}
        />
        {markers.length > 0 && zoom !== null && zoom <= CLUSTER_MAX_ZOOM ? (
          <ClusterHint />
        ) : null}
        {legend.length > 0 ? <TypeLegend types={legend} /> : null}
        {selectedRow ? (
          <SelectedStationCard
            ref={cardRef}
            row={selectedRow}
            onClose={() => onSelect(null)}
            onOpen={() => onOpenStation(selectedRow.uuid)}
          />
        ) : null}
        {hasAnyStation ? null : <EmptyMapNotice canAdd={Boolean(onAddAt)} />}
      </Box>
    </Box>
  );
}

/** The map's zoom, followed as it changes; null until the map is built. */
function useMapZoom(map: LeafletMap | null): number | null {
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    if (!map) return undefined;
    const update = () => setZoom(map.getZoom());
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);
  return zoom;
}

/**
 * Frames the filtered stations whenever the set of points changes — unless one is selected, which
 * the view is then following (prototype station-map.jsx:181-188).
 */
function useFitStations(
  map: LeafletMap | null,
  markers: readonly RescueMapMarkerItem[],
  selectedUuid: string | null,
) {
  const pointsKey = markers
    .map((marker) => `${marker.position[0]},${marker.position[1]}`)
    .join(';');
  const selectedRef = useRef(selectedUuid);
  selectedRef.current = selectedUuid;
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    if (!map || selectedRef.current) return;
    const points = markersRef.current.map((marker) => marker.position);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(points, { padding: [48, 48] });
    }
  }, [map, pointsKey]);
}

/** Brings a newly selected station into view, close enough to see it apart from its neighbours. */
function useFlyToSelected(
  map: LeafletMap | null,
  markers: readonly RescueMapMarkerItem[],
  selectedUuid: string | null,
) {
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    if (!map || !selectedUuid) return;
    const marker = markersRef.current.find((m) => m.id === selectedUuid);
    if (!marker) return;
    map.flyTo(marker.position, Math.max(map.getZoom(), FOCUS_ZOOM), {
      duration: 0.6,
    });
  }, [map, selectedUuid]);
}

const OVERLAY_SX = {
  position: 'absolute',
  zIndex: 500,
  bgcolor: color.bg.neutral.default,
} as const;

/** Prototype station-map.jsx:65-91 — the selected pin's card, top right of the map. */
function SelectedStationCard({
  ref,
  row,
  onClose,
  onOpen,
}: {
  ref: Ref<HTMLDivElement>;
  row: StationRow;
  onClose: () => void;
  onOpen: () => void;
}) {
  return (
    <Box
      ref={ref}
      role="region"
      aria-label={`${row.name} 摘要`}
      sx={{
        ...OVERLAY_SX,
        zIndex: 600,
        top: OVERLAY_INSET,
        right: OVERLAY_INSET,
        width: 276,
        maxWidth: `calc(100% - ${OVERLAY_INSET * 2}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        p: '14px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        boxShadow: shadow.lg,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <Typography
          sx={{
            ...typography.label[500],
            fontSize: 15,
            flex: 1,
            minWidth: 0,
            color: color.fg.neutral.default,
          }}
        >
          {row.name}
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
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <Badge icon={<TypeDot color={getStationTypePinColor(row.type)} />}>
          {row.typeLabel}
        </Badge>
        <StatusBadge status={row.operationalStatus} />
      </Box>
      <Typography
        component="span"
        sx={{
          ...typography.body[300],
          display: 'flex',
          gap: '6px',
          color: color.fg.neutral.subtle,
        }}
      >
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            pt: '3px',
            color: color.fg.neutral.muted,
          }}
        >
          <MapPin size={14} />
        </Box>
        {row.area || '未提供地址'}
      </Typography>
      <Button
        variant="primary"
        size="sm"
        startIcon={<PanelRightOpen size={15} />}
        onClick={onOpen}
      >
        開啟站點細節
      </Button>
    </Box>
  );
}

function TypeDot({ color: fill }: { color: string }) {
  return (
    <Box
      component="span"
      sx={{
        width: 8,
        height: 8,
        borderRadius: `${radius.full}px`,
        bgcolor: fill,
      }}
    />
  );
}

/** Prototype station-map.jsx:210-216 — a pin per type on the map, bottom left. */
function TypeLegend({
  types,
}: {
  types: { type: string; label: string; color: string }[];
}) {
  return (
    <Box
      component="ul"
      aria-label="站點類型"
      sx={{
        ...OVERLAY_SX,
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
      }}
    >
      <Typography
        component="li"
        aria-hidden
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          letterSpacing: '.04em',
          color: color.fg.neutral.muted,
        }}
      >
        站點類型
      </Typography>
      {types.map(({ type, label, color: fill }) => (
        <Box
          component="li"
          key={type}
          sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Box
            component="span"
            sx={{
              width: 16,
              display: 'inline-flex',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Box
              component="span"
              sx={{
                width: 13,
                height: 13,
                borderRadius: '50% 50% 50% 0',
                transform: 'rotate(-45deg)',
                bgcolor: fill,
              }}
            />
          </Box>
          <Typography
            component="span"
            sx={{
              ...typography.label[300],
              whiteSpace: 'nowrap',
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

/** Prototype station-map.jsx:237-240 — said while nearby stations are merged into clusters. */
function ClusterHint() {
  return (
    <Box
      role="status"
      sx={{
        ...OVERLAY_SX,
        ...typography.data[300],
        left: OVERLAY_INSET,
        top: OVERLAY_INSET,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        p: '6px 11px',
        borderRadius: `${radius.full}px`,
        boxShadow: shadow.sm,
        color: color.fg.neutral.muted,
        pointerEvents: 'none',
      }}
    >
      <Group size={14} />
      密集站點已合併，放大可展開
    </Box>
  );
}

/**
 * Explains where stations come from. It lets clicks through, because a click on the map is how a
 * station is added there.
 */
function EmptyMapNotice({ canAdd }: { canAdd: boolean }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 450,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <Box
        role="status"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          maxWidth: 300,
          p: '20px 24px',
          borderRadius: `${radius.lg}px`,
          bgcolor: color.bg.neutral.default,
          boxShadow: shadow.md,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 44,
            height: 44,
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.neutral.subtle,
            color: color.fg.neutral.muted,
          }}
        >
          <MapPinOff size={22} />
        </Box>
        <Typography sx={typography.label[500]}>地圖上還沒有站點</Typography>
        <Typography
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          {canAdd
            ? '點地圖上任一處，就能在那個位置新增站點。'
            : '站點建立後會以圖釘出現在這裡。'}
        </Typography>
      </Box>
    </Box>
  );
}

/** Keeps the list's selection and the map's selected marker in step, both ways. */
function SelectionSync({
  controller,
  selectedUuid,
  onSelect,
}: {
  controller: RescueMapControllerValue;
  selectedUuid: string | null;
  onSelect: (uuid: string | null) => void;
}) {
  const lastFromList = useRef(selectedUuid);
  const { selectedMarkerId, setSelectedMarkerId } = controller;

  useEffect(() => {
    if (selectedUuid !== lastFromList.current) {
      lastFromList.current = selectedUuid;
      setSelectedMarkerId(selectedUuid ?? undefined);
    }
  }, [selectedUuid, setSelectedMarkerId]);

  useEffect(() => {
    const fromMap = selectedMarkerId ?? null;
    if (fromMap !== lastFromList.current) {
      lastFromList.current = fromMap;
      onSelect(fromMap);
    }
  }, [selectedMarkerId, onSelect]);

  return null;
}

function StationCard({
  row,
  now,
  selected,
  onSelect,
  onOpen,
}: {
  row: StationRow;
  now: Date;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  // No street address in the admin station fields yet; county and town are all there is.
  const secondLine = [row.typeLabel, row.area].filter(Boolean).join(' · ');
  return (
    <Box
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        // Keys from inside the card, such as Enter on 開啟站點細節, belong to that control.
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: LIST_COLUMNS,
        gap: '10px',
        alignItems: 'center',
        p: '12px 14px 12px 11px',
        cursor: 'pointer',
        borderBottom: `1px solid ${color.border.default}`,
        borderLeft: `3px solid ${selected ? color.bg.primary.default : 'transparent'}`,
        bgcolor: selected ? color.bg.primary.subtle : 'transparent',
        '&:hover': {
          bgcolor: selected ? color.bg.primary.subtle : color.bg.neutral.subtle,
        },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={typography.label[400]}>
          {row.name}
        </Typography>
        <Typography
          noWrap
          sx={{
            ...typography.body[300],
            color: color.fg.neutral.muted,
            mt: '2px',
          }}
        >
          {secondLine}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            mt: '5px',
          }}
        >
          <Typography
            sx={{
              ...typography.data[300],
              color: row.teamName
                ? color.fg.neutral.subtle
                : color.fg.neutral.muted,
            }}
          >
            {row.teamName ?? '未指派'}
          </Typography>
          <FreshnessCell updatedAt={row.updatedAt} now={now} />
        </Box>
        <ButtonBase
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          sx={{
            ...typography.body[300],
            mt: '6px',
            gap: '3px',
            color: color.brand.secondary.default,
            textDecoration: 'underline',
          }}
        >
          開啟站點細節
          <ChevronRight size={14} />
        </ButtonBase>
      </Box>
      <Box>
        <StatusBadge status={row.operationalStatus} />
      </Box>
    </Box>
  );
}
