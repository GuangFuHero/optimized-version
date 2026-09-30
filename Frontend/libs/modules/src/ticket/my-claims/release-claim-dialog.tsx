'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import PersonRemoveRoundedIcon from '@mui/icons-material/PersonRemoveRounded';
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

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { MyClaim } from './my-claims';

const { color, radius, shadow } = designTokens;

interface ReleaseClaimDialogProps {
  open: boolean;
  /** The place being given back — still set while the dialog fades out, so it keeps its content. */
  claim: MyClaim | null;
  /** Why the last try was refused, already in the volunteer's words. */
  error: string | null;
  submitting: boolean;
  /** Nothing left to confirm: the place went back already, or its need was stopped meanwhile. */
  settled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * One look before a place goes back (spec Q48). Like the claim, it is a promise to the scene, and
 * once given back the place may be taken by someone else at once: nothing undoes it. Same shape as
 * the claim confirmation (`NeedClaimDialog`).
 */
export function ReleaseClaimDialog({
  open,
  claim,
  error,
  submitting,
  settled,
  onCancel,
  onConfirm,
}: ReleaseClaimDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
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
        釋出這個名額？
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
            <Typography
              sx={{
                color: color.fg.neutral.default,
                fontSize: displayTextSize[16],
                lineHeight: 1.4,
                fontWeight: 700,
              }}
            >
              {claim?.needName}
            </Typography>
            <Stack
              direction="row"
              sx={{
                mt: 0.75,
                gap: 0.75,
                alignItems: 'flex-start',
                color: color.fg.neutral.subtle,
              }}
            >
              <AssignmentRoundedIcon sx={{ fontSize: 14, mt: '3px' }} />
              <Typography
                sx={{ fontSize: displayTextSize[13], lineHeight: 1.6 }}
              >
                {claim?.ticketTitle}
              </Typography>
            </Stack>
          </Box>

          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[13],
              lineHeight: 1.6,
            }}
          >
            釋出後名額會開放給其他人，想再去要重新承接。
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
          disabled={submitting || settled || !claim}
          variant="contained"
          disableElevation
          startIcon={<PersonRemoveRoundedIcon />}
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.primary.default,
            color: color.fg.onPrimary,
            '&:hover': { bgcolor: color.bg.primary.hover },
            '&.Mui-disabled': {
              bgcolor: color.bg.disable,
              color: color.fg.disable,
            },
          }}
        >
          {submitting ? '釋出中...' : '釋出名額'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
