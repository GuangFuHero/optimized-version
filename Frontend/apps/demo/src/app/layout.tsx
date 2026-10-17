import { SiteProviders } from '@rescue-frontend/modules';
import { DocumentLayout } from '@rescue-frontend/modules/document';
import type { ReactNode } from 'react';

export const metadata = {
  title: '救災地圖 Rescue Map',
  description: '即時災害資訊與資源站點地圖',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <DocumentLayout>
      <SiteProviders>{children}</SiteProviders>
    </DocumentLayout>
  );
}
