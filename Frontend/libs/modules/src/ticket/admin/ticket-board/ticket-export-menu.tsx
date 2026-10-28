'use client';

import { Menu, MenuItem } from '@mui/material';
import { useExportTickets } from '@rescue-frontend/data-access/admin';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { downloadBlob } from '../../../station/admin/station-management/model/import';
import { ToolbarButton } from '../../../station/admin/station-management/toolbar-button';
import { formatTicketTypeLabel } from '../../status';
import {
  TICKET_EXPORT_TYPES,
  ticketExportFilename,
  type TicketExportType,
} from './model/ticket-export';

type Format = 'csv' | 'xlsx';

const FORMATS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
];

/** 匯出: one item per task type and format. The export covers the viewer's scope, not the list filters. */
export function TicketExportMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const exportTickets = useExportTickets();

  const download = (taskType: TicketExportType, format: Format) =>
    exportTickets.mutate(
      { params: { query: { task_type: taskType, format } } },
      {
        onSuccess: (blob) => {
          downloadBlob(
            blob as Blob,
            ticketExportFilename(taskType, format, new Date()),
          );
          toast.success(`已匯出「${formatTicketTypeLabel(taskType)}」求助單`);
          setAnchor(null);
        },
      },
    );

  return (
    <>
      <ToolbarButton
        title="匯出求助單（不套用列表上的篩選）"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        disabled={exportTickets.isPending}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Download size={16} />
        {exportTickets.isPending ? '匯出中…' : '匯出'}
      </ToolbarButton>
      <Menu
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {TICKET_EXPORT_TYPES.flatMap((taskType) =>
          FORMATS.map((format) => (
            <MenuItem
              key={`${taskType}-${format.value}`}
              disabled={exportTickets.isPending}
              onClick={() => download(taskType, format.value)}
            >
              {formatTicketTypeLabel(taskType)}・{format.label}
            </MenuItem>
          )),
        )}
      </Menu>
    </>
  );
}
