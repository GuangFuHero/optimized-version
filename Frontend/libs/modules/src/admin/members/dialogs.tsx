'use client';

import { Lock } from 'lucide-react';

import { Box, Radio, Stack, Typography } from '@mui/material';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import {
  useAddTeamMember,
  useAssignUserRole,
  useCreateTeam,
  useUpdateTeam,
} from '@rescue-frontend/data-access/admin';
import {
  Avatar,
  Button,
  Callout,
  designTokens,
  Dialog,
  TextInput,
} from '@rescue-frontend/ui';

import { ROLE_DESCRIPTIONS, ROLE_DISPLAY_NAMES } from '../../constants/roles';
import { platformLabel } from './badges';
import { captionSx, SearchField } from './parts';
import {
  isValidTaxId,
  matchesName,
  platformOf,
  type AdminUser,
  type Team,
  type TeamRole,
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
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !reason.trim();

  return (
    <Dialog
      open
      title={title}
      confirmLabel={confirmLabel}
      confirmTone={danger ? 'danger' : 'primary'}
      submitting={submitting}
      onClose={onClose}
      onConfirm={() => {
        setTouched(true);
        if (!missing) onConfirm(reason.trim());
      }}
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
        value={reason}
        placeholder="請說明原因…"
        onChange={(event) => setReason(event.target.value)}
        error={touched && missing ? '此操作必須附上理由。' : undefined}
      />
    </Dialog>
  );
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
  const [name, setName] = useState('');
  const [type, setType] = useState<'ngo' | 'gov'>('ngo');
  const [taxId, setTaxId] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const nameError = !trimmed
    ? '請輸入團隊名稱'
    : teams.some((team) => team.name === trimmed)
      ? '已有同名的團隊'
      : undefined;
  const taxIdError =
    taxId.trim() && !isValidTaxId(taxId.trim())
      ? '統一編號須為 8 位數字且通過檢查碼'
      : undefined;

  return (
    <Dialog
      open
      title="新增團隊"
      confirmLabel="建立團隊"
      submitting={createTeam.isPending}
      onClose={onClose}
      onConfirm={() => {
        setTouched(true);
        if (nameError || taxIdError) return;
        createTeam.mutate(
          { body: { name: trimmed, type, tax_id: taxId.trim() || null } },
          {
            onSuccess: (team) => {
              toast.success(`已建立「${team.name}」`);
              onCreated(team);
            },
          },
        );
      }}
    >
      <TextInput
        label="團隊名稱"
        required
        autoFocus
        value={name}
        placeholder="例：壯闊台灣"
        onChange={(event) => setName(event.target.value)}
        error={touched ? nameError : undefined}
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
            <Button
              key={value}
              role="radio"
              aria-checked={type === value}
              variant={type === value ? 'secondary' : 'outline'}
              onClick={() => setType(value)}
              sx={{ flex: 1 }}
            >
              {platformLabel(value)}
            </Button>
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
        onChange={(event) => setTaxId(event.target.value)}
        error={touched ? taxIdError : undefined}
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
  const [name, setName] = useState(team.name);
  const [taxId, setTaxId] = useState(team.tax_id ?? '');
  const [contactName, setContactName] = useState(team.contact_name ?? '');
  const [contactPhone, setContactPhone] = useState(team.contact_phone ?? '');
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const nameError = !trimmed
    ? '請輸入團隊名稱'
    : teams.some(
          (other) =>
            other.uuid !== team.uuid &&
            other.name.trim().toLowerCase() === trimmed.toLowerCase(),
        )
      ? '已有同名的團隊'
      : undefined;
  const taxIdError =
    taxId.trim() && !isValidTaxId(taxId.trim())
      ? '統一編號須為 8 位數字且通過檢查碼'
      : undefined;

  return (
    <Dialog
      open
      title="編輯團隊資料"
      confirmLabel="儲存"
      submitting={updateTeam.isPending}
      onClose={onClose}
      onConfirm={() => {
        setTouched(true);
        if (nameError || taxIdError) return;
        updateTeam.mutate(
          {
            params: { path: { team_uuid: team.uuid } },
            body: {
              name: trimmed,
              tax_id: taxId.trim() || null,
              contact_name: contactName.trim() || null,
              contact_phone: contactPhone.trim() || null,
            },
          },
          {
            onSuccess: (updated) => {
              toast.success(`已更新「${updated.name}」的資料`);
              onClose();
            },
          },
        );
      }}
    >
      <TextInput
        label="團隊名稱"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={touched ? nameError : undefined}
      />
      <TextInput
        label="對應組織統編"
        hint="選填"
        value={taxId}
        placeholder="8 位數統一編號"
        inputProps={{ inputMode: 'numeric', maxLength: 8 }}
        onChange={(event) => setTaxId(event.target.value)}
        error={touched ? taxIdError : undefined}
      />
      <TextInput
        label="聯絡窗口姓名"
        hint="選填"
        value={contactName}
        inputProps={{ maxLength: 100 }}
        placeholder="姓名"
        onChange={(event) => setContactName(event.target.value)}
      />
      <TextInput
        label="聯絡窗口電話"
        hint="選填 · 只有本隊成員與超級管理員看得到"
        value={contactPhone}
        placeholder="0912 345 678"
        inputProps={{ inputMode: 'tel', maxLength: 20 }}
        onChange={(event) => setContactPhone(event.target.value)}
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
  const matches = useMemo(
    () => users.filter((user) => matchesName(user.name, query)).slice(0, 50),
    [users, query],
  );

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
  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole>('member');
  const person = candidates.find((user) => user.uuid === selected);

  return (
    <Dialog
      open
      title={`加入成員到「${team.name}」`}
      confirmLabel="加入"
      confirmDisabled={!person}
      submitting={addMember.isPending}
      onClose={onClose}
      onConfirm={() => {
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
      }}
    >
      <Typography sx={captionSx}>
        選一個已註冊的帳號加入本隊。一個人可以同時在多個團隊，加入不影響他在其他團隊的身份。
      </Typography>
      <AccountPicker
        users={candidates}
        teamTypes={teamTypes}
        selected={selected}
        onSelect={setSelected}
      />
      <Stack
        direction="row"
        role="radiogroup"
        aria-label="團隊角色"
        sx={{ gap: 1 }}
      >
        {(['member', 'admin'] as const).map((value) => (
          <Button
            key={value}
            role="radio"
            aria-checked={role === value}
            variant={role === value ? 'secondary' : 'outline'}
            onClick={() => setRole(value)}
            sx={{ flex: 1 }}
          >
            {ROLE_DISPLAY_NAMES.get(value) ?? value}
          </Button>
        ))}
      </Stack>
    </Dialog>
  );
}

const PLATFORM_ROLES = ['data_auditor', 'super_admin'] as const;

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
  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] =
    useState<(typeof PLATFORM_ROLES)[number]>('data_auditor');
  const person = users.find((user) => user.uuid === selected);
  const already = person?.platform_role === role;

  return (
    <Dialog
      open
      title="指派平台級角色"
      confirmLabel="確認指派"
      confirmDisabled={!person || already}
      submitting={assignRole.isPending}
      onClose={onClose}
      onConfirm={() => {
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
      }}
    >
      <AccountPicker
        users={users}
        teamTypes={teamTypes}
        selected={selected}
        onSelect={setSelected}
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
            onClick={() => setRole(value)}
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
