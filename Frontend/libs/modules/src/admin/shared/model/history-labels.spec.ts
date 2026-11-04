import { describe, expect, it } from 'vitest';

import { historyLabels } from './history-labels';

describe('historyLabels', () => {
  const labels = historyLabels({ flood: '水災' });

  it('names a ticket as the board does', () => {
    expect(labels.fields.task_type).toBe('需求種類');
    expect(labels.value('ticket', 'task_type', 'hr')).toBe('人力');
    expect(labels.value('ticket', 'priority', 'medium')).toBe('一般');
    expect(labels.value('ticket', 'status', 'pending')).toBe('待處理');
    expect(labels.value('ticket', 'audit_status', 'audit_issue')).toBe(
      '有問題',
    );
  });

  it('names a station as its pages do', () => {
    expect(labels.value('station', 'type', 'water')).toBe('加水');
    expect(labels.value('station', 'operational_status', 'active')).toBe(
      '開設中',
    );
  });

  it('names a disaster type by the key it was given', () => {
    expect(labels.value('ticket', 'disaster_types', 'flood')).toBe('水災');
  });

  it('leaves a value it has no word for as stored', () => {
    expect(labels.value('ticket', 'disaster_types', 'retired')).toBe('retired');
    expect(labels.value('ticket', 'audit_status', 'new_state')).toBe(
      'new_state',
    );
    expect(labels.value('station_property', 'status', 'ok')).toBe('ok');
  });

  it('leaves out only what every new record starts with', () => {
    expect(labels.hideOnCreate('audit_status', 'no_audit')).toBe(true);
    expect(labels.hideOnCreate('audit_status', 'audited')).toBe(false);
    expect(labels.hideOnCreate('status', 'pending')).toBe(false);
  });
});
