import { differenceInCalendarDays, parseISO } from 'date-fns';

import { getFreshness } from './freshness';
import type { StationRow } from './station-row';
import {
  OPERATIONAL_STATUS_OPTIONS,
  type OperationalStatus,
} from '../../../operational-status';

export type Established = 'first_week' | 'later';

/** The 指派 Team filter value for stations no team runs yet. */
export const UNASSIGNED_TEAM = '__none__';

export interface StationFilters {
  type: string | null;
  status: OperationalStatus | null;
  /** A 行政區 as StationRow.area spells it (county + town). */
  area: string | null;
  /** A team uuid, or UNASSIGNED_TEAM. */
  team: string | null;
  official: 'yes' | 'no' | null;
  /** 成立: created in the disaster's first week, or after it. */
  established: Established | null;
  freshness: 'fresh' | 'stale' | 'expired' | null;
  q: string;
  /** Only stations with pending suggestions (the review queue); never in the URL. */
  pending: boolean;
}

export const EMPTY_FILTERS: StationFilters = {
  type: null,
  status: null,
  area: null,
  team: null,
  official: null,
  established: null,
  freshness: null,
  q: '',
  pending: false,
};

const KEYS = {
  type: 'type',
  status: 'status',
  area: 'area',
  team: 'team',
  official: 'official',
  established: 'est',
  freshness: 'fresh',
  q: 'q',
} as const;

export function parseStationFilters(params: URLSearchParams): StationFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = params.get(key) as T | null;
    return value && allowed.includes(value) ? value : null;
  };
  return {
    type: params.get(KEYS.type) || null,
    status: pick(
      KEYS.status,
      OPERATIONAL_STATUS_OPTIONS.map((o) => o.value),
    ),
    area: params.get(KEYS.area) || null,
    team: params.get(KEYS.team) || null,
    official: pick(KEYS.official, ['yes', 'no'] as const),
    established: pick(KEYS.established, ['first_week', 'later'] as const),
    freshness: pick(KEYS.freshness, ['fresh', 'stale', 'expired'] as const),
    q: params.get(KEYS.q) ?? '',
    pending: false,
  };
}

export function writeStationFilters(
  params: URLSearchParams,
  filters: StationFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) =>
    value ? next.set(key, value) : next.delete(key);
  set(KEYS.type, filters.type);
  set(KEYS.status, filters.status);
  set(KEYS.area, filters.area);
  set(KEYS.team, filters.team);
  set(KEYS.official, filters.official);
  set(KEYS.established, filters.established);
  set(KEYS.freshness, filters.freshness);
  set(KEYS.q, filters.q.trim() || null);
  return next;
}

export function countActiveFilters(filters: StationFilters): number {
  return [
    filters.type,
    filters.status,
    filters.area,
    filters.team,
    filters.official,
    filters.established,
    filters.freshness,
  ].filter(Boolean).length;
}

/** The filters the `stations` query can apply itself. */
export function toServerVariables(filters: StationFilters) {
  const q = filters.q.trim();
  return {
    ...(filters.type ? { stationType: filters.type } : {}),
    ...(filters.status ? { operationalStatus: filters.status } : {}),
    ...(filters.team === UNASSIGNED_TEAM
      ? { unassignedOnly: true }
      : filters.team
        ? { assignedTeamUuid: filters.team }
        : {}),
    // The backend rejects a keyword outside 2..50 characters.
    ...(q.length >= 2 && q.length <= 50 ? { q } : {}),
    // The queue is the caller's own: another team's suggestions are not theirs to decide (WG-168).
    ...(filters.pending
      ? { hasPendingSuggestions: true, reviewableOnly: true }
      : {}),
  };
}

/** The 行政區 chips: every distinct area among the loaded stations, in Chinese collation order. */
export function areaOptions(rows: readonly StationRow[]): string[] {
  return [...new Set(rows.map((r) => r.area).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-Hant'),
  );
}

/**
 * Which week a station was set up in, counted in calendar days from the disaster's start the way
 * the sidebar's 第 N 天 counts them: days 1-7 are the first week. Null when either date is missing.
 */
export function establishedIn(
  createdAt: string | null,
  disasterStartedAt: string | null,
): Established | null {
  if (!createdAt || !disasterStartedAt) return null;
  const days = differenceInCalendarDays(
    parseISO(createdAt),
    parseISO(disasterStartedAt),
  );
  if (!Number.isFinite(days)) return null;
  return days < 7 ? 'first_week' : 'later';
}

/**
 * The `stations` query has no area, source, established or freshness filter and no sort, so these
 * run here over every loaded station: open stations first, then the most recently updated. The
 * 成立 filter needs the disaster's start date and is ignored without one.
 */
export function applyClientFilters(
  rows: readonly StationRow[],
  filters: StationFilters,
  now: Date,
  disasterStartedAt: string | null = null,
): StationRow[] {
  return rows
    .filter((r) => !filters.area || r.area === filters.area)
    .filter(
      (r) => !filters.official || r.isOfficial === (filters.official === 'yes'),
    )
    .filter(
      (r) =>
        !filters.established ||
        !disasterStartedAt ||
        establishedIn(r.createdAt, disasterStartedAt) === filters.established,
    )
    .filter(
      (r) =>
        !filters.freshness ||
        getFreshness(r.updatedAt, now).level === filters.freshness,
    )
    .sort((a, b) => {
      const open =
        Number(b.operationalStatus === 'active') -
        Number(a.operationalStatus === 'active');
      if (open) return open;
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : -Infinity;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : -Infinity;
      return tb === ta ? 0 : tb > ta ? 1 : -1;
    });
}
