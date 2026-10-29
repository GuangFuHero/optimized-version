'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import type { components } from '@rescue-frontend/data-access/openapi';
import { Button, designTokens } from '@rescue-frontend/ui';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  describeSuspect,
  fileAll,
  type FiledRows,
} from './model/import-suspects';

const { color, focusRing, radius, typography } = designTokens;

type Suspect = components['schemas']['SuspectedRowResponse'];

/**
 * The rows that look like a station already there, one at a time in line order, as Carol asked for
 * (Discord #frontend-only, 2026-10-27): the importer files each anyway or leaves it out, and moves
 * on to the next. A row left undecided is not created (uiux 2026-10-27, Q6).
 */
export function ImportSuspectsStep({
  suspects,
  filed,
  disabled,
  onChange,
}: {
  suspects: readonly Suspect[];
  filed: FiledRows;
  disabled: boolean;
  onChange: (filed: FiledRows) => void;
}) {
  const [at, setAt] = useState(0);
  // A new preview may bring fewer suspects than the one on view.
  const index = Math.min(at, suspects.length - 1);
  const current = suspects[index];
  if (!current) return null;

  const isFiled = filed[current.line] === current.related_uuid;
  const described = describeSuspect(current);

  const choose = (file: boolean) => {
    const next = { ...filed };
    if (file) next[current.line] = current.related_uuid;
    else delete next[current.line];
    onChange(next);
    // On to the next row; the last one stays in view.
    setAt(Math.min(index + 1, suspects.length - 1));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Box
        sx={{
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.md}px`,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'minmax(0, 2fr) minmax(0, 3fr)',
            },
          }}
        >
          <Box
            sx={{
              p: '12px 14px',
              bgcolor: color.bg.neutral.subtle,
              borderRight: { sm: `1px solid ${color.border.default}` },
              borderBottom: {
                xs: `1px solid ${color.border.default}`,
                sm: 'none',
              },
            }}
          >
            <Typography
              sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
            >
              檔案第 {current.line} 列（第 {index + 1}／{suspects.length} 筆）
            </Typography>
            {described.row ? (
              <Typography
                sx={{
                  ...typography.label[400],
                  color: color.fg.neutral.default,
                  overflowWrap: 'anywhere',
                }}
              >
                {described.row}
              </Typography>
            ) : null}
          </Box>
          <Box
            sx={{
              p: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <Typography
              sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
            >
              很像：
              <Box
                component={Link}
                href={`/stations?station=${encodeURIComponent(current.related_uuid)}`}
                target="_blank"
                rel="noopener"
                sx={{
                  ...typography.label[400],
                  color: color.fg.neutral.default,
                  textDecoration: 'underline',
                }}
              >
                {described.title}
              </Box>
            </Typography>
            <Typography
              sx={{ ...typography.body[300], color: color.fg.neutral.default }}
            >
              {described.kind}
            </Typography>
            {described.distance || described.created ? (
              <Typography
                sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
              >
                {[described.distance, described.created]
                  .filter(Boolean)
                  .join('・')}
              </Typography>
            ) : null}
          </Box>
        </Box>
        <Box
          sx={{
            p: '10px 14px',
            borderTop: `1px solid ${color.border.default}`,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Typography
            sx={{
              ...typography.body[300],
              color: color.fg.neutral.muted,
              flexBasis: '100%',
            }}
          >
            附近可能已有相同的站點。確認不是重複後再建立。
          </Typography>
          <Button
            size="sm"
            variant={isFiled ? 'outline' : 'primary'}
            aria-pressed={!isFiled}
            disabled={disabled}
            onClick={() => choose(false)}
          >
            不建立
          </Button>
          <Button
            size="sm"
            variant={isFiled ? 'primary' : 'outline'}
            aria-pressed={isFiled}
            disabled={disabled}
            onClick={() => choose(true)}
          >
            仍要建立
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            size="sm"
            variant="ghost"
            startIcon={<ChevronLeft size={15} />}
            disabled={index === 0}
            onClick={() => setAt(index - 1)}
          >
            上一筆
          </Button>
          <Button
            size="sm"
            variant="ghost"
            endIcon={<ChevronRight size={15} />}
            disabled={index === suspects.length - 1}
            onClick={() => setAt(index + 1)}
          >
            下一筆
          </Button>
        </Box>
      </Box>

      <Box
        role="group"
        aria-label="疑似重複的列"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          maxHeight: 96,
          overflow: 'auto',
        }}
      >
        {suspects.map((suspect, i) => {
          const rowFiled = filed[suspect.line] === suspect.related_uuid;
          const Mark = rowFiled ? Check : X;
          return (
            <ButtonBase
              key={suspect.line}
              aria-current={i === index ? 'true' : undefined}
              aria-label={`第 ${suspect.line} 列，${rowFiled ? '仍要建立' : '不建立'}`}
              onClick={() => setAt(i)}
              disableRipple
              sx={{
                ...typography.data[300],
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                height: 28,
                px: '10px',
                borderRadius: `${radius.full}px`,
                border: `1px solid ${
                  i === index
                    ? color.brand.primary.default
                    : color.border.default
                }`,
                bgcolor:
                  i === index
                    ? color.bg.primary.subtle
                    : color.bg.neutral.default,
                color: rowFiled
                  ? color.fg.neutral.default
                  : color.fg.neutral.muted,
                '&.Mui-focusVisible': {
                  outline: `${focusRing.width}px solid ${focusRing.color}`,
                  outlineOffset: `${focusRing.offset}px`,
                },
              }}
            >
              第 {suspect.line} 列
              <Mark size={13} aria-hidden />
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

/** 全部仍要建立／全部不建立, beside the step's title. */
export function ImportSuspectsBulkActions({
  suspects,
  disabled,
  onChange,
}: {
  suspects: readonly Suspect[];
  disabled: boolean;
  onChange: (filed: FiledRows) => void;
}) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange(fileAll(suspects))}
      >
        全部仍要建立
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange({})}
      >
        全部不建立
      </Button>
    </>
  );
}
