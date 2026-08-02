'use client';

import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import {
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from '@rescue-frontend/modules';
import { forgotPasswordAsync } from '../api/client';
import { AuthActionCard } from '../shared/auth-action-card';

export default function ForgotPasswordFormClient() {
  const router = useRouter();
  const [identityType, setIdentityType] = useState<AuthIdentityType>('email');
  const [identity, setIdentity] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [normalizedIdentity, setNormalizedIdentity] = useState<string>();

  const validationResult = validateIdentityValue(identityType, identity);

  async function handleSubmitAsync() {
    const validation = validateIdentityValue(identityType, identity);

    if (validation !== true) {
      setErrorMessage(validation);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);

    try {
      const resolvedIdentity = normalizeIdentityValue(identityType, identity);

      await forgotPasswordAsync({
        type: identityType,
        value: resolvedIdentity,
      });

      setNormalizedIdentity(resolvedIdentity);
      setSuccessMessage('驗證碼已送出，請前往下一步重設密碼。');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '無法送出重設密碼請求',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthActionCard
      title="忘記密碼"
      description="輸入你的登入識別，我們會發送一次性驗證碼供你重設密碼。"
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
                onClick={() => {
                  setIdentityType(value);
                  setIdentity('');
                  setErrorMessage(undefined);
                }}
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
        placeholder={
          identityType === 'email' ? 'name@example.com' : '0912345678'
        }
        value={identity}
        onChange={(event) => setIdentity(event.target.value)}
        error={identity.trim().length > 0 && validationResult !== true}
        helperText={identity.trim().length > 0 && validationResult !== true
          ? validationResult
          : identityType === 'phone'
            ? '支援 09 開頭或 +886 格式'
            : ' '}
        disabled={isSubmitting}
      />

      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      {successMessage ? (
        <Alert severity="success">{successMessage}</Alert>
      ) : null}

      <Button
        variant="contained"
        disabled={isSubmitting || validationResult !== true}
        onClick={() => {
          void handleSubmitAsync();
        }}
        sx={{ minHeight: 44, borderRadius: '999px' }}
      >
        發送驗證碼
      </Button>

      <Button
        variant="text"
        disabled={!normalizedIdentity}
        onClick={() => {
          if (!normalizedIdentity) {
            return;
          }

          startTransition(() => {
            router.push(
              `/reset-password?type=${identityType}&value=${encodeURIComponent(
                normalizedIdentity,
              )}`,
              { scroll: false },
            );
          });
        }}
      >
        前往重設密碼
      </Button>

      <Button
        variant="text"
        onClick={() => {
          startTransition(() => {
            router.push('/login', { scroll: false });
          });
        }}
      >
        返回登入
      </Button>
    </AuthActionCard>
  );
}
