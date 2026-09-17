import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { Inter, Noto_Sans_TC, Nunito } from 'next/font/google';

import { fontVariables } from '@rescue-frontend/ui';
import { Providers } from '../providers/index.providers';
import './global.css';

/**
 * The three faces the design system actually names. `next/font` downloads them at build time and
 * serves them from our own origin, so there is no runtime request to fonts.gstatic.com and no
 * layout shift — and no 34MB of `.otf` in the repository either.
 *
 * Poppins is deliberately not loaded: the design system lists it behind Nunito, so with Nunito
 * present it can never be reached for a latin glyph.
 */
const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  // A Traditional Chinese face ships as many unicode-range chunks. Preloading would pull all of
  // them on first paint for the handful the page needs; `swap` covers the gap instead.
  preload: false,
  variable: '--font-noto-sans-tc',
});

const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito',
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * The theme builds its font stacks around these same custom-property names, but `next/font` only
 * accepts inline string literals — the calls above cannot read them from `fontVariables`. This
 * assignment is what keeps the two sides in lockstep: rename a variable on either side without the
 * other and the build fails here, instead of silently shipping the fallback font.
 */
export const FONT_VARIABLE_CONTRACT: typeof fontVariables = {
  chinese: '--font-noto-sans-tc',
  latin: '--font-nunito',
  data: '--font-inter',
};

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
