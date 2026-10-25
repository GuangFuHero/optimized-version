import type {
  AdminStationReviewQuery,
  SuggestionDecisionInput,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';

import { getOperationalStatusMeta } from '../../../operational-status';

type HistoryEvent = components['schemas']['HistoryEventResponse'];

export const SUGGESTION_FIELD_LABELS: Record<string, string> = {
  name: '站點名稱',
  type: '類型',
  description: '說明',
  op_hour: '開放時間',
  level: 'level',
  visibility: '公開範圍',
  operational_status: '營運狀態',
  supply_status: '物資狀況',
  property_name: '資源名稱',
  quantity: '數量',
  comment: '備註',
};

/**
 * Suggestions store no base value, so a conflict starts as "this field changed after the first
 * suggestion on it". A history event names no row, but its raw audit rows (sent only with
 * `audit.view`) hold the whole row, uuid included, so a change is matched to the suggestion's own
 * resource when they are there. Without them a property field matches a change to that field on
 * any of the station's properties — it may warn when it need not, never the other way round.
 */
export function hasChangedSince(
  history: readonly HistoryEvent[],
  target: { type: string; uuid: string },
  fieldName: string,
  since: string | null,
): boolean {
  return changesSince(history, target, fieldName, since).length > 0;
}

/** The events that changed the field after `since`, newest first as the timeline sends them. */
function changesSince(
  history: readonly HistoryEvent[],
  target: { type: string; uuid: string },
  fieldName: string,
  since: string | null,
): HistoryEvent[] {
  if (!since) return [];
  const from = Date.parse(since);
  if (Number.isNaN(from)) return [];
  return history.filter(
    (event) =>
      event.entity === target.type &&
      Date.parse(event.at) > from &&
      event.changes.some((change) => change.field === fieldName) &&
      touchesRow(event, target.uuid),
  );
}

/**
 * The field's value when it was first suggested: the `before` of the first change after it. Null
 * when the change hides its values.
 */
function valueBefore(
  events: readonly HistoryEvent[],
  fieldName: string,
): string | null {
  const change = events
    .at(-1)
    ?.changes.find((candidate) => candidate.field === fieldName);
  if (!change || change.changed || change.before === undefined) return null;
  return change.before == null ? '' : String(change.before);
}

/** How many events precede `since`, as the version the station was at then. */
function versionAt(page: HistoryPage, since: string): number | null {
  if (!coversSince(page, since)) return null;
  const from = Date.parse(since);
  if (Number.isNaN(from)) return null;
  const after = page.events.filter((event) => Date.parse(event.at) > from);
  return page.total - after.length + 1;
}

/**
 * The station's version now and when its earliest pending suggestion came in (the prototype's
 * 「投稿時根據版本 v9」 and 「站點現為 v11」), counted as the drawer counts them: one per event, plus
 * one. Suggestions are kept per field, not per submission, so the earliest stands for them all.
 */
export function suggestionVersions(
  page: HistoryPage | null,
  fields: readonly Pick<ReviewField, 'firstSuggestedAt'>[],
): {
  current: number | null;
  base: number | null;
  firstSuggestedAt: string | null;
} {
  const times = fields
    .map((field) => field.firstSuggestedAt)
    .filter(
      (at): at is string => Boolean(at) && !Number.isNaN(Date.parse(at ?? '')),
    )
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const firstSuggestedAt = times[0] ?? null;
  if (!page) return { current: null, base: null, firstSuggestedAt };
  return {
    current: page.total + 1,
    base: firstSuggestedAt ? versionAt(page, firstSuggestedAt) : null,
    firstSuggestedAt,
  };
}

/** A suggested or current value as the page shows it: an operational status by its label. */
export function reviewValueLabel(fieldName: string, value: string): string {
  return fieldName === 'operational_status' && value
    ? getOperationalStatusMeta(value).label
    : value;
}

/** A page of a station's history, newest first, and how many events it has in all. */
export interface HistoryPage {
  events: readonly HistoryEvent[];
  total: number;
}

/**
 * Whether the page holds every event since `since`: it is the whole history, or its oldest event
 * is no newer than `since`. A missing `since` needs nothing, as `hasChangedSince` reads it as none.
 */
export function coversSince(page: HistoryPage, since: string | null): boolean {
  if (page.events.length >= page.total || !since) return true;
  const from = Date.parse(since);
  if (Number.isNaN(from)) return true;
  return page.events.some((event) => Date.parse(event.at) <= from);
}

/** Whether the event wrote this row; true when the event carries no raw rows to tell by. */
function touchesRow(event: HistoryEvent, uuid: string): boolean {
  if (!event.raw?.length) return true;
  return event.raw.some((row) =>
    [row['old_values'], row['new_values']].some(
      (values) =>
        typeof values === 'object' &&
        values !== null &&
        (values as Record<string, unknown>)['uuid'] === uuid,
    ),
  );
}

// Suggestion field names are column names; the GraphQL objects use camelCase.
const STATION_KEYS: Record<string, string> = {
  name: 'name',
  type: 'type',
  description: 'description',
  op_hour: 'opHour',
  level: 'level',
  visibility: 'visibility',
  operational_status: 'operationalStatus',
  supply_status: 'supplyStatus',
};
const PROPERTY_KEYS: Record<string, string> = {
  property_name: 'propertyName',
  quantity: 'quantity',
  comment: 'comment',
};

export interface ReviewField {
  key: string;
  targetType: 'station' | 'station_property';
  targetUuid: string;
  fieldName: string;
  label: string;
  currentValue: string;
  proposedValues: string[];
  suggestionCount: number;
  comments: string[];
  firstSuggestedAt: string | null;
  /** null when the history could not be read (no view_history, still loading, or failed). */
  conflict: boolean | null;
  /**
   * The value when the field was first suggested (the prototype's 投稿時的值): the live value
   * unless the field changed since, then the history's value from before that change. Null when
   * the history cannot tell.
   */
  baseValue: string | null;
}

export function buildReviewFields(
  review: AdminStationReviewQuery,
  history: HistoryPage | null,
): ReviewField[] {
  const station = review.station;
  if (!station) return [];
  return station.suggestedFields.map((s) => {
    const targetType =
      s.targetType === 'station_property' ? 'station_property' : 'station';
    const property = station.properties.find((p) => p.uuid === s.targetUuid);
    const source =
      targetType === 'station'
        ? (station as Record<string, unknown>)[
            STATION_KEYS[s.fieldName] ?? s.fieldName
          ]
        : (property as Record<string, unknown> | undefined)?.[
            PROPERTY_KEYS[s.fieldName] ?? s.fieldName
          ];
    const base = SUGGESTION_FIELD_LABELS[s.fieldName] ?? s.fieldName;
    const firstSuggestedAt = s.firstSuggestedAt ?? null;
    const currentValue = source == null || source === '' ? '' : String(source);
    const conflict = history
      ? conflictIn(
          history,
          targetType,
          s.targetUuid,
          s.fieldName,
          firstSuggestedAt,
        )
      : null;
    const changes = history
      ? changesSince(
          history.events,
          { type: targetType, uuid: s.targetUuid },
          s.fieldName,
          firstSuggestedAt,
        )
      : [];
    const baseValue =
      conflict === true
        ? valueBefore(changes, s.fieldName)
        : conflict === false
          ? currentValue
          : null;
    return {
      key: `${s.targetUuid}:${s.fieldName}`,
      targetType,
      targetUuid: s.targetUuid,
      fieldName: s.fieldName,
      label:
        targetType === 'station_property' && property
          ? `${property.propertyName}・${base}`
          : base,
      currentValue,
      proposedValues: s.proposedValues,
      suggestionCount: s.suggestionCount,
      comments: s.comments,
      firstSuggestedAt,
      // Changed and changed back is no conflict (the prototype's `live !== old`); a change that
      // hides its values stays one.
      conflict:
        conflict === true && baseValue === currentValue ? false : conflict,
      baseValue,
    };
  });
}

/** A change found is a conflict; none found is "no conflict" only when the page reaches back far enough. */
function conflictIn(
  page: HistoryPage,
  type: string,
  uuid: string,
  fieldName: string,
  since: string | null,
): boolean | null {
  if (hasChangedSince(page.events, { type, uuid }, fieldName, since))
    return true;
  return coversSince(page, since) ? false : null;
}

export type FieldDecision = { approve: boolean; value: string } | undefined;

// The integer and enum fields (backend `SUGGESTABLE_FIELDS`); a text field can be approved blank,
// which clears it.
const NEEDS_VALUE = new Set([
  'level',
  'visibility',
  'operational_status',
  'quantity',
]);

/** The merge decisions to send: only decided fields, and a number or choice needs a value. */
export function buildDecisions(
  fields: readonly Pick<ReviewField, 'key' | 'targetUuid' | 'fieldName'>[],
  decisions: Record<string, FieldDecision>,
): SuggestionDecisionInput[] {
  return fields.flatMap((field): SuggestionDecisionInput[] => {
    const decision = decisions[field.key];
    if (!decision) return [];
    if (!decision.approve) {
      return [
        {
          targetUuid: field.targetUuid,
          fieldName: field.fieldName,
          approve: false,
        },
      ];
    }
    const value = decision.value.trim();
    return value || !NEEDS_VALUE.has(field.fieldName)
      ? [
          {
            targetUuid: field.targetUuid,
            fieldName: field.fieldName,
            approve: true,
            value,
          },
        ]
      : [];
  });
}

/**
 * The queue label for a station. `pendingSuggestedFields` lists only the station's own fields, so
 * a station queued for suggestions on its resources alone has a count of zero.
 */
export function pendingFieldsLabel(stationFieldCount: number): string {
  return stationFieldCount > 0 ? `${stationFieldCount} 欄` : '資源待審';
}

/**
 * Whether a field known to conflict is set to be adopted, which would overwrite a later edit
 * blind; declining it or leaving it for later never does (the prototype's `blocked`).
 */
export function approvesConflict(
  fields: readonly Pick<ReviewField, 'key' | 'conflict'>[],
  decisions: Record<string, FieldDecision>,
): boolean {
  return fields.some(
    (field) => field.conflict === true && decisions[field.key]?.approve,
  );
}

/** Whether any field is known to conflict; an unknown conflict (no history) is not one. */
export function hasConflict(
  fields: readonly Pick<ReviewField, 'conflict'>[],
): boolean {
  return fields.some((field) => field.conflict === true);
}
