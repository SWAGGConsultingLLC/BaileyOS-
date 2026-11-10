import { CONFIG } from './config';
import { hmacHex, phoneMarker } from './crypto';
import { polar, quantize } from './geo';
import { neighborhoodHex } from './neighborhood';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export type PlaceFailure = { ok: false; error: string; status: number };
export type PlaceReady = {
  ok: true;
  cell: { band_km: number; sector: number };
  hex: string;
  key: string;
  phoneKey: string;
  hour: string;
};

/**
 * Anonymous placement checks. Identity is the device token plus the server clock.
 * Email is not an input and is never used to match a person to a cell.
 */
export function preparePlacement(args: {
  body: Record<string, unknown>;
  now: number;
  ip: string;
  allow: (key: string, limit: number, windowMs: number) => boolean;
}): PlaceFailure | PlaceReady {
  const { lat, lon, accuracy_m, device_token, timestamp } = args.body;

  if (!num(lat) || !num(lon) || !num(accuracy_m) || !num(timestamp)) return { ok: false, error: 'Bad request', status: 400 };
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { ok: false, error: 'Bad request', status: 400 };
  if (typeof device_token !== 'string' || device_token.length < 16 || device_token.length > 128) return { ok: false, error: 'Bad request', status: 400 };

  if (!args.allow('ip:' + args.ip, 30, 3600_000) || !args.allow('tok:' + device_token, 6, 3600_000)) {
    return { ok: false, error: 'Too many requests', status: 429 };
  }

  if (Math.abs(args.now - timestamp) > CONFIG.clientSkewMs) return { ok: false, error: 'Clock skew too large', status: 400 };
  if (accuracy_m > CONFIG.maxAccuracyM || accuracy_m < 0) return { ok: false, error: 'Location not precise enough', status: 400 };

  const { d, b } = polar(lat, lon);
  const cell = quantize(d, b);
  const hex = neighborhoodHex(lat, lon);

  const windowMs = Number(process.env.DEDUPE_WINDOW_HOURS || 24) * 3600_000;
  const windowStart = Math.floor(args.now / windowMs) * windowMs;
  const key = hmacHex(`${device_token}:${windowStart}`);
  const phoneKey = phoneMarker(device_token);
  const hour = new Date(Math.floor(args.now / 3600_000) * 3600_000).toISOString();
  return { ok: true, cell, hex, key, phoneKey, hour };
}
