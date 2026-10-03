'use client';

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { components, paths } from '../rest/openapi';
import { adminRestClient } from './client';
import { responseData } from '../rest/openapi-client';
import type { AdminQueryOptions } from './graphql-fetchers';

export const currentUserQuery = () =>
  queryOptions({
    queryKey: ['admin', 'session', 'CurrentUser'],
    queryFn: ({ signal }) =>
      adminRestClient.GET('/api/v1/users/me', { signal }).then(responseData),
  });

export function useCurrentUser(options: AdminQueryOptions = {}) {
  return useQuery({ ...currentUserQuery(), enabled: options.enabled });
}

export type UsersQuery = NonNullable<
  paths['/api/v1/admin/users']['get']['parameters']['query']
>;
export interface UsersParams {
  query?: UsersQuery;
}

export const usersQuery = (params: UsersParams = {}) =>
  queryOptions({
    queryKey: ['admin', 'users', 'Users', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/admin/users', { params, signal })
        .then(responseData),
  });

export function useUsers(
  params: UsersParams = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...usersQuery(params), enabled: options.enabled });
}

export const teamsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'teams', 'Teams'],
    queryFn: ({ signal }) =>
      adminRestClient.GET('/api/v1/admin/teams', { signal }).then(responseData),
  });

export function useTeams(options: AdminQueryOptions = {}) {
  return useQuery({ ...teamsQuery(), enabled: options.enabled });
}

export type ProjectSettings = components['schemas']['ProjectSettingsResponse'];

export const projectSettingsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'settings', 'ProjectSettings'],
    queryFn: ({ signal }): Promise<ProjectSettings> =>
      adminRestClient
        .GET('/api/v1/admin/project-settings', { signal })
        .then(responseData),
  });

export function useProjectSettings(options: AdminQueryOptions = {}) {
  return useQuery({ ...projectSettingsQuery(), enabled: options.enabled });
}

export const capabilitiesQuery = () =>
  queryOptions({
    queryKey: ['admin', 'rbac', 'Capabilities'],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/admin/rbac/capabilities', { signal })
        .then(responseData),
  });

export function useCapabilities(options: AdminQueryOptions = {}) {
  return useQuery({ ...capabilitiesQuery(), enabled: options.enabled });
}

export const permissionMatrixQuery = () =>
  queryOptions({
    queryKey: ['admin', 'rbac', 'PermissionMatrix'],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/admin/rbac/matrix', { signal })
        .then(responseData),
  });

export function usePermissionMatrix(options: AdminQueryOptions = {}) {
  return useQuery({ ...permissionMatrixQuery(), enabled: options.enabled });
}

export type RolePath = NonNullable<
  paths['/api/v1/admin/rbac/roles/{role_uuid}']['get']['parameters']['path']
>;
export interface RoleParams {
  path: RolePath;
}

export const roleQuery = (params: RoleParams) =>
  queryOptions({
    queryKey: ['admin', 'rbac', 'Role', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/admin/rbac/roles/{role_uuid}', { params, signal })
        .then(responseData),
  });

export function useRole(params: RoleParams, options: AdminQueryOptions = {}) {
  return useQuery({ ...roleQuery(params), enabled: options.enabled });
}

export type UserPermissionsPath = NonNullable<
  paths['/api/v1/admin/users/{user_uuid}/permissions']['get']['parameters']['path']
>;
export interface UserPermissionsParams {
  path: UserPermissionsPath;
}

export const userPermissionsQuery = (params: UserPermissionsParams) =>
  queryOptions({
    queryKey: ['admin', 'rbac', 'UserPermissions', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/admin/users/{user_uuid}/permissions', { params, signal })
        .then(responseData),
  });

export function useUserPermissions(
  params: UserPermissionsParams,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...userPermissionsQuery(params),
    enabled: options.enabled,
  });
}

export type NotificationsQuery = NonNullable<
  paths['/api/v1/notifications']['get']['parameters']['query']
>;
export interface NotificationsParams {
  query?: NotificationsQuery;
}

export const notificationsQuery = (params: NotificationsParams = {}) =>
  queryOptions({
    queryKey: ['admin', 'notifications', 'Notifications', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/notifications', { params, signal })
        .then(responseData),
  });

export function useNotifications(
  params: NotificationsParams = {},
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...notificationsQuery(params), enabled: options.enabled });
}

export const unreadNotificationCountQuery = () =>
  queryOptions({
    queryKey: ['admin', 'notifications', 'UnreadNotificationCount'],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/notifications/unread-count', { signal })
        .then(responseData),
  });

export function useUnreadNotificationCount(options: AdminQueryOptions = {}) {
  return useQuery({
    ...unreadNotificationCountQuery(),
    enabled: options.enabled,
  });
}

export type TicketHistoryPath = NonNullable<
  paths['/api/v1/history/tickets/{uuid}']['get']['parameters']['path']
>;
export type TicketHistoryQuery = NonNullable<
  paths['/api/v1/history/tickets/{uuid}']['get']['parameters']['query']
>;
export interface TicketHistoryParams {
  path: TicketHistoryPath;
  query?: TicketHistoryQuery;
}

export const ticketHistoryQuery = (params: TicketHistoryParams) =>
  queryOptions({
    queryKey: ['admin', 'tickets', 'TicketHistory', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/history/tickets/{uuid}', { params, signal })
        .then(responseData),
  });

export function useTicketHistory(
  params: TicketHistoryParams,
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...ticketHistoryQuery(params), enabled: options.enabled });
}

export type StationHistoryPath = NonNullable<
  paths['/api/v1/history/stations/{uuid}']['get']['parameters']['path']
>;
export type StationHistoryQuery = NonNullable<
  paths['/api/v1/history/stations/{uuid}']['get']['parameters']['query']
>;
export interface StationHistoryParams {
  path: StationHistoryPath;
  query?: StationHistoryQuery;
}

export const stationHistoryQuery = (params: StationHistoryParams) =>
  queryOptions({
    queryKey: ['admin', 'stations', 'StationHistory', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/history/stations/{uuid}', { params, signal })
        .then(responseData),
  });

export function useStationHistory(
  params: StationHistoryParams,
  options: AdminQueryOptions = {},
) {
  return useQuery({ ...stationHistoryQuery(params), enabled: options.enabled });
}

export const analyticsCatalogQuery = () =>
  queryOptions({
    queryKey: ['admin', 'analytics', 'AnalyticsCatalog'],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/analytics/catalog', { signal })
        .then(responseData),
  });

export function useAnalyticsCatalog(options: AdminQueryOptions = {}) {
  return useQuery({ ...analyticsCatalogQuery(), enabled: options.enabled });
}

export type TicketAnalyticsValueQuery = NonNullable<
  paths['/api/v1/analytics/tickets/value']['get']['parameters']['query']
>;
export interface TicketAnalyticsValueParams {
  query: TicketAnalyticsValueQuery;
}

export const ticketAnalyticsValueQuery = (params: TicketAnalyticsValueParams) =>
  queryOptions({
    queryKey: ['admin', 'analytics', 'TicketAnalyticsValue', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/analytics/tickets/value', { params, signal })
        .then(responseData),
  });

export function useTicketAnalyticsValue(
  params: TicketAnalyticsValueParams,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...ticketAnalyticsValueQuery(params),
    enabled: options.enabled,
  });
}

export type StationAnalyticsValueQuery = NonNullable<
  paths['/api/v1/analytics/stations/value']['get']['parameters']['query']
>;
export interface StationAnalyticsValueParams {
  query: StationAnalyticsValueQuery;
}

export const stationAnalyticsValueQuery = (
  params: StationAnalyticsValueParams,
) =>
  queryOptions({
    queryKey: ['admin', 'analytics', 'StationAnalyticsValue', params],
    queryFn: ({ signal }) =>
      adminRestClient
        .GET('/api/v1/analytics/stations/value', { params, signal })
        .then(responseData),
  });

export function useStationAnalyticsValue(
  params: StationAnalyticsValueParams,
  options: AdminQueryOptions = {},
) {
  return useQuery({
    ...stationAnalyticsValueQuery(params),
    enabled: options.enabled,
  });
}

export interface UpdateCurrentUserInput {
  body: paths['/api/v1/users/me']['patch']['requestBody']['content']['application/json'];
}

export function useUpdateCurrentUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body }: UpdateCurrentUserInput) =>
      adminRestClient.PATCH('/api/v1/users/me', { body }).then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'session'] }),
  });
}

export interface UpdateProjectSettingsInput {
  body: paths['/api/v1/admin/project-settings']['patch']['requestBody']['content']['application/json'];
}

export function useUpdateProjectSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body }: UpdateProjectSettingsInput) =>
      adminRestClient
        .PATCH('/api/v1/admin/project-settings', { body })
        .then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
}

export interface AssignUserRoleInput {
  params: paths['/api/v1/admin/users/{user_uuid}/role']['post']['parameters'];
  body: paths['/api/v1/admin/users/{user_uuid}/role']['post']['requestBody']['content']['application/json'];
}

export function useAssignUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, body }: AssignUserRoleInput) =>
      adminRestClient
        .POST('/api/v1/admin/users/{user_uuid}/role', { params, body })
        .then(responseData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface RevokeUserSessionsInput {
  params: paths['/api/v1/admin/users/{user_uuid}/revoke-sessions']['post']['parameters'];
}

export function useRevokeUserSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params }: RevokeUserSessionsInput) =>
      adminRestClient
        .POST('/api/v1/admin/users/{user_uuid}/revoke-sessions', { params })
        .then(() => undefined),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export interface CreateTeamInput {
  body: paths['/api/v1/admin/teams']['post']['requestBody']['content']['application/json'];
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body }: CreateTeamInput) =>
      adminRestClient.POST('/api/v1/admin/teams', { body }).then(responseData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface AddTeamMemberInput {
  params: paths['/api/v1/admin/teams/{team_uuid}/members']['post']['parameters'];
  body: paths['/api/v1/admin/teams/{team_uuid}/members']['post']['requestBody']['content']['application/json'];
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, body }: AddTeamMemberInput) =>
      adminRestClient
        .POST('/api/v1/admin/teams/{team_uuid}/members', { params, body })
        .then(responseData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface RemoveTeamMemberInput {
  params: paths['/api/v1/admin/teams/{team_uuid}/members/{user_uuid}']['delete']['parameters'];
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params }: RemoveTeamMemberInput) =>
      adminRestClient
        .DELETE('/api/v1/admin/teams/{team_uuid}/members/{user_uuid}', {
          params,
        })
        .then(responseData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface CreateRoleInput {
  body: paths['/api/v1/admin/rbac/roles']['post']['requestBody']['content']['application/json'];
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body }: CreateRoleInput) =>
      adminRestClient
        .POST('/api/v1/admin/rbac/roles', { body })
        .then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'rbac'] }),
  });
}

export interface RenameRoleInput {
  params: paths['/api/v1/admin/rbac/roles/{role_uuid}']['patch']['parameters'];
  body: paths['/api/v1/admin/rbac/roles/{role_uuid}']['patch']['requestBody']['content']['application/json'];
}

export function useRenameRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, body }: RenameRoleInput) =>
      adminRestClient
        .PATCH('/api/v1/admin/rbac/roles/{role_uuid}', { params, body })
        .then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'rbac'] }),
  });
}

export interface DeleteRoleInput {
  params: paths['/api/v1/admin/rbac/roles/{role_uuid}']['delete']['parameters'];
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params }: DeleteRoleInput) =>
      adminRestClient
        .DELETE('/api/v1/admin/rbac/roles/{role_uuid}', { params })
        .then(() => undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface SetRolePermissionInput {
  params: paths['/api/v1/admin/rbac/roles/{role_uuid}/permissions/{cap}']['put']['parameters'];
  body: paths['/api/v1/admin/rbac/roles/{role_uuid}/permissions/{cap}']['put']['requestBody']['content']['application/json'];
}

export function useSetRolePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, body }: SetRolePermissionInput) =>
      adminRestClient
        .PUT('/api/v1/admin/rbac/roles/{role_uuid}/permissions/{cap}', {
          params,
          body,
        })
        .then(responseData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface DeleteRolePermissionInput {
  params: paths['/api/v1/admin/rbac/roles/{role_uuid}/permissions/{cap}']['delete']['parameters'];
}

export function useDeleteRolePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params }: DeleteRolePermissionInput) =>
      adminRestClient
        .DELETE('/api/v1/admin/rbac/roles/{role_uuid}/permissions/{cap}', {
          params,
        })
        .then(() => undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface SetUserPermissionInput {
  params: paths['/api/v1/admin/users/{user_uuid}/permissions/{cap}']['put']['parameters'];
  body: paths['/api/v1/admin/users/{user_uuid}/permissions/{cap}']['put']['requestBody']['content']['application/json'];
}

export function useSetUserPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, body }: SetUserPermissionInput) =>
      adminRestClient
        .PUT('/api/v1/admin/users/{user_uuid}/permissions/{cap}', {
          params,
          body,
        })
        .then(responseData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface DeleteUserPermissionInput {
  params: paths['/api/v1/admin/users/{user_uuid}/permissions/{cap}']['delete']['parameters'];
}

export function useDeleteUserPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params }: DeleteUserPermissionInput) =>
      adminRestClient
        .DELETE('/api/v1/admin/users/{user_uuid}/permissions/{cap}', { params })
        .then(() => undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface RemoveUserRoleInput {
  params: paths['/api/v1/admin/users/{user_uuid}/role/{role_uuid}']['delete']['parameters'];
}

export function useRemoveUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params }: RemoveUserRoleInput) =>
      adminRestClient
        .DELETE('/api/v1/admin/users/{user_uuid}/role/{role_uuid}', { params })
        .then(() => undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export interface MarkNotificationReadInput {
  params: paths['/api/v1/notifications/{uuid}/read']['patch']['parameters'];
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params }: MarkNotificationReadInput) =>
      adminRestClient
        .PATCH('/api/v1/notifications/{uuid}/read', { params })
        .then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      adminRestClient
        .PATCH('/api/v1/notifications/read-all', {})
        .then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] }),
  });
}

export interface ExportStationsInput {
  params: paths['/api/v1/bulk/stations/export']['get']['parameters'];
}

export function useExportStations() {
  return useMutation({
    mutationFn: ({ params }: ExportStationsInput) =>
      adminRestClient
        .GET('/api/v1/bulk/stations/export', { params, parseAs: 'blob' })
        .then(responseData),
  });
}

export interface ExportTicketsInput {
  params: paths['/api/v1/bulk/tickets/export']['get']['parameters'];
}

export function useExportTickets() {
  return useMutation({
    mutationFn: ({ params }: ExportTicketsInput) =>
      adminRestClient
        .GET('/api/v1/bulk/tickets/export', { params, parseAs: 'blob' })
        .then(responseData),
  });
}

export interface PreviewStationImportInput {
  params: paths['/api/v1/bulk/stations/import/preview']['post']['parameters'];
  body: paths['/api/v1/bulk/stations/import/preview']['post']['requestBody']['content']['multipart/form-data'];
}

export function usePreviewStationImport() {
  return useMutation({
    mutationFn: ({ params, body }: PreviewStationImportInput) =>
      adminRestClient
        .POST('/api/v1/bulk/stations/import/preview', {
          params,
          body,
          bodySerializer: (body) => {
            const form = new FormData();
            form.append('file', body.file);
            return form;
          },
        })
        .then(responseData),
  });
}

export interface PreviewTicketImportInput {
  params: paths['/api/v1/bulk/tickets/import/preview']['post']['parameters'];
  body: paths['/api/v1/bulk/tickets/import/preview']['post']['requestBody']['content']['multipart/form-data'];
}

export function usePreviewTicketImport() {
  return useMutation({
    mutationFn: ({ params, body }: PreviewTicketImportInput) =>
      adminRestClient
        .POST('/api/v1/bulk/tickets/import/preview', {
          params,
          body,
          bodySerializer: (body) => {
            const form = new FormData();
            form.append('file', body.file);
            return form;
          },
        })
        .then(responseData),
  });
}

export interface CommitStationImportInput {
  params: paths['/api/v1/bulk/stations/import/commit']['post']['parameters'];
  body: paths['/api/v1/bulk/stations/import/commit']['post']['requestBody']['content']['multipart/form-data'];
}

export function useCommitStationImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, body }: CommitStationImportInput) =>
      adminRestClient
        .POST('/api/v1/bulk/stations/import/commit', {
          params,
          body,
          bodySerializer: (body) => {
            const form = new FormData();
            form.append('file', body.file);
            return form;
          },
        })
        .then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'stations'] }),
  });
}

export interface CommitTicketImportInput {
  params: paths['/api/v1/bulk/tickets/import/commit']['post']['parameters'];
  body: paths['/api/v1/bulk/tickets/import/commit']['post']['requestBody']['content']['multipart/form-data'];
}

export function useCommitTicketImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, body }: CommitTicketImportInput) =>
      adminRestClient
        .POST('/api/v1/bulk/tickets/import/commit', {
          params,
          body,
          bodySerializer: (body) => {
            const form = new FormData();
            form.append('file', body.file);
            return form;
          },
        })
        .then(responseData),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] }),
  });
}
