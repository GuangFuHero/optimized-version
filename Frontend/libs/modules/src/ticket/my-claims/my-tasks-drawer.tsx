'use client';

import { Tab, Tabs } from '@mui/material';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useQuery } from 'urql';

import {
  MyTaskAssignmentsDocument,
  MyTicketsDocument,
} from '@rescue-frontend/data-access';

import { SiteActionDrawer } from '../../shell/site/site-action-drawer';
import { MyRequestsList } from '../help-request/my-requests-list';
import { MyClaimsList } from './my-claims-list';

// Each list's own loading line inside the drawer rather than suspending the page behind it.
const MY_TASKS_QUERY_CONTEXT = { suspense: false } as const;

interface MyTasksTab {
  value: string;
  label: string;
  content: ReactNode;
}

interface MyTasksDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** 「我建立的（3）」, as the prototype's tabs count; no count for an empty list or one still loading. */
function tabLabel(label: string, count: number | undefined): string {
  return count ? `${label}（${count}）` : label;
}

/**
 * What the drawer holds. Mounted at each opening — the drawer's content unmounts once closed — so
 * both lists are read afresh, a request filed or a need claimed since included, and the first tab
 * is the one showing. Both are read at once, for the count on each tab: a volunteer who never filed
 * a request opens on an empty 我建立的, and 我承接的（2） says where to look.
 */
function MyTasksContent({ onClose }: Pick<MyTasksDrawerProps, 'onClose'>) {
  const [requests, reloadRequests] = useQuery({
    query: MyTicketsDocument,
    requestPolicy: 'network-only',
    context: MY_TASKS_QUERY_CONTEXT,
  });
  const [claims, reloadClaims] = useQuery({
    query: MyTaskAssignmentsDocument,
    requestPolicy: 'network-only',
    context: MY_TASKS_QUERY_CONTEXT,
  });

  // Both, once a place given back is answered: it may be on one of the viewer's own requests.
  const reload = () => {
    reloadRequests({ requestPolicy: 'network-only' });
    reloadClaims({ requestPolicy: 'network-only' });
  };

  const tabs: MyTasksTab[] = [
    {
      value: 'created',
      label: tabLabel('我建立的', requests.data?.myTickets.length),
      content: <MyRequestsList result={requests} onLeave={onClose} />,
    },
    {
      value: 'claimed',
      label: tabLabel('我承接的', claims.data?.myTaskAssignments.length),
      content: (
        <MyClaimsList result={claims} reload={reload} onLeave={onClose} />
      ),
    },
  ];
  const [tab, setTab] = useState(tabs[0].value);
  const current = tabs.find((item) => item.value === tab) ?? tabs[0];

  return (
    <>
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
    </>
  );
}

/**
 * 我的任務 (prototype `MyTasksDrawer`, `site-actions.jsx:1765-1896`): one entry in the account menu,
 * one tab per side of the same thing — 我建立的, read for how far each request got, and 我承接的,
 * for keeping the promise. As in the prototype, 我建立的 comes first and every opening starts
 * there. With a single tab there would be nothing to choose, so no tab bar.
 */
export function MyTasksDrawer({ open, onClose }: MyTasksDrawerProps) {
  return (
    <SiteActionDrawer
      open={open}
      title="我的任務"
      subtitle="你建立的需求，以及你答應要去的任務"
      onClose={onClose}
    >
      <MyTasksContent onClose={onClose} />
    </SiteActionDrawer>
  );
}
