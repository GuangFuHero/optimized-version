'use client';

import { Box, Stack, Tab } from '@mui/material';
import { ChevronRight, CircleCheck, Trash2 } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import {
  useAllDuplicatePairs,
  useCurrentUser,
  useDuplicatePairs,
  type DuplicatePair,
  type DuplicatePairsQuery,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  ListPagination,
  Tabs,
} from '@rescue-frontend/ui';

import { CompareView } from './compare-view';
import {
  byHighestSimilarity,
  byLatestCreated,
  DONE_STATUSES,
  gapText,
  isPending,
  orderedSides,
  PENDING_STATUSES,
  shortTime,
  TAB_KINDS,
  type PairTab,
  type PairView,
} from './model';
import { LetterDot, muted, subtle } from './parts';

const { color, radius, shadow, typography } = designTokens;

const PAGE_SIZE = 50;
type Sort = 'similarity' | 'latest';

/**
 * 已處理, a page at a time, as 任務管理 pages its list. Sorted by latest it goes by when the card was
 * found (`-created_at`), which the API can page: that list only grows, so it is never read whole.
 */
export function decidedListQuery(
  tab: PairTab,
  page: number,
  sort: Sort = 'similarity',
): DuplicatePairsQuery {
  return {
    status: [...DONE_STATUSES],
    entity_kind: TAB_KINDS[tab],
    sort: sort === 'latest' ? '-created_at' : '-similarity',
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  };
}

/** The page reads the open pair from `?pair=`, so it renders inside the route's Suspense. */
export function DedupReviewPage() {
  const [openUuid, setOpenUuid] = useQueryState(
    'pair',
    parseAsString.withOptions({
      history: 'push',
      shallow: false,
      scroll: true,
    }),
  );
  const [tab, setTab] = useState<PairTab>('ticket');
  const [view, setView] = useState<PairView>('pending');
  const [sort, setSort] = useState<Sort>('similarity');
  const [page, setPage] = useState(0);
  const { data: user } = useCurrentUser();
  // DEDUP-008 decision 2: what the capabilities allow, never role names. Without the view the
  // shell shows its 403, and nothing is asked of the API.
  const canView = user?.capabilities.includes('ai_duplicate.view') ?? false;
  const canReview = user?.capabilities.includes('ai_duplicate.review') ?? false;

  // 待處理 is work to get through, so it is one long list, read whole: what its tab counts is what
  // is listed, 上一對／下一對 reach every pair, and a pair handled by someone else cannot move another
  // past the edge of a page unseen. It is the work still to do, so it stays short.
  const pending = view === 'pending';
  const byPage = useDuplicatePairs(decidedListQuery(tab, page, sort), {
    enabled: canView && !pending,
  });
  const whole = useAllDuplicatePairs(
    {
      status: [...PENDING_STATUSES],
      entity_kind: TAB_KINDS[tab],
    },
    { enabled: canView && pending },
  );
  const list = pending ? whole : byPage;
  const wholeSorted =
    sort === 'latest'
      ? byLatestCreated(whole.data ?? [])
      : byHighestSimilarity(whole.data ?? []);
  const items = pending ? wholeSorted : (byPage.data?.items ?? []);
  // The tab counts are the pending totals; one card each is the smallest page that carries them.
  const counts = {
    ticket: useDuplicatePairs(
      {
        status: [...PENDING_STATUSES],
        entity_kind: TAB_KINDS.ticket,
        limit: 1,
      },
      { enabled: canView },
    ),
    station: useDuplicatePairs(
      {
        status: [...PENDING_STATUSES],
        entity_kind: TAB_KINDS.station,
        limit: 1,
      },
      { enabled: canView },
    ),
  };

  // Back from a pair, the list opens at that pair: a long list would start over at the top. A pair
  // just handled has left the list, and it opens at the top.
  const lastOpened = useRef<string | null>(null);
  useEffect(() => {
    if (openUuid) {
      lastOpened.current = openUuid;
      return;
    }
    if (!lastOpened.current || items.length === 0) return;
    document
      .querySelector(`[data-dedup-pair="${lastOpened.current}"]`)
      ?.scrollIntoView({ block: 'center' });
    lastOpened.current = null;
  }, [openUuid, items.length]);

  // The compare screen is a page of its own: the browser's back button returns to the list.
  const open = (uuid: string | null) => {
    void setOpenUuid(uuid);
  };

  if (openUuid) {
    return (
      <Box
        sx={{
          p: '28px',
          height: '100%',
          boxSizing: 'border-box',
          color: color.fg.neutral.default,
        }}
      >
        <CompareView
          key={openUuid}
          pairUuid={openUuid}
          canView={canView}
          canReview={canReview}
          neighbours={items.map((item) => item.uuid)}
          onOpen={open}
        />
      </Box>
    );
  }

  const pageCount = Math.max(
    1,
    Math.ceil((byPage.data?.total ?? 0) / PAGE_SIZE),
  );

  return (
    <Stack
      sx={{
        p: '28px',
        gap: 1.5,
        maxWidth: 1336,
        boxSizing: 'border-box',
        color: color.fg.neutral.default,
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
      >
        <Tabs
          value={tab}
          onChange={(_, value: PairTab) => {
            setTab(value);
            setPage(0);
          }}
          aria-label="任務單或站點"
        >
          <Tab
            value="ticket"
            label={`任務單（${counts.ticket.data?.total ?? '…'}）`}
          />
          <Tab
            value="station"
            label={`站點（${counts.station.data?.total ?? '…'}）`}
          />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        {/* BTN-114: a grey pill holding ghost sm buttons; the chosen one is light orange (BTN-107),
            never black, which means nothing in this palette. */}
        <Stack
          direction="row"
          role="group"
          aria-label="待處理或已處理"
          sx={{
            gap: 0.5,
            p: 0.5,
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.neutral.sunken,
          }}
        >
          {(
            [
              ['pending', '待處理'],
              ['done', '已處理'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              selected={view === value}
              onClick={() => {
                setView(value);
                setPage(0);
              }}
              sx={
                view === value ? undefined : { color: color.fg.neutral.subtle }
              }
            >
              {label}
            </Button>
          ))}
        </Stack>
        <Box
          component="select"
          aria-label="排序"
          value={sort}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            setSort(event.target.value as Sort);
            setPage(0);
          }}
          sx={{
            height: 32,
            px: 1.25,
            borderRadius: `${radius.sm}px`,
            border: `1px solid ${color.border.default}`,
            bgcolor: color.bg.neutral.default,
            ...typography.body[300],
            color: color.fg.neutral.default,
          }}
        >
          <option value="similarity">相似度高的在前</option>
          <option value="latest">最新建立的在前</option>
        </Box>
      </Stack>

      {tab === 'station' ? (
        <Box component="span" sx={{ ...typography.body[300], ...muted }}>
          站點這一版還不能合併，只能記下「確認重複」或「不是重複」，兩個站點都不會變。
        </Box>
      ) : null}

      {list.isPending ? (
        <Box sx={{ ...typography.body[300], ...muted, py: 4 }}>載入中…</Box>
      ) : list.isError ? (
        <Callout tone="danger">
          無法載入重複審核的清單，請重新整理頁面。
        </Callout>
      ) : items.length === 0 ? (
        <Stack
          sx={{
            p: '56px 12px',
            textAlign: 'center',
            gap: 0.75,
            alignItems: 'center',
            border: `1px dashed ${color.border.default}`,
            borderRadius: `${radius.lg}px`,
          }}
        >
          <CircleCheck size={28} color={color.fg.neutral.muted} />
          <Box component="span" sx={typography.label[400]}>
            {view === 'pending' ? '目前沒有待處理的可能重複' : '還沒有處理過的'}
          </Box>
          <Box
            component="span"
            sx={{
              ...typography.body[300],
              ...muted,
              lineHeight: 1.8,
              maxWidth: 520,
            }}
          >
            {view === 'pending' ? (
              <>
                系統發現兩{tab === 'station' ? '個站點' : '張任務單'}
                可能在講同一件事，就會出現在這裡。
                <br />
                來源有三種：有人建單或改單時與既有的很像、CSV
                匯入時撞到既有資料，
                <br />
                或建單者被提醒後仍選擇送出。進來之後在這裡兩張並排比對，決定
                {tab === 'station' ? '是不是重複' : '合併或「不是重複」'}。
              </>
            ) : (
              `在「待處理」按下${tab === 'station' ? '確認重複' : '合併'}或「不是重複」之後，會留在這裡，方便事後查是誰決定的。`
            )}
          </Box>
        </Stack>
      ) : (
        <Stack sx={{ gap: 1 }} data-dedup-list>
          {items.map((pair) => (
            <PairRow
              key={pair.uuid}
              pair={pair}
              onOpen={() => open(pair.uuid)}
            />
          ))}
        </Stack>
      )}

      {!pending && pageCount > 1 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <ListPagination
            showPageNumbers
            page={page + 1}
            pageCount={pageCount}
            onPageChange={(next) => setPage(next - 1)}
          />
        </Box>
      ) : null}
    </Stack>
  );
}

/** A side by its ticket's title, as the compare header leads (no ids are shown, design 11/01). */
export function sideName(pair: DuplicatePair, side: 'low' | 'high') {
  const s = pair[side];
  if (s.deleted) return '已刪除';
  return s.ticket_title || s.title || '（沒有名稱）';
}

function PairRow({
  pair,
  onOpen,
}: {
  pair: DuplicatePair;
  onOpen: () => void;
}) {
  const sides = orderedSides(pair);
  const first = pair[sides[0]].created_at;
  const gap = gapText(first, pair[sides[1]].created_at);
  const pending = isPending(pair);
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      data-dedup-pair={pair.uuid}
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '64px minmax(0, 1fr) 20px',
          md: '76px minmax(0, 1fr) 180px 150px 20px',
        },
        alignItems: 'center',
        gap: 2,
        width: '100%',
        p: '14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.neutral.default,
        '&:hover': { borderColor: color.border.accent, boxShadow: shadow.sm },
      }}
    >
      <Stack sx={{ gap: 0.25, alignItems: 'flex-start' }}>
        {pending ? (
          <>
            <Box component="span" sx={typography.data[500]}>
              {pair.similarity == null
                ? '—'
                : `${Math.round(pair.similarity * 100)}%`}
            </Box>
            <Box component="span" sx={{ ...typography.data[300], ...muted }}>
              相似度
            </Box>
          </>
        ) : (
          // The list has only the status, so a merged pair and a plain 確認重複 share one word that
          // covers both; the detail says which (已合併 or 確認重複).
          <Badge tone={pair.status === 'not_duplicate' ? 'neutral' : 'success'}>
            {pair.status === 'not_duplicate' ? '不是重複' : '是重複'}
          </Badge>
        )}
      </Stack>
      <Stack sx={{ gap: 1, minWidth: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ ...typography.label[400] }}>
            可能重複
          </Box>
        </Stack>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {sides.map((side, index) => (
            <Box
              key={side}
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                p: '2px 10px 2px 3px',
                borderRadius: `${radius.full}px`,
                border: `1px solid ${color.border.default}`,
                ...typography.body[300],
                maxWidth: 300,
                color: pair[side].deleted
                  ? color.fg.neutral.muted
                  : color.fg.neutral.default,
              }}
            >
              <LetterDot index={index} />
              {pair[side].deleted ? <Trash2 size={12} /> : null}
              <Box
                component="span"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sideName(pair, side)}
              </Box>
            </Box>
          ))}
        </Stack>
      </Stack>
      {/* 單位 (dd-app.jsx:175): the API has no team on a card yet. */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }} />
      <Stack
        sx={{
          gap: 0.25,
          alignItems: 'flex-start',
          display: { xs: 'none', md: 'flex' },
        }}
      >
        {pending ? (
          <>
            <Box component="span" sx={{ ...typography.data[300] }}>
              最早 {shortTime(first)}
            </Box>
            <Box component="span" sx={{ ...typography.data[300], ...muted }}>
              {gap === '同時' ? '同時建立' : `前後差 ${gap}`}
            </Box>
          </>
        ) : (
          <Box component="span" sx={{ ...typography.data[300], ...subtle }}>
            處理於 {shortTime(pair.reviewed_at)}
          </Box>
        )}
      </Stack>
      <ChevronRight size={18} color={color.fg.neutral.muted} />
    </Box>
  );
}
