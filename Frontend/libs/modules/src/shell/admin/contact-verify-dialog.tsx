'use client';

import { Box, Stack, Typography } from '@mui/material';
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp';
import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@rescue-frontend/data-access';
import {
  useAddContact,
  useVerifyContact,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import { designTokens, Dialog, TextInput } from '@rescue-frontend/ui';

import { resolveHashedCredentialAsync } from '../../auth/login/credentials';

const { color, radius, typography } = designTokens;

type Step =
  | { kind: 'start' }
  | { kind: 'old-code'; message: string }
  | { kind: 'code' };

export interface ContactVerifyDialogProps {
  type: NonNullable<components['schemas']['AddContactRequest']['type']>;
  value: string;
  user: components['schemas']['UserResponse'];
  onClose: () => void;
}

function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <OTPInput
      autoFocus
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      value={value}
      onChange={onChange}
      render={({ slots }) => (
        <Stack direction="row" sx={{ gap: '8px', justifyContent: 'center' }}>
          {slots.map((slot, index) => (
            <Box
              key={index}
              sx={{
                width: 44,
                height: 52,
                display: 'grid',
                placeItems: 'center',
                borderRadius: `${radius.md}px`,
                border: `1px solid ${slot.isActive ? color.bg.primary.default : color.border.default}`,
                boxShadow: slot.isActive
                  ? `0 0 0 2px ${color.bg.primary.subtle}`
                  : 'none',
                ...typography.data[500],
                fontSize: 22,
                color: color.fg.neutral.default,
              }}
            >
              {slot.char ??
                (slot.hasFakeCaret ? (
                  <Box
                    sx={{
                      width: '1.5px',
                      height: 22,
                      bgcolor: color.fg.neutral.default,
                      animation: 'otp-caret 1s step-end infinite',
                      '@keyframes otp-caret': { '50%': { opacity: 0 } },
                    }}
                  />
                ) : null)}
            </Box>
          ))}
        </Stack>
      )}
    />
  );
}

export function ContactVerifyDialog({
  type,
  value,
  user,
  onClose,
}: ContactVerifyDialogProps) {
  const addContact = useAddContact();
  const verifyContact = useVerifyContact();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const label = type === 'email' ? 'Email' : '電話';
  const hasPassword =
    user.login_methods?.some((method) => method.provider === 'password') ??
    false;
  const saltIdentifier = user.contacts?.[0]?.value;
  const pending = addContact.isPending || verifyContact.isPending;

  const requestCode = (stepUp?: components['schemas']['StepUp']) =>
    addContact.mutate(
      { body: { type, value, step_up: stepUp } },
      {
        onSuccess: () => {
          setCode('');
          setStep({ kind: 'code' });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'step_up_required') {
            setCode('');
            setStep({ kind: 'old-code', message: error.message });
          }
        },
      },
    );

  const submit = async () => {
    switch (step.kind) {
      case 'start':
        if (hasPassword && saltIdentifier) {
          const { hashedPassword } = await resolveHashedCredentialAsync(
            saltIdentifier,
            password,
          );
          requestCode({ password: hashedPassword });
        } else {
          requestCode();
        }
        return;
      case 'old-code':
        requestCode({ old_channel_code: code });
        return;
      case 'code':
        verifyContact.mutate(
          { body: { type, value, code } },
          {
            onSuccess: () => {
              toast.success(`${label}已更新`);
              onClose();
            },
          },
        );
        return;
      default: {
        const _exhaustive: never = step;
        return _exhaustive;
      }
    }
  };

  const canSubmit =
    step.kind === 'start'
      ? !hasPassword || (password.length > 0 && Boolean(saltIdentifier))
      : code.length === 6;

  return (
    <Dialog
      open
      onClose={onClose}
      onConfirm={() => void submit()}
      title={step.kind === 'old-code' ? '確認是你本人' : `驗證新的${label}`}
      confirmLabel={step.kind === 'code' ? '驗證' : '寄送驗證碼'}
      confirmDisabled={!canSubmit}
      submitting={pending}
    >
      <Typography
        sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
      >
        {step.kind === 'start'
          ? hasPassword
            ? `請輸入目前的密碼，確認後會寄送驗證碼到 ${value}。`
            : `會寄送驗證碼到 ${value}。`
          : step.kind === 'old-code'
            ? step.message
            : `驗證碼已寄到 ${value}，請輸入 6 位數驗證碼。`}
      </Typography>
      {step.kind === 'start' ? (
        hasPassword ? (
          <TextInput
            autoFocus
            type="password"
            label="目前的密碼"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        ) : null
      ) : (
        <CodeInput value={code} onChange={setCode} />
      )}
    </Dialog>
  );
}
