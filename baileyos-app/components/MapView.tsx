'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CONFIG } from '@/lib/config';
import type { CheckInCard } from '@/lib/checkInProfile';
import type { PublicPin } from '@/lib/crowd';
import { hexCenter, jitterInHex, type MapViewBox } from '@/lib/neighborhood';

export type NeighborhoodPin = { hex: string; pins: PublicPin[] };
type MinePin = { h3: string };
type Props = {
  neighborhoods: NeighborhoodPin[];
  mine: MinePin | null;
  focusHex: string | null;
  frameKey: number;
  onBounds: (view: MapViewBox) => void;
};

export default function MapView({ neighborhoods, mine, focusHex, frameKey, onBounds }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const dots = useRef<L.LayerGroup | null>(null);
  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([CONFIG.origin.lat, CONFIG.origin.lon], 12);
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'osm-dark',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(m);
    dots.current = L.layerGroup().addTo(m);
    const publish = () => {
      const bounds = m.getBounds();
      onBoundsRef.current({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    };
    m.on('moveend', publish);
    map.current = m;
    publish();
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !focusHex) return;
    try { map.current.setView(hexCenter(focusHex), 12); } catch { /* ignore a stored hex the library cannot draw */ }
  }, [focusHex, frameKey]);

  useEffect(() => {
    const g = dots.current;
    if (!g) return;
    g.clearLayers();
    for (const area of neighborhoods) {
      for (const pin of area.pins ?? []) {
        try {
          if (pin.name) namedPin(jitterInHex(area.hex), { name: pin.name, photo: pin.photo, profileUrl: pin.profileUrl }).addTo(g);
          else L.circleMarker(jitterInHex(area.hex), { radius: 6, color: '#22d3ee', weight: 0, fillColor: '#22d3ee', fillOpacity: 0.85, interactive: false }).addTo(g);
        } catch { /* a bad hex is skipped */ }
      }
    }
    if (mine?.h3) {
      try {
        L.circleMarker(jitterInHex(mine.h3), { radius: 9, color: '#ffffff', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.95 }).addTo(g);
      } catch { /* the viewer's own hex could not be drawn */ }
    }
  }, [neighborhoods, mine, frameKey]);

  return <div ref={el} className="h-[340px] w-full" />;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function namedPin(point: [number, number], card: CheckInCard): L.Marker {
  const name = escapeHtml(card.name);
  const photo = card.photo && card.photo.startsWith('https://')
    ? `<img alt="" src="${escapeHtml(card.photo)}" style="width:28px;height:28px;border-radius:999px;object-fit:cover" />`
    : '';
  const label = `${photo}<span style="font:600 12px sans-serif;color:#111">${name}</span>`;
  const html = card.profileUrl && card.profileUrl.startsWith('https://')
    ? `<a href="${escapeHtml(card.profileUrl)}" style="display:flex;gap:6px;align-items:center;background:#fff;border-radius:999px;padding:2px 8px 2px 2px;text-decoration:none">${label}</a>`
    : `<div style="display:flex;gap:6px;align-items:center;background:#fff;border-radius:999px;padding:2px 8px 2px 2px">${label}</div>`;
  return L.marker(point, {
    interactive: Boolean(card.profileUrl),
    icon: L.divIcon({ className: '', html, iconSize: [140, 32], iconAnchor: [16, 16] }),
  });
}
