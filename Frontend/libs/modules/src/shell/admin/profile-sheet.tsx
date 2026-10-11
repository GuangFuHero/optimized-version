'use client';

import { Check, Lock, Mail, Phone, ShieldAlert, User } from 'lucide-react';

import { Box, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  useTeams,
  useUpdateCurrentUser,
} from '@rescue-frontend/data-access/admin';
import type { components } from '@rescue-frontend/data-access/openapi';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  designTokens,
  Sheet,
  TextInput,
} from '@rescue-frontend/ui';

import {
  normalizeIdentityValue,
  validateIdentityValue,
} from '../../auth/login';
import {
  identityLabel,
  ROLE_DISPLAY_NAMES,
  TEAM_TYPE_DISPLAY_NAMES,
} from '../../constants/roles';
import {
  ContactVerifyDialog,
  type ContactVerifyDialogProps,
} from './contact-verify-dialog';

const { color, typography } = designTokens;

type ContactType = ContactVerifyDialogProps['type'];

function ReadRow({
  label,
  note,
  children,
}: {
  label: string;
  note?: string | null;
  children: ReactNode;
}) {
  return (
    <Stack
      sx={{
        gap: '3px',
        py: '11px',
        borderTop: `1px solid ${color.bg.neutral.sunken}`,
      }}
    >
      <Typography
        sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
      >
        {label}
      </Typography>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          ...typography.body[400],
          color: color.fg.neutral.default,
        }}
      >
        {children}
      </Stack>
      {note ? (
        <Typography
          sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
        >
          {note}
        </Typography>
      ) : null}
    </Stack>
  );
}

function ContactField({
  type,
  contact,
  onVerify,
}: {
  type: ContactType;
  contact?: components['schemas']['ContactOut'];
  onVerify: (value: string) => void;
}) {
  const [value, setValue] = useState(contact?.value ?? '');
  const trimmed = value.trim();
  const validation = validateIdentityValue(type, trimmed);
  const normalized =
    validation === true ? normalizeIdentityValue(type, trimmed) : null;
  const FieldIcon = type === 'email' ? Mail : Phone;

  return (
    <Stack sx={{ gap: '6px' }}>
      <TextInput
        label={type === 'email' ? 'Email' : '電話'}
        hint="登入方式"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={type === 'email' ? '尚未設定 Email' : '尚未設定電話'}
        error={trimmed !== '' && validation !== true ? validation : null}
        leadingIcon={<FieldIcon size={17} />}
        trailing={
          normalized && normalized !== contact?.value ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onVerify(normalized)}
            >
              驗證
            </Button>
          ) : null
        }
      />
      <Stack direction="row" sx={{ alignItems: 'center', gap: '8px' }}>
        <Typography
          sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
        >
          目前登入使用：{contact?.value ?? '未設定'}
        </Typography>
        {contact ? (
          <Badge tone={contact.verified ? 'success' : 'warning'}>
            {contact.verified ? '已驗證' : '未驗證'}
          </Badge>
        ) : null}
      </Stack>
    </Stack>
  );
}

export function ProfileSheet({
  user,
  onClose,
}: {
  user: components['schemas']['UserResponse'];
  onClose: () => void;
}) {
  const updateCurrentUser = useUpdateCurrentUser();
  const { data: teams } = useTeams({
    enabled: Boolean(user.active_identity?.team_uuid),
  });
  const [name, setName] = useState(user.name);
  const [verifying, setVerifying] = useState<{
    type: ContactType;
    value: string;
  } | null>(null);
  const trimmedName = name.trim();
  const nameDirty = trimmedName !== user.name;
  const active = user.active_identity;
  const identities = user.identities ?? [];
  const teamIdentities = identities.filter((identity) => identity.team);
  const activeTeamType = teams?.find(
    (team) => team.uuid === active?.team_uuid,
  )?.type;
  const platformRole = active?.team_uuid
    ? activeTeamType && TEAM_TYPE_DISPLAY_NAMES.get(activeTeamType)
    : active && ROLE_DISPLAY_NAMES.get(active.role);

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow="個人設定"
      title={user.name}
      width={520}
      leading={
        <Avatar
          name={user.name}
          tone={active?.team ? 'secondary' : 'primary'}
          size={48}
        />
      }
      footer={
        <>
          {updateCurrentUser.isSuccess && !nameDirty ? (
            <Stack
              direction="row"
              sx={{
                mr: 'auto',
                alignItems: 'center',
                gap: '6px',
                ...typography.body[300],
                color: color.fg.success,
              }}
            >
              <Check size={16} />
              已儲存
            </Stack>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={nameDirty ? () => setName(user.name) : onClose}
          >
            {nameDirty ? '還原' : '關閉'}
          </Button>
          <Button
            size="sm"
            disabled={!nameDirty || !trimmedName || updateCurrentUser.isPending}
            onClick={() =>
              updateCurrentUser.mutate({ body: { name: trimmedName } })
            }
          >
            儲存
          </Button>
        </>
      }
    >
      <Stack sx={{ gap: '22px' }}>
        <TextInput
          required
          label="名字"
          hint="會顯示在頂欄、任務指派與操作紀錄"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={
            trimmedName
              ? null
              : '名字不能空白。這個名字會出現在頂欄、任務指派與操作紀錄上。'
          }
          helperText="不是登入帳號，儲存後立即生效。"
          inputProps={{ maxLength: 100 }}
          leadingIcon={<User size={17} />}
        />

        <Stack
          sx={{
            gap: '18px',
            pt: '18px',
            borderTop: `1px solid ${color.border.default}`,
          }}
        >
          <Callout>
            電話與 Email
            同時是登入方式。變更後需要驗證新的收件端、並通知舊的收件端才會生效，在那之前原本的還可以登入。
          </Callout>
          {(['phone', 'email'] as const).map((type) => (
            <ContactField
              key={type}
              type={type}
              contact={user.contacts?.find((contact) => contact.type === type)}
              onVerify={(value) => setVerifying({ type, value })}
            />
          ))}
        </Stack>

        <Box
          sx={{ pt: '18px', borderTop: `1px solid ${color.border.default}` }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: 'center', gap: '8px', mb: '4px' }}
          >
            <Typography
              sx={{ ...typography.label[400], color: color.fg.neutral.default }}
            >
              角色身份
            </Typography>
            <Stack
              direction="row"
              sx={{
                alignItems: 'center',
                gap: '4px',
                ...typography.data[300],
                color: color.fg.neutral.muted,
              }}
            >
              <Lock size={12} />
              唯讀
            </Stack>
          </Stack>

          <ReadRow
            label="平台角色"
            note="由目前身份決定 —— 切換身份時這一列會變。"
          >
            {platformRole ? (
              <Badge tone={active?.team_uuid ? 'secondary' : 'primary'}>
                {platformRole}
              </Badge>
            ) : (
              <Box component="span" sx={{ color: color.fg.neutral.muted }}>
                —
              </Box>
            )}
          </ReadRow>

          <ReadRow
            label="目前身份"
            note={
              identities.length > 1
                ? '切換身份請用右上角人名選單。各身份的權限完全切割 —— 目前身份做不到的事不會出現在畫面上，要先切換過去。'
                : null
            }
          >
            {active ? (
              <Badge tone={active.team ? 'info' : 'primary'}>
                {identityLabel(active)}
              </Badge>
            ) : (
              <Box component="span" sx={{ color: color.fg.neutral.muted }}>
                無
              </Box>
            )}
          </ReadRow>

          <ReadRow
            label="所屬團隊"
            note={
              teamIdentities.length
                ? null
                : '未隸屬任何團隊 —— 這是合法狀態，權限來自平台角色。'
            }
          >
            {teamIdentities.length ? (
              teamIdentities.map((identity) => {
                const current =
                  identity.role_uuid === active?.role_uuid &&
                  identity.team_uuid === active?.team_uuid;
                return (
                  <Stack
                    key={`${identity.role_uuid}:${identity.team_uuid}`}
                    direction="row"
                    sx={{ alignItems: 'center', gap: '6px' }}
                  >
                    <Box
                      component="span"
                      sx={{
                        fontWeight: current ? 700 : 400,
                        color: current
                          ? color.fg.neutral.default
                          : color.fg.neutral.muted,
                      }}
                    >
                      {identity.team}
                    </Box>
                    <Badge
                      tone={identity.role === 'admin' ? 'primary' : 'neutral'}
                    >
                      {ROLE_DISPLAY_NAMES.get(identity.role) ?? identity.role}
                    </Badge>
                    {current ? <Badge tone="info">目前身份</Badge> : null}
                  </Stack>
                );
              })
            ) : (
              <Box component="span" sx={{ color: color.fg.neutral.muted }}>
                無
              </Box>
            )}
          </ReadRow>

          <Stack
            direction="row"
            sx={{
              mt: '12px',
              gap: '9px',
              alignItems: 'flex-start',
              ...typography.data[300],
              color: color.fg.neutral.muted,
            }}
          >
            <Box
              component={ShieldAlert}
              sx={{ width: 15, height: 15, mt: '2px', flexShrink: 0 }}
            />
            角色不能自己改。需要調整權限請提出申請：團隊角色由該隊管理員審核，平台角色由超級管理員審核。
          </Stack>
        </Box>
      </Stack>

      {verifying ? (
        <ContactVerifyDialog
          type={verifying.type}
          value={verifying.value}
          user={user}
          onClose={() => setVerifying(null)}
        />
      ) : null}
    </Sheet>
  );
}
