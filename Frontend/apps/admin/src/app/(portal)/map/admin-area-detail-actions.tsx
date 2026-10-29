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
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { AREA_LABEL_NAME_MAX } from '@rescue-frontend/modules';

import type { AdminAreaListItem } from './admin-area-list-panel';
import {
  countNameCharacters,
  type AreaTeamOption,
} from './admin-area-draw-panels';

/** What an admin may do to an area, and how. Absent for someone who may only look. */
export interface AreaActions {
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  /** The active teams, for adding one to a 責任區. */
  teamOptions: readonly AreaTeamOption[];
  /** Sent at once, not on save: the switch is a setting, and takes effect as it is pressed. */
  onTogglePublic: (isPublic: boolean) => void;
  onSave: (changes: { name?: string; note?: string | null }) => void;
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
      <DialogTitle sx={{ fontSize: 16, fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14, lineHeight: 1.7 }}>{body}</Typography>
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
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#564337' }}>
        負責單位
      </Typography>
      {assigned.map((team) => (
        <Stack
          key={team.uuid ?? team.name}
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center' }}
        >
          <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
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
        <Typography sx={{ fontSize: 12, color: '#564337' }}>
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

/** Name and note, the two a person may change here: only what changed is sent. */
export function AreaEditForm({
  item,
  onSave,
  onCancel,
}: {
  item: AdminAreaListItem;
  onSave: (changes: { name?: string; note?: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const length = countNameCharacters(name);
  const over = length > AREA_LABEL_NAME_MAX;
  const nameChanged = name.trim() !== (item.name ?? '');
  const noteChanged = note.trim() !== (item.note ?? '');
  const canSave = length > 0 && !over && (nameChanged || noteChanged);

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
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 2.25,
          py: 1.5,
          borderTop: '1px solid #DCC1B1',
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
        body="升級後這一區會變成危險區，一律公開到前台，沒有辦法改回標示區。只有按下後的 5 秒內可以復原。"
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
