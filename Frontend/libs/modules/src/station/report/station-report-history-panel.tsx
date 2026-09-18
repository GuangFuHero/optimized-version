'use client';

import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { Box, Stack, Typography } from '@mui/material';

import {
  formatStationReportDate,
  getStationStatusOption,
  type StationReportRecord,
} from './model';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, primitives, radius } = designTokens;

interface StationReportHistoryPanelProps {
  reports?: readonly StationReportRecord[];
  compact?: boolean;
}

/** Text / fill / border triples, one per status tone, all from the design system's status set. */
const STATUS_TONE_STYLES = {
  success: {
    color: color.fg.success,
    bgcolor: color.bg.success.subtle,
    borderColor: primitives.color.green[500],
  },
  warning: {
    color: color.fg.warning,
    bgcolor: color.bg.warning.subtle,
    borderColor: primitives.color.amber[500],
  },
  error: {
    color: color.fg.danger,
    bgcolor: color.bg.danger.subtle,
    borderColor: primitives.color.red[500],
  },
  neutral: {
    color: color.fg.neutral.subtle,
    bgcolor: color.bg.neutral.sunken,
    borderColor: color.border.default,
  },
} as const;

function getStatusIcon(tone: keyof typeof STATUS_TONE_STYLES) {
  switch (tone) {
    case 'success':
      return TaskAltRoundedIcon;
    case 'warning':
      return ReportProblemRoundedIcon;
    case 'error':
      return ErrorOutlineRoundedIcon;
    case 'neutral':
      return InfoOutlinedIcon;
  }
}

export function StationReportHistoryPanel({
  reports = [],
  compact = false,
}: StationReportHistoryPanelProps) {
  if (reports.length === 0) {
    return (
      <Box
        sx={{
          p: compact ? 1.5 : 2.5,
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.lg}px`,
          bgcolor: color.bg.neutral.default,
        }}
      >
        <Typography sx={{ color: color.fg.neutral.muted, fontSize: displayTextSize[13], lineHeight: '20px' }}>
          尚無現場評論
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={compact ? 1 : 1.25}>
      {reports.map((report) => {
        const statusOption = getStationStatusOption(report.suggestedStatus);
        const toneStyle = STATUS_TONE_STYLES[statusOption.tone];
        const StatusIcon = getStatusIcon(statusOption.tone);

        return (
          <Box
            key={report.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: '32px minmax(0, 1fr)',
              gap: 1.5,
              p: compact ? 1.25 : 1.75,
              border: `1px solid ${toneStyle.borderColor}`,
              borderRadius: '24px',
              bgcolor: toneStyle.bgcolor,
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: color.bg.neutral.default,
                color: toneStyle.color,
              }}
            >
              <StatusIcon sx={{ fontSize: 18 }} />
            </Box>
            <Stack spacing={0.4} sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  color: toneStyle.color,
                  fontSize: compact ? 13 : 14,
                  lineHeight: '20px',
                  fontWeight: 800,
                }}
              >
                {report.suggestedStatusLabel}
              </Typography>
              <Typography
                sx={{
                  color: color.fg.neutral.default,
                  fontSize: displayTextSize[13],
                  lineHeight: '20px',
                  overflowWrap: 'anywhere',
                }}
              >
                {report.comment}
              </Typography>
              <Typography
                sx={{ color: color.fg.neutral.muted, fontSize: displayTextSize[12], lineHeight: '16px' }}
              >
                {report.reporterName} ·{' '}
                {formatStationReportDate(report.submittedAt)}
              </Typography>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
