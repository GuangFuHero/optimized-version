'use client';

import { useCallback, useRef, useState } from 'react';

import { ApiError } from '@rescue-frontend/data-access';
import type { components } from '@rescue-frontend/data-access/openapi';

import {
  addContactAsync,
  resendContactAsync,
  verifyContactAsync,
} from '../auth/api/client';
import { resolveHashedCredentialAsync } from '../auth/login/credentials';
import {
  mobileProblem,
  toE164Mobile,
  type ApplicantAccount,
} from './applicant';
import type { ApplyReturn } from './apply-return';
import {
  phoneVerifyErrorMessage,
  stepUpReturnErrorMessage,
  type PhoneVerifyStep,
} from './phone-verify-error';

type StepUp = components['schemas']['StepUp'];

/**
 * Where the phone is in being verified:
 * - `enter`: typing it, then 傳送驗證碼.
 * - `password`: a password account says it is them before a code goes out (ADR-220).
 * - `old-code`: an account without a password gets a code at a contact it already has first.
 * - `code`: the code went to the new phone.
 * - `verified`: the phone is now the account's.
 */
export type PhoneVerifyStage =
  | { kind: 'enter' }
  | { kind: 'password' }
  | { kind: 'old-code'; message: string }
  | { kind: 'code'; phone: string }
  | { kind: 'verified'; phone: string };

interface PhoneVerificationOptions {
  account: ApplicantAccount;
  /** The phone is on the account now: read the account again. */
  onVerified: () => void;
  /** Only LINE can prove it is them (ADR-361): keep the form and go to LINE. */
  onReauth: (phone: string) => void;
}

// The backend's own sentence ends on the field name its API takes; the person types into a box.
const oldCodeMessage = (detail: string) =>
  detail.replace(
    /，?請填入 step_up\.old_channel_code$/,
    '，請在下面輸入那組驗證碼',
  );

/**
 * 手機驗證 on the application, as the back office's `ContactVerifyDialog` does it, inline:
 * `POST /auth/contacts` → `/verify`, with the proof the account can give first. A verified phone is
 * the account's at once, whether or not the application is sent.
 */
export function usePhoneVerification({
  account,
  onVerified,
  onReauth,
}: PhoneVerificationOptions) {
  const [stage, setStage] = useState<PhoneVerifyStage>({ kind: 'enter' });
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The latest, without making `request` — and `resume`, which the drawer runs in an effect — new
  // on every render.
  const onReauthRef = useRef(onReauth);
  onReauthRef.current = onReauth;

  const request = useCallback(
    async (
      typed: string,
      step: PhoneVerifyStep,
      stepUp?: StepUp,
      backFromLine = false,
    ) => {
      const value = toE164Mobile(typed);
      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        await addContactAsync({ type: 'phone', value, step_up: stepUp });
        setStage({ kind: 'code', phone: value });
      } catch (cause) {
        const code = cause instanceof ApiError ? cause.code : undefined;

        if (code === 'step_up_reauth_required') {
          // Straight back from LINE, the proof has already run out: say so rather than go round again.
          if (backFromLine) {
            setStage({ kind: 'enter' });
            setError('LINE 驗證已逾時，請再傳送一次驗證碼');
          } else {
            onReauthRef.current(typed);
          }
          return;
        }

        if (code === 'step_up_required' && step === 'send') {
          setStage(
            account.hasPassword
              ? { kind: 'password' }
              : {
                  kind: 'old-code',
                  message: oldCodeMessage((cause as ApiError).message),
                },
          );
          return;
        }

        setError(phoneVerifyErrorMessage(cause, step));
      } finally {
        setBusy(false);
      }
    },
    [account.hasPassword],
  );

  /** 傳送驗證碼: a password account is asked for it first, so the code goes out in one try. */
  const send = () => {
    const problem = mobileProblem(phone);

    if (problem) {
      setError(problem);
      return;
    }

    if (account.hasPassword) {
      setError(null);
      setStage({ kind: 'password' });
      return;
    }

    void request(phone, 'send');
  };

  const submitPassword = async (password: string) => {
    if (!account.saltIdentifier) {
      setError('讀不到你的帳號資料，請重新整理頁面後再試');
      return;
    }

    setBusy(true);

    try {
      const { hashedPassword } = await resolveHashedCredentialAsync(
        account.saltIdentifier,
        password,
      );
      await request(phone, 'password', { password: hashedPassword });
    } catch (cause) {
      setBusy(false);
      setError(phoneVerifyErrorMessage(cause, 'password'));
    }
  };

  const submitOldCode = (code: string) =>
    void request(phone, 'old-code', { old_channel_code: code });

  const verify = async (code: string) => {
    if (stage.kind !== 'code') {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await verifyContactAsync({ type: 'phone', value: stage.phone, code });
      setStage({ kind: 'verified', phone: stage.phone });
      onVerified();
    } catch (cause) {
      setError(phoneVerifyErrorMessage(cause, 'code'));
    } finally {
      setBusy(false);
    }
  };

  /** Another code to the same phone: `/resend`, which asks for no proof again. */
  const resend = async () => {
    if (stage.kind !== 'code') {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await resendContactAsync({ type: 'phone', value: stage.phone });
      setNotice('已重新傳送驗證碼');
    } catch (cause) {
      setError(phoneVerifyErrorMessage(cause, 'resend'));
    } finally {
      setBusy(false);
    }
  };

  /** A different number: the steps start over, as a code waits under the number it went to. */
  const changePhone = (next: string) => {
    setPhone(next);

    if (stage.kind !== 'enter') {
      setStage({ kind: 'enter' });
    }

    setError(null);
    setNotice(null);
  };

  /** Each opening of the drawer starts from no number typed. */
  const reset = useCallback(() => {
    setStage({ kind: 'enter' });
    setPhone('');
    setError(null);
    setNotice(null);
  }, []);

  /**
   * Back from LINE: the number as it was typed, and with the proof made, the code goes out by
   * itself — the person already pressed 傳送驗證碼 once.
   */
  const resume = useCallback(
    (typed: string, outcome: ApplyReturn['stepUp']) => {
      setPhone(typed);

      if (outcome === 'ok') {
        void request(typed, 'send', undefined, true);
      } else if (outcome) {
        setError(stepUpReturnErrorMessage(outcome.error));
      }
    },
    [request],
  );

  return {
    stage,
    phone,
    busy,
    error,
    notice,
    send,
    submitPassword,
    submitOldCode,
    verify,
    resend,
    changePhone,
    reset,
    resume,
  };
}

export type PhoneVerification = ReturnType<typeof usePhoneVerification>;
