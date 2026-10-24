import type { components } from '@rescue-frontend/data-access/openapi';
import {
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { z } from 'zod';

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
  ['task', '任務'],
  ['task_property', '任務資源'],
  ['task_assignment', '任務指派'],
  ['station_property', '站點資源'],
  ['secondary_location', '位置'],
]);

const changeValue = z
  .union([
    z.string(),
    z.null().transform(() => '未設定'),
    z.json().transform((value) => JSON.stringify(value)),
  ])
  .catch('未設定');

export function backendEventsToTimelineItems(
  events: readonly components['schemas']['HistoryEventResponse'][],
): TimelineItem[] {
  return events.map((item, index) => {
    const event = EVENTS.find((event) => event.type === item.event_type);
    const actor =
      item.actor.name ??
      (item.actor.kind === 'system' ? '系統' : item.actor.kind);

    return {
      id: `${item.entity}:${item.at}:${item.event_type}:${index}`,
      title: `${event?.label ?? item.event_type} · ${ENTITY_LABELS.get(item.entity) ?? item.entity}`,
      at: item.at,
      actor: `${actor}${item.actor.is_removed ? '（已移除）' : ''}`,
      tone: event?.tone ?? 'neutral',
      icon: event ? <event.Icon /> : undefined,
      content: item.changes.length
        ? item.changes.map((change, changeIndex) => (
            <TimelineChange
              key={`${change.field}:${changeIndex}`}
              change={
                change.changed
                  ? { field: change.field, kind: 'withheld' }
                  : {
                      field: change.field,
                      kind: 'values',
                      before: changeValue.parse(change.before),
                      after: changeValue.parse(change.after),
                    }
              }
            />
          ))
        : undefined,
    } satisfies TimelineItem;
  });
}
