'use client';

import {
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import {
  type AuthIdentityType,
} from '@rescue-frontend/data-access';
import { RegisterForm } from '@rescue-frontend/modules';
import {
  registerAsync,
  resendVerificationAsync,
  verifyAsync,
} from '../api/client';
import { createHashedCredentialAsync } from './credentials';

interface PendingRegistration {
  identityType: AuthIdentityType;
  normalizedIdentity: string;
}

export default function RegisterFormClient() {
  const router = useRouter();
  const [pendingRegistration, setPendingRegistration] =
    useState<PendingRegistration | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState<string>();
  const [verificationSuccess, setVerificationSuccess] = useState<string>();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function handleVerificationAsync() {
    if (!pendingRegistration || isVerifying) {
      return;
    }

    const code = verificationCode.trim();

    if (!code) {
      setVerificationError('請輸入驗證碼');
      return;
    }

    setIsVerifying(true);
    setVerificationError(undefined);
    setVerificationSuccess(undefined);

    try {
      const tokenPair = await verifyAsync({
        type: pendingRegistration.identityType,
        value: pendingRegistration.normalizedIdentity,
        code,
      });

      const result = await signIn('credentials', {
        username: pendingRegistration.normalizedIdentity,
        password: '',
        accessToken: tokenPair.access_token,
        refreshToken: tokenPair.refresh_token,
        tokenType: tokenPair.token_type ?? 'bearer',
        expiresIn: String(tokenPair.expires_in),
        callbackUrl: '/map',
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      setVerificationSuccess('帳號驗證完成，正在登入。');

      startTransition(() => {
        router.replace(result?.url ?? '/map', { scroll: false });
      });
    } catch (error) {
      setVerificationError(
        error instanceof Error ? error.message : '驗證失敗，請稍後再試',
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendAsync() {
    if (!pendingRegistration || isResending) {
      return;
    }

    setIsResending(true);
    setVerificationError(undefined);
    setVerificationSuccess(undefined);

    try {
      await resendVerificationAsync({
        type: pendingRegistration.identityType,
        value: pendingRegistration.normalizedIdentity,
      });
      setVerificationSuccess('已重新發送驗證碼。');
    } catch (error) {
      setVerificationError(
        error instanceof Error ? error.message : '重新發送失敗，請稍後再試',
      );
    } finally {
      setIsResending(false);
    }
  }

  if (pendingRegistration) {
    return (
      <Stack
        spacing={2}
        sx={{
          width: '100%',
          borderRadius: '32px',
          border: '1px solid #DCC1B1',
          p: 3,
          boxShadow: '0 1px 1px rgba(0, 0, 0, 0.05)',
          bgcolor: '#FFFFFF',
        }}
      >
        <Stack spacing={0.75}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            輸入驗證碼
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            驗證碼已寄送到 {pendingRegistration.normalizedIdentity}
          </Typography>
        </Stack>

        <TextField
          label="驗證碼"
          value={verificationCode}
          onChange={(event) => setVerificationCode(event.target.value)}
          placeholder="請輸入 6 碼驗證碼"
          disabled={isVerifying}
          autoComplete="one-time-code"
        />

        {verificationError ? (
          <Alert severity="error">{verificationError}</Alert>
        ) : null}

        {verificationSuccess ? (
          <Alert severity="success">{verificationSuccess}</Alert>
        ) : null}

        <Button
          variant="contained"
          disabled={isVerifying || verificationCode.trim().length === 0}
          onClick={() => {
            void handleVerificationAsync();
          }}
        >
          完成驗證
        </Button>

        <Button
          variant="text"
          disabled={isResending}
          onClick={() => {
            void handleResendAsync();
          }}
        >
          重新發送驗證碼
        </Button>

        <Button
          variant="text"
          onClick={() => {
            setPendingRegistration(null);
            setVerificationCode('');
            setVerificationError(undefined);
            setVerificationSuccess(undefined);
          }}
        >
          返回上一頁
        </Button>
      </Stack>
    );
  }

  return (
    <RegisterForm
      onSubmitAsync={async ({
        identityType,
        normalizedIdentity,
        password,
        name,
      }) => {
        const trimmedName = name?.trim();

        if (!trimmedName) {
          throw new Error('請輸入顯示名稱');
        }

        const { saltFrontend, hashedPassword } =
          await createHashedCredentialAsync(password);

        await registerAsync({
          name: trimmedName,
          password: hashedPassword,
          salt_frontend: saltFrontend,
          type: identityType,
          value: normalizedIdentity,
        });

        setPendingRegistration({
          identityType,
          normalizedIdentity,
        });
      }}
      successMessage="註冊請求已送出，請輸入驗證碼完成啟用。"
      secondaryActionLabel="返回登入"
      onSecondaryAction={() => {
        startTransition(() => {
          router.push('/login', { scroll: false });
        });
      }}
    />
  );
}
