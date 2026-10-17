import { DocumentLayout } from '@rescue-frontend/modules/document';
import type { ReactNode } from 'react';

import { Providers } from './providers';

export const metadata = {
  title: '島嶼守望後台',
  description: '任務與資源站點管理',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <DocumentLayout>
      <Providers>{children}</Providers>
    </DocumentLayout>
  );
}
