'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import {
  contactVisibilityOptions,
  defaultTicketReportFormValues,
  formatTicketReportDate,
  reporterRoleOptions,
  severityOptions,
  taskTypeOptions,
  type TicketActionLogEntry,
  type TicketReportFormValues,
  type TicketReportRecord,
} from './model';

type TicketReportDrawerMode = 'create' | 'detail';

interface TicketReportDrawerProps {
  open: boolean;
  mode: TicketReportDrawerMode;
  report?: TicketReportRecord | null;
  onClose: () => void;
  onCreate: (values: TicketReportFormValues) => void;
}

type TicketReportFormErrors = Partial<
  Record<keyof TicketReportFormValues, string>
>;

const requiredFields: readonly (keyof TicketReportFormValues)[] = [
  'reporterName',
  'reporterContact',
  'impactScope',
  'address',
  'description',
];

const fieldLabels: Record<keyof TicketReportFormValues, string> = {
  reporterName: '填表人姓名',
  reporterRole: '身分',
  reporterContact: '聯絡方式',
  reporterEmail: '電子郵件',
  contactVisibility: '聯絡資訊可見性',
  submittedAt: '填表時間',
  taskType: '需求類型',
  severity: '程度分級',
  impactScope: '影響範圍',
  address: '地址',
  landmark: '地標',
  description: '需求描述',
  photoUrls: '照片網址',
  referenceLinks: '參考連結',
};

function createLocalDateTimeValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function normalizeSubmittedAt(value: string) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function createDefaultFormValues(): TicketReportFormValues {
  return {
    ...defaultTicketReportFormValues,
    submittedAt: createLocalDateTimeValue(new Date()),
  };
}

function sectionTitle(title: string) {
  return (
    <Typography
      sx={{
        color: '#17212B',
        fontSize: 15,
        lineHeight: '22px',
        fontWeight: 800,
      }}
    >
      {title}
    </Typography>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack spacing={1.5}>
      {sectionTitle(title)}
      {children}
    </Stack>
  );
}

function SummaryField({ label, value }: { label: string; value?: string }) {
  return (
    <Stack spacing={0.35} sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          color: '#667085',
          fontSize: 11,
          lineHeight: '16px',
          fontWeight: 700,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          color: '#17212B',
          fontSize: 14,
          lineHeight: '20px',
          fontWeight: 500,
          overflowWrap: 'anywhere',
        }}
      >
        {value || '未提供'}
      </Typography>
    </Stack>
  );
}

function ActionLogList({
  entries,
}: {
  entries: readonly TicketActionLogEntry[];
}) {
  return (
    <Stack spacing={1.25}>
      {entries.map((entry) => (
        <Box
          key={entry.id}
          sx={{
            display: 'grid',
            gridTemplateColumns: '28px minmax(0, 1fr)',
            gap: 1.25,
          }}
        >
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: '#E7EFF7',
              color: '#245C8C',
            }}
          >
            <HistoryRoundedIcon sx={{ fontSize: 16 }} />
          </Box>
          <Stack spacing={0.35} sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                color: '#17212B',
                fontSize: 13,
                lineHeight: '20px',
                fontWeight: 700,
              }}
            >
              {entry.summary}
            </Typography>
            <Typography
              sx={{ color: '#667085', fontSize: 12, lineHeight: '16px' }}
            >
              {entry.actorName}（{entry.actorRole}） ·{' '}
              {formatTicketReportDate(entry.occurredAt)}
            </Typography>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function ReportDetail({ report }: { report: TicketReportRecord }) {
  const severityLabel =
    severityOptions.find((option) => option.value === report.severity)?.label ??
    report.severity;

  return (
    <Stack spacing={2.5}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          p: 1.5,
          border: '1px solid #D7DEE8',
          borderRadius: 1,
          bgcolor: '#F6FAFF',
        }}
      >
        <Stack spacing={0.4} sx={{ minWidth: 0 }}>
          <Typography
            sx={{ color: '#667085', fontSize: 12, lineHeight: '16px' }}
          >
            任務單識別碼
          </Typography>
          <Typography
            sx={{
              color: '#17212B',
              fontSize: 24,
              lineHeight: '32px',
              fontWeight: 800,
              fontFamily: 'Liberation Mono, monospace',
            }}
          >
            {report.code}
          </Typography>
        </Stack>
        <Chip
          label={`程度：${severityLabel}`}
          color={report.severity === 'critical' ? 'error' : 'default'}
          size="small"
        />
      </Box>

      <FormSection title="任務單內容">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { mobile: '1fr', tablet: '1fr 1fr' },
            gap: 1.5,
          }}
        >
          <SummaryField label="任務標題" value={report.title} />
          <SummaryField label="需求類型" value={report.taskType} />
          <SummaryField label="地址" value={report.address} />
          <SummaryField label="地標" value={report.landmark} />
          <SummaryField
            label="填表時間"
            value={formatTicketReportDate(report.submittedAt)}
          />
          <SummaryField label="聯絡可見性" value={report.contactVisibility} />
        </Box>
        <SummaryField label="影響範圍" value={report.impactScope} />
        <SummaryField label="需求描述" value={report.description} />
      </FormSection>

      <Divider />

      <FormSection title="填表人資訊">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { mobile: '1fr', tablet: '1fr 1fr' },
            gap: 1.5,
          }}
        >
          <SummaryField label="填表人" value={report.reporterName} />
          <SummaryField label="身分" value={report.reporterRole} />
          <SummaryField label="聯絡方式" value={report.reporterContact} />
          <SummaryField label="電子郵件" value={report.reporterEmail} />
        </Box>
      </FormSection>

      <Divider />

      <FormSection title="現場附件">
        {report.attachments.length > 0 ? (
          <Stack spacing={1}>
            {report.attachments.map((attachment) => {
              const AttachmentIcon =
                attachment.type === 'photo'
                  ? PhotoCameraRoundedIcon
                  : LinkRoundedIcon;

              return (
                <Box
                  key={attachment.id}
                  component="a"
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '20px minmax(0, 1fr)',
                    gap: 1,
                    alignItems: 'center',
                    color: '#17212B',
                    textDecoration: 'none',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <AttachmentIcon sx={{ fontSize: 18, color: '#245C8C' }} />
                  <Typography sx={{ fontSize: 13, lineHeight: '20px' }}>
                    {attachment.label}：{attachment.url}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Typography
            sx={{ color: '#667085', fontSize: 13, lineHeight: '20px' }}
          >
            未提供附件
          </Typography>
        )}
      </FormSection>

      <Divider />

      <FormSection title="操作日誌">
        <ActionLogList entries={report.actionLog} />
      </FormSection>
    </Stack>
  );
}

export function TicketReportDrawer({
  open,
  mode,
  report,
  onClose,
  onCreate,
}: TicketReportDrawerProps) {
  const [values, setValues] = useState<TicketReportFormValues>(() =>
    createDefaultFormValues(),
  );
  const [errors, setErrors] = useState<TicketReportFormErrors>({});

  useEffect(() => {
    if (!open || mode !== 'create') {
      return;
    }

    setValues(createDefaultFormValues());
    setErrors({});
  }, [mode, open]);

  function updateValue(field: keyof TicketReportFormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: TicketReportFormErrors = {};

    for (const field of requiredFields) {
      if (!values[field].trim()) {
        nextErrors[field] = `請填寫${fieldLabels[field]}`;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onCreate({
      ...values,
      submittedAt: normalizeSubmittedAt(values.submittedAt),
    });
  }

  const title = mode === 'create' ? '任務回報' : (report?.title ?? '任務回報');
  const subtitle =
    mode === 'create'
      ? '建立任務單並保留 append-only 操作日誌'
      : `${report?.code ?? ''} 回報內容與操作歷史`;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        '& .MuiDrawer-paper': {
          width: { mobile: '100vw', tablet: 520 },
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
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            bgcolor: '#F6FAFF',
          }}
        >
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography
              sx={{ color: '#17212B', fontSize: 22, fontWeight: 800 }}
            >
              {title}
            </Typography>
            <Typography
              sx={{ color: '#667085', fontSize: 13, lineHeight: '18px' }}
            >
              {subtitle}
            </Typography>
          </Stack>
          <IconButton aria-label="關閉任務回報" onClick={onClose}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 3 }}>
          {mode === 'detail' && report ? (
            <ReportDetail report={report} />
          ) : (
            <Box
              component="form"
              id="ticket-report-form"
              onSubmit={handleSubmit}
            >
              <Stack spacing={2.5}>
                <FormSection title="填表人資訊">
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { mobile: '1fr', tablet: '1fr 1fr' },
                      gap: 1.5,
                    }}
                  >
                    <TextField
                      label="填表人姓名"
                      value={values.reporterName}
                      onChange={updateValue('reporterName')}
                      error={Boolean(errors.reporterName)}
                      helperText={errors.reporterName}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      select
                      label="身分"
                      value={values.reporterRole}
                      onChange={updateValue('reporterRole')}
                      size="small"
                      fullWidth
                    >
                      {reporterRoleOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="聯絡方式"
                      value={values.reporterContact}
                      onChange={updateValue('reporterContact')}
                      error={Boolean(errors.reporterContact)}
                      helperText={errors.reporterContact}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="電子郵件"
                      value={values.reporterEmail}
                      onChange={updateValue('reporterEmail')}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="填表時間"
                      type="datetime-local"
                      value={values.submittedAt}
                      onChange={updateValue('submittedAt')}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      select
                      label="聯絡資訊可見性"
                      value={values.contactVisibility}
                      onChange={updateValue('contactVisibility')}
                      size="small"
                      fullWidth
                    >
                      {contactVisibilityOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                </FormSection>

                <Divider />

                <FormSection title="需求描述">
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { mobile: '1fr', tablet: '1fr 1fr' },
                      gap: 1.5,
                    }}
                  >
                    <TextField
                      select
                      label="需求類型"
                      value={values.taskType}
                      onChange={updateValue('taskType')}
                      size="small"
                      fullWidth
                    >
                      {taskTypeOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="程度分級"
                      value={values.severity}
                      onChange={updateValue('severity')}
                      size="small"
                      fullWidth
                    >
                      {severityOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <TextField
                    label="影響範圍"
                    value={values.impactScope}
                    onChange={updateValue('impactScope')}
                    error={Boolean(errors.impactScope)}
                    helperText={errors.impactScope}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="需求描述"
                    value={values.description}
                    onChange={updateValue('description')}
                    error={Boolean(errors.description)}
                    helperText={errors.description}
                    minRows={4}
                    multiline
                    fullWidth
                  />
                </FormSection>

                <Divider />

                <FormSection title="地址與地標">
                  <TextField
                    label="地址或可定位位置"
                    value={values.address}
                    onChange={updateValue('address')}
                    error={Boolean(errors.address)}
                    helperText={errors.address}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="地標"
                    value={values.landmark}
                    onChange={updateValue('landmark')}
                    size="small"
                    fullWidth
                  />
                </FormSection>

                <Divider />

                <FormSection title="現場附件">
                  <TextField
                    label="照片 URL"
                    value={values.photoUrls}
                    onChange={updateValue('photoUrls')}
                    helperText="每行或逗號分隔"
                    minRows={2}
                    multiline
                    fullWidth
                  />
                  <TextField
                    label="相關連結"
                    value={values.referenceLinks}
                    onChange={updateValue('referenceLinks')}
                    helperText="每行或逗號分隔"
                    minRows={2}
                    multiline
                    fullWidth
                  />
                </FormSection>
              </Stack>
            </Box>
          )}
        </Box>

        {mode === 'create' ? (
          <Box sx={{ px: 3, py: 2, borderTop: '1px solid #D7DEE8' }}>
            <Button
              type="submit"
              form="ticket-report-form"
              variant="contained"
              startIcon={<SendRoundedIcon />}
              fullWidth
            >
              建立任務單並寫入日誌
            </Button>
          </Box>
        ) : null}
      </Box>
    </Drawer>
  );
}
