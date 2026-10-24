import { SiteBriefing } from '@rescue-frontend/modules/briefing';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '志工行前資訊 - 島嶼守望',
  description: '出發前要知道的事：怎麼參與、怎麼過來、帶什麼、到了要注意什麼',
};

export default function BriefingPage() {
  return <SiteBriefing />;
}
