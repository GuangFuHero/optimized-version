import type {
  InvalidateSizeOptions,
  LatLngExpression,
  Map,
  MapOptions,
} from 'leaflet';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';

export interface MapContainerProps extends ComponentPropsWithoutRef<'div'> {
  /** The view and map options are read when the map is created. */
  center: LatLngExpression;
  zoom: number;
  options?: Omit<MapOptions, 'center' | 'zoom'>;
  resizeOptions?: InvalidateSizeOptions;
}

interface MapRuntime {
  map: Map;
  leaflet: typeof import('leaflet');
}

type LoadState =
  | { kind: 'ready'; runtime: MapRuntime }
  | { kind: 'failed'; error: Error };

const MapContext = createContext<MapRuntime | null>(null);

export function useMapRuntime(): MapRuntime {
  const runtime = useContext(MapContext);
  if (!runtime) {
    throw new Error(
      'Leaflet components and useMap must be inside a MapContainer.',
    );
  }
  return runtime;
}

export function useMap(): Map {
  return useMapRuntime().map;
}

export function MapContainer({
  center,
  zoom,
  options,
  resizeOptions,
  children,
  ...hostProps
}: MapContainerProps) {
  const initial = useRef({ center, zoom, options, resizeOptions });
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Map | null>(null);
  const effectRun = useRef(0);
  const [state, setState] = useState<LoadState | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const run = ++effectRun.current;
    let cancelled = false;

    const load = async () => {
      try {
        const { default: leaflet } = await import('leaflet');
        if (cancelled) return;

        const start = initial.current;
        const currentMap = leaflet.map(element, {
          ...start.options,
          center: start.center,
          zoom: start.zoom,
        });
        instance.current = currentMap;

        setState({ kind: 'ready', runtime: { map: currentMap, leaflet } });
      } catch (cause) {
        if (!cancelled) {
          setState({
            kind: 'failed',
            error:
              cause instanceof Error
                ? cause
                : new Error('Could not initialize the Leaflet map.'),
          });
        }
      }
    };

    if (!instance.current) void load();

    const removeUnlessReplayed = () => {
      if (effectRun.current !== run || !instance.current) return;
      const map = instance.current;
      instance.current = null;
      setState(null);
      map.remove();
    };
    return () => {
      cancelled = true;
      // Fast Refresh can replay effects with children still holding this map.
      queueMicrotask(removeUnlessReplayed);
    };
  }, []);
  const map = state?.kind === 'ready' ? state.runtime.map : null;
  useEffect(() => {
    if (!map || typeof ResizeObserver === 'undefined') return;

    let observing = true;
    const observer = new ResizeObserver(() => {
      if (observing) map.invalidateSize(initial.current.resizeOptions);
    });
    observer.observe(map.getContainer());
    return () => {
      observing = false;
      observer.disconnect();
    };
  }, [map]);

  if (state?.kind === 'failed') throw state.error;

  return (
    <>
      <div {...hostProps} ref={host} />
      {state?.kind === 'ready' && (
        <MapContext.Provider value={state.runtime}>
          {children}
        </MapContext.Provider>
      )}
    </>
  );
}
