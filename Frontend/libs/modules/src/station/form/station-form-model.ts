import type {
  AdminStationQuery,
  CreateStationInput,
  SecondaryLocationInput,
  UpdateStationInput,
} from '@rescue-frontend/data-access/admin';

import { updateAddressFields } from '../../admin/shared/model/address-fill';
import type { OperationalStatus } from '../operational-status';
import { stationPoint } from '../station-point';

export type StationLocationType = 'address' | 'pole';

export interface StationFormState {
  name: string;
  type: string;
  description: string;
  opHour: string;
  operationalStatus: OperationalStatus;
  supplyStatus: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  latitude: string;
  longitude: string;
  locationType: StationLocationType;
  /** The one address line the backend splits into its parts (縣市 … 號). */
  fullAddress: string;
  /**
   * The TGOS lookup's token for `fullAddress`, or ''. Sent with the unchanged line, it saves the
   * address as verified; editing the line drops it, and the address is saved unverified.
   */
  addressToken: string;
  floor: string;
  room: string;
  poleId: string;
  poleType: string;
  poleNote: string;
}

export type StationFormErrors = Partial<Record<keyof StationFormState, string>>;

type Station = NonNullable<AdminStationQuery['station']>;

const TEXT_FIELDS = [
  'name',
  'type',
  'description',
  'opHour',
  'supplyStatus',
  'contactName',
  'contactPhone',
  'contactEmail',
] as const;

const ADDRESS_FIELDS = ['fullAddress', 'floor', 'room'] as const;

const POLE_FIELDS = ['poleId', 'poleType', 'poleNote'] as const;

export function emptyStationForm(
  position?: readonly [number, number] | null,
): StationFormState {
  return {
    name: '',
    type: '',
    description: '',
    opHour: '',
    operationalStatus: 'active',
    supplyStatus: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    latitude: position ? String(position[0]) : '',
    longitude: position ? String(position[1]) : '',
    locationType: 'address',
    fullAddress: '',
    addressToken: '',
    floor: '',
    room: '',
    poleId: '',
    poleType: '',
    poleNote: '',
  };
}

export function stationToForm(station: Station): StationFormState {
  const [lat, lng] = stationPoint(station.geometry) ?? [];
  const location = station.secondaryLocation;
  const read = (value: string | null | undefined) => value ?? '';

  return {
    name: read(station.name),
    type: read(station.type),
    description: read(station.description),
    opHour: read(station.opHour),
    operationalStatus: station.operationalStatus as OperationalStatus,
    supplyStatus: read(station.supplyStatus),
    contactName: read(station.contactName),
    contactPhone: read(station.contactPhone),
    contactEmail: read(station.contactEmail),
    latitude: lat == null ? '' : String(lat),
    longitude: lng == null ? '' : String(lng),
    locationType: location?.poleId ? 'pole' : 'address',
    fullAddress: read(location?.fullAddress),
    addressToken: '',
    floor: read(location?.floor),
    room: read(location?.room),
    poleId: read(location?.poleId),
    poleType: read(location?.poleType),
    poleNote: read(location?.poleNote),
  };
}

/** One field typed into the form. A new address line no longer matches the lookup's token. */
export function updateStationForm<K extends keyof StationFormState>(
  form: StationFormState,
  key: K,
  value: StationFormState[K],
): StationFormState {
  return updateAddressFields(form, {
    [key]: value,
  } as Partial<StationFormState>);
}

function validCoordinate(value: string, max: number): boolean {
  if (value.trim() === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= max;
}

export function validateStationForm(form: StationFormState): StationFormErrors {
  const errors: StationFormErrors = {};
  if (!form.name.trim()) errors.name = '請輸入站點名稱';
  if (!form.type) errors.type = '請選擇類型';
  if (!validCoordinate(form.latitude, 90)) errors.latitude = '請輸入有效的緯度';
  if (!validCoordinate(form.longitude, 180))
    errors.longitude = '請輸入有效的經度';
  return errors;
}

/** The form's position as `[lat, lng]`, or null while the coordinates don't parse. */
export function formPosition(form: StationFormState): [number, number] | null {
  if (!validCoordinate(form.latitude, 90)) return null;
  if (!validCoordinate(form.longitude, 180)) return null;
  return [Number(form.latitude), Number(form.longitude)];
}

const point = (form: StationFormState) => ({
  type: 'Point' as const,
  coordinates: [Number(form.longitude), Number(form.latitude)],
});

function filledFields<K extends keyof StationFormState>(
  form: StationFormState,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const filled: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = String(form[key]).trim();
    if (value) filled[key] = value;
  }
  return filled;
}

function secondaryLocation(
  form: StationFormState,
): SecondaryLocationInput | undefined {
  const parts = {
    ...filledFields(form, ADDRESS_FIELDS),
    ...(form.locationType === 'pole' ? filledFields(form, POLE_FIELDS) : {}),
  };
  if (Object.keys(parts).length === 0) return undefined;
  const token = parts.fullAddress ? form.addressToken : '';
  return {
    locationType: form.locationType,
    ...parts,
    ...(token ? { addressToken: token } : {}),
  };
}

/**
 * A station created from the admin portal is official (decided 2026-10-15). The public site can't
 * create stations, so `official` is what `/stations` and the admin map ask for; without it `source`
 * is left out and the backend's default applies.
 */
export function buildCreateInput(
  form: StationFormState,
  { official = false }: { official?: boolean } = {},
): CreateStationInput {
  const location = secondaryLocation(form);
  return {
    ...filledFields(form, TEXT_FIELDS),
    ...(location ? { secondaryLocation: location } : {}),
    geometry: point(form),
    operationalStatus: form.operationalStatus,
    ...(official ? { source: 'official' } : {}),
    visibility: 'public',
  } as CreateStationInput;
}

/**
 * Only the fields the user changed. A field left alone is never sent, so a contact value the
 * backend masked for this viewer can't be written back over the real one. The address is never
 * sent: `UpdateStationInput` cannot change a station's secondary location.
 */
export function buildUpdateInput(
  form: StationFormState,
  original: StationFormState,
): UpdateStationInput {
  const input: Record<string, unknown> = {};
  for (const key of TEXT_FIELDS) {
    if (form[key].trim() !== original[key].trim())
      input[key] = form[key].trim();
  }
  if (form.operationalStatus !== original.operationalStatus) {
    input.operationalStatus = form.operationalStatus;
  }
  if (
    form.latitude !== original.latitude ||
    form.longitude !== original.longitude
  ) {
    input.geometry = point(form);
  }
  return input as UpdateStationInput;
}
