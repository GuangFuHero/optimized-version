/**
 * 修改建議: which of a station's fields the public may suggest, and the form's rules. One suggestion
 * is one field, its value now → the suggested one (PUB-FEAT-001 AC-10; prototype
 * `Design/前台/js/site/site-actions.jsx:9-48`). The backend accepts a few more (`level`,
 * `visibility`); the site offers what the public can see and judge.
 */

import type { CreateStationSuggestionInput } from '@rescue-frontend/data-access';

import { STATION_TYPE_OPTIONS } from '../type-options';

/** Both the value and the note: the backend refuses free text past this (`services/suggestion.py`). */
export const SUGGESTION_TEXT_MAX_LENGTH = 1000;

export type StationSuggestionFieldName =
  | 'operational_status'
  | 'op_hour'
  | 'name'
  | 'description'
  | 'type'
  | 'supply_status';

/** The station as the form reads it: the values now, and which fields already have a suggestion. */
export interface StationSuggestionSnapshot {
  name?: string | null;
  type?: string | null;
  description?: string | null;
  opHour?: string | null;
  operationalStatus?: string | null;
  supplyStatus?: string | null;
  pendingSuggestedFields?: readonly string[] | null;
}

export interface StationSuggestionChoice {
  value: string;
  label: string;
}

export interface StationSuggestionField {
  name: StationSuggestionFieldName;
  label: string;
  /** Picked among `choices`, or typed. */
  kind: 'choice' | 'text';
  choices?: readonly StationSuggestionChoice[];
  placeholder?: string;
  helper?: string;
  read: (station: StationSuggestionSnapshot) => string;
}

// The site's words for the three, not the prototype form's 開放中: the detail says 營運中.
const OPERATIONAL_STATUS_CHOICES: readonly StationSuggestionChoice[] = [
  { value: 'active', label: '營運中' },
  { value: 'temporarily_closed', label: '暫停服務' },
  { value: 'permanently_closed', label: '已關閉' },
];

/**
 * Whether the station still runs comes first: 「這站關了」 is a change to it, not a report of another
 * kind (2026-08-21), and someone who goes there for nothing pays for it the most. No promise that it
 * is reviewed first: the review queue does not sort by field yet.
 */
export const STATION_SUGGESTION_FIELDS: readonly StationSuggestionField[] = [
  {
    name: 'operational_status',
    label: '營運狀態',
    kind: 'choice',
    choices: OPERATIONAL_STATUS_CHOICES,
    helper: '站點現在還開不開？',
    // A station without one is running, as the backend defaults it.
    read: (station) => station.operationalStatus || 'active',
  },
  {
    name: 'op_hour',
    label: '服務時間',
    kind: 'text',
    placeholder: '例：08:00–18:00',
    helper: '照現場實際看到的招牌或公告填寫。',
    read: (station) => station.opHour ?? '',
  },
  {
    name: 'name',
    label: '站點名稱',
    kind: 'text',
    placeholder: '現場實際掛的名稱',
    read: (station) => station.name ?? '',
  },
  {
    name: 'description',
    label: '地址／位置說明',
    kind: 'text',
    placeholder: '例：改到體育館後方，正門已封閉',
    read: (station) => station.description ?? '',
  },
  {
    name: 'type',
    label: '站點類型',
    kind: 'choice',
    // Only the site's types: the backend takes any text here, and the map knows no other.
    choices: STATION_TYPE_OPTIONS,
    read: (station) => station.type ?? '',
  },
  {
    name: 'supply_status',
    label: '物資狀況',
    kind: 'text',
    placeholder: '例：飲用水見底、尿布尚有存量',
    helper: '缺什麼比有什麼更能驅動行動，優先寫缺的。',
    read: (station) => station.supplyStatus ?? '',
  },
];

export function stationSuggestionField(
  name: StationSuggestionFieldName,
): StationSuggestionField {
  return (
    STATION_SUGGESTION_FIELDS.find((field) => field.name === name) ??
    STATION_SUGGESTION_FIELDS[0]
  );
}

/** A value as the form shows it: a choice by its label, an empty one as 未提供. */
export function describeSuggestionValue(
  field: StationSuggestionField,
  value: string,
): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '未提供';
  }

  return (
    field.choices?.find((choice) => choice.value === trimmed)?.label ?? trimmed
  );
}

export interface StationSuggestionForm {
  field: StationSuggestionFieldName;
  value: string;
  note: string;
}

/** The form as it opens on a field: the value now, ready to be changed. */
export function startSuggestion(
  station: StationSuggestionSnapshot,
  name: StationSuggestionFieldName,
  note = '',
): StationSuggestionForm {
  return {
    field: name,
    value: stationSuggestionField(name).read(station),
    note,
  };
}

/**
 * Why the form cannot be sent yet, or null when it can. Nothing to review in a value left as it is,
 * nor in a blank one: a station that is no longer short of anything says so (「目前不缺」), and
 * clearing the line is the back office's to do.
 */
export function suggestionProblem(
  station: StationSuggestionSnapshot,
  form: StationSuggestionForm,
): string | null {
  const field = stationSuggestionField(form.field);
  const value = form.value.trim();

  if (!value) {
    return field.kind === 'choice'
      ? `請選擇${field.label}`
      : `請填寫${field.label}`;
  }

  if (value === field.read(station).trim()) {
    return '和目前一樣，改了才能送出';
  }

  if (value.length > SUGGESTION_TEXT_MAX_LENGTH) {
    return `${field.label}最多 ${SUGGESTION_TEXT_MAX_LENGTH} 字`;
  }

  if (form.note.trim().length > SUGGESTION_TEXT_MAX_LENGTH) {
    return `補充說明最多 ${SUGGESTION_TEXT_MAX_LENGTH} 字`;
  }

  return null;
}

/** Someone has already suggested this field and it waits for review — who, and what, is not public. */
export function hasPendingSuggestion(
  station: StationSuggestionSnapshot,
  name: StationSuggestionFieldName,
): boolean {
  return station.pendingSuggestedFields?.includes(name) ?? false;
}

export function toCreateStationSuggestionInput(
  stationUuid: string,
  form: StationSuggestionForm,
): CreateStationSuggestionInput {
  return {
    targetType: 'station',
    targetUuid: stationUuid,
    fieldName: form.field,
    newValue: form.value.trim(),
    comment: form.note.trim() || null,
  };
}
