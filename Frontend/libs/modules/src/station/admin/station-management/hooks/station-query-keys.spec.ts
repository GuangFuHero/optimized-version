import { allStationsQuery } from '@rescue-frontend/data-access/admin';
import { describe, expect, it } from 'vitest';

describe('all stations query', () => {
  it('sits under the key every station mutation invalidates', () => {
    const { queryKey } = allStationsQuery({ hasPendingSuggestions: true });
    expect(queryKey.slice(0, 2)).toEqual(['admin', 'stations']);
  });
});
