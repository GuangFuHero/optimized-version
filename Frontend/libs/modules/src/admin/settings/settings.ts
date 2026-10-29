import {
  fromTaiwanDateTimeLocal,
  toTaiwanDateTimeLocal,
} from '../../time/taiwan-time';

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

/**
 * Whether saving would change anything: what is sent is trimmed, so spaces alone leave nothing to save,
 * and nothing saying so once the save is done.
 */
export function basicsChanged(
  draft: EventBasicsDraft,
  saved: EventBasicsDraft,
): boolean {
  const body = basicsBody(draft);
  return (
    body.name !== saved.name || (body.short_name ?? '') !== saved.shortName
  );
}

/**
 * The start is read and typed in Taiwan time, whatever the device's zone, as every time on the site is
 * shown: a volunteer helping from abroad sees and saves the same moment.
 */
export function toDateTimeLocal(iso: string | null | undefined): string {
  return toTaiwanDateTimeLocal(iso);
}

/** Empty for what is not a time, which `startedAtProblem` stops first. */
export function fromDateTimeLocal(value: string): string {
  return fromTaiwanDateTimeLocal(value)?.toISOString() ?? '';
}

export function startedAtProblem(value: string, now: Date): string | null {
  const date = fromTaiwanDateTimeLocal(value);
  if (!date) return '請選擇時間';
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
