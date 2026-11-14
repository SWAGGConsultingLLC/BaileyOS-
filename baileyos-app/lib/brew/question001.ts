export const QUESTION_ID = '001';
export const QUESTION_PATH = '/brew/q/001';
export const QUESTION_VOTE_PATH = '/brew/q/001/vote';
export const CHECKIN_RETURN = '/?checkin=1';
export const MAP_RETURN = '/';
export const MISSION_PATH = '/brew/mission';
export const BREW_RETURN_KEY = 'baileyos_brew_return';
export const QUESTION_TITLE = '360° Brewing | Question #001';
export const QUESTION_DESCRIPTION = 'One verified person, one vote. Results counted in the open. Sign in with LinkedIn and add your voice to Question #001.';
export const QUESTION_IMAGE = 'https://baileyos-app.vercel.app/brew/question-001.png?v=2';
export const BREWING_PLACE_LINE = 'This is your place in 360° Brewing. The mission is to show up and keep the record honest.';
export const MISSION_TITLE = '360° Brewing: Our Mission';
export const MISSION_BODY = 'We\'re reconnecting people from LinkedIn, and later other platforms, into a like-minded community of active participants. People who want to make a difference, hold each other accountable, and have a real say in what gets seen. Every voice is verified, one per person. Every vote is recorded and counted in the open, and outside reviewers check the results. Built on integrity and efficacy, we decide together what matters, instead of leaving it to the elites and corporate executives.';
export const QUESTION_PROMPT = 'Before any shared AI answer from 360° Brewing is released publicly, should it first be reviewed by outside auditors, or can the Steward release it as long as every step is permanently logged?';

export const VOTE_OPTIONS = [
  { option: 'A', label: 'Outside review required first' },
  { option: 'B', label: 'Steward release with a permanent public log' },
  { option: 'C', label: 'Abstain, record my presence only' },
] as const;

export type VoteOption = (typeof VOTE_OPTIONS)[number]['option'];

export function voteOption(value: unknown): VoteOption | null {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

export function voteLabel(option: VoteOption): string {
  return VOTE_OPTIONS.find(item => item.option === option)?.label ?? option;
}

export function brewReturnPath(value: string | null): string | null {
  if (value === QUESTION_VOTE_PATH || value === CHECKIN_RETURN || value === MAP_RETURN) return value;
  return null;
}

export type PublicOption = { option: VoteOption; label: string; count: number; percent: number };
export type PublicTally = { total: number; options: PublicOption[] };

export function publicTally(counts: Record<VoteOption, number>): PublicTally {
  const options = VOTE_OPTIONS.map(item => ({ ...item, count: counts[item.option] }));
  const total = options.reduce((sum, item) => sum + item.count, 0);
  return {
    total,
    options: options.map(item => ({
      ...item,
      percent: total === 0 ? 0 : Math.round((item.count / total) * 1000) / 10,
    })),
  };
}

export type PublicVote = { at: string; option: VoteOption; receipt: string };

const IDENTITY_KEYS = ['subject_id', 'subject', 'email', 'name', 'provider_sub', 'sub', 'user_id'];

export function publicResults(counts: Record<VoteOption, number>): PublicTally {
  return publicTally(counts);
}

export function assertNoIdentity(value: unknown): void {
  const text = JSON.stringify(value);
  for (const key of IDENTITY_KEYS) {
    if (text.includes(`"${key}"`)) throw new Error(`identity field ${key}`);
  }
}

export type QuestionWindow = {
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

export type PublicResults = PublicTally & {
  closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  message: string;
};

export function questionIsClosed(closesAt: string | null | undefined, now = new Date()): boolean {
  if (!closesAt) return false;
  const close = new Date(closesAt);
  if (Number.isNaN(close.getTime())) return false;
  return now.getTime() >= close.getTime();
}

export function formatQuestionDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export function closedQuestionMessage(closesAt?: string | null): string {
  if (closesAt && !Number.isNaN(new Date(closesAt).getTime())) {
    return `This question closed on ${formatQuestionDate(closesAt)}. Final results are below.`;
  }
  return 'This question is closed. Final results are below.';
}

export function votingClosesMessage(closesAt: string): string {
  return `Voting closes ${formatQuestionDate(closesAt)}`;
}

export function questionStatusMessage(window: QuestionWindow): string {
  if (!window.closesAt) return '';
  return window.closed ? closedQuestionMessage(window.closesAt) : votingClosesMessage(window.closesAt);
}
