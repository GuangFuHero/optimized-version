import { Box } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Timeline } from './index';

const meta = {
  title: 'Components/Timeline',
  component: Timeline,
  decorators: [
    (Story) => (
      <Box sx={{ width: 520 }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    items: [
      {
        event_type: 'UPDATED',
        at: '2026-09-28T06:02:00Z',
        entity: 'ticket',
        actor: {
          uuid: 'user-1',
          name: '林承翰',
          kind: 'user',
          is_removed: false,
        },
        changes: [{ field: 'status', before: 'pending', after: 'in_progress' }],
      },
      {
        event_type: 'ASSIGNED',
        at: '2026-09-28T05:40:00Z',
        entity: 'task_assignment',
        actor: {
          uuid: 'user-2',
          name: '陳怡君',
          kind: 'user',
          is_removed: true,
        },
        changes: [{ field: 'actor_uuid', before: null, after: '林承翰' }],
      },
      {
        event_type: 'CREATED',
        at: '2026-09-28T05:12:00Z',
        entity: 'ticket',
        actor: { uuid: null, name: null, kind: 'system', is_removed: false },
        changes: [],
      },
    ],
  },
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dots: Story = {};
export const Icons: Story = { args: { showIcons: true } };
export const Withheld: Story = {
  args: {
    items: [
      {
        ...meta.args.items[0],
        changes: [
          { field: 'geometry', before: null, after: null, changed: true },
          { field: 'contact_phone', before: '09****1234', after: '09****5678' },
        ],
      },
    ],
  },
};
export const JsonValues: Story = {
  args: {
    items: [
      {
        ...meta.args.items[0],
        changes: [
          { field: 'quantity', before: 0, after: 12 },
          { field: 'is_temporary', before: false, after: true },
          {
            field: 'disaster_types',
            before: ['flood'],
            after: ['flood', 'landslide'],
          },
          {
            field: 'details',
            before: null,
            after: { quantity: 12, note: '飲用水' },
          },
        ],
      },
    ],
  },
};
export const Empty: Story = { args: { items: [] } };
