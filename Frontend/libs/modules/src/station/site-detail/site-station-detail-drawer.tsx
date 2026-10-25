'use client';

import type { ReactNode } from 'react';

import { Clock, Crosshair, MapPin, Package, ShieldCheck } from 'lucide-react';

import { Box, IconButton, Stack, Typography } from '@mui/material';

import {
  Avatar,
  designTokens,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../../map/types';
import { SiteBadge } from '../../shell/site/site-badge';
import { StationDetailFooterAction } from '../admin/station-detail/station-detail-footer-action';
import type { StationDetailActionProps } from '../admin/station-detail/types';
import { getStationTypeIcon } from '../type-options';
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

function Tile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        p: `${spacing[3]}px`,
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.neutral.subtle,
        border: `1px solid ${color.border.default}`,
      }}
    >
      <Stack
        direction="row"
        sx={{
          mb: 0.5,
          gap: '6px',
          alignItems: 'center',
          color: color.fg.neutral.subtle,
        }}
      >
        {icon}
        <Typography sx={{ fontSize: displayTextSize[11], lineHeight: 1.4 }}>
          {label}
        </Typography>
      </Stack>
      <Typography
        sx={{
          fontSize: displayTextSize[14],
          fontWeight: 700,
          lineHeight: 1.3,
          color: color.fg.neutral.default,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * 前台的站點詳情（原型 `site-detail.jsx` 的 `StationDetail`，前台視覺對齊第 6 項＋第四區）。
 *
 * 順序照原型：標題下的類型 → 狀態、驗證、官方標籤 → 服務時間 → 位置說明 → 類型／服務時間兩格 → 官方站點卡
 * → 座標；字級全用前台的 `displayTextSize`。後台互助地圖開同一個站點，仍走 `station/admin/station-detail`。
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

      {/* 右邊留 56px 給關閉鈕，長標題才不會跑到 X 底下（原型 panelHead）。 */}
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
            icon={chip.official ? <ShieldCheck size={12} /> : undefined}
            sx={{ fontWeight: 700 }}
          >
            {chip.label}
          </SiteBadge>
        ))}
      </Stack>

      {/* 「現在能不能去」是這一頁最重要的一句話，所以放在最上面、獨立一塊（原型 :221-229）。 */}
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
        {/* 原型沒有物資狀況（ADR-333）。暫放服務時間正下方：知道能不能去之後，最想知道的是缺什麼。
            uiux 10-25 已問糖＋Carol，回了再調。 */}
        {detail.supply ? (
          <Box>
            <SectionLabel>物資狀況</SectionLabel>
            <Typography
              sx={{
                fontSize: displayTextSize[14],
                lineHeight: 1.6,
                color: color.fg.neutral.default,
                whiteSpace: 'pre-line',
                overflowWrap: 'anywhere',
              }}
            >
              {detail.supply.text}
            </Typography>
            {detail.supply.updated ? (
              <Typography
                sx={{
                  mt: 0.5,
                  fontSize: displayTextSize[12],
                  lineHeight: 1.5,
                  color: color.fg.neutral.subtle,
                }}
              >
                {detail.supply.updated}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        <InfoRow label="位置說明" icon={<MapPin size={16} />}>
          {detail.locationNote}
        </InfoRow>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: `${spacing[2]}px`,
          }}
        >
          <Tile
            icon={<Package size={14} />}
            label="站點類型"
            value={detail.tiles.type}
          />
          <Tile
            icon={<Clock size={14} />}
            label="服務時間"
            value={detail.tiles.hours}
          />
        </Box>

        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            gap: `${spacing[3]}px`,
            p: `${spacing[3]}px`,
            borderRadius: `${radius.md}px`,
            border: `1px solid ${color.border.default}`,
          }}
        >
          <Avatar
            name={detail.operator.official ? '官方' : '一般'}
            size={36}
            tone={detail.operator.official ? 'primary' : 'neutral'}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: displayTextSize[13],
                fontWeight: 700,
                lineHeight: 1.3,
                color: color.fg.neutral.default,
              }}
            >
              {detail.operator.name}
            </Typography>
            <Typography
              sx={{
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                color: color.fg.neutral.subtle,
              }}
            >
              {detail.operator.verification}
            </Typography>
          </Box>
        </Stack>

        <InfoRow label="座標" icon={<Crosshair size={16} />}>
          {detail.coordinates}
        </InfoRow>
      </Stack>

      <StationDetailFooterAction actions={[secondaryAction, editAction]} />
    </Box>
  );
}
