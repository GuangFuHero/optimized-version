'use client';

import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Box, ButtonBase, Stack, TextField, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import {
  getNeedOption,
  SITE_NEED_OPTIONS,
  type NeedDraft,
} from './help-request-form';

const { color, radius, typography } = designTokens;

/** `taskName`'s column (backend `_validate_need_size`). */
const NEED_NAME_MAX_LENGTH = 200;

interface NeedDraftRowProps {
  row: NeedDraft;
  index: number;
  /** Numbered only once there is more than one: one person filling in one thing needs no count. */
  showIndex: boolean;
  canRemove: boolean;
  /** No kind chosen after a try to send: the card itself turns red, there being no box to mark. */
  invalid: boolean;
  onChange: (next: NeedDraft) => void;
  onRemove: () => void;
}

const hintSx = {
  mt: 0.75,
  fontSize: displayTextSize[12],
  lineHeight: 1.5,
} as const;

/**
 * One thing the resident needs help with (prototype `SiteNeedRow`, `site-actions.jsx:1179-1245`):
 * pick the nearest kind first; only then does it ask what exactly and how many. The word 需求 never
 * shows — that is the back office's word, not theirs (designer, 2026-09-10).
 */
export function NeedDraftRow({
  row,
  index,
  showIndex,
  canRemove,
  invalid,
  onChange,
  onRemove,
}: NeedDraftRowProps) {
  const option = getNeedOption(row.need);
  const ordinal = `第 ${index + 1} 件`;

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${invalid ? color.bg.danger.default : color.border.default}`,
        bgcolor: invalid ? color.bg.danger.subtle : color.bg.neutral.subtle,
      }}
    >
      {/* Left out entirely when there is nothing to show, not rendered empty (designer, 09-11). */}
      {showIndex || canRemove ? (
        <Stack
          direction="row"
          sx={{
            mb: 1.5,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontFamily: typography.data[300].fontFamily,
              fontSize: displayTextSize[12],
              lineHeight: 1.4,
              fontWeight: 700,
            }}
          >
            {showIndex ? ordinal : ''}
          </Typography>
          {canRemove ? (
            <ButtonBase
              onClick={onRemove}
              aria-label={`移除${ordinal}`}
              sx={{
                gap: 0.5,
                px: 0.5,
                minHeight: 32,
                borderRadius: `${radius.sm}px`,
                color: color.fg.neutral.subtle,
                fontSize: displayTextSize[12],
              }}
            >
              <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
              移除
            </ButtonBase>
          ) : null}
        </Stack>
      ) : null}

      <Box
        role="radiogroup"
        aria-label={`你需要什麼幫忙（${ordinal}）`}
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
      >
        {SITE_NEED_OPTIONS.map((choice) => {
          const checked = choice.value === row.need;

          return (
            <ButtonBase
              key={choice.value}
              role="radio"
              aria-checked={checked}
              onClick={() => onChange({ ...row, need: choice.value })}
              sx={{
                minHeight: 40,
                px: 2,
                borderRadius: `${radius.full}px`,
                border: `1px solid ${checked ? color.brand.secondary.default : color.border.default}`,
                bgcolor: checked
                  ? color.bg.secondary.subtle
                  : color.bg.neutral.default,
                color: color.fg.neutral.default,
                fontSize: displayTextSize[13],
                lineHeight: 1.2,
                fontWeight: checked ? 800 : 400,
              }}
            >
              {choice.label}
            </ButtonBase>
          );
        })}
      </Box>

      {/* What exactly and how many only once a kind is chosen: asked before, they are two boxes
          that cannot be filled in yet (designer). */}
      {option ? (
        <>
          <Typography sx={{ ...hintSx, color: color.fg.neutral.muted }}>
            {option.hint}
          </Typography>
          <Box
            sx={{
              mt: 1.5,
              display: 'grid',
              gridTemplateColumns: {
                mobile: 'minmax(0, 1fr) 108px',
                tablet: 'minmax(0, 2fr) minmax(0, 1fr)',
              },
              gap: 1.5,
            }}
          >
            <TextField
              size="small"
              value={row.name}
              onChange={(event) =>
                onChange({ ...row, name: event.target.value })
              }
              placeholder={
                option.value === 'supplies'
                  ? '例：晚餐便當'
                  : '例：清淤人力、圓鍬'
              }
              slotProps={{
                htmlInput: {
                  maxLength: NEED_NAME_MAX_LENGTH,
                  'aria-label': `${ordinal}的說明`,
                },
              }}
            />
            <TextField
              size="small"
              type="number"
              value={row.quantity}
              onChange={(event) =>
                onChange({ ...row, quantity: event.target.value })
              }
              placeholder="幾個／幾人"
              slotProps={{
                htmlInput: {
                  min: 1,
                  inputMode: 'numeric',
                  'aria-label': `${ordinal}需要幾個／幾人（選填）`,
                },
              }}
            />
          </Box>
          <Typography sx={{ ...hintSx, color: color.fg.neutral.muted }}>
            說明留空就用「{option.label}」；數量不知道就留空，志工到現場再回報。
          </Typography>
        </>
      ) : (
        <Typography sx={{ ...hintSx, color: color.fg.neutral.subtle }}>
          選一個最接近的，接著才會問細節。
        </Typography>
      )}
    </Box>
  );
}
