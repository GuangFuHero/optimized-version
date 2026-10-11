'use client';

import { Alert, Box, Button, Link, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { getAuthColorScheme } from '../../theme/auth-theme';
import { AuthFormError } from '../../utils/auth-form-error';
import {
  normalizeIdentityValue,
  validateIdentityValue,
  type AuthIdentityType,
} from '../../utils/identity-validation';
import { newPasswordProblem, newPasswordText } from '../../utils/new-password';
import { AuthField } from '../auth-field';
import { AuthIdentityToggle } from '../auth-identity-toggle';
import { AuthPasswordField } from '../auth-password-field';
import { AuthProviderButton } from '../auth-provider-button';

const { color, radius, shadow } = designTokens;

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
  loginTitle: '登入',
  loginDescription: '用 Email 或手機號碼登入。還沒有帳號可以直接註冊。',
  // The design has no register screen: these two are ours, passed to the designer to look over.
  registerTitle: '註冊帳號',
  registerDescription: '用 Email 或手機號碼註冊，收到驗證碼後完成啟用。',
  emailLabel: '電子郵件',
  emailPlaceholder: 'name@example.com',
  phoneLabel: '手機號碼',
  phonePlaceholder: '0912345678',
  displayNameLabel: '顯示名稱',
  displayNamePlaceholder: '請輸入顯示名稱',
  passwordLabel: '密碼',
  passwordPlaceholder: '輸入密碼',
  forgotPasswordLabel: '忘記密碼？',
  smsActionLabel: '透過簡訊驗證登入',
  emailRequiredMessage: '請輸入電子郵件',
  displayNameRequiredMessage: '請輸入顯示名稱',
  passwordRequiredMessage: '請輸入密碼',
  dividerLabel: '或',
  actionFailedMessage: '操作失敗，請稍後再試',
  loginFailedMessage: '登入失敗，請確認帳號或密碼',
  registerFailedMessage: '註冊失敗，請稍後再試',
  registerSuccessMessage: '註冊請求已送出，請依驗證流程完成帳號啟用。',
  loginSubmitLabel: '登入',
  loginSubmittingLabel: '登入中⋯',
  registerSubmitLabel: '註冊',
  registerSubmittingLabel: '註冊中⋯',
} as const;

function resolveIdentityFieldCopy(identityType: AuthIdentityType) {
  return identityType === 'email'
    ? {
        label: loginFormText.emailLabel,
        placeholder: loginFormText.emailPlaceholder,
      }
    : {
        label: loginFormText.phoneLabel,
        placeholder: loginFormText.phonePlaceholder,
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
    } catch (error) {
      setSubmissionError(
        error instanceof AuthFormError
          ? error.message
          : loginFormText.actionFailedMessage,
      );
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
    } catch (error) {
      const fallbackMessage =
        mode === 'login'
          ? loginFormText.loginFailedMessage
          : loginFormText.registerFailedMessage;

      setSubmissionError(
        error instanceof AuthFormError ? error.message : fallbackMessage,
      );
    }
  });

  return (
    <Stack
      spacing={2}
      sx={{
        width: '100%',
        borderRadius: `${radius.xl}px`,
        border: `1px solid ${color.border.default}`,
        p: 3,
        boxShadow: shadow.sm,
        bgcolor: color.bg.neutral.default,
      }}
    >
      {/* <LoginAudienceSwitch disabled={isSubmitting} /> */}

      <Stack spacing={0.5}>
        <Typography
          component="h2"
          sx={{
            color: color.fg.neutral.default,
            fontSize: displayTextSize[20],
            lineHeight: 1.3,
            fontWeight: 700,
          }}
        >
          {mode === 'login'
            ? loginFormText.loginTitle
            : loginFormText.registerTitle}
        </Typography>
        <Typography
          sx={{
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[13],
            lineHeight: 1.6,
          }}
        >
          {mode === 'login'
            ? loginFormText.loginDescription
            : loginFormText.registerDescription}
        </Typography>
      </Stack>

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

      <AuthIdentityToggle
        value={identityType}
        disabled={isSubmitting}
        onChange={(value) => {
          setIdentityType(value);
          resetField('identity');
          setSubmissionError(undefined);
          setSubmissionSuccess(undefined);
        }}
      />

      <Controller
        name="identity"
        control={control}
        rules={{
          validate: (value) => validateIdentityValue(identityType, value),
        }}
        render={({ field, fieldState }) => (
          <AuthField
            label={identityFieldCopy.label}
            value={field.value ?? ''}
            onChange={field.onChange}
            placeholder={identityFieldCopy.placeholder}
            // `username`, not `email`/`tel`: password managers pair it with the password field.
            autoComplete="username"
            disabled={isSubmitting}
            errorText={fieldState.error?.message}
          />
        )}
      />

      <Controller
        name="password"
        control={control}
        rules={{
          // Registering sets a password, so it meets the rule every new password does; signing in
          // only needs one typed.
          validate: (value) => {
            if (value.trim().length === 0) {
              return loginFormText.passwordRequiredMessage;
            }

            return mode === 'register'
              ? (newPasswordProblem(value) ?? true)
              : true;
          },
        }}
        render={({ field, fieldState }) => (
          <AuthPasswordField
            label={loginFormText.passwordLabel}
            value={field.value ?? ''}
            onChange={field.onChange}
            placeholder={
              mode === 'register'
                ? newPasswordText.placeholder
                : loginFormText.passwordPlaceholder
            }
            autoComplete={
              mode === 'register' ? 'new-password' : 'current-password'
            }
            disabled={isSubmitting}
            errorText={fieldState.error?.message}
          />
        )}
      />

      {onForgotPasswordAsync ? (
        <Link
          component="button"
          type="button"
          underline="always"
          disabled={isSubmitting}
          onClick={() => {
            void runAction(onForgotPasswordAsync);
          }}
          sx={{
            alignSelf: 'flex-start',
            minHeight: 44,
            color: color.brand.primary.subtle,
            fontSize: displayTextSize[13],
            lineHeight: 1.2,
            fontWeight: 700,
            '&:disabled': { cursor: 'default', opacity: 0.6 },
          }}
        >
          {loginFormText.forgotPasswordLabel}
        </Link>
      ) : null}

      {submissionError ? (
        <Alert severity="error">{submissionError}</Alert>
      ) : null}

      {submissionSuccess ? (
        <Alert severity="success">{submissionSuccess}</Alert>
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
        {mode === 'login'
          ? isSubmitting
            ? loginFormText.loginSubmittingLabel
            : loginFormText.loginSubmitLabel
          : isSubmitting
            ? loginFormText.registerSubmittingLabel
            : loginFormText.registerSubmitLabel}
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
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ width: '100%', alignItems: 'center' }}
          >
            <Box
              sx={{ flex: 1, borderTop: `1px solid ${color.border.default}` }}
            />
            <Typography
              sx={{
                color: color.fg.neutral.muted,
                fontSize: displayTextSize[11],
                lineHeight: 1.4,
              }}
            >
              {loginFormText.dividerLabel}
            </Typography>
            <Box
              sx={{ flex: 1, borderTop: `1px solid ${color.border.default}` }}
            />
          </Stack>

          {/* Side by side as designed, from 600px: on a phone the two labels break onto a second
              line, so there they stack. The brand marks stay, as Google's sign-in button rules ask. */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {resolvedProviderActions.map((action) => (
              <Box
                key={`${action.provider}-${action.label}`}
                sx={{ flex: 1, minWidth: 0 }}
              >
                <AuthProviderButton
                  provider={action.provider}
                  label={action.label}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  icon={action.icon}
                />
              </Box>
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
