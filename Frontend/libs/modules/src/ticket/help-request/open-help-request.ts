/**
 * Opens 請求協助 from anywhere: the top bar's button, and later the sidebar, the phone's buttons and
 * the map's crosshair (S2, S3). The drawer is kept once, in the site shell (`HelpRequestHost`), so
 * it is there on every page; whoever opens it may sit far from it, with no React tree to share —
 * as with `ticket-changes.ts`.
 */

/** A point picked on the map, for the drawer's map to start from instead of the device's location. */
export interface HelpRequestSeed {
  lat: number;
  lng: number;
}

const channel = new EventTarget();
const OPEN_HELP_REQUEST = 'open-help-request';

export function openHelpRequest(seed: HelpRequestSeed | null = null): void {
  channel.dispatchEvent(new CustomEvent(OPEN_HELP_REQUEST, { detail: seed }));
}

/** For the host; returns what stops listening, for an effect's cleanup. */
export function onOpenHelpRequest(
  listener: (seed: HelpRequestSeed | null) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<HelpRequestSeed | null>).detail);

  channel.addEventListener(OPEN_HELP_REQUEST, handle);

  return () => channel.removeEventListener(OPEN_HELP_REQUEST, handle);
}
