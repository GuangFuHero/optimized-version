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
} as const;
