import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getStationTypeIcon } from '../../../station/type-options';

type StationTypeIcon = ReturnType<typeof getStationTypeIcon>;

const shapesByIcon = new Map<StationTypeIcon, string>();

/**
 * A station type's icon as the shapes inside its 24×24 `<svg>`, for a pin: Leaflet takes a pin as
 * HTML, not as a React element. It is the list row's icon (`getStationTypeIcon`), so the two never
 * disagree, drawn once per icon and kept. Only what is inside the `<svg>` is used, so none of MUI's
 * classes come along.
 *
 * `renderToStaticMarkup`, not `createRoot` and `flushSync` on a detached element: pins are made in
 * an effect, and there React will not render another root synchronously — it warns and leaves the
 * element empty.
 */
export function stationTypeGlyphShapes(type?: string | null): string {
  const icon = getStationTypeIcon(type);
  let shapes = shapesByIcon.get(icon);

  if (shapes === undefined) {
    // Without a document (tests, a server render), emotion writes the icon's styles in front of it.
    const markup = renderToStaticMarkup(createElement(icon));
    const start = markup.indexOf('>', markup.indexOf('<svg')) + 1;

    shapes = markup.slice(start, markup.lastIndexOf('</svg>'));
    shapesByIcon.set(icon, shapes);
  }

  return shapes;
}
