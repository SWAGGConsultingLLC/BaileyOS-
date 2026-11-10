import { NextRequest, NextResponse } from 'next/server';
import { allow } from '@/lib/rateLimit';
import { preparePlacement } from '@/lib/placeRequest';
import { admin } from '@/lib/supabaseAdmin';
import { linkToken, safeEqual } from '@/lib/crypto';
import { checkInCard, shouldAttachCheckInProfile, type CheckInCard } from '@/lib/checkInProfile';
import { fetchSuiteUser } from '@/lib/suite/hosted';
import { decideSuiteSubject, suiteConfig } from '@/lib/suite/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Raw lat/lon live only inside preparePlacement. Do not log the request body.
// This route does not read an email and does not look up a member.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request'); }
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const prepared = preparePlacement({ body, now: Date.now(), ip, allow });
  if (!prepared.ok) return fail(prepared.error, prepared.status);

  const db = admin();
  const { data, error } = await db.rpc('insert_placement', {
    p_band: prepared.cell.band_km,
    p_sector: prepared.cell.sector,
    p_hour: prepared.hour,
    p_key: '\\x' + prepared.key,
  });
  if (error) return fail('Could not record placement', 500);

  let placementId = data == null ? null : Number(data);
  if (placementId == null) {
    const found = await db.rpc('placement_id_for_key', { p_key: '\\x' + prepared.key });
    if (!found.error && found.data != null) placementId = Number(found.data);
  }
  const showLinkedIn = body.show_linkedin === true;
  let shared = false;
  if (placementId != null && showLinkedIn) {
    const card = await profileFromSession(req);
    if (card && shouldAttachCheckInProfile({ showLinkedIn: true, verified: true, card })) {
      const saved = await db.from('placement_cards').upsert({
        placement_id: placementId,
        display_name: card.name,
        photo_url: card.photo,
        profile_url: card.profileUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'placement_id' });
      shared = !saved.error;
    }
  } else if (placementId != null && body.show_linkedin === false) {
    await db.from('placement_cards').delete().eq('placement_id', placementId);
  }

  if (data == null) return NextResponse.json({ status: 'duplicate', ...prepared.cell, shared_profile: shared });
  return NextResponse.json({
    status: 'placed',
    ...prepared.cell,
    placement_id: data,
    link_token: linkToken(Number(data)),
    shared_profile: shared,
  });
}

async function profileFromSession(req: NextRequest): Promise<CheckInCard | null> {
  const config = suiteConfig();
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!config || !token) return null;
  const decision = decideSuiteSubject(token, await fetchSuiteUser(token, config));
  if (!decision.ok) return null;
  const verified = await admin()
    .from('verified_suite_subjects')
    .select('subject_id')
    .eq('subject_id', decision.subject)
    .eq('provider', 'linkedin_oidc')
    .maybeSingle();
  if (verified.error || !verified.data) return null;
  const user = await fetchSuiteUser(token, config);
  const identity = user?.identities?.find(item => item.provider === 'linkedin_oidc');
  return checkInCard(identity?.identity_data);
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request'); }
  const placementId = body.placement_id;
  const token = body.link_token;
  if (typeof placementId !== 'number' || !Number.isInteger(placementId) || typeof token !== 'string') return fail('Bad request');
  if (!safeEqual(token, linkToken(placementId))) return fail('Bad request', 403);
  const { error } = await admin().from('placement_cards').delete().eq('placement_id', placementId);
  if (error) return fail('Could not update the check-in', 500);
  return NextResponse.json({ shared_profile: false });
}
