import type { ReactNode } from 'react';

export type StationDetailTabId = 'info' | 'history' | 'pendingCorrections';

export type StationStatusTone = 'active' | 'warning' | 'inactive';

export interface StationDetailActionProps {
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  intent?: 'neutral' | 'danger';
  placement?: 'inline' | 'block';
  onClick?: () => void;
}

export interface StationDetailCloseActionProps {
  icon?: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
}

export interface StationStatusBadgeProps {
  label: string;
  tone?: StationStatusTone;
  dotColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
}

export interface StationSummaryProps {
  stationCode: string;
  stationIcon?: ReactNode;
  address: string;
  addressIcon?: ReactNode;
  status: StationStatusBadgeProps;
}

export interface StationCapacityBarProps {
  label?: string;
  currentValue: number;
  totalValue: number;
  progress?: number;
}

export interface StationDetailTabItem {
  id: StationDetailTabId;
  label: string;
  icon?: ReactNode;
  badgeCount?: number;
}

export interface StationContactMethodItem {
  id: string;
  value: string;
  icon?: ReactNode;
}

export interface StationContactCardProps {
  name: string;
  role: string;
  avatarIcon?: ReactNode;
  methods: readonly StationContactMethodItem[];
}

export interface StationResourceItem {
  id: string;
  label: string;
  value: number | string;
  icon?: ReactNode;
}

export type StationDetailTabPanels = Partial<
  Record<StationDetailTabId, ReactNode>
>;

export interface StationDetailDrawerProps {
  stationSummary: StationSummaryProps;
  capacity?: StationCapacityBarProps;
  tabs: readonly StationDetailTabItem[];
  activeTab: StationDetailTabId;
  editAction?: StationDetailActionProps;
  secondaryAction?: StationDetailActionProps;
  onTabChange?: (tabId: StationDetailTabId) => void;
  contactCard?: StationContactCardProps;
  resources?: readonly StationResourceItem[];
  tabPanels?: StationDetailTabPanels;
  footerAction?: StationDetailActionProps;
  closeAction?: StationDetailCloseActionProps;
  width?: number | string;
  height?: number | string;
  minHeight?: number | string;
}
