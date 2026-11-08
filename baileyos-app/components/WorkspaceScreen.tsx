'use client';

import { useEffect, useState } from 'react';

type ProviderName = 'gemini' | 'grok';
type Entry = { id: string; kind: string; authorId: string; provider?: string; text: string; simulated?: boolean };
type RequestItem = { id: string; provider: ProviderName; intent: string; by: string; status: string; historyDigest: string; outputId?: string };
type Output = { id: string; provider: ProviderName; text: string; digest: string };
type View = { id: string; history: Entry[]; requests: RequestItem[]; outputs: Output[]; releases: { outputId: string; digest: string }[] };

async function post(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch('/api/workspace', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json();
  return { ok: res.ok, body };
}

export function WorkspaceScreen() {
  const [mode, setMode] = useState<'loading' | 'closed' | 'fixture'>('loading');
  const [actorRole, setActorRole] = useState<string>('');
  const [session, setSession] = useState<View | null>(null);
  const [note, setNote] = useState('');
  const [intent, setIntent] = useState('Look at the shared notes and reply.');
  const [message, setMessage] = useState('');
  const [exportText, setExportText] = useState('');

  useEffect(() => {
    fetch('/api/workspace', { credentials: 'same-origin' }).then(r => r.json()).then(body => {
      setMode(body.mode === 'fixture' ? 'fixture' : 'closed');
    }).catch(() => setMode('closed'));
  }, []);

  function apply(body: { actor?: { role: string }; session?: View; error?: string; export?: { text: string } }) {
    if (body.actor) setActorRole(body.actor.role);
    if (body.session) setSession(body.session);
    if (body.error) setMessage(body.error);
    if (body.export) setExportText(body.export.text);
  }

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setMessage('');
    const result = await post(action, { sessionId: session?.id, ...extra });
    apply(result.body);
  }

  if (mode === 'loading') return <p className="p-6 text-lg">Loading the workspace status.</p>;

  if (mode === 'closed') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm font-bold tracking-wide text-amber-200">Prototype — simulated responses; no live Gemini or Grok connection</p>
        <h1 className="mt-3 text-3xl font-bold">Shared conversation</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-200">This workspace is closed on this server. A trusted steward check is not configured, so nobody can grant a turn or release text from here.</p>
        <p className="mt-3 text-gray-400">The map on the home page is separate and does not use this screen.</p>
      </main>
    );
  }

  const pending = session?.requests.find(item => item.status === 'pending');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm font-bold tracking-wide text-amber-200">Prototype — simulated responses; no live Gemini or Grok connection</p>
      <p className="mt-2 text-sm text-amber-100">Local fixture — not production authority</p>
      <h1 className="mt-3 text-3xl font-bold">Shared conversation</h1>
      <p className="mt-3 leading-relaxed text-gray-300">A steward decides one turn at a time. Simulated replies can disagree. Agreement is not proof. A reply cannot grant permission.</p>

      {!actorRole && (
        <button type="button" className="mt-6 min-h-12 w-full rounded-lg bg-cyan-300 px-4 font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={async () => {
          const result = await post('fixtureLogin');
          if (result.ok) setActorRole('pending');
          else setMessage(result.body.error || 'This workspace is closed.');
        }}>
          Use local fixture steward
        </button>
      )}

      {actorRole === 'pending' && (
        <button type="button" className="mt-4 min-h-12 rounded-lg border border-cyan-300 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('create', { participantIds: ['member-1'] })}>
          Start a session with the local member
        </button>
      )}

      {session && (
        <section className="mt-6" aria-label="Shared history">
          <h2 className="text-xl font-semibold">History</h2>
          <ol className="mt-3 space-y-3">
            {session.history.length === 0 && <li className="text-gray-400">No messages yet.</li>}
            {session.history.map(item => (
              <li key={item.id} className="rounded-lg border border-gray-700 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">{item.kind === 'model' ? `Simulated ${item.provider}` : item.kind}</p>
                <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
              </li>
            ))}
          </ol>

          <label className="mt-6 block text-sm" htmlFor="note">Add a labeled note</label>
          <textarea id="note" value={note} onChange={e => setNote(e.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-gray-600 bg-transparent p-3" />
          <button type="button" className="mt-2 min-h-12 rounded-lg bg-white px-4 font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" onClick={() => { const text = note; setNote(''); return run('note', { text }); }}>
            Add note
          </button>

          <h2 className="mt-8 text-xl font-semibold">Ask for one turn</h2>
          <label className="mt-2 block text-sm" htmlFor="intent">What should this turn consider?</label>
          <input id="intent" value={intent} onChange={e => setIntent(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-600 bg-transparent p-3" />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="min-h-12 flex-1 rounded-lg border border-cyan-300 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('handRaise', { provider: 'gemini', intent })}>Ask for a Gemini turn</button>
            <button type="button" className="min-h-12 flex-1 rounded-lg border border-cyan-300 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('handRaise', { provider: 'grok', intent })}>Ask for a Grok turn</button>
          </div>

          {pending && (
            <div className="mt-4 rounded-lg border border-amber-200/40 p-3" aria-live="polite">
              <p>Waiting for a steward. {pending.provider} has not been asked yet.</p>
              <p className="mt-1 text-sm text-gray-300">{pending.intent}</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button type="button" className="min-h-12 rounded-lg bg-cyan-300 px-4 font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('grant', { requestId: pending.id, historyDigest: pending.historyDigest })}>Grant this turn</button>
                <button type="button" className="min-h-12 rounded-lg border border-gray-500 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('reject', { requestId: pending.id })}>Reject this turn</button>
              </div>
            </div>
          )}

          <h2 className="mt-8 text-xl font-semibold">Release an exact reply</h2>
          <ul className="mt-3 space-y-3">
            {session.outputs.map(output => (
              <li key={output.id} className="rounded-lg border border-gray-700 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">Simulated {output.provider}</p>
                <p className="mt-1 whitespace-pre-wrap">{output.text}</p>
                <button type="button" className="mt-3 min-h-12 rounded-lg border border-amber-200 px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('release', { outputId: output.id, digest: output.digest })}>Approve this exact text</button>
                <button type="button" className="mt-3 min-h-12 rounded-lg border border-gray-500 px-4 font-semibold sm:ml-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => run('export', { outputId: output.id })}>Retrieve the approved text</button>
              </li>
            ))}
          </ul>
          {exportText && (
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-black p-3 text-sm" aria-label="Approved export">{exportText}</pre>
          )}
        </section>
      )}
      {message && <p className="mt-4 text-amber-100" role="status">{message}</p>}
    </main>
  );
}
