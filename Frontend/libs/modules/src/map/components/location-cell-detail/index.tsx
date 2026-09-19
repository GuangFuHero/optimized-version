'use client';

import HexagonOutlinedIcon from '@mui/icons-material/HexagonOutlined';
import { Box, ButtonBase, IconButton, Stack, Typography } from '@mui/material';

import {
  Badge,
  designTokens,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';

import { getTicketStatusTone } from '../../../ticket/status';
import { describeLocationCellSpan } from '../../location-cells';
import type { RescueMapLocationCell } from '../../types';
import { LocationPrivacyNotice } from '../location-privacy-notice';

const { color, radius, spacing } = designTokens;
const CloseIcon = Icons.close;

interface LocationCellDetailProps {
  cell: RescueMapLocationCell;
  isAuthenticated: boolean;
  onClose: () => void;
  onSelectMember: (markerId: string) => void;
}

/**
 * 訪客的「概略區塊」面板：這一格裡有 N 筆求助（原型 `site-detail.jsx` 的 `CellDetail`）。
 *
 * 存在的理由是 HC 2026-07-03 點出的副作用：遮罩後同一格的單全落在格子中心，圖釘會整疊壓在
 * 一起。所以地圖畫格子，點開在這裡列出內容；點其中一筆，開那張單的詳情。這裡列出的每一筆都
 * 已經是後端遮過的 —— 沒有精確座標、沒有原始描述。
 */
export function LocationCellDetail({
  cell,
  isAuthenticated,
  onClose,
  onSelectMember,
}: LocationCellDetailProps) {
  return (
    <Box
      component="aside"
      aria-label="概略區塊詳情"
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

      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: `${spacing[3]}px`,
          px: `${spacing[6]}px`,
          pt: `${spacing[4]}px`,
          pb: `${spacing[4]}px`,
          pr: 8,
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
            bgcolor: color.bg.primary.subtle,
            color: color.brand.primary.subtle,
          }}
        >
          <HexagonOutlinedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: displayTextSize[18],
              fontWeight: 700,
              lineHeight: 1.35,
              color: color.fg.neutral.default,
            }}
          >
            這個區塊有 {cell.members.length} 筆求助
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontSize: displayTextSize[12],
              lineHeight: 1.5,
              color: color.fg.neutral.subtle,
            }}
          >
            概略區塊 · {describeLocationCellSpan(cell.cell)}範圍
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ px: `${spacing[6]}px` }}>
        <LocationPrivacyNotice isAuthenticated={isAuthenticated}>
          為保護求助者，位置只顯示到這個區塊，<b>看不出是哪一戶</b>。
        </LocationPrivacyNotice>
      </Box>

      <Stack
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          gap: `${spacing[2]}px`,
          px: `${spacing[6]}px`,
          pt: `${spacing[4]}px`,
          pb: `${spacing[6]}px`,
        }}
      >
        {cell.members.map((member) => (
          <ButtonBase
            key={member.id}
            onClick={() => onSelectMember(member.id)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 0.75,
              p: `${spacing[3]}px`,
              textAlign: 'left',
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor: color.bg.neutral.default,
            }}
          >
            <Stack
              direction="row"
              sx={{ gap: `${spacing[2]}px`, flexWrap: 'wrap' }}
            >
              <Badge
                tone={getTicketStatusTone(member.ticketMeta?.status)}
                variant="subtle"
              >
                {member.label}
              </Badge>
              {member.ticketMeta?.priority === 'high' ? (
                <Badge tone="danger" variant="subtle">
                  高優先
                </Badge>
              ) : null}
            </Stack>
            <Typography
              sx={{
                fontSize: displayTextSize[14],
                lineHeight: 1.5,
                color: color.fg.neutral.default,
              }}
            >
              {member.title}
            </Typography>
            <Typography
              sx={{
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                color: color.fg.neutral.subtle,
              }}
            >
              {member.subtitle}
            </Typography>
          </ButtonBase>
        ))}
      </Stack>
    </Box>
  );
}
