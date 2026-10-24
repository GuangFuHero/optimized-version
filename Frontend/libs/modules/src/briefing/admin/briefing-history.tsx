'use client';

import { Stack } from '@mui/material';
import { FilePlus, PencilLine, Send } from 'lucide-react';

import { BriefingStatus } from '@rescue-frontend/data-access/admin';
import {
  Callout,
  Card,
  Timeline,
  type TimelineItem,
} from '@rescue-frontend/ui';

import type { Briefing } from './briefing-content';

export function BriefingHistory({
  briefings,
  versions,
}: {
  briefings: Briefing[];
  versions: Briefing[];
}) {
  const items = briefings
    .flatMap((briefing) => {
      const events: TimelineItem[] = [];
      if (briefing.createdAt) {
        events.push({
          id: `${briefing.uuid}:created`,
          at: briefing.createdAt,
          title: '建立草稿',
          actor: briefing.creator?.name ?? '操作者未提供',
          icon: <FilePlus />,
        });
      }
      if (briefing.publishedAt) {
        const versionIndex = versions.findIndex(
          (version) => version.uuid === briefing.uuid,
        );
        events.push({
          id: `${briefing.uuid}:published`,
          at: briefing.publishedAt,
          title:
            versionIndex === -1
              ? '發布到前台'
              : `發布第 ${versions.length - versionIndex} 版到前台`,
          actor: briefing.publisher?.name ?? '操作者未提供',
          icon: <Send />,
          tone: 'primary',
        });
      }
      if (
        briefing.status === BriefingStatus.Draft &&
        briefing.updatedAt &&
        (!briefing.createdAt ||
          new Date(briefing.updatedAt).getTime() >
            new Date(briefing.createdAt).getTime())
      ) {
        events.push({
          id: `${briefing.uuid}:updated`,
          at: briefing.updatedAt,
          title: '草稿最近更新',
          actor: briefing.updater?.name ?? '操作者未提供',
          icon: <PencilLine />,
        });
      }
      return events;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <Stack sx={{ gap: 2 }}>
      <Callout tone="info">
        這是部分紀錄，依目前保留的行前資訊整理，僅列出建立、發布及草稿最近一次更新。
        不包含每次儲存、已丟棄草稿或下架紀錄，也無法回看草稿修改前的內容。
      </Callout>
      <Card>
        <Timeline items={items} showIcons emptyText="目前沒有可顯示的紀錄。" />
      </Card>
    </Stack>
  );
}
