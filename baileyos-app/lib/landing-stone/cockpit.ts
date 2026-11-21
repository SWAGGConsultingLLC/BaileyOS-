export function lightMeaning(kind: 'consensus' | 'feed' | 'chain' | 'lock', state: string): string {
  const name = state || 'PENDING';
  if (kind === 'consensus' && name === 'QUORUM INCOMPLETE') return 'What this means: fewer than 3 helpers answered. Two agreeing is not enough.';
  if (kind === 'consensus' && name === 'NO ACTIVE VETO') return 'What this means: no check blocked this. The steward still decides.';
  if (kind === 'consensus' && name === 'CONDITIONS SATISFIED') return 'What this means: the checks that ran were met. This is not a travel clearance.';
  if (kind === 'feed' && name === 'NO ACTIVE VETO') return 'What this means: recent feed checks did not block.';
  if (kind === 'feed' && name === 'DEGRADED') return 'What this means: a feed is old, or a 200 response had an unexpected shape.';
  if (kind === 'feed' && name === 'RED') return 'What this means: a stored feed check failed.';
  if (kind === 'chain' && name === 'RECORD INTACT') return 'What this means: the seals recompute. That does not clear the road.';
  if (kind === 'chain' && name === 'RED') return 'What this means: a seal or a sequence number does not match.';
  if (kind === 'lock' && name === 'ANCHORED') return 'What this means: an outside witness has the head. The steward still decides.';
  if (kind === 'lock') return 'What this means: no outside witness has the head yet.';
  if (kind === 'feed') return 'What this means: no feed check is stored yet.';
  if (kind === 'chain') return 'What this means: no records to recompute yet.';
  return 'What this means: not enough rulings yet. This is not a go-ahead.';
}

export type CockpitAct = 'convene' | 'approve' | 'stand_down';

export type ActDecision =
  | { ok: true; act: CockpitAct }
  | { ok: false; status: 400 | 401 | 403; error: string };

/** Steward controls only. A missing sign-in and a non-steward both stay out. */
export function decideCockpitAct(input: {
  signedIn: boolean;
  steward: boolean;
  act: string;
  hasReport: boolean;
  head: string | null;
}): ActDecision {
  if (!input.signedIn || !input.steward) return { ok: false, status: input.signedIn ? 403 : 401, error: 'Steward only' };
  if (input.act === 'convene') {
    if (!input.hasReport) {
      return { ok: false, status: 400, error: 'No live report is attached. Open Data Nest and run a real check first.' };
    }
    return { ok: true, act: 'convene' };
  }
  if (input.act === 'approve') {
    if (!input.head) return { ok: false, status: 400, error: 'There is no chain head to approve.' };
    return { ok: true, act: 'approve' };
  }
  if (input.act === 'stand_down') return { ok: true, act: 'stand_down' };
  return { ok: false, status: 400, error: 'Unknown steward act.' };
}

export type CompassRecord = {
  dissent: string[];
  vetoes: { feed_id?: string; rule_id?: string; feed_status?: string; veto_triggered?: boolean }[];
  sources: { id?: string; status?: string; record_count?: number }[];
};

/** Facts for the compass from one stored ruling. Empty when there is no record. */
export function compassRecord(record: unknown): CompassRecord {
  const body = record && typeof record === 'object' ? record as Record<string, unknown> : {};
  const queen = body.queen && typeof body.queen === 'object' ? body.queen as Record<string, unknown> : {};
  if (queen.ruling === 'GENESIS') return { dissent: [], vetoes: [], sources: [] };
  const dissent: string[] = [];
  const rows = Array.isArray(body.dissent) ? body.dissent : [];
  for (const row of rows) {
    if (row && typeof row === 'object' && typeof (row as { reviewer?: unknown }).reviewer === 'string') {
      dissent.push((row as { reviewer: string }).reviewer);
    }
  }
  const verdicts = Array.isArray(body.verdicts) ? body.verdicts : [];
  for (const row of verdicts) {
    if (!row || typeof row !== 'object') continue;
    const verdict = row as { reviewer?: unknown; outcome?: unknown; verdict?: unknown };
    const denied = verdict.outcome === 'denied' || verdict.verdict === 'disagree';
    if (denied && typeof verdict.reviewer === 'string' && !dissent.includes(verdict.reviewer)) dissent.push(verdict.reviewer);
  }
  const vetoes = Array.isArray(body.code_vetoes)
    ? body.code_vetoes.filter((row) => row && typeof row === 'object' && (row as { veto_triggered?: unknown }).veto_triggered === true)
    : [];
  const fresh = body.freshness && typeof body.freshness === 'object' ? body.freshness as { sources?: unknown } : {};
  const sources = Array.isArray(fresh.sources) ? fresh.sources.filter((row) => row && typeof row === 'object') : [];
  return { dissent, vetoes: vetoes as CompassRecord['vetoes'], sources: sources as CompassRecord['sources'] };
}
