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

const themed = new Map<LucideIcon, ReturnType<typeof themedIcon>>();

/**
 * The type's icon as an MUI `SvgIcon`, for a place that sizes and colours it through `sx`, as the
 * other icons there are. Made once per icon, so a list re-renders the same component.
 */
export function getStationTypeIcon(type?: string | null) {
  const icon = getStationTypeLucideIcon(type);
  let component = themed.get(icon);

  if (!component) {
    component = themedIcon(icon);
    themed.set(icon, component);
  }

  return component;
}
