import { allTicketsQuery } from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

describe('all tickets query', () => {
  it('sits under the key every ticket mutation invalidates', () => {
    const { queryKey } = allTicketsQuery({ status: 'pending' });
    expect(queryKey.slice(0, 2)).toEqual(['admin', 'tickets']);
  });
});
