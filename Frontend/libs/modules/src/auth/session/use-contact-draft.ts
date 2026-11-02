'use client';

import { useCallback } from 'react';
import { useSessionStorage } from 'usehooks-ts';
import { z } from 'zod';

const contactDraftSchema = z.object({
  type: z.enum(['email', 'phone']),
  value: z.string(),
});

/** The contact as it was typed when the page left for LINE. */
export type ContactDraft = z.infer<typeof contactDraftSchema>;

/** With the account that left it, so someone else signing in to the same tab does not get it. */
const savedContactDraftSchema = z.object({
  userId: z.string(),
  draft: contactDraftSchema,
});

type SavedContactDraft = z.infer<typeof savedContactDraftSchema>;

const CONTACT_DRAFT_KEY = 'wg:account-contact-draft';

/** A draft of any other shape reads as none. */
export function readSavedContactDraft(value: string): SavedContactDraft | null {
  return savedContactDraftSchema.safeParse(JSON.parse(value)).data ?? null;
}

/**
 * On signing out, maybe on a shared device: the contact typed is not left in the tab for whoever uses it
 * next (`take` already keeps it from another account).
 */
export function clearContactDraft(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  try {
    storage?.removeItem(CONTACT_DRAFT_KEY);
  } catch {
    // Storage the browser refuses holds no draft.
  }
}

// Outside the component: the hook makes its reader again whenever it is handed new options.
const STORAGE_OPTIONS = { deserializer: readSavedContactDraft };

/**
 * The contact kept in this tab while the page goes to LINE and back (`account-step-up.ts`), as
 * 申請管理權限 keeps its form (`role-request/use-apply-draft.ts`). Only the contact: a password typed on
 * this page never leaves it.
 */
export function useContactDraft(userId: string) {
  const [saved, setSaved, removeSaved] =
    useSessionStorage<SavedContactDraft | null>(
      CONTACT_DRAFT_KEY,
      null,
      STORAGE_OPTIONS,
    );

  const keep = useCallback(
    (draft: ContactDraft) => setSaved({ userId, draft }),
    [setSaved, userId],
  );

  /** Read once: the draft is taken away as it is read. */
  const take = useCallback(() => {
    if (!saved) {
      return null;
    }

    removeSaved();

    return saved.userId === userId ? saved.draft : null;
  }, [removeSaved, saved, userId]);

  return { keep, take };
}
