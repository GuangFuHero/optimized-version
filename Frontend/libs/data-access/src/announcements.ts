import {
  AnnouncementPlacement,
  type AnnouncementType,
} from './admin/graphql/__generated__/graphql';

export type AnnouncementTarget = Exclude<
  AnnouncementPlacement,
  typeof AnnouncementPlacement.All
>;

export function latestAnnouncementForTarget<
  T extends Pick<
    AnnouncementType,
    'uuid' | 'active' | 'placement' | 'createdAt'
  >,
>(announcements: readonly T[], target: AnnouncementTarget): T | undefined {
  return announcements.reduce<T | undefined>((latest, announcement) => {
    if (
      !announcement.active ||
      (announcement.placement !== target &&
        announcement.placement !== AnnouncementPlacement.All)
    ) {
      return latest;
    }

    if (!latest) return announcement;

    const time = Date.parse(announcement.createdAt ?? '') || 0;
    const latestTime = Date.parse(latest.createdAt ?? '') || 0;
    return time > latestTime ||
      (time === latestTime && announcement.uuid > latest.uuid)
      ? announcement
      : latest;
  }, undefined);
}
