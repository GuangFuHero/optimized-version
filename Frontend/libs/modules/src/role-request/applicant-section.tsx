'use client';

import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { SiteBadge } from '../shell/site/site-badge';
import { displayPhone, type ApplicantAccount } from './applicant';
import type { PhoneVerification } from './use-phone-verification';

const { color } = designTokens;

const hintSx = {
  mt: 0.75,
  color: color.fg.neutral.muted,
  fontSize: displayTextSize[12],
  lineHeight: 1.6,
  textWrap: 'pretty',
} as const;

interface ApplicantSectionProps {
  account: ApplicantAccount;
  name: string;
  onNameChange: (name: string) => void;
  /** Shown once the person has tried to send. */
  nameError: string | null;
  phoneError: string | null;
  verification: PhoneVerification;
}

/**
 * 你的基本資料 (prototype G-2, `Design/前台/js/site/site-actions.jsx` `ApplicantSection`): the name the
 * application is made in, and a mobile verified by a code. A phone the account already has verified
 * is shown as it is, not asked again.
 */
export function ApplicantSection({
  account,
  name,
  onNameChange,
  nameError,
  phoneError,
  verification,
}: ApplicantSectionProps) {
  return (
    <Box>
      <Typography
        component="h3"
        sx={{
          color: color.fg.neutral.default,
          fontSize: displayTextSize[14],
          lineHeight: 1.2,
          fontWeight: 700,
        }}
      >
        你的基本資料
      </Typography>
      <Typography sx={hintSx}>
        審核者會用這支手機跟你確認身分；通過後這些資料直接帶進管理平台，不用再填一次。
      </Typography>

      <Stack spacing={2} sx={{ mt: 2 }}>
        <TextField
          label="你的名字"
          required
          fullWidth
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="例：王志豪"
          error={Boolean(nameError)}
          helperText={nameError ?? '管理平台上其他人看到的名字，建議用真實姓名'}
        />

        {account.verifiedPhone ? (
          <VerifiedPhone
            phone={account.verifiedPhone}
            note="這是你登入用的手機，不在這裡改。"
          />
        ) : (
          <PhoneSteps verification={verification} phoneError={phoneError} />
        )}
      </Stack>
    </Box>
  );
}

function VerifiedPhone({ phone, note }: { phone: string; note?: string }) {
  return (
    <Box>
      <Typography
        sx={{
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[12],
          lineHeight: 1.4,
          fontWeight: 700,
        }}
      >
        手機號碼
      </Typography>
      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          sx={{
            color: color.fg.neutral.default,
            fontSize: displayTextSize[15],
            lineHeight: 1.5,
          }}
        >
          {displayPhone(phone)}
        </Typography>
        <SiteBadge tone="success">已驗證</SiteBadge>
      </Box>
      {note ? <Typography sx={hintSx}>{note}</Typography> : null}
    </Box>
  );
}

/** The phone not yet verified: typed, proved for, sent a code, and checked. */
function PhoneSteps({
  verification,
  phoneError,
}: {
  verification: PhoneVerification;
  phoneError: string | null;
}) {
  const { stage, phone, busy, error, notice } = verification;
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  if (stage.kind === 'verified') {
    return <VerifiedPhone phone={stage.phone} />;
  }

  const codeSent = stage.kind === 'code';
  const proving = stage.kind === 'password' || stage.kind === 'old-code';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <TextField
          label="手機號碼"
          required
          fullWidth
          value={phone}
          onChange={(event) => {
            setCode('');
            verification.changePhone(event.target.value);
          }}
          placeholder="0912345678"
          error={Boolean(phoneError) && !error}
          slotProps={{
            htmlInput: { inputMode: 'tel', autoComplete: 'tel' },
          }}
        />
        {/* Away while a proof is asked for: that step has a button of its own. */}
        {proving ? null : (
          <Button
            variant="outlined"
            onClick={() =>
              codeSent ? void verification.resend() : verification.send()
            }
            disabled={busy}
            sx={{ flexShrink: 0, height: 56 }}
          >
            {codeSent ? '重新傳送' : '傳送驗證碼'}
          </Button>
        )}
      </Box>
      <Typography sx={hintSx}>
        會傳一組驗證碼給你。這支手機之後也可以拿來登入。
      </Typography>

      {stage.kind === 'password' ? (
        <StepRow
          hint="為了確認是你本人，新增手機前要先輸入登入密碼。"
          input={
            <TextField
              label="登入密碼"
              type="password"
              fullWidth
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              slotProps={{ htmlInput: { autoComplete: 'current-password' } }}
            />
          }
          action="確認並傳送"
          disabled={busy || !password}
          onAction={() => void verification.submitPassword(password)}
        />
      ) : null}

      {stage.kind === 'old-code' ? (
        <StepRow
          hint={stage.message}
          input={<CodeField value={code} onChange={setCode} label="驗證碼" />}
          action="確認"
          disabled={busy || code.length !== 6}
          onAction={() => {
            verification.submitOldCode(code);
            setCode('');
          }}
        />
      ) : null}

      {codeSent ? (
        <StepRow
          hint={`驗證碼已傳到 ${displayPhone(stage.phone)}，10 分鐘內有效。`}
          input={
            <CodeField value={code} onChange={setCode} label="簡訊驗證碼" />
          }
          action="確認"
          disabled={busy || code.length !== 6}
          onAction={() => void verification.verify(code)}
        />
      ) : null}

      {error ? (
        <Typography role="alert" sx={{ ...hintSx, color: color.fg.danger }}>
          {error}
        </Typography>
      ) : phoneError ? (
        <Typography role="alert" sx={{ ...hintSx, color: color.fg.danger }}>
          {phoneError}
        </Typography>
      ) : notice ? (
        <Typography sx={{ ...hintSx, color: color.fg.neutral.subtle }}>
          {notice}
        </Typography>
      ) : null}
    </Box>
  );
}

function StepRow({
  hint,
  input,
  action,
  disabled,
  onAction,
}: {
  hint: string;
  input: ReactNode;
  action: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        sx={{ ...hintSx, mt: 0, mb: 1, color: color.fg.neutral.subtle }}
      >
        {hint}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        {input}
        <Button
          variant="contained"
          onClick={onAction}
          disabled={disabled}
          sx={{ flexShrink: 0, height: 56 }}
        >
          {action}
        </Button>
      </Box>
    </Box>
  );
}

/** Six digits, as the backend mints them; a phone's keyboard offers the code from the message. */
function CodeField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <TextField
      label={label}
      fullWidth
      autoFocus
      value={value}
      onChange={(event) =>
        onChange(event.target.value.replace(/\D/g, '').slice(0, 6))
      }
      placeholder="6 位數字"
      slotProps={{
        htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' },
      }}
    />
  );
}
