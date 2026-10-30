'use client';

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { AREA_LABEL_NAME_MAX } from '@rescue-frontend/modules';

import type { AdminAreaListItem } from './admin-area-list-panel';
import {
  countNameCharacters,
  type AreaTeamOption,
} from './admin-area-draw-panels';
import { designTokens } from '@rescue-frontend/ui';

const { color, typography } = designTokens;

/** What an area form changes: only what changed is sent. `informationSource` is a 危險區's alone. */
export interface AreaChanges {
  name?: string;
  note?: string | null;
  informationSource?: string | null;
}

/** What an admin may do to an area, and how. Absent for someone who may only look. */
export interface AreaActions {
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  /** The active teams, for adding one to a 責任區. */
  teamOptions: readonly AreaTeamOption[];
  /** Sent at once, not on save: the switch is a setting, and takes effect as it is pressed. */
  onTogglePublic: (isPublic: boolean) => void;
  /** Whether the shape has a boundary that can be changed here: one polygon, with no hole. */
  canEditBounds: boolean;
  onEditBounds: () => void;
  onSave: (changes: AreaChanges) => void;
  onPromote: () => void;
  onDelete: () => void;
  onAddTeam: (teamUuid: string) => void;
  onRemoveTeam: (teamUuid: string) => void;
}

export function AreaConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ ...typography.label[500] }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ ...typography.body[300], lineHeight: 1.7 }}>
          {body}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          取消
        </Button>
        <Button variant="contained" color="error" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
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
  const [adding, setAdding] = useState('');
  const assigned = item.teams.map((name, index) => ({
    name,
    uuid: item.teamUuids[index],
  }));
  const addable = (actions?.teamOptions ?? []).filter(
    (team) => !item.teamUuids.includes(team.uuid),
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
          key={team.uuid ?? team.name}
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center' }}
        >
          <Typography sx={{ flex: 1, ...typography.label[400] }}>
            {team.name}
          </Typography>
          {canChange && team.uuid ? (
            <Button
              size="small"
              color="error"
              disabled={assigned.length <= 1}
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
      {canChange && addable.length > 0 ? (
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label="加入團隊"
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            sx={{ flex: 1 }}
          >
            {addable.map((team) => (
              <MenuItem key={team.uuid} value={team.uuid}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            disabled={adding === ''}
            onClick={() => {
              actions?.onAddTeam(adding);
              setAdding('');
            }}
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
  onSave,
  onCancel,
}: {
  item: AdminAreaListItem;
  /** A 危險區's source as it stands; the list does not carry it, so the caller reads it. */
  informationSource?: string | null;
  onSave: (changes: AreaChanges) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const length = countNameCharacters(name);
  const over = length > AREA_LABEL_NAME_MAX;
  const nameChanged = name.trim() !== (item.name ?? '');
  const noteChanged = note.trim() !== (item.note ?? '');
  const [source, setSource] = useState(informationSource ?? '');
  const hasSource = item.kind === 'hazardous_zone';
  const sourceChanged =
    hasSource && source.trim() !== (informationSource ?? '');
  const canSave =
    length > 0 && !over && (nameChanged || noteChanged || sourceChanged);

  return (
    <Stack spacing={1.5}>
      <TextField
        label="名稱"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={over}
        helperText={
          over
            ? `超過 ${length - AREA_LABEL_NAME_MAX} 個字。名稱會顯示在前台地圖上，太長會蓋住旁邊`
            : `${length}／${AREA_LABEL_NAME_MAX}`
        }
      />
      <TextField
        label="備註（選填）"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        multiline
        minRows={3}
      />
      {hasSource ? (
        <TextField
          label="資料來源（選填）"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="例如：機關名稱或網址"
        />
      ) : null}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={!canSave}
          onClick={() =>
            onSave({
              ...(nameChanged ? { name: name.trim() } : {}),
              ...(noteChanged ? { note: note.trim() || null } : {}),
              ...(sourceChanged
                ? { informationSource: source.trim() || null }
                : {}),
            })
          }
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
  const [confirm, setConfirm] = useState<'delete' | 'promote' | null>(null);
  const name = item.name ?? '這個區域';

  if (!actions.canEdit && !actions.canDelete) {
    return null;
  }

  return (
    <>
      {/* Up to four buttons in 360px: they wrap, rather than push the last off the panel. */}
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
          <Button color="error" onClick={() => setConfirm('delete')}>
            刪除區域
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {actions.canEdit && item.kind === 'mark_zone' ? (
          <Button variant="outlined" onClick={() => setConfirm('promote')}>
            升為危險區
          </Button>
        ) : null}
        {actions.canEdit ? (
          <Button variant="outlined" disabled={editing} onClick={onEdit}>
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
                variant="outlined"
                disabled={editing || !actions.canEditBounds}
                onClick={actions.onEditBounds}
              >
                調整範圍
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
      <AreaConfirmDialog
        open={confirm === 'delete'}
        title={`刪除「${name}」？`}
        body="區域會從地圖上移除，前台也看不到。刪除後沒有辦法還原，只有按下後的 5 秒內可以復原。"
        confirmLabel="刪除"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          actions.onDelete();
        }}
      />
      <AreaConfirmDialog
        open={confirm === 'promote'}
        title={`把「${name}」升為危險區？`}
        body="升級後這一區會變成危險區，一律公開到前台，沒有辦法改回標示區。"
        confirmLabel="升為危險區"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          actions.onPromote();
        }}
      />
    </>
  );
}
