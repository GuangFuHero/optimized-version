'use client';

import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { getAuthColorScheme } from '../../theme/auth-theme';
import {
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from '../../utils/identity-validation';
import { AuthField } from '../auth-field';
import { AuthProviderButton } from '../auth-provider-button';

type AuthAsyncAction = () => Promise<void> | void;
type AuthFormMode = 'login' | 'register';

type AuthProviderAction = {
  provider: 'google' | 'line' | 'custom';
  label: string;
  onClick?: AuthAsyncAction;
  disabled?: boolean;
  icon?: ReactNode;
};

interface LoginFormProps {
  mode?: AuthFormMode;
  providerActions?: readonly AuthProviderAction[];
  onSubmitAsync?: (values: {
    identityType: AuthIdentityType;
    identity: string;
    normalizedIdentity: string;
    password: string;
    name?: string;
  }) => Promise<void> | void;
  onForgotPasswordAsync?: AuthAsyncAction;
  onSmsLoginAsync?: AuthAsyncAction;
  secondaryActionLabel?: string;
  onSecondaryAction?: AuthAsyncAction;
  successMessage?: string;
}

const defaultProviderActions: readonly AuthProviderAction[] = [
  { provider: 'google', label: '使用 Google 繼續' },
  { provider: 'line', label: '使用 LINE 繼續' },
];

const loginFormText = {
  emailLabel: '電子郵件',
  emailPlaceholder: 'name@example.com',
  phoneLabel: '手機號碼',
  phonePlaceholder: '0912345678',
  accountTypeLabel: '登入方式',
  registerAccountTypeLabel: '註冊方式',
  emailToggleLabel: 'Email',
  phoneToggleLabel: '手機號碼',
  displayNameLabel: '顯示名稱',
  displayNamePlaceholder: '請輸入顯示名稱',
  passwordLabel: '密碼',
  passwordPlaceholder: '請輸入密碼..',
  forgotPasswordLabel: '忘記密碼？',
  smsActionLabel: '透過簡訊驗證登入',
  emailRequiredMessage: '請輸入電子郵件',
  displayNameRequiredMessage: '請輸入顯示名稱',
  passwordRequiredMessage: '請輸入密碼',
  dividerLabel: '或',
  hidePasswordLabel: '隱藏密碼',
  showPasswordLabel: '顯示密碼',
  actionFailedMessage: '操作失敗，請稍後再試',
  loginFailedMessage: '登入失敗，請確認帳號或密碼',
  registerFailedMessage: '註冊失敗，請稍後再試',
  registerSuccessMessage: '註冊請求已送出，請依驗證流程完成帳號啟用。',
  loginSubmitLabel: '登入',
  registerSubmitLabel: '註冊',
  phoneHelperText: '支援 09 開頭或 +886 格式',
} as const;

function resolveIdentityFieldCopy(identityType: AuthIdentityType) {
  return identityType === 'email'
    ? {
        label: loginFormText.emailLabel,
        placeholder: loginFormText.emailPlaceholder,
        autoComplete: 'email',
      }
    : {
        label: loginFormText.phoneLabel,
        placeholder: loginFormText.phonePlaceholder,
        autoComplete: 'tel',
      };
}

export function LoginForm({
  mode = 'login',
  providerActions = mode === 'login' ? defaultProviderActions : [],
  onSubmitAsync,
  onForgotPasswordAsync,
  onSmsLoginAsync,
  secondaryActionLabel,
  onSecondaryAction,
  successMessage,
}: LoginFormProps) {
  const authPalette = getAuthColorScheme(useTheme());
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | undefined>();
  const [submissionSuccess, setSubmissionSuccess] = useState<
    string | undefined
  >();
  const [identityType, setIdentityType] = useState<AuthIdentityType>('email');

  const {
    control,
    handleSubmit,
    resetField,
    formState: { isSubmitting },
  } = useForm<{
    name: string;
    identity: string;
    password: string;
  }>({ defaultValues: { name: '', identity: '', password: '' } });

  const nameValue = useWatch({ control, name: 'name' }) ?? '';
  const identityValue = useWatch({ control, name: 'identity' }) ?? '';
  const passwordValue = useWatch({ control, name: 'password' }) ?? '';
  const canSubmit =
    !isSubmitting &&
    identityValue.trim().length > 0 &&
    (mode === 'login' || nameValue.trim().length > 0) &&
    passwordValue.trim().length > 0;

  async function runAction(action: (() => Promise<void> | void) | undefined) {
    if (!action || isSubmitting) {
      return;
    }

    try {
      await action();
    } catch {
      setSubmissionError(loginFormText.actionFailedMessage);
    }
  }

  const resolvedProviderActions = providerActions.map((action) => ({
    ...action,
    disabled: isSubmitting || action.disabled || !action.onClick,
    onClick: action.onClick
      ? () => {
          void runAction(action.onClick);
        }
      : undefined,
  }));
  const identityFieldCopy = resolveIdentityFieldCopy(identityType);
  const resolvedSuccessMessage =
    successMessage ??
    (mode === 'register' ? loginFormText.registerSuccessMessage : undefined);
  const shouldShowProviderActions = resolvedProviderActions.length > 0;

  const handleFormSubmit = handleSubmit(async (values) => {
    setSubmissionError(undefined);
    setSubmissionSuccess(undefined);

    try {
      await onSubmitAsync?.({
        identityType,
        identity: values.identity.trim(),
        normalizedIdentity: normalizeIdentityValue(
          identityType,
          values.identity,
        ),
        password: values.password.trim(),
        name: mode === 'register' ? values.name.trim() : undefined,
      });
      setSubmissionSuccess(resolvedSuccessMessage);
      if (mode === 'register') {
        resetField('password');
      }
    } catch {
      setSubmissionError(
        mode === 'login'
          ? loginFormText.loginFailedMessage
          : loginFormText.registerFailedMessage,
      );
    }
  });

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
      {/* <LoginAudienceSwitch disabled={isSubmitting} /> */}

      {mode === 'register' ? (
        <Controller
          name="name"
          control={control}
          rules={{
            validate: (value) =>
              value.trim().length > 0 ||
              loginFormText.displayNameRequiredMessage,
          }}
          render={({ field, fieldState }) => (
            <AuthField
              label={loginFormText.displayNameLabel}
              value={field.value ?? ''}
              onChange={field.onChange}
              placeholder={loginFormText.displayNamePlaceholder}
              autoComplete="nickname"
              disabled={isSubmitting}
              errorText={fieldState.error?.message}
            />
          )}
        />
      ) : null}

      <Stack spacing={0.5}>
        <Typography
          component="div"
          sx={{
            color: authPalette.textSecondary,
            fontSize: 12,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '0.6px',
          }}
        >
          {mode === 'login'
            ? loginFormText.accountTypeLabel
            : loginFormText.registerAccountTypeLabel}
        </Typography>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{
            p: 0.5,
            borderRadius: '18px',
            border: `1px solid ${authPalette.fieldBorder}`,
            bgcolor: authPalette.fieldBackground,
          }}
        >
          {(['email', 'phone'] as const).map((value) => {
            const active = identityType === value;

            return (
              <Button
                key={value}
                type="button"
                fullWidth
                disabled={isSubmitting}
                onClick={() => {
                  setIdentityType(value);
                  resetField('identity');
                  setSubmissionError(undefined);
                  setSubmissionSuccess(undefined);
                }}
                sx={{
                  minHeight: 40,
                  borderRadius: '14px',
                  bgcolor: active ? '#D8F2FF' : 'transparent',
                  border: active
                    ? '1px solid #8ED8F8'
                    : '1px solid transparent',
                  color: authPalette.textPrimary,
                  fontSize: 13,
                  lineHeight: '16px',
                  fontWeight: 700,
                  letterSpacing: '0.6px',
                  '&:hover': {
                    bgcolor: active ? '#D8F2FF' : '#EEF3F8',
                  },
                }}
              >
                {value === 'email'
                  ? loginFormText.emailToggleLabel
                  : loginFormText.phoneToggleLabel}
              </Button>
            );
          })}
        </Stack>
      </Stack>

      <Controller
        name="identity"
        control={control}
        rules={{
          validate: (value) => validateIdentityValue(identityType, value),
        }}
        render={({ field, fieldState }) => (
          <AuthField
            label={identityFieldCopy.label}
            labelHelperText={
              identityType === 'phone'
                ? loginFormText.phoneHelperText
                : undefined
            }
            value={field.value ?? ''}
            onChange={field.onChange}
            placeholder={identityFieldCopy.placeholder}
            autoComplete={identityFieldCopy.autoComplete}
            disabled={isSubmitting}
            errorText={fieldState.error?.message}
          />
        )}
      />

      <Controller
        name="password"
        control={control}
        rules={{
          validate: (value) =>
            value.trim().length > 0 || loginFormText.passwordRequiredMessage,
        }}
        render={({ field, fieldState }) => (
          <AuthField
            label={loginFormText.passwordLabel}
            value={field.value ?? ''}
            onChange={field.onChange}
            placeholder={loginFormText.passwordPlaceholder}
            type={isPasswordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            disabled={isSubmitting}
            labelActionLabel={
              onForgotPasswordAsync && !isSubmitting
                ? loginFormText.forgotPasswordLabel
                : undefined
            }
            onLabelAction={
              onForgotPasswordAsync && !isSubmitting
                ? () => {
                    void runAction(onForgotPasswordAsync);
                  }
                : undefined
            }
            errorText={fieldState.error?.message}
            endAdornment={
              <InputAdornment position="end">
                <IconButton
                  type="button"
                  edge="end"
                  disabled={isSubmitting}
                  onClick={() => setIsPasswordVisible((current) => !current)}
                  aria-label={
                    isPasswordVisible
                      ? loginFormText.hidePasswordLabel
                      : loginFormText.showPasswordLabel
                  }
                  sx={{ p: 0.5 }}
                >
                  {isPasswordVisible ? (
                    <VisibilityRoundedIcon />
                  ) : (
                    <VisibilityOffRoundedIcon />
                  )}
                </IconButton>
              </InputAdornment>
            }
          />
        )}
      />

      {submissionError ? (
        <Typography
          role="alert"
          sx={{
            color: 'error.main',
            fontSize: 13,
            lineHeight: '20px',
            fontWeight: 600,
          }}
        >
          {submissionError}
        </Typography>
      ) : null}

      {submissionSuccess ? (
        <Typography
          role="status"
          sx={{
            color: '#2F6B2F',
            fontSize: 13,
            lineHeight: '20px',
            fontWeight: 600,
          }}
        >
          {submissionSuccess}
        </Typography>
      ) : null}

      <Button
        onClick={handleFormSubmit}
        disabled={!canSubmit}
        sx={{
          width: '100%',
          minHeight: 40,
          borderRadius: '999px',
          bgcolor: authPalette.primaryAction,
          color: 'common.white',
          px: 2,
          py: '8px',
          fontSize: 14,
          lineHeight: '16px',
          fontWeight: 600,
          letterSpacing: '0.7px',
          '&:hover': {
            bgcolor: authPalette.primaryActionHover,
          },
        }}
      >
        {isSubmitting ? (
          <CircularProgress size={18} color="inherit" />
        ) : mode === 'login' ? (
          loginFormText.loginSubmitLabel
        ) : (
          loginFormText.registerSubmitLabel
        )}
      </Button>

      {secondaryActionLabel && onSecondaryAction ? (
        <Button
          type="button"
          onClick={() => {
            void runAction(onSecondaryAction);
          }}
          disabled={isSubmitting}
          sx={{
            width: '100%',
            minHeight: 40,
            borderRadius: '999px',
            border: `1px solid ${authPalette.fieldBorder}`,
            bgcolor: authPalette.fieldBackground,
            color: authPalette.textPrimary,
            px: 2,
            py: '8px',
            fontSize: 14,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '0.7px',
            '&:hover': {
              bgcolor: '#EEF3F8',
            },
          }}
        >
          {secondaryActionLabel}
        </Button>
      ) : null}

      {mode === 'login' && onSmsLoginAsync ? (
        <Box
          component="button"
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            void runAction(onSmsLoginAsync);
          }}
          sx={{
            alignSelf: 'center',
            border: 0,
            bgcolor: 'transparent',
            p: 0,
            color: authPalette.coolLink,
            fontSize: 12,
            lineHeight: '16px',
            fontWeight: 600,
            letterSpacing: '0.6px',
            cursor: isSubmitting ? 'default' : 'pointer',
            opacity: isSubmitting ? 0.6 : 1,
            textDecoration: 'none',
          }}
        >
          {loginFormText.smsActionLabel}
        </Box>
      ) : null}

      {shouldShowProviderActions ? (
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" sx={{ width: '100%', alignItems: 'center' }}>
            <Box
              sx={{
                flex: 1,
                borderTop: `1px solid ${authPalette.fieldBorder}`,
              }}
            />
            <Box sx={{ px: 2 }}>
              <Typography
                variant="overline"
                sx={{
                  color: authPalette.textSecondary,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                }}
              >
                {loginFormText.dividerLabel}
              </Typography>
            </Box>
            <Box
              sx={{
                flex: 1,
                borderTop: `1px solid ${authPalette.fieldBorder}`,
              }}
            />
          </Stack>

          <Stack spacing={1}>
            {resolvedProviderActions.map((action) => (
              <AuthProviderButton
                key={`${action.provider}-${action.label}`}
                provider={action.provider}
                label={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                icon={action.icon}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}

export function RegisterForm(
  props: Omit<LoginFormProps, 'mode' | 'providerActions'>,
) {
  return <LoginForm {...props} mode="register" providerActions={[]} />;
}
