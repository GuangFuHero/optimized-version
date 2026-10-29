'use client';

import { Hexagon } from 'lucide-react';

import { Box, ButtonBase, IconButton, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  RescueMapMarkerItem,
} from '../../types';
import { LocationPrivacyNotice } from '../location-privacy-notice';

const { color, radius, spacing } = designTokens;
const CloseIcon = Icons.close;

interface LocationCellDetailProps {
  cell: RescueMapLocationCell;
  /** Reads the tickets of a cell that came counted, without them; not given, its own are listed. */
  loadMembers?: LocationCellMembersLoader;
  isAuthenticated: boolean;
  onClose: () => void;
  onSelectMember: (markerId: string) => void;
}

interface CellMembers {
  members: readonly RescueMapMarkerItem[];
  hasMore: boolean;
  status: 'loading' | 'idle' | 'error';
}

/**
 * The cell's tickets: its own, or with `loadMembers`, read a page at a time from the first. A page
 * that comes back after the panel has closed is dropped.
 */
function useCellMembers(
  cell: RescueMapLocationCell,
  loadMembers: LocationCellMembersLoader | undefined,
): CellMembers & { loadMore: () => void; retry: () => void } {
  const [state, setState] = useState<CellMembers>(() =>
    loadMembers
      ? { members: [], hasMore: false, status: 'loading' }
      : { members: cell.members, hasMore: false, status: 'idle' },
  );
  const mountedRef = useRef(true);
  const membersRef = useRef(state.members);
  membersRef.current = state.members;

  const load = useCallback(
    async (skip: number) => {
      if (!loadMembers) {
        return;
      }

      setState((current) => ({ ...current, status: 'loading' }));

      try {
        const page = await loadMembers(cell.cell, skip);

        if (mountedRef.current) {
          setState((current) => ({
            members:
              skip === 0 ? page.members : [...current.members, ...page.members],
            hasMore: page.hasMore,
            status: 'idle',
          }));
        }
      } catch {
        if (mountedRef.current) {
          setState((current) => ({ ...current, status: 'error' }));
        }
      }
    },
    [cell.cell, loadMembers],
  );

  useEffect(() => {
    mountedRef.current = true;
    void load(0);

    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const own: CellMembers = {
    members: cell.members,
    hasMore: false,
    status: 'idle',
  };
  // Both go on from what is already listed: a failed first page from the start, a failed later
  // one from where the list ends.
  const next = () => void load(membersRef.current.length);

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
          onLoadMore={loadMore}
          onRetry={retry}
        />
      </Stack>
    </Box>
  );
}

/** Under the list: still reading, failed, or more to show. Nothing once every ticket is listed. */
function CellMembersFooter({
  status,
  hasMore,
  onLoadMore,
  onRetry,
}: {
  status: CellMembers['status'];
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (status === 'loading') {
    return (
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
        <Button variant="outline" size="sm" onClick={onRetry}>
          再試一次
        </Button>
      </Stack>
    );
  }

  return hasMore ? (
    <Button
      variant="outline"
      size="sm"
      onClick={onLoadMore}
      sx={{ alignSelf: 'center' }}
    >
      再顯示 {LOCATION_CELL_MEMBERS_PAGE_SIZE} 筆
    </Button>
  ) : null;
}
