import type { StationListRow, StationListStatus } from './types';

export const stationFilterQueryKeys = ['status'] as const;

export type StationFilterKey = (typeof stationFilterQueryKeys)[number];

export type StationFilterSelection = Partial<Record<StationFilterKey, string>>;

export interface StationFilterOption {
  value: StationListStatus;
  label: string;
}

export interface StationFilterGroup {
  key: StationFilterKey;
  label: string;
  options: readonly StationFilterOption[];
}

export const stationFilterGroups: readonly StationFilterGroup[] = [
  {
    key: 'status',
    label: '狀態',
    options: [
      { value: 'active', label: '運作中' },
      { value: 'limited', label: '資源緊張' },
      { value: 'offline', label: '離線' },
    ],
  },
] as const;

const optionLabelByKey = new Map<StationFilterKey, Map<string, string>>(
  stationFilterGroups.map((group) => [
    group.key,
    new Map(group.options.map((option) => [option.value, option.label])),
  ]),
);

export function isStationFilterKey(value: string): value is StationFilterKey {
  return stationFilterQueryKeys.includes(value as StationFilterKey);
}

function isKnownFilterValue(key: StationFilterKey, value: string) {
  return optionLabelByKey.get(key)?.has(value) ?? false;
}

function getRowFilterValue(row: StationListRow, key: StationFilterKey) {
  switch (key) {
    case 'status':
      return row.status;
  }
}

export function parseStationFilterSearchParams(
  searchParams: Pick<URLSearchParams, 'get'>,
): StationFilterSelection {
  const selection: StationFilterSelection = {};

  for (const key of stationFilterQueryKeys) {
    const value = searchParams.get(key);

    if (value && isKnownFilterValue(key, value)) {
      selection[key] = value;
    }
  }

  return selection;
}

export function filterStationRowsBySelection(
  rows: readonly StationListRow[],
  selection: StationFilterSelection,
) {
  return rows.filter((row) =>
    stationFilterQueryKeys.every((key) => {
      const selectedValue = selection[key];

      if (!selectedValue) {
        return true;
      }

      return getRowFilterValue(row, key) === selectedValue;
    }),
  );
}

export function countActiveStationFilters(selection: StationFilterSelection) {
  return stationFilterQueryKeys.reduce(
    (count, key) => count + (selection[key] ? 1 : 0),
    0,
  );
}

export function removeStationFilterSearchParams(searchParams: URLSearchParams) {
  for (const key of stationFilterQueryKeys) {
    searchParams.delete(key);
  }
}

export function setStationFilterSearchParams(
  searchParams: URLSearchParams,
  selection: StationFilterSelection,
) {
  for (const [key, value] of Object.entries(selection)) {
    if (isStationFilterKey(key) && value) {
      searchParams.set(key, value);
    }
  }
}
