/**
 * A household filed under a space (BE-036 point 3): `createTicket` with `buildingMapUuid`, which
 * copies the building's point and address onto the ticket, so the ticket sends no point of its own
 * (the backend rejects both together). Its floor is one of the building's or none; its 戶別 is free
 * text (`302`, `早餐店`).
 */

import type { CreateTicketInput } from '@rescue-frontend/data-access/admin';

import { matchFloor, orderFloors } from './floors';

export function householdLocation(input: {
  buildingUuid: string;
  /** One of the building's floor labels, or '' when the reporter doesn't know it. */
  floor: string;
  room: string;
}): Pick<CreateTicketInput, 'buildingMapUuid' | 'secondaryLocation'> {
  return {
    buildingMapUuid: input.buildingUuid,
    secondaryLocation: {
      locationType: 'address',
      floor: input.floor || null,
      room: input.room.trim() || null,
    },
  };
}

/** The space a household is added to, for the page's own ticket form. */
export interface SpaceHouseholdTarget {
  uuid: string;
  name: string;
  floorLabels: string[];
}

/**
 * 新增一戶 shows only when the page hands the sheet a ticket form to open (the sheet has none of
 * its own) and the user may add tickets.
 */
export function householdActionsShown(input: {
  canAddTicket: boolean;
  hasHandler: boolean;
}): boolean {
  return input.canAddTicket && input.hasHandler;
}

/**
 * A household's 樓層 picker when it is edited: the building's floors, its stored floor read as one
 * of them (「2樓」 is 2F). A floor the building lacks — written before the building had fewer, or
 * by hand — stays as an option of its own, so saving the form doesn't turn it into unknown ('').
 */
export function householdFloorChoice(
  stored: string | null | undefined,
  labels: readonly string[],
): { value: string; options: string[] } {
  const options = orderFloors(labels);
  const { floor, raw } = matchFloor(stored, labels);
  if (floor) return { value: floor, options };
  return raw
    ? { value: raw, options: [...options, raw] }
    : { value: '', options };
}
