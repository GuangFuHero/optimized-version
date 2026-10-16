'use client';

import { Suspense } from 'react';

import { ButtonBase } from '@mui/material';
import Link from 'next/link';

import { designTokens } from '@rescue-frontend/ui';

import { SITE_MODULE_META } from '../module-meta';
import { createSiteHref } from '../serialize';
import type { SiteModule, SiteRouteState } from '../types';
import { useSiteRouteState } from '../use-site-route-state';

const { color, radius } = designTokens;

interface SiteViewSwitchProps {
  /** 目前所在的模組。 */
  module: SiteModule;
}

function SiteViewSwitchContent({
  module,
  state,
}: SiteViewSwitchProps & { state: SiteRouteState }) {
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

function SiteViewSwitchConnected(props: SiteViewSwitchProps) {
  const { state } = useSiteRouteState();

  return <SiteViewSwitchContent {...props} state={state} />;
}

/**
 * 地圖 ⇄ 列表切換：一顆純圖示，形狀跟地圖上的圖層按鈕一樣。
 *
 * 只有手機要（2026-09-21 Sucre：「電腦版左邊已經有檢視模式了」）。平板以上的側欄一直列著地圖與
 * 列表，工具列再放一顆是同一件事的第二個入口。手機的側欄收在漢堡選單裡，每換一次看法都得開關
 * 一次抽屜 —— 所以那裡要這一顆（2026-09-18 Sucre：「列表呈現有辦法不要進入漢堡包？」）。
 * 呼叫端照外框收起側欄的斷點顯示它：`mobile` 顯示，`tablet` 起隱藏（`shell/site/shell.tsx`）。
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
