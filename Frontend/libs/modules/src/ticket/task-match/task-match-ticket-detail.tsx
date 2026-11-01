'use client';

import type { RescueMapTicketDetailOverrides } from '../../map/components/rescue-map-detail-drawer';
import type { RescueMapMarkerItem } from '../../map/types';
import { SiteBadge } from '../../shell/site/site-badge';
import { NeedClaimFooter, useTicketNeeds } from '../needs';
import { TicketActionsMenu } from '../needs/ticket-actions-menu';
import { TicketPriorityBadge } from '../priority-badge';
import { formatTicketStatusLabel, getTicketStatusTone } from '../status';
import { TaskMatchTicketDetailsPanel } from './task-match-ticket-details-panel';

interface TaskMatchTicketDetailOptions {
  marker: RescueMapMarkerItem;
  isAuthenticated: boolean;
  onShare?: () => void;
  /** For a ticket filed inside a building: its 看各樓層, which opens the page's `BuildingDrawer`. */
  onOpenBuilding?: (buildingUuid: string) => void;
  /** Its 上一張／下一張: open that ticket of the same building instead. */
  onSelectTicket?: (marker: RescueMapMarkerItem) => void;
}

/**
 * Under the title, as the prototype has them: the ticket's status, solid, then how urgent (below high,
 * nothing). The status is read again with the ticket, as a claim moves it. No 未媒合／
 * 已報名 beside it as the prototype has: the backend works the status out from the needs
 * (`ticket_status.py`), so that badge would say the same thing twice.
 */
function TicketHeaderBadges({ marker }: { marker: RescueMapMarkerItem }) {
  const { ticketStatus } = useTicketNeeds(marker.id);
  const status = ticketStatus ?? marker.ticketMeta?.status;

  return (
    <>
      {status ? (
        <SiteBadge tone={getTicketStatusTone(status)} variant="solid">
          {formatTicketStatusLabel(status)}
        </SiteBadge>
      ) : null}
      <TicketPriorityBadge priority={marker.ticketMeta?.priority} />
    </>
  );
}

export function createTaskMatchTicketDetailOverrides({
  marker,
  isAuthenticated,
  onShare,
  onOpenBuilding,
  onSelectTicket,
}: TaskMatchTicketDetailOptions): RescueMapTicketDetailOverrides {
  return {
    // The requester's ⋯ — 刪除整張單 — at the top, where the team put it.
    headerActions: (
      <TicketActionsMenu
        ticketUuid={marker.id}
        ticketTitle={marker.title}
        ticketCreatedBy={marker.ticketMeta?.createdBy}
      />
    ),
    badges: <TicketHeaderBadges marker={marker} />,
    detailsContent: (
      <TaskMatchTicketDetailsPanel
        marker={marker}
        isAuthenticated={isAuthenticated}
        onOpenBuilding={onOpenBuilding}
        onSelectTicket={onSelectTicket}
      />
    ),
    // Claiming is the footer's lead: a volunteer claims a need, and `NeedClaimFooter` is the one that
    // knows the ticket's needs.
    footerLead: (
      <NeedClaimFooter
        ticketUuid={marker.id}
        isAuthenticated={isAuthenticated}
      />
    ),
    onShare,
  };
}
