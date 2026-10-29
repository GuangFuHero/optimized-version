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
  useCurrentUser,
  useExportStations,
} from '@rescue-frontend/data-access/admin';
import { Button, designTokens } from '@rescue-frontend/ui';
import { Download } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import {
  getStationTypeIcon,
  getStationTypeLabel,
  STATION_TYPE_OPTIONS,
} from '../../type-options';
import { useStationRows } from './hooks/use-station-rows';
import {
  countExportableByType,
  downloadBlob,
  exportFilename,
} from './model/import';
import { EMPTY_FILTERS } from './model/station-filters';

const { color, focusRing, radius, shadow, typography } = designTokens;

type Format = 'csv' | 'xlsx';

const FORMATS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
];

/** A bordered radio choice; the checked one takes the primary subtle fill. */
function optionSx(active: boolean) {
  return {
    m: 0,
    pr: '12px',
    borderRadius: `${radius.md}px`,
    border: `1px solid ${active ? color.bg.primary.default : color.border.default}`,
    bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.default,
    '& .MuiRadio-root': { p: '7px', ml: '3px' },
  };
}

export function StationExportMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [stationType, setStationType] = useState<string>(
    STATION_TYPE_OPTIONS[0].value,
  );
  const [format, setFormat] = useState<Format>('csv');
  const exportStations = useExportStations();
  // The page already loads the unfiltered list, so this reads the cache.
  const { rows } = useStationRows(EMPTY_FILTERS);
  const teamName = useCurrentUser().data?.active_identity?.team ?? null;
  const counts = useMemo(() => countExportableByType(rows), [rows]);
  // Name the team only when the export stops at it; a gov team's reaches every station.
  const exportsEveryStation = rows.every((row) => row.canExport);

  const typeLabel = getStationTypeLabel(stationType);
  const count = counts.get(stationType) ?? 0;

  const download = () =>
    exportStations.mutate(
      { params: { query: { station_type: stationType, format } } },
      {
        onSuccess: (blob) => {
          downloadBlob(
            blob as Blob,
            exportFilename(typeLabel, format, new Date()),
          );
          toast.success(`已匯出「${typeLabel}」站點`);
          setAnchor(null);
        },
      },
    );

  return (
    <>
      <Button
        variant="outline"
        title="匯出離線清單"
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
        slotProps={{
          paper: {
            sx: {
              mt: '8px',
              borderRadius: `${radius.lg}px`,
              boxShadow: shadow.lg,
              border: `1px solid ${color.border.default}`,
            },
          },
        }}
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
          <SectionLabel>匯出哪一種站點</SectionLabel>
          <RadioGroup
            aria-label="匯出哪一種站點"
            value={stationType}
            onChange={(e) => setStationType(e.target.value)}
            sx={{ gap: '8px' }}
          >
            {STATION_TYPE_OPTIONS.map((option) => {
              const TypeIcon = getStationTypeIcon(option.value);
              return (
                <FormControlLabel
                  key={option.value}
                  value={option.value}
                  control={<Radio size="small" />}
                  sx={[
                    optionSx(stationType === option.value),
                    { '& .MuiFormControlLabel-label': { flex: 1 } },
                  ]}
                  label={
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <TypeIcon
                        sx={{ fontSize: 17, color: color.fg.neutral.subtle }}
                      />
                      <Typography
                        sx={{
                          ...typography.body[300],
                          color: color.fg.neutral.default,
                          flex: 1,
                        }}
                      >
                        {option.label}
                      </Typography>
                      <Typography
                        sx={{
                          ...typography.body[300],
                          color: color.fg.neutral.muted,
                        }}
                      >
                        {counts.get(option.value) ?? 0} 筆
                      </Typography>
                    </Box>
                  }
                />
              );
            })}
          </RadioGroup>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SectionLabel>格式</SectionLabel>
            <RadioGroup
              row
              aria-label="格式"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
              sx={{ gap: '8px' }}
            >
              {FORMATS.map((option) => (
                <FormControlLabel
                  key={option.value}
                  value={option.value}
                  control={<Radio size="small" />}
                  label={option.label}
                  sx={[
                    optionSx(format === option.value),
                    {
                      pr: '16px',
                      '& .MuiFormControlLabel-label': {
                        ...typography.body[300],
                        color: color.fg.neutral.default,
                      },
                    },
                  ]}
                />
              ))}
            </RadioGroup>
          </Box>

          <Typography
            sx={{
              ...typography.body[300],
              lineHeight: 1.7,
              color: color.fg.neutral.muted,
              '& strong': { color: color.fg.neutral.subtle },
            }}
          >
            {teamName && !exportsEveryStation
              ? `匯出指派給「${teamName}」的`
              : '匯出你權限範圍內的'}
            <strong>全部</strong>「{typeLabel}」站點，
            <strong>不套用列表上的篩選</strong>
            。一列＝一個站點。檔案裡沒有聯絡人、電話、營運狀態（後端匯出沒有這些欄位）。改完可以直接匯入：站名＋縣市＋鄉鎮相同的會更新原本的站點。
          </Typography>

          <Button
            fullWidth
            onClick={download}
            disabled={count === 0 || exportStations.isPending}
            startIcon={<Download size={17} />}
          >
            {exportStations.isPending ? '匯出中…' : `下載 ${count} 筆`}
          </Button>
        </Box>
      </Popover>
    </>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ ...typography.label[400], flexShrink: 0 }}>
      {children}
    </Typography>
  );
}
