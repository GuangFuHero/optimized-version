'use client';

import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import type { RescueMapControllerValue } from '../types';
import {
  SITE_FALLBACK_DATA_TYPE,
  SITE_SUB_DATA_TYPE_OPTIONS,
} from '../../route/constants';
import type { RescueMapDataType, SiteSubDataTypeOption } from '../../route/types';
import { SiteControlSurface } from '../../route/controls/control-surface';
import { SiteDataTypeToggle } from '../../route/controls/data-type-toggle';
import { SiteSubTypeFilter } from '../../route/controls/sub-type-filter';
import { SiteViewSwitch } from '../../route/controls/view-switch';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color } = designTokens;

interface SiteMapControlsProps {
  controller: RescueMapControllerValue;
}

const SITE_PINNED_SUB_TYPE_STORAGE_KEY = 'site-map:pinned-sub-data-types';

function createEmptyPinnedSubDataTypes(): Record<RescueMapDataType, string[]> {
  return {
    station: [],
    ticket: [],
  };
}

function normalizePinnedSubDataTypes(
  value: unknown,
): Record<RescueMapDataType, string[]> {
  if (!value || typeof value !== 'object') {
    return createEmptyPinnedSubDataTypes();
  }

  const candidate = value as Partial<Record<RescueMapDataType, unknown>>;

  return {
    station: SITE_SUB_DATA_TYPE_OPTIONS.station
      .map((option) => option.value)
      .filter(
        (optionValue) =>
          Array.isArray(candidate.station) &&
          candidate.station.includes(optionValue),
      ),
    ticket: SITE_SUB_DATA_TYPE_OPTIONS.ticket
      .map((option) => option.value)
      .filter(
        (optionValue) =>
          Array.isArray(candidate.ticket) &&
          candidate.ticket.includes(optionValue),
      ),
  };
}

function readPinnedSubDataTypes(): Record<RescueMapDataType, string[]> {
  if (typeof window === 'undefined') {
    return createEmptyPinnedSubDataTypes();
  }

  const storedValue = window.localStorage.getItem(
    SITE_PINNED_SUB_TYPE_STORAGE_KEY,
  );

  if (!storedValue) {
    return createEmptyPinnedSubDataTypes();
  }

  try {
    return normalizePinnedSubDataTypes(JSON.parse(storedValue));
  } catch {
    return createEmptyPinnedSubDataTypes();
  }
}

function writePinnedSubDataTypes(
  pinnedSubDataTypes: Record<RescueMapDataType, readonly string[]>,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    SITE_PINNED_SUB_TYPE_STORAGE_KEY,
    JSON.stringify(pinnedSubDataTypes),
  );
}

/**
 * 地圖欄寬到多少才放得下兩段切換（container query 門檻）。
 *
 * 左上群組（站點⇄任務＋篩選＋兩段切換）要放在圖層按鈕左邊：左邊距 24 ＋ 群組寬 ＋ 間距 16 ＋
 * 圖層按鈕 44 ＋ 右邊距 16。群組寬實測：桌機字級 444px → 需要 544；手機字級 484px → 需要 584。
 * 取 640 讓兩種字級都有餘量。
 *
 * 以視窗寬度判斷會漏掉兩種情況：桌機開著詳情面板時地圖欄少 352px，滑鼠停在側欄上時再少 192px。
 * 768–923px 開著詳情時群組會被裁切並撞上圖層按鈕 —— 平板直向就落在這個範圍。
 */
const VIEW_SWITCH_SEGMENTED_MIN = '@640';

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
        <LayersOutlinedIcon sx={{ fontSize: 18 }} />
      </ButtonBase>
    </SiteControlSurface>
  );
}

function SitePinnedFilterRow({
  items,
  selected,
  onToggle,
}: {
  items: readonly SiteSubDataTypeOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  const selectedValues = new Set(selected);

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': {
          height: 6,
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: color.border.default,
          borderRadius: 999,
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ width: 'max-content', minWidth: '100%', pb: 0.25 }}
      >
        {items.map((item) => {
          const active = selectedValues.has(item.value);

          return (
            <SiteControlSurface
              key={item.value}
              sx={{
                flex: '0 0 auto',
                bgcolor: active
                  ? color.bg.secondary.subtle
                  : color.bg.neutral.default,
                borderColor: active
                  ? color.brand.secondary.default
                  : color.border.accent,
              }}
            >
              <ButtonBase
                disableRipple
                aria-pressed={active}
                aria-label={`${active ? '取消套用' : '套用'}${item.label}篩選`}
                onClick={() => onToggle(item.value)}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  px: 1.5,
                  py: 1,
                  color: active
                    ? color.fg.neutral.default
                    : color.fg.neutral.subtle,
                  whiteSpace: 'nowrap',
                }}
              >
                <Typography
                  sx={{
                    fontSize: displayTextSize[12],
                    fontWeight: active ? 800 : 700,
                    lineHeight: '16px',
                    color: 'inherit',
                  }}
                >
                  {item.label}
                </Typography>
              </ButtonBase>
            </SiteControlSurface>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * 前台地圖的浮層控制項：維度切換與子分類篩選（左上，順序比照列表頁）、圖層切換（右上）。
 * 全部已處理 RWD，並透過受控 controller 將互動寫回網址。
 */
export function SiteMapControls({ controller }: SiteMapControlsProps) {
  const dataType = controller.dataType ?? SITE_FALLBACK_DATA_TYPE;
  const [pinnedSubDataTypesByDataType, setPinnedSubDataTypesByDataType] =
    useState<Record<RescueMapDataType, readonly string[]>>(
      createEmptyPinnedSubDataTypes,
    );

  useEffect(() => {
    setPinnedSubDataTypesByDataType(readPinnedSubDataTypes());
  }, []);

  const pinnedSubDataTypes = pinnedSubDataTypesByDataType[dataType] ?? [];
  const pinnedOptions = SITE_SUB_DATA_TYPE_OPTIONS[dataType].filter((option) =>
    pinnedSubDataTypes.includes(option.value),
  );

  const handleTogglePinnedSubDataType = (value: string) => {
    setPinnedSubDataTypesByDataType((current) => {
      const nextPinnedValues = new Set(current[dataType] ?? []);

      if (nextPinnedValues.has(value)) {
        nextPinnedValues.delete(value);
      } else {
        nextPinnedValues.add(value);
      }

      const nextPinnedSubDataTypes = {
        ...current,
        [dataType]: SITE_SUB_DATA_TYPE_OPTIONS[dataType]
          .map((option) => option.value)
          .filter((optionValue) => nextPinnedValues.has(optionValue)),
      };

      writePinnedSubDataTypes(nextPinnedSubDataTypes);

      return nextPinnedSubDataTypes;
    });
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1200,
        pointerEvents: 'none',
        // 地圖這一欄的寬度會隨桌機詳情面板（352px）與側欄 hover 展開（+192px）變動，
        // 視窗寬度說明不了這裡剩多少空間，所以下面的切換依這一欄的寬度決定。
        containerType: 'inline-size',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 16,
          left: { mobile: 16, tablet: 24 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 1,
          width: 'fit-content',
          maxWidth: 'calc(100vw - 112px)',
          pointerEvents: 'auto',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
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
            pinned={pinnedSubDataTypes}
            onToggle={controller.toggleSubDataType}
            onTogglePinned={handleTogglePinnedSubDataType}
          />
          {/* 空間夠：帶字的兩段切換，把「現在是哪一種看法」講出來。 */}
          <Box sx={{ display: { '@': 'none', [VIEW_SWITCH_SEGMENTED_MIN]: 'flex' } }}>
            <SiteControlSurface sx={{ p: '3px' }}>
              <SiteViewSwitch module="map" variant="segmented" />
            </SiteControlSurface>
          </Box>
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
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          pointerEvents: 'auto',
        }}
      >
        <SiteLayerButton controller={controller} />
        {/* 空間不夠：純圖示，跟圖層按鈕同一種形狀。不做第二組分段控制 —— 左邊已經有
            站點⇄任務，兩組並排分不出誰是誰。
            直向疊在圖層按鈕下方而不是並排：390px 實測並排會蓋住「篩選」。 */}
        <SiteControlSurface
          sx={{
            display: { '@': 'grid', [VIEW_SWITCH_SEGMENTED_MIN]: 'none' },
            width: 44,
            height: 44,
            placeItems: 'center',
          }}
        >
          <SiteViewSwitch module="map" variant="icon" />
        </SiteControlSurface>
      </Box>
    </Box>
  );
}
