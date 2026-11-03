'use client';

import { Box, IconButton, Stack, Typography } from '@mui/material';
import { Fragment } from 'react';

import { designTokens, displayTextSize, Icons } from '@rescue-frontend/ui';

import {
  helpTextRuns,
  type PageHelp,
  type PagePermissions,
  type PermissionMark,
} from './page-help';

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

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** Each mark's glyph and colour; a screen reader hears its word instead of the glyph. */
const MARKS: Record<PermissionMark, { glyph: string; color: string }> = {
  all: { glyph: '●', color: color.fg.success },
  own: { glyph: '◐', color: color.fg.warning },
  none: { glyph: '✕', color: color.fg.disable },
};

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
      <Icons.support />
      {/* The row's icon is 15px: a full-size dot on it would cover the ？. */}
      {fresh ? (
        <FreshDot ringColor={color.bg.neutral.default} size={6} inset={-4} />
      ) : null}
    </Box>
  );
}

/** The word a mark stands for: ◐ reads as the page's own range, as its legend says. */
function markWord(mark: PermissionMark, own: string): string {
  if (mark === 'all') {
    return '全部';
  }

  return mark === 'own' ? own : '無';
}

/**
 * 權限 as a table: the actions across, the identities down in the account menu's groups, a legend
 * above. 超級管理員 has every action, so it is said in the legend rather than given a row.
 */
function PermissionTable({ permissions }: { permissions: PagePermissions }) {
  const { actions, own, groups, footnote } = permissions;
  // Eight columns have to fit a phone: the cells keep only a hair of padding, the heads stay on one
  // line, and the identity column wraps there instead (資料檢核員 over two lines).
  const cellSx = {
    py: 0.75,
    px: '1px',
    borderBottom: `1px solid ${color.border.default}`,
  } as const;

  return (
    <Box>
      <Typography sx={LABEL_SX}>權限</Typography>
      <Box
        sx={{
          mt: 0.75,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 12px',
          color: color.fg.neutral.muted,
          fontSize: displayTextSize[11],
        }}
      >
        {(['all', 'own', 'none'] as const).map((mark) => (
          <span key={mark}>
            <Box component="span" aria-hidden sx={{ color: MARKS[mark].color }}>
              {MARKS[mark].glyph}
            </Box>{' '}
            {markWord(mark, own)}
          </span>
        ))}
        <span>超級管理員全部可用</span>
      </Box>
      <Box
        component="table"
        sx={{
          mt: 1,
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: displayTextSize[12],
        }}
      >
        <thead>
          <tr>
            <Box component="td" sx={cellSx} />
            {actions.map((action) => (
              <Box
                component="th"
                scope="col"
                key={action}
                sx={{
                  ...cellSx,
                  color: color.fg.neutral.muted,
                  fontSize: displayTextSize[10],
                  fontWeight: 700,
                  lineHeight: 1.3,
                  textAlign: 'center',
                  verticalAlign: 'bottom',
                  whiteSpace: 'nowrap',
                }}
              >
                {action}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.title}>
              <tr>
                <Box
                  component="th"
                  scope="colgroup"
                  colSpan={actions.length + 1}
                  sx={{
                    pt: 1.25,
                    pb: 0.5,
                    color: color.fg.neutral.muted,
                    fontSize: displayTextSize[11],
                    fontWeight: 700,
                    textAlign: 'left',
                  }}
                >
                  {group.title}
                </Box>
              </tr>
              {group.rows.map(([role, marks]) => (
                <tr key={role}>
                  <Box
                    component="th"
                    scope="row"
                    sx={{
                      ...cellSx,
                      pl: 1.25,
                      color: color.fg.neutral.default,
                      fontWeight: 600,
                      textAlign: 'left',
                      width: { mobile: '4em', tablet: 'auto' },
                      whiteSpace: { mobile: 'normal', tablet: 'nowrap' },
                    }}
                  >
                    {role}
                  </Box>
                  {marks.map((mark, index) => (
                    <Box
                      component="td"
                      key={actions[index]}
                      sx={{ ...cellSx, textAlign: 'center' }}
                    >
                      <Box
                        component="span"
                        aria-hidden
                        sx={{ color: MARKS[mark].color }}
                      >
                        {MARKS[mark].glyph}
                      </Box>
                      <Box component="span" sx={VISUALLY_HIDDEN}>
                        {markWord(mark, own)}
                      </Box>
                    </Box>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </Box>
      {footnote ? (
        <Typography
          sx={{
            mt: 0.75,
            color: color.fg.neutral.muted,
            fontSize: displayTextSize[11],
            lineHeight: 1.6,
          }}
        >
          {footnote}
        </Typography>
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
        <Icons.support sx={{ fontSize: 18, color: color.bg.primary.default }} />
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
          <Icons.close sx={{ fontSize: 18 }} />
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

      {/* A page that is only for reading (the back office's 總覽儀表板) has no 你可以. */}
      {help.can.length > 0 ? (
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
      ) : null}

      {help.sections?.map((section) => (
        <Box key={section.title}>
          <Typography sx={LABEL_SX}>{section.title}</Typography>
          {/* A blank line in the body starts a new paragraph. */}
          {section.body?.split('\n\n').map((paragraph) => (
            <Typography key={paragraph} sx={BODY_SX}>
              <HelpText text={paragraph} />
            </Typography>
          ))}
          {section.items?.length ? (
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

      {help.permissions ? (
        <PermissionTable permissions={help.permissions} />
      ) : null}

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
