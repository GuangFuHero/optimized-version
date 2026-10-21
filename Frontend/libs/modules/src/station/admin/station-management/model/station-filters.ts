import { getFreshness } from './freshness';
import type { StationRow } from './station-row';
import { OPERATIONAL_STATUS_OPTIONS, type OperationalStatus } from './status';

/** The 指派 Team filter value for stations no team runs yet. */
export const UNASSIGNED_TEAM = '__none__';

export interface StationFilters {
  type: string | null;
  status: OperationalStatus | null;
  /** A team uuid, or UNASSIGNED_TEAM. */
  team: string | null;
  official: 'yes' | 'no' | null;
  freshness: 'fresh' | 'stale' | 'expired' | null;
  q: string;
  /** Only stations with pending suggestions (the review queue); never in the URL. */
  pending: boolean;
}

export const EMPTY_FILTERS: StationFilters = {
  type: null,
  status: null,
  team: null,
  official: null,
  freshness: null,
  q: '',
  pending: false,
};

const KEYS = {
  type: 'type',
  status: 'status',
  team: 'team',
  official: 'official',
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
    team: params.get(KEYS.team) || null,
    official: pick(KEYS.official, ['yes', 'no'] as const),
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
  set(KEYS.team, filters.team);
  set(KEYS.official, filters.official);
  set(KEYS.freshness, filters.freshness);
  set(KEYS.q, filters.q.trim() || null);
  return next;
}

export function countActiveFilters(filters: StationFilters): number {
  return [
    filters.type,
    filters.status,
    filters.team,
    filters.official,
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
    ...(filters.pending ? { hasPendingSuggestions: true } : {}),
  };
}

/**
 * The `stations` query has no source or freshness filter and no sort, so these run here over
 * every loaded station: open stations first, then the most recently updated.
 */
export function applyClientFilters(
  rows: readonly StationRow[],
  filters: StationFilters,
  now: Date,
): StationRow[] {
  return rows
    .filter(
      (r) => !filters.official || r.isOfficial === (filters.official === 'yes'),
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
