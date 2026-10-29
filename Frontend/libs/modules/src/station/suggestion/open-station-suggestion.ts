/**
 * Opens 修改建議 for a station from wherever its detail is shown — the map's panel, the phone's
 * drawer, the list. The drawer is kept once, in the site shell (`StationSuggestionHost`), as 請求協助's
 * is (`ticket/help-request/open-help-request.ts`): the details sit far from it, with no React tree
 * to share.
 */

const channel = new EventTarget();
const OPEN_STATION_SUGGESTION = 'open-station-suggestion';

export function openStationSuggestion(stationUuid: string): void {
  channel.dispatchEvent(
    new CustomEvent(OPEN_STATION_SUGGESTION, { detail: stationUuid }),
  );
}

/** For the host; returns what stops listening, for an effect's cleanup. */
export function onOpenStationSuggestion(
  listener: (stationUuid: string) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<string>).detail);

  channel.addEventListener(OPEN_STATION_SUGGESTION, handle);

  return () => channel.removeEventListener(OPEN_STATION_SUGGESTION, handle);
}
