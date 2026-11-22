/// <reference types="leaflet.markercluster" preserve="true" />
import type {
  DivIconOptions,
  DivIcon,
  Icon,
  LeafletMouseEvent,
  Marker,
  MarkerCluster,
  MarkerClusterGroupOptions,
  LayerGroup,
  TooltipOptions,
} from 'leaflet';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type Ref,
} from 'react';
import { useMapRuntime } from './map-container.tsx';
import type { PolygonVertex } from './geometry.ts';

export interface MarkerItem {
  id: string;
  position: Readonly<PolygonVertex>;
}

export interface MarkerAppearance {
  icon?: DivIconOptions | DivIcon | Icon;
  zIndexOffset?: number;
  tooltip?: { content: string | HTMLElement; options?: TooltipOptions };
}

export interface MarkerClustering<Item> {
  options?: Omit<MarkerClusterGroupOptions, 'iconCreateFunction'>;
  icon?: (
    items: readonly Item[],
    cluster: MarkerCluster,
  ) => DivIconOptions | DivIcon | Icon;
  onHover?: (cluster: MarkerCluster) => void;
}

export interface MarkerLayerHandle {
  closeTooltips: () => void;
}

export interface MarkerLayerProps<Item extends MarkerItem> {
  items: readonly Item[];
  appearance?: (item: Item) => MarkerAppearance;
  /** Keep existing icons and tooltips while this key stays equal for a marker. */
  appearanceKey?: (item: Item) => string | number;
  /** Supply true for count icons, or options for a custom cluster layer. Read at mount. */
  cluster?: true | MarkerClustering<Item>;
  onClick?: (item: Item, event: LeafletMouseEvent) => void;
  onUpdate?: () => void;
  ref?: Ref<MarkerLayerHandle>;
}

interface MarkerEntry<Item> {
  item: Item;
  marker: Marker;
  appearanceKey: Item | string | number;
}

interface MarkerGroup<Item> {
  layer: LayerGroup;
  markers: globalThis.Map<string, MarkerEntry<Item>>;
  itemsByMarker: WeakMap<Marker, Item>;
}

const DEFAULT_PIN: DivIconOptions = { iconSize: [16, 16] };

export function MarkerLayer<Item extends MarkerItem>({
  items,
  appearance,
  appearanceKey,
  cluster,
  onClick,
  onUpdate,
  ref,
}: MarkerLayerProps<Item>) {
  const { map, leaflet } = useMapRuntime();
  const group = useRef<MarkerGroup<Item> | null>(null);
  const initialCluster = useRef(cluster);
  const click = useEffectEvent((item: Item, event: LeafletMouseEvent) =>
    onClick?.(item, event),
  );

  useImperativeHandle(
    ref,
    () => ({
      closeTooltips() {
        for (const { marker } of group.current?.markers.values() ?? []) {
          marker.closeTooltip();
        }
      },
    }),
    [],
  );

  const sync = useEffectEvent(() => {
    const current = group.current;
    if (!current) return;

    const { layer, markers, itemsByMarker } = current;
    const nextIds = new Set(items.map(({ id }) => id));
    for (const [id, { marker }] of markers) {
      if (!nextIds.has(id)) {
        markers.delete(id);
        itemsByMarker.delete(marker);
        layer.removeLayer(marker);
      }
    }

    const makeIcon = (appearance: MarkerAppearance) =>
      appearance.icon instanceof leaflet.Icon
        ? appearance.icon
        : leaflet.divIcon(appearance.icon ?? DEFAULT_PIN);

    for (const item of items) {
      const key = appearanceKey?.(item) ?? item;
      const entry = markers.get(item.id);
      const [lat, lng] = item.position;
      if (entry) {
        const marker = entry.marker;
        const previous = entry.item.position;
        entry.item = item;
        itemsByMarker.set(marker, item);
        if (previous[0] !== lat || previous[1] !== lng)
          marker.setLatLng([lat, lng]);
        if (entry.appearanceKey !== key) {
          const options = appearance?.(item) ?? {};
          marker.setIcon(makeIcon(options));
          marker.setZIndexOffset(options.zIndexOffset ?? 0);
          marker.unbindTooltip();
          if (options.tooltip)
            marker.bindTooltip(
              options.tooltip.content,
              options.tooltip.options,
            );
          entry.appearanceKey = key;
        }
        continue;
      }

      const options = appearance?.(item) ?? {};
      const marker = leaflet.marker([lat, lng], {
        icon: makeIcon(options),
        zIndexOffset: options.zIndexOffset ?? 0,
      });
      if (options.tooltip)
        marker.bindTooltip(options.tooltip.content, options.tooltip.options);
      const created = { item, marker, appearanceKey: key };
      marker.on('click', (event: LeafletMouseEvent) =>
        click(created.item, event),
      );
      markers.set(item.id, created);
      itemsByMarker.set(marker, item);
      layer.addLayer(marker);
    }
    onUpdate?.();
  });

  useEffect(() => {
    let cancelled = false;
    const itemsByMarker = new WeakMap<Marker, Item>();
    const attach = (layer: LayerGroup) => {
      layer.addTo(map);
      group.current = { layer, markers: new Map(), itemsByMarker };
      sync();
    };
    const clustering = initialCluster.current;
    if (!clustering) {
      attach(leaflet.layerGroup());
    } else {
      const options = clustering === true ? undefined : clustering;
      void import('leaflet.markercluster')
        .then(() => {
          if (cancelled) return;
          if (!Number.isFinite(map.getMaxZoom())) {
            attach(leaflet.layerGroup());
            return;
          }

          const layer = leaflet.markerClusterGroup({
            animate: false,
            animateAddingMarkers: false,
            chunkedLoading: true,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            ...options?.options,
            iconCreateFunction: (cluster) => {
              const items = cluster.getAllChildMarkers().flatMap((marker) => {
                const item = itemsByMarker.get(marker);
                return item ? [item] : [];
              });
              const icon = options?.icon?.(items, cluster) ?? {
                html: String(cluster.getChildCount()),
                iconSize: [28, 28],
              };
              return icon instanceof leaflet.Icon
                ? icon
                : leaflet.divIcon(icon);
            },
          });
          if (options?.onHover) {
            layer.on('clustermouseover', (event: { layer: MarkerCluster }) => {
              options.onHover?.(event.layer);
            });
          }
          attach(layer);
        })
        .catch(() => {
          if (!cancelled && !group.current) attach(leaflet.layerGroup());
        });
    }

    return () => {
      cancelled = true;
      group.current?.layer.remove();
      group.current?.layer.clearLayers();
      group.current = null;
    };
  }, [leaflet, map]);

  useEffect(() => {
    sync();
  }, [items, appearance, appearanceKey]);

  return null;
}
