export type StationTypeValue =
  | 'water'
  | 'shelter'
  | 'shower'
  | 'toilet'
  | 'transport'
  | 'medical'
  | 'supply'
  | 'gas_station'
  | 'charge'
  | 'power'
  | 'cellular';

export const STATION_TYPE_OPTIONS: readonly {
  value: StationTypeValue;
  label: string;
}[] = [
  { value: 'water', label: '加水' },
  { value: 'shelter', label: '避難' },
  { value: 'shower', label: '洗澡' },
  { value: 'toilet', label: '廁所' },
  { value: 'transport', label: '交通' },
  { value: 'medical', label: '醫療' },
  { value: 'supply', label: '物資' },
  { value: 'gas_station', label: '加油' },
  { value: 'charge', label: '充電' },
  { value: 'power', label: '發電' },
  { value: 'cellular', label: '通訊' },
] as const;

const STATION_TYPE_LABELS = Object.fromEntries(
  STATION_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<StationTypeValue, string>;

export function getStationTypeLabel(type?: string | null): string {
  const normalizedType = type?.trim().toLowerCase() as StationTypeValue | undefined;

  if (!normalizedType) {
    return '站點';
  }

  return STATION_TYPE_LABELS[normalizedType] ?? normalizedType;
}
