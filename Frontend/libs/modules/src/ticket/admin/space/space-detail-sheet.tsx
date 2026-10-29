'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { Box, ButtonBase, Typography } from '@mui/material';
import { useDeleteBuildingMap } from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  Dialog,
  EmptyState,
  SheetFrame,
  SheetLayout,
} from '@rescue-frontend/ui';
import { Layers, PencilLine, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { formatTicketStatusLabel, getTicketStatusTone } from '../../status';
import { matchFloor } from './floors';
import {
  householdActionsShown,
  type SpaceHouseholdTarget,
} from './household-input';
import {
  FLOOR_STATE_LABEL,
  type FloorState,
  type SpaceFloor,
  type SpaceTicket,
} from './space-analysis';
import { SpaceEditLayout } from './space-form-drawer';
import { deleteKeepsText, ticketsCut } from './space-partial';
import {
  useSpace,
  useSpaceCapabilities,
  type LoadedSpace,
} from './use-space-data';

const { color, radius, typography } = designTokens;

/** The prototype's `TKDrawer` width, the same as the station sheet. */
const SPACE_SHEET_WIDTH = 540;

/** The prototype's dots and text colours per state (`tk-space.jsx` `STATE`). */
const STATE_COLOR: Record<FloorState, { dot: string; fg: string }> = {
  need: { dot: color.fg.danger, fg: color.fg.danger },
  progress: { dot: color.fg.warning, fg: color.fg.warning },
  done: { dot: color.fg.success, fg: color.fg.success },
  empty: { dot: color.border.default, fg: color.fg.neutral.muted },
};

/** 「N 層還需要幫忙」 and the rest, in the prototype's order. */
const TILE_ORDER: readonly FloorState[] = ['need', 'progress', 'done', 'empty'];

/** Spec 027 §5's words for the address's state; nothing for a building without one. */
const ADDRESS_STATUS: Record<string, string> = {
  verified: '✓ 已確認門牌',
  pin_mismatch: '地址與標記不符',
  unverified: '未確認',
};

export interface SpaceDetailSheetProps {
  /** The building map to show; null closes the sheet. */
  uuid: string | null;
  onClose: () => void;
  /** A ticket card was clicked: the page opens its own ticket drawer over this sheet. */
  onOpenTicket?: (ticketUuid: string) => void;
  /**
   * 新增一戶 / 在這一層新增: the page opens its own ticket form for a household in this space, on
   * `floor` when one was picked. Without it neither action shows.
   */
  onAddHousehold?: (space: SpaceHouseholdTarget, floor?: string) => void;
  onDeleted?: () => void;
}

/**
 * 看各樓層 (BE-036 point 4): a space floor by floor, with what each floor still needs, from the
 * designer's `SpaceDetail` (`Design/後台/js/admin/ticket/tk-space.jsx`). Editing swaps the form in
 * place, as `/stations` does; a ticket opened from here sits over it, so Esc closes only that.
 */
export function SpaceDetailSheet({
  uuid,
  onClose,
  onOpenTicket,
  onAddHousehold,
  onDeleted,
}: SpaceDetailSheetProps) {
  const { space, isLoading, error } = useSpace(uuid);
  const caps = useSpaceCapabilities();
  const [editing, setEditing] = useState(false);
  // An edit is saving: Escape and the backdrop wait for it.
  const [busy, setBusy] = useState(false);

  useEffect(() => setEditing(false), [uuid]);

  let content: ReactNode;
  if (space && editing) {
    content = (
      <SpaceEditLayout
        building={space.building}
        tickets={space.tickets}
        onClose={() => setEditing(false)}
        onBusyChange={setBusy}
      />
    );
  } else if (space) {
    content = (
      <SpaceDetailContent
        space={space}
        canEdit={caps.canEdit}
        canDelete={caps.canDelete}
        onEdit={() => setEditing(true)}
        onOpenTicket={onOpenTicket}
        onAddHousehold={
          onAddHousehold &&
          householdActionsShown({
            canAddTicket: caps.canAddTicket,
            hasHandler: Boolean(onAddHousehold),
          })
            ? (floor?: string) =>
                onAddHousehold(
                  {
                    uuid: space.building.uuid,
                    name: space.building.name,
                    floorLabels: space.building.floors.map(
                      (floor) => floor.label,
                    ),
                  },
                  floor,
                )
            : undefined
        }
        onDeleted={() => {
          onClose();
          onDeleted?.();
        }}
      />
    );
  } else {
    content = (
      <SheetLayout title="看各樓層" closeLabel="關閉看各樓層">
        {isLoading ? null : (
          <Muted>
            {error
              ? '這一棟的資料載入失敗。'
              : '找不到這一棟，可能已經被刪除。'}
          </Muted>
        )}
      </SheetLayout>
    );
  }

  return (
    <SheetFrame
      open={Boolean(uuid)}
      onClose={() => {
        if (!busy) onClose();
      }}
      width={SPACE_SHEET_WIDTH}
      variant="admin"
      ariaLabel="看各樓層"
    >
      {content}
    </SheetFrame>
  );
}

function SpaceDetailContent({
  space,
  canEdit,
  canDelete,
  onEdit,
  onOpenTicket,
  onAddHousehold,
  onDeleted,
}: {
  space: LoadedSpace;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onOpenTicket?: (ticketUuid: string) => void;
  /** Set only when the household actions show. */
  onAddHousehold?: (floor?: string) => void;
  onDeleted: () => void;
}) {
  const { building, analysis } = space;
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteBuildingMap();
  const address = building.secondaryLocation?.fullAddress;
  const addressStatus =
    ADDRESS_STATUS[building.secondaryLocation?.normalizationStatus ?? ''];
  const withTickets = analysis.floors.filter((floor) => floor.tickets.length);
  const shownFloors = showAll ? analysis.floors : withTickets;
  const hiddenCount = analysis.floors.length - withTickets.length;
  const count = analysis.members.length;
  const cut = ticketsCut(space.tickets.length);

  const confirmDelete = () => {
    remove.mutate(
      { uuid: building.uuid },
      {
        onSuccess: () => {
          setConfirming(false);
          toast(`已刪除空間：${building.name}`);
          onDeleted();
        },
      },
    );
  };

  return (
    <SheetLayout
      title={`🏢 ${building.name}`}
      subtitle={
        address ? (
          <>
            {address}
            {addressStatus ? ` · ${addressStatus}` : null}
          </>
        ) : undefined
      }
      closeLabel="關閉看各樓層"
      actions={
        onAddHousehold ? (
          <Button
            variant="outline"
            size="sm"
            startIcon={<Plus size={15} />}
            onClick={() => onAddHousehold()}
          >
            新增一戶
          </Button>
        ) : undefined
      }
      footer={
        <>
          {canDelete ? (
            <Button
              variant="ghost"
              size="md"
              startIcon={<Trash2 size={16} />}
              onClick={() => setConfirming(true)}
              sx={{ color: color.fg.danger }}
            >
              刪除空間
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {canEdit ? (
            <Button
              variant="outline"
              size="md"
              startIcon={<PencilLine size={16} />}
              onClick={onEdit}
            >
              編輯
            </Button>
          ) : null}
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {cut ? (
          <Callout tone="info">
            這一棟的任務單超過 200 張，只算了前 200 張：樓層狀態可能不完整。
          </Callout>
        ) : null}
        <StateTiles counts={analysis.counts} />

        {count === 0 ? (
          <EmptyState
            icon={<Layers size={28} />}
            title="這個空間還沒有任務單"
            description={
              <>
                民眾在前台點這個空間，選樓層後送出求助，就會出現在這裡的那一層。
                <br />
                戶別（302、早餐店）是寫在每張任務單上的。
              </>
            }
          />
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Typography
                sx={{
                  ...typography.label[500],
                  color: color.fg.neutral.default,
                  flex: 1,
                }}
              >
                各樓層
              </Typography>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((all) => !all)}
              >
                {showAll
                  ? '只看有任務單的樓層'
                  : `顯示全部 ${analysis.floors.length} 層`}
              </Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {shownFloors.map((floor) => (
                <FloorRow
                  key={floor.label}
                  floor={floor}
                  onOpenTicket={onOpenTicket}
                  onAdd={
                    onAddHousehold
                      ? () => onAddHousehold(floor.label)
                      : undefined
                  }
                />
              ))}
              {!showAll && hiddenCount > 0 ? (
                <Muted>{`其他 ${hiddenCount} 層沒有任務單`}</Muted>
              ) : null}
              {analysis.noFloor.length ? (
                <>
                  <FloorRow
                    floor={{
                      label: '？',
                      state: 'need',
                      tickets: analysis.noFloor,
                    }}
                    stateLabel={null}
                    onOpenTicket={onOpenTicket}
                  />
                  <Muted>「？」＝通報的人不知道在幾樓（後端允許不填）</Muted>
                </>
              ) : null}
            </Box>

            {analysis.offList.length ? (
              <Box
                sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <Callout tone="warning">
                  <strong>{`${analysis.offList.length} 張單的樓層不在這棟的樓層裡`}</strong>
                  <br />
                  多半是樓層數改少了。單不會不見，樓層照原本寫的留著：
                  {analysis.offList
                    .map(
                      (ticket) =>
                        `#${ticket.propertyName}（單上寫的是 ${writtenFloor(ticket)}）`,
                    )
                    .join('、')}
                </Callout>
                {analysis.offList.map((ticket) => (
                  <TicketCard
                    key={ticket.uuid}
                    ticket={ticket}
                    onOpen={onOpenTicket}
                  />
                ))}
              </Box>
            ) : null}
          </>
        )}
      </Box>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmDelete}
        title={`刪除「${building.name}」`}
        confirmLabel="刪除空間"
        confirmIcon={<Trash2 size={16} />}
        confirmTone="danger"
        submitting={remove.isPending}
        error={remove.error ? remove.error.message : undefined}
      >
        {deleteKeepsText(count, cut)}
      </Dialog>
    </SheetLayout>
  );
}

function writtenFloor(ticket: SpaceTicket): string {
  return matchFloor(ticket.secondaryLocation?.floor, []).raw;
}

function StateTiles({ counts }: { counts: Record<FloorState, number> }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '8px',
      }}
    >
      {TILE_ORDER.map((state) => {
        const alarm = state === 'need' && counts.need > 0;
        return (
          <Box
            key={state}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              p: '10px 12px',
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor: alarm
                ? color.bg.danger.subtle
                : color.bg.neutral.default,
            }}
          >
            <Typography
              sx={{
                ...typography.heading[600],
                color: alarm ? color.fg.danger : color.fg.neutral.default,
              }}
            >
              {counts[state]}
            </Typography>
            <Typography
              sx={{ ...typography.data[300], color: color.fg.neutral.subtle }}
            >
              {`層${FLOOR_STATE_LABEL[state]}`}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function FloorRow({
  floor,
  stateLabel,
  onOpenTicket,
  onAdd,
}: {
  floor: SpaceFloor;
  /** Null for the 「？」 row: it isn't a floor, so it has no state of its own. */
  stateLabel?: null;
  onOpenTicket?: (ticketUuid: string) => void;
  /** 在這一層新增: a household's needs on this floor. */
  onAdd?: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '56px minmax(0, 1fr)',
        gap: '12px',
        p: '10px 12px',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
      }}
    >
      <Box>
        <Typography
          sx={{ ...typography.label[500], color: color.fg.neutral.default }}
        >
          {floor.label}
        </Typography>
        {floor.label === 'RF' ? (
          <Typography
            sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
          >
            頂樓
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          minWidth: 0,
        }}
      >
        {stateLabel === null && !onAdd ? null : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {stateLabel === null ? null : <StateBadge state={floor.state} />}
            <Box sx={{ flex: 1 }} />
            {onAdd ? (
              <Button variant="ghost" size="sm" onClick={onAdd}>
                在這一層新增
              </Button>
            ) : null}
          </Box>
        )}
        {floor.tickets.map((ticket) => (
          <TicketCard key={ticket.uuid} ticket={ticket} onOpen={onOpenTicket} />
        ))}
      </Box>
    </Box>
  );
}

function StateBadge({ state }: { state: FloorState }) {
  const { dot, fg } = STATE_COLOR[state];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        ...typography.data[300],
        fontWeight: 600,
        color: fg,
      }}
    >
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: dot,
          flexShrink: 0,
        }}
      />
      {FLOOR_STATE_LABEL[state]}
    </Box>
  );
}

/** 承接進度: people on the ticket's needs against what they asked for, where they asked. */
function takenLabel(ticket: SpaceTicket): string | null {
  const counted = ticket.tasks.filter((task) => task.quantity != null);
  if (!counted.length) return null;
  const taken = counted.reduce((sum, task) => sum + task.assignedCount, 0);
  const wanted = counted.reduce((sum, task) => sum + (task.quantity ?? 0), 0);
  return `${taken}/${wanted} 人`;
}

function TicketCard({
  ticket,
  onOpen,
}: {
  ticket: SpaceTicket;
  onOpen?: (ticketUuid: string) => void;
}) {
  const room = ticket.secondaryLocation?.room?.trim();
  const taken = takenLabel(ticket);

  return (
    <ButtonBase
      onClick={() => onOpen?.(ticket.uuid)}
      disabled={!onOpen}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: '8px',
        p: '8px 10px',
        borderRadius: `${radius.sm}px`,
        bgcolor: color.bg.neutral.subtle,
        textAlign: 'left',
        width: '100%',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
        >
          {`#${ticket.propertyName}${room ? ` · ${room}` : ''}`}
        </Typography>
        <Typography
          noWrap
          sx={{ ...typography.label[400], color: color.fg.neutral.default }}
        >
          {ticket.title}
        </Typography>
        {taken ? (
          <Typography
            sx={{ ...typography.data[300], color: color.fg.neutral.subtle }}
          >
            {`承接 ${taken}`}
          </Typography>
        ) : null}
      </Box>
      <Badge tone={getTicketStatusTone(ticket.status)}>
        {formatTicketStatusLabel(ticket.status)}
      </Badge>
    </ButtonBase>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ ...typography.body[300], color: color.fg.neutral.muted }}>
      {children}
    </Typography>
  );
}
