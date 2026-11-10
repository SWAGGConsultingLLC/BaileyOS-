import { createHash, randomBytes } from 'node:crypto';
import type { VoteOption } from './question001';

export function newSalt(): string {
  return randomBytes(32).toString('hex');
}

/** Stable per-question receipt. The salt never leaves the server. */
export function voteReceipt(salt: string, subjectId: string): string {
  return createHash('sha256').update(`${salt}:${subjectId}`).digest('hex');
}

export function publicVoteRow(input: { at: string; option: VoteOption; subjectId: string }, salt: string): { at: string; option: VoteOption; receipt: string } {
  return { at: input.at, option: input.option, receipt: voteReceipt(salt, input.subjectId) };
}
