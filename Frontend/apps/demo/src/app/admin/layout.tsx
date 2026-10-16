import { Container } from '@mui/material';
import { BackOfficePlaceholder } from '@rescue-frontend/modules';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '後台 - 島嶼守望',
  description: '後台正在準備中',
};

/**
 * The back office until it is rebuilt: the site's 前往後台 leads here. The
 * legacy `/admin/*` pages below are to be replaced wholesale, so every one of them shows this
 * placeholder instead; when the new back office lands, only this layout changes, not the button.
 */
export default function AdminRouteLayout() {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 4 } }}>
      <BackOfficePlaceholder />
    </Container>
  );
}
