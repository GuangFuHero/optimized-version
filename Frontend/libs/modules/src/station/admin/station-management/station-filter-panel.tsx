'use client';

import { useTeams } from '@rescue-frontend/data-access/admin';
import { Card } from '@rescue-frontend/ui';

import { ChipRow } from '../../../admin/shared/chip-row';
import { STATION_TYPE_OPTIONS } from '../../type-options';
import { UNASSIGNED_TEAM, type StationFilters } from './model/station-filters';
import { OPERATIONAL_STATUS_OPTIONS } from '../../operational-status';

interface StationFilterPanelProps {
  filters: StationFilters;
  onChange: (filters: StationFilters) => void;
  canViewTeams: boolean;
  /** The 行政區 chips, from the loaded stations (see areaOptions). */
  areas: readonly string[];
  /** 成立 needs the disaster's start date; the row is hidden without one. */
  canFilterEstablished: boolean;
}

export function StationFilterPanel({
  filters,
  onChange,
  canViewTeams,
  areas,
  canFilterEstablished,
}: StationFilterPanelProps) {
  const teams = useTeams({ enabled: canViewTeams });
  const set = <K extends keyof StationFilters>(
    key: K,
    value: StationFilters[K],
  ) => onChange({ ...filters, [key]: value });
  // Keep a chosen area visible even after the loaded stations stop carrying it.
  const areaChoices =
    filters.area && !areas.includes(filters.area)
      ? [...areas, filters.area]
      : areas;

  // The prototype's panel is the design system's Card: 24 inside, border.default, shadow.md.
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
      {areaChoices.length > 0 ? (
        <ChipRow
          label="行政區"
          value={filters.area}
          options={areaChoices.map((a) => ({ value: a, label: a }))}
          onChange={(v) => set('area', v)}
        />
      ) : null}
      {canFilterEstablished ? (
        <ChipRow
          label="成立"
          value={filters.established}
          options={[
            { value: 'first_week' as const, label: '災後首週' },
            { value: 'later' as const, label: '首週之後' },
          ]}
          onChange={(v) => set('established', v)}
        />
      ) : null}
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
        label="指派 Team"
        value={filters.team}
        options={[
          ...(teams.data ?? []).map((t) => ({ value: t.uuid, label: t.name })),
          { value: UNASSIGNED_TEAM, label: '未指派' },
        ]}
        onChange={(v) => set('team', v)}
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
    </Card>
  );
}
