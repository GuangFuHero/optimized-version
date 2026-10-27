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
  contactName,
  lineProofExpired,
  lineReturnError,
  OLD_CODE_STILL_PENDING,
  readStepUpRequired,
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
  /** Only LINE can prove it is them (ADR-361): keep the contact and go to LINE. */
  onReauth: (draft: ContactDraft) => void;
  /** The contact is on the account now. */
  onVerified: () => void;
}

/**
 * 新增電子郵件或手機, with the proof the account can give first: 申請管理權限's phone check
 * (`role-request/use-phone-verification.ts`) for an email or a phone. `POST /auth/contacts` → `/verify`.
 */
export function useAddContact({
  hasPassword,
  saltIdentity,
  onReauth,
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

  const fail = (message: string) => setProblem({ message, tone: 'error' });

  const request = useCallback(
    async (
      draft: ContactDraft,
      step: AddContactStep,
      stepUp?: StepUp,
      { backFromLine = false, resending = false } = {},
    ) => {
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
        setStage({ kind: 'code', type: draft.type, value: normalized });
      } catch (cause) {
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
                  ? OLD_CODE_STILL_PENDING
                  : '驗證碼已經重新寄出。',
              );
            }
          }
          return;
        }

        setProblem({
          message: addContactErrorMessage(cause, step),
          tone: 'error',
        });
      } finally {
        setBusy(false);
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

    setBusy(true);

    try {
      const { hashedPassword } = await resolveHashedCredentialAsync(
        saltIdentity,
        password,
      );
      await request({ type, value }, 'password', { password: hashedPassword });
    } catch (cause) {
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

    setBusy(true);
    setProblem(null);
    setNotice(null);

    try {
      await verifyContactAsync({
        type: stage.type,
        value: stage.value,
        code: code.trim(),
      });
      setStage({ kind: 'enter' });
      setValue('');
      setNotice(`已新增${contactName(stage.type)} ${stage.value}。`);
      onVerified();
    } catch (cause) {
      fail(addContactErrorMessage(cause, 'code'));
    } finally {
      setBusy(false);
    }
  };

  /** Another code to the same contact: `/resend`, which asks for no proof again. */
  const resend = async () => {
    if (stage.kind !== 'code') {
      return;
    }

    setBusy(true);
    setProblem(null);
    setNotice(null);

    try {
      await resendContactAsync({ type: stage.type, value: stage.value });
      setNotice('驗證碼已經重新寄出。');
    } catch (cause) {
      fail(addContactErrorMessage(cause, 'resend'));
    } finally {
      setBusy(false);
    }
  };

  /** 取消: back to step 1 with what was typed, as a code waits under the contact it went to. */
  const cancel = () => {
    setStage({ kind: 'enter' });
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
