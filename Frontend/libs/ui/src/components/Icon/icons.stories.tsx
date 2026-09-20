import { Box, Stack, Typography } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Icons } from './index';

const meta = {
  title: 'Foundation/Icons',
  component: Icons.plus,
  args: { fontSize: 'medium', color: 'inherit' },
  argTypes: {
    fontSize: { control: 'select', options: ['small', 'medium', 'large'] },
    color: {
      control: 'select',
      options: [
        'inherit',
        'primary',
        'secondary',
        'error',
        'warning',
        'success',
      ],
    },
  },
} satisfies Meta<typeof Icons.plus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 3,
        width: 'min(800px, 90vw)',
      }}
    >
      {Object.entries(Icons).map(([name, Icon]) => (
        <Stack key={name} spacing={1} sx={{ alignItems: 'center' }}>
          <Icon {...args} />
          <Typography variant="caption">{name}</Typography>
        </Stack>
      ))}
    </Box>
  ),
};
