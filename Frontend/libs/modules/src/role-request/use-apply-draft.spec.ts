import { describe, expect, it } from 'vitest';

import { readSavedApplyDraft, type ApplyDraft } from './use-apply-draft';

const DRAFT: ApplyDraft = {
  role: 'ngo',
  team: 'new',
  newTeamName: '光復青年志工隊',
  reason: '協會的物資組長',
  name: '王志豪',
  phone: '0912345678',
};

describe('readSavedApplyDraft', () => {
  it('reads a draft back with the account that left it', () => {
    expect(
      readSavedApplyDraft(JSON.stringify({ userId: 'u-1', draft: DRAFT })),
    ).toEqual({ userId: 'u-1', draft: DRAFT });
    expect(
      readSavedApplyDraft(
        JSON.stringify({
          userId: 'u-1',
          draft: { ...DRAFT, role: null, team: null },
        }),
      ),
    ).toEqual({ userId: 'u-1', draft: { ...DRAFT, role: null, team: null } });
  });

  it('reads a draft of another shape as none', () => {
    expect(
      readSavedApplyDraft(
        JSON.stringify({
          userId: 'u-1',
          draft: { ...DRAFT, role: 'super_admin' },
        }),
      ),
    ).toBeNull();

    // One left before the form named a team.
    expect(
      readSavedApplyDraft(
        JSON.stringify({
          userId: 'u-1',
          draft: { role: 'ngo', reason: '物資組長', name: '王', phone: '' },
        }),
      ),
    ).toBeNull();

    // One with no account to give it back to.
    expect(
      readSavedApplyDraft(JSON.stringify({ v: 1, draft: DRAFT })),
    ).toBeNull();
  });
});
