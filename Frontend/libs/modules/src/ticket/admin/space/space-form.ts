/**
 * The 開啟空間 form (BE-036): a pin, the address it brings, a name and the floor counts
 * (designer, `Design/後台/js/admin/ticket/tk-building.jsx` `BuildingSetupModal`, and
 * `Design/後台/docs/任務管理.md` §開啟空間 4 and 7; backend `CreateBuildingMapInput`).
 */

import type {
  AdminBuildingMapFieldsFragment,
  CreateBuildingMapInput,
  UpdateBuildingMapInput,
} from '@rescue-frontend/data-access/admin';

import {
  distanceM,
  toAddressInput,
  type AddressFields,
  type LatLng,
} from '../../address-lookup';
import { floorLabelsFor, matchFloor } from './floors';
import type { SpaceTicket } from './space-analysis';

export const SPACE_NAME_MAX = 100;
export const FLOORS_ABOVE_MAX = 200;
export const FLOORS_BELOW_MAX = 20;
/** Another space this close to the pin is probably the same building (designer's number; warns only). */
export const NEARBY_M = 30;

export interface SpaceFormValues extends AddressFields {
  pin: LatLng | null;
  name: string;
  /** As typed: 「12」. */
  above: string;
  /** As typed; blank is 0. */
  below: string;
}

export function emptySpaceForm(): SpaceFormValues {
  return {
    pin: null,
    address: '',
    floor: '',
    room: '',
    addressFilled: null,
    addressKept: null,
    name: '',
    above: '',
    below: '0',
  };
}

export type SpaceFormField = 'pin' | 'address' | 'name' | 'above' | 'below';

function whole(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** The counts as numbers, or null where one isn't valid. */
export function floorCounts(values: Pick<SpaceFormValues, 'above' | 'below'>): {
  above: number | null;
  below: number | null;
} {
  const above = whole(values.above);
  const below = values.below.trim() ? whole(values.below) : 0;
  return {
    above:
      above !== null && above >= 1 && above <= FLOORS_ABOVE_MAX ? above : null,
    below: below !== null && below <= FLOORS_BELOW_MAX ? below : null,
  };
}

/** Editing has no pin and keeps the address it was created with (the backend can't change it). */
export function spaceFormErrors(
  values: SpaceFormValues,
  mode: 'create' | 'edit',
): Partial<Record<SpaceFormField, string>> {
  const errors: Partial<Record<SpaceFormField, string>> = {};
  if (mode === 'create') {
    if (!values.pin) errors.pin = '請在地圖上點那棟建築';
    if (!values.address.trim()) errors.address = '必填';
  }
  const nameLength = [...values.name.trim()].length;
  if (!nameLength) errors.name = '必填';
  else if (nameLength > SPACE_NAME_MAX)
    errors.name = `最多 ${SPACE_NAME_MAX} 個字`;
  const { above, below } = floorCounts(values);
  if (above === null) errors.above = `請填 1 到 ${FLOORS_ABOVE_MAX}`;
  if (below === null) errors.below = `請填 0 到 ${FLOORS_BELOW_MAX}`;
  return errors;
}

/** The address goes as the line and its token only: a building's address has no 棟, 樓 or 室. */
export function toCreateBuildingMapInput(
  values: SpaceFormValues,
): CreateBuildingMapInput & {
  secondaryLocation: {
    locationType: 'address';
    fullAddress: string | null;
    addressToken: string | null;
  };
} {
  const { above, below } = floorCounts(values);
  if (
    Object.keys(spaceFormErrors(values, 'create')).length ||
    !values.pin ||
    above === null ||
    below === null
  ) {
    throw new Error('The 開啟空間 form is not complete');
  }
  const { fullAddress, addressToken } = toAddressInput(values);
  return {
    name: values.name.trim(),
    geometry: { type: 'Point', coordinates: [values.pin.lng, values.pin.lat] },
    secondaryLocation: { locationType: 'address', fullAddress, addressToken },
    floorsAboveGround: above,
    floorsBelowGround: below,
    floorAreas: [],
  };
}

/** Only the fields that changed, so an unchanged save sends nothing it doesn't mean. */
export function toUpdateBuildingMapInput(
  initial: AdminBuildingMapFieldsFragment,
  values: SpaceFormValues,
): UpdateBuildingMapInput {
  const { above, below } = floorCounts(values);
  const input: UpdateBuildingMapInput = {};
  const name = values.name.trim();
  if (name !== initial.name) input.name = name;
  if (above !== null && above !== initial.floorsAboveGround)
    input.floorsAboveGround = above;
  if (below !== null && below !== initial.floorsBelowGround)
    input.floorsBelowGround = below;
  return input;
}

/** The closest other space within `NEARBY_M` of the pin, to warn about; never blocks. */
export function nearbySpace(
  pin: LatLng | null,
  spaces: readonly {
    id: string;
    name: string;
    lngLat: readonly [number, number] | null;
  }[],
  excludeId?: string,
): { name: string; metres: number } | null {
  if (!pin) return null;
  let best: { name: string; metres: number } | null = null;
  for (const space of spaces) {
    if (space.id === excludeId || !space.lngLat) continue;
    const metres = distanceM(pin, {
      lng: space.lngLat[0],
      lat: space.lngLat[1],
    });
    if (metres <= NEARBY_M && (!best || metres < best.metres))
      best = { name: space.name, metres };
  }
  return best && { name: best.name, metres: Math.round(best.metres) };
}

/**
 * Tickets on a floor the new counts take away. They stay, with their floor as written, and show
 * under 「樓層不在這棟的樓層裡」 once saved (backend ADR-310: tickets aren't re-checked).
 */
export function strandedTickets(
  oldLabels: readonly string[],
  above: number,
  below: number,
  tickets: readonly SpaceTicket[],
): { ticket: SpaceTicket; floor: string }[] {
  const kept = new Set(floorLabelsFor(above, below));
  return tickets.flatMap((ticket) => {
    const { floor } = matchFloor(ticket.secondaryLocation?.floor, oldLabels);
    return floor && !kept.has(floor) ? [{ ticket, floor }] : [];
  });
}
