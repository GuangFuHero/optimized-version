import {
  countInsideArea,
  isInArea,
  type AdminMapAreas,
  type AreaChanges,
  type RescueMapArea,
  type RescueMapAreaKind,
  type RescueMapAreaTeam,
  type RescueMapClosureArea,
  type RescueMapPublicZone,
  type RescueMapMarkerItem,
} from '@rescue-frontend/modules';
import type { AreaCounts } from './area-stats';

/** One area as the list shows it: any of the three kinds, with what lies inside it. */
export interface AdminAreaListItem {
  id: string;
  kind: RescueMapAreaKind;
  name: string | null;
  note: string | null;
  teams: readonly RescueMapAreaTeam[];
  /** Whether the public map shows it; always true except for a 標示區. */
  isPublic: boolean;
  contents: AreaCounts;
  /**
   * Of the tickets inside a 責任區, how many are answered for by its team (the prototype's 「N 張已歸屬」).
   * Null where there is nothing to say: another kind of area, or a viewer not told the teams.
   */
  attributedTickets: number | null;
}

function toAdminAreaListItems({
  closureAreas,
  publicZones,
  countContents,
  countAttributed,
}: {
  closureAreas: readonly RescueMapClosureArea[];
  publicZones: readonly RescueMapPublicZone[];
  countContents: (area: Pick<RescueMapArea, 'polygons'>) => AreaCounts;
  countAttributed: (
    area: Pick<RescueMapArea, 'polygons'>,
    teams: readonly RescueMapAreaTeam[],
  ) => number | null;
}): AdminAreaListItem[] {
  return [
    ...closureAreas.map(
      (area): AdminAreaListItem => ({
        id: area.id,
        kind: 'hazardous_zone',
        name: area.name,
        note: area.comment ?? null,
        teams: [],
        isPublic: true,
        contents: countContents(area),
        attributedTickets: null,
      }),
    ),
    ...publicZones.map(
      (zone): AdminAreaListItem => ({
        id: zone.id,
        kind: zone.kind,
        name: zone.name,
        note: zone.comment ?? null,
        teams: zone.assignedTeams ?? [],
        isPublic: zone.isPublic !== false,
        contents: countContents(zone),
        attributedTickets:
          zone.kind === 'team_zone'
            ? countAttributed(zone, zone.assignedTeams ?? [])
            : null,
      }),
    ),
  ];
}

interface AreaProjectionOptions
  extends Pick<AdminMapAreas, 'closureAreas' | 'publicZones'> {
  pending: AreaChanges['pending'];
  markers: readonly RescueMapMarkerItem[];
  selectedAreaId: string | null;
  lastChangedAreaId: string | null;
  editingAreaId?: string;
  isBusy: boolean;
  showOverlays: boolean;
  canViewTicketDetail: boolean;
  ticketReadFailed: boolean;
  stationReadFailed: boolean;
}

export function projectAdminMapAreas({
  closureAreas,
  publicZones,
  pending,
  markers,
  selectedAreaId,
  lastChangedAreaId,
  editingAreaId,
  isBusy,
  showOverlays,
  canViewTicketDetail,
  ticketReadFailed,
  stationReadFailed,
}: AreaProjectionOptions) {
  const visibleClosureAreas = closureAreas
    .filter((area) => pending[area.id]?.kind !== 'delete')
    .map((area) => {
      const change = pending[area.id];
      return change?.kind === 'geometry'
        ? { ...area, polygons: change.polygons }
        : area;
    });
  const visiblePublicZones = publicZones
    .filter((zone) => pending[zone.id]?.kind !== 'delete')
    .map((zone) => {
      const change = pending[zone.id];
      if (change?.kind === 'geometry')
        return { ...zone, polygons: change.polygons };
      if (change?.kind === 'teams') {
        return {
          ...zone,
          assignedTeams: change.teams,
          teams: change.teams.map((team) => team.name),
        };
      }
      return zone;
    });
  const visibleAreas = [...visibleClosureAreas, ...visiblePublicZones];
  const selectedArea = visibleAreas.find((area) => area.id === selectedAreaId);
  const highlightId = selectedArea?.id ?? lastChangedAreaId;
  const isHighlightingArea = visibleAreas.some(
    (area) => area.id === highlightId,
  );
  const decorate = <T extends RescueMapArea>(items: readonly T[]) =>
    items
      .filter((area) => area.id !== editingAreaId)
      .map((area) => ({
        ...area,
        highlighted: area.id === highlightId,
        dimmed: isBusy || (isHighlightingArea && area.id !== highlightId),
      }));

  const countContents = (area: Pick<RescueMapArea, 'polygons'> | null) => {
    const { tickets, stations } = area
      ? countInsideArea(area, markers)
      : { tickets: 0, stations: 0 };
    return {
      tickets: ticketReadFailed ? null : tickets,
      stations: stationReadFailed ? null : stations,
    };
  };
  const areaListItems = toAdminAreaListItems({
    closureAreas: visibleClosureAreas,
    publicZones: visiblePublicZones,
    countContents,
    countAttributed: (area, teams) =>
      canViewTicketDetail && !ticketReadFailed
        ? markers.filter(
            (marker) =>
              marker.detailType === 'ticket' &&
              marker.ticketMeta?.responsibleTeams?.some((team) =>
                teams.some(({ uuid }) => uuid === team.uuid),
              ) &&
              isInArea(marker.position, area),
          ).length
        : null,
  });
  const selectedAreaItem = areaListItems.find(
    (item) => item.id === selectedAreaId,
  );
  const selectedAreaTickets = selectedArea
    ? markers.filter(
        (marker) =>
          marker.detailType === 'ticket' &&
          isInArea(marker.position, selectedArea),
      )
    : [];

  return {
    visibleAreas,
    selectedArea,
    highlightId,
    closureOverlays: showOverlays ? decorate(visibleClosureAreas) : [],
    publicOverlays: showOverlays ? decorate(visiblePublicZones) : [],
    countContents,
    areaListItems,
    selectedAreaItem,
    selectedAreaTickets,
  };
}
