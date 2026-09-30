import { describe, expect, it } from 'vitest';

import { formatTicketStatusLabel } from './status';

describe('formatTicketStatusLabel', () => {
  it('calls a need that has its people 已滿足需求, not 已完成 — nobody on it has gone yet', () => {
    expect(formatTicketStatusLabel('fulfilled')).toBe('已滿足需求');
    // A ticket with no need left open is still 已完成 (team decision 2026-09-28).
    expect(formatTicketStatusLabel('completed')).toBe('已完成');
  });
});
