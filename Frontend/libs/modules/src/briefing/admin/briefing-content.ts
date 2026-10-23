import type {
  AdminBriefingsQuery,
  AdminBriefingTemplatesQuery,
} from '@rescue-frontend/data-access/admin';

export type Briefing = AdminBriefingsQuery['briefings'][number];
export type BriefingTemplate =
  AdminBriefingTemplatesQuery['briefingTemplates'][number];

export type EditorSelection =
  | { kind: 'new'; template?: BriefingTemplate }
  | { kind: 'edit'; briefing: Briefing };

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
