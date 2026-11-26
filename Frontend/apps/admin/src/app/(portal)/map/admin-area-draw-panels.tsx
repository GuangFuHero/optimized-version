// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { ArrowLeft, Check, X } from 'lucide-react';

import {
  Box,
  ButtonBase,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useForm, useStore, type DeepValue } from '@tanstack/react-form';

import {
  AREA_KIND_LABELS,
  AREA_KIND_ORDER,
  AREA_TEAM_LOAD_ERROR,
  type AreaFormValues,
  type RescueMapAreaTeam,
  type RescueMapMarkerItem,
  AREA_LABEL_NAME_MAX,
  type RescueMapAreaKind,
} from '@rescue-frontend/modules';
import { Button, designTokens } from '@rescue-frontend/ui';
import { AreaStats, type AreaCounts } from './area-stats';

import { AreaSwatch } from './area-swatch';
import { AreaTeamSelect } from './area-team-select';
import { AreaNameField, countAreaNameCharacters } from './area-name-field';

const { color, radius, typography } = designTokens;

// More than this many tickets in one area asks for a second look before it is saved (MAP-ZD-125).
export const HIGH_VOLUME_TICKETS = 100;

const KIND_CARDS: Record<
  RescueMapAreaKind,
  { description: string; example: string }
> = {
  hazardous_zone: {
    description: '提醒大家不要進入。一律公開到前台',
    example: '例：堤防潰口、土石流警戒',
  },
  team_zone: {
    description: '交給一個單位負責，區內任務單歸他。前台只給登入的人看',
    example: '例：大平村交給慈濟基金會',
  },
  mark_zone: {
    description: '只標出位置，不派單位。可選只給後台看，或公開到前台',
    example: '例：志工休息區、集合點、物資集散點',
  },
};

const NAME_PLACEHOLDERS: Record<RescueMapAreaKind, string> = {
  hazardous_zone: '例：馬太鞍溪堤防潰口',
  team_zone: '例：光復鄉 大平村',
  mark_zone: '例：糖廠志工休息區',
};

function Steps({ at }: { at: 1 | 2 }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.25 }}>
      {['畫範圍', '填資料'].map((label, index) => {
        const step = index + 1;
        const done = step < at;
        const on = step === at;

        return (
          <Stack
            key={label}
            direction="row"
            spacing={0.75}
            sx={{ alignItems: 'center' }}
          >
            {index > 0 ? (
              <Box
                sx={{ width: 18, height: '1px', bgcolor: color.border.default }}
              />
            ) : null}
            <Box
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                ...typography.label[300],
                fontWeight: 700,
                bgcolor:
                  on || done
                    ? color.brand.primary.default
                    : color.bg.neutral.sunken,
                color:
                  on || done
                    ? color.bg.neutral.default
                    : color.fg.neutral.subtle,
              }}
            >
              {done ? (
                <Box component={Check} sx={{ width: 12, height: 12 }} />
              ) : (
                step
              )}
            </Box>
            <Typography
              sx={{
                ...typography.label[300],
                fontWeight: on ? 700 : 400,
                color: on ? color.fg.neutral.default : color.fg.neutral.subtle,
              }}
            >
              {label}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

function Frame({
  at,
  onBack,
  onClose,
  footer,
  children,
}: {
  at: 1 | 2;
  onBack?: () => void;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Box
        sx={{
          px: 2.25,
          py: 1.75,
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {onBack ? (
            <ButtonBase
              onClick={onBack}
              aria-label="回到畫範圍"
              sx={{
                width: 32,
                height: 32,
                ml: -1,
                borderRadius: `${radius.sm}px`,
              }}
            >
              <Box component={ArrowLeft} sx={{ width: 18, height: 18 }} />
            </ButtonBase>
          ) : null}
          <Typography sx={{ flex: 1, ...typography.label[500] }}>
            圈選新區域
          </Typography>
          <ButtonBase
            onClick={onClose}
            aria-label="關閉（Esc）"
            sx={{
              width: 32,
              height: 32,
              mr: -1,
              borderRadius: `${radius.sm}px`,
            }}
          >
            <Box component={X} sx={{ width: 18, height: 18 }} />
          </ButtonBase>
        </Stack>
        <Steps at={at} />
      </Box>
      <Stack
        spacing={2}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.25 }}
      >
        {children}
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 2.25,
          py: 1.5,
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        {footer}
      </Stack>
    </Stack>
  );
}

/** Step 1: click the corners. Counts follow every corner (MAP-ZD-124); a crossing outline cannot go on. */
export function AdminAreaDrawPanel({
  cornerCount,
  contents,
  areaKm2,
  crosses,
  onUndoCorner,
  onCancel,
  onNext,
}: {
  cornerCount: number;
  contents: AreaCounts;
  areaKm2: number;
  crosses: boolean;
  onUndoCorner: () => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const canFinish = cornerCount >= 3 && !crosses;
  const hint =
    cornerCount === 0
      ? '在地圖上點出範圍的轉角，至少三個。'
      : cornerCount < 3
        ? `再點 ${3 - cornerCount} 個轉角。`
        : '範圍已成形，可以繼續加轉角，或按「下一步」。';
  const stats: [string, string][] = [
    ['區內任務單', String(contents.tickets ?? '—')],
    ['區內站點', String(contents.stations ?? '—')],
    ['轉角', String(cornerCount)],
    ['面積 km²', areaKm2.toFixed(2)],
  ];

  return (
    <Frame
      at={1}
      onClose={onCancel}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onUndoCorner}
            disabled={cornerCount === 0}
          >
            退回一點
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" disabled={!canFinish} onClick={onNext}>
            下一步
          </Button>
        </>
      }
    >
      <Typography sx={{ ...typography.body[300], lineHeight: 1.7 }}>
        {hint}
      </Typography>
      <AreaStats values={stats} />
      {crosses ? (
        <Typography
          role="alert"
          sx={{ ...typography.body[300], color: color.fg.danger }}
        >
          邊線交叉或重疊了，這樣的範圍不能儲存。請按「退回一點」，或換個方式圈。
        </Typography>
      ) : null}
      {(contents.tickets ?? 0) > HIGH_VOLUME_TICKETS ? (
        <Typography sx={{ ...typography.body[300], color: color.fg.warning }}>
          這個範圍內有 {contents.tickets} 張任務單，比一般的區域多很多。
          確認範圍沒有圈太大再繼續。
        </Typography>
      ) : null}
      <Typography
        sx={{
          ...typography.label[300],
          lineHeight: 1.8,
          color: color.fg.neutral.subtle,
        }}
      >
        點地圖加轉角 · Backspace 退回一點 · Enter 完成範圍 · Esc 取消
      </Typography>
    </Frame>
  );
}

/** Step 2: what the area is. The kind comes first, since what else is asked depends on it. */
export function AdminAreaFormPanel({
  initial,
  teams,
  teamListError,
  tickets,
  canAssign,
  onBack,
  onCancel,
  onSubmit,
}: {
  initial: AreaFormValues;
  teams: readonly RescueMapAreaTeam[];
  teamListError: boolean;
  tickets: readonly RescueMapMarkerItem[] | null;
  /** Creating a 責任區 assigns its first team in the same request, which needs this. */
  canAssign: boolean;
  /** Goes back to the outline; what was typed comes along, to be there again on return. */
  onBack: (values: AreaFormValues) => void;
  onCancel: () => void;
  onSubmit: (values: AreaFormValues) => void;
}) {
  const form = useForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
      if (canSave) onSubmit(value);
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const set = <K extends keyof AreaFormValues>(
    key: K,
    value: DeepValue<AreaFormValues, K>,
  ) => form.setFieldValue(key, value);
  const { kind } = values;
  const assignments =
    kind === 'team_zone' && values.teamUuid && tickets
      ? countTicketAssignments(tickets, values.teamUuid)
      : null;
  const nameLength = countAreaNameCharacters(values.name);
  const canSave =
    kind !== null &&
    nameLength > 0 &&
    nameLength <= AREA_LABEL_NAME_MAX &&
    (kind !== 'team_zone' ||
      (canAssign && teams.some(({ uuid }) => uuid === values.teamUuid)));

  return (
    <Frame
      at={2}
      onBack={() => onBack(values)}
      onClose={onCancel}
      footer={
        <>
          <Box sx={{ flex: 1 }} />
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => void form.handleSubmit()}
          >
            {kind ? `建立${AREA_KIND_LABELS[kind]}` : '建立區域'}
          </Button>
        </>
      }
    >
      <Typography
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          color: color.fg.neutral.subtle,
        }}
      >
        這一區是做什麼的？
      </Typography>
      <Stack spacing={1} role="radiogroup" aria-label="區域類型">
        {AREA_KIND_ORDER.filter(
          (option) => canAssign || option !== 'team_zone',
        ).map((option) => (
          <ButtonBase
            key={option}
            role="radio"
            aria-checked={kind === option}
            onClick={() => set('kind', option)}
            sx={{
              alignItems: 'flex-start',
              gap: 1.25,
              px: 1.5,
              py: 1.25,
              textAlign: 'left',
              borderRadius: `${radius.md}px`,
              border: `${kind === option ? 2 : 1}px solid ${
                kind === option
                  ? color.brand.primary.default
                  : color.border.default
              }`,
              bgcolor:
                kind === option
                  ? color.bg.primary.subtle
                  : color.bg.neutral.default,
            }}
          >
            <AreaSwatch kind={option} sx={{ mt: '3px' }} />
            <Box>
              <Typography sx={{ ...typography.label[400] }}>
                {AREA_KIND_LABELS[option]}
              </Typography>
              <Typography sx={{ ...typography.body[300], lineHeight: 1.6 }}>
                {KIND_CARDS[option].description}
              </Typography>
              <Typography
                sx={{
                  ...typography.label[300],
                  color: color.fg.neutral.muted,
                }}
              >
                {KIND_CARDS[option].example}
              </Typography>
            </Box>
          </ButtonBase>
        ))}
      </Stack>
      {kind ? (
        <>
          <AreaNameField
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder={NAME_PLACEHOLDERS[kind]}
            autoFocus
            showLocationHint
          />
          {kind === 'team_zone' ? (
            <AreaTeamSelect
              label="責任單位"
              required
              teams={teams}
              value={values.teamUuid}
              onChange={(uuid) => set('teamUuid', uuid)}
              error={teamListError}
              helperText={
                teamListError
                  ? AREA_TEAM_LOAD_ERROR
                  : '區內的任務單會出現在這個單位的清單裡。之後可以再加其他單位。'
              }
            />
          ) : null}
          {assignments ? (
            <Typography
              sx={{ ...typography.body[300], color: color.fg.neutral.subtle }}
            >
              目前載入的區內任務單：未指派 {assignments.unassigned}{' '}
              張、已歸屬其他團隊 {assignments.other} 張、已歸屬所選團隊{' '}
              {assignments.selected} 張。
            </Typography>
          ) : null}
          <TextField
            label="備註（選填）"
            value={values.note}
            onChange={(event) => set('note', event.target.value)}
            multiline
            minRows={3}
            placeholder={
              kind === 'mark_zone' && !values.isPublic
                ? '這一區的狀況、要注意什麼。'
                : kind === 'team_zone'
                  ? '這一區的狀況、要注意什麼。登入的人在前台也看得到。'
                  : '這一區的狀況、要注意什麼。這一區公開到前台，民眾也看得到。'
            }
          />
          {kind === 'hazardous_zone' ? (
            <TextField
              label="資料來源（選填）"
              value={values.informationSource}
              onChange={(event) => set('informationSource', event.target.value)}
              placeholder="例如：機關名稱或網址"
            />
          ) : null}
          {kind === 'mark_zone' ? (
            <Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Switch
                  checked={values.isPublic}
                  onChange={(event) => set('isPublic', event.target.checked)}
                  slotProps={{ input: { 'aria-label': '前台可見' } }}
                />
                <Typography sx={{ ...typography.label[400] }}>
                  前台可見
                </Typography>
              </Stack>
              <Typography
                sx={{
                  ...typography.label[300],
                  color: color.fg.neutral.subtle,
                }}
              >
                {values.isPublic
                  ? '民眾與志工在前台地圖看得到這一區的名稱、範圍與備註。'
                  : '只有後台看得到。'}
              </Typography>
            </Stack>
          ) : null}
        </>
      ) : null}
    </Frame>
  );
}

function countTicketAssignments(
  tickets: readonly RescueMapMarkerItem[],
  teamUuid: string,
) {
  const counts = { unassigned: 0, other: 0, selected: 0 };
  for (const ticket of tickets) {
    const teams = ticket.ticketMeta?.responsibleTeams;
    if (!teams?.length) counts.unassigned++;
    else if (teams.some(({ uuid }) => uuid === teamUuid)) counts.selected++;
    else counts.other++;
  }
  return counts;
}
