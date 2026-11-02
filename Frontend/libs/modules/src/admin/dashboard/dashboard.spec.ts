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
      'volunteer_gap_needs',
      'supply_needs',
      'supply_needs_unclaimed',
    ],
    stations: [
      'station_count',
      'station_status_count',
      'station_freshness_trend',
    ],
  };
  const catalog = {
    ...Object.fromEntries(
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
              // As the real catalog: the gap's trends come by day only, at most 366 days.
              ...(name.startsWith('volunteer_gap')
                ? { allowed_x_granularities: ['day'], max_range_days: 366 }
                : {}),
            },
          ]),
        ),
      ]),
    ),
    // 宜蘭縣 only has stations: picking it leaves the tickets section nothing to ask.
    filters: {
      tickets: {
        types: [{ value: 'rescue', label: '搜救' }],
        statuses: [{ value: 'pending', label: '未指派' }],
        areas: [
          {
            county: '花蓮縣',
            towns: [{ town: '光復鄉', villages: ['大安村'] }],
          },
        ],
      },
      stations: {
        types: [{ value: 'supply', label: '物資' }],
        statuses: [{ value: 'open', label: '營運中' }],
        areas: [
          {
            county: '花蓮縣',
            towns: [
              { town: '光復鄉', villages: [] },
              { town: '鳳林鎮', villages: [] },
            ],
          },
          { county: '宜蘭縣', towns: [] },
        ],
      },
    },
  };
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
    // Every value is 0 in the preview, the footnotes' too: nothing is missing or unclaimed.
    expect(container.textContent).toContain('目前沒有缺人的需求');
    expect(container.textContent).toContain('都有人接了');
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
    // The other trends start at the beginning of the event; the gap's says it does not.
    expect(container.textContent).toContain('「全部」只畫最近 30 天');
  });

  it('asks for the four cards and their footnotes at the end date only and captions them 截至', async () => {
    await mount();
    const asOf = state.requests.filter(
      ({ kind, query }) =>
        kind === 'value' && /^(volunteer|supply_)/.test(String(query.y)),
    );
    expect(asOf.map(({ query }) => String(query.y)).sort()).toEqual([
      'supply_needs',
      'supply_needs_unclaimed',
      'volunteer_gap',
      'volunteer_gap_needs',
      'volunteers_matched',
      'volunteers_needed',
    ]);
    expect(
      asOf.every(
        ({ query }) =>
          query.start_date === undefined && typeof query.end_date === 'string',
      ),
    ).toBe(true);
    expect(container.textContent).toContain('截至今日');
    expect(container.textContent).toContain('近 30 天建立');
    // The range is on its own line now, not in the title.
    expect(container.textContent).not.toContain('（近 30 天建立）');
    expect(container.textContent).toContain('志工缺口每天的變化');
  });

  it('puts the 物資 card first in the row, and the footnotes on the 物資 and gap cards', async () => {
    await mount();
    const row = Array.from(container.querySelectorAll('article'))
      .map((card) => card.getAttribute('aria-label') ?? '')
      .filter((label) => label.endsWith('，截至今日'));
    expect(row).toEqual([
      '後端-supply_needs，截至今日',
      '後端-volunteers_needed，截至今日',
      '後端-volunteers_matched，截至今日',
      '後端-volunteer_gap，截至今日',
    ]);
    const card = (metric: string) =>
      container.querySelector(`article[aria-label^="後端-${metric}，"]`);
    expect(card('supply_needs')?.textContent).toContain('還沒人接 12 筆');
    expect(card('volunteer_gap')?.textContent).toContain('12 項需求還缺人');
    expect(card('volunteer_gap')?.textContent).not.toContain(
      '說明-volunteer_gap',
    );
  });

  it("falls back to the catalog's description when a footnote cannot be read", async () => {
    state.failed = 'volunteer_gap_needs';
    await mount();
    const gap = container.querySelector(
      'article[aria-label^="後端-volunteer_gap，"]',
    );
    expect(gap?.textContent).toContain('說明-volunteer_gap');
    expect(gap?.textContent).not.toContain('讀取失敗');
  });

  it('puts the short lines under the needed and matched cards, the whole description in the title', async () => {
    await mount();
    const card = (metric: string) =>
      container.querySelector(`article[aria-label^="後端-${metric}，"]`);
    expect(card('volunteers_needed')?.textContent).toContain(
      '人力共要幾人（含已額滿、已結束）',
    );
    expect(card('volunteers_needed')?.textContent).not.toContain(
      '說明-volunteers_needed',
    );
    expect(card('volunteers_needed')?.getAttribute('title')).toBe(
      '說明-volunteers_needed',
    );
    expect(card('volunteers_matched')?.textContent).toContain(
      '已被承接的名額（一人接兩筆算 2）',
    );
    expect(container.textContent).toContain('不是前兩個相減');
  });

  it('says nothing is missing when the gap is zero', async () => {
    state.value = 0;
    await mount();
    expect(container.textContent).toContain('目前沒有缺人的需求');
  });

  it('draws no volunteer chart by need type in the detail charts', async () => {
    await mount();
    state.requests = [];
    await act(async () =>
      Array.from(container.querySelectorAll('button'))
        .find((el) => el.textContent?.startsWith('展開細部分析'))
        ?.click(),
    );
    await settle();
    expect(state.requests.length).toBeGreaterThan(0);
    expect(
      state.requests.some(({ query }) =>
        String(query.y).startsWith('volunteer'),
      ),
    ).toBe(false);
  });

  async function pick(id: string, value: string) {
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>(`#${id}`);
      if (select) select.value = value;
      select?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
  }

  it('asks every query within the picked area, and a section only for an area it has', async () => {
    await mount();
    const select = (id: string) =>
      container.querySelector<HTMLSelectElement>(`#${id}`);
    expect(select('dashboard-town')?.disabled).toBe(true);

    state.requests = [];
    await pick('dashboard-county', '花蓮縣');
    expect(state.requests.length).toBeGreaterThan(0);
    expect(state.requests.every(({ query }) => query.county === '花蓮縣')).toBe(
      true,
    );
    expect(select('dashboard-town')?.disabled).toBe(false);

    // 村里 waits disabled for a town, then opens under one that has some.
    expect(select('dashboard-village')?.disabled).toBe(true);
    expect(select('dashboard-village')?.textContent).toContain('先選鄉鎮市區');
    await pick('dashboard-town', '光復鄉');
    expect(select('dashboard-village')?.disabled).toBe(false);
    expect(container.textContent).not.toContain('只算地址有寫到村里的單');
    await pick('dashboard-village', '大安村');
    expect(container.textContent).toContain(
      '只算地址有寫到村里的單；地址沒寫村里的不會算進「大安村」。',
    );
    // A town no address names a 村里 in has no 村里 to pick.
    await pick('dashboard-town', '鳳林鎮');
    expect(select('dashboard-village')).toBeNull();
    expect(container.textContent).not.toContain('只算地址有寫到村里的單');

    // Only stations have 宜蘭縣: the tickets section says so and is not asked, which would be a 422.
    state.requests = [];
    await pick('dashboard-county', '宜蘭縣');
    expect(container.textContent).toContain('這個地區沒有任務單');
    expect(state.requests.some(({ domain }) => domain === 'tickets')).toBe(
      false,
    );
    const stations = state.requests.filter(
      ({ domain }) => domain === 'stations',
    );
    expect(stations.length).toBeGreaterThan(0);
    // A new county drops the town picked under the old one.
    expect(
      stations.every(
        ({ query }) => query.county === '宜蘭縣' && query.town === undefined,
      ),
    ).toBe(true);

    const clear = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === '清除地區',
    );
    await act(async () => clear?.click());
    await settle();
    expect(container.textContent).not.toContain('這個地區沒有任務單');
    expect(select('dashboard-county')?.value).toBe('');
  });

  it("applies a section's status to its own counts and charts, not to the volunteer and 物資 numbers", async () => {
    await mount();
    state.requests = [];
    await pick('dashboard-tickets-status', 'pending');
    const tickets = state.requests.filter(({ domain }) => domain === 'tickets');
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every(({ query }) => query.status === 'pending')).toBe(true);
    // The volunteer and 物資 numbers do not take the status, so they are not asked again.
    expect(
      tickets.some(({ query }) => /^(volunteer|supply_)/.test(String(query.y))),
    ).toBe(false);
    expect(state.requests.some(({ domain }) => domain === 'stations')).toBe(
      false,
    );
  });

  it("restamps 更新於 when a section's own filter changes, as the filter card does", async () => {
    await mount();
    const clock = vi
      .spyOn(Date.prototype, 'toTimeString')
      .mockReturnValue('23:59:58 GMT+1100');
    try {
      await pick('dashboard-stations-status', 'open');
      expect(container.textContent).toContain('更新於 23:59:58');
    } finally {
      clock.mockRestore();
    }
  });

  it('applies the need type to the volunteer and 物資 numbers too', async () => {
    await mount();
    state.requests = [];
    await pick('dashboard-tickets-type', 'rescue');
    const volunteer = state.requests.filter(({ query }) =>
      /^(volunteer|supply_)/.test(String(query.y)),
    );
    expect(volunteer.map(({ query }) => query.y)).toContain('supply_needs');
    expect(volunteer.every(({ query }) => query.task_type === 'rescue')).toBe(
      true,
    );
  });
});
