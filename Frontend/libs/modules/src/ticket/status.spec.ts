import { describe, expect, it } from 'vitest';

import {
  formatTicketStatusLabel,
  getTicketPriorityBadge,
  getTicketPriorityLabel,
} from './status';

describe('formatTicketStatusLabel', () => {
  it('calls a need that has its people 已滿足需求, not 已完成 — nobody on it has gone yet', () => {
    expect(formatTicketStatusLabel('fulfilled')).toBe('已滿足需求');
    // A ticket with no need left open is still 已完成, as the team decided.
    expect(formatTicketStatusLabel('completed')).toBe('已完成');
  });
});

describe('getTicketPriorityBadge', () => {
  it('marks a critical ticket 最高優先, in solid danger wherever it shows', () => {
    const critical = { label: '最高優先', tone: 'danger', variant: 'solid' };

    expect(getTicketPriorityBadge('critical')).toEqual(critical);
    expect(getTicketPriorityBadge('critical', { high: 'solid' })).toEqual(
      critical,
    );
  });

  it('marks a high one 高優先 in warning, subtle unless the place asks for solid', () => {
    expect(getTicketPriorityBadge('high')).toEqual({
      label: '高優先',
      tone: 'warning',
      variant: 'subtle',
    });
    expect(getTicketPriorityBadge('high', { high: 'solid' })).toEqual({
      label: '高優先',
      tone: 'warning',
      variant: 'solid',
    });
  });

  it('gives the rest no badge at all', () => {
    expect(getTicketPriorityBadge('medium')).toBeNull();
    expect(getTicketPriorityBadge('low')).toBeNull();
    expect(getTicketPriorityBadge(null)).toBeNull();
    expect(getTicketPriorityBadge(undefined)).toBeNull();
    expect(getTicketPriorityBadge('urgent')).toBeNull();
  });

  it('reads the value as the backend may spell it, in any case and with spaces around', () => {
    expect(getTicketPriorityBadge(' Critical ')?.label).toBe('最高優先');
    expect(getTicketPriorityBadge('HIGH')?.label).toBe('高優先');
  });
});

describe('getTicketPriorityLabel', () => {
  it('words all four priorities, matching the badge for the top two', () => {
    expect(getTicketPriorityLabel('critical')).toBe(
      getTicketPriorityBadge('critical')?.label,
    );
    expect(getTicketPriorityLabel('high')).toBe(
      getTicketPriorityBadge('high')?.label,
    );
    expect(getTicketPriorityLabel(' Medium ')).toBe('中優先');
    expect(getTicketPriorityLabel('low')).toBe('低優先');
  });

  it('is null for anything else', () => {
    expect(getTicketPriorityLabel('urgent')).toBeNull();
    expect(getTicketPriorityLabel(null)).toBeNull();
  });
});
