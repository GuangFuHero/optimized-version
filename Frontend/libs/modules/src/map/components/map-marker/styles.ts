export const rescueMapMarkerStyles = {
  '.map-marker-wrapper': {
    background: 'transparent',
    border: 'none',
  },
  '.map-marker-stack': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  '.map-marker': {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    whiteSpace: 'nowrap',
    overflow: 'visible',
    width: 36,
    height: 36,
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
    backgroundColor: '#e7eff7',
    border: '1px solid transparent',
    padding: '3px 9px',
    borderRadius: 0,
  },
  '.map-marker__label--ticket': {
    borderColor: '#e3a269',
  },
  '.map-marker__label--station': {
    borderColor: '#7eaecb',
  },
  '.map-marker__label-text': {
    display: 'block',
    color: '#151c22',
    fontWeight: 700,
    fontSize: 10,
    lineHeight: '12px',
    letterSpacing: 0,
    whiteSpace: 'nowrap',
  },
} as const;
