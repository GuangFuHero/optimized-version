import { Globe, Globe2, Lock } from 'lucide-react';

import { AnnouncementPlacement } from '@rescue-frontend/data-access/admin';
import { Badge, type BadgeTone } from '@rescue-frontend/ui';

export const ANNOUNCEMENT_TARGETS = [
  {
    value: AnnouncementPlacement.PublicPage,
    label: '前台',
    hint: '含未登入訪客',
    audience: '所有人都看得到，包含未登入的訪客。',
    Icon: Globe,
    tone: 'warning',
  },
  {
    value: AnnouncementPlacement.AdminPage,
    label: '後台',
    hint: '所有後台使用者',
    audience: '所有後台使用者都看得到，包含其他單位與其他團隊。',
    Icon: Lock,
    tone: 'info',
  },
  {
    value: AnnouncementPlacement.All,
    label: '前後台同時',
    hint: '兩邊同時發布',
    audience: '前台所有人與所有後台使用者都看得到，包含未登入的訪客。',
    Icon: Globe2,
    tone: 'secondary',
  },
] as const satisfies readonly {
  value: AnnouncementPlacement;
  label: string;
  hint: string;
  audience: string;
  Icon: typeof Globe;
  tone: BadgeTone;
}[];

export function AnnouncementTargetBadge({ placement }: { placement: string }) {
  const target = ANNOUNCEMENT_TARGETS.find(
    (target) => target.value === placement,
  );

  return target ? (
    <Badge tone={target.tone} icon={<target.Icon size={12} />}>
      {target.label}
    </Badge>
  ) : (
    <Badge>{placement}</Badge>
  );
}
