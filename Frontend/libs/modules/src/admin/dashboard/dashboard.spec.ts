// @vitest-environment jsdom
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@rescue-frontend/data-access';

import { DashboardPage } from './dashboard-page';

const state = vi.hoisted(() => ({
  forbidden: '' as string,
  failed: '' as string,
  empty: false,
  value: 12,
  requests: [] as {
    domain: string;
    kind: string;
    query: Record<string, unknown>;
  }[],
}));
vi.mock('./analytics-chart', () => ({
  AnalyticsChart: ({ label }: { label: string }) =>
    createElement('div', { role: 'img', 'aria-label': label }),
}));
vi.mock('@rescue-frontend/data-access/admin', () => {
  const metrics = {
    tickets: [
      'total_tickets',
      'unassigned_tickets',
      'ongoing_tickets',
      'completed_tickets',
      'completion_rate',
      'canceled_tickets',
      'net_backlog_change',
      'age_distribution',
      'time_to_completion',
      'task_completion_distribution',
      'duplicate_count',
      'volunteers_needed',
      'volunteers_matched',
      'volunteer_gap',
    ],
    stations: [
      'station_count',
      'station_status_count',
      'station_freshness_trend',
    ],
  };
  const catalog = Object.fromEntries(
    Object.entries(metrics).map(([domain, names]) => [
      domain,
      Object.fromEntries(
        names.map((name) => [
          name,
          {
            label: `後端-${name}`,
            description: `說明-${name}`,
            unit: '件',
            allowed_x: ['none', 'date', 'category'],
            allowed_chart_types: ['bar', 'line', 'pie'],
            default_chart_type: 'bar',
            requires_date_range: false,
            // As the real catalog: the gap's trend comes by day only, at most 366 days.
            ...(name === 'volunteer_gap'
              ? { allowed_x_granularities: ['day'], max_range_days: 366 }
              : {}),
          },
        ]),
      ),
    ]),
  );
  const queryOptions = (
    domain: string,
    kind: string,
    { query }: { query: Record<string, unknown> },
  ) => ({
    queryKey: ['admin', 'analytics', domain, kind, query],
    queryFn: async () => {
      state.requests.push({ domain, kind, query });
      if (
        state.forbidden === '*' ||
        state.forbidden === domain ||
        state.forbidden === query.y
      )
        throw new ApiError(403, 'Forbidden');
      if (state.failed === query.y) throw new Error('Failed');
      return kind === 'value'
        ? { value: state.value }
        : {
            data: [
              {
                type: 'bar',
                x: state.empty ? [] : ['A'],
                y: state.empty ? [] : [12],
              },
            ],
            layout: {},
            config: {},
          };
    },
  });
  return {
    SILENT_ERROR_META: 'silentError',
    useAnalyticsCatalog: () => ({ data: catalog, isError: false }),
    ticketAnalyticsValueQuery: (args: { query: Record<string, unknown> }) =>
      queryOptions('tickets', 'value', args),
    stationAnalyticsValueQuery: (args: { query: Record<string, unknown> }) =>
      queryOptions('stations', 'value', args),
    ticketAnalyticsChartQuery: (args: { query: Record<string, unknown> }) =>
      queryOptions('tickets', 'chart', args),
    stationAnalyticsChartQuery: (args: { query: Record<string, unknown> }) =>
      queryOptions('stations', 'chart', args),
  };
});

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv('NEXT_PUBLIC_DASHBOARD_EMPTY_PREVIEW', 'false');
  state.forbidden = '';
  state.failed = '';
  state.empty = false;
  state.value = 12;
  state.requests = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.unstubAllEnvs();
  container.remove();
});
async function mount() {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(DashboardPage),
      ),
    ),
  );
  await settle();
}
describe('dashboard states and filters', () => {
  it('retains the forbidden domain heading while the allowed domain renders', async () => {
    state.forbidden = 'tickets';
    await mount();
    expect(container.textContent).not.toContain('測試完全無資料');
    expect(container.textContent).toContain('你沒有檢視任務單的權限');
    expect(container.querySelector('[aria-label="資源站點"]')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).not.toBeNull();
  });
  it('previews a completely empty platform and restores real data with the same button', async () => {
    vi.stubEnv('NEXT_PUBLIC_DASHBOARD_EMPTY_PREVIEW', 'true');
    await mount();
    state.requests = [];
    const preview = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === '測試完全無資料',
    );
    expect(preview).toBeDefined();
    await act(async () => preview?.click());
    await settle();
    expect(container.textContent).not.toContain('還沒有任何資料');
    expect(container.textContent?.match(/這段期間沒有資料/g)).toHaveLength(7);
    expect(container.textContent).toContain('目前為無資料預覽');
    // Every value is 0 in the preview, the gap's too: nothing is missing.
    expect(container.textContent).toContain('目前沒有缺人的需求');
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0);
    expect(state.requests).toHaveLength(0);
    expect(preview?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => preview?.click());
    await settle();
    expect(container.textContent).not.toContain('目前為無資料預覽');
    expect(container.textContent).not.toContain('還沒有任何資料');
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(7);
  });
  it('shows both section permission states when neither domain is allowed', async () => {
    state.forbidden = '*';
    await mount();
    expect(container.textContent).toContain('你沒有檢視任務單的權限');
    expect(container.textContent).toContain('你沒有檢視資源站點的權限');
    expect(container.querySelectorAll('h2')).toHaveLength(2);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0);
  });
  it('automatically applies a valid custom date and holds invalid edits', async () => {
    await mount();
    state.requests = [];
    const start =
      container.querySelector<HTMLInputElement>('[aria-label="起日"]');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    expect(start).not.toBeNull();
    expect(setter).toBeDefined();
    await act(async () => {
      setter?.call(start, '2026-01-01');
      start?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    // The seven counts and the seven charts; the three volunteer cards stand at the end date,
    // which did not move, so they are not asked again.
    expect(state.requests).toHaveLength(14);
    expect(
      state.requests.every(({ query }) => query.start_date === '2026-01-01'),
    ).toBe(true);
    state.requests = [];
    await act(async () => {
      setter?.call(start, '2099-01-01');
      start?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    expect(state.requests).toHaveLength(0);
    // An emptied start is 事件發生到今日: it queries, with no start date.
    await act(async () => {
      setter?.call(start, '');
      start?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    expect(state.requests.length).toBeGreaterThan(0);
    expect(
      state.requests.every(({ query }) => query.start_date === undefined),
    ).toBe(true);
  });
  it('applies granularity and zone while the dates are invalid, and says why the dates wait', async () => {
    await mount();
    const start =
      container.querySelector<HTMLInputElement>('[aria-label="起日"]');
    const end =
      container.querySelector<HTMLInputElement>('[aria-label="訖日"]');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    const appliedEnd = end?.value;
    // Reversed: the start after the end.
    await act(async () => {
      setter?.call(start, '2099-01-01');
      start?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    expect(container.textContent).toContain('起日晚於訖日');
    expect(container.textContent).not.toMatch(/-\d+ 天/);
    expect(start?.getAttribute('aria-invalid')).toBe('true');

    state.requests = [];
    const week = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === '一週',
    );
    await act(async () => week?.click());
    await settle();
    const charts = state.requests.filter(({ kind }) => kind === 'chart');
    expect(charts).toHaveLength(6);
    expect(charts.every(({ query }) => query.x_granularity === 'week')).toBe(
      true,
    );
    // Still the last valid range, not the reversed one.
    expect(
      state.requests.every(
        ({ query }) =>
          query.start_date !== '2099-01-01' && query.end_date === appliedEnd,
      ),
    ).toBe(true);

    state.requests = [];
    const zone = container.querySelector<HTMLSelectElement>('#dashboard-tz');
    const other = Array.from(zone?.options ?? []).find(
      (option) => option.value !== zone?.value,
    );
    expect(other).toBeDefined();
    await act(async () => {
      if (zone && other) zone.value = other.value;
      zone?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(state.requests.length).toBeGreaterThan(0);
    expect(state.requests.every(({ query }) => query.tz === other?.value)).toBe(
      true,
    );
  });
  it('shows forbidden cards while other cards continue to render', async () => {
    state.forbidden = 'total_tickets';
    await mount();
    expect(container.textContent).toContain('沒有權限');
    expect(container.querySelectorAll('[role="img"]').length).toBe(6);
    expect(container.textContent).toContain('後端-total_tickets');
    expect(container.textContent).not.toContain('每天新增多少單');
  });
  it('shows empty plots independently of KPI values', async () => {
    state.empty = true;
    await mount();
    expect(container.textContent?.match(/這段期間沒有資料/g)).toHaveLength(7);
    expect(container.textContent).toContain('12');
  });
  it('isolates one failing metric from other cards', async () => {
    state.failed = 'total_tickets';
    await mount();
    expect(container.textContent).toContain('圖表載入失敗');
    expect(container.textContent).toContain('讀取失敗');
    expect(container.querySelectorAll('[role="img"]').length).toBe(6);
  });
  it('updates every active card on quick range and granularity changes without refresh', async () => {
    await mount();
    state.requests = [];
    const button = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === '近一週',
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
    await settle();
    expect(state.requests).toHaveLength(14);
    const ranges = new Set(
      state.requests.map(
        ({ query }) => `${query.start_date}/${query.end_date}`,
      ),
    );
    expect(ranges.size).toBe(1);
    state.requests = [];
    const week = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === '一週',
    );
    await act(async () => week?.click());
    await settle();
    expect(state.requests.filter(({ kind }) => kind === 'chart')).toHaveLength(
      6,
    );
    expect(
      state.requests
        .filter(({ kind }) => kind === 'chart')
        .every(({ query }) => query.x_granularity === 'week'),
    ).toBe(true);
  });

  it('今日 asks for today only, by day, and disables 週', async () => {
    await mount();
    state.requests = [];
    const buttons = () => Array.from(container.querySelectorAll('button'));
    await act(async () =>
      buttons()
        .find((el) => el.textContent === '一週')
        ?.click(),
    );
    await settle();
    state.requests = [];
    await act(async () =>
      buttons()
        .find((el) => el.textContent === '今日')
        ?.click(),
    );
    await settle();
    const charts = state.requests.filter(({ kind }) => kind === 'chart');
    expect(charts.length).toBeGreaterThan(0);
    expect(
      state.requests.every(
        ({ query }) =>
          query.start_date !== undefined && query.start_date === query.end_date,
      ),
    ).toBe(true);
    expect(charts.every(({ query }) => query.x_granularity === 'day')).toBe(
      true,
    );
    const week = buttons().find((el) => el.textContent === '一週');
    expect(week?.disabled).toBe(true);
    expect(container.textContent).toContain('今日建立');
  });

  it('事件發生到今日 sends no start date and switches to weeks', async () => {
    await mount();
    state.requests = [];
    await act(async () =>
      Array.from(container.querySelectorAll('button'))
        .find((el) => el.textContent === '事件發生到今日')
        ?.click(),
    );
    await settle();
    const charts = state.requests.filter(({ kind }) => kind === 'chart');
    expect(charts.length).toBeGreaterThan(0);
    expect(
      state.requests.every(({ query }) => query.start_date === undefined),
    ).toBe(true);
    const isGapTrend = ({ query }: { query: Record<string, unknown> }) =>
      query.y === 'volunteer_gap';
    expect(
      charts
        .filter((chart) => !isGapTrend(chart))
        .every(({ query }) => query.x_granularity === 'week'),
    ).toBe(true);
    // The gap's trend comes by day only, so it is asked for by day.
    expect(
      charts.filter(isGapTrend).map(({ query }) => query.x_granularity),
    ).toEqual(['day']);
    expect(container.textContent).toContain('事件發生至今建立');
  });

  it('asks for the volunteer cards at the end date only and captions them 截至', async () => {
    await mount();
    const volunteer = state.requests.filter(
      ({ kind, query }) =>
        kind === 'value' && String(query.y).startsWith('volunteer'),
    );
    expect(volunteer.map(({ query }) => query.y)).toEqual([
      'volunteers_needed',
      'volunteers_matched',
      'volunteer_gap',
    ]);
    expect(
      volunteer.every(
        ({ query }) =>
          query.start_date === undefined && typeof query.end_date === 'string',
      ),
    ).toBe(true);
    expect(container.textContent).toContain('截至今日');
    expect(container.textContent).toContain('近 30 天建立');
    // The range is on its own line now, not in the title.
    expect(container.textContent).not.toContain('（近 30 天建立）');
    // A gap above zero keeps the catalog's description; how many needs are short is not in the API.
    expect(container.textContent).not.toContain('目前沒有缺人的需求');
    expect(container.textContent).toContain('志工缺口每天的變化');
  });

  it('says nothing is missing when the gap is zero', async () => {
    state.value = 0;
    await mount();
    expect(container.textContent).toContain('目前沒有缺人的需求');
  });

  it('draws the three volunteer metrics by need type in the detail charts, at the end date', async () => {
    await mount();
    state.requests = [];
    await act(async () =>
      Array.from(container.querySelectorAll('button'))
        .find((el) => el.textContent?.startsWith('展開細部分析'))
        ?.click(),
    );
    await settle();
    const byType = state.requests.filter(
      ({ kind, query }) => kind === 'chart' && query.x === 'category',
    );
    expect(
      byType
        .filter(({ query }) => String(query.y).startsWith('volunteer'))
        .map(({ query }) => [query.y, query.start_date, query.chart_type]),
    ).toEqual([
      ['volunteers_needed', undefined, 'bar'],
      ['volunteers_matched', undefined, 'bar'],
      ['volunteer_gap', undefined, 'bar'],
    ]);
    expect(
      container.querySelector(
        '[aria-label="各需求類型：需求／已媒合／缺口圖表"]',
      ),
    ).not.toBeNull();
  });
});
