'use client';

import { useState } from 'react';

import { countDetailOpenings } from '../detail-openings';

/** Retains the last content through the closing animation and counts actual reopenings. */
export function useMarkerDetail<T>(marker: T | null, selected: boolean) {
  const [state, setState] = useState({
    marker,
    displayMarker: marker,
    open: Boolean(marker),
    openings: 0,
  });
  if (marker !== state.marker || (!selected && state.open)) {
    setState({
      ...countDetailOpenings(state, marker ? true : selected && state.open),
      marker,
      displayMarker: marker ?? state.displayMarker,
    });
  }
  const setDetailOpen = (open: boolean) =>
    setState((current) =>
      current.open === open
        ? current
        : {
            ...current,
            ...countDetailOpenings(current, open),
          },
    );
  const setDisplayMarker = (displayMarker: T | null) =>
    setState((current) => ({ ...current, displayMarker }));
  return {
    displayMarker: state.displayMarker,
    detailOpen: state.open,
    detailOpenings: state.openings,
    setDetailOpen,
    setDisplayMarker,
  };
}
