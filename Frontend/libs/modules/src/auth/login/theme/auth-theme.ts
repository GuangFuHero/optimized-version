import type { CssVarsTheme } from '@mui/material/styles';

import { getRescueColorScheme } from '@rescue-frontend/ui';

export function getAuthColorScheme(theme: Pick<CssVarsTheme, 'rescue'>) {
  return getRescueColorScheme(theme).auth;
}
