import { NextRequest, NextResponse } from 'next/server';
import { allow } from '@/lib/rateLimit';
import { preparePlacement } from '@/lib/placeRequest';
import { admin } from '@/lib/supabaseAdmin';
import { linkToken, safeEqual } from '@/lib/crypto';
import { ownerPlacementBody } from '@/lib/crowd';
import { checkInCard, shouldAttachCheckInProfile, type CheckInCard } from '@/lib/checkInProfile';
import { fetchSuiteUser } from '@/lib/suite/hosted';
import { decideSuiteSubject, suiteConfig } from '@/lib/suite/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

type VerifiedIdentity = { subject: string; card: CheckInCard | null };

async function verifiedIdentity(req: NextRequest): Promise<VerifiedIdentity | null> {
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
  const linkedIn = user?.identities?.find(item => item.provider === 'linkedin_oidc');
  return { subject: decision.subject, card: checkInCard(linkedIn?.identity_data) };
}

async function attachCard(placementId: number, card: CheckInCard): Promise<boolean> {
  if (!shouldAttachCheckInProfile({ showLinkedIn: true, verified: true, card })) return false;
  const saved = await admin().from('placement_cards').upsert({
    placement_id: placementId,
    display_name: card.name,
    photo_url: card.photo,
    profile_url: card.profileUrl,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'placement_id' });
  return !saved.error;
}

async function shareExisting(req: NextRequest, body: Record<string, unknown>) {
  const identity = await verifiedIdentity(req);
  if (!identity) return fail('Sign in with LinkedIn to share your name.', 401);
  const placementId = body.placement_id;
  const token = body.link_token;
  if (typeof placementId !== 'number' || !Number.isInteger(placementId) || typeof token !== 'string') return fail('Bad request');
  if (!safeEqual(token, linkToken(placementId))) return fail('Bad request', 403);
  const owned = await admin().from('placements').select('id, subject_id').eq('id', placementId).maybeSingle();
  if (owned.error || !owned.data || owned.data.subject_id !== identity.subject) return fail('Bad request', 403);
  if (!identity.card) return fail('Could not read a name to share', 400);
  const shared = await attachCard(placementId, identity.card);
  if (!shared) return fail('Could not update the check-in', 500);
  return NextResponse.json({ shared_profile: true, placement_id: placementId });
}

// Check-in requires a verified LinkedIn identity. One live pin per person.
// A check-in is anonymous until the person uses the Share action.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request'); }
  if (body.share === true) return shareExisting(req, body);

  const identity = await verifiedIdentity(req);
  if (!identity) return fail('Sign in with LinkedIn to check in.', 401);

  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const prepared = preparePlacement({ body, now: Date.now(), ip, allow });
  if (!prepared.ok) return fail(prepared.error, prepared.status);

  const db = admin();
  const { data, error } = await db.rpc('upsert_placement_for_subject', {
    p_band: prepared.cell.band_km,
    p_sector: prepared.cell.sector,
    p_hour: prepared.hour,
    p_key: '\\x' + prepared.key,
    p_h3: prepared.hex,
    p_phone: '\\x' + prepared.phoneKey,
    p_subject: identity.subject,
  });
  if (error || data == null) return fail('Could not record placement', 500);
  const placementId = Number(data);
  if (!Number.isInteger(placementId)) return fail('Could not record placement', 500);

  return NextResponse.json(ownerPlacementBody({
    status: 'placed',
    hex: prepared.hex,
    placementId,
    linkToken: linkToken(placementId),
    shared: false,
  }));
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail('Bad request'); }
  const identity = await verifiedIdentity(req);
  if (!identity) return fail('Sign in with LinkedIn to update your check-in.', 401);
  const placementId = body.placement_id;
  const token = body.link_token;
  if (typeof placementId !== 'number' || !Number.isInteger(placementId) || typeof token !== 'string') return fail('Bad request');
  if (!safeEqual(token, linkToken(placementId))) return fail('Bad request', 403);
  const owned = await admin().from('placements').select('id, subject_id').eq('id', placementId).maybeSingle();
  if (owned.error || !owned.data || owned.data.subject_id !== identity.subject) return fail('Bad request', 403);
  const { error } = await admin().from('placement_cards').delete().eq('placement_id', placementId);
  if (error) return fail('Could not update the check-in', 500);
  return NextResponse.json({ shared_profile: false });
}
