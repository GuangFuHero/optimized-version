'use client';

import { Check, Lock } from 'lucide-react';

import { Box, Radio, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form';
import type { components } from '@rescue-frontend/data-access/openapi';
import { toast } from 'sonner';

import {
  useAddTeamMember,
  useAssignUserRole,
  useCreateTeam,
  useUpdateTeam,
  type AddTeamMemberInput,
  type AssignUserRoleInput,
} from '@rescue-frontend/data-access/admin';
import {
  Avatar,
  Callout,
  designTokens,
  Dialog,
  TextInput,
} from '@rescue-frontend/ui';

import { ROLE_DESCRIPTIONS, ROLE_DISPLAY_NAMES } from '../../constants/roles';
import { TypeChip } from '../shared/import-dialog-parts';
import { platformLabel } from './badges';
import { captionSx, SearchField } from './parts';
import {
  isValidTaxId,
  matchesName,
  platformOf,
  type AdminUser,
  type Team,
} from './roster';

const { color, radius, typography } = designTokens;

/**
 * A hard rule refusing what was asked (the prototype's `BlockDialog`): nothing to choose, so
 * one button.
 */
export function BlockDialog({
  title,
  body,
  rule,
  onClose,
}: {
  title: string;
  body: ReactNode;
  rule: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      title={title}
      confirmLabel="我知道了"
      cancelLabel={null}
      onConfirm={onClose}
      onClose={onClose}
    >
      <Typography
        sx={{ ...typography.body[400], color: color.fg.neutral.default }}
      >
        {body}
      </Typography>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1,
          p: '10px 14px',
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.subtle,
          border: `1px solid ${color.border.default}`,
        }}
      >
        <Box
          component={Lock}
          sx={{ width: 16, height: 16, color: color.fg.neutral.muted }}
        />
        <Typography sx={{ ...captionSx, color: color.fg.neutral.subtle }}>
          {rule}
        </Typography>
      </Stack>
    </Dialog>
  );
}

/** Rejecting a request needs a reason (the prototype's `ReasonDialog`; required, BE-038 step 4). */
export function ReasonDialog({
  title,
  body,
  confirmLabel,
  danger,
  submitting,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  submitting?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const form = useForm({
    defaultValues: { reason: '' },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) =>
        value.reason.trim() ? undefined : '此操作必須附上理由。',
    },
    onSubmit: ({ value }) => onConfirm(value.reason.trim()),
  });
  const reason = useStore(form.store, (state) => state.values.reason);
  const error = useStore(form.store, (state) => state.errorMap.onDynamic);

  return (
    <Dialog
      open
      title={title}
      confirmLabel={confirmLabel}
      confirmTone={danger ? 'danger' : 'primary'}
      submitting={submitting}
      onClose={onClose}
      onConfirm={() => void form.handleSubmit()}
    >
      <Typography
        sx={{ ...typography.body[400], color: color.fg.neutral.default }}
      >
        {body}
      </Typography>
      <TextInput
        label="理由"
        required
        multiline
        minRows={3}
        // The backend refuses a longer note with an English 422.
        inputProps={{ maxLength: 500 }}
        value={reason}
        placeholder="請說明原因…"
        onChange={(event) => form.setFieldValue('reason', event.target.value)}
        error={error}
      />
    </Dialog>
  );
}

type CreateTeamFields = Omit<
  components['schemas']['CreateTeamRequest'],
  'tax_id'
> & { tax_id: string };
const EMPTY_TEAM: CreateTeamFields = { name: '', type: 'ngo', tax_id: '' };

type TeamFields = {
  [K in keyof components['schemas']['UpdateTeamRequest']]-?: NonNullable<
    components['schemas']['UpdateTeamRequest'][K]
  >;
};

function teamFormErrors(
  { name, tax_id }: Pick<TeamFields, 'name' | 'tax_id'>,
  teams: readonly Team[],
  uuid?: string,
) {
  const trimmed = name.trim();
  const fields = {
    name: !trimmed
      ? '請輸入團隊名稱'
      : teams.some(
            (team) =>
              team.uuid !== uuid &&
              team.name.trim().toLowerCase() === trimmed.toLowerCase(),
          )
        ? '已有同名的團隊'
        : undefined,
    tax_id:
      tax_id.trim() && !isValidTaxId(tax_id.trim())
        ? '統一編號須為 8 位數字且通過檢查碼'
        : undefined,
  };
  return fields.name || fields.tax_id ? { fields } : undefined;
}

/** 新增團隊. `CreateTeamRequest` takes no contact; 編輯團隊資料 sets it afterwards. */
export function CreateTeamDialog({
  teams,
  onCreated,
  onClose,
}: {
  teams: readonly Team[];
  onCreated: (team: Team) => void;
  onClose: () => void;
}) {
  const createTeam = useCreateTeam();
  const form = useForm({
    defaultValues: EMPTY_TEAM,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ({ value }) => teamFormErrors(value, teams) },
    onSubmit: async ({ value }) => {
      await createTeam
        .mutateAsync({
          body: {
            name: value.name.trim(),
            type: value.type,
            tax_id: value.tax_id.trim() || null,
          },
        })
        .then(
          (team) => {
            toast.success(`已建立「${team.name}」`);
            onCreated(team);
          },
          () => undefined,
        );
    },
  });
  const {
    name,
    type,
    tax_id: taxId,
  } = useStore(form.store, (state) => state.values);
  const errors = useStore(form.store, (state) => state.fieldMeta);

  return (
    <Dialog
      open
      title="新增團隊"
      confirmLabel="建立團隊"
      submitting={createTeam.isPending}
      onClose={onClose}
      onConfirm={() => void form.handleSubmit()}
    >
      <TextInput
        label="團隊名稱"
        required
        autoFocus
        value={name}
        placeholder="例：壯闊台灣"
        onChange={(event) => form.setFieldValue('name', event.target.value)}
        error={errors.name?.errors[0]}
      />
      <Stack sx={{ gap: '6px' }}>
        <Typography
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          組織類型
          <Box component="span" aria-hidden sx={{ color: color.fg.danger }}>
            {' *'}
          </Box>
        </Typography>
        <Stack
          direction="row"
          role="radiogroup"
          aria-label="組織類型"
          sx={{ gap: 1 }}
        >
          {(['ngo', 'gov'] as const).map((value) => (
            <TypeChip
              key={value}
              icon={type === value ? <Check size={16} /> : undefined}
              label={platformLabel(value)}
              active={type === value}
              disabled={createTeam.isPending}
              onSelect={() => form.setFieldValue('type', value)}
            />
          ))}
        </Stack>
        <Typography sx={captionSx}>
          加入此隊的成員，平台角色由團隊類型推導為 <b>{platformLabel(type)}</b>
          。
        </Typography>
      </Stack>
      <TextInput
        label="對應組織統編"
        hint="選填"
        value={taxId}
        placeholder="8 位數統一編號"
        inputProps={{ inputMode: 'numeric', maxLength: 8 }}
        onChange={(event) => form.setFieldValue('tax_id', event.target.value)}
        error={errors.tax_id?.errors[0]}
      />
    </Dialog>
  );
}

/**
 * 編輯團隊資料 (`PATCH /admin/teams/{uuid}`, ADR-357): a super admin any team, a team admin
 * their own. The type is not editable. A field left blank is cleared. `teams` is what the
 * caller can see, for the duplicate-name hint; the backend checks against every team.
 */
export function EditTeamDialog({
  team,
  teams,
  onClose,
}: {
  team: Team;
  teams: readonly Team[];
  onClose: () => void;
}) {
  const updateTeam = useUpdateTeam();
  const [openedValues] = useState(
    () =>
      ({
        name: team.name,
        tax_id: team.tax_id ?? '',
        contact_name: team.contact_name ?? '',
        contact_phone: team.contact_phone ?? '',
      }) satisfies TeamFields,
  );
  const form = useForm({
    defaultValues: openedValues,
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => teamFormErrors(value, teams, team.uuid),
    },
    onSubmit: async ({ value }) => {
      await updateTeam
        .mutateAsync({
          params: { path: { team_uuid: team.uuid } },
          body: {
            name: value.name.trim(),
            tax_id: value.tax_id.trim() || null,
            contact_name: value.contact_name.trim() || null,
            contact_phone: value.contact_phone.trim() || null,
          },
        })
        .then(
          (updated) => {
            toast.success(`已更新「${updated.name}」的資料`);
            onClose();
          },
          () => undefined,
        );
    },
  });
  const {
    name,
    tax_id: taxId,
    contact_name: contactName,
    contact_phone: contactPhone,
  } = useStore(form.store, (state) => state.values);
  const errors = useStore(form.store, (state) => state.fieldMeta);

  return (
    <Dialog
      open
      title="編輯團隊資料"
      confirmLabel="儲存"
      submitting={updateTeam.isPending}
      onClose={onClose}
      onConfirm={() => void form.handleSubmit()}
    >
      <TextInput
        label="團隊名稱"
        required
        value={name}
        onChange={(event) => form.setFieldValue('name', event.target.value)}
        error={errors.name?.errors[0]}
      />
      <TextInput
        label="對應組織統編"
        hint="選填"
        value={taxId}
        placeholder="8 位數統一編號"
        inputProps={{ inputMode: 'numeric', maxLength: 8 }}
        onChange={(event) => form.setFieldValue('tax_id', event.target.value)}
        error={errors.tax_id?.errors[0]}
      />
      <TextInput
        label="聯絡窗口姓名"
        hint="選填"
        value={contactName}
        inputProps={{ maxLength: 100 }}
        placeholder="姓名"
        onChange={(event) =>
          form.setFieldValue('contact_name', event.target.value)
        }
      />
      <TextInput
        label="聯絡窗口電話"
        hint="選填 · 只有本隊管理員與超級管理員看得到"
        value={contactPhone}
        placeholder="0912 345 678"
        inputProps={{ inputMode: 'tel', maxLength: 20 }}
        onChange={(event) =>
          form.setFieldValue('contact_phone', event.target.value)
        }
      />
    </Dialog>
  );
}

/** One account to pick from a searchable list: adding a member and assigning a role both start here. */
function AccountPicker({
  users,
  teamTypes,
  selected,
  onSelect,
}: {
  users: readonly AdminUser[];
  teamTypes: ReadonlyMap<string, string>;
  selected: string | null;
  onSelect: (uuid: string) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = users
    .filter((user) => matchesName(user.name, query))
    .slice(0, 50);

  return (
    <Stack sx={{ gap: 1 }}>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="搜尋姓名…"
        label="搜尋帳號"
      />
      <Stack
        role="radiogroup"
        aria-label="帳號"
        sx={{
          maxHeight: 260,
          overflowY: 'auto',
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.md}px`,
        }}
      >
        {matches.length === 0 ? (
          <Typography sx={{ ...captionSx, p: 2, textAlign: 'center' }}>
            找不到符合的帳號
          </Typography>
        ) : (
          matches.map((user) => (
            <Stack
              key={user.uuid}
              component="label"
              direction="row"
              sx={{
                alignItems: 'center',
                gap: 1.5,
                minHeight: 52,
                px: 1.5,
                cursor: 'pointer',
                borderBottom: `1px solid ${color.border.default}`,
                '&:last-of-type': { borderBottom: 'none' },
                bgcolor:
                  selected === user.uuid
                    ? color.bg.primary.subtle
                    : 'transparent',
              }}
            >
              <Radio
                checked={selected === user.uuid}
                onChange={() => onSelect(user.uuid)}
                value={user.uuid}
                slotProps={{ input: { 'aria-label': user.name } }}
              />
              <Avatar name={user.name} size={30} tone="neutral" />
              <Typography
                sx={{ ...typography.label[400], flex: 1, minWidth: 0 }}
                noWrap
              >
                {user.name}
              </Typography>
              <Typography sx={captionSx}>
                {platformLabel(platformOf(user, teamTypes))}
              </Typography>
            </Stack>
          ))
        )}
      </Stack>
    </Stack>
  );
}

/**
 * Add an existing account to the team. Not in the prototype, which only invites by QR; a super
 * admin can see every account, so `POST /admin/teams/{uuid}/members` gives them this shortcut
 * beside the invite.
 */
type MemberDraft = {
  user_uuid: AddTeamMemberInput['body']['user_uuid'] | null;
  team_role_name: NonNullable<AddTeamMemberInput['body']['team_role_name']>;
};
const EMPTY_MEMBER: MemberDraft = { user_uuid: null, team_role_name: 'member' };

export function AddMemberDialog({
  team,
  candidates,
  teamTypes,
  onClose,
}: {
  team: Team;
  candidates: readonly AdminUser[];
  teamTypes: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  const addMember = useAddTeamMember();
  const form = useForm({
    defaultValues: EMPTY_MEMBER,
    onSubmit: (): void => submit(),
  });
  const { user_uuid: selected, team_role_name: role } = useStore(
    form.store,
    (state) => state.values,
  );
  const person = candidates.find((user) => user.uuid === selected);

  const submit = () => {
    if (!person) return;
    addMember.mutate(
      {
        params: { path: { team_uuid: team.uuid } },
        body: { user_uuid: person.uuid, team_role_name: role },
      },
      {
        onSuccess: () => {
          toast.success(`已將 ${person.name} 加入「${team.name}」`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      title={`加入成員到「${team.name}」`}
      confirmLabel="加入"
      confirmDisabled={!person}
      submitting={addMember.isPending}
      onClose={onClose}
      onConfirm={() => void form.handleSubmit()}
    >
      <Typography sx={captionSx}>
        選一個已註冊的帳號加入本隊。一個人可以同時在多個團隊，加入不影響他在其他團隊的身份。
      </Typography>
      <AccountPicker
        users={candidates}
        teamTypes={teamTypes}
        selected={selected}
        onSelect={(uuid) => form.setFieldValue('user_uuid', uuid)}
      />
      <Stack sx={{ gap: '6px', mb: 1 }}>
        <Typography
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          他在這一隊的角色
        </Typography>
        <Stack
          direction="row"
          role="radiogroup"
          aria-label="團隊角色"
          sx={{ gap: 1 }}
        >
          {(['member', 'admin'] as const).map((value) => (
            <TypeChip
              key={value}
              icon={role === value ? <Check size={16} /> : undefined}
              label={ROLE_DISPLAY_NAMES.get(value) ?? value}
              active={role === value}
              disabled={addMember.isPending}
              onSelect={() => form.setFieldValue('team_role_name', value)}
            />
          ))}
        </Stack>
        <Typography sx={captionSx}>
          管理員可以邀請成員、審核加入申請、編輯團隊資料。
        </Typography>
      </Stack>
    </Dialog>
  );
}

const PLATFORM_ROLES = ['data_auditor', 'super_admin'] as const;

type AssignedRoleDraft = {
  user_uuid: AssignUserRoleInput['params']['path']['user_uuid'] | null;
  role_name: AssignUserRoleInput['body']['role_name'];
};
const EMPTY_ROLE_ASSIGNMENT: AssignedRoleDraft = {
  user_uuid: null,
  role_name: 'data_auditor',
};

/** 指派平台級角色 (super admin only). Replaces whatever platform role the account held. */
export function AssignRoleDialog({
  users,
  teamTypes,
  onClose,
}: {
  users: readonly AdminUser[];
  teamTypes: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  const assignRole = useAssignUserRole();
  const form = useForm({
    defaultValues: EMPTY_ROLE_ASSIGNMENT,
    onSubmit: (): void => submit(),
  });
  const { user_uuid: selected, role_name: role } = useStore(
    form.store,
    (state) => state.values,
  );
  const person = users.find((user) => user.uuid === selected);
  const already = person?.platform_role === role;

  const submit = () => {
    if (!person || already) return;
    assignRole.mutate(
      {
        params: { path: { user_uuid: person.uuid } },
        body: { role_name: role },
      },
      {
        onSuccess: () => {
          toast.success(
            `已指派 ${person.name} 為${ROLE_DISPLAY_NAMES.get(role) ?? role}`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      title="指派平台級角色"
      confirmLabel="確認指派"
      confirmDisabled={!person || already}
      submitting={assignRole.isPending}
      onClose={onClose}
      onConfirm={() => void form.handleSubmit()}
    >
      <AccountPicker
        users={users}
        teamTypes={teamTypes}
        selected={selected}
        onSelect={(uuid) => form.setFieldValue('user_uuid', uuid)}
      />
      <Stack
        direction="row"
        role="radiogroup"
        aria-label="平台角色"
        sx={{ gap: 1 }}
      >
        {PLATFORM_ROLES.map((value) => (
          <Box
            key={value}
            component="button"
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => form.setFieldValue('role_name', value)}
            sx={{
              flex: 1,
              p: '12px 14px',
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: `${radius.md}px`,
              border:
                role === value
                  ? `1.5px solid ${color.border.accent}`
                  : `1px solid ${color.border.default}`,
              bgcolor:
                role === value
                  ? color.bg.primary.subtle
                  : color.bg.neutral.default,
            }}
          >
            <Typography
              sx={{
                ...typography.label[400],
                color:
                  role === value
                    ? color.brand.primary.subtle
                    : color.fg.neutral.default,
              }}
            >
              {ROLE_DISPLAY_NAMES.get(value) ?? value}
            </Typography>
            <Typography sx={{ ...captionSx, mt: '2px' }}>
              {ROLE_DESCRIPTIONS.get(value)}
            </Typography>
          </Box>
        ))}
      </Stack>
      {already ? (
        <Callout tone="info">
          {person?.name} 已經是{ROLE_DISPLAY_NAMES.get(role) ?? role}。
        </Callout>
      ) : role === 'super_admin' ? (
        <Callout tone="warning">
          <b>指派另一位超級管理員</b>
          <br />
          新的超級管理員將擁有與您相同的最高權限，可互相撤銷（平台至少保留 1
          位）。
        </Callout>
      ) : null}
    </Dialog>
  );
}
