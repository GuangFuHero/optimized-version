import type { TicketListFilterItem, TicketListRowItem } from './types';

export const ticketFilterQueryKeys = [
  'region',
  'taskType',
  'disasterType',
  'status',
  'priority',
] as const;

export const ticketFilterKeywordQueryKey = 'q';

export type TicketFilterKey = (typeof ticketFilterQueryKeys)[number];

export type TicketFilterSelection = Partial<Record<TicketFilterKey, string>>;

export interface TicketFilterOption {
  value: string;
  label: string;
}

export interface TicketFilterGroup {
  key: TicketFilterKey;
  label: string;
  options: readonly TicketFilterOption[];
}

export const ticketFilterGroups: readonly TicketFilterGroup[] = [
  {
    key: 'region',
    label: '地區',
    options: [
      { value: 'north', label: '北區' },
      { value: 'central', label: '中區' },
      { value: 'transit', label: '交通節點' },
    ],
  },
  {
    key: 'taskType',
    label: '任務類型',
    options: [
      { value: 'medical', label: '醫療' },
      { value: 'road-clearance', label: '道路清理' },
      { value: 'logistics', label: '後勤' },
      { value: 'public-works', label: '工務' },
      { value: 'cleanup', label: '清理' },
    ],
  },
  {
    key: 'disasterType',
    label: '災害類型',
    options: [
      { value: 'medical', label: '醫療' },
      { value: 'traffic', label: '交通' },
      { value: 'supplies', label: '物資' },
      { value: 'flood', label: '水患' },
      { value: 'debris', label: '瓦礫' },
    ],
  },
  {
    key: 'status',
    label: '狀態',
    options: [
      { value: 'critical', label: '嚴重' },
      { value: 'inProgress', label: '進行中' },
      { value: 'pending', label: '待處理' },
      { value: 'completed', label: '已完成' },
    ],
  },
  {
    key: 'priority',
    label: '優先級',
    options: [
      { value: 'high', label: '高' },
      { value: 'medium', label: '中' },
      { value: 'low', label: '低' },
    ],
  },
] as const;

const taskTypeValueByLabel: Record<string, string> = {
  醫療: 'medical',
  道路清理: 'road-clearance',
  後勤: 'logistics',
  工務: 'public-works',
  清理: 'cleanup',
  通訊維運: 'communications',
};

const disasterTypeValueByLabel: Record<string, string> = {
  醫療: 'medical',
  交通: 'traffic',
  物資: 'supplies',
  水患: 'flood',
  瓦礫: 'debris',
  資源: 'resources',
  通訊: 'communications',
};

const optionLabelByKey = new Map<TicketFilterKey, Map<string, string>>(
  ticketFilterGroups.map((group) => [
    group.key,
    new Map(group.options.map((option) => [option.value, option.label])),
  ]),
);

export function isTicketFilterKey(value: string): value is TicketFilterKey {
  return ticketFilterQueryKeys.includes(value as TicketFilterKey);
}

function isKnownFilterValue(key: TicketFilterKey, value: string) {
  return optionLabelByKey.get(key)?.has(value) ?? false;
}

function getRowFilterValue(row: TicketListRowItem, key: TicketFilterKey) {
  switch (key) {
    case 'region':
      return row.region;
    case 'taskType':
      return taskTypeValueByLabel[row.taskType];
    case 'disasterType':
      return disasterTypeValueByLabel[row.disasterType];
    case 'status':
      return row.status;
    case 'priority':
      return row.priority;
  }
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function rowMatchesKeyword(row: TicketListRowItem, keyword: string) {
  const normalizedKeyword = normalizeKeyword(keyword);

  if (!normalizedKeyword) {
    return true;
  }

  return [
    row.code,
    row.title,
    row.taskType,
    row.disasterType,
    row.location,
    row.createdAt,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedKeyword);
}

export function getTicketFilterOptionLabel(
  key: TicketFilterKey,
  value: string,
) {
  return optionLabelByKey.get(key)?.get(value) ?? value;
}

export function parseTicketFilterSearchParams(
  searchParams: Pick<URLSearchParams, 'get'>,
): TicketFilterSelection {
  const selection: TicketFilterSelection = {};

  for (const key of ticketFilterQueryKeys) {
    const value = searchParams.get(key);

    if (value && isKnownFilterValue(key, value)) {
      selection[key] = value;
    }
  }

  return selection;
}

export function parseTicketFilterKeywordSearchParam(
  searchParams: Pick<URLSearchParams, 'get'>,
) {
  return searchParams.get(ticketFilterKeywordQueryKey)?.trim() ?? '';
}

export function filterTicketRowsBySelection(
  rows: readonly TicketListRowItem[],
  selection: TicketFilterSelection,
  keyword = '',
) {
  return rows.filter((row) => {
    if (!rowMatchesKeyword(row, keyword)) {
      return false;
    }

    return ticketFilterQueryKeys.every((key) => {
      const selectedValue = selection[key];

      if (!selectedValue) {
        return true;
      }

      return getRowFilterValue(row, key) === selectedValue;
    });
  });
}

export function createTicketListFilterItems(
  selection: TicketFilterSelection,
): readonly TicketListFilterItem[] {
  return ticketFilterGroups.map((group) => {
    const selectedValue = selection[group.key];
    const label = selectedValue
      ? `${group.label}：${getTicketFilterOptionLabel(group.key, selectedValue)}`
      : group.label;

    return {
      id: group.key,
      label,
      selected: Boolean(selectedValue),
    };
  });
}

export function countActiveTicketFilters(
  selection: TicketFilterSelection,
  keyword = '',
) {
  const selectedFilterCount = ticketFilterQueryKeys.reduce(
    (count, key) => count + (selection[key] ? 1 : 0),
    0,
  );

  return selectedFilterCount + (normalizeKeyword(keyword) ? 1 : 0);
}

export function removeTicketCategoryFilterSearchParams(
  searchParams: URLSearchParams,
) {
  for (const key of ticketFilterQueryKeys) {
    searchParams.delete(key);
  }
}

export function removeTicketFilterSearchParams(searchParams: URLSearchParams) {
  removeTicketCategoryFilterSearchParams(searchParams);

  searchParams.delete(ticketFilterKeywordQueryKey);
}

export function setTicketFilterSearchParams(
  searchParams: URLSearchParams,
  selection: TicketFilterSelection,
) {
  for (const [key, value] of Object.entries(selection)) {
    if (isTicketFilterKey(key) && value) {
      searchParams.set(key, value);
    }
  }
}
