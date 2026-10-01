'use client';

import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { Icons } from '@rescue-frontend/ui';

import type { RescueMapTicketDetailOverrides } from '../../map/components/rescue-map-detail-drawer';
import type { RescueMapMarkerItem } from '../../map/types';
import { NeedClaimFooter } from '../needs';
import type { TicketDetailFooterActionItem } from '../ticket-detail';
import { TaskMatchTicketDetailsPanel } from './task-match-ticket-details-panel';

const DetailsIcon = Icons.details;

interface TaskMatchTicketDetailOptions {
  marker: RescueMapMarkerItem;
  isAuthenticated: boolean;
  onShare?: () => void;
}

function createFooterActions({
  onShare,
}: Pick<TaskMatchTicketDetailOptions, 'onShare'>): readonly TicketDetailFooterActionItem[] {
  // Claiming is not an item here: a volunteer claims a need, and `NeedClaimFooter` (the footer
  // lead) is the one that knows the ticket's needs.
  return onShare
    ? [
        {
          id: 'share-point',
          label: '分享',
          icon: <ShareRoundedIcon />,
          onClick: onShare,
        },
      ]
    : [];
}

export function createTaskMatchTicketDetailOverrides({
  marker,
  isAuthenticated,
  onShare,
}: TaskMatchTicketDetailOptions): RescueMapTicketDetailOverrides {
  return {
    // 詳情 only, as on a station. The prototype's 操作紀錄 has nothing behind it anyone may read: the
    // ticket's history needs ticket.view_history, kept from the site so as not to show who claimed
    // what (spec Q36).
    tabs: [
      {
        id: 'details',
        label: '詳情',
        icon: <DetailsIcon />,
        selected: true,
      },
    ],
    detailsContent: (
      <TaskMatchTicketDetailsPanel
        marker={marker}
        isAuthenticated={isAuthenticated}
      />
    ),
    footerLead: (
      <NeedClaimFooter ticketUuid={marker.id} isAuthenticated={isAuthenticated} />
    ),
    footerActions: createFooterActions({ onShare }),
  };
}
