export interface M3ColorScheme {
  // ── Core ────────────────────────────────────────────────────
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  // ── Surface ─────────────────────────────────────────────────
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  // ── Outline ─────────────────────────────────────────────────
  outline: string;
  outlineVariant: string;

  // ── Inverse ─────────────────────────────────────────────────
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;

  // ── Other ───────────────────────────────────────────────────
  shadow: string;
  scrim: string;
  surfaceTint: string;

  // ── Semantic (rescue) ────────────────────────────────────────
  danger: string;
  onDanger: string;
  dangerContainer: string;
  onDangerContainer: string;

  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;

  safe: string;
  onSafe: string;
  safeContainer: string;
  onSafeContainer: string;
}

export type RescueColorMode = 'light' | 'dark';

export const moduleColorSchemeInventory = {
  auth: ['authPalette', 'heroDesktopOverlay', 'heroMobileOverlay'],
  adminShell: ['sidebarPalette', 'topNavBarPalette'],
  adminPanels: [
    'inviteSideSheetPalette',
    'userManagementPalette',
    'fieldConfigurationPalette',
  ],
  stationList: ['stationListPalette'],
  stationDetail: ['stationDetailPalette'],
  ticket: ['ticketListPalette', 'ticketDetailPalette'],
  mapOverlay: ['mapOverlayPalette'],
} as const;

export interface AuthColorScheme {
  pageBackground: string;
  heroBackground: string;
  heroBorder: string;
  heroBody: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  fieldBackground: string;
  fieldBorder: string;
  primaryAction: string;
  primaryActionHover: string;
  warmLink: string;
  coolLink: string;
  divider: string;
  info: string;
  error: string;
  heroDesktopOverlay: string;
  heroMobileOverlay: string;
}

export interface SidebarColorScheme {
  frame: string;
  border: string;
  heading: string;
  bodyText: string;
  primaryAction: string;
  primaryActionText: string;
  primaryActionHover: string;
  activeSurface: string;
  activeText: string;
  navText: string;
  sectionText: string;
  layerText: string;
  layerChecked: string;
  layerUnchecked: string;
  layerUncheckedBorder: string;
}

export interface TopNavBarColorScheme {
  frame: string;
  border: string;
  searchBorder: string;
  searchBorderFocus: string;
  searchText: string;
  brandText: string;
  roleText: string;
  surface: string;
  avatarHover: string;
}

export interface InviteSideSheetColorScheme {
  frame: string;
  frameBorder: string;
  bodySurface: string;
  bodyText: string;
  heading: string;
  actionSurface: string;
  actionSurfaceHover: string;
  actionText: string;
  copySurface: string;
  copySurfaceHover: string;
  copyText: string;
  warningText: string;
  qrBorder: string;
  roleSurface: string;
}

export interface UserManagementColorScheme {
  surface: string;
  shellBackground: string;
  border: string;
  shadow: string;
  heading: string;
  bodyText: string;
  actionSurface: string;
  actionSurfaceHover: string;
  actionText: string;
  noticeSurface: string;
  noticeAccent: string;
  headerSurface: string;
  rowHighlight: string;
  roleSurface: string;
  roleText: string;
  roleMutedText: string;
  approvalPrimary: string;
  approvalSecondary: string;
  actionLink: string;
}

export interface FieldConfigurationColorScheme {
  surface: string;
  bodySurface: string;
  footerSurface: string;
  border: string;
  shadow: string;
  headerSurface: string;
  headerText: string;
  contextText: string;
  heading: string;
  bodyText: string;
  mutedBodyText: string;
  metadataText: string;
  helperText: string;
  helperTextMuted: string;
  sectionBorder: string;
  extensionHighlightBorder: string;
  extensionHighlightSurface: string;
  neutralBadgeSurface: string;
  neutralBadgeText: string;
  actionSurface: string;
  actionSurfaceHover: string;
  actionText: string;
  trackOn: string;
  trackOff: string;
  knobOn: string;
  knobOff: string;
}

export interface StationListColorScheme {
  shell: string;
  surface: string;
  canvas: string;
  border: string;
  divider: string;
  heading: string;
  bodyText: string;
  mutedText: string;
  action: string;
  actionText: string;
  actionHover: string;
  activeSurface: string;
  activeText: string;
  limitedSurface: string;
  limitedText: string;
  offlineSurface: string;
  offlineText: string;
  danger: string;
  cool: string;
}

export interface StationDetailColorScheme {
  frame: string;
  tabSurface: string;
  footerSurface: string;
  border: string;
  heading: string;
  bodyText: string;
  sectionText: string;
  cardSurface: string;
  cardBorder: string;
  cardDivider: string;
  activeStatusBackground: string;
  activeStatusBorder: string;
  activeStatusDot: string;
  activeStatusText: string;
  warningStatusBackground: string;
  warningStatusBorder: string;
  warningStatusDot: string;
  warningStatusText: string;
  inactiveStatusBackground: string;
  inactiveStatusBorder: string;
  inactiveStatusDot: string;
  inactiveStatusText: string;
  capacityTrack: string;
  capacityFill: string;
  editActionBackground: string;
  editActionText: string;
  editActionHover: string;
  tabActiveSurface: string;
  tabActiveAccent: string;
  tabActiveText: string;
  tabInactiveText: string;
  pendingBadgeBackground: string;
  pendingBadgeBorder: string;
  pendingBadgeText: string;
  contactAvatarBackground: string;
  destructiveActionText: string;
  destructiveActionBorder: string;
  destructiveActionHover: string;
}

export interface TicketListColorScheme {
  canvas: string;
  headerSurface: string;
  frameBorder: string;
  tableBorder: string;
  heading: string;
  bodyText: string;
  strongText: string;
  countSurface: string;
  countText: string;
  actionSurface: string;
  actionFilled: string;
  actionFilledText: string;
  actionHover: string;
  filterSelected: string;
  activeBorder: string;
  critical: string;
  inProgress: string;
  pendingSurface: string;
  completed: string;
  warningText: string;
  unverified: string;
  disputedSurface: string;
  disputedText: string;
  verificationSurface: string;
  paginationIcon: string;
}

export interface TicketDetailColorScheme {
  frame: string;
  frameBorder: string;
  surface: string;
  heading: string;
  summary: string;
  label: string;
  body: string;
  tabActiveSurface: string;
  tabActiveText: string;
  tabInactiveText: string;
  badgeIconSurface: string;
  badgeAccent: string;
  neutralActionText: string;
  danger: string;
}

export interface MapOverlayColorScheme {
  surface: string;
  border: string;
  activeSurface: string;
  text: string;
  mutedText: string;
  shadow: string;
  cardSurface: string;
  progressTrack: string;
}

export interface RescueModuleColorScheme {
  auth: AuthColorScheme;
  adminShell: {
    sidebar: SidebarColorScheme;
    topNavBar: TopNavBarColorScheme;
  };
  adminPanels: {
    inviteSideSheet: InviteSideSheetColorScheme;
    userManagement: UserManagementColorScheme;
    fieldConfiguration: FieldConfigurationColorScheme;
  };
  stationList: StationListColorScheme;
  stationDetail: StationDetailColorScheme;
  ticket: {
    list: TicketListColorScheme;
    detail: TicketDetailColorScheme;
  };
  mapOverlay: MapOverlayColorScheme;
}

interface ModuleColorPrimitives {
  surface: string;
  shellSurface: string;
  frameSurface: string;
  panelSurface: string;
  tintSurface: string;
  darkSurface: string;
  border: string;
  divider: string;
  mutedTrack: string;
  textPrimary: string;
  textSecondary: string;
  action: string;
  actionHover: string;
  actionText: string;
  warmAccent: string;
  coolAccent: string;
  danger: string;
}

const moduleColorPrimitives: Record<RescueColorMode, ModuleColorPrimitives> = {
  light: {
    surface: '#FFFFFF',
    shellSurface: '#F6FAFF',
    frameSurface: '#F6FAFF',
    panelSurface: '#E7EFF7',
    tintSurface: '#F6FAFF',
    darkSurface: '#293138',
    border: '#DCC1B1',
    divider: '#dbe3ec',
    mutedTrack: '#D3DBE3',
    textPrimary: '#151C22',
    textSecondary: '#564337',
    action: '#E3791E',
    actionHover: '#D36A0D',
    actionText: '#4C2200',
    warmAccent: '#954900',
    coolAccent: '#77D5FE',
    danger: '#BA1A1A',
  },
  dark: {
    surface: '#1E2022',
    shellSurface: '#111417',
    frameSurface: '#1E2022',
    panelSurface: '#282A2C',
    tintSurface: '#1A1C1E',
    darkSurface: '#0F1113',
    border: '#44464F',
    divider: '#333537',
    mutedTrack: '#333537',
    textPrimary: '#E2E2E6',
    textSecondary: '#C5C6D0',
    action: '#FFBA3B',
    actionHover: '#E5A62B',
    actionText: '#412D00',
    warmAccent: '#FFDEAA',
    coolAccent: '#77D5FE',
    danger: '#FFB4AB',
  },
};

const lightModuleColors = moduleColorPrimitives.light;
const darkModuleColors = moduleColorPrimitives.dark;

export const colorSchemes: Record<'light' | 'dark', M3ColorScheme> = {
  light: {
    // Primary
    primary: '#179BC6',
    onPrimary: '#FFFFFF',
    primaryContainer: '#D8E2FF',
    onPrimaryContainer: '#001945',
    // Secondary
    secondary: '#585E71',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#DCE2F9',
    onSecondaryContainer: '#15192B',
    // Tertiary
    tertiary: '#725472',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#FDD7FB',
    onTertiaryContainer: '#2A122B',
    // Error
    error: '#BA1A1A',
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410002',
    // Surface
    background: '#FAFAF9',
    onBackground: '#1A1C1E',
    surface: '#FAFAF9',
    onSurface: '#1A1C1E',
    surfaceVariant: '#E1E2EC',
    onSurfaceVariant: '#44464F',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F5F3FA',
    surfaceContainer: '#EEEDF4',
    surfaceContainerHigh: '#E8E8EF',
    surfaceContainerHighest: '#E2E2E9',
    // Outline
    outline: '#757680',
    outlineVariant: '#C5C6D0',
    // Inverse
    inverseSurface: '#2F3033',
    inverseOnSurface: '#F1F0F4',
    inversePrimary: '#ADC6FF',
    // Other
    shadow: '#000000',
    scrim: '#000000',
    surfaceTint: '#005AC1',
    // Semantic — Danger
    danger: '#BA1A1A',
    onDanger: '#FFFFFF',
    dangerContainer: '#FFDAD6',
    onDangerContainer: '#410002',
    // Semantic — Warning
    warning: '#7D5700',
    onWarning: '#FFFFFF',
    warningContainer: '#FFDEAA',
    onWarningContainer: '#271600',
    // Semantic — Safe
    safe: '#1B6B3A',
    onSafe: '#FFFFFF',
    safeContainer: '#A7F2C4',
    onSafeContainer: '#00210D',
  },

  dark: {
    // Primary
    primary: '#ADC6FF',
    onPrimary: '#002D6D',
    primaryContainer: '#00429B',
    onPrimaryContainer: '#D8E2FF',
    // Secondary
    secondary: '#C0C5DD',
    onSecondary: '#2A2F42',
    secondaryContainer: '#404659',
    onSecondaryContainer: '#DCE2F9',
    // Tertiary
    tertiary: '#E0BAE0',
    onTertiary: '#412741',
    tertiaryContainer: '#593C58',
    onTertiaryContainer: '#FDD7FB',
    // Error
    error: '#FFB4AB',
    onError: '#690005',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',
    // Surface
    background: '#1A1C1E',
    onBackground: '#E2E2E6',
    surface: '#1A1C1E',
    onSurface: '#E2E2E6',
    surfaceVariant: '#44464F',
    onSurfaceVariant: '#C5C6D0',
    surfaceContainerLowest: '#0F1113',
    surfaceContainerLow: '#1A1C1E',
    surfaceContainer: '#1E2022',
    surfaceContainerHigh: '#282A2C',
    surfaceContainerHighest: '#333537',
    // Outline
    outline: '#8E9099',
    outlineVariant: '#44464F',
    // Inverse
    inverseSurface: '#E2E2E6',
    inverseOnSurface: '#2F3033',
    inversePrimary: '#005AC1',
    // Other
    shadow: '#000000',
    scrim: '#000000',
    surfaceTint: '#ADC6FF',
    // Semantic — Danger
    danger: '#FFB4AB',
    onDanger: '#690005',
    dangerContainer: '#93000A',
    onDangerContainer: '#FFDAD6',
    // Semantic — Warning
    warning: '#FFBA3B',
    onWarning: '#412D00',
    warningContainer: '#5E4200',
    onWarningContainer: '#FFDEAA',
    // Semantic — Safe
    safe: '#8CD5A2',
    onSafe: '#00391C',
    safeContainer: '#00522B',
    onSafeContainer: '#A7F2C4',
  },
};

export const moduleColorSchemes: Record<
  RescueColorMode,
  RescueModuleColorScheme
> = {
  light: {
    auth: {
      pageBackground: lightModuleColors.shellSurface,
      heroBackground: lightModuleColors.darkSurface,
      heroBorder: lightModuleColors.border,
      heroBody: lightModuleColors.frameSurface,
      surface: lightModuleColors.surface,
      textPrimary: lightModuleColors.textPrimary,
      textSecondary: lightModuleColors.textSecondary,
      textMuted: 'rgba(86, 67, 55, 0.5)',
      fieldBackground: lightModuleColors.panelSurface,
      fieldBorder: lightModuleColors.border,
      primaryAction: lightModuleColors.action,
      primaryActionHover: '#CE6710',
      warmLink: lightModuleColors.warmAccent,
      coolLink: '#006685',
      divider: lightModuleColors.border,
      info: '#005A7A',
      error: '#A53B2A',
      heroDesktopOverlay: [
        'radial-gradient(circle at 18% 74%, rgba(14, 20, 26, 0.58) 0%, rgba(14, 20, 26, 0.32) 26%, rgba(14, 20, 26, 0) 58%)',
        'linear-gradient(90deg, rgba(16, 21, 28, 0.26) 0%, rgba(16, 21, 28, 0.12) 34%, rgba(16, 21, 28, 0.04) 58%, rgba(16, 21, 28, 0) 100%)',
        'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 18%, rgba(10, 14, 18, 0.12) 100%)',
      ].join(', '),
      heroMobileOverlay: [
        'radial-gradient(circle at 50% 22%, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.12) 30%, rgba(255, 255, 255, 0) 62%)',
        'linear-gradient(180deg, rgba(246, 250, 255, 0.54) 0%, rgba(246, 250, 255, 0.74) 42%, rgba(246, 250, 255, 0.9) 100%)',
      ].join(', '),
    },
    adminShell: {
      sidebar: {
        frame: lightModuleColors.tintSurface,
        border: lightModuleColors.border,
        heading: lightModuleColors.textPrimary,
        bodyText: lightModuleColors.textSecondary,
        primaryAction: lightModuleColors.action,
        primaryActionText: lightModuleColors.actionText,
        primaryActionHover: lightModuleColors.actionHover,
        activeSurface: lightModuleColors.coolAccent,
        activeText: '#005B77',
        navText: lightModuleColors.textSecondary,
        sectionText: lightModuleColors.textSecondary,
        layerText: lightModuleColors.textPrimary,
        layerChecked: lightModuleColors.warmAccent,
        layerUnchecked: lightModuleColors.divider,
        layerUncheckedBorder: lightModuleColors.border,
      },
      topNavBar: {
        frame: lightModuleColors.frameSurface,
        border: '#DCC1B1',
        searchBorder: '#6B7280',
        searchBorderFocus: '#374151',
        searchText: '#6B7280',
        brandText: '#000000',
        roleText: '#000000',
        surface: lightModuleColors.surface,
        avatarHover: '#F8FAFC',
      },
    },
    adminPanels: {
      inviteSideSheet: {
        frame: lightModuleColors.surface,
        frameBorder: lightModuleColors.border,
        bodySurface: lightModuleColors.tintSurface,
        bodyText: lightModuleColors.textSecondary,
        heading: lightModuleColors.textPrimary,
        actionSurface: lightModuleColors.action,
        actionSurfaceHover: lightModuleColors.actionHover,
        actionText: lightModuleColors.actionText,
        copySurface: lightModuleColors.coolAccent,
        copySurfaceHover: '#5DC4F1',
        copyText: '#005B77',
        warningText: lightModuleColors.warmAccent,
        qrBorder: lightModuleColors.action,
        roleSurface: lightModuleColors.surface,
      },
      userManagement: {
        surface: lightModuleColors.surface,
        shellBackground: lightModuleColors.shellSurface,
        border: lightModuleColors.border,
        shadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',
        heading: lightModuleColors.textPrimary,
        bodyText: lightModuleColors.textSecondary,
        actionSurface: lightModuleColors.action,
        actionSurfaceHover: lightModuleColors.actionHover,
        actionText: lightModuleColors.actionText,
        noticeSurface: 'rgba(227, 121, 30, 0.1)',
        noticeAccent: lightModuleColors.warmAccent,
        headerSurface: lightModuleColors.tintSurface,
        rowHighlight: 'rgba(237, 244, 253, 0.5)',
        roleSurface: lightModuleColors.tintSurface,
        roleText: lightModuleColors.textSecondary,
        roleMutedText: 'rgba(86, 67, 55, 0.2)',
        approvalPrimary: lightModuleColors.warmAccent,
        approvalSecondary: '#897365',
        actionLink: lightModuleColors.warmAccent,
      },
      fieldConfiguration: {
        surface: lightModuleColors.surface,
        bodySurface: lightModuleColors.shellSurface,
        footerSurface: lightModuleColors.panelSurface,
        border: lightModuleColors.border,
        shadow:
          '0px 20px 25px -5px rgba(0, 0, 0, 0.10), 0px 8px 10px -6px rgba(0, 0, 0, 0.10)',
        headerSurface: lightModuleColors.darkSurface,
        headerText: '#EAF2FA',
        contextText: '#FFDCC6',
        heading: lightModuleColors.textPrimary,
        bodyText: lightModuleColors.textPrimary,
        mutedBodyText: lightModuleColors.textSecondary,
        metadataText: '#5A6A80',
        helperText: lightModuleColors.textSecondary,
        helperTextMuted: '#897365',
        sectionBorder: lightModuleColors.border,
        extensionHighlightBorder: '#FFB786',
        extensionHighlightSurface: lightModuleColors.shellSurface,
        neutralBadgeSurface: lightModuleColors.divider,
        neutralBadgeText: lightModuleColors.textSecondary,
        actionSurface: lightModuleColors.action,
        actionSurfaceHover: lightModuleColors.actionHover,
        actionText: lightModuleColors.actionText,
        trackOn: lightModuleColors.action,
        trackOff: lightModuleColors.mutedTrack,
        knobOn: '#2563EB',
        knobOff: lightModuleColors.surface,
      },
    },
    stationList: {
      shell: lightModuleColors.mutedTrack,
      surface: lightModuleColors.shellSurface,
      canvas: lightModuleColors.surface,
      border: lightModuleColors.border,
      divider: lightModuleColors.divider,
      heading: lightModuleColors.textPrimary,
      bodyText: lightModuleColors.textSecondary,
      mutedText: '#6B7280',
      action: lightModuleColors.action,
      actionText: lightModuleColors.actionText,
      actionHover: '#F6E5D7',
      activeSurface: '#E8F5E9',
      activeText: '#2E7D32',
      limitedSurface: '#FFF4E5',
      limitedText: lightModuleColors.warmAccent,
      offlineSurface: '#F2F4F7',
      offlineText: '#475569',
      danger: lightModuleColors.danger,
      cool: '#006685',
    },
    stationDetail: {
      frame: lightModuleColors.frameSurface,
      tabSurface: lightModuleColors.panelSurface,
      footerSurface: lightModuleColors.tintSurface,
      border: lightModuleColors.border,
      heading: lightModuleColors.textPrimary,
      bodyText: lightModuleColors.textSecondary,
      sectionText: lightModuleColors.textSecondary,
      cardSurface: lightModuleColors.shellSurface,
      cardBorder: lightModuleColors.border,
      cardDivider: lightModuleColors.divider,
      activeStatusBackground: '#E8F5E9',
      activeStatusBorder: '#A5D6A7',
      activeStatusDot: '#4CAF50',
      activeStatusText: '#2E7D32',
      warningStatusBackground: '#FFF4E5',
      warningStatusBorder: '#F0B55A',
      warningStatusDot: lightModuleColors.action,
      warningStatusText: lightModuleColors.warmAccent,
      inactiveStatusBackground: '#F2F4F7',
      inactiveStatusBorder: '#CBD5E1',
      inactiveStatusDot: '#94A3B8',
      inactiveStatusText: '#475569',
      capacityTrack: lightModuleColors.divider,
      capacityFill: lightModuleColors.action,
      editActionBackground: lightModuleColors.shellSurface,
      editActionText: lightModuleColors.textPrimary,
      editActionHover: '#EAF2FB',
      tabActiveSurface: lightModuleColors.divider,
      tabActiveAccent: lightModuleColors.warmAccent,
      tabActiveText: lightModuleColors.warmAccent,
      tabInactiveText: lightModuleColors.textSecondary,
      pendingBadgeBackground: lightModuleColors.danger,
      pendingBadgeBorder: lightModuleColors.panelSurface,
      pendingBadgeText: '#FFFFFF',
      contactAvatarBackground: lightModuleColors.coolAccent,
      destructiveActionText: lightModuleColors.danger,
      destructiveActionBorder: lightModuleColors.danger,
      destructiveActionHover: 'rgba(186, 26, 26, 0.06)',
    },
    ticket: {
      list: {
        canvas: lightModuleColors.surface,
        headerSurface: lightModuleColors.shellSurface,
        frameBorder: lightModuleColors.border,
        tableBorder: lightModuleColors.divider,
        heading: lightModuleColors.textPrimary,
        bodyText: lightModuleColors.textSecondary,
        strongText: lightModuleColors.textPrimary,
        countSurface: lightModuleColors.frameSurface,
        countText: lightModuleColors.textSecondary,
        actionSurface: lightModuleColors.surface,
        actionFilled: lightModuleColors.action,
        actionFilledText: lightModuleColors.actionText,
        actionHover: '#F6E5D7',
        filterSelected: lightModuleColors.panelSurface,
        activeBorder: lightModuleColors.warmAccent,
        critical: lightModuleColors.danger,
        inProgress: '#006685',
        pendingSurface: lightModuleColors.mutedTrack,
        completed: '#15803D',
        warningText: lightModuleColors.warmAccent,
        unverified: lightModuleColors.danger,
        disputedSurface: '#FFDAD6',
        disputedText: '#93000A',
        verificationSurface: lightModuleColors.divider,
        paginationIcon: lightModuleColors.textSecondary,
      },
      detail: {
        frame: lightModuleColors.frameSurface,
        frameBorder: lightModuleColors.border,
        surface: lightModuleColors.panelSurface,
        heading: lightModuleColors.danger,
        summary: lightModuleColors.textPrimary,
        label: lightModuleColors.textSecondary,
        body: lightModuleColors.textPrimary,
        tabActiveSurface: lightModuleColors.divider,
        tabActiveText: lightModuleColors.warmAccent,
        tabInactiveText: lightModuleColors.textSecondary,
        badgeIconSurface: lightModuleColors.action,
        badgeAccent: lightModuleColors.warmAccent,
        neutralActionText: lightModuleColors.textPrimary,
        danger: lightModuleColors.danger,
      },
    },
    mapOverlay: {
      surface: 'rgba(225, 233, 241, 0.9)',
      border: lightModuleColors.border,
      activeSurface: lightModuleColors.divider,
      text: lightModuleColors.textPrimary,
      mutedText: lightModuleColors.textSecondary,
      shadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
      cardSurface: 'rgba(225, 233, 241, 0.9)',
      progressTrack: lightModuleColors.divider,
    },
  },
  dark: {
    auth: {
      pageBackground: darkModuleColors.shellSurface,
      heroBackground: darkModuleColors.darkSurface,
      heroBorder: darkModuleColors.border,
      heroBody: '#C5C6D0',
      surface: darkModuleColors.surface,
      textPrimary: darkModuleColors.textPrimary,
      textSecondary: darkModuleColors.textSecondary,
      textMuted: 'rgba(197, 198, 208, 0.5)',
      fieldBackground: darkModuleColors.panelSurface,
      fieldBorder: darkModuleColors.border,
      primaryAction: darkModuleColors.action,
      primaryActionHover: darkModuleColors.actionHover,
      warmLink: darkModuleColors.warmAccent,
      coolLink: darkModuleColors.coolAccent,
      divider: darkModuleColors.border,
      info: darkModuleColors.coolAccent,
      error: darkModuleColors.danger,
      heroDesktopOverlay: [
        'radial-gradient(circle at 18% 74%, rgba(0, 0, 0, 0.62) 0%, rgba(0, 0, 0, 0.42) 28%, rgba(0, 0, 0, 0) 62%)',
        'linear-gradient(90deg, rgba(8, 10, 12, 0.42) 0%, rgba(8, 10, 12, 0.2) 38%, rgba(8, 10, 12, 0.08) 62%, rgba(8, 10, 12, 0) 100%)',
        'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 18%, rgba(0, 0, 0, 0.18) 100%)',
      ].join(', '),
      heroMobileOverlay: [
        'radial-gradient(circle at 50% 22%, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 30%, rgba(255, 255, 255, 0) 62%)',
        'linear-gradient(180deg, rgba(17, 20, 23, 0.48) 0%, rgba(17, 20, 23, 0.68) 42%, rgba(17, 20, 23, 0.9) 100%)',
      ].join(', '),
    },
    adminShell: {
      sidebar: {
        frame: darkModuleColors.surface,
        border: darkModuleColors.border,
        heading: darkModuleColors.textPrimary,
        bodyText: darkModuleColors.textSecondary,
        primaryAction: darkModuleColors.action,
        primaryActionText: darkModuleColors.actionText,
        primaryActionHover: darkModuleColors.actionHover,
        activeSurface: 'rgba(119, 213, 254, 0.2)',
        activeText: darkModuleColors.coolAccent,
        navText: darkModuleColors.textSecondary,
        sectionText: darkModuleColors.textSecondary,
        layerText: darkModuleColors.textPrimary,
        layerChecked: darkModuleColors.warmAccent,
        layerUnchecked: darkModuleColors.divider,
        layerUncheckedBorder: '#8E9099',
      },
      topNavBar: {
        frame: darkModuleColors.surface,
        border: darkModuleColors.border,
        searchBorder: '#8E9099',
        searchBorderFocus: '#C5C6D0',
        searchText: darkModuleColors.textSecondary,
        brandText: darkModuleColors.textPrimary,
        roleText: darkModuleColors.textPrimary,
        surface: darkModuleColors.panelSurface,
        avatarHover: '#333537',
      },
    },
    adminPanels: {
      inviteSideSheet: {
        frame: darkModuleColors.surface,
        frameBorder: darkModuleColors.border,
        bodySurface: darkModuleColors.tintSurface,
        bodyText: darkModuleColors.textSecondary,
        heading: darkModuleColors.textPrimary,
        actionSurface: darkModuleColors.action,
        actionSurfaceHover: darkModuleColors.actionHover,
        actionText: darkModuleColors.actionText,
        copySurface: '#005B77',
        copySurfaceHover: '#006C8C',
        copyText: '#D8F2FF',
        warningText: darkModuleColors.warmAccent,
        qrBorder: darkModuleColors.action,
        roleSurface: darkModuleColors.panelSurface,
      },
      userManagement: {
        surface: darkModuleColors.surface,
        shellBackground: darkModuleColors.shellSurface,
        border: darkModuleColors.border,
        shadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.35)',
        heading: darkModuleColors.textPrimary,
        bodyText: darkModuleColors.textSecondary,
        actionSurface: darkModuleColors.action,
        actionSurfaceHover: darkModuleColors.actionHover,
        actionText: darkModuleColors.actionText,
        noticeSurface: 'rgba(255, 186, 59, 0.12)',
        noticeAccent: darkModuleColors.warmAccent,
        headerSurface: darkModuleColors.panelSurface,
        rowHighlight: 'rgba(68, 70, 79, 0.45)',
        roleSurface: darkModuleColors.panelSurface,
        roleText: darkModuleColors.textSecondary,
        roleMutedText: 'rgba(197, 198, 208, 0.3)',
        approvalPrimary: darkModuleColors.warmAccent,
        approvalSecondary: '#8E9099',
        actionLink: darkModuleColors.warmAccent,
      },
      fieldConfiguration: {
        surface: darkModuleColors.surface,
        bodySurface: darkModuleColors.shellSurface,
        footerSurface: darkModuleColors.tintSurface,
        border: darkModuleColors.border,
        shadow:
          '0px 20px 25px -5px rgba(0, 0, 0, 0.35), 0px 8px 10px -6px rgba(0, 0, 0, 0.25)',
        headerSurface: darkModuleColors.darkSurface,
        headerText: darkModuleColors.textPrimary,
        contextText: '#FFDCC6',
        heading: darkModuleColors.textPrimary,
        bodyText: darkModuleColors.textPrimary,
        mutedBodyText: darkModuleColors.textSecondary,
        metadataText: '#ADC6FF',
        helperText: darkModuleColors.textSecondary,
        helperTextMuted: '#8E9099',
        sectionBorder: darkModuleColors.border,
        extensionHighlightBorder: '#FFB786',
        extensionHighlightSurface: darkModuleColors.surface,
        neutralBadgeSurface: darkModuleColors.divider,
        neutralBadgeText: darkModuleColors.textSecondary,
        actionSurface: darkModuleColors.action,
        actionSurfaceHover: darkModuleColors.actionHover,
        actionText: darkModuleColors.actionText,
        trackOn: darkModuleColors.action,
        trackOff: darkModuleColors.mutedTrack,
        knobOn: '#ADC6FF',
        knobOff: darkModuleColors.textPrimary,
      },
    },
    stationList: {
      shell: darkModuleColors.mutedTrack,
      surface: darkModuleColors.shellSurface,
      canvas: darkModuleColors.surface,
      border: darkModuleColors.border,
      divider: darkModuleColors.divider,
      heading: darkModuleColors.textPrimary,
      bodyText: darkModuleColors.textSecondary,
      mutedText: '#8E9099',
      action: darkModuleColors.action,
      actionText: darkModuleColors.actionText,
      actionHover: darkModuleColors.divider,
      activeSurface: 'rgba(140, 213, 162, 0.16)',
      activeText: '#A7F2C4',
      limitedSurface: 'rgba(255, 186, 59, 0.16)',
      limitedText: darkModuleColors.warmAccent,
      offlineSurface: '#2F3033',
      offlineText: darkModuleColors.textSecondary,
      danger: darkModuleColors.danger,
      cool: darkModuleColors.coolAccent,
    },
    stationDetail: {
      frame: darkModuleColors.surface,
      tabSurface: darkModuleColors.panelSurface,
      footerSurface: darkModuleColors.tintSurface,
      border: darkModuleColors.border,
      heading: darkModuleColors.textPrimary,
      bodyText: darkModuleColors.textSecondary,
      sectionText: darkModuleColors.textSecondary,
      cardSurface: darkModuleColors.panelSurface,
      cardBorder: darkModuleColors.border,
      cardDivider: darkModuleColors.divider,
      activeStatusBackground: 'rgba(140, 213, 162, 0.16)',
      activeStatusBorder: '#8CD5A2',
      activeStatusDot: '#8CD5A2',
      activeStatusText: '#A7F2C4',
      warningStatusBackground: 'rgba(255, 186, 59, 0.16)',
      warningStatusBorder: darkModuleColors.action,
      warningStatusDot: darkModuleColors.action,
      warningStatusText: darkModuleColors.warmAccent,
      inactiveStatusBackground: '#2F3033',
      inactiveStatusBorder: '#8E9099',
      inactiveStatusDot: '#8E9099',
      inactiveStatusText: darkModuleColors.textSecondary,
      capacityTrack: darkModuleColors.divider,
      capacityFill: darkModuleColors.action,
      editActionBackground: darkModuleColors.panelSurface,
      editActionText: darkModuleColors.textPrimary,
      editActionHover: darkModuleColors.divider,
      tabActiveSurface: darkModuleColors.divider,
      tabActiveAccent: darkModuleColors.warmAccent,
      tabActiveText: darkModuleColors.warmAccent,
      tabInactiveText: darkModuleColors.textSecondary,
      pendingBadgeBackground: '#93000A',
      pendingBadgeBorder: darkModuleColors.surface,
      pendingBadgeText: '#FFDAD6',
      contactAvatarBackground: '#005B77',
      destructiveActionText: darkModuleColors.danger,
      destructiveActionBorder: darkModuleColors.danger,
      destructiveActionHover: 'rgba(255, 180, 171, 0.08)',
    },
    ticket: {
      list: {
        canvas: darkModuleColors.surface,
        headerSurface: darkModuleColors.shellSurface,
        frameBorder: darkModuleColors.border,
        tableBorder: darkModuleColors.divider,
        heading: darkModuleColors.textPrimary,
        bodyText: darkModuleColors.textSecondary,
        strongText: darkModuleColors.textPrimary,
        countSurface: '#2F3033',
        countText: darkModuleColors.textSecondary,
        actionSurface: darkModuleColors.panelSurface,
        actionFilled: darkModuleColors.action,
        actionFilledText: darkModuleColors.actionText,
        actionHover: darkModuleColors.divider,
        filterSelected: darkModuleColors.divider,
        activeBorder: darkModuleColors.warmAccent,
        critical: darkModuleColors.danger,
        inProgress: darkModuleColors.coolAccent,
        pendingSurface: darkModuleColors.divider,
        completed: '#8CD5A2',
        warningText: darkModuleColors.warmAccent,
        unverified: darkModuleColors.danger,
        disputedSurface: '#93000A',
        disputedText: '#FFDAD6',
        verificationSurface: darkModuleColors.divider,
        paginationIcon: darkModuleColors.textSecondary,
      },
      detail: {
        frame: darkModuleColors.surface,
        frameBorder: darkModuleColors.border,
        surface: darkModuleColors.panelSurface,
        heading: darkModuleColors.danger,
        summary: darkModuleColors.textPrimary,
        label: darkModuleColors.textSecondary,
        body: darkModuleColors.textPrimary,
        tabActiveSurface: darkModuleColors.divider,
        tabActiveText: darkModuleColors.warmAccent,
        tabInactiveText: darkModuleColors.textSecondary,
        badgeIconSurface: darkModuleColors.action,
        badgeAccent: darkModuleColors.warmAccent,
        neutralActionText: darkModuleColors.textPrimary,
        danger: darkModuleColors.danger,
      },
    },
    mapOverlay: {
      surface: 'rgba(30, 32, 34, 0.92)',
      border: darkModuleColors.border,
      activeSurface: darkModuleColors.divider,
      text: darkModuleColors.textPrimary,
      mutedText: darkModuleColors.textSecondary,
      shadow: '0px 1px 2px rgba(0, 0, 0, 0.35)',
      cardSurface: 'rgba(30, 32, 34, 0.92)',
      progressTrack: darkModuleColors.divider,
    },
  },
};

export const typography = {
  fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
  fontFamilyMono: '"JetBrains Mono", "Courier New", monospace',
} as const;

export const shape = {
  borderRadius: 12, // M3 medium shape
} as const;

export const spacing = {
  unit: 8,
} as const;
