'use client';

import { Tab, Tabs } from '@mui/material';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { SiteActionDrawer } from '../../shell/site/site-action-drawer';
import { MyClaimsList } from './my-claims-list';

interface MyTasksTab {
  value: string;
  label: string;
  content: ReactNode;
}

interface MyTasksDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 我的任務 (prototype `MyTasksDrawer`, `site-actions.jsx:1765-1896`): one entry in the account menu,
 * one tab per side of the same thing — 我承接的 here, 我建立的 when flow B adds it (S6). With a
 * single tab there is nothing to choose, so no tab bar, and the subtitle speaks of that one only
 * (spec Q50).
 */
export function MyTasksDrawer({ open, onClose }: MyTasksDrawerProps) {
  const tabs: MyTasksTab[] = [
    {
      value: 'claimed',
      label: '我承接的',
      content: <MyClaimsList onLeave={onClose} />,
    },
  ];
  const [tab, setTab] = useState(tabs[0].value);
  const current = tabs.find((item) => item.value === tab) ?? tabs[0];

  return (
    <SiteActionDrawer
      open={open}
      title="我的任務"
      subtitle="你答應要去的任務"
      onClose={onClose}
    >
      {tabs.length > 1 ? (
        <Tabs
          value={current.value}
          onChange={(_, value: string) => setTab(value)}
          sx={{ mb: 2 }}
        >
          {tabs.map((item) => (
            <Tab key={item.value} value={item.value} label={item.label} />
          ))}
        </Tabs>
      ) : null}
      {current.content}
    </SiteActionDrawer>
  );
}
