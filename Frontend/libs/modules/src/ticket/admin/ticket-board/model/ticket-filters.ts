import type {
  AdminTicketMapPinsQueryVariables,
  AdminTicketsExtentQueryVariables,
  AdminTicketsQueryVariables,
} from '@rescue-frontend/data-access/admin';

import {
  NEED_TYPES,
  TICKET_PRIORITIES,
  type NeedType,
  type TicketPriority,
  type TicketStatus,
} from './ticket-row';
import { resolveTicketSearch } from '../../../ticket-search';
import { TICKET_STATUS_OPTIONS } from '../../../status';

export interface TicketFilters {
  status: TicketStatus | null;
  priority: TicketPriority | null;
  /** A need type, sent to the server as `needType`. */
  taskType: string | null;
  /** 行政區域: a 縣市, sent as `county`. */
  county: string | null;
  /** 行政區域: a 鄉鎮市區 in `county`, sent as `town`; null for the whole county. */
  town: string | null;
  /** 組織分配: a team's uuid, its 責任區's tickets; or UNASSIGNED_TEAM, those in no 責任區. */
  team: string | null;
  /** 時間: last updated within the last 24 hours, or before that. */
  time: TicketTimeFilter | null;
  q: string;
}

export const TICKET_TIME_FILTERS = ['today', 'earlier'] as const;
export type TicketTimeFilter = (typeof TICKET_TIME_FILTERS)[number];

/** The 組織分配 value for tickets in nobody's 責任區. */
export const UNASSIGNED_TEAM = '__none__';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * The 時間 filter's cut, `now` less 24 hours, rounded down to 5 minutes: the board's loads, read at
 * different moments, then mostly agree on it, and re-rendering does not ask for new rows every second.
 */
const CUT_STEP_MS = 5 * 60 * 1000;

/** The moment 24 小時內 starts and 更早 ends. */
export function ticketTimeCut(now: number = Date.now()): string {
  return new Date(
    Math.floor(now / CUT_STEP_MS) * CUT_STEP_MS - DAY_MS,
  ).toISOString();
}

/**
 * Whether a ticket last updated at `updatedAt` passes the 時間 filter, as the server cuts it. No time
 * passes neither.
 */
export function passesTimeFilter(
  updatedAt: string | null | undefined,
  time: TicketTimeFilter,
  now: number = Date.now(),
): boolean {
  const at = updatedAt ? Date.parse(updatedAt) : NaN;
  if (Number.isNaN(at)) return false;
  const cut = Date.parse(ticketTimeCut(now));
  return time === 'today' ? at >= cut : at < cut;
}

/**
 * The need types in the order the filter panel's 需求 row lists them: the design's 搜救 / 人力 /
 * 物資, then 醫療, which the backend has and the design does not.
 */
export const NEED_FILTER_TYPES: readonly NeedType[] = [
  'rescue',
  'hr',
  'supply',
  ...NEED_TYPES.filter((t) => !['rescue', 'hr', 'supply'].includes(t)),
];

export const EMPTY_TICKET_FILTERS: TicketFilters = {
  status: null,
  priority: null,
  taskType: null,
  county: null,
  town: null,
  team: null,
  time: null,
  q: '',
};

const KEYS = {
  status: 'status',
  priority: 'priority',
  taskType: 'task',
  county: 'county',
  town: 'town',
  team: 'team',
  time: 'time',
  q: 'q',
} as const;

export function parseTicketFilters(params: URLSearchParams): TicketFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = params.get(key) as T | null;
    return value && allowed.includes(value) ? value : null;
  };
  const county = params.get(KEYS.county) || null;
  const team = params.get(KEYS.team);
  return {
    status: pick(
      KEYS.status,
      TICKET_STATUS_OPTIONS.map((o) => o.value),
    ),
    priority: pick(KEYS.priority, TICKET_PRIORITIES),
    taskType: params.get(KEYS.taskType) || null,
    county,
    // A town means nothing without its county.
    town: county ? params.get(KEYS.town) || null : null,
    // The server takes a uuid only: anything else from a hand-edited link would fail every load.
    team:
      team && (team === UNASSIGNED_TEAM || UUID_PATTERN.test(team))
        ? team
        : null,
    time: pick(KEYS.time, TICKET_TIME_FILTERS),
    q: params.get(KEYS.q) ?? '',
  };
}

/** Writes the filters into a copy of `params`, keeping every other param except `page`. */
export function writeTicketFilters(
  params: URLSearchParams,
  filters: TicketFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) =>
    value ? next.set(key, value) : next.delete(key);
  set(KEYS.status, filters.status);
  set(KEYS.priority, filters.priority);
  set(KEYS.taskType, filters.taskType);
  set(KEYS.county, filters.county);
  set(KEYS.town, filters.county ? filters.town : null);
  set(KEYS.team, filters.team);
  set(KEYS.time, filters.time);
  set(KEYS.q, filters.q.trim() || null);
  next.delete('page');
  return next;
}

/**
 * The filters as `tickets` query variables: the server applies every one of them. `now` sets where
 * the 時間 filter cuts (ticketTimeCut).
 */
export function toServerVariables(
  filters: TicketFilters,
  now: number = Date.now(),
): AdminTicketsQueryVariables {
  const search = resolveTicketSearch(filters.q);
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.taskType ? { needType: filters.taskType } : {}),
    ...(filters.county ? { county: filters.county } : {}),
    ...(filters.county && filters.town ? { town: filters.town } : {}),
    ...(filters.team === UNASSIGNED_TEAM
      ? { unassignedOnly: true }
      : filters.team
        ? { responsibleTeamUuid: filters.team }
        : {}),
    ...(filters.time === 'today'
      ? { updatedAfter: ticketTimeCut(now) }
      : {}),
    ...(filters.time === 'earlier'
      ? { updatedBefore: ticketTimeCut(now) }
      : {}),
    ...(search.kind === 'query' ? { q: search.q } : {}),
  };
}

export function countActiveFilters(filters: TicketFilters): number {
  return [
    filters.status,
    filters.priority,
    filters.taskType,
    filters.county,
    filters.team,
    filters.time,
  ].filter(Boolean).length;
}

/**
 * The list asks the server for every ticket in the viewer's scope: no filter, and no keyword the
 * server takes (one too short is not sent). An empty list then means there are no tickets at all,
 * not that none match — the two empty states the design tells apart.
 */
export function listsEveryTicket(filters: TicketFilters): boolean {
  return Object.keys(toServerVariables(filters)).length === 0;
}

export const TICKET_PAGE_SIZE = 50;

/** The `?page=` param as a page number: a whole number from 1, else 1. */
export function parseTicketPage(params: URLSearchParams): number {
  const page = Math.trunc(Number(params.get('page')));
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** One board page: the filters plus that page's window. Pages count from 1. */
export function toPageVariables(
  filters: TicketFilters,
  page: number,
): AdminTicketsQueryVariables {
  const index = Math.max(1, Math.trunc(page) || 1) - 1;
  return {
    ...toServerVariables(filters),
    skip: index * TICKET_PAGE_SIZE,
    limit: TICKET_PAGE_SIZE,
  };
}

export function pageCountOf(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / TICKET_PAGE_SIZE));
}

/** Variables that only page the board: a load differing in these alone keeps the last rows up. */
export const TICKET_PAGE_KEYS = ['skip'] as const;
/** Variables that only move the map: a load differing in these alone keeps the last pins up. */
export const TICKET_MAP_AREA_KEYS = ['bounds', 'zoom'] as const;

/** Whether two loads ask for the same tickets but for `keys`: paging, or the map's area. */
export function differsOnlyIn(
  a: AdminTicketsQueryVariables,
  b: AdminTicketsQueryVariables,
  keys: readonly (keyof AdminTicketsQueryVariables)[],
): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof AdminTicketsQueryVariables
  >;
  return [...names].every(
    (name) =>
      keys.includes(name) ||
      JSON.stringify(a[name]) === JSON.stringify(b[name]),
  );
}

/** The map's load: the most the `tickets` query hands back at once. */
export const TICKET_MAP_LIMIT = 200;

/** The part of the world the map shows, in degrees, and its zoom. */
export interface MapViewport {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
/**
 * Bounds snap outward to about 10 m, so a nudge of the map reuses the cached load and the edge
 * never cuts off a ticket that is on screen.
 */
const SNAP = 1e4;
const down = (value: number) => Math.floor(value * SNAP) / SNAP;
const up = (value: number) => Math.ceil(value * SNAP) / SNAP;

/**
 * Every ticket matching the filters, wherever it is: the header's count in the map view, and the
 * box the map frames when it opens and when the filters change.
 */
export function toExtentVariables(
  filters: TicketFilters,
): AdminTicketsExtentQueryVariables {
  return toServerVariables(filters);
}

/**
 * The filters as one string, as the server takes them: the map frames again when it changes, and
 * remembers the one it last showed.
 */
export function ticketFiltersKey(filters: TicketFilters): string {
  // The 時間 filter by its choice, not its cut: the key holds still as the clock moves on.
  return JSON.stringify({
    ...toExtentVariables({ ...filters, time: null }),
    ...(filters.time ? { time: filters.time } : {}),
  });
}

/** The tickets inside `viewport` that match the filters, up to the map's limit. */
export function toMapVariables(
  filters: TicketFilters,
  viewport: MapViewport,
): AdminTicketMapPinsQueryVariables {
  return {
    ...toServerVariables(filters),
    bounds: {
      minLat: clamp(down(viewport.south), -90, 90),
      maxLat: clamp(up(viewport.north), -90, 90),
      minLng: clamp(down(viewport.west), -180, 180),
      maxLng: clamp(up(viewport.east), -180, 180),
    },
    zoom: Math.round(viewport.zoom),
    skip: 0,
    limit: TICKET_MAP_LIMIT,
  };
}
