import { describe, expect, it } from 'vitest';

import {
  adminTicketPriorityBadge,
  adminTicketPriorityLabel,
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

describe('adminTicketPriorityBadge', () => {
  it('makes only 生命危急 solid red', () => {
    expect(adminTicketPriorityBadge('critical')).toEqual({
      label: '生命危急',
      tone: 'danger',
      variant: 'solid',
    });
    expect(adminTicketPriorityBadge('high')).toEqual({
      label: '緊急',
      tone: 'warning',
      variant: 'subtle',
    });
  });

  it('gives 一般 and 低 no badge', () => {
    expect(adminTicketPriorityBadge('medium')).toBeNull();
    expect(adminTicketPriorityBadge('low')).toBeNull();
    expect(adminTicketPriorityBadge(undefined)).toBeNull();
  });
});
