'use client';

import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import {
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Stack,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useRef } from 'react';
import { useQuery } from 'urql';

import { CurrentBriefingDocument } from '@rescue-frontend/data-access';
import {
  designTokens,
  displayTextSize,
  EmptyState,
  Markdown,
} from '@rescue-frontend/ui';

import { formatTaiwanTime, timeAgo } from '../time';
import { useBriefingChecklist } from './briefing-checklist';
import { ChecklistTools } from './checklist-tools';
import { BRIEFING_PRINT_SHEET, printBriefing } from './print-briefing';

const { color, radius, typography } = designTokens;

// The page shows its own loading line rather than suspend the frame around it.
const BRIEFING_QUERY_CONTEXT = { suspense: false } as const;

/** The class the Markdown takes, for the print styles to reach past its own font size. */
const BRIEFING_MARKDOWN = 'briefing-markdown';

/**
 * Paper (prototype VB-BR-19b): only the sheet `printBriefing` builds, black on white, every box
 * empty, links spelled out, and without what means nothing on paper — the jump links, 已更新, and the
 * line of when it was updated, which the sheet's own head already gives.
 */
function BriefingPrintStyles() {
  const sheet = `.${BRIEFING_PRINT_SHEET}`;

  return (
    <GlobalStyles
      styles={{
        [sheet]: { display: 'none' },
        '@media print': {
          '@page': { margin: '14mm' },
          'html, body': {
            background: '#fff !important',
            height: 'auto !important',
            overflow: 'visible !important',
          },
          [`body > *:not(${sheet})`]: { display: 'none !important' },
          [sheet]: { display: 'block !important', color: '#000' },
          [`${sheet} h1`]: { fontSize: '16pt', margin: '0 0 4pt' },
          [`${sheet} header`]: {
            fontSize: '9.5pt',
            color: '#444',
            paddingBottom: '8pt',
            marginBottom: '10pt',
            borderBottom: '1pt solid #000',
          },
          [`${sheet} header p`]: { margin: '0 0 2pt' },
          [`${sheet} [data-briefing-article]`]: {
            padding: '0 !important',
            border: '0 !important',
          },
          [`${sheet} [data-briefing-stamp], ${sheet} [data-markdown-navigation]`]:
            { display: 'none !important' },
          [`${sheet} .${BRIEFING_MARKDOWN} .ProseMirror`]: {
            fontSize: '11.5pt !important',
            lineHeight: '1.7 !important',
            color: '#000 !important',
          },
          [`${sheet} .${BRIEFING_MARKDOWN} h2`]: {
            fontSize: '14pt !important',
            margin: '14pt 0 6pt !important',
            breakAfter: 'avoid',
          },
          [`${sheet} .${BRIEFING_MARKDOWN} h3`]: {
            fontSize: '12pt !important',
            margin: '10pt 0 4pt !important',
            breakAfter: 'avoid',
          },
          [`${sheet} ul[data-type="taskList"] > li`]: {
            minHeight: '0 !important',
            padding: '2pt 0 !important',
            fontSize: 'inherit !important',
            breakInside: 'avoid',
          },
          [`${sheet} ul[data-type="taskList"] > li > div > :not(ul, ol)`]: {
            color: '#000 !important',
            opacity: '1 !important',
          },
          [`${sheet} ul[data-type="taskList"] > li > label`]: {
            height: 'auto !important',
          },
          [`${sheet} ul[data-type="taskList"] > li[data-task-updated="true"]::after`]:
            { display: 'none !important' },
          [`${sheet} ul[data-type="taskList"] > li input[type="checkbox"]`]: {
            width: '11pt !important',
            height: '11pt !important',
            top: 'calc(2pt + (1.7em - 11pt) / 2) !important',
            border: '1pt solid #000 !important',
            borderRadius: '1pt !important',
            background: '#fff !important',
          },
          [`${sheet} ul[data-type="taskList"] > li input[type="checkbox"]::after`]:
            {
              display: 'none !important',
            },
          // Nothing to click on paper: the address goes beside the words.
          [`${sheet} a[href^="http"]::after`]: {
            content: '" (" attr(href) ")"',
            fontSize: '9pt',
            wordBreak: 'break-all',
          },
          [`${sheet} img`]: { maxWidth: '60mm' },
        },
      }}
    />
  );
}

/** When it was published, before the content: whether to pack by it depends on how fresh it is. */
function BriefingStamp({ publishedAt }: { publishedAt: string | null }) {
  const at = formatTaiwanTime(publishedAt);
  const age = timeAgo(publishedAt);

  return (
    <Stack data-briefing-stamp="" spacing={2}>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1,
          color: color.fg.neutral.muted,
          fontFamily: typography.data[300].fontFamily,
          fontSize: displayTextSize[12],
        }}
      >
        <AccessTimeRoundedIcon sx={{ fontSize: 14 }} />
        <span>
          最後更新 {at ?? '—'}
          {age ? `（${age}）` : null}
        </span>
      </Stack>
      <Box sx={{ height: '1px', bgcolor: color.border.default }} />
    </Stack>
  );
}

function BriefingArticle({
  content,
  publishedAt,
}: {
  content: string;
  publishedAt: string | null;
}) {
  const checklist = useBriefingChecklist();
  const articleRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <ChecklistTools
        checklist={checklist}
        onPrint={() => {
          if (articleRef.current) {
            printBriefing(articleRef.current, publishedAt);
          }
        }}
      />
      <Stack
        ref={articleRef}
        data-briefing-article=""
        spacing={2}
        sx={{
          p: { mobile: 2.5, tablet: 3 },
          borderRadius: `${radius.lg}px`,
          bgcolor: color.bg.neutral.default,
          border: `1px solid ${color.border.subtle}`,
        }}
      >
        <BriefingStamp publishedAt={publishedAt} />
        <Markdown
          source={content}
          className={BRIEFING_MARKDOWN}
          checklist={{
            checked: checklist.checked,
            updated: checklist.updated,
            onToggle: checklist.toggle,
          }}
          onTasksChange={checklist.setTaskItems}
          navigation
        />
      </Stack>
    </>
  );
}

/** Nothing published yet (VB-BR-165): say so, and what to do instead. */
function NoBriefing() {
  return (
    <Box
      sx={{
        borderRadius: `${radius.lg}px`,
        bgcolor: color.bg.neutral.default,
        border: `1px solid ${color.border.subtle}`,
      }}
    >
      <EmptyState
        icon={<MenuBookRoundedIcon />}
        title="目前還沒有發布行前資訊"
        description="協調單位還在整理。出發前請先看地圖上的任務與站點，或直接聯繫你要前往的團隊確認交通與裝備。"
        action={
          <Button component={Link} href="/map" variant="outlined">
            回到地圖
          </Button>
        }
      />
    </Box>
  );
}

/**
 * 志工行前資訊 (prototype `site-brief.jsx`, VB-FEAT-001): for someone who has not set out and knows
 * nothing of the place, most likely reading on a phone on the train — so one column, large type, to
 * be scrolled through, not a dashboard.
 *
 * There is only ever one briefing to read, the newest published (2026-09-07: no switching between
 * disaster types); the backend's list has the earlier versions after it, which this page leaves
 * alone. Not shown yet: its version number (AC-07) and 「這次更新」 beside the sections the last
 * publish changed (AC-12) — both need the backend to say so.
 */
export function SiteBriefing() {
  const [{ data, fetching, error }, reexecute] = useQuery({
    query: CurrentBriefingDocument,
    context: BRIEFING_QUERY_CONTEXT,
  });
  const latest = data?.briefings[0];
  const current = latest?.content.trim() ? latest : null;

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <BriefingPrintStyles />
      <Stack
        spacing={2}
        sx={{ maxWidth: 760, mx: 'auto', px: 2, pt: 3, pb: 8 }}
      >
        <Stack spacing={0.75}>
          <Typography
            component="h1"
            sx={{
              color: color.fg.neutral.default,
              fontSize: displayTextSize[24],
              lineHeight: 1.3,
              fontWeight: 700,
            }}
          >
            志工行前資訊
          </Typography>
          <Typography
            sx={{
              color: color.fg.neutral.subtle,
              fontSize: displayTextSize[15],
              lineHeight: 1.8,
              textWrap: 'pretty',
            }}
          >
            出發前先看這一頁：怎麼參與、怎麼過來、帶什麼、到了要注意什麼。由協調單位維護，
            <strong>不是志工群組裡的轉傳訊息</strong>。
          </Typography>
        </Stack>

        {data ? (
          current ? (
            <>
              <BriefingArticle
                content={current.content}
                publishedAt={current.publishedAt ?? null}
              />
              <Stack
                direction="row"
                sx={{
                  gap: 1,
                  alignItems: 'flex-start',
                  p: '12px 14px',
                  borderRadius: `${radius.md}px`,
                  bgcolor: color.bg.neutral.default,
                  boxShadow: `inset 0 0 0 1px ${color.border.default}`,
                }}
              >
                <InfoOutlinedIcon
                  sx={{
                    fontSize: 16,
                    mt: '4px',
                    color: color.fg.neutral.muted,
                  }}
                />
                <Typography
                  sx={{
                    color: color.fg.neutral.subtle,
                    fontSize: displayTextSize[13],
                    lineHeight: 1.8,
                    textWrap: 'pretty',
                    '& a': { color: color.brand.secondary.subtle },
                  }}
                >
                  現場狀況變動很快。出發前後都建議再看一次這一頁，以及地圖上的
                  <Link href="/map">資源站點與任務</Link>
                  。緊急情況以頁面最上方的紅色<strong>緊急公告</strong>為準。
                </Typography>
              </Stack>
            </>
          ) : (
            <NoBriefing />
          )
        ) : error && !fetching ? (
          <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
            <Typography
              sx={{ color: color.fg.danger, fontSize: displayTextSize[14] }}
            >
              行前資訊載入失敗，請稍後再試。
            </Typography>
            <Button
              variant="outlined"
              onClick={() => reexecute({ requestPolicy: 'network-only' })}
            >
              重新載入
            </Button>
          </Stack>
        ) : (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress size={28} aria-label="載入中" />
          </Box>
        )}
      </Stack>
    </Box>
  );
}
