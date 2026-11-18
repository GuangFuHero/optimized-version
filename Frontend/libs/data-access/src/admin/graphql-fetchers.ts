'use client';

import {
  keepPreviousData,
  queryOptions,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adminGraphql } from './client';
import { collectAllPages } from './collect-pages';
import * as documents from '../graphql/__generated__/graphql';
import {
  ticketDetailUuid,
  ticketKeys,
  ticketWriteKeys,
} from './ticket-query-keys';

/** Every space's tickets: `buildingMapTicketsQuery`, one per space (BE-036). */
const SPACE_TICKETS_KEY = ['admin', 'buildingMaps', 'tickets'] as const;

/**
 * What a space write makes stale, and no more: the board keeps every space's tickets mounted, one
 * query each, so a blanket refresh would reload them all. A new space has no tickets yet, and an
 * edit changes only the building, so neither touches tickets; a deletion unlinks that space's
 * tickets, which fall back to the ticket lists as ordinary ones.
 */
export function buildingMapWriteKeys(
  write: 'create' | 'update' | 'delete',
  uuid?: string,
): unknown[][] {
  const list = ['admin', 'buildingMaps', 'list'];
  if (write === 'create' || !uuid) return [list];
  const one = ['admin', 'buildingMaps', 'one', { uuid }];
  if (write === 'update') return [list, one];
  return [
    list,
    one,
    [...SPACE_TICKETS_KEY, { buildingMapUuid: uuid }],
    ['admin', 'tickets'],
  ];
}

function invalidateBuildingMapWrite(
  queryClient: QueryClient,
  write: 'create' | 'update' | 'delete',
  uuid?: string,
) {
  return Promise.all(
    buildingMapWriteKeys(write, uuid).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

/**
 * The spaces' ticket loads a ticket write can move: a space keeps no state of its own and works
 * it out from these. Only those, never every space, as the board keeps one mounted per space:
 *
 * - a write naming its ticket: the spaces whose tickets hold it;
 * - a new household: the space it was filed in, which doesn't hold it yet;
 * - a write naming only a need, photo or assignment: it comes from an open ticket's sheet, so the
 *   spaces holding a ticket whose detail is on screen.
 */
export function spaceTicketKeysForWrite(
  queryClient: QueryClient,
  ticketUuid?: string | null,
  buildingMapUuid?: string | null,
): unknown[][] {
  const cache = queryClient.getQueryCache();
  const written = new Set<string>();
  if (ticketUuid) written.add(ticketUuid);
  else {
    for (const query of cache.findAll({
      queryKey: ticketKeys.details(),
      type: 'active',
    })) {
      const uuid = ticketDetailUuid(query.queryKey);
      if (uuid) written.add(uuid);
    }
  }

  const keys: unknown[][] = buildingMapUuid
    ? [[...SPACE_TICKETS_KEY, { buildingMapUuid }]]
    : [];
  for (const [
    queryKey,
    data,
  ] of queryClient.getQueriesData<documents.AdminBuildingMapTicketsQuery>({
    queryKey: SPACE_TICKETS_KEY,
  })) {
    if (data?.buildingMapTickets.some((ticket) => written.has(ticket.uuid)))
      keys.push([...queryKey]);
  }
  return keys;
}

/**
 * After a ticket write: refetch the lists, the stats, that ticket's sheet and the spaces it
 * moves where they are on screen; anything else is only marked stale, never reloaded now.
 */
export function invalidateTicketWrite(
  queryClient: QueryClient,
  ticketUuid?: string | null,
  buildingMapUuid?: string | null,
) {
  return Promise.all(
    [
      ...ticketWriteKeys(ticketUuid),
      ...spaceTicketKeysForWrite(queryClient, ticketUuid, buildingMapUuid),
    ].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' }),
    ),
  );
}

export interface AdminQueryOptions {
  enabled?: boolean;
}

/** One page of `tickets`: a board list page, or the map's load of the visible area. */
export const ticketsQuery = (
  variables: documents.AdminTicketsQueryVariables = {},
) =>
  queryOptions({
    queryKey: [...ticketKeys.lists(), variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTicketsDocument, variables, signal),
  });

/**
 * Keep the last result on screen until the next one lands: always, or only when this holds for
 * the last load's variables (say, it differs from this one just by its page).
 */
type KeepPrevious<V> = boolean | ((previous: V) => boolean);

function placeholderFor<V>(keepPrevious: KeepPrevious<V> | undefined) {
  if (typeof keepPrevious !== 'function') {
    return keepPrevious ? keepPreviousData : undefined;
  }
  return <D>(
    previousData: D | undefined,
    previousQuery?: { queryKey: readonly unknown[] },
  ) => {
    const previous = previousQuery?.queryKey.at(-1) as V | undefined;
    return previous && keepPrevious(previous) ? previousData : undefined;
  };
}

export function useTickets(
  variables: documents.AdminTicketsQueryVariables = {},
  options: AdminQueryOptions & {
    keepPrevious?: KeepPrevious<documents.AdminTicketsQueryVariables>;
  } = {},
) {
  return useQuery({
    ...ticketsQuery(variables),
    enabled: options.enabled,
    placeholderData: placeholderFor(options.keepPrevious),
  });
}

/** The map's load of the visible area: only the fields its pins and notices read. */
export const ticketMapPinsQuery = (
  variables: documents.AdminTicketMapPinsQueryVariables = {},
) =>
  queryOptions({
    queryKey: [...ticketKeys.mapPins(), variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTicketMapPinsDocument, variables, signal),
  });

export function useTicketMapPins(
  variables: documents.AdminTicketMapPinsQueryVariables = {},
  options: AdminQueryOptions & {
    keepPrevious?: KeepPrevious<documents.AdminTicketMapPinsQueryVariables>;
  } = {},
) {
  return useQuery({
    ...ticketMapPinsQuery(variables),
    enabled: options.enabled,
    placeholderData: placeholderFor(options.keepPrevious),
  });
}

/** How many tickets match the filters, and the box their points span: the map frames it. */
export const ticketsExtentQuery = (
  variables: documents.AdminTicketsExtentQueryVariables = {},
) =>
  queryOptions({
    queryKey: [...ticketKeys.extents(), variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTicketsExtentDocument, variables, signal),
  });

export function useTicketsExtent(
  variables: documents.AdminTicketsExtentQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...ticketsExtentQuery(variables),
    enabled: options.enabled,
  });
}

/** The board's counts over every ticket the caller may list, whatever the filters. */
export const ticketStatsQuery = () =>
  queryOptions({
    queryKey: ticketKeys.stats(),
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTicketStatsDocument, {}, signal),
  });

export function useTicketStats(options: AdminQueryOptions = {}) {
  return useQuery({ ...ticketStatsQuery(), enabled: options.enabled });
}

/** The filter panel's choices: the areas the tickets' addresses name, and the teams holding a 責任區. */
export const ticketFacetsQuery = () =>
  queryOptions({
    queryKey: ticketKeys.facets(),
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTicketFacetsDocument, {}, signal),
  });

export function useTicketFacets(options: AdminQueryOptions = {}) {
  return useQuery({ ...ticketFacetsQuery(), enabled: options.enabled });
}

export const ticketQuery = (variables: documents.AdminTicketQueryVariables) =>
  queryOptions({
    queryKey: [...ticketKeys.details(), variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTicketDocument, variables, signal),
  });

export function useTicket(
  variables: documents.AdminTicketQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...ticketQuery(variables),
    enabled: Boolean(variables.uuid) && options.enabled !== false,
  });
}

export const ticketTasksQuery = (
  variables: documents.AdminTicketTasksQueryVariables,
) =>
  queryOptions({
    queryKey: [...ticketKeys.tasks(), variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTicketTasksDocument, variables, signal),
  });

export function useTicketTasks(
  variables: documents.AdminTicketTasksQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...ticketTasksQuery(variables), enabled: options.enabled });
}

export const stationsQuery = (
  variables: documents.AdminStationsQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'stations', 'stations', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminStationsDocument, variables, signal),
  });

export function useStations(
  variables: documents.AdminStationsQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...stationsQuery(variables), enabled: options.enabled });
}

export type AllStationsQueryVariables = Omit<
  documents.AdminStationsQueryVariables,
  'skip' | 'limit'
>;

/** Every station matching `variables`, read page by page up to the collector's cap. */
export const allStationsQuery = (variables: AllStationsQueryVariables = {}) =>
  queryOptions({
    queryKey: ['admin', 'stations', 'all', variables],
    queryFn: ({ signal }) =>
      collectAllPages(async (skip, limit) => {
        const data = await adminGraphql(
          documents.AdminStationsDocument,
          { ...variables, skip, limit },
          signal,
        );
        return {
          items: data.stations.items,
          hasNextPage: data.stations.pageInfo.hasNextPage,
        };
      }),
  });

export function useAllStations(
  variables: AllStationsQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...allStationsQuery(variables), enabled: options.enabled });
}

/** Counts over every station in the caller's scope, whatever the page's filters: the stats strip's. */
export const stationFacetsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'stations', 'facets'],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminStationFacetsDocument, {}, signal),
  });

export function useStationFacets(options: AdminQueryOptions = {}) {
  return useQuery({ ...stationFacetsQuery(), enabled: options.enabled });
}

export const stationQuery = (variables: documents.AdminStationQueryVariables) =>
  queryOptions({
    queryKey: ['admin', 'stations', 'station', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminStationDocument, variables, signal),
  });

export function useStation(
  variables: documents.AdminStationQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...stationQuery(variables),
    enabled: Boolean(variables.uuid) && options.enabled !== false,
  });
}

/**
 * The nearest 門牌 to a map pin, from the backend's TGOS lookup. Its `addressToken`, sent back with
 * the unchanged `fullAddress`, saves the address as verified. Never stale: a pin's 門牌 doesn't move.
 */
export const reverseGeocodeQuery = (
  variables: documents.AdminReverseGeocodeQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'address', 'reverseGeocode', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminReverseGeocodeDocument, variables, signal),
    staleTime: Infinity,
  });

export function useReverseGeocode(
  position: readonly [number, number] | null | undefined,
) {
  const [lat, lng] = position ?? [];
  return useQuery({
    ...reverseGeocodeQuery({ lat: lat ?? 0, lng: lng ?? 0 }),
    enabled: lat != null && lng != null,
    // The address is only a head start: a failed lookup leaves the form blank, no toast.
    retry: false,
    meta: { quietErrors: true },
  });
}

/**
 * A typed address line checked against TGOS, with the pin when there is one. Never kept: a token
 * lasts a day, and an `unavailable` kept here would answer a later check of the same line.
 */
export const normalizeAddressQuery = (
  variables: documents.AdminNormalizeAddressQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'address', 'normalizeAddress', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminNormalizeAddressDocument, variables, signal),
    staleTime: 0,
    gcTime: 0,
  });

/** Buildings opened as spaces (BE-036). Their tickets come from `buildingMapTicketsQuery`. */
export const buildingMapsQuery = (
  variables: documents.AdminBuildingMapsQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'buildingMaps', 'list', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminBuildingMapsDocument, variables, signal),
  });

export function useBuildingMaps(
  variables: documents.AdminBuildingMapsQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...buildingMapsQuery(variables),
    enabled: options.enabled,
  });
}

export const buildingMapQuery = (
  variables: documents.AdminBuildingMapQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'buildingMaps', 'one', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminBuildingMapDocument, variables, signal),
  });

export function useBuildingMap(
  variables: documents.AdminBuildingMapQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...buildingMapQuery(variables),
    enabled: Boolean(variables.uuid) && options.enabled !== false,
  });
}

/** Under `buildingMaps`, so changing a building or filing a ticket under it refreshes its floors. */
export const buildingMapTicketsQuery = (
  variables: documents.AdminBuildingMapTicketsQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'buildingMaps', 'tickets', variables],
    queryFn: ({ signal }) =>
      adminGraphql(
        documents.AdminBuildingMapTicketsDocument,
        variables,
        signal,
      ),
  });

export function useBuildingMapTickets(
  variables: documents.AdminBuildingMapTicketsQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...buildingMapTicketsQuery(variables),
    enabled: Boolean(variables.buildingMapUuid) && options.enabled !== false,
  });
}

/** Under `teams`, so a team change refreshes the picker along with the team list. */
export const assignableStationTeamsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'teams', 'AssignableStationTeams'],
    queryFn: ({ signal }) =>
      adminGraphql(
        documents.AdminAssignableStationTeamsDocument,
        {},
        signal,
      ).then((data) => data.assignableStationTeams),
  });

/** Every team a station can be assigned to; the backend refuses callers who cannot assign. */
export function useAssignableStationTeams(options: AdminQueryOptions = {}) {
  return useQuery({
    ...assignableStationTeamsQuery(),
    enabled: options.enabled,
  });
}

export const stationReviewQuery = (
  variables: documents.AdminStationReviewQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'stations', 'review', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminStationReviewDocument, variables, signal),
  });

export function useStationReview(
  variables: documents.AdminStationReviewQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...stationReviewQuery(variables),
    enabled: Boolean(variables.uuid) && options.enabled !== false,
  });
}

export const announcementsQuery = (
  variables: documents.AdminAnnouncementsQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'announcements', 'announcements', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminAnnouncementsDocument, variables, signal),
  });

export function useAnnouncements(
  variables: documents.AdminAnnouncementsQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...announcementsQuery(variables),
    enabled: options.enabled,
  });
}

export const briefingsQuery = (
  variables: documents.AdminBriefingsQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'briefings', 'briefings', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminBriefingsDocument, variables, signal),
  });

export function useBriefings(
  variables: documents.AdminBriefingsQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...briefingsQuery(variables), enabled: options.enabled });
}

export const briefingTemplatesQuery = (
  variables: documents.AdminBriefingTemplatesQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'briefings', 'briefingTemplates', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminBriefingTemplatesDocument, variables, signal),
  });

export function useBriefingTemplates(
  variables: documents.AdminBriefingTemplatesQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...briefingTemplatesQuery(variables),
    enabled: options.enabled,
  });
}

export const stationPropertyConfigsQuery = (
  variables: documents.AdminStationPropertyConfigsQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'config', 'stationPropertyConfigs', variables],
    queryFn: ({ signal }) =>
      adminGraphql(
        documents.AdminStationPropertyConfigsDocument,
        variables,
        signal,
      ),
  });

export function useStationPropertyConfigs(
  variables: documents.AdminStationPropertyConfigsQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...stationPropertyConfigsQuery(variables),
    enabled: options.enabled,
  });
}

export const taskPropertyConfigsQuery = (
  variables: documents.AdminTaskPropertyConfigsQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'config', 'taskPropertyConfigs', variables],
    queryFn: ({ signal }) =>
      adminGraphql(
        documents.AdminTaskPropertyConfigsDocument,
        variables,
        signal,
      ),
  });

export function useTaskPropertyConfigs(
  variables: documents.AdminTaskPropertyConfigsQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...taskPropertyConfigsQuery(variables),
    enabled: options.enabled,
  });
}

export const ticketPropertyConfigsQuery = (
  variables: documents.AdminTicketPropertyConfigsQueryVariables,
) =>
  queryOptions({
    queryKey: ['admin', 'config', 'ticketPropertyConfigs', variables],
    queryFn: ({ signal }) =>
      adminGraphql(
        documents.AdminTicketPropertyConfigsDocument,
        variables,
        signal,
      ),
  });

export function useTicketPropertyConfigs(
  variables: documents.AdminTicketPropertyConfigsQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...ticketPropertyConfigsQuery(variables),
    enabled: options.enabled,
  });
}

export const disasterTypesQuery = (
  variables: documents.AdminDisasterTypesQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'config', 'disasterTypes', variables],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminDisasterTypesDocument, variables, signal),
  });

export function useDisasterTypes(
  variables: documents.AdminDisasterTypesQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...disasterTypesQuery(variables),
    enabled: options.enabled,
  });
}

// Public (ADR-392), so the site reads it too. Under `settings`, so saving the settings reads it
// again. Quiet: a name that does not load leaves the platform's, and a map view that does not load
// opens the maps on all of Taiwan (ADR-395); neither is an error to report.
export const currentDisasterQuery = () =>
  queryOptions({
    queryKey: ['admin', 'settings', 'currentDisaster'],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminCurrentDisasterDocument, {}, signal),
    meta: { quietErrors: true },
  });

export function useCurrentDisaster(options: AdminQueryOptions = {}) {
  return useQuery({ ...currentDisasterQuery(), enabled: options.enabled });
}

/**
 * How long what waits on the event gives it before going on as if it could not be read: a map opens
 * on all of Taiwan, the site's name stays the platform's. A backend that does not answer would
 * otherwise hold them, on the patchy networks they are most needed on.
 */
export const CURRENT_DISASTER_WAIT_MS = 3000;

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateTicketMutationVariables) =>
      adminGraphql(documents.AdminCreateTicketDocument, variables),
    onSuccess: (data) =>
      invalidateTicketWrite(
        queryClient,
        data.createTicket.__typename === 'TicketCreated'
          ? data.createTicket.ticket.uuid
          : null,
        data.createTicket.__typename === 'TicketCreated'
          ? data.createTicket.ticket.buildingMapUuid
          : null,
      ),
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateTicketMutationVariables) =>
      adminGraphql(documents.AdminUpdateTicketDocument, variables),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.uuid),
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteTicketMutationVariables) =>
      adminGraphql(documents.AdminDeleteTicketDocument, variables),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.uuid),
  });
}

export function useSetTicketDisasterDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminSetTicketDisasterDetailsMutationVariables,
    ) =>
      adminGraphql(documents.AdminSetTicketDisasterDetailsDocument, variables),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.uuid),
  });
}

export function useCreateTicketTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateTicketTaskMutationVariables) =>
      adminGraphql(documents.AdminCreateTicketTaskDocument, variables),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.input.ticketUuid),
  });
}

export function useStopTaskRecruiting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminStopRecruitingMutationVariables) =>
      adminGraphql(documents.AdminStopRecruitingDocument, variables),
    onSuccess: (data) =>
      invalidateTicketWrite(queryClient, data.stopRecruiting.ticketUuid),
  });
}

export function useDeleteTicketTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteTicketTaskMutationVariables) =>
      adminGraphql(documents.AdminDeleteTicketTaskDocument, variables),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useAttachTicketPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminAttachTicketPhotoMutationVariables,
    ) => adminGraphql(documents.AdminAttachTicketPhotoDocument, variables),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.ticketUuid),
  });
}

export function useDetachTicketPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDetachTicketPhotoMutationVariables,
    ) => adminGraphql(documents.AdminDetachTicketPhotoDocument, variables),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUpdateTicketTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateTicketTaskMutationVariables) =>
      adminGraphql(documents.AdminUpdateTicketTaskDocument, variables),
    onSuccess: (data) =>
      invalidateTicketWrite(queryClient, data.updateTicketTask.ticketUuid),
  });
}

export function useAssignTaskActor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminAssignTaskActorMutationVariables) =>
      adminGraphql(documents.AdminAssignTaskActorDocument, variables),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUpdateTaskAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateTaskAssignmentMutationVariables,
    ) => adminGraphql(documents.AdminUpdateTaskAssignmentDocument, variables),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUnassignTaskActor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUnassignTaskActorMutationVariables,
    ) => adminGraphql(documents.AdminUnassignTaskActorDocument, variables),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useCreateStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateStationMutationVariables) =>
      adminGraphql(documents.AdminCreateStationDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useUpdateStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateStationMutationVariables) =>
      adminGraphql(documents.AdminUpdateStationDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useDeleteStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteStationMutationVariables) =>
      adminGraphql(documents.AdminDeleteStationDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useCreateBuildingMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateBuildingMapMutationVariables,
    ) => adminGraphql(documents.AdminCreateBuildingMapDocument, variables),
    onSuccess: () => invalidateBuildingMapWrite(queryClient, 'create'),
  });
}

export function useUpdateBuildingMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateBuildingMapMutationVariables,
    ) => adminGraphql(documents.AdminUpdateBuildingMapDocument, variables),
    onSuccess: (_, variables) =>
      invalidateBuildingMapWrite(queryClient, 'update', variables.uuid),
  });
}

/** The building's tickets stay, unlinked from it, so the ticket list is refreshed too. */
export function useDeleteBuildingMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDeleteBuildingMapMutationVariables,
    ) => adminGraphql(documents.AdminDeleteBuildingMapDocument, variables),
    onSuccess: (_, variables) =>
      invalidateBuildingMapWrite(queryClient, 'delete', variables.uuid),
  });
}

export function useMergeStationSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminMergeStationSuggestionsMutationVariables,
    ) =>
      adminGraphql(documents.AdminMergeStationSuggestionsDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useAssignStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminAssignStationMutationVariables) =>
      adminGraphql(documents.AdminAssignStationDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useUnassignStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUnassignStationMutationVariables) =>
      adminGraphql(documents.AdminUnassignStationDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useAttachStationPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminAttachStationPhotoMutationVariables,
    ) => adminGraphql(documents.AdminAttachStationPhotoDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useDetachStationPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDetachStationPhotoMutationVariables,
    ) => adminGraphql(documents.AdminDetachStationPhotoDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useCreateStationProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateStationPropertyMutationVariables,
    ) => adminGraphql(documents.AdminCreateStationPropertyDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useUpdateStationProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateStationPropertyMutationVariables,
    ) => adminGraphql(documents.AdminUpdateStationPropertyDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useCreateTaskProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateTaskPropertyMutationVariables,
    ) => adminGraphql(documents.AdminCreateTaskPropertyDocument, variables),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUpdateTaskProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateTaskPropertyMutationVariables,
    ) => adminGraphql(documents.AdminUpdateTaskPropertyDocument, variables),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateAnnouncementMutationVariables,
    ) => adminGraphql(documents.AdminCreateAnnouncementDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateAnnouncementMutationVariables,
    ) => adminGraphql(documents.AdminUpdateAnnouncementDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDeleteAnnouncementMutationVariables,
    ) => adminGraphql(documents.AdminDeleteAnnouncementDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useSetAnnouncementActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminSetAnnouncementActiveMutationVariables,
    ) => adminGraphql(documents.AdminSetAnnouncementActiveDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useGenerateBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminGenerateBriefingMutationVariables) =>
      adminGraphql(documents.AdminGenerateBriefingDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useUpdateBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateBriefingMutationVariables) =>
      adminGraphql(documents.AdminUpdateBriefingDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function usePublishBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminPublishBriefingMutationVariables) =>
      adminGraphql(documents.AdminPublishBriefingDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useTakeDownBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminTakeDownBriefingMutationVariables) =>
      adminGraphql(documents.AdminTakeDownBriefingDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useDeleteBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteBriefingMutationVariables) =>
      adminGraphql(documents.AdminDeleteBriefingDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useCreateBriefingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateBriefingTemplateMutationVariables,
    ) => adminGraphql(documents.AdminCreateBriefingTemplateDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useUpdateBriefingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateBriefingTemplateMutationVariables,
    ) => adminGraphql(documents.AdminUpdateBriefingTemplateDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useDeleteBriefingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDeleteBriefingTemplateMutationVariables,
    ) => adminGraphql(documents.AdminDeleteBriefingTemplateDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useUpsertStationPropertyConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpsertStationPropertyConfigMutationVariables,
    ) =>
      adminGraphql(
        documents.AdminUpsertStationPropertyConfigDocument,
        variables,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] }),
  });
}

export function useUpsertTaskPropertyConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpsertTaskPropertyConfigMutationVariables,
    ) =>
      adminGraphql(documents.AdminUpsertTaskPropertyConfigDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] }),
  });
}

export function useUpsertTicketPropertyConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpsertTicketPropertyConfigMutationVariables,
    ) =>
      adminGraphql(
        documents.AdminUpsertTicketPropertyConfigDocument,
        variables,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] }),
  });
}

export function useUpsertDisasterType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpsertDisasterTypeMutationVariables,
    ) => adminGraphql(documents.AdminUpsertDisasterTypeDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] }),
  });
}

export function useHazardousZoneSource(
  variables: documents.AdminHazardousZoneSourceQueryVariables,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    queryKey: ['admin', 'areas', 'hazardousZoneSource', variables],
    queryFn: ({ signal }) =>
      adminGraphql(
        documents.AdminHazardousZoneSourceDocument,
        variables,
        signal,
      ),
    enabled: Boolean(variables.uuid) && options.enabled !== false,
  });
}

export function useCreateArea() {
  return useMutation({
    mutationFn: (variables: documents.AdminCreateAreaMutationVariables) =>
      adminGraphql(documents.AdminCreateAreaDocument, variables),
  });
}

export function useUpdateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateAreaMutationVariables) =>
      adminGraphql(documents.AdminUpdateAreaDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['admin', 'areas', 'hazardousZoneSource'],
      }),
  });
}

export function useDeleteArea() {
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteAreaMutationVariables) =>
      adminGraphql(documents.AdminDeleteAreaDocument, variables),
  });
}

export function useAssignZoneToTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminAssignZoneToTeamMutationVariables) =>
      adminGraphql(documents.AdminAssignZoneToTeamDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'work-zones'] }),
  });
}

export function useRemoveZoneFromTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminRemoveZoneFromTeamMutationVariables,
    ) => adminGraphql(documents.AdminRemoveZoneFromTeamDocument, variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'work-zones'] }),
  });
}

export const teamDirectoryQuery = () =>
  queryOptions({
    queryKey: ['admin', 'teams', 'TeamDirectory'],
    queryFn: ({ signal }) =>
      adminGraphql(documents.AdminTeamDirectoryDocument, {}, signal),
  });

/** Every active team, name and type only (Spec/026 `roleRequestTeams`). */
export function useTeamDirectory(options: AdminQueryOptions = {}) {
  return useQuery({ ...teamDirectoryQuery(), enabled: options.enabled });
}
