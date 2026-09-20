import { CssBaseline, ThemeProvider } from '@mui/material';
import type { Preview } from '@storybook/react-vite';

import { theme } from '../src';

const preview = {
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <ThemeProvider theme={theme} defaultMode="light" storageManager={null}>
        <CssBaseline />
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Preview;

export default preview;
