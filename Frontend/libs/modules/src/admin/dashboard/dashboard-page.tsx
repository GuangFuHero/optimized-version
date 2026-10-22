'use client';

import { useEffect, useState } from 'react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import {
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Package,
  type LucideIcon,
} from 'lucide-react';

import { ApiError } from '@rescue-frontend/data-access';
import {
  SILENT_ERROR_META,
  stationAnalyticsValueQuery,
  ticketAnalyticsValueQuery,
  useAnalyticsCatalog,
} from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';

import { ChartPanel } from './chart-panel';
import {
  STATION_CHARTS,
  TICKET_CHARTS,
  TICKET_DETAIL_CHARTS,
  type ChartGranularity,
  type DashboardChart,
} from './charts';
import { FieldTag } from './field-tag';
import { DashboardFilterBar, type DashboardFilters } from './filters';
import {
  applyFilterChange,
  DASHBOARD_KPIS,
  DASHBOARD_TIME_ZONE,
  dateRangeProblem,
  DEFAULT_LOOKBACK_DAYS,
  formatKpiValue,
  kpiAvailability,
  lookbackRange,
  type AnalyticsCatalog,
  type DashboardDateRange,
  type DashboardKpi,
  type DashboardKpiAccent,
  type KpiAvailability,
  type MetricSpec,
} from './kpis';

const { color, typography, radius, shadow } = designTokens;

const sameFilters = (a: DashboardFilters, b: DashboardFilters) =>
  a.range.start_date === b.range.start_date &&
  a.range.end_date === b.range.end_date &&
  a.granularity === b.granularity &&
  a.timeZone === b.timeZone;

type ValueQuery = UseQueryResult<{ value: number }, Error>;

/** The KPI card's left bar, by token role — `kpis.ts` names the role, this file resolves it. */
const ACCENT_COLORS: Record<DashboardKpiAccent, string> = {
  primary: color.bg.primary.default,
  secondary: color.bg.secondary.default,
  success: color.bg.success.default,
  warning: color.bg.warning.default,
  muted: color.fg.neutral.muted,
};

/** The design's `wg-caption`: 14px muted, the muted tone carrying the contrast. */
const caption = { ...typography.body[300], color: color.fg.neutral.muted };

const stamp = () => new Date().toTimeString().slice(0, 8);

/** Permission failures are displayed within their card or section. */
function isForbidden(query: ValueQuery) {
  return query.error instanceof ApiError && query.error.status === 403;
}

function kpiValueQuery(
  kpi: DashboardKpi,
  range: DashboardDateRange,
  timeZone: string,
) {
  const query = { ...range, tz: timeZone };
  return kpi.domain === 'tickets'
    ? ticketAnalyticsValueQuery({ query: { ...query, y: kpi.metric } })
    : stationAnalyticsValueQuery({ query: { ...query, y: kpi.metric } });
}

/**
 * The number itself, split from its unit so the two can be styled apart. Everything the design
 * distinguishes is distinguished here: `…` while the value is in flight, a red 讀取失敗 with the
 * message on `title` when it failed.
 */
function KpiValue({
  spec,
  availability,
  query,
}: {
  spec: MetricSpec | undefined;
  availability: KpiAvailability;
  query: ValueQuery;
}) {
  if (isForbidden(query)) {
    return <Typography sx={caption}>沒有權限</Typography>;
  }
  if (availability.kind === 'needs-range') {
    return (
      <Typography sx={caption}>
        {availability.maxDays
          ? `請選擇 ${availability.maxDays} 天內的期間`
          : '請選擇統計期間'}
      </Typography>
    );
  }
  if (query.isError) {
    return (
      <Typography
        title={query.error?.message}
        sx={{ ...typography.data[300], fontSize: 14, color: color.fg.danger }}
      >
        讀取失敗
      </Typography>
    );
  }
  const value = query.data?.value;
  if (!spec || value === undefined) {
    return (
      <Typography sx={{ ...caption, fontSize: 20 }} aria-hidden>
        …
      </Typography>
    );
  }
  const formatted = formatKpiValue(value, spec.unit);
  return (
    <>
      {formatted.value}
      <Box
        component="small"
        sx={{
          fontSize: 15,
          marginLeft: '2px',
          color: color.fg.neutral.muted,
        }}
      >
        {formatted.unit}
      </Box>
    </>
  );
}

function KpiCard({
  kpi,
  spec,
  availability,
  query,
  devMode,
}: {
  kpi: DashboardKpi;
  spec: MetricSpec | undefined;
  availability: KpiAvailability;
  query: ValueQuery;
  devMode: boolean;
}) {
  return (
    <Box
      component="article"
      aria-label={spec?.label ?? kpi.metric}
      title={spec?.description}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        // The design's own values; 14px is not a rung on our spacing scale.
        padding: '14px 16px',
        position: 'relative',
        // Clips the accent bar to the card's rounded corner.
        overflow: 'hidden',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        // The one card the design wants read first carries the accent outline instead.
        borderColor: kpi.emphasis ? color.border.accent : color.border.default,
        bgcolor: color.bg.neutral.default,
        boxShadow: shadow.sm,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: ACCENT_COLORS[kpi.accent],
        }}
      />
      <Typography
        sx={{ ...typography.label[400], color: color.fg.neutral.default }}
      >
        {spec?.label}
      </Typography>
      <Typography
        component="div"
        sx={{
          ...typography.data[500],
          fontSize: 30,
          lineHeight: 1.15,
          letterSpacing: '-.02em',
          color: color.fg.neutral.default,
          // The digits keep one width as the values change.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <KpiValue spec={spec} availability={availability} query={query} />
      </Typography>
      {spec?.description ? (
        <Typography sx={{ ...caption, lineHeight: 1.4 }}>
          {spec.description}
        </Typography>
      ) : null}
      {devMode ? <FieldTag title="API 參數：y">y={kpi.metric}</FieldTag> : null}
    </Box>
  );
}

/**
 * The design lays the cards out in one row of fixed tracks — six for the ticket row, four for the
 * single station card, which is how the station count keeps a ticket card's width. At phone width
 * six tracks would be a 66px column, so it drops to two (three on a tablet) and the numbers stay
 * readable, which is the point of the row.
 */
function KpiGrid({
  columns,
  children,
}: {
  /** Tracks on desktop, as the design counts them. */
  columns: number;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: '14px',
        gridTemplateColumns: {
          mobile: 'repeat(2, minmax(0, 1fr))',
          tablet: 'repeat(3, minmax(0, 1fr))',
          desktop: `repeat(${columns}, minmax(0, 1fr))`,
        },
      }}
    >
      {children}
    </Box>
  );
}

function ChartGrid({
  charts,
  catalog,
  range,
  granularity,
  timeZone,
  devMode,
  emptyPreview,
}: {
  charts: readonly DashboardChart[];
  catalog: AnalyticsCatalog | undefined;
  range: DashboardDateRange;
  granularity: ChartGranularity;
  timeZone: string;
  devMode: boolean;
  emptyPreview: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
      }}
    >
      {charts.map((chart) => (
        <ChartPanel
          key={`${chart.domain}.${chart.metric}`}
          chart={chart}
          spec={catalog?.[chart.domain][chart.metric]}
          catalogLoaded={catalog !== undefined}
          range={range}
          granularity={granularity}
          timeZone={timeZone}
          devMode={devMode}
          emptyPreview={emptyPreview}
        />
      ))}
    </Box>
  );
}

/**
 * Tickets and stations each get their own section: the design review found one mixed KPI row the
 * hardest part to read, and the two counts are not comparable. The rule on the right is what makes
 * the change of subject visible at a glance.
 */
function DomainSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Stack component="section" aria-label={title} sx={{ gap: '14px' }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: '10px', paddingTop: '6px' }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radius.sm}px`,
            bgcolor: color.bg.primary.subtle,
            // The design colours the glyph with the *background* token rather than a foreground
            // one. It renders a mid orange on the subtle fill, so it is left as it is.
            color: color.bg.primary.default,
          }}
        >
          <Icon size={17} aria-hidden />
        </Box>
        <Box>
          <Typography
            component="h2"
            sx={{
              ...typography.heading[600],
              fontSize: 17,
              color: color.fg.neutral.default,
            }}
          >
            {title}
          </Typography>
          <Typography sx={caption}>{description}</Typography>
        </Box>
        <Box
          aria-hidden
          sx={{
            flex: 1,
            height: '1px',
            bgcolor: color.border.default,
            marginLeft: '6px',
          }}
        />
      </Stack>
      {children}
    </Stack>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  // What the filter card shows, and what the queries use: an invalid date edit keeps the last
  // valid range in `applied` (see `applyFilterChange`).
  const [filters, setFilters] = useState<DashboardFilters>(() => ({
    range: lookbackRange(
      new Date(),
      DASHBOARD_TIME_ZONE,
      DEFAULT_LOOKBACK_DAYS,
    ),
    granularity: 'day',
    timeZone: DASHBOARD_TIME_ZONE,
  }));
  const [applied, setApplied] = useState(filters);
  const [devMode, setDevMode] = useState(false);
  const previewEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_DASHBOARD_EMPTY_PREVIEW === 'true';
  const [previewRequested, setEmptyPreview] = useState(false);
  const emptyPreview = previewEnabled && previewRequested;
  // Null on the first paint, then stamped on mount: the clock reads differently on the server and
  // on the client, so stamping during render is a hydration mismatch.
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setSyncedAt(stamp());
  }, []);

  const { range, granularity, timeZone } = applied;

  const changeFilters = (next: DashboardFilters) => {
    setFilters(next);
    const nextApplied = applyFilterChange(applied, next);
    if (!sameFilters(nextApplied, applied)) {
      setApplied(nextApplied);
      setSyncedAt(stamp());
    }
  };

  const refresh = async () => {
    setApplied(applyFilterChange(applied, filters));
    await queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] });
    setSyncedAt(stamp());
  };

  const catalogQuery = useAnalyticsCatalog();
  const catalog = catalogQuery.data;

  const cards = DASHBOARD_KPIS.map((kpi) => {
    const spec = catalog?.[kpi.domain][kpi.metric];
    return { kpi, spec, availability: kpiAvailability(spec, range) };
  });

  const valueQueries = useQueries({
    queries: cards.map(({ kpi, availability }) => ({
      ...kpiValueQuery(kpi, range, timeZone),
      ...(emptyPreview
        ? {
            queryKey: [
              'admin',
              'analytics',
              'empty-preview',
              kpi.domain,
              kpi.metric,
              'value',
            ],
            queryFn: async () => ({ value: 0 }),
          }
        : {}),
      enabled: catalog !== undefined && availability.kind === 'ready',
      // Each card handles its own failure — a role without ticket.view would
      // otherwise get one toast per ticket card.
      meta: { [SILENT_ERROR_META]: true },
    })),
  }) as ValueQuery[];

  const cardsWithQuery = cards.map((card, index) => ({
    ...card,
    query: valueQueries[index],
  }));
  // Forbidden domains retain their headings and show a permission message.
  const domainCards = (domain: DashboardKpi['domain']) => {
    const all = cardsWithQuery.filter((card) => card.kpi.domain === domain);
    return {
      visible: all,
      forbidden: all.every((card) => isForbidden(card.query)),
    };
  };
  const tickets = domainCards('tickets');
  const stations = domainCards('stations');

  const renderKpis = (visible: typeof cardsWithQuery, columns: number) => (
    <KpiGrid columns={columns}>
      {visible.map((card) => (
        <KpiCard
          key={`${card.kpi.domain}.${card.kpi.metric}`}
          {...card}
          devMode={devMode}
        />
      ))}
    </KpiGrid>
  );

  return (
    <Stack
      component="section"
      aria-label="總覽指標"
      sx={{
        // 22px is the design's own section rhythm; our scale has no rung between 16 and 24.
        gap: '22px',
        p: {
          mobile: '16px',
          tablet: '24px',
          desktop: '32px',
        },
      }}
    >
      <DashboardFilterBar
        value={filters}
        dateProblem={dateRangeProblem(filters.range, applied.range)}
        onChange={changeFilters}
        syncedAt={syncedAt}
        devMode={devMode}
        onDevModeChange={setDevMode}
        onRefresh={() => void refresh()}
        emptyPreview={emptyPreview}
        onEmptyPreviewChange={previewEnabled ? setEmptyPreview : undefined}
      />

      {emptyPreview ? (
        <Typography role="status" sx={caption}>
          目前為無資料預覽：所有指標為
          0、圖表為空，未更動實際資料。按「返回真實資料」即可還原。
        </Typography>
      ) : null}

      {catalogQuery.isError ? (
        <Stack direction="row" sx={{ alignItems: 'center', gap: '8px' }}>
          <Typography sx={caption}>指標清單載入失敗。</Typography>
          <ButtonBase
            disableRipple
            onClick={() => void refresh()}
            sx={{ color: color.fg.info, ...typography.label[400] }}
          >
            重試
          </ButtonBase>
        </Stack>
      ) : (
        <>
          <DomainSection
            icon={ClipboardList}
            title="任務單"
            description="民眾與各單位回報的求助案件。這一區全部只講任務單，不含資源站點。"
          >
            {tickets.forbidden ? (
              <Typography role="status" sx={caption}>
                你沒有檢視任務單的權限。
              </Typography>
            ) : (
              <>
                {renderKpis(tickets.visible, 6)}
                <ChartGrid
                  charts={TICKET_CHARTS}
                  catalog={catalog}
                  range={range}
                  granularity={granularity}
                  timeZone={timeZone}
                  devMode={devMode}
                  emptyPreview={emptyPreview}
                />
                <Box>
                  <ButtonBase
                    disableRipple
                    aria-expanded={showDetails}
                    onClick={() => setShowDetails((open) => !open)}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      minHeight: 44,
                      textAlign: 'left',
                      borderRadius: `${radius.full}px`,
                      border: `1px solid ${color.border.default}`,
                      bgcolor: color.bg.neutral.default,
                      color: color.fg.neutral.subtle,
                      cursor: 'pointer',
                      ...typography.label[300],
                    }}
                  >
                    {showDetails ? (
                      <ChevronUp size={15} aria-hidden />
                    ) : (
                      <ChevronDown size={15} aria-hidden />
                    )}
                    {showDetails
                      ? '收起細部分析'
                      : '展開細部分析（完成率、等待時間、處理耗時、重複單）'}
                  </ButtonBase>
                </Box>
                {showDetails ? (
                  <ChartGrid
                    charts={TICKET_DETAIL_CHARTS}
                    catalog={catalog}
                    range={range}
                    granularity={granularity}
                    timeZone={timeZone}
                    devMode={devMode}
                    emptyPreview={emptyPreview}
                  />
                ) : null}
              </>
            )}
          </DomainSection>
          <DomainSection
            icon={Package}
            title="資源站點"
            description="物資站、醫療站等實體據點。與上方任務單是兩回事，數字不要互相比較。"
          >
            {stations.forbidden ? (
              <Typography role="status" sx={caption}>
                你沒有檢視資源站點的權限。
              </Typography>
            ) : (
              <>
                {/* Four tracks for one card: the design keeps the station count the size of a ticket
                  card instead of stretching it across the row. */}
                {renderKpis(stations.visible, 4)}
                <ChartGrid
                  charts={STATION_CHARTS}
                  catalog={catalog}
                  range={range}
                  granularity={granularity}
                  timeZone={timeZone}
                  devMode={devMode}
                  emptyPreview={emptyPreview}
                />
              </>
            )}
          </DomainSection>
        </>
      )}
    </Stack>
  );
}
