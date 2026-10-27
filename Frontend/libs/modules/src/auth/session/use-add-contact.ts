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
  lineReturnError,
  readStepUpRequired,
  type AccountStepUpReturn,
  type AddContactStep,
} from './account-step-up';
import type { ContactDraft } from './use-contact-draft';

type StepUp = components['schemas']['StepUp'];

/**
 * Where the new contact is in being added:
 * - `enter`: typing it, then 發送驗證碼.
 * - `password`: a password account says it is them before a code goes out (ADR-220).
 * - `old-code`: an account without a password gets a code at a contact it already has first.
 * - `code`: the code went to the new contact.
 */
export type AddContactStage =
  | { kind: 'enter' }
  | { kind: 'password' }
  | { kind: 'old-code'; message: string }
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
 * 新增聯絡方式, with the proof the account can give first: 申請管理權限's phone check
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The latest, without making `request` — and `resume`, which the page runs in an effect — new on
  // every render.
  const onReauthRef = useRef(onReauth);
  onReauthRef.current = onReauth;

  const request = useCallback(
    async (
      draft: ContactDraft,
      step: AddContactStep,
      stepUp?: StepUp,
      backFromLine = false,
    ) => {
      const normalized = normalizeIdentityValue(draft.type, draft.value);
      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        await addContactAsync({
          type: draft.type,
          value: normalized,
          step_up: stepUp,
        });
        setStage({ kind: 'code', type: draft.type, value: normalized });
        setNotice('驗證碼已發送，請輸入後完成綁定。');
      } catch (cause) {
        const code = cause instanceof ApiError ? cause.code : undefined;

        if (code === 'step_up_reauth_required') {
          // Straight back from LINE, the proof has already run out: say so rather than go round again.
          if (backFromLine) {
            setStage({ kind: 'enter' });
            setError('LINE 驗證已逾時，請再按一次「發送驗證碼」');
          } else {
            onReauthRef.current(draft);
          }
          return;
        }

        if (code === 'step_up_required' && step === 'send') {
          const ask = readStepUpRequired((cause as ApiError).message);

          if (ask.kind === 'refused') {
            setStage({ kind: 'enter' });
            setError(ask.message);
          } else {
            setStage(ask);
          }
          return;
        }

        setError(addContactErrorMessage(cause, step));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /** 發送驗證碼: a password account is asked for it first, so the code goes out in one try. */
  const send = () => {
    const validation = validateIdentityValue(type, value);

    if (validation !== true) {
      setError(validation);
      return;
    }

    if (hasPassword) {
      setError(null);
      setNotice(null);
      setStage({ kind: 'password' });
      return;
    }

    void request({ type, value }, 'send');
  };

  const submitPassword = async (password: string) => {
    if (!saltIdentity) {
      setError('你的帳號還沒有已驗證的聯絡方式，無法確認目前的密碼。');
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
      setError(addContactErrorMessage(cause, 'password'));
    }
  };

  const submitOldCode = (code: string) =>
    void request({ type, value }, 'old-code', { old_channel_code: code });

  const verify = async (code: string) => {
    if (stage.kind !== 'code') {
      return;
    }

    if (code.trim().length < 4) {
      setError('請輸入有效驗證碼');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await verifyContactAsync({
        type: stage.type,
        value: stage.value,
        code: code.trim(),
      });
      setStage({ kind: 'enter' });
      setValue('');
      setNotice('聯絡方式已完成驗證與綁定。');
      onVerified();
    } catch (cause) {
      setError(addContactErrorMessage(cause, 'code'));
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
    setError(null);
    setNotice(null);

    try {
      await resendContactAsync({ type: stage.type, value: stage.value });
      setNotice('驗證碼已重新發送。');
    } catch (cause) {
      setError(addContactErrorMessage(cause, 'resend'));
    } finally {
      setBusy(false);
    }
  };

  /** A different contact: the steps start over, as a code waits under the contact it went to. */
  const change = (next: Partial<ContactDraft>) => {
    if (next.type !== undefined) {
      setType(next.type);
    }

    if (next.value !== undefined) {
      setValue(next.value);
    }

    setStage({ kind: 'enter' });
    setError(null);
    setNotice(null);
  };

  /**
   * Back from LINE: the contact as it was typed, and with the proof made, the code goes out by itself
   * — the person already pressed 發送驗證碼 once.
   */
  const resume = useCallback(
    (draft: ContactDraft, outcome: AccountStepUpReturn['stepUp']) => {
      setType(draft.type);
      setValue(draft.value);

      if (outcome === 'ok') {
        void request(draft, 'send', undefined, true);
      } else if (outcome) {
        setError(lineReturnError(outcome.error, 'add_contact'));
      }
    },
    [request],
  );

  return {
    type,
    value,
    stage,
    busy,
    error,
    notice,
    send,
    submitPassword,
    submitOldCode,
    verify,
    resend,
    change,
    resume,
  };
}
