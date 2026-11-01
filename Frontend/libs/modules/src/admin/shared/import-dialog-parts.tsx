'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import type { components } from '@rescue-frontend/data-access/openapi';
import { Badge, Button, Callout, designTokens } from '@rescue-frontend/ui';
import type { ReactNode } from 'react';

import { downloadBase64, importFailures } from './model/bulk-import';
import { Muted } from './muted';

const { color, focusRing, motion, radius, typography } = designTokens;

type Result = components['schemas']['BulkImportResponse'];
type RowError = components['schemas']['RowErrorResponse'];

/** A row error's column as the file names it, or 整列 for one about the whole row. */
const fileColumn = (column: string) => column || '整列';

/** One choice of the type a file holds, in the import dialog's radio group. */
export function TypeChip({
  icon,
  label,
  active,
  disabled,
  onSelect,
}: {
  /** Shown before the label; a chip with one sits a little tighter. */
  icon?: ReactNode;
  label: string;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      disabled={disabled}
      disableRipple
      sx={{
        ...typography.label[400],
        display: 'inline-flex',
        alignItems: 'center',
        ...(icon ? { gap: '6px' } : null),
        height: 34,
        px: icon ? '12px' : '14px',
        borderRadius: `${radius.full}px`,
        border: `1px solid ${
          active ? color.brand.primary.default : color.border.default
        }`,
        bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.default,
        color: color.fg.neutral.default,
        transition: `background-color ${motion.transition.fast}`,
        '&:hover': {
          bgcolor: active ? color.bg.primary.subtle : color.bg.neutral.subtle,
        },
        '&.Mui-focusVisible': {
          outline: `${focusRing.width}px solid ${focusRing.color}`,
          outlineOffset: `${focusRing.offset}px`,
        },
        '&.Mui-disabled': { color: color.fg.disable },
      }}
    >
      {icon}
      {label}
    </ButtonBase>
  );
}

/**
 * The dialog's last screen: what the import wrote, what failed, and the failed rows' report. An
 * import that checks for duplicates adds its own counts (`badges`) and notes (`children`).
 */
export function ImportResult({
  result,
  onClose,
  createdUnit,
  showUpdated = false,
  note,
  partialNote,
  fieldLabel = fileColumn,
  badges,
  reportLabel = '下載失敗的列',
  children,
}: {
  result: Result;
  onClose: () => void;
  /** What one created row is counted as (列, 張). */
  createdUnit: string;
  /** Show the 更新 count, for an import that can update rows as well as create them. */
  showUpdated?: boolean;
  /** A reminder under the counts, shown when anything was created. */
  note?: ReactNode;
  /** What a partial row (main record written, a later step failed) left undone, and what to check. */
  partialNote: ReactNode;
  fieldLabel?: (column: string) => string;
  /** More counts, after 新增 and 更新. */
  badges?: ReactNode;
  /** The report's button: it holds the held rows too when the import checks for duplicates. */
  reportLabel?: string;
  /** Shown after the note, before what failed. */
  children?: ReactNode;
}) {
  const { partialLines, unwritten } = importFailures(result);
  return (
    <>
      <Box
        sx={{
          p: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <Badge tone="success">
            新增 {result.created} {createdUnit}
          </Badge>
          {showUpdated ? (
            <Badge tone="info">更新 {result.updated} 列</Badge>
          ) : null}
          {badges}
          <Badge tone={result.failed ? 'danger' : 'neutral'}>
            失敗 {result.failed} 列
          </Badge>
          <Badge tone="neutral">批次 {result.batch_id}</Badge>
        </Box>
        {note && result.created > 0 ? <Muted>{note}</Muted> : null}
        {children}
        {unwritten > 0 ? (
          <Callout tone="warning">
            {partialLines.length > 0 ? `其餘 ${unwritten} 列` : '失敗的列'}
            沒有寫入。修正後再匯入一次即可 —— 已成功的列不會重複建立。
          </Callout>
        ) : null}
        {partialLines.length > 0 ? (
          <Callout tone="danger">
            第 {partialLines.join('、')} 列只寫入了一部分：{partialNote}
          </Callout>
        ) : null}
        {result.errors.length > 0 ? (
          <ErrorList errors={result.errors} fieldLabel={fieldLabel} />
        ) : null}
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          p: '14px 22px',
          borderTop: `1px solid ${color.border.default}`,
        }}
      >
        {result.error_report ? (
          <Button
            variant="outline"
            onClick={() =>
              result.error_report && downloadBase64(result.error_report)
            }
          >
            {reportLabel}
          </Button>
        ) : null}
        <Button onClick={onClose}>關閉</Button>
      </Box>
    </>
  );
}

/** The rows a preview or an import refused: line, column and why. */
export function ErrorList({
  errors,
  fieldLabel = fileColumn,
}: {
  errors: readonly RowError[];
  /** A column as the dialog names it; defaults to the file's own header. */
  fieldLabel?: (column: string) => string;
}) {
  return (
    <Box
      sx={{
        maxHeight: 220,
        overflow: 'auto',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.md}px`,
      }}
    >
      {errors.map((error, i) => (
        <Box
          key={`${error.line}-${error.column}-${i}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: '80px 120px 1fr',
            gap: '8px',
            p: '6px 12px',
            borderBottom: `1px solid ${color.border.subtle}`,
            ...typography.body[300],
          }}
        >
          <span>第 {error.line} 列</span>
          <span>{fieldLabel(error.column)}</span>
          <Box component="span" sx={{ color: color.fg.danger }}>
            {error.message}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** One numbered step of the import dialog: its title row, an optional caption, then its body. */
export function Step({
  title,
  caption,
  aside,
  trailing,
  children,
}: {
  title: string;
  caption?: string;
  /** A note or badges right after the title. */
  aside?: ReactNode;
  /** Actions at the end of the title row. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px 10px',
        }}
      >
        <Typography sx={typography.label[400]}>{title}</Typography>
        {aside}
        <Box sx={{ flex: 1 }} />
        {trailing ? (
          <Box sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: '8px' }}>
            {trailing}
          </Box>
        ) : null}
      </Box>
      {caption ? <Muted>{caption}</Muted> : null}
      {children}
    </Box>
  );
}
