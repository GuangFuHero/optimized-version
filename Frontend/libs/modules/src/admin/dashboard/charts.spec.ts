import { describe, expect, it } from 'vitest';

import {
  CHART_TYPE_LABELS,
  chartQueryParams,
  knownOptions,
  hasChartData,
  STATION_CHARTS,
  TICKET_CHARTS,
  TICKET_DETAIL_CHARTS,
  X_LABELS,
} from './charts';

describe('chartQueryParams', () => {
  const range = { start_date: '2026-10-08', end_date: '2026-10-14' };

  it('sends no x for the ungrouped aggregate, which the catalog calls none', () => {
    const query = chartQueryParams(
      { x: 'none', chartType: 'bar' },
      range,
      'day',
      'Asia/Taipei',
    );
    expect(query).not.toHaveProperty('x');
    expect(query).toMatchObject({ chart_type: 'bar', tz: 'Asia/Taipei' });
  });

  it('passes the zone, grouping, range and bucket size through', () => {
    expect(
      chartQueryParams({ x: 'date', chartType: 'line' }, range, 'week', 'UTC'),
    ).toEqual({
      ...range,
      tz: 'UTC',
      x: 'date',
      chart_type: 'line',
      x_granularity: 'week',
    });
  });
});

describe('knownOptions', () => {
  it('puts the default chart type first, whatever order the catalog lists them in', () => {
    // The catalog sorts `allowed_chart_types`, so `net_backlog_change` arrives as bar, line even
    // though its default is the line.
    expect(knownOptions(['bar', 'line'], CHART_TYPE_LABELS, 'line')).toEqual([
      { id: 'line', label: '折線' },
      { id: 'bar', label: '長條' },
    ]);
    expect(knownOptions(['bar', 'pie'], CHART_TYPE_LABELS, 'pie')).toEqual([
      { id: 'pie', label: '圓餅' },
      { id: 'bar', label: '長條' },
    ]);
  });

  it("orders the rest by this file's labels, not the catalog's sorted list", () => {
    expect(knownOptions(['category', 'date', 'none'], X_LABELS)).toEqual([
      { id: 'none', label: '總計' },
      { id: 'date', label: '日期' },
      { id: 'category', label: '類型' },
    ]);
  });

  it('drops values this page has no label for, and offers nothing before the catalog loads', () => {
    expect(knownOptions(['none', 'date', 'hour'], X_LABELS)).toEqual([
      { id: 'none', label: '總計' },
      { id: 'date', label: '日期' },
    ]);
    expect(knownOptions(undefined, X_LABELS)).toEqual([]);
  });
});

describe('dashboard chart layout', () => {
  it('charts every multi-series metric the KPI cards cannot show', () => {
    const metrics = [
      ...TICKET_CHARTS,
      ...TICKET_DETAIL_CHARTS,
      ...STATION_CHARTS,
    ].map((chart) => chart.metric);
    expect(metrics).toEqual(
      expect.arrayContaining([
        'age_distribution',
        'time_to_completion',
        'net_backlog_change',
        'task_completion_distribution',
        'station_status_count',
        'station_freshness_trend',
      ]),
    );
  });

  it('opens every chart on a view this page can both label and lay out', () => {
    // Whether the opening view is one the *catalog* allows is the backend's to assert — the catalog
    // is not kept here. What this page can check is that every view it names has a label to render
    // and a column span the 12-track grid can hold.
    for (const chart of [
      ...TICKET_CHARTS,
      ...TICKET_DETAIL_CHARTS,
      ...STATION_CHARTS,
    ]) {
      expect(X_LABELS[chart.x], `${chart.metric} x=${chart.x}`).toBeTruthy();
      expect(
        CHART_TYPE_LABELS[chart.chartType],
        `${chart.metric} chartType=${chart.chartType}`,
      ).toBeTruthy();
      expect([4, 6, 8, 12], `${chart.metric} span=${chart.span}`).toContain(
        chart.span,
      );
    }
  });
});

describe('hasChartData', () => {
  const figure = (data: Record<string, unknown>[]) => ({
    data,
    layout: {},
    config: {},
  });
  it('detects empty line/bar and pie figures, including null duration samples', () => {
    for (const data of [
      [],
      [{ type: 'bar', y: [] }],
      [{ type: 'pie', values: [] }],
      [{ type: 'scatter', y: [null, null] }],
    ]) {
      expect(hasChartData(figure(data))).toBe(false);
    }
  });
  it('keeps real zero measurements and any populated series visible', () => {
    for (const data of [
      [{ type: 'bar', y: [0] }],
      [{ type: 'pie', values: [0, 0] }],
      [
        { type: 'scatter', y: [] },
        { type: 'scatter', y: [null, 2] },
      ],
    ]) {
      expect(hasChartData(figure(data))).toBe(true);
    }
  });
});
