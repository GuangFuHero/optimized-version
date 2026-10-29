'use client';

import { useState } from 'react';

import type { AdminTicketFieldsFragment } from '@rescue-frontend/data-access/admin';
import { SheetFrame } from '@rescue-frontend/ui';

import { TICKET_SHEET_WIDTH } from './ticket-detail-sheet';
import { TicketForm } from './ticket-form';

export interface TicketCreateSheetProps {
  open: boolean;
  /** A point picked on a map: the form's pin starts there and its address is looked up. */
  initialPoint?: { lat: number; lng: number } | null;
  onClose(): void;
  /** The ticket just created; the sheet closes itself after. */
  onCreated?(ticket: AdminTicketFieldsFragment): void;
}

/**
 * The one admin create path for a ticket: the board's 新增任務 and a pin placed on the 互助地圖
 * both open `TicketForm` in this sheet.
 */
export function TicketCreateSheet({
  open,
  initialPoint,
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
      ariaLabel="新增任務"
    >
      {/* Mounted per opening, so each one starts from a blank form at its own point. */}
      {open ? (
        <TicketForm
          mode="create"
          initialPoint={initialPoint}
          onCreated={onCreated}
          onDone={onClose}
          onCancel={onClose}
          onBusyChange={setBusy}
        />
      ) : null}
    </SheetFrame>
  );
}
