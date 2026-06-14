'use client';

import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import { Box, ButtonBase, Typography } from '@mui/material';

import { Icons } from '@rescue-frontend/ui';
import {
  TicketListIconSlot,
  ticketListPalette,
  toPixelValue,
} from './ticket-list-primitives';
import type {
  TicketListRowItem,
  TicketPriority,
  TicketRowStatus,
  TicketTableProps,
  TicketVerificationStatus,
} from './types';

const AiAnalysisIcon = Icons.aiAnalysis;

const tableColumnWidths = [
  88, 112, 220, 132, 132, 200, 80, 130, 72, 128, 48,
] as const;

const tableGridTemplateColumns = tableColumnWidths
  .map((width) => `${width}px`)
  .join(' ');

const defaultRows: readonly TicketListRowItem[] = [
  {
    id: 'inc-4022',
    status: 'critical',
    code: '#INC-4022',
    title: '醫療物資運送',
    taskType: '醫療',
    disasterType: '醫療',
    disasterGlyph: '⚕️',
    location: '北橋街 124 號',
    priority: 'high',
    verification: 'unverified',
    aiFlagged: true,
    createdAt: '10月24日 14:42',
  },
  {
    id: 'inc-4021',
    status: 'inProgress',
    code: '#INC-4021',
    title: 'B 區醫療後送',
    taskType: '醫療',
    disasterType: '醫療',
    disasterGlyph: '⚕️',
    location: 'B 區，第 3 網格',
    priority: 'high',
    verification: 'aiVerified',
    aiFlagged: true,
    createdAt: '10月24日 14:15',
  },
  {
    id: 'inc-4020',
    status: 'pending',
    code: '#INC-4020',
    title: '9 號公路障礙清除',
    taskType: '後勤',
    disasterType: '交通',
    disasterGlyph: '🚧',
    location: '9 號公路 42 公里處',
    priority: 'medium',
    verification: 'unverified',
    createdAt: '10月24日 13:50',
  },
  {
    id: 'inc-4018',
    status: 'completed',
    code: '#INC-4018',
    title: 'C 點物資配送',
    taskType: '後勤',
    disasterType: '物資',
    disasterGlyph: '📦',
    location: 'C 點倉庫',
    priority: 'low',
    verification: 'humanVerified',
    createdAt: '10月24日 12:30',
  },
  {
    id: 'inc-4017',
    status: 'inProgress',
    code: '#INC-4017',
    title: '北岸防洪牆加固',
    taskType: '工務',
    disasterType: '水患',
    disasterGlyph: '🌊',
    location: '河北岸',
    priority: 'high',
    verification: 'disputed',
    aiFlagged: true,
    createdAt: '10月24日 11:20',
  },
  {
    id: 'inc-4016',
    status: 'pending',
    code: '#INC-4016',
    title: '榆樹街瓦礫清運申請',
    taskType: '清理',
    disasterType: '瓦礫',
    disasterGlyph: '🌪️',
    location: '榆樹街第 2 街廓',
    priority: 'low',
    verification: 'aiVerified',
    createdAt: '10月24日 10:05',
  },
  {
    id: 'inc-4014',
    status: 'inProgress',
    code: '#INC-4014',
    title: 'Alpha 營區飲水配送',
    taskType: '後勤',
    disasterType: '資源',
    disasterGlyph: '💧',
    location: 'Alpha 營區北側',
    priority: 'medium',
    verification: 'humanVerified',
    createdAt: '10月24日 08:45',
  },
  {
    id: 'inc-4013',
    status: 'inProgress',
    code: '#INC-4013',
    title: '通訊中繼修復',
    taskType: '通訊維運',
    disasterType: '通訊',
    disasterGlyph: '📡',
    location: '山頂站',
    priority: 'high',
    verification: 'unverified',
    createdAt: '10月24日 07:30',
  },
] as const;

function getStatusBadgeStyles(status: TicketRowStatus) {
  switch (status) {
    case 'critical':
      return {
        label: '嚴重',
        bgcolor: ticketListPalette.critical,
        color: '#FFFFFF',
      };
    case 'inProgress':
      return {
        label: '進行中',
        bgcolor: ticketListPalette.inProgress,
        color: '#FFFFFF',
      };
    case 'completed':
      return {
        label: '已完成',
        bgcolor: ticketListPalette.completed,
        color: '#FFFFFF',
      };
    default:
      return {
        label: '待處理',
        bgcolor: ticketListPalette.pendingSurface,
        color: ticketListPalette.bodyText,
      };
  }
}

function getPriorityColor(priority: TicketPriority) {
  return priority === 'high'
    ? ticketListPalette.warningText
    : ticketListPalette.bodyText;
}

function getPriorityLabel(priority: TicketPriority) {
  switch (priority) {
    case 'high':
      return '高';
    case 'medium':
      return '中';
    default:
      return '低';
  }
}

function getVerificationBadgeStyles(status: TicketVerificationStatus) {
  switch (status) {
    case 'unverified':
      return {
        label: '未驗證',
        border: `1px solid ${ticketListPalette.unverified}`,
        bgcolor: 'transparent',
        color: ticketListPalette.unverified,
        px: '9px',
        py: '3px',
      };
    case 'disputed':
      return {
        label: '有爭議',
        border: '1px solid transparent',
        bgcolor: ticketListPalette.disputedSurface,
        color: ticketListPalette.disputedText,
        px: '8px',
        py: '2px',
      };
    case 'humanVerified':
      return {
        label: '人工驗證',
        border: '1px solid transparent',
        bgcolor: ticketListPalette.verificationSurface,
        color: ticketListPalette.bodyText,
        px: '8px',
        py: '2px',
      };
    default:
      return {
        label: 'AI 驗證',
        border: '1px solid transparent',
        bgcolor: ticketListPalette.verificationSurface,
        color: ticketListPalette.bodyText,
        px: '8px',
        py: '2px',
      };
  }
}

function TableHeaderCell({
  label,
  align = 'left',
}: {
  label: string;
  align?: 'left' | 'center';
}) {
  return (
    <Box
      sx={{
        px: 0.5,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
      }}
    >
      <Typography
        sx={{
          color: ticketListPalette.bodyText,
          fontSize: 10,
          lineHeight: '12px',
          fontWeight: 600,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          textAlign: align,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function TextCell({
  value,
  color = ticketListPalette.bodyText,
  fontWeight = 400,
  textDecoration,
  monospace = false,
}: {
  value: string;
  color?: string;
  fontWeight?: number;
  textDecoration?: string;
  monospace?: boolean;
}) {
  return (
    <Typography
      sx={{
        color,
        fontSize: 14,
        lineHeight: '20px',
        fontWeight,
        fontFamily: monospace ? 'Liberation Mono, monospace' : 'inherit',
        textDecoration,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value}
    </Typography>
  );
}

function StatusBadge({ status }: { status: TicketRowStatus }) {
  const styles = getStatusBadgeStyles(status);

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1,
        py: '2px',
        borderRadius: '999px',
        bgcolor: styles.bgcolor,
      }}
    >
      <Typography
        sx={{
          color: styles.color,
          fontSize: 10,
          lineHeight: '20px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {styles.label}
      </Typography>
    </Box>
  );
}

function VerificationBadge({
  verification,
}: {
  verification: TicketVerificationStatus;
}) {
  const styles = getVerificationBadgeStyles(verification);

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: styles.px,
        py: styles.py,
        borderRadius: '999px',
        border: styles.border,
        bgcolor: styles.bgcolor,
      }}
    >
      <Typography
        sx={{
          color: styles.color,
          fontSize: 10,
          lineHeight: '20px',
          fontWeight: 400,
          whiteSpace: 'nowrap',
        }}
      >
        {styles.label}
      </Typography>
    </Box>
  );
}

function OverflowButton({ onClick }: { onClick?: () => void }) {
  return (
    <ButtonBase
      disableRipple
      aria-label="開啟工單列操作"
      onClick={onClick}
      sx={{
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ticketListPalette.bodyText,
      }}
    >
      <MoreHorizRoundedIcon sx={{ width: 16, height: 16, color: 'inherit' }} />
    </ButtonBase>
  );
}

export function TicketTable({
  rows = defaultRows,
  minWidth = 1342,
}: TicketTableProps) {
  return (
    <Box sx={{ minWidth: toPixelValue(minWidth), width: 'max-content' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: tableGridTemplateColumns,
          alignItems: 'stretch',
          bgcolor: '#FFFFFF',
          borderBottom: `1px solid ${ticketListPalette.frameBorder}`,
          boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
        }}
      >
        <TableHeaderCell label="狀態" />
        <TableHeaderCell label="編號" />
        <TableHeaderCell label="任務標題" />
        <TableHeaderCell label="任務類型" />
        <TableHeaderCell label="災害類型" />
        <TableHeaderCell label="位置" />
        <TableHeaderCell label="優先級" />
        <TableHeaderCell label="驗證狀態" />
        <TableHeaderCell label="AI 標記" align="center" />
        <TableHeaderCell label="建立時間" />
        <TableHeaderCell label="" align="center" />
      </Box>

      {rows.length === 0 ? (
        <Box
          sx={{
            minHeight: 160,
            display: 'grid',
            placeItems: 'center',
            borderBottom: `1px solid ${ticketListPalette.tableBorder}`,
            bgcolor: '#FFFFFF',
          }}
        >
          <Typography
            sx={{
              color: ticketListPalette.bodyText,
              fontSize: 14,
              lineHeight: '20px',
              fontWeight: 500,
            }}
          >
            沒有符合條件的任務
          </Typography>
        </Box>
      ) : (
        rows.map((row) => {
          const isCompleted = row.status === 'completed';

          return (
            <Box
              key={row.id}
              sx={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: tableGridTemplateColumns,
                alignItems: 'stretch',
                minHeight: 34,
                borderBottom: `1px solid ${ticketListPalette.tableBorder}`,
                bgcolor: '#FFFFFF',
                '&::before':
                  row.status === 'critical'
                    ? {
                        content: '""',
                        position: 'absolute',
                        inset: '0 auto 0 0',
                        width: '4px',
                        bgcolor: ticketListPalette.critical,
                        borderRadius: '0 999px 999px 0',
                      }
                    : undefined,
              }}
            >
              <Box
                sx={{ px: 0.5, py: 0.5, display: 'flex', alignItems: 'center' }}
              >
                <StatusBadge status={row.status} />
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: '6.5px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <TextCell value={row.code} monospace />
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <TextCell
                  value={row.title}
                  color={
                    isCompleted
                      ? ticketListPalette.bodyText
                      : ticketListPalette.strongText
                  }
                  fontWeight={500}
                  textDecoration={isCompleted ? 'line-through' : undefined}
                />
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <TextCell value={row.taskType} />
              </Box>

              <Box
                sx={{ px: 0.5, py: 0.5, display: 'flex', alignItems: 'center' }}
              >
                <TextCell
                  value={
                    row.disasterGlyph
                      ? `${row.disasterGlyph} ${row.disasterType}`
                      : row.disasterType
                  }
                  color={ticketListPalette.strongText}
                />
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <TextCell value={row.location} />
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Typography
                  sx={{
                    color: getPriorityColor(row.priority),
                    fontSize: 12,
                    lineHeight: '20px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {getPriorityLabel(row.priority)}
                </Typography>
              </Box>

              <Box
                sx={{ px: 0.5, py: 0.5, display: 'flex', alignItems: 'center' }}
              >
                <VerificationBadge verification={row.verification} />
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {row.aiFlagged ? (
                  <TicketListIconSlot
                    icon={<AiAnalysisIcon />}
                    width={15}
                    height={15}
                    color={ticketListPalette.warningText}
                  />
                ) : null}
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <TextCell value={row.createdAt} />
              </Box>

              <Box
                sx={{
                  px: 0.5,
                  py: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <OverflowButton onClick={row.onOverflowClick} />
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
