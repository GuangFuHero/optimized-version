export {
  AuthField,
  AuthFooterLinks,
  AuthFormError,
  authHref,
  AuthIdentityToggle,
  AuthPasswordField,
  AuthReturnHint,
  AuthShell,
  LoginForm,
  RegisterForm,
  newPasswordFieldProblems,
  newPasswordProblem,
  newPasswordText,
  normalizeIdentityValue,
  normalizePassword,
  signedInMessage,
  validateIdentityValue,
} from './auth/login';
export type { AuthIdentityType } from './auth/login';
export { ForgotPasswordFormClient } from './auth/login/forgot-password-form.client';
export { LoginFormClient } from './auth/login/login-form.client';
export { RegisterFormClient } from './auth/login/register-form.client';
export { ResetPasswordFormClient } from './auth/login/reset-password-form.client';
export { AccountSecurityClient } from './auth/session/account-security.client';
export { AccountSecurityInBrowser } from './auth/session/account-security-in-browser.client';
export { PortalSiteShell } from './auth/session/site-shell.client';
export { SiteAnnouncementBanner } from './announcement';
export { ROLE_DISPLAY_NAMES } from './constants/roles';

export { ApplicationProviders, SiteProviders } from './providers';

export {
  createSiteHref,
  parseSiteRouteState,
  SITE_BASE_LAYERS,
  SITE_DATA_TYPE_LABELS,
  SITE_DATA_TYPES,
  SITE_FALLBACK_DATA_TYPE,
  SITE_MODULES,
  SITE_SUB_DATA_TYPE_OPTIONS,
  useSiteRouteState,
} from './route';
export type {
  SiteModule,
  SiteQuerySource,
  SiteRouteController,
  SiteRouteState,
  SiteSubDataTypeOption,
} from './route';

export { SiteListView } from './list';

export { Map, readRescueMapMarkers } from './map';
export { hasRescueMapDetailItem } from './map/location-cells';
export {
  AREA_KIND_LABELS,
  AREA_LABEL_NAME_MAX,
  type RescueMapAreaKind,
} from './map/areas';
export { PUBLIC_ZONE_COLORS } from './map/constants';
export type {
  RescueMapClosureArea,
  RescueMapDraftArea,
  RescueMapEditArea,
  RescueMapPublicZone,
  RescueMapBaseLayer,
  RescueMapControllerValue,
  RescueMapDataType,
  RescueMapDraftPoint,
  RescueMapMarkerItem,
  RescueMapOverlayLayer,
  RescueMapRouteState,
} from './map/types';

export {
  activeFilterCount,
  ADMIN_MAP_PRIORITIES,
  ADMIN_MAP_STATION_TYPES,
  ADMIN_MAP_STATUSES,
  areaErrorMessage,
  boundaryChange,
  countInsideArea,
  editableOutline,
  DEFAULT_ADMIN_MAP_FILTERS,
  filterMarkers,
  isFiltering,
  toggleValue,
  type AdminMapFilters,
  isInArea,
  polygonAreaKm2,
  polygonSelfIntersects,
  toGeoJsonPolygon,
  useAdminMapAreas,
  useAdminMapLiveMarkers,
  viewOfArea,
  type AdminMapAreas,
  type AdminMapLiveMarkers,
  type AreaContents,
  type BoundaryChange,
} from './map/admin';

export {
  createSiteMapViewportStore,
  dedupeMarkersById,
  SiteMapControls,
  SiteMapRouteProvider,
  useCreatedTicketMarker,
  useSiteMapLiveData,
  useSiteMapLiveDataSnapshot,
  usePaginatedRescueMapMarkers,
  useSiteMapRouteState,
  useSiteMapViewportState,
  useSiteMapViewportStore,
  type SiteMapViewportStore,
} from './map/site';

export {
  createPointShareTarget,
  createQrDataUrl,
  createQrSvg,
  copyPointShareUrl,
  downloadQrSvg,
  createPointShareLinks,
  openPointShareLink,
  PointShareDrawer,
  resolvePointShareTargetFromRoute,
  resolvePointShareTargetFromState,
  SITE_LIST_METADATA,
  syncDocumentMetadata,
} from './point-share';
export type {
  PointShareChannel,
  PointShareLink,
  PointShareTarget,
} from './point-share';

export { AnnouncementPage } from './admin/announcement';
export { BackOfficePlaceholder } from './role-request';
export {
  AdminErrorPage,
  AdminPlaceholderPage,
  AdminShell,
  NoBackOfficeAccess,
} from './shell';
export type { AdminShellProps } from './shell';

// The browser's half of the session-expiry handling; the pure half is `@rescue-frontend/modules/session`.
export {
  endExpiredSession,
  isSigningOutHere,
  markSigningOutHere,
  sessionExpiryFetch,
  sessionStorageOrNull,
} from './session/end-expired-session';
export { SessionExpiredNotice } from './session/session-expired-notice';
export { AuthSessionProvider, useAuthSession } from './session/auth-session';
export { BriefingsPage } from './briefing/admin/briefings-page';

export {
  SiteActionDrawer,
  SiteNotFound,
  SiteShell,
  SiteTextScale,
  type SiteActionDrawerProps,
} from './shell/site';

export {
  StationCreateDrawer,
  StationDetailDrawer,
  StationManagementPage,
} from './station';

export {
  TicketCreateDrawer,
  TicketDetailDrawer,
  createTaskMatchTicketDetailOverrides,
} from './ticket';
export { NeedClaimProvider } from './ticket/needs';
export type { ReloadedTicket } from './ticket/needs';
export {
  clearAllHelpRequestDrafts,
  MapRequestHelpBar,
  PlaceHereAction,
} from './ticket/help-request';
