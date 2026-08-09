'use client';

import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import type { RescueMapMarkerItem } from '../map/types';
import {
  createStationReportSummary,
  getStationStatusOption,
  type StationReportRecord,
} from '../station/report';
import {
  createTaskMatchSummary,
  taskMatchStatusLabels,
  taskMatchStatusTones,
  type TaskMatchState,
} from '../ticket/task-match';

const VARIANT_TONE: Record<RescueMapMarkerItem['variant'], string> = {
  'urgent-ticket': '#b3261e',
  'in-progress': '#954900',
  'resource-station': '#006685',
  'pinned-location': '#3f5161',
};

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

const TASK_STATUS_TONE = {
  neutral: { background: '#F1F4F7', color: '#43505C' },
  warning: { background: '#FFF4CF', color: '#7A4B00' },
  success: { background: '#DDF4EA', color: '#165C43' },
  danger: { background: '#FFF0EB', color: '#9A3D2E' },
} as const;

/**
 * 列表單列：顯示標題、分類標籤與摘要，選取時切換選中樣式。
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
  const latestStatusOption = latestReport
    ? getStationStatusOption(latestReport.suggestedStatus)
    : null;
  const taskStatusTone = taskMatchState
    ? TASK_STATUS_TONE[taskMatchStatusTones[taskMatchState.status]]
    : null;
  const taskClaimDisabled =
    !isAuthenticated ||
    taskMatchState?.status === 'matched' ||
    taskMatchState?.status === 'deleted';
  const taskDeleteDisabled =
    !canDeleteMatchSheet || taskMatchState?.status === 'deleted';

  return (
    <Box
      sx={{
        width: '100%',
        px: 2,
        py: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: active ? '#006685' : '#e3e8ee',
        bgcolor: active ? 'rgba(0, 102, 133, 0.08)' : '#fff',
        transition: 'background-color 120ms ease, border-color 120ms ease',
      }}
    >
      <ButtonBase
        disableRipple
        onClick={onSelect}
        aria-pressed={active}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          textAlign: 'left',
        }}
      >
        <Stack spacing={0.75} sx={{ width: '100%' }}>
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography
              sx={{ fontSize: 15, fontWeight: 700, color: '#151c22' }}
              noWrap
            >
              {marker.title}
            </Typography>
            <Box
              sx={{
                flexShrink: 0,
                px: 1,
                py: '2px',
                borderRadius: 999,
                bgcolor: VARIANT_TONE[marker.variant],
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: '16px',
                whiteSpace: 'nowrap',
              }}
            >
              {marker.label}
            </Box>
          </Stack>
          <Typography sx={{ fontSize: 13, color: '#564337' }} noWrap>
            {marker.subtitle}
          </Typography>
          {latestReport ? (
            <Box
              sx={{
                display: 'inline-flex',
                width: '100%',
                minWidth: 0,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                bgcolor:
                  latestStatusOption?.tone === 'error'
                    ? '#FCEEEE'
                    : latestStatusOption?.tone === 'warning'
                      ? '#FFF7E6'
                      : '#F3F5F8',
              }}
            >
              <Typography
                sx={{
                  color: '#17212B',
                  fontSize: 12,
                  lineHeight: '18px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                最新建議：{createStationReportSummary(latestReport)}
              </Typography>
            </Box>
          ) : null}
          {taskMatchState && taskStatusTone ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 1,
                width: '100%',
                minWidth: 0,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                bgcolor: taskStatusTone.background,
              }}
            >
              <Typography
                sx={{
                  color: taskStatusTone.color,
                  fontSize: 12,
                  lineHeight: '18px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                任務：{createTaskMatchSummary(taskMatchState)}
              </Typography>
              <Typography
                sx={{
                  color: taskStatusTone.color,
                  fontSize: 11,
                  lineHeight: '16px',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                {taskMatchStatusLabels[taskMatchState.status]}
              </Typography>
            </Box>
          ) : null}
        </Stack>
      </ButtonBase>

      {onShare || onSuggestUpdate || taskMatchState ? (
        <Stack
          direction="row"
          sx={{
            mt: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
          }}
        >
          {onShare ? (
            <ButtonBase
              disableRipple
              onClick={onShare}
              aria-label={`分享 ${marker.title}`}
              sx={{
                minHeight: 30,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                borderRadius: '999px',
                border: '1px solid #D7DEE8',
                color: '#245C8C',
                bgcolor: '#FFFFFF',
                '&:hover': { bgcolor: '#F6FAFF' },
              }}
            >
              <ShareRoundedIcon sx={{ fontSize: 16 }} />
              <Typography
                sx={{ color: 'inherit', fontSize: 12, fontWeight: 800 }}
              >
                分享
              </Typography>
            </ButtonBase>
          ) : null}

          {onSuggestUpdate ? (
            <ButtonBase
              disableRipple
              onClick={onSuggestUpdate}
              aria-label={`建議修改 ${marker.title}`}
              sx={{
                minHeight: 30,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.5,
                borderRadius: '999px',
                border: '1px solid #D7DEE8',
                color: '#245C8C',
                bgcolor: '#FFFFFF',
                '&:hover': { bgcolor: '#F6FAFF' },
              }}
            >
              <EditNoteRoundedIcon sx={{ fontSize: 16 }} />
              <Typography
                sx={{ color: 'inherit', fontSize: 12, fontWeight: 800 }}
              >
                建議修改
              </Typography>
            </ButtonBase>
          ) : null}

          {taskMatchState && onClaimTask ? (
            <ButtonBase
              disableRipple
              disabled={taskClaimDisabled}
              onClick={onClaimTask}
              aria-label={`接任務 ${marker.title}`}
              sx={{
                minHeight: 30,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                borderRadius: '999px',
                border: '1px solid #B8CAD8',
                color: taskClaimDisabled ? '#8B97A3' : '#1F5C7A',
                bgcolor: taskClaimDisabled ? '#F1F4F7' : '#FFFFFF',
                '&:hover': {
                  bgcolor: taskClaimDisabled ? '#F1F4F7' : '#F4FAFD',
                },
              }}
            >
              <VolunteerActivismRoundedIcon sx={{ fontSize: 16 }} />
              <Typography
                sx={{ color: 'inherit', fontSize: 12, fontWeight: 800 }}
              >
                {taskMatchState.status === 'matched'
                  ? '媒合完成'
                  : taskMatchState.status === 'deleted'
                    ? '已刪除'
                    : !isAuthenticated
                      ? '登入後接任務'
                    : '接任務'}
              </Typography>
            </ButtonBase>
          ) : null}

          {taskMatchState && onDeleteMatchSheet && canDeleteMatchSheet ? (
            <ButtonBase
              disableRipple
              disabled={taskDeleteDisabled}
              onClick={onDeleteMatchSheet}
              aria-label={`刪除媒合單 ${marker.title}`}
              sx={{
                minHeight: 30,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                borderRadius: '999px',
                border: '1px solid #E3B5AA',
                color: taskDeleteDisabled ? '#A3AAB2' : '#9B3C2D',
                bgcolor: taskDeleteDisabled ? '#F4F6F8' : '#FFFFFF',
                '&:hover': {
                  bgcolor: taskDeleteDisabled ? '#F4F6F8' : '#FFF5F1',
                },
              }}
            >
              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
              <Typography
                sx={{ color: 'inherit', fontSize: 12, fontWeight: 800 }}
              >
                刪除媒合單
              </Typography>
            </ButtonBase>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}
