'use client';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { designTokens } from '@rescue-frontend/ui';

import { GRANULARITY_OPTIONS, type ChartGranularity } from './charts';
import type { areaChoices, DashboardArea } from './filter-query';
import {
  DASHBOARD_QUICK_RANGES,
  DASHBOARD_TIME_ZONES,
  isValidDateRange,
  localDateString,
  quickRangeDates,
  rangeLengthDays,
  rangeQuickRange,
  type DashboardDateRange,
  type DashboardQuickRange,
} from './kpis';
import { SegmentedControl } from './segmented-control';

const { color, radius, shadow, typography } = designTokens;

/** What the filter card owns: the four things every query on the page is asked within. */
export interface DashboardFilters {
  range: DashboardDateRange;
  granularity: ChartGranularity;
  /** Sent as the backend's `tz`; it moves where each day starts. */
  timeZone: string;
  area: DashboardArea;
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
 * A compact select with an "all" first. Once something is picked its border takes the accent, so a
 * filter in force shows from across the page.
 */
export function MiniSelect({
  id,
  label,
  allLabel,
  value,
  options,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  /** What the empty choice reads, e.g. 全部縣市. */
  allLabel: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: '8px' }}>
      <Typography
        component="label"
        htmlFor={id}
        sx={{
          ...caption,
          color: disabled ? color.fg.disable : color.fg.neutral.muted,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Box
        component="select"
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || undefined)}
        sx={{
          ...controlSx,
          minWidth: 0,
          maxWidth: '100%',
          borderColor: value ? color.bg.primary.default : color.border.default,
          '&:disabled': { color: color.fg.disable },
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Box>
    </Stack>
  );
}

/** The arrow between two levels of the area, read past by a screen reader. */
function AreaArrow() {
  return (
    <Typography aria-hidden sx={caption}>
      →
    </Typography>
  );
}

/**
 * The second row: 縣市 → 鄉鎮市區 → 村里, over the whole page. A level opens once the one above it
 * is picked, and 村里 shows only where the town has any, as most addresses name none.
 */
function AreaRow({
  area,
  choices,
  onChange,
}: {
  area: DashboardArea;
  choices: ReturnType<typeof areaChoices>;
  onChange: (next: DashboardArea) => void;
}) {
  const asOptions = (values: string[]) =>
    values.map((value) => ({ value, label: value }));
  const picked = Boolean(area.county || area.town || area.village);
  return (
    <Stack
      direction="row"
      sx={{
        flexBasis: '100%',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px 12px',
        paddingTop: '14px',
        borderTop: `1px solid ${color.border.default}`,
      }}
    >
      <Typography component="span" sx={{ ...caption, fontWeight: 700 }}>
        地區
        <Box component="span" sx={{ fontWeight: 400 }}>
          {' · '}整頁都套
        </Box>
      </Typography>
      <MiniSelect
        id="dashboard-county"
        label="縣市"
        allLabel="全部縣市"
        value={area.county}
        options={asOptions(choices.counties)}
        onChange={(county) => onChange({ county })}
      />
      <AreaArrow />
      <MiniSelect
        id="dashboard-town"
        label="鄉鎮市區"
        allLabel={area.county ? '全部鄉鎮市區' : '先選縣市'}
        value={area.town}
        options={asOptions(choices.towns)}
        disabled={!area.county}
        onChange={(town) => onChange({ county: area.county, town })}
      />
      {area.town && choices.villages.length > 0 ? (
        <>
          <AreaArrow />
          <MiniSelect
            id="dashboard-village"
            label="村里"
            allLabel="全部村里"
            value={area.village}
            options={asOptions(choices.villages)}
            onChange={(village) => onChange({ ...area, village })}
          />
        </>
      ) : null}
      {picked ? (
        <ButtonBase
          disableRipple
          onClick={() => onChange({})}
          sx={{
            ...typography.label[300],
            minHeight: 44,
            color: color.fg.neutral.default,
            textDecoration: 'underline',
          }}
        >
          清除地區
        </ButtonBase>
      ) : null}
      <Typography sx={{ ...caption, marginLeft: 'auto' }}>
        類型、狀態在各區塊標題右邊，只套那一區
      </Typography>
    </Stack>
  );
}

/**
 * The filter card above the dashboard. Everything here is real: the range, the zone, the bucket
 * size and the area drive the queries, and 重新整理 refetches. The design's API-hookup tools
 * (mock/real switch, base URL, bearer token) are not reproduced — this page always talks to our own
 * backend.
 */
export function DashboardFilterBar({
  value,
  areaOptions,
  dateProblem = null,
  onChange,
  syncedAt,
  devMode,
  onDevModeChange,
  onRefresh,
  emptyPreview = false,
  onEmptyPreviewChange,
}: {
  value: DashboardFilters;
  /** What the 地區 row offers for `value.area`, from `areaChoices`. */
  areaOptions: ReturnType<typeof areaChoices>;
  /** Why the dates on screen are not applied yet (`dateRangeProblem`), or null when they are. */
  dateProblem?: string | null;
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
  // A reversed range would read as e.g. "-4 天"; only a range the charts use gets a count.
  const days = isValidDateRange(range) ? rangeLengthDays(range) : null;
  const today = localDateString(new Date(), timeZone);

  const quick = rangeQuickRange(range, today);
  // A single day has one bucket, so a week would only repeat it.
  const singleDay = days === 1;

  const setRange = (next: Partial<DashboardDateRange>) =>
    onChange({ ...value, range: { ...range, ...next } });
  // 自定義 is where the switch lands whenever the dates match no shortcut, and picking it
  // deliberately does nothing: the dates themselves are the state.
  const pickQuick = (next: DashboardQuickRange) => {
    const dates = quickRangeDates(next, today);
    if (!dates) return;
    // 今日 has one day to show; 事件發生到今日 can run for weeks, so it starts on weeks.
    const nextGranularity =
      next === 'today' ? 'day' : next === 'all' ? 'week' : granularity;
    onChange({ ...value, range: dates, granularity: nextGranularity });
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
          value={quick}
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
            aria-invalid={dateProblem ? true : undefined}
            value={range.start_date ?? ''}
            // An emptied input means "no bound", not an empty string: the backend takes an absent
            // start as 事件發生到今日, but would 422 on "".
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
            aria-invalid={dateProblem ? true : undefined}
            value={range.end_date ?? ''}
            onChange={(event) =>
              setRange({ end_date: event.target.value || undefined })
            }
            sx={{ ...controlSx, flex: 1, width: { mobile: 0, tablet: 'auto' } }}
          />
        </Stack>
        {/* Polite, not an alert: it updates on every keystroke while a date is being typed. */}
        <Typography
          role="status"
          sx={{
            ...caption,
            color: color.fg.danger,
            display: dateProblem ? 'block' : 'none',
          }}
        >
          {dateProblem}
        </Typography>
      </FilterField>

      <FilterField label="每格代表">
        <SegmentedControl
          label="每格代表"
          options={GRANULARITY_OPTIONS.map((option) =>
            option.id === 'week' && singleDay
              ? { ...option, disabled: true, hint: '只看一天時沒有週可分' }
              : option,
          )}
          value={singleDay ? 'day' : granularity}
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

      <AreaRow
        area={value.area}
        choices={areaOptions}
        onChange={(area) => onChange({ ...value, area })}
      />
    </Stack>
  );
}
