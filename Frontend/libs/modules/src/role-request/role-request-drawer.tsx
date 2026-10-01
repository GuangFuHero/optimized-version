'use client';

import {
  Alert,
  AlertTitle,
  Box,
  Button,
  ButtonBase,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useId, useState } from 'react';
import { useMutation } from 'urql';

import {
  SubmitRoleRequestDocument,
  type MyRoleRequestsQuery,
} from '@rescue-frontend/data-access';
import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { SiteActionDrawer } from '../shell/site/site-action-drawer';
import { roleRequestDrawerView } from './drawer-view';
import { roleRequestErrorMessage } from './error';
import {
  CONTACT_MAX_LENGTH,
  REASON_MAX_LENGTH,
  ROLE_REQUEST_OPTIONS,
  roleRequestFormProblems,
  toSubmitRoleRequestInput,
  validateRoleRequestForm,
  type RoleRequestFormValues,
} from './form';
import { RoleRequestCard } from './role-request-card';

const { color, radius } = designTokens;

const TITLE = '申請成為後台人員';
const EMPTY_FORM: RoleRequestFormValues = {
  role: null,
  reason: '',
  contact: '',
};

interface RoleRequestDrawerProps {
  open: boolean;
  onClose: () => void;
  myRoleRequests: MyRoleRequestsQuery['myRoleRequests'] | null;
  /** Read the applications again once one is sent: the drawer then shows it waiting. */
  onSubmitted: () => void;
}

/**
 * 申請成為後台人員 (prototype `RoleElevationDrawer`, `Design/前台/js/site/site-actions.jsx:157-265`):
 * the application waiting for review, or the form under the last rejection. What it shows is
 * `roleRequestDrawerView`'s decision; the form's rules are `validateRoleRequestForm`'s.
 */
export function RoleRequestDrawer({
  open,
  onClose,
  myRoleRequests,
  onSubmitted,
}: RoleRequestDrawerProps) {
  const [values, setValues] = useState<RoleRequestFormValues>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [{ fetching: submitting }, submitRoleRequest] = useMutation(
    SubmitRoleRequestDocument,
  );
  const roleLabelId = useId();

  // Each opening starts from an empty form, as the prototype does.
  useEffect(() => {
    if (open) {
      setValues(EMPTY_FORM);
      setTouched(false);
      setSubmitError(null);
    }
  }, [open]);

  if (!myRoleRequests) {
    return null;
  }

  const view = roleRequestDrawerView(myRoleRequests);

  if (view.kind === 'pending') {
    return (
      <SiteActionDrawer open={open} title={TITLE} onClose={onClose}>
        <Stack spacing={2}>
          <Alert severity="info">
            <AlertTitle>你已經有一筆申請在審核中</AlertTitle>
            同一時間只能有一筆申請。要改申請別的身分，請等這一筆有結果。
          </Alert>
          <RoleRequestCard request={view.pending} />
        </Stack>
      </SiteActionDrawer>
    );
  }

  const errors = validateRoleRequestForm(values);
  const problems = roleRequestFormProblems(errors);
  const set = (field: keyof RoleRequestFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const submit = async () => {
    setTouched(true);

    if (problems.length || !values.role) {
      return;
    }

    setSubmitError(null);
    const result = await submitRoleRequest({
      input: toSubmitRoleRequestInput({ ...values, role: values.role }),
    });

    if (result.error) {
      setSubmitError(roleRequestErrorMessage(result.error));
    }

    // Either way the list may have moved on (a pending one from another tab, say): read it again.
    onSubmitted();
  };

  return (
    <SiteActionDrawer
      open={open}
      title={TITLE}
      subtitle="後台人員可以派工、審核資料、管理站點。送出後由超級管理員審核。"
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={onClose} sx={{ flex: 1 }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={() => void submit()}
            disabled={view.paused || submitting}
            sx={{ flex: 2 }}
          >
            送出申請
          </Button>
        </>
      }
    >
      <Stack spacing={2.5}>
        {view.paused ? (
          <Alert severity="info">目前暫停開放申請，請稍後再來。</Alert>
        ) : null}

        {view.lastRejected ? (
          <RoleRequestCard request={view.lastRejected} />
        ) : null}

        <Box>
          <Typography
            id={roleLabelId}
            sx={{
              mb: 1,
              color: color.fg.neutral.default,
              fontSize: displayTextSize[14],
              lineHeight: 1.2,
              fontWeight: 700,
            }}
          >
            你要申請哪一種身分？
            <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
              *
            </Box>
          </Typography>
          {touched && errors.role ? (
            <Typography
              role="alert"
              sx={{
                mb: 1,
                color: color.fg.danger,
                fontSize: displayTextSize[13],
                lineHeight: 1.5,
              }}
            >
              {errors.role}
            </Typography>
          ) : null}
          <Stack role="radiogroup" aria-labelledby={roleLabelId} spacing={1}>
            {ROLE_REQUEST_OPTIONS.map((option) => (
              <RoleOption
                key={option.value}
                label={option.label}
                hint={option.hint}
                checked={values.role === option.value}
                onSelect={() =>
                  setValues((current) => ({ ...current, role: option.value }))
                }
              />
            ))}
          </Stack>
          {/* Written on purpose: someone who cannot find their option thinks they missed it. */}
          <Typography
            sx={{
              mt: 1,
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[12],
              lineHeight: 1.6,
            }}
          >
            要加入某個救災團隊（NGO
            或政府單位）請向該團隊索取邀請碼，不從這裡申請。
          </Typography>
        </Box>

        <TextField
          label="申請理由"
          required
          multiline
          minRows={3}
          fullWidth
          value={values.reason}
          onChange={(event) => set('reason')(event.target.value)}
          placeholder="例：我是光復鄉公所民政課，負責收容所名冊，需要在後台更新站點資訊。"
          error={touched && Boolean(errors.reason)}
          helperText={
            touched && errors.reason
              ? errors.reason
              : `寫清楚你的單位、職務，以及為什麼需要後台權限（最多 ${REASON_MAX_LENGTH} 字）`
          }
        />

        <TextField
          label="可聯絡到你的方式（選填）"
          fullWidth
          size="small"
          value={values.contact}
          onChange={(event) => set('contact')(event.target.value)}
          placeholder="公務電話、分機或 Email"
          error={touched && Boolean(errors.contact)}
          helperText={
            touched && errors.contact
              ? errors.contact
              : `審核者可能需要向你確認身分（最多 ${CONTACT_MAX_LENGTH} 字）`
          }
        />

        {touched && problems.length ? (
          <Alert severity="error">
            <AlertTitle>尚有 {problems.length} 項未完成</AlertTitle>
            請補齊：{problems.join('、')}。
          </Alert>
        ) : null}

        {submitError ? <Alert severity="error">{submitError}</Alert> : null}
      </Stack>
    </SiteActionDrawer>
  );
}

/** One of the three identities, a card-like radio (prototype site-actions.jsx:224-240). */
function RoleOption({
  label,
  hint,
  checked,
  onSelect,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      sx={{
        display: 'block',
        width: '100%',
        p: 1.5,
        textAlign: 'left',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${checked ? color.brand.secondary.default : color.border.default}`,
        bgcolor: checked ? color.bg.secondary.subtle : color.bg.neutral.default,
      }}
    >
      <Typography
        component="span"
        sx={{
          display: 'block',
          color: color.fg.neutral.default,
          fontSize: displayTextSize[14],
          lineHeight: 1.4,
          fontWeight: checked ? 800 : 700,
        }}
      >
        {label}
      </Typography>
      <Typography
        component="span"
        sx={{
          display: 'block',
          mt: 0.25,
          color: color.fg.neutral.subtle,
          fontSize: displayTextSize[12],
          lineHeight: 1.5,
        }}
      >
        {hint}
      </Typography>
    </ButtonBase>
  );
}
