import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public read: quantized cells and the aggregate count only. No ids, hours, or keys.
export async function GET() {
  const db = admin();
  const [count, rows] = await Promise.all([
    db.from('placed_count').select('total').eq('id', true).single(),
    db.from('placements').select('band_km, sector').order('created_at', { ascending: false }).limit(5000)
  ]);
  if (count.error || rows.error) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  return NextResponse.json(
    { total: Number(count.data.total), cells: rows.data },
    { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } }
  );
}
