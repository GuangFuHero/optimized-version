import { describe, expect, it } from 'vitest';

import { formatTicketNumber } from './ticket-number';

describe('formatTicketNumber', () => {
  it('is # and the first 8 characters of the uuid, upper case', () => {
    expect(formatTicketNumber('d0000000-0000-4000-8000-000000000051')).toBe(
      '#D0000000',
    );
    expect(formatTicketNumber('f83e783c-1e93-47d3-9007-8126b93dcc1e')).toBe(
      '#F83E783C',
    );
  });
});
