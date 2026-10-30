'use client';

import { Box } from '@mui/material';
import { useDisasterTypes } from '@rescue-frontend/data-access/admin';
import { designTokens } from '@rescue-frontend/ui';

import { ChipRow } from '../../../admin/shared/chip-row';
import { TICKET_STATUS_OPTIONS } from '../../status';
import { ticketPriorityLabel } from './model/ticket-detail-view';
import { NEED_FILTER_TYPES, type TicketFilters } from './model/ticket-filters';
import {
  AUDIT_BADGES,
  needTypeLabel,
  TICKET_PRIORITIES,
  type AuditStatus,
  type TicketPriority,
} from './model/ticket-row';

const { color, radius, shadow } = designTokens;

const PRIORITY_OPTIONS: readonly { value: TicketPriority; label: string }[] =
  TICKET_PRIORITIES.map((value) => ({
    value,
    label: ticketPriorityLabel(value),
  }));

const NEED_OPTIONS = NEED_FILTER_TYPES.map((value) => ({
  value: value as string,
  label: needTypeLabel(value),
}));

const AUDIT_OPTIONS = (Object.keys(AUDIT_BADGES) as AuditStatus[]).map(
  (value) => ({ value, label: AUDIT_BADGES[value].label }),
);

interface TicketFilterPanelProps {
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}

export function TicketFilterPanel({
  filters,
  onChange,
}: TicketFilterPanelProps) {
  // Active types only: listing retired ones needs project.edit, which a team admin lacks.
  const disasterTypes = useDisasterTypes({ includeInactive: false });
  const set = <K extends keyof TicketFilters>(
    key: K,
    value: TicketFilters[K],
  ) => onChange({ ...filters, [key]: value });
  const disasters = (disasterTypes.data?.disasterTypes ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({ value: d.key, label: d.label }));
  // Keep a chosen disaster visible after it stops being active.
  const disasterChoices =
    filters.disaster && !disasters.some((d) => d.value === filters.disaster)
      ? [...disasters, { value: filters.disaster, label: filters.disaster }]
      : disasters;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        p: '20px 24px',
        border: `1px solid ${color.border.subtle}`,
        borderRadius: `${radius.lg}px`,
        boxShadow: shadow.sm,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <ChipRow
        label="狀態"
        value={filters.status}
        options={TICKET_STATUS_OPTIONS}
        onChange={(v) => set('status', v)}
      />
      <ChipRow
        label="優先級"
        value={filters.priority}
        options={PRIORITY_OPTIONS}
        onChange={(v) => set('priority', v)}
      />
      <ChipRow
        label="需求"
        value={filters.taskType}
        options={NEED_OPTIONS}
        onChange={(v) => set('taskType', v)}
      />
      {disasterChoices.length > 0 ? (
        <ChipRow
          label="災害類型"
          value={filters.disaster}
          options={disasterChoices}
          onChange={(v) => set('disaster', v)}
        />
      ) : null}
      <ChipRow
        label="重複審核"
        value={filters.audit}
        options={AUDIT_OPTIONS}
        onChange={(v) => set('audit', v)}
      />
    </Box>
  );
}
