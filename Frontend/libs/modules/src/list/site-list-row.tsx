'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import HexagonOutlinedIcon from '@mui/icons-material/HexagonOutlined';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import ShieldRoundedIcon from '@mui/icons-material/Shield';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { Badge, designTokens, displayTextSize, RowAction, type BadgeTone } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../map/types';
import {
  createStationReportSummary,
  type StationReportRecord,
} from '../station/report';
import { getStationTypeIcon } from '../station/type-options';
import { getTicketStatusTone } from '../ticket/status';
import {
  createTaskMatchSummary,
  taskMatchStatusLabels,
  taskMatchStatusTones,
  type TaskMatchState,
} from '../ticket/task-match';

const { color, radius, shadow, spacing, motion } = designTokens;

interface SiteListRowProps {
  marker: RescueMapMarkerItem;
  active: boolean;
  latestReport?: StationReportRecord;
  taskMatchState?: TaskMatchState;
  isAuthenticated?: boolean;
  canDeleteMatchSheet?: boolean;
  onSelect: () => void;
  onShare?: () => void;
  onSuggestUpdate?: () => void;
  onClaimTask?: () => void;
  onDeleteMatchSheet?: () => void;
}

/**
 * Fill behind the task-match summary. Only the surface is tinted — the text stays neutral, as in
 * the design prototype, so the strip reads as one status rather than two competing signals.
 */
const TASK_STATUS_BACKGROUND: Record<BadgeTone, string> = {
  neutral: color.bg.neutral.sunken,
  primary: color.bg.primary.subtle,
  secondary: color.bg.secondary.subtle,
  success: color.bg.success.subtle,
  warning: color.bg.warning.subtle,
  danger: color.bg.danger.subtle,
  info: color.bg.info.subtle,
};

const ICON_SIZE = 18;
const ACTION_ICON = { fontSize: 14 } as const;

/**
 * 列表單列：顯示標題、分類標籤與摘要，選取時切換選中樣式。
 *
 * Mirrors `SiteListRow` in `Design/前台/js/site/site-list.jsx`: a 36px type glyph leads the row, the
 * title carries an "官方" chip for verified stations, and the status badge on the right is solid for
 * tickets (the thing that needs action) and subtle for stations (ambient information).
 */
export function SiteListRow({
  marker,
  active,
  latestReport,
  taskMatchState,
  isAuthenticated = false,
  canDeleteMatchSheet = false,
  onSelect,
  onShare,
  onSuggestUpdate,
  onClaimTask,
  onDeleteMatchSheet,
}: SiteListRowProps) {
  const isStation = marker.detailType === 'station';
  const TypeIcon = isStation
    ? getStationTypeIcon(marker.stationMeta?.type)
    : AssignmentRoundedIcon;
  const taskTone = taskMatchState
    ? taskMatchStatusTones[taskMatchState.status]
    : null;
  const taskClaimDisabled =
    !isAuthenticated ||
    taskMatchState?.status === 'matched' ||
    taskMatchState?.status === 'deleted';
  const taskDeleteDisabled =
    !canDeleteMatchSheet || taskMatchState?.status === 'deleted';

  const claimLabel =
    taskMatchState?.status === 'matched'
      ? '媒合完成'
      : taskMatchState?.status === 'deleted'
        ? '已刪除'
        : !isAuthenticated
          ? '登入後接任務'
          : '接任務';

  return (
    <Box
      sx={{
        width: '100%',
        p: `${spacing[4]}px`,
        borderRadius: `${radius.lg}px`,
        border: '1px solid',
        borderColor: active
          ? color.brand.secondary.default
          : color.border.default,
        bgcolor: active ? color.bg.secondary.subtle : color.bg.neutral.default,
        boxShadow: active ? shadow.md : shadow.sm,
        transition: `background ${motion.transition.fast}, border-color ${motion.transition.fast}, box-shadow ${motion.transition.fast}`,
      }}
    >
      <ButtonBase
        disableRipple
        onClick={onSelect}
        aria-pressed={active}
        sx={{ width: '100%', display: 'block', textAlign: 'left' }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: 'flex-start', gap: `${spacing[3]}px` }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: `${radius.full}px`,
              display: 'grid',
              placeItems: 'center',
              bgcolor: isStation
                ? color.brand.secondary.default
                : color.bg.primary.default,
              color: isStation ? color.fg.onSecondary : color.fg.onPrimary,
            }}
          >
            <TypeIcon sx={{ fontSize: ICON_SIZE }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              sx={{
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: `${spacing[2]}px`,
              }}
            >
              <Stack
                direction="row"
                sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}
              >
                <Typography
                  sx={{
                    fontSize: displayTextSize[15],
                    fontWeight: 700,
                    lineHeight: 1.4,
                    color: color.fg.neutral.default,
                  }}
                  noWrap
                >
                  {marker.title}
                </Typography>
                {/* 官方認定：只有官方站點掛 chip，非官方不掛。 */}
                {isStation && marker.stationMeta?.isOfficial ? (
                  <Badge tone="secondary" variant="subtle">
                    <ShieldRoundedIcon sx={{ fontSize: 12 }} />
                    官方
                  </Badge>
                ) : null}
                {/* The list shows no coordinates, but its map link and its detail do: say up
                    front that this ticket's place is a region (ADR-281). */}
                {marker.locationCell ? (
                  <Badge tone="neutral" variant="subtle">
                    <HexagonOutlinedIcon sx={{ fontSize: 12 }} />
                    概略位置
                  </Badge>
                ) : null}
              </Stack>
              <Badge
                tone={
                  isStation
                    ? 'secondary'
                    : getTicketStatusTone(marker.ticketMeta?.status)
                }
                variant={isStation ? 'subtle' : 'solid'}
              >
                {marker.label}
              </Badge>
            </Stack>

            <Typography
              sx={{
                mt: 0.5,
                fontSize: displayTextSize[13],
                lineHeight: 1.6,
                color: color.fg.neutral.subtle,
              }}
              noWrap
            >
              {marker.subtitle}
            </Typography>
          </Box>
        </Stack>

        {latestReport ? (
          <Box
            sx={{
              mt: `${spacing[3]}px`,
              px: `${spacing[3]}px`,
              py: '6px',
              borderRadius: `${radius.sm}px`,
              // One colour regardless of the report's severity. We had this branching on tone, and
              // the designer ruled against it on 2026-09-17: the list shows the fields that exist,
              // it does not add a signal the data model has no concept of. Severity belongs in the
              // summary text, which `createStationReportSummary` already carries.
              bgcolor: color.bg.warning.subtle,
            }}
          >
            <Typography
              sx={{
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                color: color.fg.neutral.default,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              最新建議：{createStationReportSummary(latestReport)}
            </Typography>
          </Box>
        ) : null}

        {taskMatchState && taskTone ? (
          <Box
            sx={{
              mt: `${spacing[3]}px`,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: `${spacing[2]}px`,
              px: `${spacing[3]}px`,
              py: '6px',
              borderRadius: `${radius.sm}px`,
              bgcolor: TASK_STATUS_BACKGROUND[taskTone],
            }}
          >
            <Typography
              sx={{
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                color: color.fg.neutral.default,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              任務：{createTaskMatchSummary(taskMatchState)}
            </Typography>
            <Typography
              sx={{
                fontSize: displayTextSize[11],
                lineHeight: 1.4,
                fontWeight: 700,
                color: color.fg.neutral.subtle,
                whiteSpace: 'nowrap',
              }}
            >
              {taskMatchStatusLabels[taskMatchState.status]}
            </Typography>
          </Box>
        ) : null}
      </ButtonBase>

      {onShare || onSuggestUpdate || taskMatchState ? (
        <Stack
          direction="row"
          sx={{
            mt: `${spacing[3]}px`,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: `${spacing[2]}px`,
          }}
        >
          {onShare ? (
            <RowAction
              icon={<ShareRoundedIcon sx={ACTION_ICON} />}
              label="分享"
              onClick={onShare}
              aria-label={`分享 ${marker.title}`}
            />
          ) : null}

          {/* 回報要登入 —— /list 與 /map 要一致。 */}
          {onSuggestUpdate ? (
            <RowAction
              icon={
                isAuthenticated ? (
                  <EditNoteRoundedIcon sx={ACTION_ICON} />
                ) : (
                  <LockRoundedIcon sx={ACTION_ICON} />
                )
              }
              label={isAuthenticated ? '修改建議' : '登入後可建議'}
              disabled={!isAuthenticated}
              onClick={onSuggestUpdate}
              aria-label={`建議修改 ${marker.title}`}
            />
          ) : null}

          {taskMatchState && onClaimTask ? (
            <RowAction
              icon={
                isAuthenticated ? (
                  <VolunteerActivismRoundedIcon sx={ACTION_ICON} />
                ) : (
                  <LockRoundedIcon sx={ACTION_ICON} />
                )
              }
              label={claimLabel}
              disabled={taskClaimDisabled}
              onClick={onClaimTask}
              aria-label={`接任務 ${marker.title}`}
            />
          ) : null}

          {taskMatchState && onDeleteMatchSheet && canDeleteMatchSheet ? (
            <RowAction
              icon={<DeleteOutlineRoundedIcon sx={ACTION_ICON} />}
              label="刪除媒合單"
              tone="danger"
              disabled={taskDeleteDisabled}
              onClick={onDeleteMatchSheet}
              aria-label={`刪除媒合單 ${marker.title}`}
            />
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}
