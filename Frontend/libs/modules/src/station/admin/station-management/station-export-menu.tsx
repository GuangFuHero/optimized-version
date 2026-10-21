'use client';

import {
  Box,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useExportStations } from '@rescue-frontend/data-access/admin';
import { Button, designTokens } from '@rescue-frontend/ui';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { getStationTypeLabel, STATION_TYPE_OPTIONS } from '../../type-options';
import { downloadBlob, exportFilename } from './model/import';

const { color, typography } = designTokens;

export function StationExportMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [stationType, setStationType] = useState<string>(
    STATION_TYPE_OPTIONS[0].value,
  );
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const exportStations = useExportStations();

  const download = () =>
    exportStations.mutate(
      { params: { query: { station_type: stationType, format } } },
      {
        onSuccess: (blob) => {
          const label = getStationTypeLabel(stationType);
          downloadBlob(blob as Blob, exportFilename(label, format, new Date()));
          toast.success(`已匯出「${label}」站點`);
          setAnchor(null);
        },
      },
    );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        startIcon={<Download size={16} />}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        匯出
      </Button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box
          sx={{
            width: 340,
            p: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <Typography sx={typography.label[400]}>匯出哪一種站點</Typography>
          <RadioGroup
            value={stationType}
            onChange={(e) => setStationType(e.target.value)}
            sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}
          >
            {STATION_TYPE_OPTIONS.map((option) => (
              <FormControlLabel
                key={option.value}
                value={option.value}
                control={<Radio size="small" />}
                label={option.label}
              />
            ))}
          </RadioGroup>
          <Typography sx={typography.label[400]}>格式</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={format}
            onChange={(_, next) => next && setFormat(next)}
          >
            <ToggleButton value="csv">CSV</ToggleButton>
            <ToggleButton value="xlsx">Excel</ToggleButton>
          </ToggleButtonGroup>
          <Typography
            sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
          >
            匯出你權限範圍內全部該類型的站點，不套用列表上的篩選。檔案裡沒有聯絡人、電話、營運狀態。改完可以直接匯入：站名＋縣市＋鄉鎮相同的會更新原本的站點。
          </Typography>
          <Button
            size="sm"
            onClick={download}
            disabled={exportStations.isPending}
            startIcon={<Download size={16} />}
          >
            {exportStations.isPending ? '匯出中…' : '下載'}
          </Button>
        </Box>
      </Popover>
    </>
  );
}
