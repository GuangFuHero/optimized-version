'use client';

import {
  Box,
  FormControlLabel,
  Popover,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import {
  useExportTickets,
  useTicketExportCounts,
  useTicketFacets,
} from '@rescue-frontend/data-access/admin';
import { Button, designTokens, NativeSelect } from '@rescue-frontend/ui';
import { Download, LayoutList } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  ExportFormatChoice,
  exportOptionSx,
  exportPaperSx,
  ExportSectionLabel,
  type ExportFormat,
} from '../../../admin/shared/export-popover-parts';
import { downloadBlob } from '../../../admin/shared/model/bulk-import';
import { useTicketCapabilities } from './hooks/use-ticket-capabilities';
import { NEED_KIND_ICONS } from './need-kind-icons';
import {
  ALL_NEED_TYPES,
  ALL_TEAMS,
  exportCapLabel,
  exportNote,
  exportOrgLabel,
  exportOrgOf,
  exportOrgOptions,
  exportScopeParams,
  exportToast,
  exportTypeCount,
  exportTypeLabel,
  exportTypeOrder,
  ticketExportFilename,
  type ExportOrg,
  type ExportType,
} from './model/ticket-export';

const { color, typography } = designTokens;

interface TicketExportMenuProps {
  /** The board's 組織分配: 哪個組織's default, followed when it changes. */
  team: string | null;
  /** The board's 需求: listed first and chosen by default, 全部種類 then last. */
  taskType: string | null;
}

/**
 * 匯出 (BK-8, BK-8b): pick an organisation, a need type and a format. Only the board's 組織分配
 * and 需求 carry over, as defaults; its other filters are not applied. The popover is the
 * prototype's `TicketExportMenu` (tk-import.jsx) on `WGBulkExportMenu` (wg-bulk.jsx).
 *
 * 組織分配 matches on the exact point, so, as the filter panel, a caller without ticket.view_detail
 * gets no 哪個組織 and exports 全部組織. A caller whose export reaches only their own team's
 * 責任區 (`own_team`) sees that team, fixed, in its place (BK-SCOPE).
 */
export function TicketExportMenu({ team, taskType }: TicketExportMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const { canViewDetail } = useTicketCapabilities();

  // The board's 組織分配 and 需求 are the defaults, and a change to either resets the choice.
  const [board, setBoard] = useState({ team, taskType });
  const [org, setOrg] = useState<ExportOrg>(exportOrgOf(team));
  const [pickedType, setPickedType] = useState<ExportType | null>(null);
  if (board.team !== team || board.taskType !== taskType) {
    setBoard({ team, taskType });
    if (board.team !== team) setOrg(exportOrgOf(team));
    if (board.taskType !== taskType) setPickedType(null);
  }

  const open = Boolean(anchor);
  const facets = useTicketFacets({ enabled: open && canViewDetail });
  const teams = facets.data?.ticketFacets.teams ?? [];

  // `own_team` is the caller's, whatever the scope asked: kept from the last answer, so asking
  // for that team's counts does not lose it while they load.
  const [ownTeam, setOwnTeam] = useState<{
    uuid: string;
    name: string;
  } | null>(null);
  // Without view_detail a team matches nothing; the backend's scope already holds an own_team.
  const chosen: ExportOrg = !canViewDetail ? ALL_TEAMS : (ownTeam?.uuid ?? org);
  const scope = exportScopeParams(chosen);
  // Counted only while the popover is open; a ticket write marks it stale with the lists.
  const answer = useTicketExportCounts(scope, { enabled: open }).data;
  // Until the first answer it is not known whether the caller is held to an own_team, so 哪個組織
  // and the note wait for it instead of showing a select that may turn into a team's name.
  const [answered, setAnswered] = useState(false);
  if (answer && !answered) setAnswered(true);
  if (answer) {
    const seen = answer.own_team
      ? { uuid: answer.own_team.uuid, name: answer.own_team.name ?? '你的團隊' }
      : null;
    if (seen?.uuid !== ownTeam?.uuid) setOwnTeam(seen);
  }

  const namedOrg = !answered
    ? null
    : ownTeam
      ? ownTeam.name
      : exportOrgLabel(chosen, teams);
  // A team the facets have not named yet (they load as the popover opens), or no answer yet: its
  // export waits for it.
  const orgLabel = namedOrg ?? '…';
  const types = exportTypeOrder(taskType);
  const exportType =
    pickedType && types.includes(pickedType) ? pickedType : types[0];
  // A type past the cap is refused by the backend: said so up front, and its button stays off.
  const { count, overCap } = exportTypeCount(answer, exportType);
  const capLabel = answer ? exportCapLabel(answer.max_rows) : '';
  const orgOptions = exportOrgOptions(teams);
  if (!orgOptions.some(([value]) => value === org)) {
    orgOptions.splice(1, 0, [org, '…']);
  }

  const exportTickets = useExportTickets();
  const download = () =>
    exportTickets.mutate(
      { params: { query: { task_type: exportType, format, ...scope } } },
      {
        onSuccess: (blob) => {
          downloadBlob(
            blob as Blob,
            ticketExportFilename(
              exportType,
              format,
              new Date(),
              chosen === ALL_TEAMS && !ownTeam ? null : orgLabel,
              count ?? 0,
            ),
          );
          toast.success(exportToast(orgLabel, exportType, count ?? 0));
          setAnchor(null);
        },
      },
    );

  return (
    <>
      <Button
        variant="neutral"
        aria-haspopup="dialog"
        aria-expanded={open}
        startIcon={<Download size={17} />}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        匯出
      </Button>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: exportPaperSx } }}
      >
        <Box
          sx={{
            width: 340,
            maxWidth: '92vw',
            p: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {canViewDetail || ownTeam ? (
            <Box>
              <ExportSectionLabel>哪個組織</ExportSectionLabel>
              {ownTeam ? (
                <Typography
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.default,
                    mt: '6px',
                  }}
                >
                  {ownTeam.name}（只能匯出自己隊的責任區）
                </Typography>
              ) : !answered ? (
                <Typography
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.muted,
                    mt: '6px',
                  }}
                >
                  …
                </Typography>
              ) : (
                <Box sx={{ mt: '6px' }}>
                  <NativeSelect
                    fullWidth
                    minWidth={0}
                    aria-label="哪個組織"
                    value={org}
                    options={orgOptions}
                    onChange={(event) => setOrg(event.target.value)}
                  />
                </Box>
              )}
            </Box>
          ) : null}

          <ExportSectionLabel>匯出哪一種需求</ExportSectionLabel>
          <RadioGroup
            aria-label="匯出哪一種需求"
            value={exportType}
            onChange={(e) => setPickedType(e.target.value as ExportType)}
            sx={{ gap: '8px' }}
          >
            {types.map((type) => {
              const KindIcon =
                type === ALL_NEED_TYPES ? LayoutList : NEED_KIND_ICONS[type];
              const line = exportTypeCount(answer, type);
              return (
                <FormControlLabel
                  key={type}
                  value={type}
                  control={<Radio size="small" />}
                  sx={[
                    exportOptionSx(exportType === type),
                    { '& .MuiFormControlLabel-label': { flex: 1 } },
                  ]}
                  label={
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <KindIcon size={17} color={color.fg.neutral.subtle} />
                      <Typography
                        sx={{
                          ...typography.body[300],
                          color: color.fg.neutral.default,
                          flex: 1,
                        }}
                      >
                        {exportTypeLabel(type)}
                      </Typography>
                      <Typography
                        sx={{
                          ...typography.body[300],
                          color: line.overCap
                            ? color.fg.danger
                            : color.fg.neutral.muted,
                        }}
                      >
                        {line.overCap ? capLabel : `${line.count ?? '—'} 筆`}
                      </Typography>
                    </Box>
                  }
                />
              );
            })}
          </RadioGroup>

          <ExportFormatChoice value={format} onChange={setFormat} />

          <Typography
            sx={{
              ...typography.body[300],
              lineHeight: 1.7,
              color: color.fg.neutral.muted,
            }}
          >
            {exportNote(orgLabel, exportType)}
          </Typography>

          <Button
            fullWidth
            onClick={download}
            disabled={!count || overCap || !namedOrg || exportTickets.isPending}
            startIcon={<Download size={17} />}
          >
            {exportTickets.isPending
              ? '匯出中…'
              : overCap
                ? '無法匯出'
                : `下載 ${count ?? '—'} 筆`}
          </Button>
        </Box>
      </Popover>
    </>
  );
}
