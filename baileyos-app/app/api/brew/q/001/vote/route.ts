import { QUESTION_ID, voteLabel, voteOption } from '@/lib/brew/question001';
import { QuestionClosedError, readOwnVote, recordVote, subjectIsVerified } from '@/lib/brew/store';
import { fetchSuiteUser } from '@/lib/suite/hosted';
import { decideSuiteSubject, suiteConfig } from '@/lib/suite/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifiedSubject(req: Request): Promise<{ ok: true; subject: string } | { ok: false; status: 401 }> {
  const config = suiteConfig();
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!config || !token) return { ok: false, status: 401 };
  const decision = decideSuiteSubject(token, await fetchSuiteUser(token, config));
  if (!decision.ok) return { ok: false, status: 401 };
  try {
    if (!await subjectIsVerified(decision.subject)) return { ok: false, status: 401 };
  } catch {
    return { ok: false, status: 401 };
  }
  return { ok: true, subject: decision.subject };
}

export async function GET(req: Request) {
  const who = await verifiedSubject(req);
  if (!who.ok) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  try {
    const option = await readOwnVote(who.subject);
    return Response.json({ question: QUESTION_ID, option, label: option ? voteLabel(option) : null });
  } catch {
    return Response.json({ error: 'The vote could not be read.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const who = await verifiedSubject(req);
  if (!who.ok) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const option = voteOption(body && typeof body === 'object' ? (body as { option?: unknown }).option : null);
  if (!option) return Response.json({ error: 'Choose A, B, or C.' }, { status: 400 });
  try {
    const saved = await recordVote(who.subject, option);
    return Response.json({
      question: QUESTION_ID,
      recorded: true,
      option: saved.option,
      label: voteLabel(saved.option),
      already: saved.already,
    });
  } catch (err) {
    if (err instanceof QuestionClosedError) {
      return Response.json(
        { error: err.message, closed: true, closes_at: err.closesAt },
        { status: 409 },
      );
    }
    return Response.json({ error: 'The vote could not be recorded.' }, { status: 500 });
  }
}
