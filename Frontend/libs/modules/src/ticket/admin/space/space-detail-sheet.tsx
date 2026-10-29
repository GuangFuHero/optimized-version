'use client';

import { useEffect, useState } from 'react';

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
import { Building2, Layers, PenLine, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Muted } from '../../../admin/shared/muted';
import { formatTicketStatusLabel, getTicketStatusTone } from '../../status';
import { matchFloor } from './floors';
import {
  householdActionsShown,
  type SpaceHouseholdTarget,
} from './household-input';
import {
  fillLabel,
  floorsCaption,
  floorState,
  FLOOR_STATE_LABEL,
  type FloorState,
  type SpaceFloor,
  type SpaceTicket,
} from './space-analysis';
import { floorStateColor, StateBadge } from './space-badges';
import { SpaceFormDrawer } from './space-form-drawer';
import { deleteKeepsText, ticketsCut } from './space-partial';
import {
  useSpace,
  useSpaceCapabilities,
  type LoadedSpace,
} from './use-space-data';

const { color, radius, typography } = designTokens;

/** The prototype's `SpaceDetail` drawer is 640 wide (`tk-space.jsx`). */
const SPACE_SHEET_WIDTH = 640;

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
   * 新增一戶: the page opens its own ticket form for a household in this space. Without it the
   * action doesn't show.
   */
  onAddHousehold?: (space: SpaceHouseholdTarget) => void;
  onDeleted?: () => void;
}

/**
 * 看各樓層 (BE-036 point 4): a space floor by floor, with what each floor still needs, as the
 * designer's `SpaceDetail` (`Design/後台/js/admin/ticket/tk-space.jsx`). 編輯 opens its modal over
 * this sheet; a ticket opened from here sits over it too, so Esc closes only that.
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

  useEffect(() => setEditing(false), [uuid]);

  return (
    <SheetFrame
      open={Boolean(uuid)}
      onClose={onClose}
      width={SPACE_SHEET_WIDTH}
      variant="admin"
      ariaLabel="看各樓層"
    >
      {space ? (
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
              hasHandler: true,
            })
              ? () =>
                  onAddHousehold({
                    uuid: space.building.uuid,
                    name: space.building.name,
                    floorLabels: space.building.floors.map(
                      (floor) => floor.label,
                    ),
                  })
              : undefined
          }
          onDeleted={() => {
            onClose();
            onDeleted?.();
          }}
        />
      ) : (
        <SheetLayout title="看各樓層" closeLabel="關閉看各樓層">
          {isLoading ? null : (
            <Muted>
              {error
                ? '這一棟的資料載入失敗。'
                : '找不到這一棟，可能已經被刪除。'}
            </Muted>
          )}
        </SheetLayout>
      )}
      {space ? (
        <SpaceFormDrawer
          mode="edit"
          open={editing}
          onClose={() => setEditing(false)}
          building={space.building}
          tickets={space.tickets}
        />
      ) : null}
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
  /** Set only when 新增一戶 shows. */
  onAddHousehold?: () => void;
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
      title={
        <Box
          component="span"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <Building2
            size={20}
            color={color.fg.neutral.subtle}
            style={{ flexShrink: 0 }}
          />
          {building.name}
        </Box>
      }
      // The prototype sets the address state off with a full-width space (U+3000).
      subtitle={
        address
          ? `${address}${addressStatus ? `\u3000${addressStatus}` : ''}`
          : undefined
      }
      closeLabel="關閉看各樓層"
      footer={
        canDelete || canEdit || onAddHousehold ? (
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
            {onAddHousehold ? (
              <Button
                variant="outline"
                size="md"
                startIcon={<Plus size={16} />}
                onClick={onAddHousehold}
              >
                新增一戶
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant="outline"
                size="md"
                startIcon={<PenLine size={16} />}
                onClick={onEdit}
              >
                編輯
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {cut ? (
          <Callout tone="info">
            這一棟的任務單超過 200 張，只算了前 200 張：樓層狀態可能不完整。
          </Callout>
        ) : null}
        <StateTiles counts={analysis.counts} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Typography
            sx={{ ...typography.label[500], color: color.fg.neutral.default }}
          >
            各樓層
          </Typography>
          <Typography
            sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
          >
            {floorsCaption(analysis)}
          </Typography>
          {hiddenCount > 0 && withTickets.length > 0 ? (
            <ButtonBase
              onClick={() => setShowAll((all) => !all)}
              sx={{
                ml: 'auto',
                height: 28,
                px: '12px',
                borderRadius: `${radius.full}px`,
                border: `1px solid ${color.border.default}`,
                ...typography.label[300],
                color: color.fg.neutral.default,
                whiteSpace: 'nowrap',
              }}
            >
              {showAll
                ? '只看有任務單的樓層'
                : `顯示全部 ${analysis.floors.length} 層`}
            </ButtonBase>
          ) : null}
        </Box>

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
          <Box>
            {shownFloors.map((floor) => (
              <FloorRow
                key={floor.label}
                floor={floor}
                onOpenTicket={onOpenTicket}
              />
            ))}
            {!showAll && hiddenCount > 0 ? (
              <Typography
                sx={{
                  ...typography.data[300],
                  color: color.fg.neutral.muted,
                  py: '10px',
                  borderTop: `1px solid ${color.border.default}`,
                }}
              >
                {`其他 ${hiddenCount} 層沒有任務單`}
              </Typography>
            ) : null}
            {analysis.noFloor.length ? (
              <>
                <FloorRow
                  floor={{
                    label: '？',
                    state: floorState(analysis.noFloor),
                    tickets: analysis.noFloor,
                  }}
                  onOpenTicket={onOpenTicket}
                />
                <Typography
                  sx={{
                    ...typography.data[300],
                    color: color.fg.neutral.muted,
                    mt: '-4px',
                  }}
                >
                  「？」＝通報的人不知道在幾樓（後端允許不填）
                </Typography>
              </>
            ) : null}
            {analysis.offList.length ? (
              <Box sx={{ mt: '8px' }}>
                <Callout tone="warning">
                  <strong>{`${analysis.offList.length} 張單的樓層不在這棟的樓層裡`}</strong>
                  <br />
                  多半是樓層數改少了。單不會不見，樓層照原本寫的留著：
                  {analysis.offList
                    .map(
                      (ticket) =>
                        `#${ticket.propertyName}（${writtenFloor(ticket)}）`,
                    )
                    .join('、')}
                </Callout>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    mt: '8px',
                  }}
                >
                  {analysis.offList.map((ticket) => (
                    <MiniTicket
                      key={ticket.uuid}
                      ticket={ticket}
                      onOpen={onOpenTicket}
                    />
                  ))}
                </Box>
              </Box>
            ) : null}
          </Box>
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

/** The four counts on top; 還需要幫忙 turns pink when any floor needs help. */
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
        const n = counts[state];
        return (
          <Box
            key={state}
            sx={{
              p: '10px 12px',
              borderRadius: `${radius.md}px`,
              border: `1px solid ${color.border.default}`,
              bgcolor:
                state === 'need' && n
                  ? color.bg.danger.subtle
                  : color.bg.neutral.default,
            }}
          >
            <Typography
              sx={{
                ...typography.heading[700],
                fontSize: 22,
                color: n ? floorStateColor(state) : color.fg.neutral.muted,
              }}
            >
              {n}
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
  onOpenTicket,
}: {
  floor: SpaceFloor;
  onOpenTicket?: (ticketUuid: string) => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '56px minmax(0, 1fr)',
        gap: '12px',
        py: '10px',
        borderTop: `1px solid ${color.border.default}`,
      }}
    >
      <Typography
        component="div"
        sx={{ ...typography.label[500], color: color.fg.neutral.default }}
      >
        {floor.label}
        {floor.label === 'RF' ? (
          <Typography
            component="span"
            sx={{
              display: 'block',
              ...typography.data[300],
              color: color.fg.neutral.muted,
            }}
          >
            頂樓
          </Typography>
        ) : null}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          minWidth: 0,
        }}
      >
        <StateBadge state={floor.state} />
        {floor.tickets.map((ticket) => (
          <MiniTicket key={ticket.uuid} ticket={ticket} onOpen={onOpenTicket} />
        ))}
      </Box>
    </Box>
  );
}

/** One ticket on a floor (`tk-space.jsx` `MiniTicket`); a click opens its detail. */
function MiniTicket({
  ticket,
  onOpen,
}: {
  ticket: SpaceTicket;
  onOpen?: (ticketUuid: string) => void;
}) {
  const room = ticket.secondaryLocation?.room?.trim();
  const fill = fillLabel(ticket.tasks);

  return (
    <ButtonBase
      onClick={() => onOpen?.(ticket.uuid)}
      disabled={!onOpen}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        p: '8px 10px',
        textAlign: 'left',
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.default,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
        >
          {`#${ticket.propertyName}${room ? ` · ${room}` : ''}`}
        </Typography>
        <Typography
          noWrap
          sx={{ ...typography.label[300], color: color.fg.neutral.default }}
        >
          {ticket.title}
        </Typography>
      </Box>
      <Typography
        sx={{
          ...typography.data[300],
          whiteSpace: 'nowrap',
          color: fill.open ? color.fg.danger : color.fg.neutral.muted,
        }}
      >
        {fill.label}
      </Typography>
      <Badge tone={getTicketStatusTone(ticket.status)}>
        {formatTicketStatusLabel(ticket.status)}
      </Badge>
    </ButtonBase>
  );
}
