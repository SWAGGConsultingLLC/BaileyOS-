import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';
import { publicCheckInCard, checkInCard } from '@/lib/checkInProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public read: quantized cells and the aggregate count only. No ids, hours, or keys.
export async function GET() {
  const db = admin();
  const [count, rows] = await Promise.all([
    db.from('placed_count').select('total').eq('id', true).single(),
    db.from('placements').select('id, band_km, sector').order('created_at', { ascending: false }).limit(5000)
  ]);
  if (count.error || rows.error) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  const ids = (rows.data ?? []).map(row => row.id);
  const cards = ids.length === 0
    ? { data: [], error: null }
    : await db.from('placement_cards').select('placement_id, display_name, photo_url, profile_url').in('placement_id', ids);
  if (cards.error) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  const byId = new Map((cards.data ?? []).map(card => [card.placement_id, card]));
  const cells = (rows.data ?? []).map(row => {
    const saved = byId.get(row.id);
    const card = saved
      ? publicCheckInCard(checkInCard({
        name: saved.display_name,
        picture: saved.photo_url,
        profile_url: saved.profile_url,
      }))
      : null;
    return { band_km: row.band_km, sector: row.sector, card };
  });
  return NextResponse.json(
    { total: Number(count.data.total), cells },
    { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } }
  );
}
