import type { Metadata } from 'next';
import { MISSION_PATH, QUESTION_DESCRIPTION, QUESTION_IMAGE, QUESTION_PROMPT, QUESTION_TITLE } from '@/lib/brew/question001';

export const metadata: Metadata = {
  title: QUESTION_TITLE,
  description: QUESTION_DESCRIPTION,
  openGraph: {
    title: QUESTION_TITLE,
    description: QUESTION_DESCRIPTION,
    url: 'https://baileyos-app.vercel.app/brew/q/001',
    images: [{ url: QUESTION_IMAGE, width: 1200, height: 627, alt: '360° Brewing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: QUESTION_TITLE,
    description: QUESTION_DESCRIPTION,
    images: [QUESTION_IMAGE],
  },
};

export default function QuestionPreview() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-bold tracking-wide text-gray-400">360° BREWING</p>
      <h1 className="mt-2 text-3xl font-bold">{QUESTION_TITLE}</h1>
      <p className="mt-4 text-lg text-gray-200">{QUESTION_DESCRIPTION}</p>
      <p className="mt-4 text-gray-300">{QUESTION_PROMPT}</p>
      <a className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-white px-4 font-semibold text-black" href={MISSION_PATH}>Read the mission</a>
      <p className="mt-6 text-sm text-gray-400"><a className="underline" href="/brew/q/001/verify">Outside reviewers can check the vote log.</a></p>
    </main>
  );
}
