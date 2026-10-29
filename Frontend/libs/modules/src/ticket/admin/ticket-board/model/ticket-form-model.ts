/**
 * The board's create and edit form for a ticket: what it holds, what it refuses, and the inputs it
 * sends. A coordinator types in a request taken by phone; the backend marks its needs official, as
 * it does every need filed from the back office.
 */

import type {
  AccessStatus,
  CreateTicketInput,
  SecondaryLocationInput,
  UpdateTicketInput,
} from '@rescue-frontend/data-access/admin';

import {
  afterPinMove,
  updateAddressFields,
} from '../../../../admin/shared/model/address-fill';
import type { PickedPoint } from '../../../../map/components/location-picker';
import { stationPoint } from '../../../../station/station-point';
import { PHOTO_LINK_MAX } from '../../../photos/photo-links';
import {
  householdLocation,
  type SpaceHouseholdTarget,
} from '../../space/household-input';
import {
  buildNeedDraftInput,
  validateNeedDraft,
  type DuplicateSuspect,
  type NeedDraft,
} from './task-actions';
import type { DetailTicket } from './ticket-detail-view';
import type { TicketPriority } from './ticket-row';

export interface TicketFormValues {
  title: string;
  description: string;
  priority: TicketPriority;
  disasterTypes: string[];
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  point: PickedPoint | null;
  fullAddress: string;
  /**
   * The TGOS lookup's token for `fullAddress`, or ''. Sent with the unchanged line, it saves the
   * address as verified.
   */
  addressToken: string;
  floor: string;
  room: string;
  photoUrls: string[];
  needs: NeedDraft[];
}

export type TicketFormErrors = Partial<
  Record<keyof TicketFormValues | `needs.${number}.${string}`, string>
>;

/** `tickets.title` is String(200). */
export const TICKET_TITLE_MAX = 200;
/** Needs one create may carry. */
export const TICKET_NEEDS_MAX = 20;

export function emptyNeed(): NeedDraft {
  return { taskType: 'rescue', taskName: '', quantity: '', description: '' };
}

/**
 * A blank create form, pinned at `seed` when the form opens from a point picked on a map: the pin's
 * address lookup runs for it as for any other pin.
 */
export function emptyTicketForm(
  seed: { lat: number; lng: number } | null = null,
): TicketFormValues {
  return {
    title: '',
    description: '',
    priority: 'medium',
    disasterTypes: [],
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    point: seed ? { lat: seed.lat, lng: seed.lng, source: 'seed' } : null,
    fullAddress: '',
    addressToken: '',
    floor: '',
    room: '',
    photoUrls: [],
    needs: [emptyNeed()],
  };
}

const read = (value: string | null | undefined) => value ?? '';

export function ticketFormFromTicket(ticket: DetailTicket): TicketFormValues {
  const [lat, lng] = stationPoint(ticket.geometry) ?? [];
  const location = ticket.secondaryLocation;
  return {
    title: read(ticket.title),
    description: read(ticket.description),
    priority: ticket.priority as TicketPriority,
    disasterTypes: [...(ticket.disasterTypes ?? [])],
    contactName: read(ticket.contactName),
    contactPhone: read(ticket.contactPhone),
    contactEmail: read(ticket.contactEmail),
    point: lat == null || lng == null ? null : { lat, lng, source: 'seed' },
    fullAddress: read(location?.fullAddress),
    addressToken: '',
    floor: read(location?.floor),
    room: read(location?.room),
    photoUrls: ticket.photos.map((photo) => photo.url),
    needs: [],
  };
}

/** A row nothing was typed into: left out, not refused. */
function untouched(need: NeedDraft): boolean {
  return (
    !need.taskName.trim() && !need.quantity.trim() && !need.description.trim()
  );
}

/** The rows that go out, in order: their index is the backend's `task:<i>`. */
function sentNeeds(values: TicketFormValues): NeedDraft[] {
  return values.needs.filter((need) => !untouched(need));
}

/**
 * Fields changed on the form. A new address line no longer matches the lookup's token, and
 * neither does a line once the pin moves off the point it was looked up for.
 */
export function updateTicketForm(
  values: TicketFormValues,
  patch: Partial<TicketFormValues>,
): TicketFormValues {
  const next = updateAddressFields(values, patch);
  const from = values.point;
  const to = next.point;
  const moved =
    'point' in patch && (from?.lat !== to?.lat || from?.lng !== to?.lng);
  return moved ? afterPinMove(next) : next;
}

/** `space`: a household filed in a 開啟空間 space, which needs no point of its own. */
export function validateTicketForm(
  values: TicketFormValues,
  mode: 'create' | 'edit',
  space?: SpaceHouseholdTarget,
): TicketFormErrors {
  const errors: TicketFormErrors = {};
  const title = values.title.trim();
  if (!title) errors.title = '請填寫標題';
  // Code points, as the backend counts them: an emoji is one, not two UTF-16 units.
  else if ([...title].length > TICKET_TITLE_MAX)
    errors.title = `標題最多 ${TICKET_TITLE_MAX} 字`;
  if (values.photoUrls.length > PHOTO_LINK_MAX)
    errors.photoUrls = `照片最多 ${PHOTO_LINK_MAX} 張`;
  if (mode === 'edit') return errors;

  // 地址必填 (tk-form.jsx); a household in a space takes the building's.
  if (!values.fullAddress.trim() && !space) errors.fullAddress = '請填寫地址';
  if (!values.contactName.trim()) errors.contactName = '請填寫現場聯絡人';
  // 地標必填: rescuers navigate by this point (tk-form.jsx). A household in a space takes the space's.
  if (!values.point && !space) errors.point = '請在地圖上標記地標位置';
  if (values.needs.length > TICKET_NEEDS_MAX) {
    errors.needs = `需求最多 ${TICKET_NEEDS_MAX} 項`;
  } else if (sentNeeds(values).length === 0) {
    errors.needs = '請至少填寫一項需求';
  }
  values.needs.forEach((need, index) => {
    if (untouched(need)) return;
    const needErrors = validateNeedDraft(need);
    for (const [key, message] of Object.entries(needErrors)) {
      errors[`needs.${index}.${key}`] = message;
    }
  });
  return errors;
}

function secondaryLocation(values: TicketFormValues): SecondaryLocationInput {
  const location: SecondaryLocationInput = {};
  for (const key of ['fullAddress', 'floor', 'room'] as const) {
    const value = values[key].trim();
    if (value) location[key] = value;
  }
  if (location.fullAddress && values.addressToken)
    location.addressToken = values.addressToken;
  return location;
}

/**
 * `createTicket`'s input. `acknowledged` maps a sent need's index to the suspect the user has
 * confirmed it is not a duplicate of. In a `space` the ticket is filed under the building, which
 * gives it its point and address: only the floor and 戶別 go, and never a point (the backend
 * refuses both together).
 */
export function toCreateTicketInput(
  values: TicketFormValues,
  acknowledged: Map<number, string> = new Map(),
  space?: SpaceHouseholdTarget,
): CreateTicketInput {
  const location = secondaryLocation(values);
  const household = space
    ? householdLocation({
        buildingUuid: space.uuid,
        floor: values.floor.trim(),
        room: values.room,
      })
    : null;
  const optional = (value: string) => value.trim() || undefined;
  const input: CreateTicketInput = {
    title: values.title.trim(),
    description: optional(values.description),
    priority: values.priority,
    disasterTypes: values.disasterTypes,
    contactName: values.contactName.trim(),
    contactPhone: optional(values.contactPhone),
    contactEmail: optional(values.contactEmail),
    geometry:
      values.point && !household
        ? { type: 'Point', coordinates: [values.point.lng, values.point.lat] }
        : undefined,
    secondaryLocation:
      household?.secondaryLocation ??
      (Object.keys(location).length ? location : undefined),
    buildingMapUuid: household?.buildingMapUuid,
    photoUrls: values.photoUrls,
    tasks: sentNeeds(values).map((need, index) => {
      const draft = buildNeedDraftInput(need);
      const ack = acknowledged.get(index);
      return ack ? { ...draft, acknowledgedDuplicateOf: ack } : draft;
    }),
  };
  // Blank optional fields stay out, so the backend's defaults apply.
  for (const key of Object.keys(input) as (keyof CreateTicketInput)[]) {
    if (input[key] === undefined) delete input[key];
  }
  return input;
}

/**
 * The acknowledgements to resend with: one suspect per need (the backend takes one each), the
 * first of this hold's suspects for it. A new hold for a need replaces an earlier acknowledgement:
 * the latest suspect is the one the backend is holding on. A suspect on the ticket itself
 * (`draftIndex` -1) has nothing to acknowledge it on.
 */
export function acknowledgeSuspects(
  previous: Map<number, string>,
  suspects: DuplicateSuspect[],
): Map<number, string> {
  const latest = new Map<number, string>();
  for (const suspect of suspects) {
    if (suspect.draftIndex >= 0 && !latest.has(suspect.draftIndex)) {
      latest.set(suspect.draftIndex, suspect.relatedUuid);
    }
  }
  return new Map([...previous, ...latest]);
}

/** `updateTicket`'s input: never the contact or the point, which the edit form can't change. */
export function toUpdateTicketInput(
  values: TicketFormValues,
): UpdateTicketInput {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    priority: values.priority,
    disasterTypes: values.disasterTypes,
    secondaryLocation: secondaryLocation(values),
  };
}

/**
 * A coarse ticket (`locationCell` set) is one the viewer may not see in detail: the backend hands
 * it back with no description, photos or address, so the form must not write those over the real
 * ones.
 */
export function isCoarseTicket(ticket: DetailTicket): boolean {
  return Boolean(ticket.locationCell);
}

/** The address members this form doesn't show, carried over when it resends the address. */
const CARRIED_LOCATION_FIELDS = [
  'locationType',
  'buildingSection',
  'spaceDescription',
  'victimSpace',
  'accessStatus',
  'landmarkNote',
  'poleId',
  'poleType',
  'poleNote',
] as const;

function carriedLocation(ticket: DetailTicket): SecondaryLocationInput {
  const carried: Record<string, string> = {};
  for (const key of CARRIED_LOCATION_FIELDS) {
    const value = ticket.secondaryLocation?.[key];
    if (value) carried[key] = value;
  }
  return carried as SecondaryLocationInput & { accessStatus?: AccessStatus };
}

/**
 * Only the members that changed. `secondaryLocation` replaces the whole address, so it goes only
 * when edited, and then with every member this form doesn't show carried over from `ticket`.
 */
export function changedUpdateInput(
  values: TicketFormValues,
  initial: TicketFormValues,
  ticket: DetailTicket,
): UpdateTicketInput {
  const next = toUpdateTicketInput(values);
  const before = toUpdateTicketInput(initial);
  const changed: UpdateTicketInput = {};
  for (const key of Object.keys(next) as (keyof UpdateTicketInput)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(before[key])) {
      Object.assign(changed, { [key]: next[key] });
    }
  }
  if (isCoarseTicket(ticket)) {
    // What this viewer saw was blanked by the backend, not the ticket's own.
    delete changed.description;
    delete changed.secondaryLocation;
  }
  if (changed.secondaryLocation) {
    // Without an addressToken the backend stores an edited address as unverified (accepted limit).
    changed.secondaryLocation = {
      ...carriedLocation(ticket),
      ...changed.secondaryLocation,
    };
  }
  return changed;
}

/** The fields an error points at, as the form names them, for its 尚有 N 項未完成 summary. */
const MISSING_LABELS: [prefix: string, label: string][] = [
  ['title', '任務標題'],
  ['fullAddress', '地址'],
  ['point', '地標'],
  ['contactName', '現場聯絡人'],
  ['needs', '需求'],
  ['photoUrls', '現場照片'],
];

/**
 * The form's errors as the summary under it lists them (prototype 「請補齊：…」): each field once,
 * in the form's order, every need error counted as one 需求.
 */
export function ticketFormErrorSummary(errors: TicketFormErrors): string[] {
  const keys = Object.keys(errors).filter(
    (key) => errors[key as keyof TicketFormErrors],
  );
  return MISSING_LABELS.filter(([prefix]) =>
    keys.some((key) => key === prefix || key.startsWith(`${prefix}.`)),
  ).map(([, label]) => label);
}

/**
 * What to attach and detach to turn `before` into `after`. Links may repeat, so they are counted:
 * each link kept holds on to one photo, and photos left over are detached.
 */
export function photoChanges(
  before: { uuid: string; url: string }[],
  after: string[],
): { attach: string[]; detach: string[] } {
  const left = [...before];
  const attach: string[] = [];
  for (const url of after) {
    const at = left.findIndex((photo) => photo.url === url);
    if (at >= 0) left.splice(at, 1);
    else attach.push(url);
  }
  return { attach, detach: left.map((photo) => photo.uuid) };
}
