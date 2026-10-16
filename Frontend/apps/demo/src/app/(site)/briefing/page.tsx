import { Container } from '@mui/material';
import { BriefingPlaceholder } from '@rescue-frontend/modules';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '行前資訊 - 島嶼守望',
  description: '出發前要知道的事：怎麼過來、帶什麼、到了找誰',
};

export default function BriefingPage() {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 4 } }}>
      <BriefingPlaceholder />
    </Container>
  );
}
