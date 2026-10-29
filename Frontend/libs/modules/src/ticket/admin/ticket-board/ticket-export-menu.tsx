'use client';

import { Menu, MenuItem } from '@mui/material';
import { useExportTickets } from '@rescue-frontend/data-access/admin';
import { Button } from '@rescue-frontend/ui';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { downloadBlob } from '../../../admin/shared/model/bulk-import';
import { ticketExportFilename } from './model/ticket-export';
import { NEED_TYPES, needTypeLabel, type NeedType } from './model/ticket-row';

type Format = 'csv' | 'xlsx';

const FORMATS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
];

/** 匯出: one item per task type and format. The export covers the viewer's scope, not the list filters. */
export function TicketExportMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const exportTickets = useExportTickets();

  const download = (taskType: NeedType, format: Format) =>
    exportTickets.mutate(
      { params: { query: { task_type: taskType, format } } },
      {
        onSuccess: (blob) => {
          downloadBlob(
            blob as Blob,
            ticketExportFilename(taskType, format, new Date()),
          );
          toast.success(`已匯出「${needTypeLabel(taskType)}」任務單`);
          setAnchor(null);
        },
        // The failure toasts globally; the menu closes so the toolbar isn't left with it open.
        onError: () => setAnchor(null),
      },
    );

  return (
    <>
      {/* The prototype's brand outline, as tall as the toolbar's search box. */}
      <Button
        variant="outline"
        title="匯出任務單（不套用列表上的篩選）"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        disabled={exportTickets.isPending}
        onClick={(event) => setAnchor(event.currentTarget)}
        startIcon={<Download size={16} />}
        sx={{ height: 42, minHeight: 42 }}
      >
        {exportTickets.isPending ? '匯出中…' : '匯出'}
      </Button>
      <Menu
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {NEED_TYPES.flatMap((taskType) =>
          FORMATS.map((format) => (
            <MenuItem
              key={`${taskType}-${format.value}`}
              disabled={exportTickets.isPending}
              onClick={() => download(taskType, format.value)}
            >
              {needTypeLabel(taskType)}・{format.label}
            </MenuItem>
          )),
        )}
      </Menu>
    </>
  );
}
