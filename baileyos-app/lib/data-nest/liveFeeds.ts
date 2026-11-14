import { coarsen } from './geo';

export const FEED_UA = 'BaileyOS-DataNest/1.0 (https://baileyos-app.vercel.app)';

export type FeedRow = {
  available: boolean;
  fetched_at: string | null;
  source_timestamp: string | null;
  record_count: number;
  error?: string | null;
};

export type LiveKind = 'quake' | 'weather' | 'closure' | 'crash' | 'chain' | 'amber' | 'silver' | 'observation' | 'other';

export type LiveItem = {
  id: string;
  layer: 'quakes' | 'nws' | 'roads' | 'amber' | 'silver' | 'observation';
  title: string;
  summary: string;
  lon: number | null;
  lat: number | null;
  agency: string;
  issuedAt: string | null;
  expiresAt: string | null;
  sourceUrl: string;
  sourceName: string;
  kind: LiveKind;
};

export type NeedsSetup = { id: string; env: string; why: string };

export const NEEDS_SETUP: NeedsSetup[] = [
  {
    id: 'udot',
    env: 'UDOT_511_API_KEY',
    why: 'UDOT 511 answered Invalid Key without a key. Utah road events are not shown.',
  },
  {
    id: 'crime',
    env: 'DATA_GOV_API_KEY',
    why: 'The FBI Crime Data Explorer requires an api.data.gov key. Grand Junction PD publishes PDF reports, not an open incident feed. No crime counts are shown.',
  },
  {
    id: 'cotrip-keyed',
    env: 'COTRIP_API_KEY',
    why: 'The keyed COtrip incidents API returned 403 Not Authorized. Chain-law detail from that API is not wired. The public CoTrip alerts layer is queried instead.',
  },
  {
    id: 'cbi',
    env: '',
    why: 'Colorado CBI publishes alert pages, not a JSON or RSS feed. AMBER and Silver rows come only from NWS CAP.',
  },
];

const CDOT_SOURCE = 'https://maps.codot.gov/server/rest/services/Hosted/CoTrip_Alerts_Points_(Live)_Public_View/FeatureServer/0';
const NWS_ALERTS = 'https://api.weather.gov/alerts';
const USGS_SOURCE = 'https://earthquake.usgs.gov/fdsnws/event/1/';

export function zulu(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function toZulu(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return zulu(new Date(ms));
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return zulu(new Date(t));
}

export function roadKind(text: string): LiveKind {
  const t = text.toLowerCase();
  if (t.includes('chain')) return 'chain';
  if (t.includes('closure') || t.includes('closed')) return 'closure';
  if (t.includes('crash') || t.includes('collision') || t.includes('accident')) return 'crash';
  return 'other';
}

export function isAmber(event: string): boolean {
  return event.trim().toLowerCase() === 'child abduction emergency';
}

export function isSilver(event: string, headline: string, description: string): boolean {
  if (isAmber(event)) return false;
  const text = `${event} ${headline} ${description}`;
  if (/silver alert|missing senior|endangered missing|missing indigenous/i.test(text)) return true;
  if (/^(local area emergency|civil emergency message)$/i.test(event.trim()) && /missing|silver/i.test(text)) return true;
  return false;
}

type FetchLike = typeof fetch;

async function getJson(url: string, fetchImpl: FetchLike, headers: Record<string, string> = {}): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': FEED_UA, Accept: 'application/geo+json, application/json', ...headers }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, error: 'fetch failed' };
  }
}

function row(partial: Partial<FeedRow> & { available: boolean; record_count: number }, fetched: string): FeedRow {
  return {
    available: partial.available,
    fetched_at: partial.fetched_at === undefined ? fetched : partial.fetched_at,
    source_timestamp: partial.source_timestamp ?? null,
    record_count: partial.record_count,
    error: partial.error ?? null,
  };
}

function featurePoint(feature: unknown): { lon: number | null; lat: number | null } {
  if (!feature || typeof feature !== 'object') return { lon: null, lat: null };
  const geom = (feature as { geometry?: { type?: string; coordinates?: unknown } }).geometry;
  const coords = geom?.coordinates;
  if (geom?.type === 'Point' && Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return { lon: coords[0], lat: coords[1] };
  }
  return { lon: null, lat: null };
}

export function feedPayloads(items: LiveItem[]): Record<string, LiveItem[]> {
  const groups: Record<string, LiveItem[]> = {
    usgs: [], nws_alerts: [], nws_observation: [], cdot: [], udot: [], amber: [], silver: [], crime: [],
  };
  for (const item of items) {
    if (item.layer === 'quakes') groups.usgs.push(item);
    else if (item.layer === 'nws') groups.nws_alerts.push(item);
    else if (item.layer === 'observation') groups.nws_observation.push(item);
    else if (item.layer === 'roads') groups.cdot.push(item);
    else if (item.layer === 'amber') groups.amber.push(item);
    else if (item.layer === 'silver') groups.silver.push(item);
  }
  return groups;
}

export async function loadLive(lat: number, lon: number, radiusKm: number, fetchImpl: FetchLike = fetch): Promise<{
  items: LiveItem[];
  freshness: Record<string, FeedRow>;
  needsSetup: NeedsSetup[];
  fetchedAt: string;
  cell: { lat: number; lon: number };
}> {
  const cell = coarsen(lat, lon);
  const fetched = zulu();
  const radius = Math.max(10, Math.min(200, radiusKm));
  const items: LiveItem[] = [];
  const freshness: Record<string, FeedRow> = {};

  const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${cell.lat}&longitude=${cell.lon}&maxradiuskm=${radius}&limit=30&orderby=time`;
  const usgs = await getJson(usgsUrl, fetchImpl);
  if (!usgs.ok) {
    freshness.usgs = row({ available: false, record_count: 0, error: usgs.error, fetched_at: fetched }, fetched);
  } else {
    const features = Array.isArray((usgs.json as { features?: unknown }).features) ? (usgs.json as { features: unknown[] }).features : [];
    let newest: string | null = null;
    for (const feature of features) {
      const props = (feature as { properties?: Record<string, unknown> }).properties || {};
      const point = featurePoint(feature);
      const when = toZulu(props.time);
      if (when && (!newest || when > newest)) newest = when;
      items.push({
        id: String(props.code || props.url || `${point.lon},${point.lat},${props.time}`),
        layer: 'quakes',
        title: `M ${props.mag ?? '?'} ${props.place || 'Earthquake'}`,
        summary: typeof props.title === 'string' ? props.title : 'USGS earthquake',
        lon: point.lon,
        lat: point.lat,
        agency: 'USGS',
        issuedAt: when,
        expiresAt: null,
        sourceUrl: typeof props.url === 'string' ? props.url : USGS_SOURCE,
        sourceName: 'USGS Earthquake Hazards',
        kind: 'quake',
      });
    }
    freshness.usgs = row({ available: true, record_count: features.length, source_timestamp: newest, fetched_at: fetched }, fetched);
  }

  const areas = await Promise.all(['CO', 'UT'].map((area) => getJson(`https://api.weather.gov/alerts/active?area=${area}`, fetchImpl)));
  const alertFeatures: unknown[] = [];
  const alertErrors = areas.filter((item) => !item.ok).map((item) => item.ok ? '' : item.error);
  if (alertErrors.length === areas.length) {
    const err = alertErrors[0] || 'fetch failed';
    for (const id of ['nws_alerts', 'amber', 'silver']) {
      freshness[id] = row({ available: false, record_count: 0, error: err, fetched_at: fetched }, fetched);
    }
  } else {
    for (const area of areas) if (area.ok) {
      const features = (area.json as { features?: unknown }).features;
      if (Array.isArray(features)) alertFeatures.push(...features);
    }
    const weather: unknown[] = [];
    const amber: unknown[] = [];
    const silver: unknown[] = [];
    for (const feature of alertFeatures) {
      const props = (feature as { properties?: Record<string, unknown> }).properties || {};
      const event = String(props.event || '');
      const headline = String(props.headline || '');
      const description = String(props.description || '');
      if (isAmber(event)) amber.push(feature);
      else if (isSilver(event, headline, description)) silver.push(feature);
      else weather.push(feature);
    }
    const pushAlert = (feature: unknown, layer: LiveItem['layer'], kind: LiveKind) => {
      const props = (feature as { properties?: Record<string, unknown>; id?: string }).properties || {};
      const point = featurePoint(feature);
      const id = String((feature as { id?: string }).id || props.id || props.headline);
      items.push({
        id,
        layer,
        title: String(props.event || props.headline || 'Alert'),
        summary: String(props.headline || props.areaDesc || '').slice(0, 400),
        lon: point.lon,
        lat: point.lat,
        agency: String(props.senderName || 'National Weather Service'),
        issuedAt: toZulu(props.sent || props.effective || props.onset),
        expiresAt: toZulu(props.expires || props.ends),
        sourceUrl: typeof props.uri === 'string' ? props.uri : typeof props.id === 'string' && props.id.startsWith('http') ? props.id : NWS_ALERTS,
        sourceName: 'NWS CAP',
        kind,
      });
    };
    weather.slice(0, 40).forEach((feature) => pushAlert(feature, 'nws', 'weather'));
    amber.forEach((feature) => pushAlert(feature, 'amber', 'amber'));
    silver.forEach((feature) => pushAlert(feature, 'silver', 'silver'));
    const newest = (list: unknown[]) => {
      let best: string | null = null;
      for (const feature of list) {
        const props = (feature as { properties?: Record<string, unknown> }).properties || {};
        const when = toZulu(props.sent || props.effective);
        if (when && (!best || when > best)) best = when;
      }
      return best;
    };
    freshness.nws_alerts = row({ available: true, record_count: weather.length, source_timestamp: newest(weather), fetched_at: fetched }, fetched);
    freshness.amber = row({ available: true, record_count: amber.length, source_timestamp: newest(amber), fetched_at: fetched }, fetched);
    freshness.silver = row({ available: true, record_count: silver.length, source_timestamp: newest(silver), fetched_at: fetched }, fetched);
  }

  const points = await getJson(`https://api.weather.gov/points/${cell.lat},${cell.lon}`, fetchImpl);
  if (!points.ok) {
    freshness.nws_observation = row({ available: false, record_count: 0, error: points.error, fetched_at: fetched }, fetched);
  } else {
    const stationsUrl = (points.json as { properties?: { observationStations?: string } }).properties?.observationStations;
    const stations = stationsUrl ? await getJson(stationsUrl, fetchImpl) : { ok: false as const, error: 'no stations' };
    const stationId = stations.ok
      ? ((stations.json as { features?: { properties?: { stationIdentifier?: string } }[] }).features || [])[0]?.properties?.stationIdentifier
      : null;
    if (!stationId) {
      freshness.nws_observation = row({ available: false, record_count: 0, error: 'no station', fetched_at: fetched }, fetched);
    } else {
      const obs = await getJson(`https://api.weather.gov/stations/${stationId}/observations/latest`, fetchImpl);
      if (!obs.ok) {
        freshness.nws_observation = row({ available: false, record_count: 0, error: obs.error, fetched_at: fetched }, fetched);
      } else {
        const props = (obs.json as { properties?: Record<string, unknown> }).properties || {};
        const temp = (props.temperature as { value?: number } | undefined)?.value;
        const wind = (props.windSpeed as { value?: number } | undefined)?.value;
        const text = typeof props.textDescription === 'string' ? props.textDescription : 'Observation';
        const when = toZulu(props.timestamp);
        const coords = featurePoint(obs.json);
        items.push({
          id: `obs-${stationId}`,
          layer: 'observation',
          title: `${stationId}: ${text}`,
          summary: [temp != null ? `${temp} °C` : '', wind != null ? `wind ${Math.round(wind)} m/s` : ''].filter(Boolean).join(', ') || text,
          lon: coords.lon,
          lat: coords.lat,
          agency: 'National Weather Service',
          issuedAt: when,
          expiresAt: null,
          sourceUrl: `https://api.weather.gov/stations/${stationId}/observations/latest`,
          sourceName: 'NWS station observation',
          kind: 'observation',
        });
        freshness.nws_observation = row({ available: true, record_count: 1, source_timestamp: when, fetched_at: fetched }, fetched);
      }
    }
  }

  const pad = radius / 111;
  const envelope = `${cell.lon - pad},${cell.lat - pad},${cell.lon + pad},${cell.lat + pad}`;
  const cdotUrl = new URL(`${CDOT_SOURCE}/query`);
  cdotUrl.searchParams.set('where', '1=1');
  cdotUrl.searchParams.set('outFields', 'alertid,type,title,headline,impact,reportedtime,expectedendtime,direction,roadname,locationdescription,startlatitude,startlongitude');
  cdotUrl.searchParams.set('geometry', envelope);
  cdotUrl.searchParams.set('geometryType', 'esriGeometryEnvelope');
  cdotUrl.searchParams.set('inSR', '4326');
  cdotUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  cdotUrl.searchParams.set('returnGeometry', 'true');
  cdotUrl.searchParams.set('outSR', '4326');
  cdotUrl.searchParams.set('f', 'json');
  cdotUrl.searchParams.set('resultRecordCount', '50');
  const cdot = await getJson(cdotUrl.toString(), fetchImpl, { Accept: 'application/json' });
  if (!cdot.ok || (cdot.ok && cdot.json && typeof cdot.json === 'object' && 'error' in (cdot.json as object))) {
    freshness.cdot = row({ available: false, record_count: 0, error: cdot.ok ? 'CDOT returned an error' : cdot.error, fetched_at: fetched }, fetched);
  } else {
    const features = Array.isArray((cdot.json as { features?: unknown }).features) ? (cdot.json as { features: unknown[] }).features : [];
    let newest: string | null = null;
    for (const feature of features) {
      const attrs = (feature as { attributes?: Record<string, unknown> }).attributes || {};
      const text = `${attrs.type || ''} ${attrs.title || ''} ${attrs.headline || ''}`;
      const when = toZulu(attrs.reportedtime);
      if (when && (!newest || when > newest)) newest = when;
      const latNum = typeof attrs.startlatitude === 'number' ? attrs.startlatitude : null;
      const lonNum = typeof attrs.startlongitude === 'number' ? attrs.startlongitude : null;
      items.push({
        id: String(attrs.alertid || text),
        layer: 'roads',
        title: String(attrs.title || attrs.type || 'CDOT alert'),
        summary: String(attrs.headline || attrs.locationdescription || attrs.roadname || '').slice(0, 400),
        lon: lonNum,
        lat: latNum,
        agency: 'Colorado Department of Transportation',
        issuedAt: when,
        expiresAt: toZulu(attrs.expectedendtime),
        sourceUrl: CDOT_SOURCE,
        sourceName: 'CDOT CoTrip alerts',
        kind: roadKind(text),
      });
    }
    freshness.cdot = row({ available: true, record_count: features.length, source_timestamp: newest, fetched_at: fetched }, fetched);
  }

  freshness.udot = row({ available: false, record_count: 0, error: 'needs setup: UDOT_511_API_KEY', fetched_at: null }, fetched);
  freshness.crime = row({ available: false, record_count: 0, error: 'needs setup: DATA_GOV_API_KEY', fetched_at: null }, fetched);

  return { items, freshness, needsSetup: NEEDS_SETUP, fetchedAt: fetched, cell };
}
