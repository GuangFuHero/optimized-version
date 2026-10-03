import { describe, expect, it } from 'vitest';

import { sitePortalEntry } from './portal-entry';

describe('sitePortalEntry', () => {
  it('shows a guest neither entry — there is no one to take anywhere (IAM-PS-102)', () => {
    expect(sitePortalEntry(false, { hasBackofficeIdentity: true })).toBe(
      'none',
    );
    expect(sitePortalEntry(false, null)).toBe('none');
  });

  it('shows nothing until the identities are known, rather than guess and switch', () => {
    expect(sitePortalEntry(true, null)).toBe('none');
  });

  it('takes someone with a back-office identity to the back office', () => {
    expect(sitePortalEntry(true, { hasBackofficeIdentity: true })).toBe(
      'backOffice',
    );
  });

  it('offers everyone else the application', () => {
    expect(sitePortalEntry(true, { hasBackofficeIdentity: false })).toBe(
      'apply',
    );
  });
});
