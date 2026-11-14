import { loadSlotConfig, slotViews } from '@/lib/landing-stone/slots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const config = loadSlotConfig();
  const slots = slotViews(config.slots, process.env);
  return Response.json({ quorum: config.quorum, slots }, { headers: { 'Cache-Control': 'no-store' } });
}
