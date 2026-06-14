import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { Providers } from '../providers/index.providers';
import './global.css';

export const metadata = {
  title: '救災地圖 Rescue Map',
  description: '即時灾害資訊與資源站點地圖',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <link
        rel="icon"
        href="/wan-guard.svg"
        type="image/svg+xml"
        sizes="32x32"
      />
      <body>
        <InitColorSchemeScript
          defaultMode="light"
          modeStorageKey="mui-mode-disabled"
          colorSchemeStorageKey="mui-color-scheme-disabled"
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
