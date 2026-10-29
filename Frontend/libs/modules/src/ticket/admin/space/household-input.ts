/**
 * A household filed under a space (BE-036 point 3): `createTicket` with `buildingMapUuid`, which
 * copies the building's point and address onto the ticket, so the ticket sends no point of its own
 * (the backend rejects both together). Its floor is one of the building's or none; its 戶別 is free
 * text (`302`, `早餐店`).
 */

import type { CreateTicketInput } from '@rescue-frontend/data-access/admin';

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
 * 新增一戶 and 在這一層新增 show only when the page hands the sheet a ticket form to open (the
 * sheet has none of its own) and the user may add tickets.
 */
export function householdActionsShown(input: {
  canAddTicket: boolean;
  hasHandler: boolean;
}): boolean {
  return input.canAddTicket && input.hasHandler;
}
