import { Box } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { MarkdownEditor } from './index';

const meta = {
  title: 'Components/MarkdownEditor',
  component: MarkdownEditor,
  decorators: [
    (Story) => (
      <Box sx={{ width: 'min(720px, 90vw)' }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    label: '行前資訊內容',
    defaultValue:
      '## 集合地點\n\n光復車站前廣場，08:00 報到。\n\n- [ ] 雨鞋\n- [ ] 手套',
    onChange: () => undefined,
  },
} satisfies Meta<typeof MarkdownEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };

export const Checklist: Story = {
  args: {
    defaultValue: `## Checklist

- [ ] Bring waterproof boots, spare socks, gloves, a raincoat, and a change of clothes in a waterproof bag for the trip home.

  Keep spare clothes dry until you leave.

  - [ ] Pack spare socks
  - [ ] Pack a waterproof bag
- [ ] Read the **meeting instructions** and [travel information](https://example.com).
- [ ] Bring drinking water

  At least two litres per person.`,
  },
};
