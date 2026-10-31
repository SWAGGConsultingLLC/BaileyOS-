'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CONFIG } from '@/lib/config';
import { jitteredPoint } from '@/lib/geo';

export type Cell = { band_km: number; sector: number };
type Props = { cells: Cell[]; mine: Cell | null; frameKey: number };

export default function MapView({ cells, mine, frameKey }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const dots = useRef<L.LayerGroup | null>(null);
  const range = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const o: [number, number] = [CONFIG.origin.lat, CONFIG.origin.lon];
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(o, 9);
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'osm-dark',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(m);
    range.current = L.circle(o, { radius: CONFIG.maxKm * 1000, color: '#22d3ee', weight: 1, opacity: 0.35, fillOpacity: 0.02, interactive: false }).addTo(m);
    dots.current = L.layerGroup().addTo(m);
    m.fitBounds(range.current.getBounds());
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // Every render re-seeds the jitter, so a dot never has a stable position.
  useEffect(() => {
    const g = dots.current; if (!g) return;
    g.clearLayers();
    cells.forEach(c => L.circleMarker(jitteredPoint(c.band_km, c.sector), { radius: 3, color: '#22d3ee', weight: 0, fillColor: '#22d3ee', fillOpacity: 0.7, interactive: false }).addTo(g));
    if (mine) L.circleMarker(jitteredPoint(mine.band_km, mine.sector), { radius: 9, color: '#ffffff', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.95 }).addTo(g);
  }, [cells, mine]);

  useEffect(() => { if (frameKey > 0 && map.current && range.current) map.current.fitBounds(range.current.getBounds()); }, [frameKey]);

  return <div ref={el} className="h-[340px] w-full" />;
}
