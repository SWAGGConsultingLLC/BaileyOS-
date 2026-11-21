export const STEWARD_BEARING = 180;
export const LIGHTS_WIN = 'If this compass and the lights disagree, the lights win.';

const SEAT_BEARINGS: Record<string, { seat: string; bearing: number }> = {
  A: { seat: '01', bearing: 90 },
  B: { seat: '02', bearing: 270 },
  C: { seat: '03', bearing: 0 },
  D: { seat: '04', bearing: 45 },
  E: { seat: '05', bearing: 315 },
};

const FEED_BEARINGS: Record<string, number> = {
  nws_alerts: 120,
  nws_observation: 150,
  usgs: 30,
  cdot: 210,
};

export type SeatFace = {
  id: string;
  name: string;
  seat: string;
  bearing: number;
  status: 'disabled' | 'not configured' | 'ready' | string;
};

export type FeedMark = { id: string; bearing: number; reason: string };

export function placeSeats(slots: { id: string; name: string; status: string }[]): SeatFace[] {
  return slots.map((slot) => {
    const known = SEAT_BEARINGS[slot.id];
    return {
      id: slot.id,
      name: slot.name,
      seat: known?.seat || slot.id,
      bearing: known?.bearing ?? STEWARD_BEARING,
      status: slot.status,
    };
  }).filter((seat) => seat.bearing !== STEWARD_BEARING);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0] || '';
}

export function dissentBearings(seats: SeatFace[], reviewers: string[]): number[] {
  const wanted = new Set(reviewers.map(slug).filter(Boolean));
  return seats.filter((seat) => wanted.has(slug(seat.name)) || wanted.has(seat.id.toLowerCase())).map((seat) => seat.bearing);
}

export function feedMarks(sources: { id?: string; status?: string; record_count?: number }[], vetoes: { feed_id?: string; rule_id?: string; feed_status?: string }[]): FeedMark[] {
  const marks: FeedMark[] = [];
  const seen = new Set<string>();
  for (const veto of vetoes) {
    const id = typeof veto.feed_id === 'string' ? veto.feed_id : '';
    const bearing = FEED_BEARINGS[id];
    if (bearing === undefined || seen.has(id)) continue;
    seen.add(id);
    marks.push({ id, bearing, reason: `${veto.rule_id || 'veto'} ${veto.feed_status || ''}`.trim() });
  }
  for (const source of sources) {
    const id = typeof source.id === 'string' ? source.id : '';
    const bearing = FEED_BEARINGS[id];
    if (!id || bearing === undefined || seen.has(id) || id === 'crime') continue;
    const count = typeof source.record_count === 'number' ? source.record_count : 0;
    const status = source.status;
    const alert = status === 'fail' || status === 'degraded' || count > 0;
    if (!alert) continue;
    seen.add(id);
    marks.push({
      id,
      bearing,
      reason: status === 'fail' || status === 'degraded' ? status : `${count} published`,
    });
  }
  return marks;
}

export function pointOnRing(cx: number, cy: number, radius: number, bearing: number): { x: number; y: number } {
  const rad = (bearing * Math.PI) / 180;
  return {
    x: Math.round((cx + radius * Math.sin(rad)) * 10) / 10,
    y: Math.round((cy - radius * Math.cos(rad)) * 10) / 10,
  };
}
