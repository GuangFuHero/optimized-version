'use client';

import {
  ChevronDown,
  ChevronUp,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';

import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import {
  activeFilterCount,
  ADMIN_MAP_PRIORITIES,
  ADMIN_MAP_STATION_TYPES,
  ADMIN_MAP_STATUSES,
  DEFAULT_ADMIN_MAP_FILTERS,
  toggleValue,
  type AdminMapFilters,
} from '@rescue-frontend/modules';
import { designTokens } from '@rescue-frontend/ui';

const { color, radius, shadow, typography } = designTokens;

function Chip({
  on,
  dot,
  onClick,
  children,
}: {
  on: boolean;
  dot?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={on}
      sx={{
        gap: 0.625,
        px: 1.25,
        py: 0.5,
        borderRadius: `${radius.full}px`,
        border: `1px solid ${on ? color.brand.primary.default : color.border.default}`,
        bgcolor: on ? color.bg.primary.subtle : color.bg.neutral.default,
        ...typography.label[300],
        fontWeight: on ? 700 : 400,
        color: on ? color.fg.neutral.default : color.fg.neutral.subtle,
      }}
    >
      {dot ? (
        <Box
          sx={{
            width: 8,
            height: 8,
            flexShrink: 0,
            bgcolor: dot,
            borderRadius: '50% 50% 50% 0',
            transform: 'rotate(-45deg)',
          }}
        />
      ) : null}
      {children}
    </ButtonBase>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={0.75}>
      <Typography
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          color: color.fg.neutral.subtle,
        }}
      >
        {label}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {children}
      </Stack>
    </Stack>
  );
}

/**
 * 互助地圖's top left: how many tickets and stations the map shows, and a panel of filters behind
 * 篩選 (prototype `MapFilterBar`). The filters are a way of looking, not of choosing (MAP-ZD-128):
 * they change what the map draws and nothing else, which the bar says whenever they hide something.
 * The panel does not open while an area is being drawn (MAP-ZD-207).
 */
export function AdminMapFilterBar({
  filters,
  onChange,
  shownTickets,
  shownStations,
  isFiltered,
  disabled,
}: {
  filters: AdminMapFilters;
  onChange: (next: AdminMapFilters) => void;
  shownTickets: number;
  shownStations: number;
  /** Whether the map shows fewer than it has. */
  isFiltered: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(filters);
  const setLayer = (layer: keyof AdminMapFilters['layers']) =>
    onChange({
      ...filters,
      layers: { ...filters.layers, [layer]: !filters.layers[layer] },
    });
  const set = (
    key: 'priorities' | 'statuses' | 'stationTypes',
    value: string,
  ) => onChange({ ...filters, [key]: toggleValue(filters[key], value) });

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <Box
      sx={{
        width: open ? 344 : 'auto',
        maxWidth: 'calc(100vw - 56px)',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.subtle,
        boxShadow: shadow.md,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        spacing={1.125}
        sx={{ alignItems: 'center', px: 1.5, py: 1 }}
      >
        <Box
          component={MapPin}
          sx={{
            width: 15,
            height: 15,
            color: color.fg.neutral.muted,
            flexShrink: 0,
          }}
        />
        <Typography sx={{ ...typography.body[300], whiteSpace: 'nowrap' }}>
          {filters.layers.tickets ? `${shownTickets} 張任務單` : '任務單已隱藏'}
        </Typography>
        <Typography sx={{ color: color.border.default }}>·</Typography>
        <Typography sx={{ ...typography.body[300], whiteSpace: 'nowrap' }}>
          {filters.layers.stations ? `${shownStations} 個站點` : '站點已隱藏'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {active > 0 ? (
          <ButtonBase
            onClick={() =>
              onChange({ ...DEFAULT_ADMIN_MAP_FILTERS, layers: filters.layers })
            }
            sx={{
              ...typography.label[300],
              textDecoration: 'underline',
              color: color.fg.neutral.subtle,
            }}
          >
            清除
          </ButtonBase>
        ) : null}
        <ButtonBase
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          aria-expanded={open}
          sx={{
            gap: 0.5,
            ...typography.label[300],
            fontWeight: 700,
            color:
              active > 0 ? color.brand.primary.subtle : color.fg.neutral.subtle,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          <Box component={SlidersHorizontal} sx={{ width: 15, height: 15 }} />
          篩選{active > 0 ? ` ${active}` : ''}
          <Box
            component={open ? ChevronUp : ChevronDown}
            sx={{ width: 13, height: 13 }}
          />
        </ButtonBase>
      </Stack>
      {isFiltered ? (
        <Box
          sx={{
            px: 1.5,
            py: 0.75,
            bgcolor: color.bg.warning.subtle,
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          <Typography
            sx={{
              ...typography.label[300],
              lineHeight: 1.6,
              color: color.fg.neutral.subtle,
            }}
          >
            篩選只影響<b>看到什麼</b>。區域清單與區域裡的數量一律算全部。
          </Typography>
        </Box>
      ) : null}
      {open ? (
        <Stack
          spacing={1.75}
          sx={{
            p: 1.5,
            maxHeight: 420,
            overflowY: 'auto',
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          <Row label="圖層">
            {(
              [
                ['tickets', '任務單'],
                ['stations', '資源站點'],
                ['areas', '區域'],
              ] as const
            ).map(([layer, label]) => (
              <Chip
                key={layer}
                on={filters.layers[layer]}
                onClick={() => setLayer(layer)}
              >
                {label}
              </Chip>
            ))}
          </Row>
          <Row label="任務單 · 優先級">
            {ADMIN_MAP_PRIORITIES.map((priority) => (
              <Chip
                key={priority.value}
                dot={priority.color}
                on={filters.priorities.includes(priority.value)}
                onClick={() => set('priorities', priority.value)}
              >
                {priority.label}
              </Chip>
            ))}
          </Row>
          <Row label="任務單 · 狀態">
            {ADMIN_MAP_STATUSES.map((status) => (
              <Chip
                key={status.value}
                on={filters.statuses.includes(status.value)}
                onClick={() => set('statuses', status.value)}
              >
                {status.label}
              </Chip>
            ))}
          </Row>
          <Row label="資源站點 · 用途">
            {ADMIN_MAP_STATION_TYPES.map((type) => (
              <Chip
                key={type.value}
                on={filters.stationTypes.includes(type.value)}
                onClick={() => set('stationTypes', type.value)}
              >
                {type.label}
              </Chip>
            ))}
          </Row>
          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => onChange(DEFAULT_ADMIN_MAP_FILTERS)}
            >
              全部清除
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Box>
  );
}
