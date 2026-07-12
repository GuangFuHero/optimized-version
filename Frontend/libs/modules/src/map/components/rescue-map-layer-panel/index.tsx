'use client';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Box, ButtonBase, Drawer, Stack, Typography } from '@mui/material';

import {
  BASE_LAYER_CONFIG,
  OVERLAY_LAYER_CONFIG,
  RESCUE_MAP_OVERLAY_LAYER_ORDER,
} from '../../constants';
import type { RescueMapBaseLayer, RescueMapControllerValue } from '../../types';

interface RescueMapLayerPanelProps {
  controller: RescueMapControllerValue;
}

function RescueMapLayerPanelContent({
  controller,
  mobile,
}: RescueMapLayerPanelProps & { mobile: boolean }) {
  return (
    <Box>
      {mobile ? (
        <Box
          sx={{
            width: 48,
            height: 4,
            borderRadius: 999,
            backgroundColor: 'rgba(148, 163, 184, 0.45)',
            mx: 'auto',
            mb: 1.5,
          }}
        />
      ) : null}

      <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#151c22' }}>
        圖層切換
      </Typography>
      <Typography sx={{ mt: 0.6, fontSize: 14, color: '#344256' }}>
        選擇底圖與目前可用的疊加圖層。
      </Typography>

      <Typography
        sx={{ mt: 2, fontSize: 13, fontWeight: 800, color: '#151c22' }}
      >
        底圖
      </Typography>

      <Stack spacing={1.2} sx={{ mt: 2 }}>
        {(
          Object.entries(BASE_LAYER_CONFIG) as Array<
            [RescueMapBaseLayer, (typeof BASE_LAYER_CONFIG)[RescueMapBaseLayer]]
          >
        )
          .filter(([, value]) => !value.hidden)
          .map(([key, value]) => {
            const Icon = value.icon;
            const active = key === controller.baseLayer;

            return (
              <ButtonBase
                key={key}
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
                    border: active
                      ? '1px solid rgba(95, 85, 246, 0.34)'
                      : '1px solid rgba(204, 214, 226, 0.92)',
                    backgroundColor: active ? '#e7eff7' : '#fff',
                    boxShadow: active
                      ? '0 10px 24px rgba(21, 28, 34, 0.12)'
                      : 'none',
                  }}
                >
                  <Box
                    sx={{
                      width: 72,
                      height: 56,
                      borderRadius: 2,
                      background: value.preview,
                      border: '1px solid rgba(204, 214, 226, 0.82)',
                      display: 'grid',
                      placeItems: 'center',
                      color: active ? '#5f55f6' : '#4b5563',
                    }}
                  >
                    <Icon sx={{ fontSize: 26 }} />
                  </Box>

                  <Box sx={{ flex: 1 }}>
                    <Typography
                      sx={{ fontSize: 16, fontWeight: 800, color: '#151c22' }}
                    >
                      {value.label}
                    </Typography>
                    <Typography
                      sx={{ mt: 0.35, fontSize: 12, color: '#344256' }}
                    >
                      {value.description}
                    </Typography>
                    {value.licenseNote ? (
                      <Typography
                        sx={{ mt: 0.35, fontSize: 11, color: '#b45309' }}
                      >
                        {value.licenseNote}
                      </Typography>
                    ) : null}
                  </Box>

                  {active ? (
                    <CheckRoundedIcon sx={{ color: '#5f55f6' }} />
                  ) : null}
                </Box>
              </ButtonBase>
            );
          })}
      </Stack>

      <Typography
        sx={{ mt: 2.4, fontSize: 13, fontWeight: 800, color: '#151c22' }}
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
                    border: active
                      ? `1px solid ${value.color}55`
                      : '1px solid rgba(204, 214, 226, 0.92)',
                    backgroundColor: active ? `${value.color}12` : '#fff',
                    opacity: disabled ? 0.52 : 1,
                    boxShadow: active
                      ? '0 10px 24px rgba(21, 28, 34, 0.08)'
                      : 'none',
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
                    <Icon sx={{ fontSize: 20 }} />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{ fontSize: 16, fontWeight: 800, color: '#151c22' }}
                    >
                      {value.label}
                    </Typography>
                    <Typography
                      sx={{ mt: 0.35, fontSize: 12, color: '#344256' }}
                    >
                      {value.disabledReason ?? value.description}
                    </Typography>
                  </Box>

                  {active ? (
                    <CheckRoundedIcon sx={{ color: value.color }} />
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
  return (
    <>
      <Drawer
        anchor="bottom"
        open={controller.layerPanelOpen}
        onClose={controller.closeLayerPanel}
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
            bgcolor: 'rgba(225, 233, 241, 0.58)',
            backdropFilter: 'blur(10px)',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            boxShadow: '0 -16px 40px rgba(21, 28, 34, 0.18)',
            px: 2,
            pt: 1.25,
            pb: 3,
          },
        }}
      >
        <RescueMapLayerPanelContent controller={controller} mobile />
      </Drawer>

      <Drawer
        anchor="right"
        open={controller.layerPanelOpen}
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
            bgcolor: 'rgba(225, 233, 241, 0.58)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 16px 40px rgba(21, 28, 34, 0.18)',
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
