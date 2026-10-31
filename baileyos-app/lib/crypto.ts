import { createHmac, timingSafeEqual } from 'crypto';

function secret(): string {
  const s = process.env.PLACEMENT_SECRET;
  if (!s || s.length < 32) throw new Error('PLACEMENT_SECRET must be set (32+ chars)');
  return s;
}
export const hmacHex = (msg: string) => createHmac('sha256', secret()).update(msg).digest('hex');
export const linkToken = (id: number) => hmacHex('link:' + id).slice(0, 32);
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
