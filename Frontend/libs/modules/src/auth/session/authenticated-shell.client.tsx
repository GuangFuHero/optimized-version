'use client';

import type { ReactNode } from 'react';

import { signOut, useSession } from 'next-auth/react';

import { AdminShell } from '../../shell';

export function PortalAdminLayout({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  return (
    <AdminShell
      event={{
        shortName: '花蓮馬太鞍溪',
        name: '花蓮馬太鞍溪堰塞湖專案',
        day: 110,
      }}
      user={{
        name: session?.user?.name ?? '',
        image: session?.user?.image ?? undefined,
        roleLabel: '超級管理員',
        identityLabel: '超級管理員',
      }}
      announcement="今日 18:00 前需回報各隊在場人數，未回報者由縣府直接致電"
      onSignOut={() => signOut({ callbackUrl: '/login?callbackUrl=/' })}
    >
      {children}
    </AdminShell>
  );
}
