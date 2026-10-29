'use client';

import { Alert, Button, Stack, TextField } from '@mui/material';
import { useState } from 'react';

import type { RoleRequestRole } from '@rescue-frontend/data-access';

import { NEW_TEAM, teamNoun, teamPickerOptions, type TeamOption } from './team';

interface TeamPickerProps {
  role: RoleRequestRole;
  /** Null while the list is read. */
  teams: readonly TeamOption[] | null;
  failed: boolean;
  onReload: () => void;
  team: string | null;
  onPick: (team: string | null) => void;
  newTeamName: string;
  onNewTeamName: (name: string) => void;
  teamError: string | null;
  newTeamNameError: string | null;
}

/**
 * 你屬於哪個單位／團隊？ (prototype `TeamPicker`, `Design/前台/js/site/site-actions.jsx:160-233`): the
 * teams of the identity's type and, last, 「＋ 清單裡沒有，建立新的…」. A native select, as the designer
 * chose on 2026-10-11: a phone shows its own wheel, a keyboard jumps by typing. Give it a `key` per
 * identity, so a search typed for one list does not narrow the other.
 */
export function TeamPicker({
  role,
  teams,
  failed,
  onReload,
  team,
  onPick,
  newTeamName,
  onNewTeamName,
  teamError,
  newTeamNameError,
}: TeamPickerProps) {
  const [query, setQuery] = useState('');
  const noun = teamNoun(role);
  const { searchable, options, noMatch } = teamPickerOptions(
    teams ?? [],
    query,
    team,
  );
  // A team no longer listed shows as nothing picked, which its error then asks for again.
  const value =
    team === NEW_TEAM || options.some((option) => option.uuid === team)
      ? (team ?? '')
      : '';

  if (failed) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onReload}>
            再試一次
          </Button>
        }
      >
        讀不到{noun}清單，請再試一次。
      </Alert>
    );
  }

  const pick = (next: string) => {
    onPick(next || null);

    // What was searched for and not found is likely the name of the team to found.
    if (next === NEW_TEAM && !newTeamName && query.trim()) {
      onNewTeamName(query.trim());
    }
  };

  return (
    <Stack spacing={1.5}>
      {searchable ? (
        <TextField
          size="small"
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="先打幾個字縮短清單"
          slotProps={{ htmlInput: { 'aria-label': `搜尋${noun}` } }}
        />
      ) : null}

      <TextField
        select
        label={`你屬於哪個${noun}？`}
        required
        fullWidth
        value={value}
        onChange={(event) => pick(event.target.value)}
        disabled={!teams}
        error={Boolean(teamError)}
        helperText={teamError ?? undefined}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        // 16px at least: iOS zooms the page into a smaller field (prototype note).
        sx={{ '& select': { fontSize: 16 } }}
      >
        <option value="" disabled>
          {teams ? `請選擇${noun}` : '讀取中…'}
        </option>
        {options.map((option) => (
          <option key={option.uuid} value={option.uuid}>
            {option.name}
          </option>
        ))}
        {noMatch ? (
          <option value="" disabled>
            找不到「{query.trim()}」
          </option>
        ) : null}
        <option value={NEW_TEAM}>＋ 清單裡沒有，建立新的{noun}</option>
      </TextField>

      {team === NEW_TEAM ? (
        <TextField
          label={`新${noun}名稱`}
          required
          fullWidth
          value={newTeamName}
          onChange={(event) => onNewTeamName(event.target.value)}
          placeholder={
            role === 'government'
              ? '例：花蓮縣光復鄉公所'
              : '例：光復在地互助協會'
          }
          error={Boolean(newTeamNameError)}
          helperText={
            newTeamNameError ??
            `由超級管理員審核；通過後這個${noun}會建立，你是它的管理員。`
          }
        />
      ) : null}
    </Stack>
  );
}
