import { Container } from '@mui/material';
import { BackOfficePlaceholder } from '@rescue-frontend/modules';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '管理平台 - 島嶼守望',
  description: '管理平台正在準備中',
};

/**
 * The site's 前往管理平台 lands here until the admin app is deployed and `ADMIN_APP_URL` redirects `/admin/*` to it.
 */
export default function AdminRouteLayout() {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 4 } }}>
      <BackOfficePlaceholder />
    </Container>
  );
}
