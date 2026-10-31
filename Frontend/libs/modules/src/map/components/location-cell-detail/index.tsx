'use client';

import { Hexagon } from 'lucide-react';

import { Box, ButtonBase, IconButton, Stack, Typography } from '@mui/material';
import { type Ref, useCallback, useEffect, useRef, useState } from 'react';

import {
  Button,
  designTokens,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';

import { SiteBadge } from '../../../shell/site/site-badge';
import { TicketPriorityBadge } from '../../../ticket/priority-badge';
import { getTicketStatusTone } from '../../../ticket/status';
import {
  describeLocationCellSpan,
  LOCATION_CELL_MEMBERS_PAGE_SIZE,
} from '../../location-cells';
import type {
  LocationCellMembersLoader,
  RescueMapLocationCell,
} from '../../types';
import { LocationPrivacyNotice } from '../location-privacy-notice';
import {
  type CellMembersList,
  EMPTY_CELL_MEMBERS,
  nextCellMembersSkip,
  withCellMembersPage,
} from './cell-members';

const { color, radius, spacing } = designTokens;
const CloseIcon = Icons.close;

// 再顯示 stays focusable while the next page loads, so a keyboard user's focus does not drop to the
// page; it only looks and acts disabled.
const LOOKS_DISABLED = {
  '&[aria-disabled="true"]': {
    bgcolor: color.bg.disable,
    color: color.fg.disable,
    borderColor: 'transparent',
    cursor: 'default',
    '&:hover': { bgcolor: color.bg.disable, transform: 'none' },
  },
};

interface LocationCellDetailProps {
  cell: RescueMapLocationCell;
  /** Reads the tickets of a cell that came counted, without them; not given, its own are listed. */
  loadMembers?: LocationCellMembersLoader;
  isAuthenticated: boolean;
  onClose: () => void;
  onSelectMember: (markerId: string) => void;
}

interface CellMembers extends CellMembersList {
  status: 'loading' | 'idle' | 'error';
}

/**
 * The cell's tickets: its own, or with `loadMembers`, read a page at a time from the first. A page
 * that comes back after the cell or the filter changed, or after the panel closed, is dropped.
 */
function useCellMembers(
  cell: RescueMapLocationCell,
  loadMembers: LocationCellMembersLoader | undefined,
): CellMembers & { loadMore: () => void; retry: () => void } {
  const [state, setState] = useState<CellMembers>(() =>
    loadMembers
      ? { ...EMPTY_CELL_MEMBERS, status: 'loading' }
      : {
          members: cell.members,
          read: cell.members.length,
          hasMore: false,
          status: 'idle',
        },
  );
  // Moved on by each run of the effect below and as it is cleaned up: a page keeps the run it was
  // asked in, and is listed only if that run is still the current one.
  const runRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(
    async (skip: number) => {
      if (!loadMembers) {
        return;
      }

      const run = runRef.current;
      // A first page lists the cell afresh: what was listed was for another cell or filter.
      setState((current) =>
        skip === 0
          ? { ...EMPTY_CELL_MEMBERS, status: 'loading' }
          : { ...current, status: 'loading' },
      );

      try {
        const page = await loadMembers(cell.cell, skip);

        if (run === runRef.current) {
          setState((current) => ({
            ...withCellMembersPage(current, page, skip),
            status: 'idle',
          }));
        }
      } catch {
        if (run === runRef.current) {
          setState((current) => ({ ...current, status: 'error' }));
        }
      }
    },
    [cell.cell, loadMembers],
  );

  useEffect(() => {
    runRef.current += 1;
    void load(0);

    return () => {
      runRef.current += 1;
    };
  }, [load]);

  const own: CellMembers = {
    members: cell.members,
    read: cell.members.length,
    hasMore: false,
    status: 'idle',
  };
  const next = () => void load(nextCellMembersSkip(stateRef.current));

  return { ...(loadMembers ? state : own), loadMore: next, retry: next };
}

/**
 * 訪客的「概略區塊」面板：這一格裡有 N 筆求助（原型 `site-detail.jsx` 的 `CellDetail`）。
 *
 * 存在的理由是 HC 2026-07-03 點出的副作用：遮罩後同一格的單全落在格子中心，圖釘會整疊壓在
 * 一起。所以地圖畫格子，點開在這裡列出內容；點其中一筆，開那張單的詳情。這裡列出的每一筆都
 * 已經是後端遮過的 —— 沒有精確座標、沒有原始描述。
 */
export function LocationCellDetail({
  cell,
  loadMembers,
  isAuthenticated,
  onClose,
  onSelectMember,
}: LocationCellDetailProps) {
  const { members, hasMore, status, loadMore, retry } = useCellMembers(
    cell,
    loadMembers,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  // Where a page asked for under the list starts. The button pressed for it goes away when the
  // last page is in or the page fails, and a keyboard user's focus would go with it.
  const askedFromRef = useRef<number | null>(null);
  const askFromFoot = (ask: () => void) => () => {
    askedFromRef.current = members.length;
    ask();
  };

  useEffect(() => {
    const from = askedFromRef.current;

    if (from === null || status === 'loading') {
      return;
    }

    askedFromRef.current = null;

    // Moved on only if focus fell back with the pressed button, to the page or to the drawer that
    // holds the list, and not if it went elsewhere since.
    if (!document.activeElement?.contains(listRef.current)) {
      return;
    }

    // The list holds its tickets in order, then its foot: the first ticket the page added, or 再試一次.
    const target =
      status === 'error'
        ? retryRef.current
        : listRef.current?.children.item(from);

    if (target instanceof HTMLElement) {
      target.focus();
    }
  }, [status]);

  return (
    <Box
      component="aside"
      aria-label="概略區塊詳情"
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: color.bg.neutral.default,
        borderLeft: `1px solid ${color.border.default}`,
        overflow: 'hidden',
      }}
    >
      <IconButton
        aria-label="關閉詳情"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 44,
          height: 44,
          color: color.fg.neutral.subtle,
        }}
      >
        <CloseIcon />
      </IconButton>

      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: `${spacing[3]}px`,
          px: `${spacing[6]}px`,
          pt: `${spacing[4]}px`,
          pb: `${spacing[4]}px`,
          pr: 8,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.primary.subtle,
            color: color.brand.primary.subtle,
          }}
        >
          <Box component={Hexagon} sx={{ width: 20, height: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: displayTextSize[18],
              fontWeight: 700,
              lineHeight: 1.35,
              color: color.fg.neutral.default,
            }}
          >
            這個區塊有 {cell.count} 筆求助
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontSize: displayTextSize[12],
              lineHeight: 1.5,
              color: color.fg.neutral.subtle,
            }}
          >
            概略區塊 · {describeLocationCellSpan(cell.cell)}範圍
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ px: `${spacing[6]}px` }}>
        <LocationPrivacyNotice isAuthenticated={isAuthenticated}>
          為保護求助者，位置只顯示到這個區塊，<b>看不出是哪一戶</b>。
        </LocationPrivacyNotice>
      </Box>

      <Stack
        ref={listRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          gap: `${spacing[2]}px`,
          px: `${spacing[6]}px`,
          pt: `${spacing[4]}px`,
          pb: `${spacing[6]}px`,
        }}
      >
        {members.map((member) => (
          <ButtonBase
            key={member.id}
            onClick={() => onSelectMember(member.id)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 0.75,
              p: `${spacing[3]}px`,
              textAlign: 'left',
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor: color.bg.neutral.default,
            }}
          >
            <Stack
              direction="row"
              sx={{ gap: `${spacing[2]}px`, flexWrap: 'wrap' }}
            >
              <SiteBadge
                tone={getTicketStatusTone(member.ticketMeta?.status)}
                variant="subtle"
              >
                {member.label}
              </SiteBadge>
              <TicketPriorityBadge priority={member.ticketMeta?.priority} />
            </Stack>
            <Typography
              sx={{
                fontSize: displayTextSize[14],
                lineHeight: 1.5,
                color: color.fg.neutral.default,
              }}
            >
              {member.title}
            </Typography>
            <Typography
              sx={{
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                color: color.fg.neutral.subtle,
              }}
            >
              {member.subtitle}
            </Typography>
          </ButtonBase>
        ))}
        <CellMembersFooter
          status={status}
          hasMore={hasMore}
          listed={members.length > 0}
          retryRef={retryRef}
          onLoadMore={askFromFoot(loadMore)}
          onRetry={askFromFoot(retry)}
        />
      </Stack>
    </Box>
  );
}

/** Under the list: still reading, failed, or more to show. Nothing once every ticket is listed. */
function CellMembersFooter({
  status,
  hasMore,
  listed,
  retryRef,
  onLoadMore,
  onRetry,
}: {
  status: CellMembers['status'];
  hasMore: boolean;
  /** Some tickets are listed already: a load is then for the next page, under the button. */
  listed: boolean;
  retryRef: Ref<HTMLButtonElement>;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const loadingText = (
    <Typography
      role="status"
      sx={{
        py: 1,
        textAlign: 'center',
        fontSize: displayTextSize[13],
        color: color.fg.neutral.muted,
      }}
    >
      載入中...
    </Typography>
  );

  if (status === 'loading' && !(listed && hasMore)) {
    return loadingText;
  }

  if (status === 'error') {
    return (
      <Stack sx={{ alignItems: 'center', gap: 1, py: 1 }}>
        <Typography
          role="alert"
          sx={{ fontSize: displayTextSize[13], color: color.fg.neutral.subtle }}
        >
          讀不到這個區塊的求助，請再試一次。
        </Typography>
        <Button ref={retryRef} variant="outline" size="sm" onClick={onRetry}>
          再試一次
        </Button>
      </Stack>
    );
  }

  if (!hasMore) {
    return null;
  }

  const loading = status === 'loading';

  return (
    <Stack
      direction="row"
      sx={{ alignSelf: 'center', alignItems: 'center', gap: 1 }}
    >
      <Button
        variant="outline"
        size="sm"
        aria-disabled={loading}
        aria-busy={loading}
        onClick={() => {
          if (!loading) onLoadMore();
        }}
        sx={LOOKS_DISABLED}
      >
        再顯示 {LOCATION_CELL_MEMBERS_PAGE_SIZE} 筆
      </Button>
      {loading ? loadingText : null}
    </Stack>
  );
}
