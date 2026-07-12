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

interface StationReportHistoryPanelProps {
  reports?: readonly StationReportRecord[];
  compact?: boolean;
}

const STATUS_TONE_STYLES = {
  success: { color: '#087443', bgcolor: '#E7F8EF', borderColor: '#B7E4C7' },
  warning: { color: '#954900', bgcolor: '#FFF7E6', borderColor: '#F3D19B' },
  error: { color: '#B3261E', bgcolor: '#FCEEEE', borderColor: '#F3B8B3' },
  neutral: { color: '#3F5161', bgcolor: '#F3F5F8', borderColor: '#D7DEE8' },
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
          border: '1px solid #D7DEE8',
          borderRadius: '24px',
          bgcolor: '#FFFFFF',
        }}
      >
        <Typography sx={{ color: '#667085', fontSize: 13, lineHeight: '20px' }}>
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
                bgcolor: '#FFFFFF',
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
                  color: '#17212B',
                  fontSize: 13,
                  lineHeight: '20px',
                  overflowWrap: 'anywhere',
                }}
              >
                {report.comment}
              </Typography>
              <Typography
                sx={{ color: '#667085', fontSize: 12, lineHeight: '16px' }}
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
