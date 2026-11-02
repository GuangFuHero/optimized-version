import type { AnalyticsChartFigure } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

import { type DashboardDateRange, type DashboardMetric } from './kpis';

export type ChartType = components['schemas']['ChartType'];
export type ChartGranularity = components['schemas']['ChartXGranularity'];
/** The catalog's `allowed_x` values; `none` is the ungrouped aggregate and is sent as no `x`. */
export type ChartXOption = components['schemas']['ChartX'] | 'none';

/**
 * One chart on the dashboard, laid out as in the design (`design/netlify-sync`,
 * `js/admin/dashboard/db-app.jsx`). `x` and `chartType` are only the starting view — the panel
 * lets the viewer switch among what the catalog allows. All display text comes from the catalog.
 */
export type DashboardChart = DashboardMetric & {
  x: ChartXOption;
  chartType: ChartType;
  /** Columns out of 12 on desktop. */
  span: 4 | 6 | 8 | 12;
};

export const TICKET_CHARTS: readonly DashboardChart[] = [
  {
    domain: 'tickets',
    metric: 'total_tickets',
    x: 'date',
    chartType: 'line',
    span: 8,
  },
  {
    domain: 'tickets',
    metric: 'unassigned_tickets',
    x: 'category',
    chartType: 'bar',
    span: 4,
  },
  {
    domain: 'tickets',
    metric: 'net_backlog_change',
    x: 'date',
    chartType: 'line',
    span: 12,
  },
];

/** Secondary analysis, folded away by default so the first screen stays readable. */
export const TICKET_DETAIL_CHARTS: readonly DashboardChart[] = [
  {
    domain: 'tickets',
    metric: 'completion_rate',
    x: 'date',
    chartType: 'line',
    span: 6,
  },
  {
    domain: 'tickets',
    metric: 'age_distribution',
    x: 'none',
    chartType: 'bar',
    span: 6,
  },
  {
    domain: 'tickets',
    metric: 'time_to_completion',
    x: 'category',
    chartType: 'bar',
    span: 4,
  },
  {
    domain: 'tickets',
    metric: 'task_completion_distribution',
    x: 'none',
    chartType: 'pie',
    span: 4,
  },
  {
    domain: 'tickets',
    metric: 'duplicate_count',
    x: 'category',
    chartType: 'bar',
    span: 4,
  },
];

export const STATION_CHARTS: readonly DashboardChart[] = [
  {
    domain: 'stations',
    metric: 'station_count',
    x: 'category',
    chartType: 'bar',
    span: 4,
  },
  {
    domain: 'stations',
    metric: 'station_status_count',
    x: 'category',
    chartType: 'pie',
    span: 4,
  },
  {
    domain: 'stations',
    metric: 'station_freshness_trend',
    x: 'date',
    chartType: 'line',
    span: 4,
  },
];

export const X_LABELS: Record<ChartXOption, string> = {
  none: '總計',
  date: '日期',
  category: '類型',
};

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: '長條',
  line: '折線',
  pie: '圓餅',
};

export const GRANULARITY_OPTIONS: readonly {
  id: ChartGranularity;
  label: string;
}[] = [
  { id: 'day', label: '一天' },
  { id: 'week', label: '一週' },
];

/**
 * The options the catalog allows, `first` (the metric's `default_chart_type`) in front and the rest
 * in this file's label order. The catalog's own list is not relied on for order: the backend
 * sorts it, which would put 長條 first for `net_backlog_change`, a metric whose default is the
 * line. Values with no label here are dropped rather than shown raw.
 */
export function knownOptions<T extends string>(
  allowed: readonly string[] | undefined,
  labels: Record<T, string>,
  first?: string,
): { id: T; label: string }[] {
  const allowedSet = new Set(allowed);
  const ids = (Object.keys(labels) as T[]).filter((id) => allowedSet.has(id));
  return ids
    .sort((a, b) => Number(b === first) - Number(a === first))
    .map((id) => ({ id, label: labels[id] }));
}

/** The `/chart` query for one panel's current view. */
export function chartQueryParams(
  view: { x: ChartXOption; chartType: ChartType },
  range: DashboardDateRange,
  granularity: ChartGranularity,
  tz: string,
) {
  return {
    ...range,
    tz,
    chart_type: view.chartType,
    x_granularity: granularity,
    ...(view.x === 'none' ? {} : { x: view.x }),
  };
}

/** Empty traces and null samples have no data; zero remains a valid measurement. */
export function hasChartData(figure: AnalyticsChartFigure): boolean {
  return figure.data.some((trace) => {
    const values = trace.type === 'pie' ? trace.values : trace.y;
    return (
      Array.isArray(values) &&
      values.some(
        (value: unknown) => typeof value === 'number' && Number.isFinite(value),
      )
    );
  });
}
