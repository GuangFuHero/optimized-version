import type {
  AdminStationReviewQuery,
  SuggestionDecisionInput,
} from '@rescue-frontend/data-access/admin';
import type { TimelineItem } from '@rescue-frontend/ui';

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
 * Suggestions store no base value, so a conflict means "this field changed after the first
 * suggestion on it". History events carry no property uuid, so a property field matches a change
 * to that field on any of the station's properties — it may warn when it need not, never the
 * other way round.
 */
export function hasChangedSince(
  history: readonly TimelineItem[],
  targetType: string,
  fieldName: string,
  since: string | null,
): boolean {
  if (!since) return false;
  const from = Date.parse(since);
  if (Number.isNaN(from)) return false;
  return history.some(
    (event) =>
      event.entity === targetType &&
      Date.parse(event.at) > from &&
      event.changes.some((change) => change.field === fieldName),
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
}

export function buildReviewFields(
  review: AdminStationReviewQuery,
  history: readonly TimelineItem[] | null,
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
    return {
      key: `${s.targetUuid}:${s.fieldName}`,
      targetType,
      targetUuid: s.targetUuid,
      fieldName: s.fieldName,
      label:
        targetType === 'station_property' && property
          ? `${property.propertyName}・${base}`
          : base,
      currentValue: source == null || source === '' ? '' : String(source),
      proposedValues: s.proposedValues,
      suggestionCount: s.suggestionCount,
      comments: s.comments,
      firstSuggestedAt,
      conflict: history
        ? hasChangedSince(history, targetType, s.fieldName, firstSuggestedAt)
        : null,
    };
  });
}

export type FieldDecision = { approve: boolean; value: string } | undefined;

/** The merge decisions to send: only decided fields, and an approval needs a value. */
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
    return value
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
