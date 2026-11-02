'use client';

import { useState } from 'react';

import { Box, Stack, Typography } from '@mui/material';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import { ApiError } from '@rescue-frontend/data-access';
import {
  SILENT_ERROR_META,
  type AnalyticsChartFigure,
  stationAnalyticsChartQuery,
  ticketAnalyticsChartQuery,
} from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';

import { AnalyticsChart } from './analytics-chart';
import {
  CHART_TYPE_LABELS,
  chartQueryParams,
  knownOptions,
  hasChartData,
  X_LABELS,
  type ChartGranularity,
  type ChartType,
  type ChartXOption,
  type DashboardChart,
} from './charts';
import { FieldTag } from './field-tag';
import {
  kpiAvailability,
  type DashboardDateRange,
  type MetricSpec,
} from './kpis';
import { SegmentedControl } from './segmented-control';

const { color, typography, radius } = designTokens;

/**
 * Every panel is the same height: the design's rule is `size === "wide" ? 300 : 270`, and no chart in
 * it sets `size`, so the 300 branch never runs. Kept as one constant so that stays obvious.
 */
const CHART_HEIGHT = 270;

function chartQuery(
  chart: DashboardChart,
  view: { x: ChartXOption; chartType: ChartType },
  range: DashboardDateRange,
  granularity: ChartGranularity,
  timeZone: string,
) {
  const query = chartQueryParams(view, range, granularity, timeZone);
  return chart.domain === 'tickets'
    ? ticketAnalyticsChartQuery({ query: { ...query, y: chart.metric } })
    : stationAnalyticsChartQuery({ query: { ...query, y: chart.metric } });
}

/**
 * One chart card: title and plain-language description, the grouping and chart-type switches the
 * catalog allows for this metric, and the plot. Failures stay inside their own card.
 */
export function ChartPanel({
  chart,
  spec,
  catalogLoaded,
  range,
  granularity,
  timeZone,
  devMode,
  emptyPreview = false,
}: {
  chart: DashboardChart;
  spec: MetricSpec | undefined;
  catalogLoaded: boolean;
  range: DashboardDateRange;
  granularity: ChartGranularity;
  timeZone: string;
  devMode: boolean;
  emptyPreview?: boolean;
}) {
  const [x, setX] = useState<ChartXOption>(chart.x);
  const [chartType, setChartType] = useState<ChartType>(chart.chartType);
  const availability = kpiAvailability(spec, range);

  // useQueries for the same reason as the KPI cards: the ticket and station options differ in
  // their key type, so the union does not fit useQuery's overloads.
  const [query] = useQueries({
    queries: [
      {
        ...chartQuery(chart, { x, chartType }, range, granularity, timeZone),
        ...(emptyPreview
          ? {
              queryKey: [
                'admin',
                'analytics',
                'empty-preview',
                chart.domain,
                chart.metric,
              ],
              queryFn: async (): Promise<AnalyticsChartFigure> => ({
                data: [],
                layout: {},
                config: {},
              }),
            }
          : {}),
        enabled: catalogLoaded && availability.kind === 'ready',
        meta: { [SILENT_ERROR_META]: true },
      },
    ],
  }) as [UseQueryResult<AnalyticsChartFigure, Error>];

  const forbidden =
    query.error instanceof ApiError && query.error.status === 403;
  const title = spec?.label;
  const xOptions = knownOptions(spec?.allowed_x, X_LABELS);
  const chartTypeOptions = knownOptions(
    spec?.allowed_chart_types,
    CHART_TYPE_LABELS,
    spec?.default_chart_type,
  );

  // The plot keeps its slot while anything is pending, so the card never changes height: the state
  // is drawn over it instead of in place of it. A range the metric cannot be asked over reads as an
  // error here, the way the design draws it — there is a plot missing either way.
  let overlay: React.ReactNode = null;
  let figure: AnalyticsChartFigure | null = null;
  let overlayIsError = false;
  if (forbidden) {
    overlay = '沒有權限';
  } else if (availability.kind === 'needs-range') {
    overlay = availability.maxDays
      ? `請選擇 ${availability.maxDays} 天內的期間`
      : '請選擇統計期間';
    overlayIsError = true;
  } else if (query.isError) {
    overlay = '圖表載入失敗';
    overlayIsError = true;
  } else if (!query.data) {
    overlay = '載入中…';
  } else if (!hasChartData(query.data)) {
    overlay = '這段期間沒有資料';
  } else {
    figure = query.data;
  }

  return (
    <Box
      component="article"
      aria-label={title}
      sx={{
        // Below desktop the content column is too narrow to share: one chart per row.
        gridColumn: { mobile: '1 / -1', desktop: `span ${chart.span}` },
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Stack
        sx={{
          gap: '4px',
          // The design's own paddings: a touch more above the title than below the caption.
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Stack
          direction="row"
          sx={{ flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}
        >
          {/* The minimum width keeps a narrow card's switches wrapping below the title instead of
              squeezing it into a one-character column. */}
          <Typography
            component="h3"
            sx={{
              ...typography.label[500],
              color: color.fg.neutral.default,
              flex: 1,
              minWidth: 132,
            }}
          >
            {title}
          </Typography>
          {/* Both switches in one cluster so a card too narrow for them moves the pair down
              together, rather than leaving the first on the title's line and the second below it. */}
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
          >
            {xOptions.length > 1 ? (
              <SegmentedControl
                size="sm"
                label={`${title ?? ''}分組方式`}
                options={xOptions}
                value={x}
                onChange={setX}
              />
            ) : null}
            {chartTypeOptions.length > 1 ? (
              <SegmentedControl
                size="sm"
                label={`${title ?? ''}圖表類型`}
                options={chartTypeOptions}
                value={chartType}
                onChange={setChartType}
              />
            ) : null}
          </Stack>
        </Stack>
        <Typography
          sx={{
            ...typography.body[300],
            color: color.fg.neutral.muted,
            lineHeight: 1.5,
          }}
        >
          {spec?.description}
          {spec?.requires_date_range && spec.max_range_days ? (
            <>
              {'　'}
              <Box component="b" sx={{ color: color.fg.warning }}>
                一次最多查 {spec.max_range_days} 天
              </Box>
            </>
          ) : null}
          {devMode ? (
            <>
              {'　'}
              <FieldTag title="API 參數：y">y={chart.metric}</FieldTag>
            </>
          ) : null}
        </Typography>
      </Stack>
      <Box
        sx={{
          padding: '8px 6px 12px',
          position: 'relative',
          minHeight: CHART_HEIGHT,
        }}
      >
        <Box sx={{ minHeight: CHART_HEIGHT }}>
          {figure ? (
            <AnalyticsChart
              figure={figure}
              height={CHART_HEIGHT}
              label={`${title ?? ''}圖表`}
            />
          ) : null}
        </Box>
        {overlay ? (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              padding: '0 24px',
              ...typography.data[300],
              color: overlayIsError ? color.fg.danger : color.fg.neutral.muted,
              bgcolor: color.bg.neutral.default,
            }}
          >
            {overlay}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
