'use client';

import {
  keepPreviousData,
  queryOptions,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adminGraphqlClient, graphqlResponseData } from './client';
import { collectAllPages } from './collect-pages';
import * as documents from './graphql/__generated__/graphql';
import { ticketKeys, ticketWriteKeys } from './ticket-query-keys';

/** Every space's tickets: `buildingMapTicketsQuery`, one per space (BE-036). */
const SPACE_TICKETS_KEY = ['admin', 'buildingMaps', 'tickets'] as const;

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
      const uuid = (query.queryKey[3] as { uuid?: string } | undefined)?.uuid;
      if (uuid) written.add(uuid);
    }
  }

  const keys: unknown[][] = buildingMapUuid
    ? [[...SPACE_TICKETS_KEY, { buildingMapUuid }]]
    : [];
  for (const query of cache.findAll({ queryKey: SPACE_TICKETS_KEY })) {
    const data = query.state.data as
      | { buildingMapTickets?: { uuid: string }[] }
      | undefined;
    if (data?.buildingMapTickets?.some((ticket) => written.has(ticket.uuid)))
      keys.push([...query.queryKey]);
  }
  return keys;
}

/**
 * After a ticket write: refetch the lists, that ticket's sheet and the spaces it moves
 * where they are on screen; anything else is only marked stale, never reloaded now.
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
      adminGraphqlClient
        .query(documents.AdminTicketsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminTicketMapPinsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminTicketsExtentDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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

export const ticketQuery = (variables: documents.AdminTicketQueryVariables) =>
  queryOptions({
    queryKey: [...ticketKeys.details(), variables],
    queryFn: ({ signal }) =>
      adminGraphqlClient
        .query(documents.AdminTicketDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminTicketTasksDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminStationsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
        const data = await adminGraphqlClient
          .query(
            documents.AdminStationsDocument,
            { ...variables, skip, limit },
            { fetchOptions: { credentials: 'include', signal } },
          )
          .toPromise()
          .then(graphqlResponseData);
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

export const stationQuery = (variables: documents.AdminStationQueryVariables) =>
  queryOptions({
    queryKey: ['admin', 'stations', 'station', variables],
    queryFn: ({ signal }) =>
      adminGraphqlClient
        .query(documents.AdminStationDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminReverseGeocodeDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminNormalizeAddressDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminBuildingMapsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminBuildingMapDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminBuildingMapTicketsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(
          documents.AdminAssignableStationTeamsDocument,
          {},
          { fetchOptions: { credentials: 'include', signal } },
        )
        .toPromise()
        .then(graphqlResponseData)
        .then((data) => data.assignableStationTeams),
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
      adminGraphqlClient
        .query(documents.AdminStationReviewDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminAnnouncementsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminBriefingsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminBriefingTemplatesDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminStationPropertyConfigsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminTaskPropertyConfigsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminTicketPropertyConfigsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(documents.AdminDisasterTypesDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .query(
          documents.AdminCurrentDisasterDocument,
          {},
          { fetchOptions: { credentials: 'include', signal } },
        )
        .toPromise()
        .then(graphqlResponseData),
    meta: { quietErrors: true },
  });

export function useCurrentDisaster(options: AdminQueryOptions = {}) {
  return useQuery({ ...currentDisasterQuery(), enabled: options.enabled });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateTicketMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateTicketDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .mutation(documents.AdminUpdateTicketDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.uuid),
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteTicketMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteTicketDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.uuid),
  });
}

export function useAuditTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminAuditTicketMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminAuditTicketDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .mutation(documents.AdminSetTicketDisasterDetailsDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.uuid),
  });
}

export function useCreateTicketTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateTicketTaskMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateTicketTaskDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.input.ticketUuid),
  });
}

export function useStopTaskRecruiting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminStopRecruitingMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminStopRecruitingDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: (data) =>
      invalidateTicketWrite(queryClient, data.stopRecruiting.ticketUuid),
  });
}

export function useDeleteTicketTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteTicketTaskMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteTicketTaskDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useAttachTicketPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminAttachTicketPhotoMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminAttachTicketPhotoDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: (_data, variables) =>
      invalidateTicketWrite(queryClient, variables.ticketUuid),
  });
}

export function useDetachTicketPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDetachTicketPhotoMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminDetachTicketPhotoDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUpdateTicketTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateTicketTaskMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateTicketTaskDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: (data) =>
      invalidateTicketWrite(queryClient, data.updateTicketTask.ticketUuid),
  });
}

export function useAssignTaskActor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminAssignTaskActorMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminAssignTaskActorDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUpdateTaskAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateTaskAssignmentMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateTaskAssignmentDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUnassignTaskActor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUnassignTaskActorMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUnassignTaskActorDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useCreateStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateStationMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateStationDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useUpdateStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateStationMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateStationDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useDeleteStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteStationMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteStationDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useCreateBuildingMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateBuildingMapMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateBuildingMapDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'buildingMaps'] }),
  });
}

export function useUpdateBuildingMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateBuildingMapMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateBuildingMapDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'buildingMaps'] }),
  });
}

/** The building's tickets stay, unlinked from it, so the ticket list is refreshed too. */
export function useDeleteBuildingMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDeleteBuildingMapMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteBuildingMapDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'buildingMaps'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
      ]),
  });
}

export function useMergeStationSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminMergeStationSuggestionsMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminMergeStationSuggestionsDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useAssignStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminAssignStationMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminAssignStationDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useUnassignStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUnassignStationMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminUnassignStationDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useAttachStationPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminAttachStationPhotoMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminAttachStationPhotoDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useDetachStationPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDetachStationPhotoMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminDetachStationPhotoDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useCreateStationProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateStationPropertyMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateStationPropertyDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useUpdateStationProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateStationPropertyMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateStationPropertyDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export function useCreateTaskProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateTaskPropertyMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateTaskPropertyDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useUpdateTaskProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateTaskPropertyMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateTaskPropertyDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () => invalidateTicketWrite(queryClient),
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateAnnouncementMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateAnnouncementDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateAnnouncementMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateAnnouncementDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDeleteAnnouncementMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteAnnouncementDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useSetAnnouncementActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminSetAnnouncementActiveMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminSetAnnouncementActiveDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useGenerateBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminGenerateBriefingMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminGenerateBriefingDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useUpdateBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateBriefingMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateBriefingDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function usePublishBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminPublishBriefingMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminPublishBriefingDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useTakeDownBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminTakeDownBriefingMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminTakeDownBriefingDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useDeleteBriefing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteBriefingMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteBriefingDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useCreateBriefingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateBriefingTemplateMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateBriefingTemplateDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useUpdateBriefingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateBriefingTemplateMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateBriefingTemplateDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'briefings'] }),
  });
}

export function useDeleteBriefingTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDeleteBriefingTemplateMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteBriefingTemplateDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .mutation(documents.AdminUpsertStationPropertyConfigDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .mutation(documents.AdminUpsertTaskPropertyConfigDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
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
      adminGraphqlClient
        .mutation(documents.AdminUpsertTicketPropertyConfigDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] }),
  });
}

export function useUpsertDisasterType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpsertDisasterTypeMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpsertDisasterTypeDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] }),
  });
}

export function useAssignZoneToTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminAssignZoneToTeamMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminAssignZoneToTeamDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'work-zones'] }),
  });
}

export function useRemoveZoneFromTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminRemoveZoneFromTeamMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminRemoveZoneFromTeamDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'work-zones'] }),
  });
}
