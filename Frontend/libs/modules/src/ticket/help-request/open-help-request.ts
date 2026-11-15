import { createStore } from 'zustand';

/**
 * Opens 請求協助 from anywhere: the top bar's button, and later the sidebar, the phone's buttons and
 * the map's crosshair. The drawer is kept once, in the site shell (`HelpRequestHost`), so
 * it is there on every page; whoever opens it may sit far from it, with no React tree to share —
 * as with `ticket-changes.ts`.
 */

/** A building's floor picked (在這一層請求協助): the request is filed in that building, on that floor. */
export interface HelpRequestPlace {
  buildingUuid: string;
  /** Null when the building has no address, or it is not known yet (back from signing in). */
  address: string | null;
  /** The building's label for it, as `3F`, `B1` or `RF`. */
  floor: string;
}

/** A point picked on the map, for the drawer's map to start from instead of the device's location. */
export interface HelpRequestSeed {
  lat: number;
  lng: number;
  place?: HelpRequestPlace;
}

const openings = createStore<{ seed: HelpRequestSeed | null } | null>(
  () => null,
);

export function openHelpRequest(seed: HelpRequestSeed | null = null): void {
  openings.setState({ seed }, true);
}

/** Subscribes to new openings without replaying a previous request. */
export function onOpenHelpRequest(
  listener: (seed: HelpRequestSeed | null) => void,
): () => void {
  return openings.subscribe((opening) => {
    if (opening) listener(opening.seed);
  });
}
