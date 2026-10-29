'use client';

import { Typography, type SxProps, type Theme } from '@mui/material';

import { useCurrentDisaster } from '@rescue-frontend/data-access/admin';

import { siteBrandName } from './event-name';

/** The name beside the logo (`siteBrandName`), cut short with an ellipsis where it has no room. */
export function SiteBrandName({ sx }: { sx?: SxProps<Theme> }) {
  const { data, isPending } = useCurrentDisaster();
  const { label, fullName } = siteBrandName(data?.currentDisaster, {
    pending: isPending,
  });

  return (
    <Typography noWrap title={fullName ?? undefined} sx={sx}>
      {label}
    </Typography>
  );
}
