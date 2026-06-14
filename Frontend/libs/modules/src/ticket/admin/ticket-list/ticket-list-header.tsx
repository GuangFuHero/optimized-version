'use client';

import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { Icons } from '@rescue-frontend/ui';
import { TicketListIconSlot, ticketListPalette } from './ticket-list-primitives';
import type { TicketListActionItem, TicketListHeaderProps } from './types';

const PlusIcon = Icons.plus;

function createDefaultActions(): readonly TicketListActionItem[] {
  return [
    {
      id: 'export',
      label: '匯出',
      icon: <FileUploadRoundedIcon />,
      variant: 'outlined',
    },
    {
      id: 'field-config',
      label: '欄位設定',
      icon: <TuneRoundedIcon />,
      variant: 'outlined',
    },
    {
      id: 'new-ticket',
      label: '新增任務',
      icon: <PlusIcon />,
      variant: 'filled',
    },
  ];
}

function HeaderActionPill({
  label,
  icon,
  ariaLabel,
  onClick,
  variant = 'outlined',
}: TicketListActionItem) {
  const isFilled = variant === 'filled';

  return (
    <ButtonBase
      disableRipple
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      sx={{
        height: isFilled ? 32 : 34,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: isFilled ? 2 : '17px',
        borderRadius: '999px',
        border: isFilled
          ? '1px solid transparent'
          : `1px solid ${ticketListPalette.frameBorder}`,
        bgcolor: isFilled
          ? ticketListPalette.actionFilled
          : ticketListPalette.actionSurface,
        color: isFilled
          ? ticketListPalette.actionFilledText
          : ticketListPalette.strongText,
        transition: 'background-color 120ms ease, border-color 120ms ease',
        '&:hover': {
          bgcolor: isFilled
            ? ticketListPalette.actionFilled
            : ticketListPalette.actionHover,
        },
      }}
    >
      <TicketListIconSlot
        icon={icon}
        width={isFilled ? 12 : 14}
        height={isFilled ? 12 : 14}
        color={
          isFilled
            ? ticketListPalette.actionFilledText
            : ticketListPalette.strongText
        }
      />
      <Typography
        sx={{
          color: 'inherit',
          fontSize: 12,
          lineHeight: '16px',
          fontWeight: 600,
          letterSpacing: '0.6px',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

export function TicketListHeader({
  title = '任務管理',
  actions = createDefaultActions(),
}: TicketListHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 3,
        px: { mobile: 2, tablet: 3, desktop: 4 },
        pt: 2,
        pb: '17px',
        bgcolor: ticketListPalette.headerSurface,
        borderBottom: `1px solid ${ticketListPalette.frameBorder}`,
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: 'center',
          minWidth: 0,
          display: { mobile: 'none', tablet: 'flex' },
        }}
      >
        <Typography
          sx={{
            color: ticketListPalette.heading,
            fontSize: { mobile: 24, tablet: 28, desktop: 32 },
            lineHeight: { mobile: '32px', tablet: '36px', desktop: '40px' },
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Typography>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
          rowGap: 1,
        }}
      >
        {actions.map((action) => (
          <HeaderActionPill key={action.id} {...action} />
        ))}
      </Stack>
    </Box>
  );
}
