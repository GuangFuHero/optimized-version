'use client';

import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Alert, Box, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../map/types';
import { SiteActionDrawer } from '../shell/site/site-action-drawer';
import { floorName, groupByFloor } from './floors';
import { FloorSection } from './floor-section';
import {
  opensByItself,
  showsTicketKinds,
  summarizeTickets,
  type BuildingTicket,
} from './summary';
import { useBuilding, type BuildingMap } from './use-building';

const { color, radius } = designTokens;

/**
 * Where each building's drawer was left: which floors were opened or shut, whether finished tickets
 * show, how far down it was. The drawer unmounts once closed, and a volunteer who opened a ticket half
 * way down twelve floors came back to the top (Sucre, 2026-09-21). Kept for this visit only, not in
 * localStorage: a working memory, not a preference — opened tomorrow, it starts afresh.
 */
interface BuildingView {
  showClosed: boolean;
  openFloors: Readonly<Record<string, boolean>>;
  scrollTop: number;
}

const DEFAULT_VIEW: BuildingView = {
  showClosed: true,
  openFloors: {},
  scrollTop: 0,
};
const viewMemory = new Map<string, BuildingView>();

function rememberView(uuid: string, view: Partial<BuildingView>) {
  viewMemory.set(uuid, { ...(viewMemory.get(uuid) ?? DEFAULT_VIEW), ...view });
}

/**
 * Always there, never closed or folded. With the grid gone (prototype 2026-09-20), this and the
 * empty floor's sentence are all that is left to stop a floor without tickets reading as a floor
 * without trouble. Drawn here rather than as an `Alert`, which would turn it into an info box.
 */
function BuildingNotice() {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        p: 1.5,
        borderRadius: `${radius.md}px`,
        bgcolor: color.bg.warning.subtle,
        border: `1px solid ${color.border.accent}`,
      }}
    >
      <WarningAmberRoundedIcon
        sx={{ flexShrink: 0, fontSize: 18, color: color.fg.warning }}
      />
      <Typography
        sx={{
          fontSize: displayTextSize[12],
          lineHeight: 1.6,
          color: color.fg.neutral.default,
        }}
      >
        這裡<b>只看得到已經被通報的</b>。某一層沒有單，不代表那一層沒事 ——
        住戶可能斷訊、手機沒電，或本來就不會用這個平台。你可以替他們通報。
      </Typography>
    </Box>
  );
}

interface BuildingDrawerContentProps {
  uuid: string;
  building: BuildingMap;
  tickets: readonly BuildingTicket[];
  isAuthenticated: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpenTicket: (marker: RescueMapMarkerItem) => void;
}

function BuildingDrawerContent({
  uuid,
  building,
  tickets,
  isAuthenticated,
  scrollRef,
  onOpenTicket,
}: BuildingDrawerContentProps) {
  const [showClosed, setShowClosed] = useState(
    () => (viewMemory.get(uuid) ?? DEFAULT_VIEW).showClosed,
  );
  const [openFloors, setOpenFloors] = useState(
    () => (viewMemory.get(uuid) ?? DEFAULT_VIEW).openFloors,
  );

  useEffect(
    () => rememberView(uuid, { showClosed, openFloors }),
    [openFloors, showClosed, uuid],
  );

  // Back to where it was, now that the floors are drawn; then keep up with the scrolling.
  useEffect(() => {
    const box = scrollRef.current;

    if (!box) {
      return;
    }

    box.scrollTop = viewMemory.get(uuid)?.scrollTop ?? 0;

    const keep = () => rememberView(uuid, { scrollTop: box.scrollTop });

    box.addEventListener('scroll', keep, { passive: true });
    return () => box.removeEventListener('scroll', keep);
  }, [scrollRef, uuid]);

  const groups = groupByFloor(
    building.floors,
    tickets,
    (ticket) => ticket.floor,
  );
  const totals = summarizeTickets(tickets);
  // For the whole building, not floor by floor: rows changing shape between floors would jump about.
  const showKind = showsTicketKinds(tickets);
  // Floors with someone to find or people missing open by themselves, until opened or shut by hand.
  const isOpen = (label: string, list: readonly BuildingTicket[]) =>
    openFloors[label] ?? opensByItself(list);
  const toggle = (label: string, list: readonly BuildingTicket[]) =>
    setOpenFloors((current) => ({
      ...current,
      [label]: !(current[label] ?? opensByItself(list)),
    }));

  return (
    <Stack spacing={2}>
      <BuildingNotice />

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 1.5,
          pb: 1.5,
          borderBottom: `1px solid ${color.border.default}`,
        }}
      >
        {/* Inclusive and on to start with, as the list's 含已滿額: what it hides is someone else's
            call for help, so hiding takes a person choosing to, and the count says how many. */}
        <Box
          component="label"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            minHeight: 44,
            cursor: 'pointer',
            fontSize: displayTextSize[13],
            lineHeight: 1.4,
            color: color.fg.neutral.subtle,
          }}
        >
          <Box
            component="input"
            type="checkbox"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.currentTarget.checked)}
            sx={{
              width: 16,
              height: 16,
              m: 0,
              accentColor: color.bg.primary.default,
            }}
          />
          含已結案（{totals.closedCount}）
        </Box>
        <Typography
          sx={{
            ml: 'auto',
            fontSize: displayTextSize[12],
            lineHeight: 1.4,
            color: color.fg.neutral.muted,
          }}
        >
          {[
            totals.rescueOpen > 0 ? `搜救 ${totals.rescueOpen}` : null,
            `${totals.ticketCount} 張單`,
            `${building.floors.length} 個分區`,
          ]
            .filter(Boolean)
            .join('　·　')}
        </Typography>
      </Box>

      <Stack spacing={1}>
        {groups.floors.map(({ floor, tickets: list }) => (
          <FloorSection
            key={floor.label}
            name={floorName(floor.label)}
            tickets={list}
            placed
            open={isOpen(floor.label, list)}
            onToggle={() => toggle(floor.label, list)}
            showClosed={showClosed}
            showKind={showKind}
            isAuthenticated={isAuthenticated}
            onOpenTicket={onOpenTicket}
          />
        ))}

        {/* Always there when it holds any, and never folded or hidden: tickets known to be in this
            building but on no floor of it. Hidden, the drawer would look complete with people
            missing from it. */}
        {groups.unplaced.length > 0 ? (
          <FloorSection
            name="未定位"
            tickets={groups.unplaced}
            placed={false}
            open
            onToggle={null}
            showClosed={showClosed}
            showKind={showKind}
            isAuthenticated={isAuthenticated}
            note="知道在這一棟，但不知道在哪一層 —— 通報者說不出樓層，或那一層後來從大樓設定拿掉了。"
            onOpenTicket={onOpenTicket}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}

interface BuildingDrawerProps {
  /** The building to show; null keeps the drawer shut. */
  buildingUuid: string | null;
  isAuthenticated: boolean;
  onClose: () => void;
  /** A row pressed: the page closes the drawer and opens that ticket's detail. */
  onOpenTicket: (marker: RescueMapMarkerItem) => void;
}

/**
 * 現場分區 (prototype `BuildingDrawer`, `site-building.jsx`, revised 2026-09-20): a building's tickets,
 * one box per floor, each holding that floor's tickets as narrow rows. Floors only — rooms are free
 * text on the ticket — since floors are what can be known after a disaster, and how many households
 * each holds cannot. Opened from a ticket's 查看整棟; within the site's `NeedClaimProvider`, which its
 * 接這筆 claims through.
 */
export function BuildingDrawer({
  buildingUuid,
  isAuthenticated,
  onClose,
  onOpenTicket,
}: BuildingDrawerProps) {
  // Kept through the closing slide, so the title and the floors do not blank out on the way.
  const [shownUuid, setShownUuid] = useState(buildingUuid);

  useEffect(() => {
    if (buildingUuid) {
      setShownUuid(buildingUuid);
    }
  }, [buildingUuid]);

  const uuid = buildingUuid ?? shownUuid;
  const { building, tickets, fetching, error, hasData } = useBuilding(uuid);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyText = {
    fontSize: displayTextSize[13],
    color: color.fg.neutral.subtle,
  };

  let content;

  if (!hasData) {
    content = error ? (
      <Alert severity="error">載入整棟資料失敗。</Alert>
    ) : (
      <Typography sx={bodyText}>{fetching ? '載入中...' : null}</Typography>
    );
  } else if (!building || !uuid) {
    content = (
      <Typography sx={bodyText}>
        找不到這一棟，可能已經從大樓設定刪除。
      </Typography>
    );
  } else {
    content = (
      <BuildingDrawerContent
        key={uuid}
        uuid={uuid}
        building={building}
        tickets={tickets}
        isAuthenticated={isAuthenticated}
        scrollRef={scrollRef}
        onOpenTicket={onOpenTicket}
      />
    );
  }

  return (
    <SiteActionDrawer
      open={Boolean(buildingUuid)}
      title={building?.name ?? '現場分區'}
      subtitle={building?.address}
      onClose={onClose}
      contentRef={scrollRef}
    >
      {content}
    </SiteActionDrawer>
  );
}
