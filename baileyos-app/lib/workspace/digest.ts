import { createHash } from 'crypto';
import type { HistoryEntry, ProviderName } from './types';

export function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function historyDigest(history: HistoryEntry[]): string {
  return digest(history.map(item => [item.id, item.kind, item.authorId, item.provider || '', item.text].join('\n')).join('\n---\n'));
}

export function outputDigest(input: { provider: ProviderName; text: string; historyDigest: string }): string {
  return digest([input.provider, input.historyDigest, input.text].join('\n'));
}
