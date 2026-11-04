import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  backendEventsToTimelineItems,
  type HistoryLabels,
} from './backend-events';

const labels: HistoryLabels = {
  fields: {
    title: '標題',
    task_type: '需求種類',
    disaster_types: '災害類型',
    geometry: '位置',
    audit_status: '資料檢核',
  },
  value: (_entity, _field, value) => (value === 'hr' ? '人力' : value),
  hideOnCreate: (field, value) =>
    field === 'audit_status' && value === 'no_audit',
};

const actor = { uuid: 'u', name: '王小明', kind: 'user', is_removed: false };

function changes(event_type: string, list: object[]) {
  const [item] = backendEventsToTimelineItems(
    [
      {
        event_type,
        at: '2026-11-03T15:07:00Z',
        entity: 'ticket',
        actor,
        changes: list,
      },
    ] as never,
    labels,
  );
  return renderToStaticMarkup(<div>{item.content}</div>);
}

describe('backendEventsToTimelineItems', () => {
  it('lists a creation as what was filled in, in the field order', () => {
    const html = changes('CREATED', [
      { field: 'geometry', before: null, after: null, changed: true },
      { field: 'task_type', before: null, after: 'hr' },
      { field: 'disaster_types', before: null, after: [] },
      { field: 'audit_status', before: null, after: 'no_audit' },
      { field: 'title', before: null, after: 'new station' },
    ]);
    expect(html).not.toContain('未設定');
    expect(html).not.toContain('災害類型');
    expect(html).not.toContain('資料檢核');
    expect(html).toContain('已填寫，內容未公開');
    expect(html).toContain('人力');
    expect(html.indexOf('標題')).toBeLessThan(html.indexOf('需求種類'));
    expect(html.indexOf('需求種類')).toBeLessThan(html.indexOf('位置'));
  });

  it('shows an update as before and after, 未設定 for an empty side', () => {
    const html = changes('UPDATED', [
      { field: 'task_type', before: null, after: 'hr' },
    ]);
    expect(html).toContain('需求種類');
    expect(html).toContain('未設定');
    expect(html).toContain('人力');
  });

  it('joins a list and words a boolean', () => {
    const html = changes('UPDATED', [
      { field: 'disaster_types', before: ['a', 'b'], after: [] },
      { field: 'is_official', before: false, after: true },
    ]);
    expect(html).toContain('a、b');
    expect(html).toContain('否');
    expect(html).toContain('是');
  });

  it('keeps a field it has no word for as it is', () => {
    expect(
      changes('UPDATED', [{ field: 'brand_new', before: 'x', after: 'y' }]),
    ).toContain('brand_new');
  });
});
