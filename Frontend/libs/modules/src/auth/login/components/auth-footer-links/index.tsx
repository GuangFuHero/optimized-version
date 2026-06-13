'use client';

import { Link, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ElementType, MouseEventHandler } from 'react';

import { getAuthColorScheme } from '../../theme/auth-theme';

interface AuthFooterLinkItem {
  label: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
}

interface AuthFooterLinksProps {
  items: readonly AuthFooterLinkItem[];
  linkComponent?: ElementType;
}

export function AuthFooterLinks({
  items,
  linkComponent,
}: AuthFooterLinksProps) {
  const authPalette = getAuthColorScheme(useTheme());

  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
      }}
    >
      {items.map((item, index) => {
        const linkProps =
          item.href && linkComponent
            ? { component: linkComponent, href: item.href }
            : { href: item.href };

        return (
          <Stack
            key={`${item.label}-${index}`}
            direction="row"
            sx={{ alignItems: 'center', gap: 2 }}
          >
            {index > 0 ? (
              <Typography
                sx={{
                  color: authPalette.textSecondary,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                •
              </Typography>
            ) : null}

            <Link
              {...linkProps}
              underline="none"
              onClick={item.onClick}
              sx={{
                color: authPalette.textSecondary,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: item.onClick ? 'pointer' : 'inherit',
              }}
            >
              {item.label}
            </Link>
          </Stack>
        );
      })}
    </Stack>
  );
}
