import type {
  AdminStationQuery,
  CreateStationInput,
  UpdateStationInput,
} from '@rescue-frontend/data-access/admin';

import type { OperationalStatus } from './status';

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
}

export type StationFormErrors = Partial<Record<keyof StationFormState, string>>;

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

export function emptyStationForm(position?: [number, number]): StationFormState {
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
  };
}

export function stationToForm(
  station: NonNullable<AdminStationQuery['station']>,
): StationFormState {
  const point = station.geometry as { coordinates?: number[] } | null;
  const [lng, lat] = point?.coordinates ?? [];
  return {
    name: station.name ?? '',
    type: station.type ?? '',
    description: station.description ?? '',
    opHour: station.opHour ?? '',
    operationalStatus: station.operationalStatus as OperationalStatus,
    supplyStatus: station.supplyStatus ?? '',
    contactName: station.contactName ?? '',
    contactPhone: station.contactPhone ?? '',
    contactEmail: station.contactEmail ?? '',
    latitude: lat == null ? '' : String(lat),
    longitude: lng == null ? '' : String(lng),
  };
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
  if (!validCoordinate(form.longitude, 180)) errors.longitude = '請輸入有效的經度';
  return errors;
}

const point = (form: StationFormState) => ({
  type: 'Point' as const,
  coordinates: [Number(form.longitude), Number(form.latitude)],
});

/** Every station created from the admin portal is official (decided 2026-10-15). */
export function buildCreateInput(form: StationFormState): CreateStationInput {
  const text: Record<string, string> = {};
  for (const key of TEXT_FIELDS) {
    const value = form[key].trim();
    if (value) text[key] = value;
  }
  return {
    ...text,
    geometry: point(form),
    operationalStatus: form.operationalStatus,
    source: 'official',
    visibility: 'public',
  } as CreateStationInput;
}

/**
 * Only the fields the user changed. A field left alone is never sent, so a contact value the
 * backend masked for this viewer can't be written back over the real one.
 */
export function buildUpdateInput(
  form: StationFormState,
  original: StationFormState,
): UpdateStationInput {
  const input: Record<string, unknown> = {};
  for (const key of TEXT_FIELDS) {
    if (form[key].trim() !== original[key].trim()) input[key] = form[key].trim();
  }
  if (form.operationalStatus !== original.operationalStatus) {
    input.operationalStatus = form.operationalStatus;
  }
  if (form.latitude !== original.latitude || form.longitude !== original.longitude) {
    input.geometry = point(form);
  }
  return input as UpdateStationInput;
}
