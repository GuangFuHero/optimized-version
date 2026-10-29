'use client';

import { useCallback } from 'react';
import { useSessionStorage } from 'usehooks-ts';
import { z } from 'zod';

import { RoleRequestRole } from '@rescue-frontend/data-access';

const applyDraftSchema = z.object({
  role: z.enum(RoleRequestRole).nullable(),
  team: z.string().nullable(),
  newTeamName: z.string(),
  reason: z.string(),
  name: z.string(),
  phone: z.string(),
});

/** The form as it was when the page left for LINE. */
export type ApplyDraft = z.infer<typeof applyDraftSchema>;

/** With the account that left it, so someone else signing in to the same tab does not get it. */
const savedApplyDraftSchema = z.object({
  userId: z.string(),
  draft: applyDraftSchema,
});

type SavedApplyDraft = z.infer<typeof savedApplyDraftSchema>;

// One key, the account inside: a key made from the uuid would change once the session is read, and
// the way back could look for the draft before the hook had read it again under the new key.
const APPLY_DRAFT_KEY = 'wg:role-request-draft';

/** A draft of any other shape — an older form's, say — reads as none. */
export function readSavedApplyDraft(value: string): SavedApplyDraft | null {
  return savedApplyDraftSchema.safeParse(JSON.parse(value)).data ?? null;
}

// Outside the component: the hook makes its reader again whenever it is handed new options.
const STORAGE_OPTIONS = { deserializer: readSavedApplyDraft };

/**
 * The form kept in this tab while the page goes to LINE and back (`apply-return.ts`). Read as the
 * page starts, which the server cannot do: nothing of it is shown until the way back asks for it,
 * so the page the server drew is not changed by it.
 */
export function useApplyDraft(userId: string | null) {
  const [saved, setSaved, removeSaved] =
    useSessionStorage<SavedApplyDraft | null>(
      APPLY_DRAFT_KEY,
      null,
      STORAGE_OPTIONS,
    );

  const keep = useCallback(
    (draft: ApplyDraft) => {
      if (userId) {
        setSaved({ userId, draft });
      }
    },
    [setSaved, userId],
  );

  /** Read once: the draft is taken away as it is read, since it holds a name and a phone. */
  const take = useCallback(() => {
    // Nothing read, nothing to take away: storage the browser will not hand over would throw here.
    if (!saved) {
      return null;
    }

    removeSaved();

    return saved.userId === userId ? saved.draft : null;
  }, [removeSaved, saved, userId]);

  return { keep, take };
}
