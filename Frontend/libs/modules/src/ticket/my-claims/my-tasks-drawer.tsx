'use client';

import { Tab, Tabs } from '@mui/material';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { SiteActionDrawer } from '../../shell/site/site-action-drawer';
import { MyRequestsList } from '../help-request/my-requests-list';
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
 * one tab per side of the same thing — 我建立的 (B's S6), read for how far each request got, and
 * 我承接的, for keeping the promise. As in the prototype, 我建立的 comes first and every opening
 * starts there. With a single tab there would be nothing to choose, so no tab bar (spec Q50).
 */
export function MyTasksDrawer({ open, onClose }: MyTasksDrawerProps) {
  const tabs: MyTasksTab[] = [
    {
      value: 'created',
      label: '我建立的',
      content: <MyRequestsList onLeave={onClose} />,
    },
    {
      value: 'claimed',
      label: '我承接的',
      content: <MyClaimsList onLeave={onClose} />,
    },
  ];
  const [tab, setTab] = useState(tabs[0].value);
  const [wasOpen, setWasOpen] = useState(open);

  // Back on the first tab at each opening (prototype `site-actions.jsx:1781`). Set while rendering
  // the opening rather than after it, so the tab left last time never shows for a frame.
  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setTab(tabs[0].value);
    }
  }

  const current = tabs.find((item) => item.value === tab) ?? tabs[0];

  return (
    <SiteActionDrawer
      open={open}
      title="我的任務"
      subtitle="你建立的需求，以及你答應要去的任務"
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
