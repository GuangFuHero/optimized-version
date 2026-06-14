import type { ReactNode } from 'react';

import type { ListPaginationProps } from '@rescue-frontend/ui';

export interface TicketListActionItem {
  id: string;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  variant?: 'outlined' | 'filled';
  onClick?: () => void;
}

export interface TicketListFilterItem {
  id: string;
  label: string;
  selected?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

export interface TicketListFilterPanelOption {
  value: string;
  label: string;
}

export interface TicketListFilterPanelItem {
  id: string;
  label: string;
  options: readonly TicketListFilterPanelOption[];
}

export interface TicketListIndicatorAction {
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
}

export type TicketRowStatus =
  | 'critical'
  | 'inProgress'
  | 'pending'
  | 'completed';

export type TicketPriority = 'high' | 'medium' | 'low';

export type TicketVerificationStatus =
  | 'aiVerified'
  | 'humanVerified'
  | 'unverified'
  | 'disputed';

export interface TicketListRowItem {
  id: string;
  status: TicketRowStatus;
  code: string;
  title: string;
  taskType: string;
  disasterType: string;
  disasterGlyph?: string;
  region?: string;
  location: string;
  priority: TicketPriority;
  verification: TicketVerificationStatus;
  aiFlagged?: boolean;
  createdAt: string;
  onOverflowClick?: () => void;
}

export type TicketListPaginationProps = Pick<
  ListPaginationProps,
  | 'page'
  | 'pageCount'
  | 'onPageChange'
  | 'previousAriaLabel'
  | 'nextAriaLabel'
  | 'onPrevious'
  | 'onNext'
> & {
  rowsPerPageLabel?: string;
  rowsPerPageValue?: string;
  visibleRangeLabel?: string;
};

export interface TicketListHeaderProps {
  title?: string;
  actions?: readonly TicketListActionItem[];
}

export interface TicketListFilterBarProps {
  items?: readonly TicketListFilterItem[];
  panels?: readonly TicketListFilterPanelItem[];
  selectedValues?: Readonly<Record<string, string | undefined>>;
  onFilterChange?: (filterId: string, value?: string) => void;
  clearLabel?: string;
  onClear?: () => void;
  aiReviewIndicator?: TicketListIndicatorAction;
}

export interface TicketTableProps {
  rows?: readonly TicketListRowItem[];
  minWidth?: number | string;
}

export interface TicketListCanvasProps {
  headerTitle?: string;
  countLabel?: string;
  headerActions?: readonly TicketListActionItem[];
  filters?: readonly TicketListFilterItem[];
  filterPanels?: readonly TicketListFilterPanelItem[];
  selectedFilterValues?: Readonly<Record<string, string | undefined>>;
  onFilterChange?: (filterId: string, value?: string) => void;
  clearFiltersLabel?: string;
  onClearFilters?: () => void;
  aiReviewIndicator?: TicketListIndicatorAction;
  rows?: readonly TicketListRowItem[];
  totalCountLabel?: string;
  pagination?: TicketListPaginationProps;
  minHeight?: number | string;
  tableMinWidth?: number | string;
}
