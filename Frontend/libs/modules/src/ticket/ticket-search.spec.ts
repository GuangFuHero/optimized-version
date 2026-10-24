import { describe, expect, it } from 'vitest';

import { resolveTicketSearch } from './ticket-search';

describe('resolveTicketSearch', () => {
  it('searches nothing without a term', () => {
    expect(resolveTicketSearch(undefined)).toEqual({ kind: 'none' });
    expect(resolveTicketSearch('   ')).toEqual({ kind: 'none' });
  });

  it('asks for a second character: the backend takes 2 to 50', () => {
    expect(resolveTicketSearch('醫')).toEqual({ kind: 'too-short' });
    expect(resolveTicketSearch(' 水 ')).toEqual({ kind: 'too-short' });
  });

  it('sends a term of 2 to 50 characters as it is, trimmed', () => {
    expect(resolveTicketSearch(' 清淤 ')).toEqual({ kind: 'query', q: '清淤' });
    expect(resolveTicketSearch('醫'.repeat(50))).toEqual({
      kind: 'query',
      q: '醫'.repeat(50),
    });
  });

  it('sends the first 50 characters of a longer term, which the backend would refuse whole', () => {
    expect(resolveTicketSearch('醫'.repeat(51))).toEqual({
      kind: 'query',
      q: '醫'.repeat(50),
    });
  });

  it('counts a character outside the BMP as one, as the backend does', () => {
    expect(resolveTicketSearch('🚑')).toEqual({ kind: 'too-short' });
  });
});
