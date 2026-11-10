import React from 'react';
import { BackToMap } from '@/components/BackToMap';
import { BrewLogo } from '@/components/BrewLogo';
import { VoteLog } from '@/components/VoteLog';
import { readVerification } from '@/lib/brew/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function VoteVerification() {
  let log: Awaited<ReturnType<typeof readVerification>> | null = null;
  try {
    log = await readVerification();
  } catch {
    log = null;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <BrewLogo />
      <h1 className="mt-2 text-3xl font-bold">Question #001 vote log</h1>
      <p className="mt-4 text-gray-300">Each row is a time, an option, and a receipt. The receipt is a per-question hash. It does not show who voted.</p>
      {log ? <VoteLog initial={log} /> : <p className="mt-4 text-amber-100">The vote log could not be read.</p>}
      <div className="mt-8 flex flex-col">
        <a className="inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/brew/q/001">Back to the question</a>
        <BackToMap />
      </div>
    </main>
  );
}
