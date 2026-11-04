'use client';

import { useTicketFacets } from '@rescue-frontend/data-access/admin';
import { Card } from '@rescue-frontend/ui';

import { ChipRow } from '../../../admin/shared/chip-row';
import { useTicketCapabilities } from './hooks/use-ticket-capabilities';
import { TICKET_STATUS_OPTIONS } from '../../status';
import { ticketPriorityLabel } from './model/ticket-detail-view';
import {
  NEED_FILTER_TYPES,
  UNASSIGNED_TEAM,
  type TicketFilters,
  type TicketTimeFilter,
} from './model/ticket-filters';
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

const TIME_OPTIONS: readonly { value: TicketTimeFilter; label: string }[] = [
  { value: 'today', label: '24 小時內' },
  { value: 'earlier', label: '更早' },
];

/** One 行政區域 chip's value: the county, and the town when there is one. */
const areaKey = (county: string, town: string | null) =>
  town ? `${county}\u0000${town}` : county;

interface TicketFilterPanelProps {
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}

/**
 * The prototype's six rows (tk-table.jsx): 狀態, 優先級, 需求, 行政區域, 組織分配, 時間. 組織分配 is
 * the 責任區 a ticket lies in — tickets have no team of their own — and 未指派 is in nobody's.
 * 行政區域 and 組織分配 read the address and the exact point, so they match nothing for an
 * identity without ticket.view_detail; for one, the two rows are left out.
 */
export function TicketFilterPanel({
  filters,
  onChange,
}: TicketFilterPanelProps) {
  const { canViewDetail } = useTicketCapabilities();
  const facets = useTicketFacets({ enabled: canViewDetail });
  const set = (next: Partial<TicketFilters>) =>
    onChange({ ...filters, ...next });

  const facetAreas = facets.data?.ticketFacets.areas ?? [];
  // The prototype names a 行政區域 by its town alone (光復鄉). A town name two counties share
  // (中正區) keeps its county, so the two chips can be told apart.
  const shared = new Set(
    facetAreas
      .map((area) => area.town)
      .filter((town, i, towns) => towns.indexOf(town) !== i),
  );
  const areas = facetAreas.map((area) => ({
    value: areaKey(area.county, area.town),
    label: shared.has(area.town) ? `${area.county}${area.town}` : area.town,
    county: area.county,
    town: area.town as string | null,
  }));
  const chosenArea = filters.county
    ? areaKey(filters.county, filters.town)
    : null;

  // As the prototype: the teams the tickets have, then 未指派.
  const teamChoices = [
    ...(facets.data?.ticketFacets.teams ?? []).map((team) => ({
      value: team.uuid,
      label: team.name,
    })),
    { value: UNASSIGNED_TEAM, label: '未指派' },
  ];

  // The prototype's panel (tk-table.jsx) is the design system's Card: 24 inside, border.default,
  // shadow.md.
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <ChipRow
        label="狀態"
        value={filters.status}
        options={TICKET_STATUS_OPTIONS}
        onChange={(v) => set({ status: v })}
      />
      <ChipRow
        label="優先級"
        value={filters.priority}
        options={PRIORITY_OPTIONS}
        onChange={(v) => set({ priority: v })}
      />
      <ChipRow
        label="需求"
        value={filters.taskType}
        options={NEED_OPTIONS}
        onChange={(v) => set({ taskType: v })}
      />
      {canViewDetail ? (
        <>
          <ChipRow
            label="行政區域"
            value={chosenArea}
            options={areas}
            onChange={(v) => {
              const area = areas.find((a) => a.value === v);
              set({ county: area?.county ?? null, town: area?.town ?? null });
            }}
          />
          <ChipRow
            label="組織分配"
            value={filters.team}
            options={teamChoices}
            onChange={(v) => set({ team: v })}
          />
        </>
      ) : null}
      <ChipRow
        label="時間"
        value={filters.time}
        options={TIME_OPTIONS}
        onChange={(v) => set({ time: v })}
      />
    </Card>
  );
}
