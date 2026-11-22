'use client';

import { useForm, useStore } from '@tanstack/react-form';
import type { UpdateAreaInput } from '@rescue-frontend/data-access/admin';

import { Box, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';

import {
  AREA_LABEL_NAME_MAX,
  AREA_TEAM_LOAD_ERROR,
  type RescueMapAreaTeam,
} from '@rescue-frontend/modules';

import type { AdminAreaListItem } from './admin-map-area-projection';
import { AreaNameField, countAreaNameCharacters } from './area-name-field';
import { AreaTeamSelect } from './area-team-select';
import { Button, Dialog, designTokens } from '@rescue-frontend/ui';

const { color, typography } = designTokens;

/** What an area form changes: only what changed is sent. `informationSource` is a 危險區's alone. */
export type AreaChanges = Pick<
  UpdateAreaInput,
  'name' | 'note' | 'informationSource'
>;

/** What an admin may do to an area, and how. Absent for someone who may only look. */
export interface AreaActions {
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  isPending: boolean;
  /** The active teams, for adding one to a 責任區. */
  teamOptions: readonly RescueMapAreaTeam[];
  teamListError: boolean;
  /** Sent at once, not on save: the switch is a setting, and takes effect as it is pressed. */
  onTogglePublic: (isPublic: boolean) => void;
  /** Whether the shape has a boundary that can be changed here: one polygon, with no hole. */
  canEditBounds: boolean;
  onEditBounds: () => void;
  onSave: (changes: AreaChanges) => Promise<boolean>;
  onDelete: () => void;
  onAddTeam: (teamUuid: string) => void;
  onRemoveTeam: (teamUuid: string) => void;
}

/**
 * The teams a 責任區 is assigned to. There must be one left: the last cannot be removed, and the way
 * to be rid of the area is to delete it.
 */
export function AreaTeamsSection({
  item,
  actions,
}: {
  item: AdminAreaListItem;
  actions: AreaActions | undefined;
}) {
  const form = useForm({
    defaultValues: { adding: '' },
    onSubmit: ({ value, formApi }): void => {
      actions?.onAddTeam(value.adding);
      formApi.reset();
    },
  });
  const adding = useStore(form.store, (state) => state.values.adding);
  const assigned = item.teams;
  const addable = (actions?.teamOptions ?? []).filter(
    (team) => !assigned.some(({ uuid }) => uuid === team.uuid),
  );
  const canChange = actions?.canAssign === true;

  return (
    <Stack spacing={1}>
      <Typography
        sx={{
          ...typography.label[300],
          fontWeight: 700,
          color: color.fg.neutral.subtle,
        }}
      >
        負責單位
      </Typography>
      {assigned.map((team) => (
        <Stack
          key={team.uuid}
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center' }}
        >
          <Typography sx={{ flex: 1, ...typography.label[400] }}>
            {team.name}
          </Typography>
          {canChange ? (
            <Button
              size="sm"
              variant="outline"
              tone="danger"
              disabled={actions?.isPending || assigned.length <= 1}
              onClick={() => actions?.onRemoveTeam(team.uuid)}
            >
              移除
            </Button>
          ) : null}
        </Stack>
      ))}
      {canChange && assigned.length <= 1 ? (
        <Typography
          sx={{ ...typography.label[300], color: color.fg.neutral.subtle }}
        >
          責任區至少要有一個團隊，最後一個不能移除。要移除請刪除這個區域。
        </Typography>
      ) : null}
      {canChange && actions?.teamListError ? (
        <Typography sx={{ ...typography.body[300], color: color.fg.danger }}>
          {AREA_TEAM_LOAD_ERROR}
        </Typography>
      ) : null}
      {canChange && addable.length > 0 ? (
        <Stack direction="row" spacing={1}>
          <AreaTeamSelect
            size="small"
            label="加入團隊"
            teams={addable}
            disabled={actions?.isPending}
            value={adding}
            onChange={(uuid) => form.setFieldValue('adding', uuid)}
          />
          <Button
            variant="outline"
            disabled={
              actions?.isPending || !addable.some(({ uuid }) => uuid === adding)
            }
            onClick={() => void form.handleSubmit()}
          >
            加入
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Name, note and, for a 危險區, its source: what a person may change here. Only what changed is sent. */
export function AreaEditForm({
  item,
  informationSource,
  saveDisabled,
  onSave,
  onCancel,
}: {
  item: AdminAreaListItem;
  /** A 危險區's source as it stands; the list does not carry it, so the caller reads it. */
  informationSource?: string | null;
  saveDisabled: boolean;
  onSave: (changes: AreaChanges) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [openedValues] = useState(() => ({
    name: item.name ?? '',
    note: item.note ?? '',
    source: informationSource ?? '',
  }));
  const hasSource = item.kind === 'hazardous_zone';
  const getChanges = (values: typeof openedValues): AreaChanges => {
    const changes: AreaChanges = {};
    if (values.name.trim() !== openedValues.name.trim())
      changes.name = values.name.trim();
    if (values.note.trim() !== openedValues.note.trim())
      changes.note = values.note.trim() || null;
    if (hasSource && values.source.trim() !== openedValues.source.trim()) {
      changes.informationSource = values.source.trim() || null;
    }
    return changes;
  };
  const form = useForm({
    defaultValues: openedValues,
    onSubmit: async ({ value }) => {
      await onSave(getChanges(value));
    },
  });
  const { values, isSubmitting } = useStore(form.store);
  const { name, note, source } = values;
  const length = countAreaNameCharacters(name);
  const canSave =
    length > 0 &&
    length <= AREA_LABEL_NAME_MAX &&
    Object.keys(getChanges(values)).length > 0;

  return (
    <Stack spacing={1.5}>
      <AreaNameField
        value={name}
        disabled={isSubmitting}
        onChange={(event) => form.setFieldValue('name', event.target.value)}
      />
      <TextField
        label="備註（選填）"
        disabled={isSubmitting}
        value={note}
        onChange={(event) => form.setFieldValue('note', event.target.value)}
        multiline
        minRows={3}
      />
      {hasSource ? (
        <TextField
          label="資料來源（選填）"
          disabled={isSubmitting}
          value={source}
          onChange={(event) => form.setFieldValue('source', event.target.value)}
          placeholder="例如：機關名稱或網址"
        />
      ) : null}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button variant="outline" disabled={isSubmitting} onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          disabled={saveDisabled || !canSave}
          loading={isSubmitting}
          onClick={() => void form.handleSubmit()}
        >
          儲存
        </Button>
      </Stack>
    </Stack>
  );
}

/** Delete on the left, in the danger colour; the rest to its right (prototype `Frame` footer). */
export function AreaDetailFooter({
  item,
  actions,
  editing,
  onEdit,
}: {
  item: AdminAreaListItem;
  actions: AreaActions;
  editing: boolean;
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const name = item.name ?? '這個區域';

  if (!actions.canEdit && !actions.canDelete) {
    return null;
  }

  return (
    <>
      {/* Up to three buttons in 360px: they wrap, rather than push the last off the panel. */}
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          px: 2.25,
          py: 1.5,
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        {actions.canDelete ? (
          <Button
            variant="outline"
            tone="danger"
            disabled={editing || actions.isPending}
            onClick={() => setConfirming(true)}
          >
            {item.kind === 'hazardous_zone' ? '解除危險區' : '刪除區域'}
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {actions.canEdit ? (
          <Button
            variant="outline"
            disabled={editing || actions.isPending}
            onClick={onEdit}
          >
            編輯
          </Button>
        ) : null}
        {actions.canEdit ? (
          <Tooltip
            title={
              actions.canEditBounds
                ? ''
                : '這一區的形狀有好幾塊或中間挖空，這裡還不能調整範圍'
            }
          >
            <span>
              <Button
                variant="outline"
                disabled={
                  editing || actions.isPending || !actions.canEditBounds
                }
                onClick={actions.onEditBounds}
              >
                調整範圍
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
      {/* A 危險區 does not expire: someone lifts it, to say the danger is past, which 刪除 would
          read as a drawing mistake (design review, 2026-11-02). */}
      <Dialog
        open={confirming}
        title={
          item.kind === 'hazardous_zone'
            ? `解除「${name}」？`
            : `刪除「${name}」？`
        }
        confirmTone="danger"
        confirmLabel={item.kind === 'hazardous_zone' ? '解除' : '刪除'}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          actions.onDelete();
        }}
      >
        <Typography sx={{ ...typography.body[300], lineHeight: 1.7 }}>
          {item.kind === 'hazardous_zone'
            ? '危險區會從地圖上移除，前台也看不到。只有按下後的 5 秒內可以復原。'
            : '區域會從地圖上移除，前台也看不到。刪除後沒有辦法還原，只有按下後的 5 秒內可以復原。'}
        </Typography>
      </Dialog>
    </>
  );
}
