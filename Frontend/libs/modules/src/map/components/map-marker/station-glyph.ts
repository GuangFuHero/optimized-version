import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';

import { getStationTypeLucideIcon } from '../../../station/station-type-icon';

const shapesByIcon = new Map<LucideIcon, string>();

/**
 * A station type's icon as the shapes inside its 24×24 `<svg>`, for a pin: Leaflet takes a pin as
 * HTML, not as a React element. It is the list row's icon (`getStationTypeLucideIcon`), so the two
 * never disagree, drawn once per icon and kept. Only what is inside the `<svg>` is used: the pin's
 * own `<svg>` sets the stroke.
 *
 * `renderToStaticMarkup`, not `createRoot` and `flushSync` on a detached element: pins are made in
 * an effect, and there React will not render another root synchronously — it warns and leaves the
 * element empty.
 */
export function stationTypeGlyphShapes(type?: string | null): string {
  const icon = getStationTypeLucideIcon(type);
  let shapes = shapesByIcon.get(icon);

  if (shapes === undefined) {
    const markup = renderToStaticMarkup(createElement(icon));
    const start = markup.indexOf('>', markup.indexOf('<svg')) + 1;

    shapes = markup.slice(start, markup.lastIndexOf('</svg>'));
    shapesByIcon.set(icon, shapes);
  }

  return shapes;
}
