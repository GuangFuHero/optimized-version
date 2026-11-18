import {
  BatteryCharging,
  Bus,
  Droplets,
  Fuel,
  HeartPulse,
  MapPin,
  Package,
  RadioTower,
  ShowerHead,
  Tent,
  Toilet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { themedIcon } from '@rescue-frontend/ui';
import type { SvgIconProps } from '@mui/material';

import { normalizeStationType, type StationTypeValue } from './type-options';

/**
 * Station type → its Lucide icon, the site and the back office alike: the prototype's own table
 * (`STATION_TYPE_ICONS` in `Design/前台/js/site/site-route.js`). Line icons at a stroke of 2, in the
 * text's colour: a type is told apart by its shape, not by a colour.
 */
export const STATION_TYPE_LUCIDE_ICONS: Record<StationTypeValue, LucideIcon> = {
  water: Droplets,
  shelter: Tent,
  shower: ShowerHead,
  toilet: Toilet,
  transport: Bus,
  medical: HeartPulse,
  supply: Package,
  gas_station: Fuel,
  charge: BatteryCharging,
  power: Zap,
  cellular: RadioTower,
};

/** A type outside the list is a pin, not 物資's box, which would read as a supply station. */
export function getStationTypeLucideIcon(type?: string | null): LucideIcon {
  const key = normalizeStationType(type);

  return (key && STATION_TYPE_LUCIDE_ICONS[key]) || MapPin;
}

const themed = {
  water: themedIcon(Droplets),
  shelter: themedIcon(Tent),
  shower: themedIcon(ShowerHead),
  toilet: themedIcon(Toilet),
  transport: themedIcon(Bus),
  medical: themedIcon(HeartPulse),
  supply: themedIcon(Package),
  gas_station: themedIcon(Fuel),
  charge: themedIcon(BatteryCharging),
  power: themedIcon(Zap),
  cellular: themedIcon(RadioTower),
} satisfies Record<StationTypeValue, ReturnType<typeof themedIcon>>;
const fallback = themedIcon(MapPin);

export function StationTypeIcon({
  type,
  ...props
}: Omit<SvgIconProps, 'type'> & { type?: string | null }) {
  const key = normalizeStationType(type);
  const Icon = key ? themed[key] : fallback;
  return <Icon {...props} />;
}
