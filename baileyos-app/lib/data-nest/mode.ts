import { STATIONARY_MPS, TRAVEL_MPS } from './geo';

export type NestMode = 'traveling' | 'stationary';

/** Auto mode uses a gap between 2 mph and 5 mph so the screen does not flicker. */
export function nextAutoMode(speedMps: number | null, current: NestMode): NestMode {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < 0) return current;
  if (speedMps >= TRAVEL_MPS) return 'traveling';
  if (speedMps <= STATIONARY_MPS) return 'stationary';
  return current;
}

/** Chat stays off above about 5 mph unless a passenger has confirmed. */
export function chatEnabled(speedMps: number | null, passenger: boolean): boolean {
  if (passenger) return true;
  if (speedMps == null || !Number.isFinite(speedMps)) return true;
  return speedMps < TRAVEL_MPS;
}
