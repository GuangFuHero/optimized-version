import { describe, expect, it } from 'vitest';

import {
  adminTicketPriorityLabel,
  adminTicketPriorityTag,
} from './ticket-priority';

describe('adminTicketPriorityLabel', () => {
  it('names the four priorities as the design does', () => {
    expect(
      ['critical', 'high', 'medium', 'low'].map(adminTicketPriorityLabel),
    ).toEqual(['生命危急', '緊急', '一般', '低']);
  });

  it('reads a padded or upper-case value, and nothing else', () => {
    expect(adminTicketPriorityLabel(' High ')).toBe('緊急');
    expect(adminTicketPriorityLabel('urgent')).toBeNull();
    expect(adminTicketPriorityLabel('toString')).toBeNull();
    expect(adminTicketPriorityLabel(null)).toBeNull();
  });
});

describe('adminTicketPriorityTag', () => {
  it('makes only 生命危急 solid red, and 緊急 a pale warning', () => {
    expect(adminTicketPriorityTag('critical')).toEqual({
      label: '生命危急',
      tone: 'danger',
      fill: 'solid',
    });
    expect(adminTicketPriorityTag('high')).toEqual({
      label: '緊急',
      tone: 'warning',
      fill: 'subtle',
    });
  });

  it('gives 一般 and 低 quiet grey words', () => {
    expect(adminTicketPriorityTag('medium')).toEqual({
      label: '一般',
      tone: 'neutral',
      fill: 'quiet',
    });
    expect(adminTicketPriorityTag(' LOW ')).toMatchObject({ fill: 'quiet' });
  });

  it('gives none for a value the backend does not store', () => {
    expect(adminTicketPriorityTag('urgent')).toBeNull();
    expect(adminTicketPriorityTag(undefined)).toBeNull();
  });
});
