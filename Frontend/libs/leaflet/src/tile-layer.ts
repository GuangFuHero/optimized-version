import type { TileLayerOptions } from 'leaflet';
import { useEffect, useEffectEvent } from 'react';
import { useMapRuntime } from './map-container.tsx';

export interface TileLayerProps {
  url: string;
  /** Changes to the URL replace the layer with the current options. */
  options?: TileLayerOptions;
}

export function TileLayer({ url, options }: TileLayerProps) {
  const { map, leaflet } = useMapRuntime();
  const getOptions = useEffectEvent(() => options);

  useEffect(() => {
    const layer = leaflet.tileLayer(url, getOptions()).addTo(map);
    return () => {
      layer.remove();
    };
  }, [leaflet, map, url]);

  return null;
}
