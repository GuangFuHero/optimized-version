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

/** The delete dialog's body (designer §開啟空間 5). */
export function deleteKeepsText(count: number, cut: boolean): string {
  if (!count) return '這個空間會從列表與地圖上消失。它底下還沒有任何任務單。';
  return `這個空間會從列表與地圖上消失。底下${cut ? '至少 ' : ' '}${count} 張任務單會保留，變回一般任務單（不再歸在這個空間），樓層與戶別照舊寫在單上。`;
}

/** The edit form's 「樓層改少」 warning heading (designer §開啟空間 4). */
export function strandedHeading(count: number, cut: boolean): string {
  return `${cut ? '至少有' : '有'} ${count} 張任務單在要拿掉的樓層`;
}
