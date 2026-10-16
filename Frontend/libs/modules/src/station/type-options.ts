import BatteryChargingFullRoundedIcon from '@mui/icons-material/BatteryChargingFullRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import CellTowerRoundedIcon from '@mui/icons-material/CellTowerRounded';
import DirectionsBusRoundedIcon from '@mui/icons-material/DirectionsBusRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import LocalGasStationRoundedIcon from '@mui/icons-material/LocalGasStationRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import NightShelterRoundedIcon from '@mui/icons-material/NightShelterRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import ShowerRoundedIcon from '@mui/icons-material/ShowerRounded';
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded';
import WcRoundedIcon from '@mui/icons-material/WcRounded';

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

/**
 * Station type → MUI icon component, mirroring `STATION_TYPE_ICONS` in the design prototype
 * (`Design/前台/js/site/site-route.js:23`). The prototype names lucide icons; these are the
 * closest MUI Rounded equivalents, since MUI is what this app already ships.
 */
export const STATION_TYPE_ICONS: Record<StationTypeValue, typeof PlaceRoundedIcon> = {
  water: WaterDropRoundedIcon,
  shelter: NightShelterRoundedIcon,
  shower: ShowerRoundedIcon,
  toilet: WcRoundedIcon,
  transport: DirectionsBusRoundedIcon,
  medical: MonitorHeartRoundedIcon,
  supply: Inventory2RoundedIcon,
  gas_station: LocalGasStationRoundedIcon,
  charge: BatteryChargingFullRoundedIcon,
  power: BoltRoundedIcon,
  cellular: CellTowerRoundedIcon,
};

export function getStationTypeIcon(type?: string | null) {
  const key = type?.trim().toLowerCase() as StationTypeValue | undefined;

  return (key && STATION_TYPE_ICONS[key]) || Inventory2RoundedIcon;
}
