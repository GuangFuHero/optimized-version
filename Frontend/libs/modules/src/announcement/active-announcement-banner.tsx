'use client';

import {
  latestAnnouncementForTarget,
  type AnnouncementTarget,
} from '@rescue-frontend/data-access';
import {
  AnnouncementFilter,
  useAnnouncements,
} from '@rescue-frontend/data-access/admin';
import { AnnouncementBanner } from '@rescue-frontend/ui';

export function ActiveAnnouncementBanner({
  target,
}: {
  target: AnnouncementTarget;
}) {
  const { data } = useAnnouncements(
    { filter: AnnouncementFilter.Active, placement: target },
    { refetchInterval: 30_000 },
  );
  const announcement = latestAnnouncementForTarget(
    data?.announcements ?? [],
    target,
  );

  return announcement ? (
    <AnnouncementBanner>{announcement.content}</AnnouncementBanner>
  ) : null;
}
