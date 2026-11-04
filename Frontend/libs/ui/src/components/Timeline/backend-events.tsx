import type { components } from '@rescue-frontend/data-access/openapi';
import {
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';

import { TimelineChange, type TimelineItem } from './index';

const EVENTS = [
  { type: 'CREATED', label: '建立', tone: 'success', Icon: Plus },
  { type: 'UPDATED', label: '更新', tone: 'neutral', Icon: Pencil },
  { type: 'DELETED', label: '刪除', tone: 'danger', Icon: Trash2 },
  { type: 'RESTORED', label: '還原', tone: 'success', Icon: RotateCcw },
  { type: 'ASSIGNED', label: '指派', tone: 'primary', Icon: UserPlus },
  { type: 'UNASSIGNED', label: '解除指派', tone: 'secondary', Icon: UserMinus },
] as const;

const ENTITY_LABELS = new Map([
  ['ticket', '任務單'],
  ['station', '站點'],
  ['task', '需求'],
  ['task_property', '需求細項'],
  ['task_assignment', '承接人'],
  ['station_property', '站點資源'],
  ['secondary_location', '位置'],
]);

const ACTOR_LABELS = new Map([
  ['user', '使用者'],
  ['system', '系統'],
  ['crawler', '爬蟲'],
  ['gov', '政府'],
  ['ngo', '非政府組織'],
  ['official', '官方'],
]);

/** How a screen names a backend event's fields and values; it knows them, this adapter does not. */
export interface HistoryLabels {
  /** Field names to show, in the order a 建立 event lists them. */
  fields: Readonly<Record<string, string>>;
  value(entity: string, field: string, value: string): string;
  /** A value every new record starts with: nobody filled it in, so 建立 leaves it out. */
  hideOnCreate(field: string, value: string): boolean;
}

/** A change's value as a person reads it; null for one with nothing in it. */
function displayValue(
  entity: string,
  field: string,
  raw: unknown,
  labels?: HistoryLabels,
): string | null {
  if (Array.isArray(raw)) {
    const parts = raw.flatMap(
      (item) => displayValue(entity, field, item, labels) ?? [],
    );
    return parts.length ? parts.join('、') : null;
  }
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    return labels ? labels.value(entity, field, raw) : raw;
  }
  if (typeof raw === 'boolean') return raw ? '是' : '否';
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'number' ? String(raw) : JSON.stringify(raw);
}

function fieldOrder(field: string, labels?: HistoryLabels): number {
  const order = labels ? Object.keys(labels.fields).indexOf(field) : -1;
  return order === -1 ? Number.MAX_SAFE_INTEGER : order;
}

type HistoryChange =
  components['schemas']['HistoryEventResponse']['changes'][number];

function updateChange(
  entity: string,
  change: HistoryChange,
  labels?: HistoryLabels,
) {
  return change.changed
    ? ({ field: change.field, kind: 'withheld' } as const)
    : ({
        field: change.field,
        kind: 'values',
        before:
          displayValue(entity, change.field, change.before, labels) ?? '未設定',
        after:
          displayValue(entity, change.field, change.after, labels) ?? '未設定',
      } as const);
}

/** What a record was created with: every value has no before, so there is no 未設定 → 值 to show. */
function createdChanges(
  entity: string,
  changes: readonly HistoryChange[],
  labels?: HistoryLabels,
) {
  return changes
    .flatMap((change) => {
      const value = change.changed
        ? '已填寫，內容未公開'
        : displayValue(entity, change.field, change.after, labels);
      if (value === null) return [];
      if (
        !change.changed &&
        typeof change.after === 'string' &&
        labels?.hideOnCreate(change.field, change.after)
      ) {
        return [];
      }
      return [{ field: change.field, kind: 'value', value } as const];
    })
    .sort((a, b) => fieldOrder(a.field, labels) - fieldOrder(b.field, labels));
}

export function backendEventsToTimelineItems(
  events: readonly components['schemas']['HistoryEventResponse'][],
  labels?: HistoryLabels,
): TimelineItem[] {
  return events.map((item, index) => {
    const event = EVENTS.find((event) => event.type === item.event_type);
    const actor =
      item.actor.name ?? ACTOR_LABELS.get(item.actor.kind) ?? item.actor.kind;
    const changes =
      item.event_type === 'CREATED'
        ? createdChanges(item.entity, item.changes, labels)
        : item.changes.map((change) =>
            updateChange(item.entity, change, labels),
          );

    return {
      id: `${item.entity}:${item.at}:${item.event_type}:${index}`,
      title: `${event?.label ?? item.event_type} · ${ENTITY_LABELS.get(item.entity) ?? item.entity}`,
      at: item.at,
      actor: `${actor}${item.actor.is_removed ? '（已移除）' : ''}`,
      tone: event?.tone ?? 'neutral',
      icon: event ? <event.Icon /> : undefined,
      content: changes.length
        ? changes.map((change, changeIndex) => (
            <TimelineChange
              key={`${change.field}:${changeIndex}`}
              change={change}
              label={labels?.fields[change.field] ?? change.field}
            />
          ))
        : undefined,
    } satisfies TimelineItem;
  });
}
