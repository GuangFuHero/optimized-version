import type { AllTicketsQueryVariables } from '@rescue-frontend/data-access/admin';
import { AuditStatus as AuditStatusValues } from '@rescue-frontend/data-access/admin';

import type {
  AuditStatus,
  TicketPriority,
  TicketRow,
  TicketStatus,
} from './ticket-row';
import { resolveTicketSearch } from '../../../ticket-search';
import { TICKET_STATUS_OPTIONS } from '../../../status';

const PRIORITIES: readonly TicketPriority[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export interface TicketFilters {
  status: TicketStatus | null;
  priority: TicketPriority | null;
  /** A need type, sent to the server as `needType`. */
  taskType: string | null;
  audit: AuditStatus | null;
  /** A disaster type; the server has no such filter, so it runs on the client. */
  disaster: string | null;
  q: string;
}

export const EMPTY_TICKET_FILTERS: TicketFilters = {
  status: null,
  priority: null,
  taskType: null,
  audit: null,
  disaster: null,
  q: '',
};

const KEYS = {
  status: 'status',
  priority: 'priority',
  taskType: 'task',
  audit: 'audit',
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
    priority: pick(KEYS.priority, PRIORITIES),
    taskType: params.get(KEYS.taskType) || null,
    audit: pick(KEYS.audit, Object.values(AuditStatusValues)),
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
  set(KEYS.audit, filters.audit);
  set(KEYS.disaster, filters.disaster);
  set(KEYS.q, filters.q.trim() || null);
  next.delete('page');
  return next;
}

/** The filters the `tickets` query can apply itself. */
export function toServerVariables(
  filters: TicketFilters,
): AllTicketsQueryVariables {
  const search = resolveTicketSearch(filters.q);
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.taskType ? { needType: filters.taskType } : {}),
    ...(filters.audit ? { auditStatus: filters.audit } : {}),
    ...(search.kind === 'query' ? { q: search.q } : {}),
  };
}

/** What to tell the user about a keyword the server would not take yet. */
export function searchHint(q: string): string | null {
  return resolveTicketSearch(q).kind === 'too-short'
    ? '請輸入 2–50 個字'
    : null;
}

export function countActiveFilters(filters: TicketFilters): number {
  return [
    filters.status,
    filters.priority,
    filters.taskType,
    filters.audit,
    filters.disaster,
  ].filter(Boolean).length;
}

/** The `tickets` query has no disaster filter, so it runs here over every loaded ticket. */
export function applyClientFilters(
  rows: readonly TicketRow[],
  filters: TicketFilters,
): TicketRow[] {
  return rows.filter(
    (r) => !filters.disaster || r.disasterTypes.includes(filters.disaster),
  );
}

export const TICKET_PAGE_SIZE = 50;

/** One page of `rows`, with `page` clamped into 1..pageCount. */
export function pageOf<T>(
  rows: readonly T[],
  page: number,
): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / TICKET_PAGE_SIZE));
  const clamped = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const start = (clamped - 1) * TICKET_PAGE_SIZE;
  return {
    items: rows.slice(start, start + TICKET_PAGE_SIZE),
    page: clamped,
    pageCount,
  };
}
