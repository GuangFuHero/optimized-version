'use client';

import { useId, type KeyboardEvent, type MouseEvent } from 'react';

import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from 'urql';

import {
  GetTicketSummaryDocument,
  TicketSummaryFieldsFragmentDoc,
  useFragment,
  type TicketSummaryFieldsFragment,
} from '@rescue-frontend/data-access';

import { formatTicketStatusLabel } from '../../../status';
import { ticketCreatePalette as palette } from '../palette';
import { mapTaskTypeLabel } from '../task-type';
import { buildCandidateHref } from './candidate-link';
import type { DedupHint } from './dedup-check';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const bodyTextSx = { fontSize: 14, lineHeight: 1.7, color: palette.bodyText };

const pillButtonSx = { borderRadius: '999px', fontWeight: 800 };

function formatCreatedAt(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} 建立`;
}

type DedupHintDialogProps = {
  /** 要提示的候選單；null 時關閉。 */
  hint: DedupHint | null;
  /** 正在另外開單：鎖住所有動作。 */
  busy: boolean;
  onViewCandidate: () => void;
  onProceedAnyway: () => void;
  onBack: () => void;
  /** 關閉動畫結束，讓呼叫端把焦點還給表單。 */
  onExited: () => void;
};

export function DedupHintDialog({
  hint,
  busy,
  onViewCandidate,
  onProceedAnyway,
  onBack,
  onExited,
}: DedupHintDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('tablet'));
  const reduceMotion = useMediaQuery(REDUCED_MOTION);
  const titleId = useId();
  const descriptionId = useId();
  const proceedHelperId = useId();
  const uuid = hint?.relatedTicketUuid ?? '';

  const [{ data, fetching, error }] = useQuery({
    query: GetTicketSummaryDocument,
    variables: { uuid },
    pause: !hint,
  });
  const ticket = useFragment(
    TicketSummaryFieldsFragmentDoc,
    data?.ticket ?? null,
  );
  const summaryMissing = !fetching && (Boolean(error) || !ticket);

  const close = () => {
    if (!busy) {
      onBack();
    }
  };

  // disablePortal 讓 dialog 留在 Drawer 的 DOM 樹內，Escape 會冒泡到 Drawer、
  // 把整個抽屜連同草稿關掉，所以在這裡攔下。
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  const handleViewCandidate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onViewCandidate();
  };

  const paperSx = isMobile
    ? { borderRadius: 0, border: 'none', boxShadow: 'none' }
    : {
        borderRadius: 3,
        border: `1px solid ${palette.border}`,
        boxShadow: '0 18px 48px rgba(15, 63, 117, 0.16)',
        m: 2,
        width: 'calc(100% - 32px)',
      };

  return (
    <Dialog
      open={hint !== null}
      onClose={close}
      onKeyDown={handleKeyDown}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      data-testid="dedup-hint-dialog"
      // portal 到 body 的話，外層 Drawer 的 ModalManager 會把它標成 aria-hidden，輔助技術就找不到。
      disablePortal
      transitionDuration={reduceMotion ? 0 : undefined}
      slotProps={{
        backdrop: { sx: { backgroundColor: 'rgba(15, 63, 117, 0.28)' } },
        paper: {
          sx: { bgcolor: palette.surface, backgroundImage: 'none', ...paperSx },
        },
        transition: { onExited },
      }}
    >
      <DialogTitle
        id={titleId}
        sx={{
          px: 2.5,
          pt: 2.5,
          pb: 1,
          fontSize: 20,
          fontWeight: 800,
          lineHeight: 1.35,
          color: palette.heading,
        }}
      >
        附近可能有相同需求
      </DialogTitle>

      <DialogContent sx={{ px: 2.5, pb: 1 }}>
        <Stack spacing={2}>
          <Typography id={descriptionId} sx={bodyTextSx}>
            我們找到一張很像的求助單。如果是同一件事，去那張單看看就好，不用再開一張；如果不是，可以另外開單，系統會分開追蹤。
          </Typography>
          <CandidateCard
            ticket={summaryMissing ? null : ticket}
            loading={fetching && !ticket}
          />
        </Stack>
      </DialogContent>

      <Stack spacing={1} sx={{ px: 2.5, pt: 1, pb: 2.5 }}>
        <Button
          component="a"
          href={buildCandidateHref(uuid, ticket?.geometry)}
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          autoFocus
          fullWidth
          disabled={busy}
          aria-label="去看看這張求助單（開新分頁）"
          onClick={handleViewCandidate}
          sx={{
            ...pillButtonSx,
            bgcolor: palette.primary,
            color: palette.primaryText,
            boxShadow: 'none',
            textDecoration: 'none',
            '&:hover': {
              bgcolor: palette.primaryHover,
              boxShadow: 'none',
              textDecoration: 'none',
            },
          }}
        >
          去看看這張求助單
        </Button>
        <Stack spacing={0.5}>
          <Button
            variant="outlined"
            fullWidth
            disabled={busy}
            aria-describedby={proceedHelperId}
            onClick={onProceedAnyway}
            sx={{
              ...pillButtonSx,
              borderColor: palette.secondaryBorder,
              color: palette.secondaryText,
              '&:hover': {
                borderColor: palette.primary,
                bgcolor: palette.sectionSurface,
              },
            }}
          >
            {busy ? '建立中…' : '不是同一件事，另外開單'}
          </Button>
          <Typography
            id={proceedHelperId}
            sx={{ ...bodyTextSx, px: 0.5, fontSize: 12, lineHeight: 1.6 }}
          >
            會建立新的求助單，兩張單分開追蹤
          </Typography>
        </Stack>
        <Button
          variant="text"
          fullWidth
          disabled={busy}
          onClick={onBack}
          sx={{ ...pillButtonSx, color: palette.secondaryText }}
        >
          回去修改
        </Button>
      </Stack>
    </Dialog>
  );
}

/** 候選單摘要：載入中顯示骨架，讀不到就請使用者直接開啟。 */
function CandidateCard({
  ticket,
  loading,
}: {
  ticket: TicketSummaryFieldsFragment | null;
  loading: boolean;
}) {
  const animation = useMediaQuery(REDUCED_MOTION) ? false : 'pulse';
  const createdAt = formatCreatedAt(ticket?.createdAt);

  return (
    <Stack
      spacing={1}
      sx={{
        p: 1.5,
        borderRadius: 3,
        border: `1px solid ${palette.border}`,
        bgcolor: palette.sectionSurface,
      }}
    >
      {loading ? (
        <Stack spacing={1} aria-hidden>
          <Skeleton
            variant="text"
            width="84%"
            height={28}
            animation={animation}
          />
          <Skeleton
            variant="rounded"
            width={72}
            height={24}
            animation={animation}
          />
          <Skeleton
            variant="text"
            width="46%"
            height={18}
            animation={animation}
          />
        </Stack>
      ) : !ticket ? (
        <Typography sx={bodyTextSx}>
          找不到這張單的內容，可以直接開啟看看
        </Typography>
      ) : (
        <>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 800,
              lineHeight: 1.4,
              color: palette.heading,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {ticket.title}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: 'wrap', alignItems: 'center' }}
          >
            {ticket.status ? (
              <Chip
                size="small"
                label={formatTicketStatusLabel(ticket.status)}
                sx={{
                  height: 24,
                  fontWeight: 700,
                  bgcolor: palette.surface,
                  color: palette.secondaryText,
                  border: `1px solid ${palette.border}`,
                }}
              />
            ) : null}
            {ticket.taskType ? (
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: palette.secondaryText,
                }}
              >
                {mapTaskTypeLabel(ticket.taskType)}
              </Typography>
            ) : null}
          </Stack>
          {createdAt ? (
            <Typography sx={{ fontSize: 12, color: palette.bodyText }}>
              {createdAt}
            </Typography>
          ) : null}
        </>
      )}
    </Stack>
  );
}
