'use client';

import { Suspense } from 'react';

import { Box, ButtonBase } from '@mui/material';
import Link from 'next/link';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { SITE_MODULES } from '../constants';
import { SITE_MODULE_META } from '../module-meta';
import { createSiteHref } from '../serialize';
import type { SiteModule, SiteRouteState } from '../types';
import { useSiteRouteState } from '../use-site-route-state';

const { color, radius, shadow, typography } = designTokens;

export type SiteViewSwitchVariant = 'segmented' | 'icon';

interface SiteViewSwitchProps {
  /** 目前所在的模組。 */
  module: SiteModule;
  variant: SiteViewSwitchVariant;
}

function SiteViewSwitchContent({
  module,
  variant,
  state,
}: SiteViewSwitchProps & { state: SiteRouteState }) {
  if (variant === 'icon') {
    const target: SiteModule = module === 'map' ? 'list' : 'map';
    const { label, Icon } = SITE_MODULE_META[target];

    return (
      <ButtonBase
        disableRipple
        LinkComponent={Link}
        href={createSiteHref(target, state)}
        aria-label={`切換到${label}`}
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: `${radius.full}px`,
          color: color.fg.neutral.subtle,
        }}
      >
        <Icon sx={{ fontSize: 18 }} />
      </ButtonBase>
    );
  }

  return (
    <Box
      role="group"
      aria-label="檢視模式"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        p: '2px',
        borderRadius: `${radius.full}px`,
        bgcolor: color.bg.neutral.sunken,
      }}
    >
      {SITE_MODULES.map((target) => {
        const { label, Icon } = SITE_MODULE_META[target];
        const active = target === module;
        const segmentSx = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          minHeight: 34,
          px: '12px',
          borderRadius: `${radius.full}px`,
          whiteSpace: 'nowrap',
          bgcolor: active ? color.bg.neutral.default : 'transparent',
          boxShadow: active ? shadow.sm : 'none',
          color: active ? color.fg.neutral.default : color.fg.neutral.subtle,
          fontFamily: typography.body[400].fontFamily,
          fontSize: displayTextSize[13],
          fontWeight: 500,
          lineHeight: 1.2,
        } as const;
        const content = (
          <>
            <Icon sx={{ fontSize: 16 }} />
            {label}
          </>
        );

        // 目前這一頁不做成連結：連到自己的連結是假出口，按了沒反應，使用者會以為壞了。
        return active ? (
          <Box key={target} component="span" aria-current="page" sx={segmentSx}>
            {content}
          </Box>
        ) : (
          <ButtonBase
            key={target}
            disableRipple
            LinkComponent={Link}
            href={createSiteHref(target, state)}
            sx={segmentSx}
          >
            {content}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function SiteViewSwitchConnected(props: SiteViewSwitchProps) {
  const { state } = useSiteRouteState();

  return <SiteViewSwitchContent {...props} state={state} />;
}

/**
 * 地圖 ⇄ 列表切換。
 *
 * 2026-09-18 Sucre：「列表呈現有辦法不要進入漢堡包？」地圖與列表是同一份內容的兩種看法，
 * 切換頻率高；漢堡選單收的是低頻的跨模組導覽。只放在側欄，手機上每換一次看法都得開關一次抽屜。
 * 側欄那一份保留（側欄收合時仍需要入口），但它不該是唯一的路。
 *
 * 旁邊的「站點 ⇄ 任務」回答的是看**什麼**，這一顆回答的是**怎麼**看。兩組分段控制並排會分不出
 * 誰是誰，所以：
 *   - `segmented`：空間夠時，帶字的兩段切換，用灰色凹槽＋白色選中段，刻意不同於站點⇄任務的藍色選中框
 *   - `icon`：空間不夠時，一顆純圖示，形狀跟旁邊的圖層按鈕一樣
 *
 * 「空間夠不夠」由呼叫端決定，這個元件不自己判斷：列表頁依視窗寬度（控制列會換行，不會撞）；
 * 地圖頁依地圖欄寬的 container query（詳情面板與側欄會擠壓地圖欄，見 `site-map-controls.tsx`）。
 *
 * 連結一律經 {@link createSiteHref} 帶上目前的路由狀態：兩頁共用同一份篩選（`PUB-PS-102`），
 * 直接連到 `/list` 會把使用者篩好的條件丟掉。
 *
 * 地圖頁沒有 `SiteRouteContext`（它用自己的 `SiteMapRouteProvider`），`useSiteRouteState` 會退回
 * 讀 `useSearchParams`，因此要包 Suspense。fallback 用空狀態，跟側欄的做法一致。
 */
export function SiteViewSwitch(props: SiteViewSwitchProps) {
  return (
    <Suspense fallback={<SiteViewSwitchContent {...props} state={{}} />}>
      <SiteViewSwitchConnected {...props} />
    </Suspense>
  );
}
