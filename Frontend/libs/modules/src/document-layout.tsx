import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { Inter, Noto_Sans_TC, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';

import './global.css';

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-noto-sans-tc',
});
// Not preloaded, as Noto Sans TC is not: preloaded, these two were fetched alongside the page's code
// and slowed it on a slow connection, for text that shows in the fallback face until they come.
const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-nunito',
});
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-inter',
});

export function DocumentLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="zh-TW"
      suppressHydrationWarning
      className={`${notoSansTC.variable} ${nunito.variable} ${inter.variable}`}
    >
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
        {children}
      </body>
    </html>
  );
}
