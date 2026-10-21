'use client';

import { Box, Tab, Tabs } from '@mui/material';
import { useStation } from '@rescue-frontend/data-access/admin';
import { Badge, Button, Callout, Sheet } from '@rescue-frontend/ui';
import { PencilLine, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import type { StationCapabilities } from './hooks/use-station-capabilities';
import { StationHistoryPanel } from './station-history-panel';
import { StationInfoPanel } from './station-info-panel';
import { StatusBadge } from './station-cells';

export type StationDrawerState =
  | { mode: 'view' | 'edit'; uuid: string }
  | { mode: 'new'; position?: [number, number] };

interface StationDrawerProps {
  state: StationDrawerState | null;
  caps: StationCapabilities;
  now: Date;
  onClose: () => void;
  onEdit: (uuid: string) => void;
  onDelete?: (uuid: string, name: string) => void;
  /** The create/edit form; rendered for the new and edit modes. */
  renderForm?: (state: StationDrawerState) => ReactNode;
}

export function StationDrawer({
  state,
  caps,
  now,
  onClose,
  onEdit,
  onDelete,
  renderForm,
}: StationDrawerProps) {
  const uuid = state && state.mode !== 'new' ? state.uuid : '';
  const station = useStation({ uuid }, { enabled: Boolean(uuid) });
  const [tab, setTab] = useState<'info' | 'history'>('info');

  useEffect(() => setTab('info'), [uuid]);

  if (!state) return null;

  if (state.mode !== 'view') {
    return (
      <Sheet
        open
        onClose={onClose}
        width={540}
        title={state.mode === 'new' ? '新增資源站點' : '編輯站點'}
      >
        {renderForm ? renderForm(state) : null}
      </Sheet>
    );
  }

  const data = station.data?.station;
  const notFound = station.isSuccess && !data;

  return (
    <Sheet
      open
      onClose={onClose}
      width={540}
      title={data?.name ?? (station.isPending ? '載入中…' : '站點')}
      eyebrow={uuid.slice(0, 8)}
      headerContent={
        data ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <StatusBadge status={data.operationalStatus} />
              {data.source === 'official' ? (
                <Badge tone="info" icon={<ShieldCheck size={12} />}>
                  官方
                </Badge>
              ) : null}
              {data.pendingSuggestedFields.length > 0 ? (
                <Badge tone="warning">{data.pendingSuggestedFields.length} 欄待審</Badge>
              ) : null}
            </Box>
            <Tabs value={tab} onChange={(_, next) => setTab(next)}>
              <Tab value="info" label="基本資料" />
              {caps.canViewHistory ? <Tab value="history" label="版本歷史" /> : null}
            </Tabs>
          </Box>
        ) : null
      }
      footer={
        data && (caps.canDelete || caps.canEdit) ? (
          <Box sx={{ display: 'flex', width: '100%', gap: '8px' }}>
            {caps.canDelete && onDelete ? (
              <Button
                variant="ghost"
                size="sm"
                startIcon={<Trash2 size={16} />}
                onClick={() => onDelete(data.uuid, data.name ?? '')}
                sx={{ color: 'error.main' }}
              >
                刪除站點
              </Button>
            ) : null}
            {caps.canEdit ? (
              <Button
                size="sm"
                startIcon={<PencilLine size={16} />}
                onClick={() => onEdit(data.uuid)}
                sx={{ ml: 'auto' }}
              >
                編輯站點
              </Button>
            ) : null}
          </Box>
        ) : null
      }
    >
      {notFound ? (
        <Callout tone="warning">找不到這個站點，可能已刪除或不在你的權限範圍。</Callout>
      ) : data ? (
        tab === 'history' && caps.canViewHistory ? (
          <StationHistoryPanel uuid={data.uuid} />
        ) : (
          <StationInfoPanel station={data} canViewPii={caps.canViewPii} now={now} />
        )
      ) : null}
    </Sheet>
  );
}
