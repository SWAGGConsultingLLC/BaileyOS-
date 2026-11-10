import { QUESTION_PROMPT } from '@/lib/brew/question001';
import { readStewardQuestion } from '@/lib/brew/store';
import { stewardReportAccess } from '@/lib/steward/report';
import { readStewardGrant, readSuiteCounts } from '@/lib/steward/store';
import { fetchSuiteUser } from '@/lib/suite/hosted';
import { decideSuiteSubject, suiteConfig } from '@/lib/suite/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const config = suiteConfig();
  if (!config) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const decision = decideSuiteSubject(token, await fetchSuiteUser(token, config));
  if (!decision.ok) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  let grant;
  try {
    grant = await readStewardGrant(decision.subject);
  } catch {
    return Response.json({ error: 'The report could not be read.' }, { status: 500 });
  }
  const access = stewardReportAccess(decision.subject, grant);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  try {
    const counts = await readSuiteCounts();
    const question = await readStewardQuestion();
    return Response.json({
      members: counts.members,
      recentSignIns: counts.recentSignIns,
      question: {
        prompt: QUESTION_PROMPT,
        total: question.tally.total,
        options: question.tally.options,
        votes: question.votes,
      },
    });
  } catch {
    return Response.json({ error: 'The report could not be read.' }, { status: 500 });
  }
}
