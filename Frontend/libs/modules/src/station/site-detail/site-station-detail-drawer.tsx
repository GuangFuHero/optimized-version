'use client';

import type { ReactNode } from 'react';

import {
  Clock,
  Crosshair,
  MapPin,
  PackageSearch,
  ShieldCheck,
} from 'lucide-react';

import { Box, IconButton, Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize, Icons } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../../map/types';
import { SiteBadge } from '../../shell/site/site-badge';
import { StationDetailFooterAction } from '../admin/station-detail/station-detail-footer-action';
import type { StationDetailActionProps } from '../admin/station-detail/types';
import { getStationTypeIcon } from '../station-type-icon';
import { describeSiteStation } from './site-station-detail';

const { color, radius, spacing } = designTokens;
const CloseIcon = Icons.close;

interface SiteStationDetailDrawerProps {
  marker: RescueMapMarkerItem;
  onClose: () => void;
  editAction?: StationDetailActionProps;
  secondaryAction?: StationDetailActionProps;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        mb: '6px',
        fontSize: displayTextSize[11],
        fontWeight: 700,
        lineHeight: 1.4,
        letterSpacing: '.08em',
        color: color.fg.neutral.muted,
      }}
    >
      {children}
    </Typography>
  );
}

function InfoRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      <SectionLabel>{label}</SectionLabel>
      <Stack
        direction="row"
        sx={{ gap: `${spacing[2]}px`, alignItems: 'flex-start' }}
      >
        <Box sx={{ mt: '3px', display: 'flex', color: color.fg.neutral.muted }}>
          {icon}
        </Box>
        <Typography
          sx={{
            minWidth: 0,
            fontSize: displayTextSize[14],
            lineHeight: 1.6,
            color: color.fg.neutral.default,
            overflowWrap: 'anywhere',
          }}
        >
          {children}
        </Typography>
      </Stack>
    </Box>
  );
}

/**
 * 前台的站點詳情。
 *
 * 順序：標題下的類型 → 營業、官方、臨時標籤 → 服務時間 → 目前缺少 → 位置說明 → 座標，先回答現在能不能去，
 * 再講去了缺什麼、在哪裡；字級全用前台的 `displayTextSize`。沒有驗證標籤和「官方站點／一般站點」卡：後端還沒有
 * 寫入驗證狀態的地方，每個站點都會寫一樣的話。也沒有類型／服務時間兩格：跟標題下的類型、上方的服務時間重複。
 * 後台互助地圖開同一個站點，仍走 `station/admin/station-detail`。
 */
export function SiteStationDetailDrawer({
  marker,
  onClose,
  editAction,
  secondaryAction,
}: SiteStationDetailDrawerProps) {
  const detail = describeSiteStation(marker);
  const TypeIcon = getStationTypeIcon(marker.stationMeta?.type);

  return (
    <Box
      component="aside"
      aria-label="站點詳情"
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: color.bg.neutral.default,
        borderLeft: `1px solid ${color.border.default}`,
        overflow: 'hidden',
      }}
    >
      <IconButton
        aria-label="關閉詳情"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 44,
          height: 44,
          color: color.fg.neutral.subtle,
        }}
      >
        <CloseIcon />
      </IconButton>

      {/* 右邊留 56px 給關閉鈕，長標題才不會跑到 X 底下。 */}
      <Stack
        direction="row"
        sx={{
          alignItems: 'flex-start',
          gap: `${spacing[3]}px`,
          px: `${spacing[6]}px`,
          py: `${spacing[4]}px`,
          pr: 7,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.secondary.subtle,
            color: color.brand.secondary.subtle,
          }}
        >
          <TypeIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h2"
            sx={{
              fontSize: displayTextSize[18],
              fontWeight: 700,
              lineHeight: 1.35,
              color: color.fg.neutral.default,
              overflowWrap: 'anywhere',
            }}
          >
            {detail.title}
          </Typography>
          <Stack
            direction="row"
            sx={{ mt: 0.5, gap: '6px', alignItems: 'center' }}
          >
            <Box sx={{ display: 'flex', color: color.fg.neutral.muted }}>
              <MapPin size={14} />
            </Box>
            <Typography
              sx={{
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                color: color.fg.neutral.subtle,
              }}
            >
              {detail.typeLabel}
            </Typography>
          </Stack>
        </Box>
      </Stack>

      <Stack
        direction="row"
        sx={{ px: `${spacing[6]}px`, gap: `${spacing[2]}px`, flexWrap: 'wrap' }}
      >
        {detail.chips.map((chip) => (
          <SiteBadge
            key={chip.label}
            tone={chip.tone}
            variant={chip.variant}
            icon={chip.official ? <ShieldCheck size="1em" /> : undefined}
            sx={{ fontWeight: 700 }}
          >
            {chip.label}
          </SiteBadge>
        ))}
      </Stack>

      {/* 「現在能不能去」是這一頁最重要的一句話，所以緊接在標籤下、獨立一塊。 */}
      <Stack
        direction="row"
        sx={{
          mx: `${spacing[6]}px`,
          mt: `${spacing[3]}px`,
          p: `${spacing[3]}px`,
          gap: `${spacing[2]}px`,
          borderRadius: `${radius.md}px`,
          bgcolor: color.bg.neutral.subtle,
          border: `1px solid ${color.border.default}`,
        }}
      >
        <Box sx={{ mt: '2px', display: 'flex', color: color.fg.neutral.muted }}>
          <Clock size={16} />
        </Box>
        <Typography
          sx={{
            fontSize: displayTextSize[13],
            lineHeight: 1.5,
            color: color.fg.neutral.subtle,
          }}
        >
          {detail.hoursLine}
        </Typography>
      </Stack>

      <Stack
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          gap: `${spacing[4]}px`,
          px: `${spacing[6]}px`,
          pt: `${spacing[4]}px`,
          pb: `${spacing[6]}px`,
        }}
      >
        {/* 目前缺少（`supply_status`）是詳情第一塊：知道能不能去之後，最想知道的是缺什麼。
            沒填整塊不顯示：衛浴、廁所這類站點沒填是常態。 */}
        {detail.supply ? (
          <Box
            sx={{
              p: `${spacing[3]}px`,
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor: color.bg.neutral.default,
            }}
          >
            <Stack
              direction="row"
              sx={{
                mb: `${spacing[1]}px`,
                gap: `${spacing[2]}px`,
                alignItems: 'center',
              }}
            >
              <Box sx={{ display: 'flex', color: color.fg.neutral.muted }}>
                <PackageSearch size={16} />
              </Box>
              <Typography
                sx={{
                  fontSize: displayTextSize[12],
                  fontWeight: 700,
                  lineHeight: 1.4,
                  color: color.fg.neutral.subtle,
                }}
              >
                目前缺少
              </Typography>
              {detail.supply.updated ? (
                <Typography
                  sx={{
                    ml: 'auto',
                    flexShrink: 0,
                    fontSize: displayTextSize[12],
                    lineHeight: 1.4,
                    color: color.fg.neutral.muted,
                  }}
                >
                  {detail.supply.updated}
                </Typography>
              ) : null}
            </Stack>
            <Typography
              sx={{
                fontSize: displayTextSize[14],
                lineHeight: 1.6,
                color: color.fg.neutral.default,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {detail.supply.text}
            </Typography>
          </Box>
        ) : null}

        <InfoRow label="位置說明" icon={<MapPin size={16} />}>
          {detail.locationNote}
        </InfoRow>

        <InfoRow label="座標" icon={<Crosshair size={16} />}>
          {detail.coordinates}
        </InfoRow>
      </Stack>

      <StationDetailFooterAction actions={[secondaryAction, editAction]} />
    </Box>
  );
}
