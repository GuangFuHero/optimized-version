import { MenuItem, TextField } from '@mui/material';
import type { ComponentProps } from 'react';

import type { RescueMapAreaTeam } from '@rescue-frontend/modules';

export function AreaTeamSelect({
  teams,
  value,
  onChange,
  ...props
}: Pick<
  ComponentProps<typeof TextField>,
  'label' | 'required' | 'size' | 'disabled' | 'error' | 'helperText'
> & {
  teams: readonly RescueMapAreaTeam[];
  value: string;
  onChange: (uuid: string) => void;
}) {
  return (
    <TextField
      {...props}
      fullWidth
      select
      value={teams.some(({ uuid }) => uuid === value) ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    >
      {teams.map(({ uuid, name }) => (
        <MenuItem key={uuid} value={uuid}>
          {name}
        </MenuItem>
      ))}
    </TextField>
  );
}
