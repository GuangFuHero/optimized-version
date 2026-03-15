import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useTheme } from 'next-themes';
import { Task, taskTypeConfig, urgencyConfig, statusConfig } from '@/data/tasks';
import { LayerConfig } from '@/components/LayerControlPanel';

export interface RefugeZoneInfo {
  id: string;
  label: string;
  sublabel: string;
  color: string;
}

interface MapViewProps {
  tasks: Task[];
  allTasks: Task[];
  selectedTask: Task | null;
  onSelectTask: (task: Task) => void;
  onViewDetail: (task: Task) => void;
  onViewRefugeZone?: (zone: RefugeZoneInfo) => void;
  layers: LayerConfig;
}

export interface MapViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitAll: () => void;
  geolocate: () => void;
}

const typeColorMap: Record<string, string> = {
  rescue: '28, 91%, 50%',
  medical: '196, 80%, 43%',
  supply: '145, 63%, 42%',
  fire: '0, 72%, 51%',
  building: '45, 80%, 50%',
  personnel: '270, 60%, 55%',
};

const createEmojiIcon = (task: Task) => {
  const isCritical = task.urgency === 'critical';
  const color = typeColorMap[task.type] || '0, 0%, 50%';
  return L.divIcon({
    html: `<div class="emoji-pin" style="
      border-color: hsl(${color});
      ${isCritical ? 'animation: pulse 1.5s infinite;' : ''}
    ">${taskTypeConfig[task.type].emoji}</div>`,
    className: 'custom-emoji-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
  });
};

const createPopupContent = (task: Task): string => {
  const config = taskTypeConfig[task.type];
  const urg = urgencyConfig[task.urgency];
  const stat = statusConfig[task.status];
  const color = typeColorMap[task.type] || '0, 0%, 50%';
  const urgBg = task.urgency === 'critical' ? 'hsl(0 72% 51%)' : task.urgency === 'high' ? 'hsl(28 91% 50%)' : task.urgency === 'medium' ? 'hsl(196 80% 43%)' : 'var(--popup-muted-bg, hsl(0 0% 90%))';
  const urgColor = task.urgency === 'low' ? 'var(--popup-muted-text, hsl(0 0% 45%))' : 'white';
  const statusBg = task.status === 'active' ? 'hsl(145 63% 42% / 0.15)' : 'var(--popup-muted-bg, hsl(0 0% 90%))';
  const statusColor = task.status === 'active' ? 'hsl(145 63% 42%)' : 'var(--popup-muted-text, hsl(0 0% 45%))';
  return `
    <div class="popup-inner">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-size: 18px;">${config.emoji}</span>
        <h3 class="popup-title">${task.name}</h3>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
        <span style="background: hsl(${color} / 0.15); color: hsl(${color}); padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600;">${config.label}</span>
        <span class="popup-urg-badge" style="background: ${urgBg}; color: ${urgColor}; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 500;">${urg.label}</span>
        <span style="background: ${statusBg}; color: ${statusColor}; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 500;">${stat.label}</span>
      </div>
      <p class="popup-desc">${task.description}</p>
      <button onclick="window.__viewTaskDetail__('${task.id}')" class="popup-btn">查看詳細</button>
    </div>
  `;
};

const LIGHT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TERRAIN_TILE_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

// Irregular refuge zones
const REFUGE_ZONES = [
  {
    id: 'zone-a',
    label: '避難區 A',
    sublabel: '仁德國小',
    latlngs: [[22.94, 120.16], [22.945, 120.17], [22.96, 120.175], [22.965, 120.21], [22.955, 120.22], [22.94, 120.205], [22.935, 120.18]] as L.LatLngExpression[],
    color: '145, 63%, 42%',
  },
  {
    id: 'zone-b',
    label: '避難區 B',
    sublabel: '永康運動公園',
    latlngs: [[23.02, 120.24], [23.03, 120.245], [23.05, 120.25], [23.06, 120.28], [23.055, 120.30], [23.04, 120.295], [23.025, 120.27]] as L.LatLngExpression[],
    color: '196, 80%, 43%',
  },
];

const NGO_ZONES = [
  {
    id: 'ngo-a',
    label: 'NGO A 處理區',
    sublabel: '紅十字會',
    latlngs: [[22.97, 120.20], [22.98, 120.21], [22.995, 120.215], [23.00, 120.25], [22.99, 120.26], [22.975, 120.245], [22.965, 120.225]] as L.LatLngExpression[],
    color: '340, 65%, 50%',
  },
  {
    id: 'ngo-b',
    label: 'NGO B 處理區',
    sublabel: '慈濟基金會',
    latlngs: [[23.05, 120.18], [23.06, 120.19], [23.075, 120.20], [23.08, 120.23], [23.07, 120.24], [23.055, 120.225], [23.045, 120.20]] as L.LatLngExpression[],
    color: '260, 55%, 50%',
  },
];

const WATER_ZONES = [
  { latlngs: [[22.93, 120.18], [22.935, 120.20], [22.955, 120.22], [22.96, 120.24], [22.95, 120.24], [22.935, 120.22], [22.925, 120.19]] as L.LatLngExpression[] },
  { latlngs: [[23.01, 120.19], [23.015, 120.20], [23.035, 120.215], [23.04, 120.23], [23.03, 120.23], [23.015, 120.215], [23.005, 120.20]] as L.LatLngExpression[] },
  { latlngs: [[22.98, 120.26], [22.985, 120.27], [23.00, 120.28], [23.01, 120.30], [23.00, 120.30], [22.985, 120.285], [22.975, 120.27]] as L.LatLngExpression[] },
];

const BLOCKED_BRIDGES = [
  { id: 'bridge-1', label: '永康橋', lat: 23.015, lng: 120.235 },
  { id: 'bridge-2', label: '仁德橋', lat: 22.955, lng: 120.205 },
  { id: 'bridge-3', label: '南化橋', lat: 22.985, lng: 120.265 },
];

const getTileUrl = (baseMap: string, resolvedTheme: string | undefined) => {
  if (baseMap === 'satellite') return SATELLITE_TILE_URL;
  if (baseMap === 'default') return DEFAULT_TILE_URL;
  return resolvedTheme === 'dark' ? DARK_TILE_URL : LIGHT_TILE_URL;
};

const MapView = forwardRef<MapViewHandle, MapViewProps>(
  ({ tasks, allTasks, selectedTask, onSelectTask, onViewDetail, onViewRefugeZone, layers }, ref) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map());
    const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const terrainLayerRef = useRef<L.TileLayer | null>(null);
    const refugeGroupRef = useRef<L.LayerGroup | null>(null);
    const ngoGroupRef = useRef<L.LayerGroup | null>(null);
    const waterGroupRef = useRef<L.LayerGroup | null>(null);
    const bridgeGroupRef = useRef<L.LayerGroup | null>(null);
    const geoMarkerRef = useRef<L.CircleMarker | null>(null);
    const { resolvedTheme } = useTheme();

    useImperativeHandle(ref, () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      fitAll: () => {
        if (mapRef.current && allTasks.length > 0) {
          const bounds = L.latLngBounds(allTasks.map(t => [t.lat, t.lng]));
          mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        }
      },
      geolocate: () => {
        if (!mapRef.current) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            mapRef.current?.flyTo([latitude, longitude], 15, { duration: 0.8 });
            if (geoMarkerRef.current) {
              geoMarkerRef.current.setLatLng([latitude, longitude]);
            } else {
              geoMarkerRef.current = L.circleMarker([latitude, longitude], {
                radius: 8,
                fillColor: 'hsl(210 100% 56%)',
                fillOpacity: 1,
                color: 'white',
                weight: 3,
              }).addTo(mapRef.current!);
            }
          },
          () => {},
          { enableHighAccuracy: true }
        );
      },
    }));

    const getClusterOptions = useCallback(() => ({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const count = cluster.getChildCount();
        let size = 40, fontSize = 14;
        if (count >= 50) { size = 56; fontSize = 16; }
        else if (count >= 20) { size = 48; fontSize = 15; }
        const isDark = resolvedTheme === 'dark';
        const bgColor = isDark ? 'hsl(0 0% 8%)' : 'hsl(0 0% 100%)';
        const textColor = isDark ? 'hsl(0 0% 95%)' : 'hsl(0 0% 10%)';
        const borderColor = 'hsl(var(--secondary))';
        return L.divIcon({
          html: `<div style="
            width: ${size}px; height: ${size}px;
            display: flex; align-items: center; justify-content: center;
            background: ${bgColor}; color: ${textColor}; border-radius: 50%;
            font-size: ${fontSize}px; font-weight: 700;
            font-family: Inter, -apple-system, sans-serif;
            box-shadow: 0 2px 12px rgba(0,0,0,${isDark ? '0.4' : '0.12'});
            border: 1px solid ${borderColor};
          ">${count}</div>`,
          className: 'custom-cluster-icon',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    }), [resolvedTheme]);

    // Initialize map
    useEffect(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [23.0, 120.22],
        zoom: 11,
        zoomControl: false,
      });

      const tileUrl = getTileUrl(layers.baseMap, resolvedTheme);
      const tileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      // Refuge zones
      const refugeGroup = L.layerGroup();
      REFUGE_ZONES.forEach(zone => {
        const polygon = L.polygon(zone.latlngs, {
          color: `hsl(${zone.color})`,
          weight: 2,
          fillColor: `hsl(${zone.color})`,
          fillOpacity: 0.12,
          dashArray: '6 4',
          interactive: true,
        });
        polygon.on('click', () => {
          onViewRefugeZone?.({ id: zone.id, label: zone.label, sublabel: zone.sublabel, color: zone.color });
        });
        refugeGroup.addLayer(polygon);

        const center = polygon.getBounds().getCenter();
        const labelIcon = L.divIcon({
          html: `<div style="
            color: hsl(${zone.color});
            font-size: 11px; font-weight: 700;
            font-family: Inter, -apple-system, sans-serif;
            white-space: nowrap;
            text-shadow: 0 1px 3px rgba(0,0,0,0.15);
            cursor: pointer;
          ">⛺ ${zone.label} <span style="font-weight:400;opacity:0.8;font-size:10px;">${zone.sublabel}</span></div>`,
          className: '',
          iconAnchor: [0, 12],
        });
        const labelMarker = L.marker(center, { icon: labelIcon, interactive: true, zIndexOffset: -100 });
        labelMarker.on('click', () => {
          onViewRefugeZone?.({ id: zone.id, label: zone.label, sublabel: zone.sublabel, color: zone.color });
        });
        refugeGroup.addLayer(labelMarker);
        polygon.bindTooltip(`<b>${zone.label}</b><br/>${zone.sublabel}`, { sticky: true, className: 'refuge-tooltip' });
      });
      refugeGroupRef.current = refugeGroup;
      if (layers.importantLocations) refugeGroup.addTo(map);

      // NGO zones
      const ngoGroup = L.layerGroup();
      NGO_ZONES.forEach(zone => {
        const polygon = L.polygon(zone.latlngs, {
          color: `hsl(${zone.color})`,
          weight: 2,
          fillColor: `hsl(${zone.color})`,
          fillOpacity: 0.10,
          dashArray: '8 4',
          interactive: true,
        });
        ngoGroup.addLayer(polygon);

        const center = polygon.getBounds().getCenter();
        const labelIcon = L.divIcon({
          html: `<div style="
            color: hsl(${zone.color});
            font-size: 11px; font-weight: 700;
            font-family: Inter, -apple-system, sans-serif;
            white-space: nowrap;
            text-shadow: 0 1px 3px rgba(0,0,0,0.15);
          ">🏢 ${zone.label} <span style="font-weight:400;opacity:0.8;font-size:10px;">${zone.sublabel}</span></div>`,
          className: '',
          iconAnchor: [0, 12],
        });
        const labelMarker = L.marker(center, { icon: labelIcon, interactive: true, zIndexOffset: -100 });
        ngoGroup.addLayer(labelMarker);
        polygon.bindTooltip(`<b>${zone.label}</b><br/>${zone.sublabel}`, { sticky: true, className: 'refuge-tooltip' });
      });
      ngoGroupRef.current = ngoGroup;
      if (layers.ngoZones) ngoGroup.addTo(map);

      // Bridge blocked markers
      const bridgeGroup = L.layerGroup();
      BLOCKED_BRIDGES.forEach(bridge => {
        const bridgeIcon = L.divIcon({
          html: `<div class="bridge-blocked-pin">🚫</div>`,
          className: 'custom-emoji-marker',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        const marker = L.marker([bridge.lat, bridge.lng], { icon: bridgeIcon });
        marker.bindTooltip(`<b>${bridge.label}</b><br/>禁止通行`, { className: 'refuge-tooltip' });
        bridgeGroup.addLayer(marker);
      });
      bridgeGroupRef.current = bridgeGroup;
      if (layers.importantLocations) bridgeGroup.addTo(map);

      // Water zones
      const waterGroup = L.layerGroup();
      WATER_ZONES.forEach(wz => {
        const polygon = L.polygon(wz.latlngs, {
          color: 'hsl(210 80% 55%)',
          weight: 1,
          fillColor: 'hsl(210 80% 55%)',
          fillOpacity: 0.18,
          dashArray: '4 3',
        });
        waterGroup.addLayer(polygon);
      });
      waterGroupRef.current = waterGroup;
      if (layers.water) waterGroup.addTo(map);

      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
        markersRef.current.clear();
        clusterGroupRef.current = null;
        terrainLayerRef.current = null;
        refugeGroupRef.current = null;
        ngoGroupRef.current = null;
        waterGroupRef.current = null;
        bridgeGroupRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update tile layer
    useEffect(() => {
      if (!mapRef.current || !tileLayerRef.current) return;
      const url = getTileUrl(layers.baseMap, resolvedTheme);
      tileLayerRef.current.setUrl(url);
    }, [layers.baseMap, resolvedTheme]);

    // Terrain overlay
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      if (layers.terrain && !terrainLayerRef.current) {
        terrainLayerRef.current = L.tileLayer(TERRAIN_TILE_URL, { opacity: 0.45, maxZoom: 17 }).addTo(map);
      } else if (!layers.terrain && terrainLayerRef.current) {
        map.removeLayer(terrainLayerRef.current);
        terrainLayerRef.current = null;
      }
    }, [layers.terrain]);

    // Important locations overlay
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      if (layers.importantLocations) {
        if (refugeGroupRef.current) refugeGroupRef.current.addTo(map);
        if (bridgeGroupRef.current) bridgeGroupRef.current.addTo(map);
      } else {
        if (refugeGroupRef.current) map.removeLayer(refugeGroupRef.current);
        if (bridgeGroupRef.current) map.removeLayer(bridgeGroupRef.current);
      }
    }, [layers.importantLocations]);

    // NGO zones overlay
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ngoGroupRef.current) return;
      if (layers.ngoZones) {
        ngoGroupRef.current.addTo(map);
      } else {
        map.removeLayer(ngoGroupRef.current);
      }
    }, [layers.ngoZones]);

    // Water overlay
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !waterGroupRef.current) return;
      if (layers.water) {
        waterGroupRef.current.addTo(map);
      } else {
        map.removeLayer(waterGroupRef.current);
      }
    }, [layers.water]);

    // Register detail callback
    useEffect(() => {
      (window as any).__viewTaskDetail__ = (taskId: string) => {
        const task = allTasks.find(t => t.id === taskId);
        if (task) onViewDetail(task);
      };
      return () => { delete (window as any).__viewTaskDetail__; };
    }, [allTasks, onViewDetail]);

    // Update markers
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
      }
      markersRef.current.clear();

      const clusterGroup = L.markerClusterGroup(getClusterOptions());

      tasks.forEach(task => {
        const marker = L.marker([task.lat, task.lng], { icon: createEmojiIcon(task) })
          .bindPopup(createPopupContent(task), {
            className: 'custom-popup',
            maxWidth: 280,
            closeButton: true,
          })
          .on('click', () => onSelectTask(task));
        clusterGroup.addLayer(marker);
        markersRef.current.set(task.id, marker);
      });

      map.addLayer(clusterGroup);
      clusterGroupRef.current = clusterGroup;
    }, [tasks, resolvedTheme, getClusterOptions]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fly to selected task
    useEffect(() => {
      if (selectedTask && mapRef.current) {
        mapRef.current.flyTo([selectedTask.lat, selectedTask.lng], 15, { duration: 0.8 });
        const marker = markersRef.current.get(selectedTask.id);
        if (marker && clusterGroupRef.current) {
          clusterGroupRef.current.zoomToShowLayer(marker, () => {
            marker.openPopup();
          });
        } else if (marker) {
          marker.openPopup();
        }
      }
    }, [selectedTask]);

    return (
      <div className="relative h-full w-full">
        <style>{`
          .custom-emoji-marker { background: none !important; border: none !important; }
          .custom-cluster-icon { background: none !important; border: none !important; }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.15); }
          }
          .emoji-pin {
            font-size: 22px; width: 40px; height: 40px;
            display: flex; align-items: center; justify-content: center;
            background: white; border-radius: 50%;
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            border: 1px solid;
          }
          .dark .emoji-pin {
            background: hsl(0 0% 18%);
            box-shadow: 0 2px 12px rgba(0,0,0,0.4);
          }
          .bridge-blocked-pin {
            font-size: 24px; width: 36px; height: 36px;
            display: flex; align-items: center; justify-content: center;
            background: hsl(0 0% 100% / 0.9); border-radius: 50%;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            border: 1px solid hsl(0 72% 51%);
          }
          .dark .bridge-blocked-pin {
            background: hsl(0 0% 18% / 0.9);
          }
          .custom-popup .leaflet-popup-content-wrapper {
            border-radius: 16px !important;
            box-shadow: 0 8px 40px -8px rgba(0,0,0,0.15) !important;
            padding: 0 !important; overflow: hidden;
            background: white !important;
          }
          .dark .custom-popup .leaflet-popup-content-wrapper {
            background: hsl(0 0% 14%) !important;
            box-shadow: 0 8px 40px -8px rgba(0,0,0,0.5) !important;
          }
          .custom-popup .leaflet-popup-content { margin: 0 !important; }
          .custom-popup .leaflet-popup-tip {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
            background: white !important;
          }
          .dark .custom-popup .leaflet-popup-tip {
            background: hsl(0 0% 14%) !important;
          }
          .custom-popup .leaflet-popup-close-button {
            color: hsl(0 0% 45%) !important;
          }
          .dark .custom-popup .leaflet-popup-close-button {
            color: hsl(0 0% 65%) !important;
          }
          .popup-inner {
            padding: 16px; min-width: 220px;
            font-family: Inter, -apple-system, sans-serif;
          }
          .popup-inner {
            --popup-muted-bg: hsl(0 0% 93%);
            --popup-muted-text: hsl(0 0% 45%);
          }
          .dark .popup-inner {
            --popup-muted-bg: hsl(0 0% 25%);
            --popup-muted-text: hsl(0 0% 70%);
          }
          .popup-title {
            font-size: 14px; font-weight: 600; margin: 0;
            color: hsl(0 0% 10%);
          }
          .dark .popup-title { color: hsl(0 0% 92%); }
          .popup-desc {
            font-size: 12px; color: hsl(0 0% 45%);
            margin: 0 0 12px 0; line-height: 1.5;
          }
          .dark .popup-desc { color: hsl(0 0% 60%); }
          .popup-btn {
            width: 100%; padding: 8px; border: none; border-radius: 8px;
            background: hsl(28 91% 50%); color: white;
            font-size: 12px; font-weight: 500; cursor: pointer;
            font-family: inherit;
          }
          .popup-btn:hover { opacity: 0.9; }
          .refuge-tooltip {
            background: white !important; border: none !important;
            border-radius: 8px !important;
            font-family: Inter, -apple-system, sans-serif !important;
            font-size: 12px !important;
            box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
            padding: 6px 10px !important;
          }
          .dark .refuge-tooltip {
            background: hsl(0 0% 18%) !important;
            color: hsl(0 0% 90%) !important;
          }
          .refuge-tooltip::before { display: none !important; }
        `}</style>

        <div ref={mapContainerRef} className="h-full w-full" />
      </div>
    );
  }
);

MapView.displayName = 'MapView';
export default MapView;
