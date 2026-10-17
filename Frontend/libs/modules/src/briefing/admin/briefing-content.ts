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
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
