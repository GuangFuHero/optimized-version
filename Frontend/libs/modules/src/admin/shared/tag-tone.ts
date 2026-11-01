import type { BadgeTone, TagTone } from '@rescue-frontend/ui';

/**
 * A tone from a table kept for Badge (shared with the public site) as Tag names it: Badge's primary
 * is Tag's brand, the rest are the same.
 */
export function tagToneOf(tone: BadgeTone): TagTone {
  return tone === 'primary' ? 'brand' : tone;
}
