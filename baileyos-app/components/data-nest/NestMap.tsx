'use client';

import { useEffect, useRef } from 'react';
import type { SceneFeature } from '@/lib/data-nest/scene';

const EMPTY = { type: 'FeatureCollection' as const, features: [] as { type: 'Feature'; id: string; properties: Record<string, string>; geometry: SceneFeature['geometry'] }[] };

export default function NestMap({
  features,
  center,
  onPick,
  pickEnabled,
}: {
  features: SceneFeature[];
  center: { lon: number; lat: number };
  onPick: (lat: number, lon: number) => void;
  pickEnabled: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    let map: import('maplibre-gl').Map;
    let cancelled = false;
    void import('maplibre-gl').then((mod) => {
      if (cancelled || !el.current) return;
      const maplibregl = mod.default;
      map = new maplibregl.Map({
        container: el.current,
        center: [center.lon, center.lat],
        zoom: 8,
        pitch: 0,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
      map.on('load', () => {
        map.addSource('nest', { type: 'geojson', data: EMPTY });
        map.addLayer({ id: 'nest-line', type: 'line', source: 'nest', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#22d3ee', 'line-width': 3 } });
        map.addLayer({ id: 'nest-point', type: 'circle', source: 'nest', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': ['case', ['==', ['get', 'layer'], 'user'], '#f8fafc', '#22d3ee'], 'circle-stroke-width': 1, 'circle-stroke-color': '#083344' } });
        publish();
      });
      map.on('click', (event) => {
        if (!pickEnabled) return;
        onPickRef.current(event.lngLat.lat, event.lngLat.lng);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once. Later effects move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function publish() {
    const map = mapRef.current;
    const source = map?.getSource('nest') as import('maplibre-gl').GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: features.filter((feature) => feature.layer !== 'user' || feature.geometry.type === 'Point').filter((feature) => {
        if (feature.geometry.type !== 'Point') return true;
        return !(feature.geometry.coordinates[0] === 0 && feature.geometry.coordinates[1] === 0 && feature.layer !== 'user');
      }).map((feature) => ({
        type: 'Feature' as const,
        id: feature.id,
        properties: { layer: feature.layer, title: feature.title },
        geometry: feature.geometry,
      })),
    });
  }

  useEffect(() => {
    publish();
  }, [features]);

  useEffect(() => {
    mapRef.current?.easeTo({ center: [center.lon, center.lat], duration: 400 });
  }, [center.lat, center.lon]);

  return (
    <div className="overflow-hidden rounded-3xl border border-cyan-400/30">
      <div ref={el} className="h-72 w-full" />
      <p className="bg-[#07111f] px-3 py-2 text-xs text-slate-400">
        Map tiles © <a className="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Pitch stays flat. 3D is not on.
        {pickEnabled ? ' Tap the map to set your place.' : ''}
      </p>
    </div>
  );
}
