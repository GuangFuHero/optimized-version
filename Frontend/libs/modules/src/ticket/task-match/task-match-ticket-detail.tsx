'use client';

import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Icons } from '@rescue-frontend/ui';

import type { RescueMapTicketDetailOverrides } from '../../map/components/rescue-map-detail-drawer';
import type { RescueMapMarkerItem } from '../../map/types';
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
  onClaimTask: () => void;
  onDeleteMatchSheet: () => void;
  onShare?: () => void;
}

function createFooterActions({
  state,
  isAuthenticated,
  canDeleteMatchSheet,
  onClaimTask,
  onDeleteMatchSheet,
  onShare,
}: Omit<
  TaskMatchTicketDetailOptions,
  'marker'
>): readonly TicketDetailFooterActionItem[] {
  const canClaim =
    isAuthenticated &&
    (state.status === 'pending' || state.status === 'matching');
  const canDelete = canDeleteMatchSheet && state.status !== 'deleted';

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
    {
      id: 'claim-task',
      label:
        state.status === 'matched'
          ? '媒合完成'
          : state.status === 'deleted'
            ? '已刪除'
            : !isAuthenticated
              ? '登入後接任務'
              : canClaim
                ? '接任務'
                : '接任務',
      icon: <VolunteerActivismRoundedIcon />,
      disabled: !canClaim,
      onClick: canClaim ? onClaimTask : undefined,
    },
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
  onClaimTask,
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
    detailsContent: <TaskMatchTicketDetailsPanel marker={marker} />,
    content: <TaskMatchHistoryPanel state={state} />,
    footerActions: createFooterActions({
      state,
      isAuthenticated,
      canDeleteMatchSheet,
      onClaimTask,
      onDeleteMatchSheet,
      onShare,
    }),
  };
}
