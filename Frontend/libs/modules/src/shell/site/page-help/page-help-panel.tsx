'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { Box, IconButton, Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { helpTextRuns, type PageHelp } from './page-help';

const { color } = designTokens;

/** 你可以 and each section's title. */
const LABEL_SX = {
  color: color.fg.neutral.muted,
  fontSize: displayTextSize[12],
  fontWeight: 700,
} as const;

/** 你可以's list, a section's list and its paragraph. */
const BODY_SX = {
  m: 0,
  mt: 0.75,
  color: color.fg.neutral.subtle,
  fontSize: displayTextSize[14],
  lineHeight: 1.75,
} as const;

/** A line of help, with the words between `**` in bold. */
function HelpText({ text }: { text: string }) {
  return (
    <>
      {helpTextRuns(text).map((run, index) =>
        run.bold ? <strong key={index}>{run.text}</strong> : run.text,
      )}
    </>
  );
}

/** A small orange dot: this page's help has not been opened on this device yet. */
export function FreshDot({
  ringColor,
  size = 8,
  inset = 1,
}: {
  ringColor: string;
  size?: number;
  /** From the top right corner; negative sits it outside, off a small icon's glyph. */
  inset?: number;
}) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        position: 'absolute',
        top: inset,
        right: inset,
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color.bg.primary.default,
        boxShadow: `0 0 0 2px ${ringColor}`,
      }}
    />
  );
}

/** The ？ for the phone menu's row, with its dot while the page's help is unopened. */
export function PageHelpIcon({ fresh }: { fresh: boolean }) {
  return (
    <Box component="span" sx={{ position: 'relative', display: 'inline-flex' }}>
      <HelpOutlineRoundedIcon />
      {/* The row's icon is 15px: a full-size dot on it would cover the ？. */}
      {fresh ? (
        <FreshDot ringColor={color.bg.neutral.default} size={6} inset={-4} />
      ) : null}
    </Box>
  );
}

/**
 * What a page is for, in the prototype's fixed shape (`wg-help.jsx`): one sentence, 你可以, any
 * sections, then 注意 in a grey box.
 */
export function PageHelpPanel({
  help,
  titleId,
  onClose,
}: {
  help: PageHelp;
  titleId: string;
  onClose: () => void;
}) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <HelpOutlineRoundedIcon
          sx={{ fontSize: 18, color: color.bg.primary.default }}
        />
        <Typography
          id={titleId}
          sx={{
            flex: 1,
            color: color.fg.neutral.default,
            fontSize: displayTextSize[16],
            fontWeight: 700,
          }}
        >
          {help.title}：這一頁怎麼用
        </Typography>
        <IconButton
          size="small"
          aria-label="關閉說明"
          onClick={onClose}
          sx={{ mr: -0.5, color: color.fg.neutral.muted }}
        >
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>

      <Typography
        sx={{
          color: color.fg.neutral.default,
          fontSize: displayTextSize[14],
          lineHeight: 1.7,
        }}
      >
        <HelpText text={help.what} />
      </Typography>

      <Box>
        <Typography sx={LABEL_SX}>你可以</Typography>
        <Box component="ul" sx={{ ...BODY_SX, pl: 2.25 }}>
          {help.can.map((line) => (
            <li key={line}>
              <HelpText text={line} />
            </li>
          ))}
        </Box>
      </Box>

      {help.sections?.map((section) => (
        <Box key={section.title}>
          <Typography sx={LABEL_SX}>{section.title}</Typography>
          {section.body ? (
            <Typography sx={BODY_SX}>
              <HelpText text={section.body} />
            </Typography>
          ) : null}
          {section.items ? (
            <Box component="ul" sx={{ ...BODY_SX, pl: 2.25 }}>
              {section.items.map((item) => (
                <li key={item}>
                  <HelpText text={item} />
                </li>
              ))}
            </Box>
          ) : null}
        </Box>
      ))}

      {help.note ? (
        <Typography
          sx={{
            px: 1.375,
            py: 1.125,
            borderRadius: '8px',
            bgcolor: color.bg.neutral.subtle,
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[12],
            lineHeight: 1.65,
          }}
        >
          <HelpText text={help.note} />
        </Typography>
      ) : null}
    </Stack>
  );
}
