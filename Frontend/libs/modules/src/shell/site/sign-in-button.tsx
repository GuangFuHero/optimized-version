'use client';

import {
  Button,
  designTokens,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';

const { color } = designTokens;

/**
 * The guest sign-in button keeps its label in both top bars. The phone bar uses less padding to
 * leave room for the search box.
 */
export function SiteSignInButton({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      startIcon={
        <Icons.logIn
          sx={{
            fontSize: designTokens.iconSize[16],
          }}
        />
      }
      onClick={onClick}
      sx={{
        flexShrink: 0,
        minHeight: 40,
        whiteSpace: 'nowrap',
        fontSize: displayTextSize[14],
        px: compact ? '14px' : '24px',
        // The secondary Button's white label falls below 4.5:1 on this blue.
        color: color.fg.onSecondary,
        '&:hover': { bgcolor: color.bg.secondary.hover },
      }}
    >
      登入
    </Button>
  );
}
