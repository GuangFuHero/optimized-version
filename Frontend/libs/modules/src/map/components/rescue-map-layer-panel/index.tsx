'use client';

import { Check } from 'lucide-react';

import {
  Box,
  ButtonBase,
  Drawer,
  IconButton,
  Stack,
  SwipeableDrawer,
  Typography,
  useMediaQuery,
} from '@mui/material';

import {
  BASE_LAYER_CONFIG,
  OVERLAY_LAYER_CONFIG,
  RESCUE_MAP_OVERLAY_LAYER_ORDER,
} from '../../constants';
import type { RescueMapBaseLayer, RescueMapControllerValue } from '../../types';

import {
  designTokens,
  displayTextSize,
  Icons,
  safeAreaBottom,
  withAlpha,
} from '@rescue-frontend/ui';

const { color, radius, shadow } = designTokens;
const CloseIcon = Icons.close;

interface RescueMapLayerPanelProps {
  controller: RescueMapControllerValue;
}

function RescueMapLayerPanelContent({
  controller,
  mobile,
}: RescueMapLayerPanelProps & { mobile: boolean }) {
  // SAFETY: BASE_LAYER_CONFIG is a complete Record keyed only by RescueMapBaseLayer.
  const baseLayers = Object.entries(BASE_LAYER_CONFIG) as Array<
    [RescueMapBaseLayer, (typeof BASE_LAYER_CONFIG)[RescueMapBaseLayer]]
  >;
  return (
    <Box>
      {/* The bottom sheet's handle: the sheet drags down from it, or from anywhere on it. */}
      {mobile ? (
        <Box
          sx={{
            width: 48,
            height: 4,
            borderRadius: 999,
            backgroundColor: color.fg.neutral.muted,
            mx: 'auto',
            mb: 1.5,
          }}
        />
      ) : null}

      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: displayTextSize[20],
              fontWeight: 800,
              color: color.fg.neutral.default,
            }}
          >
            圖層切換
          </Typography>
          <Typography
            sx={{
              mt: 0.6,
              fontSize: displayTextSize[14],
              color: color.fg.neutral.subtle,
            }}
          >
            選擇底圖與目前可用的疊加圖層。
          </Typography>
        </Box>
        {/* At every width: on a phone it is the way out that needs no drag. */}
        <IconButton
          aria-label="關閉圖層控制"
          onClick={controller.closeLayerPanel}
          sx={{
            width: 44,
            height: 44,
            mt: -1,
            mr: -1,
            flexShrink: 0,
            color: color.fg.neutral.subtle,
          }}
        >
          <CloseIcon />
        </IconButton>
      </Stack>

      <Typography
        sx={{
          mt: 2,
          fontSize: displayTextSize[13],
          fontWeight: 800,
          color: color.fg.neutral.default,
        }}
      >
        底圖
      </Typography>

      <Stack spacing={1.2} sx={{ mt: 2 }}>
        {baseLayers
          .filter(([, value]) => !value.hidden)
          .map(([key, value]) => {
            const Icon = value.icon;
            const active = key === controller.baseLayer;
            const disabled = Boolean(value.disabledReason);

            return (
              <ButtonBase
                key={key}
                disabled={disabled}
                onClick={() => controller.setBaseLayer(key)}
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  textAlign: 'left',
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.4,
                    p: 1.2,
                    borderRadius: 3,
                    border: `1px solid ${
                      active
                        ? color.brand.secondary.default
                        : color.border.default
                    }`,
                    backgroundColor: active
                      ? color.bg.secondary.subtle
                      : color.bg.neutral.default,
                    opacity: disabled ? 0.52 : 1,
                    boxShadow: active ? shadow.md : 'none',
                  }}
                >
                  <Box
                    sx={{
                      width: 72,
                      height: 56,
                      borderRadius: 2,
                      background: value.preview,
                      border: `1px solid ${color.border.default}`,
                      display: 'grid',
                      placeItems: 'center',
                      color: active
                        ? color.brand.secondary.subtle
                        : color.fg.neutral.subtle,
                    }}
                  >
                    <Icon size={26} />
                  </Box>

                  <Box sx={{ flex: 1 }}>
                    <Typography
                      sx={{
                        fontSize: displayTextSize[16],
                        fontWeight: 800,
                        color: color.fg.neutral.default,
                      }}
                    >
                      {value.label}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.35,
                        fontSize: displayTextSize[12],
                        color: color.fg.neutral.subtle,
                      }}
                    >
                      {value.disabledReason ?? value.description}
                    </Typography>
                    {value.licenseNote ? (
                      <Typography
                        sx={{
                          mt: 0.35,
                          fontSize: displayTextSize[11],
                          color: color.fg.warning,
                        }}
                      >
                        {value.licenseNote}
                      </Typography>
                    ) : null}
                  </Box>

                  {active ? (
                    <Box
                      component={Check}
                      sx={{ color: color.brand.secondary.subtle }}
                    />
                  ) : null}
                </Box>
              </ButtonBase>
            );
          })}
      </Stack>

      <Typography
        sx={{
          mt: 2.4,
          fontSize: displayTextSize[13],
          fontWeight: 800,
          color: color.fg.neutral.default,
        }}
      >
        疊加圖層
      </Typography>

      <Stack spacing={1.2} sx={{ mt: 2 }}>
        {RESCUE_MAP_OVERLAY_LAYER_ORDER.map((key) => {
          const value = OVERLAY_LAYER_CONFIG[key];
          const Icon = value.icon;
          const active = controller.enabledOverlayLayers.includes(key);
          const disabled = Boolean(value.disabledReason);

          return (
            <ButtonBase
              key={key}
              disabled={disabled}
              onClick={() => controller.toggleOverlayLayer(key)}
              sx={{
                width: '100%',
                borderRadius: 3,
                textAlign: 'left',
              }}
            >
              <Box
                sx={{
                  width: '100%',
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.4,
                    p: 1.2,
                    borderRadius: 3,
                    border: `1px solid ${
                      active ? `${value.color}55` : color.border.default
                    }`,
                    backgroundColor: active
                      ? `${value.color}12`
                      : color.bg.neutral.default,
                    opacity: disabled ? 0.52 : 1,
                    boxShadow: active ? shadow.md : 'none',
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2.5,
                      display: 'grid',
                      placeItems: 'center',
                      color: value.color,
                      backgroundColor: `${value.color}14`,
                      border: `1px solid ${value.color}20`,
                    }}
                  >
                    <Icon size={20} />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: displayTextSize[16],
                        fontWeight: 800,
                        color: color.fg.neutral.default,
                      }}
                    >
                      {value.label}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.35,
                        fontSize: displayTextSize[12],
                        color: color.fg.neutral.subtle,
                      }}
                    >
                      {value.disabledReason ?? value.description}
                    </Typography>
                  </Box>

                  {active ? (
                    <Box component={Check} sx={{ color: value.color }} />
                  ) : null}
                </Box>
              </Box>
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
}

export function RescueMapLayerPanel({ controller }: RescueMapLayerPanelProps) {
  // Each drawer opens at its own width only. One hidden by CSS is still an open modal, the top one,
  // so MUI hid the other from screen readers and only the hidden one heard Esc.
  const isPhone = useMediaQuery((theme) => theme.breakpoints.down('tablet'));

  return (
    <>
      {/*
       * On a phone, a bottom sheet that drags down to close: once the list is scrolled back to the
       * top, dragging further closes it. It stops short of the top, so a strip of map stays to tap
       * as well. It only opens from the layer button: a swipe up from the screen's edge is the map's.
       */}
      <SwipeableDrawer
        anchor="bottom"
        open={controller.layerPanelOpen && isPhone}
        onOpen={controller.openLayerPanel}
        onClose={controller.closeLayerPanel}
        disableSwipeToOpen
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: 'transparent',
            },
          },
        }}
        sx={{
          display: { mobile: 'block', tablet: 'none' },
          '& .MuiDrawer-paper': {
            bgcolor: withAlpha(color.bg.neutral.default, 0.92),
            backdropFilter: 'blur(10px)',
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            boxShadow: shadow.lg,
            // 92% of the space under the announcement banner, so a strip of map stays above it.
            maxHeight: '92%',
            px: 2,
            pt: 1.25,
            pb: safeAreaBottom(24),
          },
        }}
      >
        <RescueMapLayerPanelContent controller={controller} mobile />
      </SwipeableDrawer>

      <Drawer
        anchor="right"
        open={controller.layerPanelOpen && !isPhone}
        onClose={controller.closeLayerPanel}
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: 'transparent',
            },
          },
        }}
        sx={{
          display: { mobile: 'none', tablet: 'block' },
          '& .MuiDrawer-paper': {
            bgcolor: withAlpha(color.bg.neutral.default, 0.92),
            backdropFilter: 'blur(10px)',
            boxShadow: shadow.lg,
            width: 320,
            px: 2.25,
            py: 2.5,
          },
        }}
      >
        <RescueMapLayerPanelContent controller={controller} mobile={false} />
      </Drawer>
    </>
  );
}
