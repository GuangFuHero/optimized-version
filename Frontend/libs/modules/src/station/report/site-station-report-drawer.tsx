'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type { RescueMapMarkerItem } from '../../map/types';
import {
  defaultStationReportFormValues,
  stationOperationalStatusOptions,
  type StationReportFormValues,
  type StationReportRecord,
} from './model';
import { StationReportHistoryPanel } from './station-report-history-panel';

interface SiteStationReportDrawerProps {
  open: boolean;
  station: RescueMapMarkerItem | null;
  reports?: readonly StationReportRecord[];
  onClose: () => void;
  onSubmit: (values: StationReportFormValues) => void;
}

type StationReportFormErrors = Partial<
  Record<keyof StationReportFormValues, string>
>;

function createFormValues(station: RescueMapMarkerItem | null) {
  return {
    ...defaultStationReportFormValues,
    stationId: station?.id ?? '',
  };
}

export function SiteStationReportDrawer({
  open,
  station,
  reports = [],
  onClose,
  onSubmit,
}: SiteStationReportDrawerProps) {
  const [values, setValues] = useState<StationReportFormValues>(() =>
    createFormValues(station),
  );
  const [errors, setErrors] = useState<StationReportFormErrors>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues(createFormValues(station));
    setErrors({});
  }, [open, station]);

  const latestReport = useMemo(() => reports[0], [reports]);

  function updateValue(field: keyof StationReportFormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: StationReportFormErrors = {};

    if (!values.stationId.trim()) {
      nextErrors.stationId = '缺少站點識別碼';
    }

    if (!values.comment.trim()) {
      nextErrors.comment = '請補充現場狀態說明';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSubmit(values);
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        '& .MuiDrawer-paper': {
          width: { mobile: '100vw', tablet: 480 },
          maxWidth: '100vw',
          bgcolor: '#FFFFFF',
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            px: 3,
            py: 2.5,
            borderBottom: '1px solid #D7DEE8',
            bgcolor: '#F6FAFF',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography
              sx={{ color: '#17212B', fontSize: 22, fontWeight: 800 }}
            >
              建議修改站點資訊
            </Typography>
            <Typography
              sx={{ color: '#667085', fontSize: 13, lineHeight: '18px' }}
            >
              {station?.title ?? '未選取站點'}
            </Typography>
          </Stack>
          <IconButton aria-label="關閉站點回報" onClick={onClose}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 3 }}>
          <Stack spacing={2.5}>
            <Box
              component="form"
              id="site-station-report-form"
              onSubmit={handleSubmit}
            >
              <Stack spacing={2}>
                <TextField
                  label="站點識別碼"
                  value={values.stationId}
                  onChange={updateValue('stationId')}
                  error={Boolean(errors.stationId)}
                  helperText={errors.stationId}
                  size="small"
                  fullWidth
                  slotProps={{ input: { readOnly: true } }}
                />
                <TextField
                  select
                  label="建議站點狀態"
                  value={values.suggestedStatus}
                  onChange={updateValue('suggestedStatus')}
                  size="small"
                  fullWidth
                >
                  {stationOperationalStatusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="文字說明"
                  value={values.comment}
                  onChange={updateValue('comment')}
                  error={Boolean(errors.comment)}
                  helperText={errors.comment ?? '例如：目前已關閉，現場無人'}
                  minRows={4}
                  multiline
                  fullWidth
                />
                <TextField
                  label="回報者稱呼（選填）"
                  value={values.reporterName}
                  onChange={updateValue('reporterName')}
                  size="small"
                  fullWidth
                />
              </Stack>
            </Box>

            <Divider />

            <Stack spacing={1.25}>
              <Typography
                sx={{
                  color: '#17212B',
                  fontSize: 15,
                  lineHeight: '22px',
                  fontWeight: 800,
                }}
              >
                最新回報
              </Typography>
              {latestReport ? (
                <StationReportHistoryPanel reports={[latestReport]} compact />
              ) : (
                <Typography
                  sx={{ color: '#667085', fontSize: 13, lineHeight: '20px' }}
                >
                  尚無回報
                </Typography>
              )}
            </Stack>

            {reports.length > 1 ? (
              <Stack spacing={1.25}>
                <Typography
                  sx={{
                    color: '#17212B',
                    fontSize: 15,
                    lineHeight: '22px',
                    fontWeight: 800,
                  }}
                >
                  歷史評論
                </Typography>
                <StationReportHistoryPanel reports={reports.slice(1)} compact />
              </Stack>
            ) : null}
          </Stack>
        </Box>

        <Box sx={{ px: 3, py: 2, borderTop: '1px solid #D7DEE8' }}>
          <Button
            type="submit"
            form="site-station-report-form"
            variant="contained"
            startIcon={<SendRoundedIcon />}
            fullWidth
            disabled={!station}
          >
            送出建議
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
