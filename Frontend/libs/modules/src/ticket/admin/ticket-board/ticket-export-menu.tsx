'use client';

import {
  Box,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import {
  useExportTickets,
  useTicketExportCounts,
} from '@rescue-frontend/data-access/admin';
import { Button, designTokens } from '@rescue-frontend/ui';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  ExportFormatChoice,
  exportOptionSx,
  exportPaperSx,
  ExportSectionLabel,
  type ExportFormat,
} from '../../../admin/shared/export-popover-parts';
import { downloadBlob } from '../../../admin/shared/model/bulk-import';
import { NEED_KIND_ICONS } from './need-kind-icons';
import { ticketExportFilename } from './model/ticket-export';
import { needTypeLabel, type NeedType } from './model/ticket-row';

const { color, focusRing, radius, typography } = designTokens;

/** The prototype's three kinds, in its order; 醫療 (not in the prototype) joins only once it has rows. */
const LISTED_TYPES: NeedType[] = ['rescue', 'hr', 'supply'];

/** 匯出: pick a need type and a format. The export covers the viewer's scope, not the list filters. */
export function TicketExportMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [taskType, setTaskType] = useState<NeedType>(LISTED_TYPES[0]);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const exportTickets = useExportTickets();
  // Counted only while the popover is open; a ticket write marks it stale with the lists.
  const counts = useTicketExportCounts({ enabled: Boolean(anchor) }).data;

  const types: NeedType[] =
    (counts?.medical ?? 0) > 0 ? [...LISTED_TYPES, 'medical'] : LISTED_TYPES;
  const countOf = (type: NeedType) =>
    counts === undefined ? null : (counts[type] ?? 0);
  const typeLabel = needTypeLabel(taskType);
  const count = countOf(taskType);

  const download = () =>
    exportTickets.mutate(
      { params: { query: { task_type: taskType, format } } },
      {
        onSuccess: (blob) => {
          downloadBlob(
            blob as Blob,
            ticketExportFilename(taskType, format, new Date()),
          );
          toast.success(`已匯出「${typeLabel}」需求`);
          setAnchor(null);
        },
      },
    );

  return (
    <>
      {/* The prototype's brand outline, as tall as the toolbar's search box. */}
      <Button
        variant="outline"
        title="匯出任務單（不套用列表上的篩選）"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        startIcon={<Download size={17} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          height: 42,
          minHeight: 42,
          px: '18px',
          borderRadius: `${radius.md}px`,
          ...(anchor && {
            outline: `${focusRing.width}px solid ${focusRing.color}`,
            outlineOffset: `${focusRing.offset}px`,
          }),
        }}
      >
        匯出
      </Button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: exportPaperSx } }}
      >
        <Box
          sx={{
            width: 340,
            maxWidth: '92vw',
            p: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <ExportSectionLabel>匯出哪一種需求</ExportSectionLabel>
          <RadioGroup
            aria-label="匯出哪一種需求"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as NeedType)}
            sx={{ gap: '8px' }}
          >
            {types.map((type) => {
              const KindIcon = NEED_KIND_ICONS[type];
              const typeCount = countOf(type);
              return (
                <FormControlLabel
                  key={type}
                  value={type}
                  control={<Radio size="small" />}
                  sx={[
                    exportOptionSx(taskType === type),
                    { '& .MuiFormControlLabel-label': { flex: 1 } },
                  ]}
                  label={
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <KindIcon size={17} color={color.fg.neutral.subtle} />
                      <Typography
                        sx={{
                          ...typography.body[300],
                          color: color.fg.neutral.default,
                          flex: 1,
                        }}
                      >
                        {needTypeLabel(type)}
                      </Typography>
                      <Typography
                        sx={{
                          ...typography.body[300],
                          color: color.fg.neutral.muted,
                        }}
                      >
                        {typeCount ?? '—'} 筆
                      </Typography>
                    </Box>
                  }
                />
              );
            })}
          </RadioGroup>

          <ExportFormatChoice value={format} onChange={setFormat} />

          <Typography
            sx={{
              ...typography.body[300],
              lineHeight: 1.7,
              color: color.fg.neutral.muted,
              '& strong': { color: color.fg.neutral.subtle },
            }}
          >
            匯出你權限範圍內<strong>全部</strong>的「{typeLabel}」需求，
            <strong>不套用列表上的篩選</strong>
            。一列＝一筆需求。聯絡資料依權限可能遮罩。這個檔案改完可以直接匯入：標題＋電話相同的會更新原本的單。
          </Typography>

          <Button
            fullWidth
            onClick={download}
            disabled={!count || exportTickets.isPending}
            startIcon={<Download size={17} />}
          >
            {exportTickets.isPending ? '匯出中…' : `下載 ${count ?? '—'} 筆`}
          </Button>
        </Box>
      </Popover>
    </>
  );
}
