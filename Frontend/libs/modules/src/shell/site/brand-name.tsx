'use client';

import { Typography, type SxProps, type Theme } from '@mui/material';
import { useEffect, useState } from 'react';

import {
  CURRENT_DISASTER_WAIT_MS,
  useCurrentDisaster,
} from '@rescue-frontend/data-access/admin';

import { siteBrandName } from './event-name';

/** The name beside the logo (`siteBrandName`), cut short with an ellipsis where it has no room. */
export function SiteBrandName({ sx }: { sx?: SxProps<Theme> }) {
  // `isLoading`, not `isPending`: a read held back offline is pending but not loading.
  const { data, isPending, isLoading } = useCurrentDisaster();
  const [waitedOut, setWaitedOut] = useState(false);

  // As long as a map waits for the event, counted while there is no answer, held back or not.
  useEffect(() => {
    if (!isPending) {
      return;
    }

    const timer = window.setTimeout(
      () => setWaitedOut(true),
      CURRENT_DISASTER_WAIT_MS,
    );

    return () => window.clearTimeout(timer);
  }, [isPending]);

  const { label, fullName, minWidth } = siteBrandName(data?.currentDisaster, {
    loading: isLoading,
    waitedOut,
  });

  return (
    <Typography
      noWrap
      title={fullName ?? undefined}
      sx={[{ minWidth }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {label}
    </Typography>
  );
}
