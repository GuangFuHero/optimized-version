/**
 * Query keys for ticket data. Everything sits under ['admin', 'tickets'], so the key families
 * below can be invalidated one by one instead of the whole board at once.
 */
export const ticketKeys = {
  /** Every `tickets` connection: the board's list pages and the map's viewport loads. */
  lists: () => ['admin', 'tickets', 'tickets'] as const,
  stats: () => ['admin', 'tickets', 'stats'] as const,
  details: () => ['admin', 'tickets', 'ticket'] as const,
  tasks: () => ['admin', 'tickets', 'ticketTasks'] as const,
  histories: () => ['admin', 'tickets', 'TicketHistory'] as const,
};

/**
 * The keys a ticket write makes stale: the lists, the stats and that ticket's own detail, needs
 * and history. Without its uuid (a write that names only a need, photo or assignment), every
 * ticket's detail, needs and history — of which only the open sheet's are on screen.
 */
export function ticketWriteKeys(ticketUuid?: string | null): unknown[][] {
  const own = ticketUuid
    ? [
        [...ticketKeys.details(), { uuid: ticketUuid }],
        [...ticketKeys.tasks(), { ticketUuid }],
        [...ticketKeys.histories(), { path: { uuid: ticketUuid } }],
      ]
    : [ticketKeys.details(), ticketKeys.tasks(), ticketKeys.histories()];
  return [
    [...ticketKeys.lists()],
    [...ticketKeys.stats()],
    ...own.map((k) => [...k]),
  ];
}
