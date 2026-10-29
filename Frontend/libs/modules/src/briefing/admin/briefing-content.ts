import { formatDistanceToNowStrict } from 'date-fns';
import { zhTW } from 'date-fns/locale';

import type {
  AdminBriefingsQuery,
  AdminBriefingTemplatesQuery,
} from '@rescue-frontend/data-access/admin';

export type Briefing = AdminBriefingsQuery['briefings'][number];
export type BriefingTemplate =
  AdminBriefingTemplatesQuery['briefingTemplates'][number];

export function briefingTitle(content: string) {
  return (
    content
      .split('\n')
      .find((line) => line.trim())
      ?.trim()
      .replace(/^#{1,6}\s+/, '')
      .slice(0, 60) || '未命名行前資訊'
  );
}

export function briefingTime(value: string) {
  return new Date(value).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function briefingAgo(value: string) {
  return formatDistanceToNowStrict(new Date(value), {
    addSuffix: true,
    roundingMethod: 'floor',
    locale: zhTW,
  });
}
