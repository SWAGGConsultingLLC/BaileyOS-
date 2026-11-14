import { BrewLogo } from '@/components/BrewLogo';
import { BREWING_PLACE_LINE } from '@/lib/brew/question001';

export default function BrewingHome() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <BrewLogo />
      <h1 className="mt-2 text-3xl font-bold">Welcome</h1>
      <p className="mt-4 text-lg text-gray-200">{BREWING_PLACE_LINE}</p>
      <a className="mt-6 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/brew/q/001">Question #001</a>
      <a className="mt-8 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href="/">Back to the map</a>
    </main>
  );
}
