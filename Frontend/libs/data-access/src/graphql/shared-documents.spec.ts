import { describe, expect, it } from 'vitest';

import { AdminUpdateAreaDocument, GetAdminMapTicketsDocument } from '../index';

describe('the shared map documents', () => {
  it('names each responsible team by uuid as well as name, so the admin map can match an assignment by identity', () => {
    expect(String(GetAdminMapTicketsDocument)).toMatch(
      /responsibleTeams\s*{\s*uuid\s+name\s*}/,
    );
  });

  it('returns an area’s type on update, so the cache can tell whether its tickets may have moved', () => {
    const source = String(AdminUpdateAreaDocument);
    const updateArea = source.slice(source.indexOf('updateArea('));
    const fields = updateArea.slice(
      updateArea.indexOf('{') + 1,
      updateArea.indexOf('}'),
    );

    expect(fields).toMatch(/\buuid\b/);
    expect(fields).toMatch(/\btype\b/);
  });
});
