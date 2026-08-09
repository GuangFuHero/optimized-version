'use client';

import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useState } from 'react';

import {
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from '@rescue-frontend/modules';
import { resetPasswordAsync } from '../api/client';
import { AuthActionCard } from '../shared/auth-action-card';
import { createHashedCredentialAsync } from './credentials';

function readInitialIdentityType(value: string | null): AuthIdentityType {
  return value === 'phone' ? 'phone' : 'email';
}

export default function ResetPasswordFormClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identityType, setIdentityType] = useState<AuthIdentityType>(() =>
    readInitialIdentityType(searchParams.get('type')),
  );
  const [identity, setIdentity] = useState(searchParams.get('value') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmitAsync() {
    const validation = validateIdentityValue(identityType, identity);

    if (validation !== true) {
      setErrorMessage(validation);
      return;
    }

    if (code.trim().length < 4) {
      setErrorMessage('請輸入有效驗證碼');
      return;
    }

    if (password.trim().length < 6) {
      setErrorMessage('新密碼至少需要 6 個字元');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('兩次輸入的新密碼不一致');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);

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

      setSuccessMessage('密碼已更新，正在返回登入頁。');

      startTransition(() => {
        router.replace('/login', { scroll: false });
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '重設密碼失敗，請稍後再試',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthActionCard
      title="重設密碼"
      description="輸入驗證碼與新密碼，完成後會使用新的加密憑證登入。"
    >
      <Stack spacing={1}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#6A5F5B' }}>
          驗證方式
        </Typography>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{
            p: 0.5,
            borderRadius: '18px',
            border: '1px solid #D6CBC6',
            bgcolor: '#F8F5F2',
          }}
        >
          {(['email', 'phone'] as const).map((value) => {
            const active = identityType === value;

            return (
              <Button
                key={value}
                fullWidth
                type="button"
                disabled={isSubmitting}
                onClick={() => setIdentityType(value)}
                sx={{
                  minHeight: 40,
                  borderRadius: '14px',
                  bgcolor: active ? '#D8F2FF' : 'transparent',
                  border: active
                    ? '1px solid #8ED8F8'
                    : '1px solid transparent',
                  color: '#241B19',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {value === 'email' ? 'Email' : '手機號碼'}
              </Button>
            );
          })}
        </Stack>
      </Stack>

      <TextField
        label={identityType === 'email' ? '電子郵件' : '手機號碼'}
        value={identity}
        onChange={(event) => setIdentity(event.target.value)}
        disabled={isSubmitting}
      />

      <TextField
        label="驗證碼"
        placeholder="請輸入 6 碼驗證碼"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        disabled={isSubmitting}
      />

      <TextField
        label="新密碼"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={isSubmitting}
      />

      <TextField
        label="再次輸入新密碼"
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        disabled={isSubmitting}
      />

      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      {successMessage ? (
        <Alert severity="success">{successMessage}</Alert>
      ) : null}

      <Button
        variant="contained"
        disabled={isSubmitting}
        onClick={() => {
          void handleSubmitAsync();
        }}
        sx={{ minHeight: 44, borderRadius: '999px' }}
      >
        更新密碼
      </Button>

      <Button
        variant="text"
        onClick={() => {
          startTransition(() => {
            router.push('/forgot-password', { scroll: false });
          });
        }}
      >
        重新取得驗證碼
      </Button>
    </AuthActionCard>
  );
}
