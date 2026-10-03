'use client';

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adminGraphqlClient, graphqlResponseData } from './client';
import * as documents from './graphql/__generated__/graphql';

export interface AdminQueryOptions {
  enabled?: boolean;
}

export const ticketsQuery = (
  variables: documents.AdminTicketsQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'tickets', 'tickets', variables],
    queryFn: ({ signal }) =>
      adminGraphqlClient
        .query(documents.AdminTicketsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
  });

export function useTickets(
  variables: documents.AdminTicketsQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...ticketsQuery(variables), enabled: options.enabled });
}

export const ticketQuery = (variables: documents.AdminTicketQueryVariables) =>
  queryOptions({
    queryKey: ['admin', 'tickets', 'ticket', variables],
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
    queryKey: ['admin', 'tickets', 'ticketTasks', variables],
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

export const stationSuggestionsQuery = (
  variables: documents.AdminStationSuggestionsQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'suggestions', 'stationSuggestions', variables],
    queryFn: ({ signal }) =>
      adminGraphqlClient
        .query(documents.AdminStationSuggestionsDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
  });

export function useStationSuggestions(
  variables: documents.AdminStationSuggestionsQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...stationSuggestionsQuery(variables),
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

export const workZonesQuery = (
  variables: documents.AdminWorkZonesQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'work-zones', 'workZones', variables],
    queryFn: ({ signal }) =>
      adminGraphqlClient
        .query(documents.AdminWorkZonesDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
  });

export function useWorkZones(
  variables: documents.AdminWorkZonesQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...workZonesQuery(variables), enabled: options.enabled });
}

export const closureAreasQuery = (
  variables: documents.AdminClosureAreasQueryVariables = {},
) =>
  queryOptions({
    queryKey: ['admin', 'closure-areas', 'closureAreas', variables],
    queryFn: ({ signal }) =>
      adminGraphqlClient
        .query(documents.AdminClosureAreasDocument, variables, {
          fetchOptions: { credentials: 'include', signal },
        })
        .toPromise()
        .then(graphqlResponseData),
  });

export function useClosureAreas(
  variables: documents.AdminClosureAreasQueryVariables = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...closureAreasQuery(variables),
    enabled: options.enabled,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateTicketMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateTicketDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
  });
}

export function useReviewTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminReviewTicketMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminReviewTicketDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
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

export function useMoveAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminMoveAnnouncementMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminMoveAnnouncementDocument, variables)
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

export function useReviewStationSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminReviewStationSuggestionMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminReviewStationSuggestionDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'suggestions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
      ]),
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

export function useCreateWorkZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminCreateWorkZoneMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateWorkZoneDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'work-zones'] }),
  });
}

export function useUpdateWorkZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminUpdateWorkZoneMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateWorkZoneDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'work-zones'] }),
  });
}

export function useDeleteWorkZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: documents.AdminDeleteWorkZoneMutationVariables) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteWorkZoneDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'work-zones'] }),
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

export function useCreateClosureArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminCreateClosureAreaMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminCreateClosureAreaDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'closure-areas'] }),
  });
}

export function useUpdateClosureArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminUpdateClosureAreaMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminUpdateClosureAreaDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'closure-areas'] }),
  });
}

export function useDeleteClosureArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      variables: documents.AdminDeleteClosureAreaMutationVariables,
    ) =>
      adminGraphqlClient
        .mutation(documents.AdminDeleteClosureAreaDocument, variables)
        .toPromise()
        .then(graphqlResponseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'closure-areas'] }),
  });
}
