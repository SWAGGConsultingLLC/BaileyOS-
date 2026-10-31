// In-memory fixed-window limiter. Fine for a single instance. On serverless/multi-instance, swap for Redis/Upstash.
const hits = new Map<string, { n: number; reset: number }>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
  h.n += 1;
  return h.n <= limit;
}
