/**
 * A ticket's number as people read it out: `#` and the first 8 characters of its uuid, upper case,
 * as the 管理平台 shows a ticket it has just created (`ticket-create-drawer.tsx`). The backend gives
 * tickets no number of their own.
 */
export function formatTicketNumber(uuid: string): string {
  return `#${uuid.slice(0, 8).toUpperCase()}`;
}
