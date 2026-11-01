'use client';

import { useDisasterTypes } from '@rescue-frontend/data-access/admin';
import { Card } from '@rescue-frontend/ui';

import { ChipRow } from '../../../admin/shared/chip-row';
import { TICKET_STATUS_OPTIONS } from '../../status';
import { ticketPriorityLabel } from './model/ticket-detail-view';
import { NEED_FILTER_TYPES, type TicketFilters } from './model/ticket-filters';
import {
  needTypeLabel,
  TICKET_PRIORITIES,
  type TicketPriority,
} from './model/ticket-row';

const PRIORITY_OPTIONS: readonly { value: TicketPriority; label: string }[] =
  TICKET_PRIORITIES.map((value) => ({
    value,
    label: ticketPriorityLabel(value),
  }));

const NEED_OPTIONS = NEED_FILTER_TYPES.map((value) => ({
  value: value as string,
  label: needTypeLabel(value),
}));

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

  // The prototype's panel (tk-table.jsx) is the design system's Card: 24 inside, border.default,
  // shadow.md.
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
    </Card>
  );
}
