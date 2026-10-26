import type { components } from '@rescue-frontend/data-access/openapi';

type TicketMetric = components['schemas']['TicketYMetric'];
type StationMetric = components['schemas']['StationYMetric'];
export type MetricSpec = components['schemas']['YMetricSpec'];
export type AnalyticsCatalog = components['schemas']['CatalogResponse'];

/**
 * The backend buckets and bounds dates in UTC unless told otherwise (`tz` defaults to `UTC`), which
 * would put the day boundary at 08:00 here. The filter card lets the viewer move it, and this is
 * what every dashboard query starts on.
 */
export const DASHBOARD_TIME_ZONE = 'Asia/Taipei';

/** What the filter card's 時區 select offers. Values are IANA zones the backend takes as `tz`. */
export const DASHBOARD_TIME_ZONES: readonly { id: string; label: string }[] = [
  { id: 'Asia/Taipei', label: '台北（UTC+8）' },
  { id: 'UTC', label: 'UTC' },
  { id: 'Asia/Tokyo', label: '東京（UTC+9）' },
];

/** What the page opens on: 近 30 天, ending today in the zone. */
export const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * A 看多久 shortcut. `all` is 事件發生到今日: no start date, so the backend counts from the first
 * ticket. A number is a lookback of that many days ending today.
 */
export type DashboardQuickRange = 'today' | 'all' | 7 | 30 | 'custom';

/**
 * The 看多久 switch, in the order product set on Oct 25 (ADMIN-023). 自定義 is selected whenever the
 * dates match none of the shortcuts, and picking it changes nothing: the dates are the state, the
 * others are shortcuts into them.
 */
export const DASHBOARD_QUICK_RANGES: readonly {
  id: DashboardQuickRange;
  label: string;
}[] = [
  { id: 'today', label: '今日' },
  { id: 'all', label: '事件發生到今日' },
  { id: 7, label: '近一週' },
  { id: 30, label: '近 30 天' },
  { id: 'custom', label: '自定義' },
];

/** `start_date` / `end_date` exactly as the analytics value endpoints take them: inclusive, local to the zone. */
export interface DashboardDateRange {
  start_date?: string;
  end_date?: string;
}

/**
 * Which accent the KPI card's left bar uses. Named by token role, not by colour, so this file keeps
 * no styling: the page resolves them against `designTokens`.
 */
export type DashboardKpiAccent =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'muted';

/**
 * Which metric of which domain a card or a chart is about — the whole of what they share. Only the
 * metrics `/value` accepts are here; the backend 400s on the multi-series ones (`VALUE_KEYS` in
 * `Backend/app/api/v1/endpoints/analytics.py`). Labels and units are NOT kept here either: they come
 * from `/analytics/catalog`, which is the source of truth.
 */
export type DashboardMetric =
  | { domain: 'tickets'; metric: TicketMetric }
  | { domain: 'stations'; metric: StationMetric };

/**
 * A KPI card: a metric plus how the design draws it. `accent` is the left bar's colour, named by
 * token role rather than by colour so this file keeps no styling — the page resolves it against
 * `designTokens`. `emphasis` outlines one card louder than the rest (未指派, the one the design wants
 * read first).
 */
export type DashboardKpi = DashboardMetric & {
  accent: DashboardKpiAccent;
  emphasis?: boolean;
};

/** Six cards, in the design's order. 疑似重複的單 is chart-only, so it is not a card. */
export const TICKET_KPIS: readonly DashboardKpi[] = [
  { domain: 'tickets', metric: 'total_tickets', accent: 'primary' },
  {
    domain: 'tickets',
    metric: 'unassigned_tickets',
    accent: 'warning',
    emphasis: true,
  },
  { domain: 'tickets', metric: 'ongoing_tickets', accent: 'secondary' },
  { domain: 'tickets', metric: 'completed_tickets', accent: 'success' },
  { domain: 'tickets', metric: 'canceled_tickets', accent: 'muted' },
  { domain: 'tickets', metric: 'completion_rate', accent: 'primary' },
];

export const STATION_KPIS: readonly DashboardKpi[] = [
  { domain: 'stations', metric: 'station_count', accent: 'secondary' },
];

/** Every KPI the page queries, whichever group it is drawn in. */
export const DASHBOARD_KPIS: readonly DashboardKpi[] = [
  ...TICKET_KPIS,
  ...STATION_KPIS,
];

/** `YYYY-MM-DD` for the calendar day `now` falls on in `timeZone`. */
export function localDateString(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Calendar arithmetic on a `YYYY-MM-DD` string; done in UTC so no DST or local offset can shift it. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A `days`-long range ending on the day `now` falls on in `timeZone`, both ends inclusive. */
export function lookbackRange(
  now: Date,
  timeZone: string,
  days: number,
): DashboardDateRange {
  const end = localDateString(now, timeZone);
  return { start_date: addDays(end, -(days - 1)), end_date: end };
}

/** Inclusive length in days, or null when either bound is missing (an open-ended range). */
export function rangeLengthDays(range: DashboardDateRange): number | null {
  if (!range.start_date || !range.end_date) return null;
  const ms =
    Date.parse(`${range.end_date}T00:00:00Z`) -
    Date.parse(`${range.start_date}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** The dates a shortcut stands for, ending `today`. Null for 自定義, which sets no dates. */
export function quickRangeDates(
  quick: DashboardQuickRange,
  today: string,
): DashboardDateRange | null {
  if (quick === 'custom') return null;
  if (quick === 'all') return { end_date: today };
  if (quick === 'today') return { start_date: today, end_date: today };
  return { start_date: addDays(today, -(quick - 1)), end_date: today };
}

/**
 * Which shortcut these dates are. Every shortcut ends today, so a past week is 自定義, not 近一週.
 */
export function rangeQuickRange(
  range: DashboardDateRange,
  today: string,
): DashboardQuickRange {
  if (range.end_date !== today) return 'custom';
  if (!range.start_date) return 'all';
  const length = rangeLengthDays(range);
  if (length === 1) return 'today';
  return length === 7 || length === 30 ? length : 'custom';
}

/** `MM/DD`, the year left out: the cards only need to tell days of one event apart. */
function shortDate(isoDate: string): string {
  return `${isoDate.slice(5, 7)}/${isoDate.slice(8, 10)}`;
}

/**
 * Which tickets a KPI card counts, for its title. Every number is filtered by creation date, so the
 * card says so, e.g. 未指派（今日建立）.
 */
export function rangeCreatedCaption(
  range: DashboardDateRange,
  today: string,
): string {
  const quick = rangeQuickRange(range, today);
  if (quick === 'today') return '今日建立';
  if (quick === 'all') return '事件發生至今建立';
  if (quick === 7) return '近一週建立';
  if (quick === 30) return '近 30 天建立';
  const end = shortDate(range.end_date ?? today);
  if (!range.start_date) return `${end} 以前建立`;
  return `${shortDate(range.start_date)}–${end} 建立`;
}

export type KpiAvailability =
  | { kind: 'ready' }
  | { kind: 'needs-range'; maxDays: number | null };

/**
 * Whether a metric can be asked for over this range. `duplicate_count` refuses an open range and
 * caps its length (catalog `requires_date_range` / `max_range_days`); asking anyway is a 400, so
 * its card explains instead of querying.
 */
export function kpiAvailability(
  spec: Pick<MetricSpec, 'requires_date_range' | 'max_range_days'> | undefined,
  range: DashboardDateRange,
): KpiAvailability {
  if (!spec?.requires_date_range) return { kind: 'ready' };
  const maxDays = spec.max_range_days ?? null;
  const length = rangeLengthDays(range);
  if (length === null || (maxDays !== null && length > maxDays)) {
    return { kind: 'needs-range', maxDays };
  }
  return { kind: 'ready' };
}

const countFormat = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 0,
});
const rateFormat = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 1 });

/**
 * The number as the card shows it, split from its unit so the two can be styled apart. A `%`
 * value is already 0–100 (the backend scales it for `/value`), so it is printed, not multiplied.
 */
export function formatKpiValue(
  value: number,
  unit: string,
): { value: string; unit: string } {
  if (unit === '%') return { value: rateFormat.format(value), unit: '%' };
  return { value: countFormat.format(value), unit };
}

/** A real calendar date written `YYYY-MM-DD`. */
function isIsoDate(date: string | undefined): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

/**
 * Apply only real calendar dates in ascending order. The start may be left out: the backend then
 * counts from the first ticket (事件發生到今日). The end may not.
 */
export function isValidDateRange(range: DashboardDateRange): boolean {
  const { start_date, end_date } = range;
  if (!isIsoDate(end_date)) return false;
  if (start_date === undefined) return true;
  if (!isIsoDate(start_date)) return false;
  return start_date <= end_date;
}

/**
 * What the queries use after a filter edit. The dates wait until they form a valid range; the
 * bucket size and the zone never wait for them — a half-typed date must not freeze the rest of the
 * filter card.
 */
export function applyFilterChange<T extends { range: DashboardDateRange }>(
  applied: T,
  next: T,
): T {
  return isValidDateRange(next.range)
    ? next
    : { ...next, range: applied.range };
}

function formatRange({ start_date, end_date }: DashboardDateRange): string {
  return `${start_date ?? '事件發生'} → ${end_date ?? '?'}`;
}

/**
 * Why the dates on screen are not the ones the charts use, or null when they are. `applied` is
 * the range still in force, so the message can say which period the page is showing.
 */
export function dateRangeProblem(
  range: DashboardDateRange,
  applied: DashboardDateRange,
): string | null {
  if (isValidDateRange(range)) return null;
  const showing = `圖表仍顯示 ${formatRange(applied)}。`;
  if (!range.end_date) {
    return `訖日還沒選，${showing}`;
  }
  if (
    (range.start_date !== undefined && !isIsoDate(range.start_date)) ||
    !isIsoDate(range.end_date)
  ) {
    return `日期無效，${showing}`;
  }
  return `起日晚於訖日，${showing}`;
}
