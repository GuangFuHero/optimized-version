'use client';

import { ThemeProvider } from '@mui/material/styles';
import { theme } from '@rescue-frontend/ui';

export default function ({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="light"
      storageManager={null}
      modeStorageKey="mui-mode-disabled"
      colorSchemeStorageKey="mui-color-scheme-disabled"
    >
      {children}
    </ThemeProvider>
  );
}
