import type { BadgeTone, BadgeVariant } from '@rescue-frontend/ui';

export const TICKET_STATUS_OPTIONS = [
  { value: 'pending', label: '待處理' },
  { value: 'in_progress', label: '處理中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
] as const;

export type TicketStatusFilterValue =
  (typeof TICKET_STATUS_OPTIONS)[number]['value'];

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: '待處理',
  pending: '待處理',
  assigned: '已指派',
  accepted: '已接案',
  in_progress: '處理中',
  'in-progress': '處理中',
  processing: '處理中',
  // A need's status, never a ticket's: it has everyone it asked for, who have yet to go.
  fulfilled: '已滿足需求',
  completed: '已完成',
  resolved: '已完成',
  cancelled: '已取消',
  canceled: '已取消',
  closed: '已結案',
};

function normalizeStatusKey(value?: string | null): string | undefined {
  const normalizedValue = value?.trim().toLowerCase();

  return normalizedValue || undefined;
}

function normalizeTicketStatusForQuery(
  value?: string | null,
): TicketStatusFilterValue | undefined {
  switch (normalizeStatusKey(value)) {
    case 'open':
    case 'pending':
      return 'pending';
    case 'in_progress':
    case 'in-progress':
    case 'processing':
      return 'in_progress';
    case 'fulfilled':
    case 'completed':
    case 'resolved':
    case 'closed':
      return 'completed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return undefined;
  }
}

function normalizeTicketStatusForMatch(
  value?: string | null,
): TicketStatusFilterValue | undefined {
  switch (normalizeStatusKey(value)) {
    case 'open':
    case 'pending':
      return 'pending';
    case 'assigned':
    case 'accepted':
    case 'in_progress':
    case 'in-progress':
    case 'processing':
      return 'in_progress';
    case 'fulfilled':
    case 'completed':
    case 'resolved':
    case 'closed':
      return 'completed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return undefined;
  }
}

export function formatTicketStatusLabel(
  value?: string | null,
  fallback = '未提供',
): string {
  const normalizedValue = normalizeStatusKey(value);

  if (!normalizedValue) {
    return fallback;
  }

  return TICKET_STATUS_LABELS[normalizedValue] ?? value?.trim() ?? fallback;
}

export function normalizeTicketStatusSelection(
  values: readonly string[],
): TicketStatusFilterValue[] {
  const normalizedValues = values
    .map((value) => normalizeTicketStatusForQuery(value))
    .filter(
      (value): value is TicketStatusFilterValue => typeof value === 'string',
    );

  return [...new Set(normalizedValues)];
}

export function resolveTicketStatusQueryValue(
  values: readonly string[] | undefined,
): TicketStatusFilterValue | undefined {
  const normalizedValues = normalizeTicketStatusSelection(values ?? []);

  return normalizedValues.length === 1 ? normalizedValues[0] : undefined;
}

export function matchesTicketStatusSelection(
  value: string | null | undefined,
  selectedValues: readonly string[],
): boolean {
  const normalizedSelections = normalizeTicketStatusSelection(selectedValues);

  if (normalizedSelections.length === 0) {
    return true;
  }

  const normalizedValue = normalizeTicketStatusForMatch(value);

  return normalizedValue
    ? normalizedSelections.includes(normalizedValue)
    : false;
}

/**
 * Status → badge tone, mirroring `TICKET_STATUS_TONES` in the design prototype
 * (`Design/前台/js/site/site-route.js:105`).
 *
 * `pending` maps to `danger`, not to a neutral or warning tone: an unclaimed request during a
 * disaster is the state that needs attention, and the prototype colours it accordingly. A
 * cancelled ticket is `neutral` rather than `danger` — it needs nobody's attention.
 */
const TICKET_STATUS_TONES: Record<string, BadgeTone> = {
  pending: 'danger',
  open: 'danger',
  in_progress: 'warning',
  'in-progress': 'warning',
  processing: 'warning',
  assigned: 'warning',
  accepted: 'warning',
  completed: 'success',
  fulfilled: 'success',
  resolved: 'success',
  closed: 'success',
  cancelled: 'neutral',
  canceled: 'neutral',
};

export function getTicketStatusTone(value?: string | null): BadgeTone {
  const key = normalizeStatusKey(value);

  return (key && TICKET_STATUS_TONES[key]) || 'neutral';
}

export interface TicketPriorityLook {
  label: string;
  tone: BadgeTone;
  variant: BadgeVariant;
}

/**
 * The badge a ticket's priority earns, as the 2026-09-21 prototype draws it (`site-list.jsx`,
 * `site-detail.jsx`): `tickets.priority` has four values, and only the top two get one —
 * `critical` as 最高優先 in solid danger, `high` as 高優先 in warning. A high one is solid on a list
 * card, beside its title, and subtle in a ticket's drawer and a region's list; the place says
 * which. Below high, nothing.
 */
export function getTicketPriorityBadge(
  value?: string | null,
  { high = 'subtle' }: { high?: BadgeVariant } = {},
): TicketPriorityLook | null {
  switch (normalizeStatusKey(value)) {
    case 'critical':
      return { label: '最高優先', tone: 'danger', variant: 'solid' };
    case 'high':
      return { label: '高優先', tone: 'warning', variant: high };
    default:
      return null;
  }
}

/**
 * `ticket_tasks.task_type` → the label a reader sees.
 *
 * The backend documents exactly four values (`rescue` / `supply` / `medical` / `hr`). Anything else
 * is passed through unchanged rather than hidden, so a new backend value shows up as itself instead
 * of silently disappearing — the tell that this table needs a row.
 */
export function formatTicketTypeLabel(value?: string | null) {
  if (!value?.trim()) {
    return '未提供';
  }

  switch (value.trim().toLowerCase()) {
    case 'rescue':
      return '救援';
    case 'hr':
      return '人力';
    case 'supply':
      return '物資';
    case 'medical':
      return '醫療';
    default:
      return value;
  }
}
