export interface StationFitInput {
  /** The filters the shown stations were picked by, as one string. */
  filtersKey: string;
  /** The filters last framed, or left alone on purpose; null until the map first settles. */
  framedKey: string | null;
  /** The stations for `filtersKey` are still being read. */
  loading: boolean;
  /** The map opened where this browser last left it (MAP-VIEW-104). */
  restored: boolean;
  /**
   * These filters came with the page, by a link or a reload, and differ from those the map last
   * showed: it frames them even where it was left.
   */
  arrivedWithNewFilters: boolean;
  /** A station is selected: the view follows it instead. */
  selected: boolean;
  /** Shown stations that have a point. */
  pointCount: number;
}

/**
 * `frame`: fit the stations and count these filters as handled. `keep`: count them as handled and
 * leave the view. `wait`: do nothing yet.
 */
export type StationFitStep = 'frame' | 'keep' | 'wait';

/**
 * Whether the station map frames its stations now (prototype station-map.jsx:106-198, MAP-VIEW-104).
 *
 * Only a change of filters frames again, and a link or a reload bringing other filters than the map
 * last showed is one. The prototype compares the filtered stations themselves,
 * but its data never changes on its own; here the list is read again after every add, edit or
 * delete, and freshness moves with the clock, so comparing stations would pull the map back each
 * time — and the first read after opening where the map was left would count as a change.
 */
export function decideStationFit({
  filtersKey,
  framedKey,
  loading,
  restored,
  arrivedWithNewFilters,
  selected,
  pointCount,
}: StationFitInput): StationFitStep {
  if (loading || framedKey === filtersKey) {
    return 'wait';
  }

  // Opened where it was left: the first stations do not move it.
  if (framedKey === null && restored && !arrivedWithNewFilters) {
    return 'keep';
  }

  // Nothing to frame yet: the first stations to arrive under these filters still frame.
  if (pointCount === 0) {
    return 'wait';
  }

  if (selected) {
    return 'keep';
  }

  return 'frame';
}

const SHOWN_FILTERS_KEY = 'station-management:shown-filters';

// Reads and writes below fail quietly, as the map's remembered view does (map-opening.ts): the
// filters then count as new, and a map that could remember nothing frames them anyway.

/**
 * The filters the station map last framed or left alone, as `stationFiltersKey` writes them. The map
 * writes them, not the page: the page can be built twice as it opens, and would count its own.
 */
export function readShownStationFilters(): string | null {
  try {
    return window.localStorage.getItem(SHOWN_FILTERS_KEY);
  } catch {
    return null;
  }
}

export function rememberShownStationFilters(filtersKey: string) {
  try {
    window.localStorage.setItem(SHOWN_FILTERS_KEY, filtersKey);
  } catch {
    // Nothing remembered; see above.
  }
}
