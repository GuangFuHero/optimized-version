import type { AnalyticsChartFigure } from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

import {
  type DashboardDateRange,
  type DashboardKpiAccent,
  type DashboardMetric,
  type MetricSpec,
} from './kpis';

type TicketMetric = Extract<DashboardMetric, { domain: 'tickets' }>['metric'];

export type ChartType = components['schemas']['ChartType'];
export type ChartGranularity = components['schemas']['ChartXGranularity'];
/** The catalog's `allowed_x` values; `none` is the ungrouped aggregate and is sent as no `x`. */
export type ChartXOption = components['schemas']['ChartX'] | 'none';

/**
 * One chart on the dashboard, laid out as in the design (`design/netlify-sync`,
 * `js/admin/dashboard/db-app.jsx`). `x` and `chartType` are only the starting view — the panel
 * lets the viewer switch among what the catalog allows. All display text comes from the catalog,
 * but a `fixed` chart's.
 */
export type DashboardChart = DashboardMetric & {
  x: ChartXOption;
  chartType: ChartType;
  /** Columns out of 12 on desktop. */
  span: 4 | 6 | 8 | 12;
  /**
   * For a chart of a metric that is also a card: the design's own heading and line, the card's
   * colour, and no switches. The catalog's label would name the card a second time, and the card
   * is already the other view of the number.
   */
  fixed?: { title: string; description: string; tone: DashboardKpiAccent };
};

/** The gap card's number day by day, the full row right under the volunteer cards. */
export const VOLUNTEER_GAP_TREND: DashboardChart = {
  domain: 'tickets',
  metric: 'volunteer_gap',
  x: 'date',
  chartType: 'line',
  span: 12,
  fixed: {
    title: '志工缺口每天的變化',
    description:
      '每一天結束時還缺幾個人。線往下＝補人的速度追上需求，往上＝該再招募',
    tone: 'warning',
  },
};

export const TICKET_CHARTS: readonly DashboardChart[] = [
  VOLUNTEER_GAP_TREND,
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

/**
 * The bucket size a chart is asked for. A metric whose trend comes in one size only (the volunteer
 * gap is always by day) is asked for that size, so switching the page to 一週 does not ask for it
 * again only to get the same days back.
 */
export function chartGranularity(
  spec: Pick<MetricSpec, 'allowed_x_granularities'> | undefined,
  granularity: ChartGranularity,
): ChartGranularity {
  const allowed = spec?.allowed_x_granularities as
    | ChartGranularity[]
    | undefined;
  if (!allowed?.length || allowed.includes(granularity)) return granularity;
  return allowed[0];
}

/**
 * The three volunteer metrics side by side for each need type, in the detail charts: needed, matched
 * and missing, in the colours of their cards.
 */
export const VOLUNTEER_TYPE_SERIES: readonly {
  metric: TicketMetric;
  tone: DashboardKpiAccent;
}[] = [
  { metric: 'volunteers_needed', tone: 'secondary' },
  { metric: 'volunteers_matched', tone: 'success' },
  { metric: 'volunteer_gap', tone: 'warning' },
];

/** A one-series figure drawn in `color`, which the backend would otherwise take from its palette. */
export function toneFigure(
  figure: AnalyticsChartFigure,
  color: string,
): AnalyticsChartFigure {
  return { ...figure, layout: { ...figure.layout, colorway: [color] } };
}

/**
 * One grouped bar chart from one-series bar figures of the same grouping: each trace is named and
 * coloured as its part says, and the legend shown under the plot. The layout is the first part's.
 */
export function groupedBarFigure(
  parts: readonly {
    figure: AnalyticsChartFigure;
    name: string;
    color: string;
  }[],
): AnalyticsChartFigure {
  const data = parts.flatMap(({ figure, name, color }) =>
    figure.data.map((trace) => ({
      ...trace,
      name,
      marker: { ...(trace.marker as object | undefined), color },
    })),
  );
  return {
    data,
    layout: {
      ...parts[0]?.figure.layout,
      barmode: 'group',
      showlegend: true,
      legend: { orientation: 'h', x: 0, y: -0.2 },
    },
    config: parts[0]?.figure.config ?? {},
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
