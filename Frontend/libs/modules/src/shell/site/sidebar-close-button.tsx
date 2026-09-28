'use client';

import { ButtonBase } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { getRescueColorScheme, Icons } from '@rescue-frontend/ui';

const CloseIcon = Icons.close;

interface SidebarCloseButtonProps {
  onClick?: () => void;
  ariaControls?: string;
}

export function SidebarCloseButton({
  onClick,
  ariaControls,
}: SidebarCloseButtonProps) {
  const sidebarPalette = getRescueColorScheme(useTheme()).adminShell.sidebar;

  return (
    <ButtonBase
      disableRipple
      aria-label="關閉側欄"
      aria-controls={ariaControls}
      aria-expanded
      onClick={onClick}
      sx={{
        width: 32,
        height: 32,
        borderRadius: '12px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: sidebarPalette.heading,
        transition: 'background-color 120ms ease',
        '&:hover': {
          bgcolor: 'rgba(119, 213, 254, 0.18)',
        },
      }}
    >
      <CloseIcon sx={{ fontSize: 18 }} />
    </ButtonBase>
  );
}
