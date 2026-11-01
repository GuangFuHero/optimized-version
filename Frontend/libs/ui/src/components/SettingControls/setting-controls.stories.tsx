import { useState } from 'react';

import { Box, Switch } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { NativeSelect, RadioCards, SettingRow } from './index';

const meta = {
  title: 'Components/SettingControls',
  component: SettingRow,
  args: {
    title: '公開到前台',
    description: '打開後，前台訪客也看得到。',
    children: null,
  },
} satisfies Meta<typeof SettingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

function SettingsExample() {
  const [scope, setScope] = useState<'all' | 'team'>('all');

  return (
    <Box sx={{ maxWidth: 560 }}>
      <SettingRow title="公開到前台" description="打開後，前台訪客也看得到。">
        <Switch defaultChecked />
      </SettingRow>
      <SettingRow
        title="誰看得到"
        description="只給自己的團隊，或所有人。"
        stack
      >
        <RadioCards
          name="scope"
          aria-label="誰看得到"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', title: '所有人', description: '前台與管理平台' },
            { value: 'team', title: '只有團隊', description: '只在管理平台' },
          ]}
        />
      </SettingRow>
      <SettingRow title="災害類型">
        <NativeSelect
          aria-label="災害類型"
          defaultValue="flood"
          options={[
            ['flood', '水災'],
            ['earthquake', '地震'],
            ['landslide', '土石流'],
          ]}
        />
      </SettingRow>
    </Box>
  );
}

export const Default: Story = {
  render: () => <SettingsExample />,
};
