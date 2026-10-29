import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

import { SITE_SHARE_CARD } from '@rescue-frontend/modules';
import { designTokens } from '@rescue-frontend/ui';

// Drawn once at build time and served as a file afterwards. Not the `opengraph-image` convention: a
// page that sets its own `openGraph` (a point shared from the map or the list) drops the image that
// convention adds, and its URL carries a hash no page can name.
export const dynamic = 'force-static';

const { color } = designTokens;

// The fonts beside this card hold only these characters (`assets/share-card/README.md`). Change a
// word and subset them again, or it is drawn as an empty box.
const TITLE = '島嶼守望';
const SUBTITLE = '檢視救災任務與站點資訊。';

export async function GET() {
  // From the app's own folder, where `next build` runs. Each path spelled out, so the build traces
  // these three files and not the whole project.
  const [bold, regular, logo] = await Promise.all([
    readFile(
      path.join(process.cwd(), 'assets/share-card/NotoSansTC-Bold.subset.otf'),
    ),
    readFile(
      path.join(
        process.cwd(),
        'assets/share-card/NotoSansTC-Regular.subset.otf',
      ),
    ),
    readFile(path.join(process.cwd(), 'public/wan-guard.svg')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: color.bg.neutral.default,
          fontFamily: 'Noto Sans TC',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 64,
            padding: '0 96px',
          }}
        >
          <img
            src={`data:image/svg+xml;base64,${logo.toString('base64')}`}
            width={300}
            height={201}
            alt=""
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 108,
                fontWeight: 700,
                color: color.fg.neutral.default,
                letterSpacing: 6,
              }}
            >
              {TITLE}
            </div>
            <div
              style={{
                marginTop: 20,
                fontSize: 40,
                fontWeight: 400,
                color: color.fg.neutral.subtle,
              }}
            >
              {SUBTITLE}
            </div>
          </div>
        </div>
        <div style={{ height: 20, background: color.bg.primary.default }} />
      </div>
    ),
    {
      width: SITE_SHARE_CARD.width,
      height: SITE_SHARE_CARD.height,
      fonts: [
        { name: 'Noto Sans TC', data: bold, weight: 700, style: 'normal' },
        { name: 'Noto Sans TC', data: regular, weight: 400, style: 'normal' },
      ],
    },
  );
}
