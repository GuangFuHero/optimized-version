'use client';

import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { Icons } from '@rescue-frontend/ui';

import type { RescueMapTicketDetailOverrides } from '../../map/components/rescue-map-detail-drawer';
import type { RescueMapMarkerItem } from '../../map/types';
import { NeedClaimFooter } from '../needs';
import type { TicketDetailFooterActionItem } from '../ticket-detail';
import { TaskMatchHistoryPanel } from './task-match-history-panel';
import type { TaskMatchState } from './model';
import { TaskMatchTicketDetailsPanel } from './task-match-ticket-details-panel';

const DetailsIcon = Icons.details;

interface TaskMatchTicketDetailOptions {
  marker: RescueMapMarkerItem;
  state: TaskMatchState;
  isAuthenticated: boolean;
  canDeleteMatchSheet: boolean;
  onDeleteMatchSheet: () => void;
  onShare?: () => void;
}

function createFooterActions({
  state,
  canDeleteMatchSheet,
  onDeleteMatchSheet,
  onShare,
}: Omit<
  TaskMatchTicketDetailOptions,
  'marker' | 'isAuthenticated'
>): readonly TicketDetailFooterActionItem[] {
  const canDelete = canDeleteMatchSheet && state.status !== 'deleted';

  // Claiming is not an item here: a volunteer claims a need, and `NeedClaimFooter` (the footer
  // lead) is the one that knows the ticket's needs.
  return [
    ...(onShare
      ? [
          {
            id: 'share-point',
            label: '分享',
            icon: <ShareRoundedIcon />,
            onClick: onShare,
          },
        ]
      : []),
    ...(canDeleteMatchSheet
      ? [
          {
            id: 'delete-match-sheet',
            label: canDelete ? '刪除媒合單' : '媒合單已刪除',
            icon: <DeleteOutlineRoundedIcon />,
            disabled: !canDelete,
            intent: 'danger' as const,
            placement: 'block' as const,
            onClick: canDelete ? onDeleteMatchSheet : undefined,
          },
        ]
      : []),
  ];
}

export function createTaskMatchTicketDetailOverrides({
  marker,
  state,
  isAuthenticated,
  canDeleteMatchSheet,
  onDeleteMatchSheet,
  onShare,
}: TaskMatchTicketDetailOptions): RescueMapTicketDetailOverrides {
  return {
    tabs: [
      {
        id: 'details',
        label: '詳情',
        icon: <DetailsIcon />,
        selected: true,
      },
      {
        id: 'operation-log',
        label: '日誌',
        icon: <HistoryRoundedIcon />,
      },
    ],
    detailsContent: (
      <TaskMatchTicketDetailsPanel
        marker={marker}
        isAuthenticated={isAuthenticated}
      />
    ),
    content: <TaskMatchHistoryPanel state={state} />,
    footerLead: (
      <NeedClaimFooter ticketUuid={marker.id} isAuthenticated={isAuthenticated} />
    ),
    footerActions: createFooterActions({
      state,
      canDeleteMatchSheet,
      onDeleteMatchSheet,
      onShare,
    }),
  };
}
