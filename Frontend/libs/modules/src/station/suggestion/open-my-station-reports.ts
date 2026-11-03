/**
 * Opens 我回報的站點 from the account menu or from a notice of a review's result. The drawer is kept
 * once, in the site shell (`MyStationReportsHost`), as 修改建議's is (`open-station-suggestion.ts`):
 * the account menu is on both the desktop and the phone's top bar, and each holding its own drawer
 * would open two from one notice.
 */

const channel = new EventTarget();
const OPEN_MY_STATION_REPORTS = 'open-my-station-reports';

export function openMyStationReports(): void {
  channel.dispatchEvent(new Event(OPEN_MY_STATION_REPORTS));
}

/** For the host; returns what stops listening, for an effect's cleanup. */
export function onOpenMyStationReports(listener: () => void): () => void {
  channel.addEventListener(OPEN_MY_STATION_REPORTS, listener);

  return () => channel.removeEventListener(OPEN_MY_STATION_REPORTS, listener);
}
