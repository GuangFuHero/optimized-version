// SPDX-License-Identifier: GPL-3.0-only
'use client';

import { toast } from 'sonner';
import {
  useAssignZoneToTeam,
  useDeleteArea,
  useRemoveZoneFromTeam,
  type UpdateAreaInput,
  type useUpdateArea,
} from '@rescue-frontend/data-access/admin';
import {
  AREA_KIND_LABELS,
  editableOutline,
  showAreaError,
  useAdminAreaChanges,
  type RescueMapArea,
  type RescueMapAreaTeam,
} from '@rescue-frontend/modules';

import type { AreaActions } from './admin-area-detail-actions';
import type { AdminAreaListItem } from './admin-map-area-projection';

interface AreaActionOptions
  extends Pick<
    AreaActions,
    'canEdit' | 'canDelete' | 'canAssign' | 'teamOptions' | 'teamListError'
  > {
  area?: AdminAreaListItem | null;
  polygons?: RescueMapArea['polygons'];
  updateArea: Pick<
    ReturnType<typeof useUpdateArea>,
    'mutateAsync' | 'isPending'
  >;
  onEditBounds: (
    id: string,
    points: NonNullable<ReturnType<typeof editableOutline>>,
  ) => void;
  returnToList: (highlight?: string | null) => void;
}

export function useAdminAreaActions({
  area,
  polygons,
  canEdit,
  canDelete,
  canAssign,
  teamOptions,
  teamListError,
  updateArea,
  onEditBounds,
  returnToList,
}: AreaActionOptions): AreaActions | undefined {
  const deleteArea = useDeleteArea();
  const assignZoneToTeam = useAssignZoneToTeam();
  const removeZoneFromTeam = useRemoveZoneFromTeam();
  const { hold, pending } = useAdminAreaChanges();
  if (!area || (!canEdit && !canDelete && !canAssign)) return undefined;

  const label = `${AREA_KIND_LABELS[area.kind]}「${area.name ?? ''}」`;
  const outline = polygons ? editableOutline(polygons) : null;
  const isPending = pending[area.id] !== undefined || updateArea.isPending;
  const update = async (input: UpdateAreaInput) => {
    if (isPending) return false;
    try {
      await updateArea.mutateAsync({ variables: { uuid: area.id, input } });
      return true;
    } catch (cause) {
      showAreaError(cause);
      return false;
    }
  };
  const changeTeams = (
    teams: readonly RescueMapAreaTeam[],
    message: string,
    send: (keepalive: boolean) => Promise<void>,
  ) => {
    if (isPending) return;
    if (
      hold({ uuid: area.id, change: { kind: 'teams', teams }, message, send })
    )
      returnToList(area.id);
  };

  return {
    canEdit,
    canDelete,
    canAssign,
    canEditBounds: outline !== null,
    isPending,
    teamOptions,
    teamListError,
    onEditBounds: () => {
      if (outline && !isPending) {
        onEditBounds(area.id, outline);
      }
    },
    onTogglePublic: (isPublic) => {
      void update({ isPublic });
    },
    onSave: async (changes) => {
      const saved = await update(changes);
      if (saved) toast.success(`已更新${label}`);
      return saved;
    },
    onDelete: () => {
      if (isPending) return;
      if (
        hold({
          uuid: area.id,
          change: { kind: 'delete' },
          message: `${area.kind === 'hazardous_zone' ? '已解除' : '已刪除'}${label}`,
          send: async (keepalive) => {
            await deleteArea.mutateAsync({
              variables: { uuid: area.id },
              keepalive,
            });
          },
        })
      )
        returnToList();
    },
    onAddTeam: (teamUuid) => {
      const team = teamOptions.find((candidate) => candidate.uuid === teamUuid);
      if (!team || area.teams.some(({ uuid }) => uuid === teamUuid)) return;
      changeTeams(
        [...area.teams, team],
        `已把${label}交給 ${team.name}`,
        async (keepalive) => {
          await assignZoneToTeam.mutateAsync({
            variables: { input: { zoneUuid: area.id, teamUuid } },
            keepalive,
          });
        },
      );
    },
    onRemoveTeam: (teamUuid) => {
      const team = area.teams.find(({ uuid }) => uuid === teamUuid);
      if (!team || area.teams.length <= 1) return;
      changeTeams(
        area.teams.filter(({ uuid }) => uuid !== teamUuid),
        `已移除${label}的 ${team.name}`,
        async (keepalive) => {
          await removeZoneFromTeam.mutateAsync({
            variables: { input: { zoneUuid: area.id, teamUuid } },
            keepalive,
          });
        },
      );
    },
  };
}
