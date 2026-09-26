'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import VolunteerActivismRoundedIcon from '@mui/icons-material/VolunteerActivismRounded';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';
import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { formatTicketAddress } from '../address';
import { formatNeedHeadcount, resolveNeedClaim } from './need-claim';
import { readTicketNeeds, TICKET_NEEDS_QUERY_CONTEXT } from './use-ticket-needs';

const { color, radius, shadow } = designTokens;

export interface NeedClaimTarget {
  ticketUuid: string;
  needUuid: string;
}

interface NeedClaimDialogProps {
  open: boolean;
  /** The need being confirmed — still set while the dialog fades out, so it keeps its content. */
  target: NeedClaimTarget | null;
  /** Why the last try was refused, already in the volunteer's words. */
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DetailLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" sx={{ gap: 0.75, alignItems: 'flex-start' }}>
      <Box sx={{ display: 'grid', placeItems: 'center', mt: '3px', '& svg': { fontSize: 14 } }}>
        {icon}
      </Box>
      <Typography sx={{ fontSize: displayTextSize[13], lineHeight: 1.6 }}>{children}</Typography>
    </Stack>
  );
}

/**
 * The one look a volunteer gets at where they are going before committing to it (prototype
 * `NeedClaimConfirmDialog`, `site-actions.jsx:1965-2012`): a claim is a promise to the scene, and
 * a stray tap costs someone who never shows up.
 *
 * It reads the ticket itself, so every entry point — a list line, a drawer row, the drawer footer
 * — shows the same facts, and a refused claim's reload lands here too (Q29).
 */
export function NeedClaimDialog({
  open,
  target,
  error,
  submitting,
  onCancel,
  onConfirm,
}: NeedClaimDialogProps) {
  const [{ data, fetching }] = useQuery({
    query: GetTicketDocument,
    variables: { uuid: target?.ticketUuid ?? '' },
    pause: !target,
    context: TICKET_NEEDS_QUERY_CONTEXT,
  });
  const ticket = data?.ticket ?? null;
  const fields = ticket ? useFragment(TicketFieldsFragmentDoc, ticket) : null;
  const need = readTicketNeeds(ticket).find((item) => item.uuid === target?.needUuid) ?? null;
  // Only a signed-in volunteer can open this: a guest's button asks them to sign in instead.
  const claim = need
    ? resolveNeedClaim(need, { ticketStatus: fields?.status, isAuthenticated: true })
    : null;
  // After a refused claim the reload may show the need full or closed: then there is nothing to
  // confirm, and the way out is to close (Q29).
  const settled = Boolean(claim) && claim?.action !== 'claim';
  const address = formatTicketAddress(ticket?.secondaryLocation);
  const contact = [fields?.contactName?.trim(), fields?.contactPhone?.trim()]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            // MUI's 32px side margins left each button ~130px on a 390px phone, and 確認承接 broke
            // onto two lines beside its icon.
            m: { mobile: 2, tablet: 4 },
            width: { mobile: 'calc(100% - 32px)', tablet: 'calc(100% - 64px)' },
            borderRadius: `${radius.lg}px`,
            bgcolor: color.bg.neutral.default,
            boxShadow: shadow.lg,
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          pt: 3,
          pb: 1.5,
          color: color.fg.neutral.default,
          fontSize: displayTextSize[20],
          lineHeight: 1.4,
          fontWeight: 700,
        }}
      >
        確認承接這一筆？
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 1 }}>
        <Stack spacing={2}>
          <Box
            sx={{
              p: 2,
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.neutral.subtle,
              border: `1px solid ${color.border.default}`,
            }}
          >
            {need && fields && claim ? (
              <>
                <Typography
                  sx={{
                    color: color.fg.neutral.default,
                    fontSize: displayTextSize[16],
                    lineHeight: 1.4,
                    fontWeight: 700,
                  }}
                >
                  {need.taskName}
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.75, color: color.fg.neutral.subtle }}>
                  <DetailLine icon={<AssignmentRoundedIcon />}>{fields.title}</DetailLine>
                  {/* An address, or plainly none: never the description passed off as one — the
                      prototype's own 2026-09-10 fix (site-detail.jsx:368-373). */}
                  <DetailLine icon={<PlaceRoundedIcon />}>{address ?? '未填地址'}</DetailLine>
                  {/* As the API returns it: masked where this viewer may not see it. */}
                  {contact ? <DetailLine icon={<PersonRoundedIcon />}>{contact}</DetailLine> : null}
                  <DetailLine icon={<GroupsRoundedIcon />}>
                    {formatNeedHeadcount(need, claim.kind)}
                  </DetailLine>
                </Stack>
              </>
            ) : (
              <Typography sx={{ color: color.fg.neutral.muted, fontSize: displayTextSize[13] }}>
                {/* Deleted between the tap and the load: say so rather than load forever. */}
                {fetching ? '載入中...' : '找不到這筆需求，可能已經被刪除。'}
              </Typography>
            )}
          </Box>

          <Typography
            sx={{ color: color.fg.neutral.muted, fontSize: displayTextSize[13], lineHeight: 1.6 }}
          >
            去不了的話請到「我的任務 › 我承接的」釋出名額，讓建立者有機會補人。
          </Typography>

          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 1, pb: 3, gap: 1.5 }}>
        <Button
          onClick={onCancel}
          disabled={submitting}
          variant="outlined"
          color="inherit"
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            borderColor: color.border.default,
            color: color.fg.neutral.subtle,
          }}
        >
          {settled ? '關閉' : '取消'}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={submitting || !claim || settled}
          variant="contained"
          disableElevation
          startIcon={<VolunteerActivismRoundedIcon />}
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.default,
            color: color.fg.onPrimary,
            '&:hover': { bgcolor: color.bg.primary.hover },
            // The fill above outranks MUI's own disabled look, so restate it — the same grey as a
            // need button that cannot be pressed.
            '&.Mui-disabled': { bgcolor: color.bg.disable, color: color.fg.disable },
          }}
        >
          {submitting ? '承接中...' : '確認承接'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
