'use client';

import { useForm, useStore } from '@tanstack/react-form';
import type { components } from '@rescue-frontend/data-access/openapi';

import { Alert, Button, Stack } from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useState } from 'react';

import {
  AuthField,
  authHref,
  AuthIdentityToggle,
  AuthPasswordField,
  AuthReturnHint,
  newPasswordFieldProblems,
  newPasswordText,
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from './index';
import { resetPasswordAsync } from '../api/client';
import { resolveAuthErrorMessage } from '../api/error-messages';
import { AuthActionCard } from '../shared/auth-action-card';
import { createHashedCredentialAsync } from './credentials';

function readInitialIdentityType(value: string | null): AuthIdentityType {
  return value === 'phone' ? 'phone' : 'email';
}

/** What is wrong with each field, said under it (design `site-auth.jsx` `ResetView`). */
type ResetRequest = components['schemas']['ResetPasswordRequest'];
type ResetValues = Pick<ResetRequest, 'code'> & {
  identityType: ResetRequest['type'];
  identity: ResetRequest['value'];
  password: ResetRequest['new_password'];
  confirm: ResetRequest['new_password'];
};

interface FieldErrors {
  identity?: string;
  code?: string;
  password?: string;
  confirm?: string;
}

/**
 * 重設密碼. From 忘記密碼 the address carries the account the code went to, so the page does not ask
 * for it again; opened on its own it does, since the backend needs it.
 */
export function ResetPasswordFormClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The page the sign-in should end on, carried back to login (or round again for a new code).
  const callbackUrl = searchParams.get('callbackUrl');
  const accountGiven =
    searchParams.get('type') !== null && searchParams.get('value') !== null;
  const [initial] = useState<ResetValues>(() => ({
    identityType: readInitialIdentityType(searchParams.get('type')),
    identity: searchParams.get('value') ?? '',
    code: '',
    password: '',
    confirm: '',
  }));
  const form = useForm({
    defaultValues: initial,
    validators: {
      onSubmit: ({ value }) => {
        const identityValidation = validateIdentityValue(
          value.identityType,
          value.identity,
        );
        const errors: FieldErrors = {
          identity:
            identityValidation === true ? undefined : identityValidation,
          code: value.code.trim() ? undefined : '請輸入驗證碼',
          ...newPasswordFieldProblems(value.password, value.confirm),
        };
        return Object.values(errors).some(Boolean)
          ? { fields: errors }
          : undefined;
      },
    },
    onSubmit: (): Promise<void> => handleSubmitAsync(),
  });
  const {
    identityType,
    identity,
    code,
    password,
    confirm: confirmPassword,
  } = useStore(form.store, (state) => state.values);
  const fieldMeta = useStore(form.store, (state) => state.fieldMeta);
  const fieldErrors = {
    identity: fieldMeta.identity?.errors[0],
    code: fieldMeta.code?.errors[0],
    password: fieldMeta.password?.errors[0],
    confirm: fieldMeta.confirm?.errors[0],
  };
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [done, setDone] = useState(false);

  const goToLogin = () => {
    startTransition(() => {
      router.push(authHref('/login', { callbackUrl }), { scroll: false });
    });
  };

  /** A field's own error goes as it is edited; the others stay until the next try. */
  const clearError = (field: keyof FieldErrors) => {
    form.setFieldMeta(field, (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onSubmit: undefined },
    }));
    setErrorMessage(undefined);
  };

  async function handleSubmitAsync() {
    setErrorMessage(undefined);

    try {
      const normalizedIdentity = normalizeIdentityValue(identityType, identity);
      const { saltFrontend, hashedPassword } =
        await createHashedCredentialAsync(password);

      await resetPasswordAsync({
        type: identityType,
        value: normalizedIdentity,
        code: code.trim(),
        new_password: hashedPassword,
        salt_frontend: saltFrontend,
      });

      setDone(true);
    } catch (error) {
      setErrorMessage(
        resolveAuthErrorMessage(error, '重設密碼失敗，請稍後再試。'),
      );
    }
  }

  if (done) {
    return (
      <Stack spacing={2}>
        <AuthActionCard title="密碼已重設" description="用新密碼登入就可以了。">
          <Button
            variant="contained"
            onClick={goToLogin}
            sx={{ minHeight: 44, borderRadius: '999px' }}
          >
            回到登入
          </Button>
        </AuthActionCard>

        <AuthReturnHint />
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <AuthActionCard
        title="重設密碼"
        description={`輸入${identityType === 'phone' ? '手機' : 'Email'}收到的驗證碼與新密碼，完成後請用新密碼登入。`}
      >
        {accountGiven ? null : (
          <>
            <AuthIdentityToggle
              value={identityType}
              disabled={isSubmitting}
              onChange={(value) => {
                form.setFieldValue('identityType', value);
                form.setFieldValue('identity', '');
                clearError('identity');
              }}
            />
            <AuthField
              label={identityType === 'email' ? '電子郵件' : '手機號碼'}
              placeholder={
                identityType === 'email' ? 'name@example.com' : '0912345678'
              }
              autoComplete="username"
              value={identity}
              onChange={(value) => {
                form.setFieldValue('identity', value);
                clearError('identity');
              }}
              errorText={fieldErrors.identity}
              disabled={isSubmitting}
            />
          </>
        )}

        <AuthField
          label="驗證碼"
          placeholder="6 位數字"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(value) => {
            form.setFieldValue('code', value);
            clearError('code');
          }}
          errorText={fieldErrors.code}
          disabled={isSubmitting}
        />

        <AuthPasswordField
          label="新密碼"
          placeholder={newPasswordText.placeholder}
          autoComplete="new-password"
          value={password}
          onChange={(value) => {
            form.setFieldValue('password', value);
            clearError('password');
          }}
          errorText={fieldErrors.password}
          disabled={isSubmitting}
        />

        <AuthPasswordField
          label="再次輸入新密碼"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(value) => {
            form.setFieldValue('confirm', value);
            clearError('confirm');
          }}
          errorText={fieldErrors.confirm}
          disabled={isSubmitting}
        />

        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <Button
          variant="contained"
          disabled={isSubmitting}
          onClick={() => {
            void form.handleSubmit();
          }}
          sx={{ minHeight: 44, borderRadius: '999px' }}
        >
          {isSubmitting ? '處理中⋯' : '設定新密碼'}
        </Button>

        <Button
          variant="text"
          onClick={() => {
            startTransition(() => {
              router.push(authHref('/forgot-password', { callbackUrl }), {
                scroll: false,
              });
            });
          }}
        >
          重新取得驗證碼
        </Button>

        <Button variant="text" onClick={goToLogin}>
          回到登入
        </Button>
      </AuthActionCard>

      <AuthReturnHint />
    </Stack>
  );
}
