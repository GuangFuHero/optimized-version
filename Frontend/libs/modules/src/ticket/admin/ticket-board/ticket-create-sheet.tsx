'use client';

import { useState } from 'react';

import type { AdminTicketFieldsFragment } from '@rescue-frontend/data-access/admin';
import { SheetFrame } from '@rescue-frontend/ui';

import type { SpaceHouseholdTarget } from '../space/household-input';
import { TICKET_SHEET_WIDTH } from './ticket-detail-sheet';
import { TicketForm } from './ticket-form';

export interface TicketCreateSheetProps {
  open: boolean;
  /** A point picked on a map: the form's pin starts there and its address is looked up. */
  initialPoint?: { lat: number; lng: number } | null;
  /** 新增一戶: a household in this space, on `initialFloor` when one was picked. */
  space?: SpaceHouseholdTarget;
  initialFloor?: string;
  onClose(): void;
  /** The ticket just created; the sheet closes itself after. */
  onCreated?(ticket: AdminTicketFieldsFragment): void;
}

/**
 * The one admin create path for a ticket: the board's 新增任務, a pin placed on the 互助地圖 and a
 * space's 新增一戶 all open `TicketForm` in this sheet.
 */
export function TicketCreateSheet({
  open,
  initialPoint,
  space,
  initialFloor,
  onClose,
  onCreated,
}: TicketCreateSheetProps) {
  // The form is saving: Escape and the backdrop wait for it.
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <SheetFrame
      open={open}
      onClose={close}
      width={TICKET_SHEET_WIDTH}
      variant="admin"
      ariaLabel={space ? `新增一戶：${space.name}` : '新增任務'}
    >
      {/* Mounted per opening, so each one starts from a blank form at its own point. */}
      {open ? (
        <TicketForm
          mode="create"
          initialPoint={initialPoint}
          space={space}
          initialFloor={initialFloor}
          onCreated={onCreated}
          onDone={onClose}
          onCancel={onClose}
          onBusyChange={setBusy}
        />
      ) : null}
    </SheetFrame>
  );
}
