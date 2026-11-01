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
  /** A disaster type, sent to the server as `disasterType`. */
  disaster: string | null;
  q: string;
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
  disaster: null,
  q: '',
};

const KEYS = {
  status: 'status',
  priority: 'priority',
  taskType: 'task',
  disaster: 'disaster',
  q: 'q',
} as const;

export function parseTicketFilters(params: URLSearchParams): TicketFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = params.get(key) as T | null;
    return value && allowed.includes(value) ? value : null;
  };
  return {
    status: pick(
      KEYS.status,
      TICKET_STATUS_OPTIONS.map((o) => o.value),
    ),
    priority: pick(KEYS.priority, TICKET_PRIORITIES),
    taskType: params.get(KEYS.taskType) || null,
    disaster: params.get(KEYS.disaster) || null,
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
  set(KEYS.disaster, filters.disaster);
  set(KEYS.q, filters.q.trim() || null);
  next.delete('page');
  return next;
}

/** The filters as `tickets` query variables: the server applies every one of them. */
export function toServerVariables(
  filters: TicketFilters,
): AdminTicketsQueryVariables {
  const search = resolveTicketSearch(filters.q);
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.taskType ? { needType: filters.taskType } : {}),
    ...(filters.disaster ? { disasterType: filters.disaster } : {}),
    ...(search.kind === 'query' ? { q: search.q } : {}),
  };
}

export function countActiveFilters(filters: TicketFilters): number {
  return [
    filters.status,
    filters.priority,
    filters.taskType,
    filters.disaster,
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
