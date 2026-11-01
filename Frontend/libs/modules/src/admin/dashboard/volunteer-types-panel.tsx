'use client';

import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import { ApiError } from '@rescue-frontend/data-access';
import {
  SILENT_ERROR_META,
  type AnalyticsChartFigure,
  ticketAnalyticsChartQuery,
} from '@rescue-frontend/data-access/admin';

import { ChartCard } from './chart-panel';
import {
  groupedBarFigure,
  hasChartData,
  VOLUNTEER_TYPE_SERIES,
} from './charts';
import { FieldTag } from './field-tag';
import type { AnalyticsCatalog, DashboardDateRange } from './kpis';
import { ACCENT_COLORS } from './tones';

/**
 * 各需求類型：需求／已媒合／缺口 — which need type is shortest of people, so a call for volunteers
 * names it first. The backend draws one metric per figure, so the three are asked for by type and
 * put side by side here; like the cards, they stand at the end of the range.
 */
export function VolunteerTypesPanel({
  catalog,
  range,
  timeZone,
  asOfCaption,
  devMode,
  emptyPreview,
}: {
  catalog: AnalyticsCatalog | undefined;
  range: DashboardDateRange;
  timeZone: string;
  /** From `rangeAsOfCaption`, e.g. 截至今日. */
  asOfCaption: string;
  devMode: boolean;
  emptyPreview: boolean;
}) {
  const queries = useQueries({
    queries: VOLUNTEER_TYPE_SERIES.map(({ metric }) => ({
      ...ticketAnalyticsChartQuery({
        query: {
          end_date: range.end_date,
          tz: timeZone,
          x: 'category',
          chart_type: 'bar',
          y: metric,
        },
      }),
      ...(emptyPreview
        ? {
            queryKey: ['admin', 'analytics', 'empty-preview', metric, 'type'],
            queryFn: async (): Promise<AnalyticsChartFigure> => ({
              data: [],
              layout: {},
              config: {},
            }),
          }
        : {}),
      enabled: catalog !== undefined,
      meta: { [SILENT_ERROR_META]: true },
    })),
  }) as UseQueryResult<AnalyticsChartFigure, Error>[];

  let overlay: React.ReactNode = null;
  let overlayIsError = false;
  let figure: AnalyticsChartFigure | null = null;
  if (
    queries.some(
      (query) => query.error instanceof ApiError && query.error.status === 403,
    )
  ) {
    overlay = '沒有權限';
  } else if (queries.some((query) => query.isError)) {
    overlay = '圖表載入失敗';
    overlayIsError = true;
  } else if (queries.some((query) => !query.data)) {
    overlay = '載入中…';
  } else {
    const merged = groupedBarFigure(
      VOLUNTEER_TYPE_SERIES.map(({ metric, tone }, index) => ({
        figure: queries[index].data as AnalyticsChartFigure,
        name: catalog?.tickets[metric]?.label ?? metric,
        color: ACCENT_COLORS[tone],
      })),
    );
    if (hasChartData(merged)) figure = merged;
    else overlay = '沒有資料';
  }

  return (
    <ChartCard
      title="各需求類型：需求／已媒合／缺口"
      span={12}
      figure={figure}
      overlay={overlay}
      overlayIsError={overlayIsError}
      description={
        <>
          （{asOfCaption}）哪一類最缺人，招募訊息就先寫那一類
          {devMode ? (
            <>
              {'　'}
              <FieldTag title="API 參數：y、x">
                y={VOLUNTEER_TYPE_SERIES.map(({ metric }) => metric).join(',')}{' '}
                x=category
              </FieldTag>
            </>
          ) : null}
        </>
      }
    />
  );
}
