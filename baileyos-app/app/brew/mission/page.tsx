import { BackToMap } from '@/components/BackToMap';
import { BrewLogo } from '@/components/BrewLogo';
import { MISSION_BODY, MISSION_TITLE, QUESTION_VOTE_PATH } from '@/lib/brew/question001';

export default function MissionPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <BrewLogo />
      <h1 className="mt-2 text-3xl font-bold">{MISSION_TITLE}</h1>
      <p className="mt-4 text-lg text-gray-200">{MISSION_BODY}</p>
      <a className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-white px-4 font-semibold text-black" href={QUESTION_VOTE_PATH}>Continue</a>
      <div className="mt-4"><BackToMap /></div>
    </main>
  );
}
