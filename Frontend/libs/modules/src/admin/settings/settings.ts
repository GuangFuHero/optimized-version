import { format, isValid, parseISO } from 'date-fns';

/** The backend's own limits (`ProjectSettingsUpdate`), held in the field so a save never 422s on them. */
export const NAME_MAX_LENGTH = 100;
export const SHORT_NAME_MAX_LENGTH = 30;

export interface EventBasicsDraft {
  name: string;
  shortName: string;
}

export function nameProblem(name: string): string | null {
  return name.trim() ? null : '名稱不能空白';
}

/**
 * The PATCH body for 名稱 and 簡稱, which save together. A blank short name goes as null: the site then
 * shows the full name. Nothing else rides along, so the other settings keep what they hold.
 */
export function basicsBody(draft: EventBasicsDraft) {
  return {
    name: draft.name.trim(),
    short_name: draft.shortName.trim() || null,
  };
}

/** A stored start as `datetime-local` wants it, in the browser's zone, as the sidebar counts days. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = parseISO(iso);
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

/** `datetime-local` has no zone: it is the browser's, so it is read as local time. */
export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

export function startedAtProblem(value: string, now: Date): string | null {
  const date = value ? new Date(value) : null;
  if (!date || !isValid(date)) return '請選擇時間';
  return date.getTime() > now.getTime() ? '起始時間不能是未來' : null;
}

export function formatStartedAt(iso: string): string {
  return toDateTimeLocal(iso).replace('T', ' ');
}

interface DisasterTypeEntry {
  key: string;
  label: string;
  isActive: boolean;
}

export function addableDisasterTypes<T extends DisasterTypeEntry>(
  vocab: readonly T[],
  selected: readonly string[],
): T[] {
  return vocab.filter((type) => type.isActive && !selected.includes(type.key));
}

/** A retired type has no entry in the active list, so its key stands in for the label. */
export function disasterTypeLabel(
  vocab: readonly DisasterTypeEntry[],
  key: string,
): string {
  return vocab.find((type) => type.key === key)?.label ?? key;
}

/** The event keeps at least one type (prototype `st-app.jsx`, the chip's remove button). */
export function canRemoveDisasterType(selected: readonly string[]): boolean {
  return selected.length > 1;
}

/**
 * The fields this disaster brings to a ticket. `ticketPropertyConfigs` also returns the universal
 * fields, scoped to no disaster, which stay whatever the event's types are, so they are not counted.
 */
export function fieldCountFor(
  configs: readonly { disasterTypes: readonly string[] }[],
  key: string,
): number {
  return configs.filter((config) => config.disasterTypes.includes(key)).length;
}
