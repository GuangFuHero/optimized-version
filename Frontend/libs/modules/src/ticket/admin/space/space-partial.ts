// SPDX-License-Identifier: GPL-3.0-only
/**
 * A space's tickets as far as they loaded. `buildingMapTickets` stops at its limit and says
 * nothing past it, so a full page means there may be more: counts read 「至少」 then. (It also
 * leaves out tickets the viewer may not see in detail, which nothing here can detect.)
 */

/** `AdminBuildingMapTickets`' limit; the backend's cap too. */
export const SPACE_TICKETS_LIMIT = 200;

export function ticketsCut(loaded: number): boolean {
  return loaded >= SPACE_TICKETS_LIMIT;
}

/**
 * A space's tickets in the floor view: in, read earlier but the latest read failed, still on their
 * way, or not read.
 */
export type SpaceTicketsLoad<T> =
  | { state: 'loaded'; tickets: T[] }
  | { state: 'stale'; tickets: T[] }
  | { state: 'loading' }
  | { state: 'failed' };

/**
 * Until a space's tickets are in, how many it has is unknown, never none: an empty list would read
 * as a building where nobody asked for help, and people go out on what the floor view says.
 * Tickets read once (here, or by the space list sharing the query) stay shown while a later read
 * fails, as the query keeps them, but as `stale`: the floor view says they may be out of date and
 * offers to read them again, and nothing states their count as current.
 */
export function readSpaceTickets<T>(query: {
  data: T[] | undefined;
  error: unknown;
}): SpaceTicketsLoad<T> {
  if (query.data) {
    return query.error
      ? { state: 'stale', tickets: query.data }
      : { state: 'loaded', tickets: query.data };
  }
  return query.error ? { state: 'failed' } : { state: 'loading' };
}

/**
 * The delete dialog's body (designer §開啟空間 5). `count` is null while the tickets are not in:
 * the dialog then says they stay without saying how many.
 */
export function deleteKeepsText(count: number | null, cut: boolean): string {
  if (count === null)
    return '這個空間會從列表與地圖上消失。底下的任務單會保留，變回一般任務單（不再歸在這個空間），樓層與戶別照舊寫在單上。';
  if (!count) return '這個空間會從列表與地圖上消失。它底下還沒有任何任務單。';
  return `這個空間會從列表與地圖上消失。底下${cut ? '至少 ' : ' '}${count} 張任務單會保留，變回一般任務單（不再歸在這個空間），樓層與戶別照舊寫在單上。`;
}

/**
 * What 刪除空間 says once done (prototype `tk-app.jsx` `deleteSpace`): the tickets it kept, or only
 * the name when it held none or they were not read.
 */
export function deletedToast(
  name: string,
  count: number | null,
  cut: boolean,
): string {
  const kept = count ? `，${cut ? '至少 ' : ''}${count} 張任務單保留` : '';
  return `已刪除空間「${name}」${kept}`;
}

/** The edit form's 「樓層改少」 warning heading (designer §開啟空間 4). */
export function strandedHeading(count: number, cut: boolean): string {
  return `${cut ? '至少有' : '有'} ${count} 張任務單在要拿掉的樓層`;
}
