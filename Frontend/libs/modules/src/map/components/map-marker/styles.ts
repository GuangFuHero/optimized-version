import { designTokens, displayTextSizeCss } from '@rescue-frontend/ui';

const { color, radius, shadow, typography, motion } = designTokens;

/**
 * Leaflet divIcon styling for map markers.
 *
 * Mirrors the `.wg-marker*` rules in `Design/前台/js/site/site.css`. Two details from there are
 * load-bearing rather than cosmetic:
 *
 * - The pin is a filled circle with a 2px surface-coloured ring. Over satellite or terrain tiles a
 *   flat fill loses its edge; the ring is what keeps the marker legible on any basemap.
 * - The label is a pill on an opaque surface, not a tinted rectangle. Tile imagery shows through
 *   anything translucent, and a station name is one of the most-read strings on this screen.
 */
export const rescueMapMarkerStyles = {
  '.map-marker-wrapper': {
    background: 'none',
    border: 0,
  },
  '.map-marker-stack': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${designTokens.spacing[1]}px`,
  },
  '.map-marker': {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: `${radius.full}px`,
    display: 'grid',
    placeItems: 'center',
    lineHeight: 0,
    whiteSpace: 'nowrap',
    overflow: 'visible',
    border: `2px solid ${color.bg.neutral.default}`,
    boxShadow: shadow.md,
    transition: `transform ${motion.transition.spring}`,
  },
  '.map-marker--ticket': {
    background: color.bg.primary.default,
    color: color.fg.onPrimary,
  },
  '.map-marker--station': {
    background: color.brand.secondary.default,
    color: color.fg.onSecondary,
  },
  '.map-marker--active': {
    transform: 'scale(1.18)',
    boxShadow: shadow.lg,
    outline: `3px solid ${color.brand.secondary.default}`,
    outlineOffset: 2,
  },
  '.map-marker-wrapper:hover .map-marker': {
    transform: 'translateY(-2px) scale(1.06)',
  },
  '.map-marker__asset': {
    position: 'relative',
    display: 'block',
    width: 36,
    height: 36,
  },
  '.map-marker__asset svg': {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  '.map-marker__label': {
    maxWidth: 168,
    padding: '3px 10px',
    borderRadius: `${radius.full}px`,
    background: color.bg.neutral.default,
    border: `1px solid ${color.border.default}`,
    boxShadow: shadow.sm,
  },
  '.map-marker__label--ticket': {
    borderColor: color.border.accent,
  },
  '.map-marker__label--station': {
    borderColor: color.brand.secondary.default,
  },
  '.map-marker__label-text': {
    display: 'block',
    fontFamily: typography.label[400].fontFamily,
    ...displayTextSizeCss(11),
    lineHeight: 1.35,
    fontWeight: 700,
    color: color.fg.neutral.default,
    letterSpacing: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // ── An open building's entry on the site's map (`RescueMapMarkerItem.building`): square-cornered,
  // the outline of a building, apart from the round pin of a ticket and a guest's hexagon. ──
  '.map-building': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: `${radius.sm}px`,
    background: color.bg.neutral.default,
    border: `2px solid ${color.bg.primary.default}`,
    boxShadow: shadow.md,
    color: color.fg.neutral.default,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: `transform ${motion.transition.spring}`,
  },
  // A sentence, not a count: a size down from a number, in the body face.
  '.map-building__text': {
    fontFamily: typography.body[300].fontFamily,
    ...displayTextSizeCss(12),
    lineHeight: 1,
    fontWeight: 600,
  },
  // A count, in the data face, a size up from the sentence.
  '.map-building__count': {
    fontFamily: typography.data[300].fontFamily,
    ...displayTextSizeCss(13),
    lineHeight: 1,
    fontWeight: 700,
  },
  // 缺 M on red, as the list and the floors' drawer say a shortfall.
  '.map-building__short': {
    padding: '2px 6px',
    borderRadius: `${radius.full}px`,
    background: color.bg.danger.default,
    color: color.fg.onDanger,
    fontFamily: typography.data[300].fontFamily,
    ...displayTextSizeCss(11),
    lineHeight: 1.3,
    fontWeight: 700,
  },
  '.map-marker-wrapper:hover .map-building': {
    transform: 'scale(1.04)',
  },
  // ── Opt-in teardrop pin (`RescueMapMarkerItem.pin`) — admin station map only. ──
  '.map-pin-wrapper': {
    background: 'none',
    border: 0,
  },
  '.map-pin': {
    width: 42,
    height: 42,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    cursor: 'pointer',
    transition: `transform ${motion.transition.spring}`,
  },
  '.map-pin__drop': {
    display: 'block',
    width: 22,
    height: 22,
    borderRadius: '50% 50% 50% 0',
    transform: 'rotate(-45deg)',
    boxShadow: '0 3px 8px rgba(15, 23, 42, 0.24)',
  },
  // A 開啟空間 space: the drop's box, unrotated (designer §開啟空間 3).
  '.map-pin--square .map-pin__drop': {
    width: 26,
    height: 26,
    borderRadius: 6,
    transform: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '.map-pin--dimmed .map-pin__drop': {
    opacity: 0.45,
  },
  '.map-pin--selected': {
    transform: 'scale(1.18)',
  },
  '.map-pin--selected .map-pin__drop': {
    outline: `3px solid ${color.bg.neutral.default}`,
    outlineOffset: 2,
    border: `2px solid ${color.fg.neutral.default}`,
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.34)',
  },
  '.map-pin-wrapper:hover .map-pin:not(.map-pin--selected)': {
    transform: 'translateY(-2px) scale(1.06)',
  },
  '.leaflet-tooltip.map-marker-tooltip': {
    minWidth: 170,
    padding: '8px 10px',
    borderRadius: `${radius.md}px`,
    border: `1px solid ${color.border.default}`,
    boxShadow: shadow.md,
    whiteSpace: 'normal',
  },
  '.map-marker-tooltip__title': {
    display: 'block',
    ...typography.label[400],
    color: color.fg.neutral.default,
  },
  '.map-marker-tooltip__subtitle': {
    display: 'block',
    marginTop: 2,
    ...typography.body[300],
    color: color.fg.neutral.subtle,
  },
} as const;
