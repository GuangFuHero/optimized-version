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
  fulfilled: '已完成',
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
