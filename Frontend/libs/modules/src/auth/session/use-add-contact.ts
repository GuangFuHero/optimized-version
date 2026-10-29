'use client';

import { useCallback, useRef, useState } from 'react';

import { ApiError } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import {
  addContactAsync,
  resendContactAsync,
  verifyContactAsync,
} from '../api/client';
import { resolveHashedCredentialAsync } from '../login/credentials';
import {
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from '../login';
import {
  addContactErrorMessage,
  contactAddedText,
  lineProofExpired,
  lineReturnError,
  readStepUpRequired,
  sameAsCurrentContact,
  startsOverAtFirstStep,
  type AccountStepUpReturn,
  type AddContactStep,
  type StepUpProblem,
} from './account-step-up';
import type { ContactDraft } from './use-contact-draft';

type StepUp = components['schemas']['StepUp'];

/**
 * Where the new contact is in being added, the design's three steps:
 * - `enter` (step 1): typing it, then 寄驗證碼.
 * - `password` (step 2): a password account says it is them before a code goes out (ADR-220).
 * - `old-code` (step 2): an account without a password gets a code at a contact it already has first.
 * - `line` (step 2): an account with neither signs in at LINE again (ADR-361), when the person presses.
 * - `code` (step 3): the code went to the new contact.
 */
export type AddContactStage =
  | { kind: 'enter' }
  | { kind: 'password' }
  | { kind: 'old-code'; pending: boolean }
  | { kind: 'line' }
  | { kind: 'code'; type: AuthIdentityType; value: string };

interface AddContactOptions {
  hasPassword: boolean;
  /** Any verified contact of the account, to look the password's salt up by. */
  saltIdentity: string | null;
  /** The one of this kind the account already has, which the new one replaces (`replacedContact`). */
  current: (type: AuthIdentityType) => { value: string } | null;
  /** What to say when the first code is still good, by where it went (`oldCodeStillPending`). */
  stillPending: (type: AuthIdentityType) => string;
  /** Only LINE can prove it is them (ADR-361): keep the contact and go to LINE. */
  onReauth: (draft: ContactDraft) => void;
  /** The account's contacts changed, whether or not the person is still waiting on it. */
  onChanged: () => void;
  /** The contact is on the account now, and the person is still on the step that asked for it. */
  onVerified: () => void;
}

/**
 * 電子郵件和手機: 更換 the one the account has of a kind, or 新增 one it has not, with the proof the account
 * can give first: 申請管理權限's phone check (`role-request/use-phone-verification.ts`) for an email or a
 * phone. `POST /auth/contacts` → `/verify`.
 */
export function useAddContact({
  hasPassword,
  saltIdentity,
  current,
  stillPending,
  onReauth,
  onChanged,
  onVerified,
}: AddContactOptions) {
  const [type, setType] = useState<AuthIdentityType>('email');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState<AddContactStage>({ kind: 'enter' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<StepUpProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The latest, without making `request` — and `resume`, which the page runs in an effect — new on
  // every render.
  const onReauthRef = useRef(onReauth);
  onReauthRef.current = onReauth;
  const stillPendingRef = useRef(stillPending);
  stillPendingRef.current = stillPending;
  // One more on every 取消 and every other 更換 or 新增: an answer that comes back after it belongs to
  // steps the person has left, and is dropped rather than put back on the page.
  const attempt = useRef(0);

  const fail = (message: string) => setProblem({ message, tone: 'error' });

  const request = useCallback(
    async (
      draft: ContactDraft,
      step: AddContactStep,
      stepUp?: StepUp,
      { backFromLine = false, resending = false } = {},
    ) => {
      const asked = attempt.current;
      const normalized = normalizeIdentityValue(draft.type, draft.value);
      setBusy(true);
      setProblem(null);
      setNotice(null);

      try {
        await addContactAsync({
          type: draft.type,
          value: normalized,
          step_up: stepUp,
        });

        if (asked !== attempt.current) {
          return;
        }

        setStage({ kind: 'code', type: draft.type, value: normalized });
      } catch (cause) {
        if (asked !== attempt.current) {
          return;
        }

        const code = cause instanceof ApiError ? cause.code : undefined;

        if (code === 'step_up_reauth_required') {
          // Straight back from LINE, the proof has already run out: say so rather than go round again.
          if (backFromLine) {
            setStage({ kind: 'enter' });
            setProblem({
              message: lineProofExpired('add_contact'),
              tone: 'warning',
            });
          } else {
            setStage({ kind: 'line' });
          }
          return;
        }

        if (code === 'step_up_required' && step === 'send') {
          const ask = readStepUpRequired((cause as ApiError).message);

          if (ask.kind === 'refused') {
            setStage({ kind: 'enter' });
            setProblem({ message: ask.message, tone: 'error' });
          } else {
            setStage(ask);

            if (resending) {
              setNotice(
                ask.kind === 'old-code' && ask.pending
                  ? stillPendingRef.current(draft.type)
                  : '驗證碼已經重新寄出。',
              );
            }
          }
          return;
        }

        if (startsOverAtFirstStep(cause)) {
          setStage({ kind: 'enter' });
        }

        setProblem({
          message: addContactErrorMessage(cause, step),
          tone: 'error',
        });
      } finally {
        // 取消 already let go of it, and a newer request may be the one waiting now.
        if (asked === attempt.current) {
          setBusy(false);
        }
      }
    },
    [],
  );

  /** 寄驗證碼: a password account is asked for it first, so the code goes out in one try. */
  const send = () => {
    const validation = validateIdentityValue(type, value);

    if (validation !== true) {
      fail(validation);
      return;
    }

    // Before the password or the first code: the backend would only say it is in use, after them.
    const own = sameAsCurrentContact(current(type), type, value);

    if (own) {
      fail(own);
      return;
    }

    if (hasPassword) {
      setProblem(null);
      setNotice(null);
      setStage({ kind: 'password' });
      return;
    }

    void request({ type, value }, 'send');
  };

  const submitPassword = async (password: string) => {
    if (!saltIdentity) {
      fail('你的帳號還沒有已驗證的電子郵件或手機，沒辦法確認現在的密碼。');
      return;
    }

    const asked = attempt.current;
    setBusy(true);

    try {
      const { hashedPassword } = await resolveHashedCredentialAsync(
        saltIdentity,
        password,
      );

      // Left while the password was being checked: nothing goes out for steps no longer on the page.
      if (asked !== attempt.current) {
        return;
      }

      await request({ type, value }, 'password', { password: hashedPassword });
    } catch (cause) {
      if (asked !== attempt.current) {
        return;
      }

      setBusy(false);
      fail(addContactErrorMessage(cause, 'password'));
    }
  };

  const submitOldCode = (code: string) =>
    void request({ type, value }, 'old-code', { old_channel_code: code });

  /** 沒收到？重新寄一次 on the first code: asked again, and the backend says whether one went out. */
  const resendOldCode = () =>
    void request({ type, value }, 'send', undefined, { resending: true });

  /** 到 LINE 確認是我. */
  const proveAtLine = () => onReauthRef.current({ type, value });

  const verify = async (code: string) => {
    if (stage.kind !== 'code') {
      return;
    }

    if (code.trim().length < 4) {
      fail('請輸入收到的驗證碼');
      return;
    }

    const asked = attempt.current;
    setBusy(true);
    setProblem(null);
    setNotice(null);

    try {
      await verifyContactAsync({
        type: stage.type,
        value: stage.value,
        code: code.trim(),
      });
      // On the account whether or not the person is still here, so the list is read again either way.
      onChanged();

      if (asked !== attempt.current) {
        return;
      }

      setStage({ kind: 'enter' });
      setValue('');
      setNotice(
        contactAddedText(stage.type, stage.value, current(stage.type) !== null),
      );
      onVerified();
    } catch (cause) {
      if (asked !== attempt.current) {
        return;
      }

      if (startsOverAtFirstStep(cause)) {
        setStage({ kind: 'enter' });
      }

      fail(addContactErrorMessage(cause, 'code'));
    } finally {
      if (asked === attempt.current) {
        setBusy(false);
      }
    }
  };

  /** Another code to the same contact: `/resend`, which asks for no proof again. */
  const resend = async () => {
    if (stage.kind !== 'code') {
      return;
    }

    const asked = attempt.current;
    setBusy(true);
    setProblem(null);
    setNotice(null);

    try {
      await resendContactAsync({ type: stage.type, value: stage.value });

      if (asked !== attempt.current) {
        return;
      }

      setNotice('驗證碼已經重新寄出。');
    } catch (cause) {
      if (asked !== attempt.current) {
        return;
      }

      // The code ran out or was guessed wrong too often, or the address was taken meanwhile.
      if (startsOverAtFirstStep(cause)) {
        setStage({ kind: 'enter' });
      }

      fail(addContactErrorMessage(cause, 'resend'));
    } finally {
      if (asked === attempt.current) {
        setBusy(false);
      }
    }
  };

  /**
   * 取消: back to step 1 with what was typed, as a code waits under the contact it went to. Whatever was
   * still on its way is let go of.
   */
  const cancel = () => {
    attempt.current += 1;
    setStage({ kind: 'enter' });
    setBusy(false);
    setProblem(null);
    setNotice(null);
  };

  /** A different contact: the steps start over. */
  const change = (next: Partial<ContactDraft>) => {
    if (next.type !== undefined) {
      setType(next.type);
    }

    if (next.value !== undefined) {
      setValue(next.value);
    }

    cancel();
  };

  /**
   * Back from LINE: the contact as it was typed, and with the proof made, the code goes out by itself
   * — the person already pressed 寄驗證碼 once.
   */
  const resume = useCallback(
    (draft: ContactDraft, outcome: AccountStepUpReturn['stepUp']) => {
      setType(draft.type);
      setValue(draft.value);

      if (outcome === 'ok') {
        void request(draft, 'send', undefined, { backFromLine: true });
      } else if (outcome) {
        setProblem({
          message: lineReturnError(outcome.error, 'add_contact'),
          tone: 'warning',
        });
      }
    },
    [request],
  );

  return {
    type,
    value,
    stage,
    busy,
    problem,
    notice,
    send,
    submitPassword,
    submitOldCode,
    resendOldCode,
    proveAtLine,
    verify,
    resend,
    cancel,
    change,
    resume,
  };
}
