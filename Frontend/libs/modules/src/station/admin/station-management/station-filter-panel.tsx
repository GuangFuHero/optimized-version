'use client';

import { Box, Chip, Typography } from '@mui/material';
import { useTeams } from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';

import { STATION_TYPE_OPTIONS } from '../../type-options';
import { UNASSIGNED_TEAM, type StationFilters } from './model/station-filters';
import { OPERATIONAL_STATUS_OPTIONS } from '../../operational-status';

const { color, typography } = designTokens;

interface StationFilterPanelProps {
  filters: StationFilters;
  onChange: (filters: StationFilters) => void;
  canViewTeams: boolean;
}

export function StationFilterPanel({
  filters,
  onChange,
  canViewTeams,
}: StationFilterPanelProps) {
  const teams = useTeams({ enabled: canViewTeams });
  const set = <K extends keyof StationFilters>(
    key: K,
    value: StationFilters[K],
  ) => onChange({ ...filters, [key]: value });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        p: '14px 16px',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${designTokens.radius.md}px`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <ChipRow
        label="類型"
        value={filters.type}
        options={STATION_TYPE_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        onChange={(v) => set('type', v)}
      />
      <ChipRow
        label="營運狀態"
        value={filters.status}
        options={OPERATIONAL_STATUS_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        onChange={(v) => set('status', v)}
      />
      <ChipRow
        label="指派 Team"
        value={filters.team}
        options={[
          { value: UNASSIGNED_TEAM, label: '未指派' },
          ...(teams.data ?? []).map((t) => ({ value: t.uuid, label: t.name })),
        ]}
        onChange={(v) => set('team', v)}
      />
      <ChipRow
        label="官方認定"
        value={filters.official}
        options={[
          { value: 'yes' as const, label: '官方' },
          { value: 'no' as const, label: '非官方' },
        ]}
        onChange={(v) => set('official', v)}
      />
      <ChipRow
        label="更新"
        value={filters.freshness}
        options={[
          { value: 'fresh' as const, label: '24 小時內' },
          { value: 'stale' as const, label: '超過 24 小時' },
          { value: 'expired' as const, label: '超過 72 小時' },
        ]}
        onChange={(v) => set('freshness', v)}
      />
    </Box>
  );
}

function ChipRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
      <Typography
        sx={{
          ...typography.label[400],
          color: color.fg.neutral.muted,
          width: 72,
          flexShrink: 0,
          pt: '6px',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {[{ value: null, label: '全部' }, ...options].map((option) => {
          const selected = option.value === value;
          return (
            <Chip
              key={option.value ?? '__all__'}
              label={option.label}
              size="small"
              clickable
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => onChange(option.value as T | null)}
            />
          );
        })}
      </Box>
    </Box>
  );
}
