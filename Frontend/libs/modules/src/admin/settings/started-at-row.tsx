'use client';

import { Clock } from 'lucide-react';

import { Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { toast } from 'sonner';

import { useUpdateProjectSettings } from '@rescue-frontend/data-access/admin';
import {
  Button,
  Callout,
  designTokens,
  Dialog,
  TextInput,
} from '@rescue-frontend/ui';

import { eventDayNumber } from '../../shell/admin/event-day';
import { NeedsNameHint, SettingsRow } from './settings-layout';
import {
  formatStartedAt,
  fromDateTimeLocal,
  startedAtProblem,
  toDateTimeLocal,
} from './settings';

const { color, typography } = designTokens;

/**
 * Setting the start is easy the first time; changing it takes a dialog and a warning, because every
 * sidebar's 第 N 天 jumps with it (prototype `StartTimeDialog`, Sucre 10-05). `project_settings` is
 * audited, so the warning's 會留下紀錄 holds.
 */
function StartedAtDialog({
  current,
  onClose,
}: {
  current: string | null;
  onClose: () => void;
}) {
  const first = !current;
  const [value, setValue] = useState(() => toDateTimeLocal(current));
  const update = useUpdateProjectSettings();
  const now = new Date();
  const problem = startedAtProblem(value, now);
  const same = value === toDateTimeLocal(current);
  const nextDay = problem
    ? null
    : eventDayNumber(fromDateTimeLocal(value), now);
  const currentDay = eventDayNumber(current, now);

  const save = () => {
    if (problem || same) return;
    const next = fromDateTimeLocal(value);
    update.mutate(
      { body: { started_at: next } },
      {
        onSuccess: () => {
          toast.success(
            current
              ? `起始時間已從 ${formatStartedAt(current)} 修正為 ${formatStartedAt(next)}`
              : `已設定起始時間 ${formatStartedAt(next)}`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      onConfirm={save}
      title={first ? '設定起始時間' : '修正起始時間'}
      confirmLabel={first ? '設定' : '確認修正'}
      confirmDisabled={Boolean(problem) || same}
      submitting={update.isPending}
    >
      <Typography
        sx={{ ...typography.body[400], color: color.fg.neutral.subtle }}
      >
        填<strong>災害發生</strong>的時間，不是平台上線的時間。
      </Typography>
      <TextInput
        label="起始時間（台灣時間）"
        required
        type="datetime-local"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={value && problem ? problem : undefined}
        inputProps={{ max: toDateTimeLocal(now.toISOString()) }}
      />
      {!first && !problem && !same ? (
        <Callout tone="warning">
          <strong>所有人都會看到天數改變</strong>
          <br />
          {currentDay && nextDay
            ? `側邊欄會從「第 ${currentDay} 天」變成「第 ${nextDay} 天」。`
            : null}
          這次修改會留下紀錄（誰、什麼時候、從哪個時間改成哪個時間）。
        </Callout>
      ) : null}
      {first && nextDay ? (
        <Typography
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          設定後，側邊欄會顯示「第 {nextDay} 天」。
        </Typography>
      ) : null}
    </Dialog>
  );
}

export function StartedAtRow({
  startedAt,
  canEdit,
  needsName,
}: {
  startedAt: string | null;
  canEdit: boolean;
  /** No settings row yet: the first save must carry the name, so this waits for it. */
  needsName: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const day = eventDayNumber(startedAt, new Date());

  return (
    <SettingsRow
      label="起始時間"
      help="災害發生的時間，不是平台上線的時間。側邊欄的「第 N 天」從這裡算。"
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          minHeight: 36,
        }}
      >
        {startedAt ? (
          <>
            <Typography
              sx={{
                ...typography.data[500],
                color: color.fg.neutral.default,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatStartedAt(startedAt)}
            </Typography>
            {day ? (
              <Typography
                sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
              >
                今天是第 {day} 天
              </Typography>
            ) : null}
            {canEdit ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                修正起始時間
              </Button>
            ) : null}
          </>
        ) : canEdit ? (
          <Button
            variant="outline"
            size="sm"
            startIcon={<Clock size={14} />}
            disabled={needsName}
            onClick={() => setEditing(true)}
          >
            設定起始時間
          </Button>
        ) : (
          <Typography
            sx={{ ...typography.body[400], color: color.fg.neutral.muted }}
          >
            還沒有設定
          </Typography>
        )}
      </Stack>
      {canEdit && needsName ? <NeedsNameHint /> : null}
      {editing ? (
        <StartedAtDialog
          current={startedAt}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </SettingsRow>
  );
}
