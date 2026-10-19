'use client';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';

import { GRANULARITY_OPTIONS, type ChartGranularity } from './charts';
import {
  addDays,
  DASHBOARD_QUICK_RANGES,
  DASHBOARD_TIME_ZONES,
  localDateString,
  rangeLengthDays,
  rangeQuickDays,
  type DashboardDateRange,
} from './kpis';
import { SegmentedControl } from './segmented-control';

const { color, radius, shadow, typography } = designTokens;

/** What the filter card owns: the three things every query on the page is asked within. */
export interface DashboardFilters {
  range: DashboardDateRange;
  granularity: ChartGranularity;
  /** Sent as the backend's `tz`; it moves where each day starts. */
  timeZone: string;
}

/** The design's field caption: 14px muted, the field name carrying the weight. */
const caption = { ...typography.body[300], color: color.fg.neutral.muted };

/** Shared by the two date inputs and the zone select. */
const controlSx = {
  ...typography.data[300],
  minWidth: { mobile: 0, tablet: 132 },
  minHeight: 44,
  fontSize: { mobile: 16, tablet: 14 },
  boxSizing: 'border-box',
  padding: '7px 10px',
  borderRadius: `${radius.sm}px`,
  border: `1px solid ${color.border.default}`,
  bgcolor: color.bg.neutral.default,
  color: color.fg.neutral.default,
};

/**
 * One labelled field. `htmlFor` ties the caption to its control; the segmented fields have no
 * single control to point at, so they name themselves (`SegmentedControl`'s own `aria-label`)
 * and the caption stays a plain span.
 */
function FilterField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack
      sx={{
        gap: '4px',
        minWidth: 0,
        maxWidth: '100%',
        flex: htmlFor ? undefined : { mobile: '1 1 100%', tablet: '0 1 auto' },
      }}
    >
      <Typography
        component={htmlFor ? 'label' : 'span'}
        htmlFor={htmlFor}
        sx={{ ...caption, fontWeight: 700 }}
      >
        {label}
        {hint ? (
          <Box component="span" sx={{ fontWeight: 400 }}>
            {' · '}
            {hint}
          </Box>
        ) : null}
      </Typography>
      {children}
    </Stack>
  );
}

/**
 * The filter card above the dashboard. Everything here is real: the range, the zone and the bucket
 * size drive the queries, and 重新整理 refetches. The design's API-hookup tools (mock/real switch,
 * base URL, bearer token) are not reproduced — this page always talks to our own backend.
 */
export function DashboardFilterBar({
  value,
  onChange,
  syncedAt,
  devMode,
  onDevModeChange,
  onRefresh,
  emptyPreview = false,
  onEmptyPreviewChange,
}: {
  value: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  /** `HH:MM:SS` of the last successful refresh, or null before the first one. */
  syncedAt: string | null;
  devMode: boolean;
  onDevModeChange: (on: boolean) => void;
  onRefresh: () => void;
  emptyPreview?: boolean;
  onEmptyPreviewChange?: (empty: boolean) => void;
}) {
  const { range, granularity, timeZone } = value;
  const days = rangeLengthDays(range);
  const today = localDateString(new Date(), timeZone);

  const setRange = (next: Partial<DashboardDateRange>) =>
    onChange({ ...value, range: { ...range, ...next } });
  // 自訂 (0) is where the switch lands whenever the dates match neither shortcut, and picking it
  // deliberately does nothing — the dates themselves are the state.
  const pickQuick = (quickDays: number) => {
    if (!quickDays) return;
    setRange({ start_date: addDays(today, -(quickDays - 1)), end_date: today });
  };

  return (
    <Stack
      component="section"
      aria-label="統計條件"
      direction="row"
      sx={{
        // The design's own spacing: 14px between wrapped rows, 18px between fields.
        gap: '14px 18px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        padding: '14px 18px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
        boxShadow: shadow.sm,
      }}
    >
      <FilterField
        label="看多久"
        hint={days === null ? undefined : `${days} 天`}
      >
        <SegmentedControl
          label="看多久"
          options={DASHBOARD_QUICK_RANGES}
          value={rangeQuickDays(range)}
          onChange={pickQuick}
        />
      </FilterField>

      <FilterField label="起訖日期">
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: '6px', width: '100%' }}
        >
          <Box
            component="input"
            type="date"
            aria-label="起日"
            value={range.start_date ?? ''}
            // An emptied input means "no bound", not an empty string: the backend takes an absent
            // date as open-ended, but would 422 on "".
            onChange={(event) =>
              setRange({ start_date: event.target.value || undefined })
            }
            sx={{ ...controlSx, flex: 1, width: { mobile: 0, tablet: 'auto' } }}
          />
          <Typography aria-hidden sx={caption}>
            →
          </Typography>
          <Box
            component="input"
            type="date"
            aria-label="訖日"
            value={range.end_date ?? ''}
            onChange={(event) =>
              setRange({ end_date: event.target.value || undefined })
            }
            sx={{ ...controlSx, flex: 1, width: { mobile: 0, tablet: 'auto' } }}
          />
        </Stack>
      </FilterField>

      <FilterField label="每格代表">
        <SegmentedControl
          label="每格代表"
          options={GRANULARITY_OPTIONS}
          value={granularity}
          onChange={(next) => onChange({ ...value, granularity: next })}
        />
      </FilterField>

      <FilterField
        label="時區"
        hint="影響每天從幾點算起"
        htmlFor="dashboard-tz"
      >
        <Box
          component="select"
          id="dashboard-tz"
          value={timeZone}
          onChange={(event) =>
            onChange({ ...value, timeZone: event.target.value })
          }
          sx={controlSx}
        >
          {DASHBOARD_TIME_ZONES.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </Box>
      </FilterField>

      <Stack
        direction="row"
        sx={{
          marginLeft: 'auto',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          maxWidth: '100%',
        }}
      >
        {syncedAt ? (
          <Typography sx={caption}>更新於 {syncedAt}</Typography>
        ) : null}
        <Stack
          component="label"
          direction="row"
          title="在每張卡片與圖表後面加上對應的後端欄位名，對接 API 時用"
          sx={{
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          <Box
            component="input"
            type="checkbox"
            checked={devMode}
            onChange={(event) => onDevModeChange(event.target.checked)}
            sx={{ accentColor: color.bg.primary.default, m: 0 }}
          />
          <Typography sx={caption}>顯示欄位名</Typography>
        </Stack>
        {process.env.NODE_ENV !== 'production' && onEmptyPreviewChange ? (
          <ButtonBase
            aria-pressed={emptyPreview}
            onClick={() => onEmptyPreviewChange(!emptyPreview)}
            sx={{
              ...typography.label[400],
              height: 44,
              px: '16px',
              borderRadius: `${radius.full}px`,
              border: `1px solid ${color.border.default}`,
              color: color.fg.neutral.default,
              bgcolor: emptyPreview
                ? color.bg.primary.subtle
                : color.bg.neutral.default,
              whiteSpace: 'nowrap',
            }}
          >
            {emptyPreview ? '返回真實資料' : '測試完全無資料'}
          </ButtonBase>
        ) : null}
        <ButtonBase
          disableRipple
          onClick={onRefresh}
          sx={{
            ...typography.label[500],
            height: 44,
            px: '20px',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.default,
            color: color.fg.onPrimary,
            boxShadow: shadow.sm,
            whiteSpace: 'nowrap',
            '&:hover': { bgcolor: color.bg.primary.hover },
          }}
        >
          重新整理
        </ButtonBase>
      </Stack>
    </Stack>
  );
}
