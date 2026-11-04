'use client';

import { Layers } from 'lucide-react';

import { Box, ButtonBase } from '@mui/material';

import type { RescueMapControllerValue } from '../types';
import { SITE_FALLBACK_DATA_TYPE } from '../../route/constants';
import { SiteControlSurface } from '../../route/controls/control-surface';
import { SiteDataTypeToggle } from '../../route/controls/data-type-toggle';
import {
  SitePinnedFilterRow,
  usePinnedSubDataTypes,
} from '../../route/controls/pinned-sub-types';
import { SiteSubTypeFilter } from '../../route/controls/sub-type-filter';
import { SiteViewSwitch } from '../../route/controls/view-switch';

import {
  designTokens,
  siteMapControls,
  siteMapLeftControlsMaxWidth,
} from '@rescue-frontend/ui';

/** A phone too narrow for the controls' one row. */
const NARROW_PHONE = `@media (max-width: ${siteMapControls.oneRowMinWidth - 0.05}px)`;

const { color } = designTokens;

interface SiteMapControlsProps {
  controller: RescueMapControllerValue;
}

function SiteLayerButton({ controller }: SiteMapControlsProps) {
  return (
    <SiteControlSurface
      sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }}
    >
      <ButtonBase
        disableRipple
        aria-label="開啟圖層控制"
        onClick={controller.openLayerPanel}
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: 999,
          color: controller.layerPanelOpen
            ? color.fg.neutral.default
            : color.fg.neutral.subtle,
        }}
      >
        <Box component={Layers} sx={{ width: 18, height: 18 }} />
      </ButtonBase>
    </SiteControlSurface>
  );
}

/**
 * 前台地圖的浮層控制項：維度切換與子分類篩選（左上，順序比照列表頁）、圖層切換（右上）。
 * 全部已處理 RWD，並透過受控 controller 將互動寫回網址。
 */
export function SiteMapControls({ controller }: SiteMapControlsProps) {
  const dataType = controller.dataType ?? SITE_FALLBACK_DATA_TYPE;
  const { pinned, pinnedOptions, togglePinned } =
    usePinnedSubDataTypes(dataType);

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1200,
        pointerEvents: 'none',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          // 12 on a phone, as the prototype: at 16 the one row (站點／任務, 篩選, 列表, 圖層) is 5px
          // too wide for a 375px screen.
          top: siteMapControls.top,
          left: siteMapControls.left,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 1,
          width: 'fit-content',
          // Clear of the buttons on the right: 列表 and 圖層 side by side on a phone, one column on a
          // phone too narrow for that row, 圖層 alone from 768px up.
          maxWidth: {
            mobile: siteMapLeftControlsMaxWidth({
              left: siteMapControls.left.mobile,
              right: siteMapControls.right.mobile,
              columns: 2,
              clearance: siteMapControls.gap,
            }),
            tablet: siteMapLeftControlsMaxWidth({
              left: siteMapControls.left.tablet,
              right: siteMapControls.right.tablet,
              columns: 1,
              clearance: 28,
            }),
          },
          [NARROW_PHONE]: {
            maxWidth: siteMapLeftControlsMaxWidth({
              left: siteMapControls.left.mobile,
              right: siteMapControls.right.mobile,
              columns: 1,
              clearance: siteMapControls.gap,
            }),
          },
          pointerEvents: 'auto',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { mobile: 1, tablet: 1.5 },
            minWidth: 0,
            maxWidth: '100%',
          }}
        >
          <SiteDataTypeToggle
            value={dataType}
            onChange={controller.setDataType}
          />
          <SiteSubTypeFilter
            dataType={dataType}
            selected={controller.subDataTypes}
            pinned={pinned}
            onToggle={controller.toggleSubDataType}
            onTogglePinned={togglePinned}
            iconOnlyOnPhone
          />
        </Box>
        <SitePinnedFilterRow
          items={pinnedOptions}
          selected={controller.subDataTypes}
          onToggle={controller.toggleSubDataType}
        />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          top: siteMapControls.top,
          right: siteMapControls.right,
          display: 'flex',
          // A phone's controls are one row: 站點／任務, 篩選, 列表, 圖層. The 篩選 beside them is its icon
          // alone there, so 列表 fits beside 圖層 rather than hanging in a second row under it.
          flexDirection: { mobile: 'row', tablet: 'column' },
          // Narrower than that row (a 360px Android, a 320px iPhone SE, or a phone set to show things
          // larger), 列表 goes back under 圖層, so it covers neither 篩選 nor its count.
          [NARROW_PHONE]: { flexDirection: 'column-reverse' },
          gap: `${siteMapControls.gap}px`,
          pointerEvents: 'auto',
        }}
      >
        {/* 地圖 ⇄ 列表，只在手機：平板以上的側欄已經有地圖與列表，手機的側欄收在漢堡選單裡。
            跟圖層按鈕同一種形狀，排在它左邊。 */}
        <SiteControlSurface
          sx={{
            display: { mobile: 'grid', tablet: 'none' },
            width: 44,
            height: 44,
            placeItems: 'center',
          }}
        >
          <SiteViewSwitch module="map" />
        </SiteControlSurface>
        <SiteLayerButton controller={controller} />
      </Box>
    </Box>
  );
}
