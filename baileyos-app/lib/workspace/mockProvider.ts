import type { HistoryEntry, Provider, ProviderName } from './types';

/** Simulated reply only. This function does not read keys and does not use the network. */
export function simulatedProvider(options?: { fail?: boolean; calls?: { provider: ProviderName; history: HistoryEntry[] }[] }): Provider {
  return async input => {
    options?.calls?.push({ provider: input.provider, history: input.history.map(item => ({ ...item })) });
    if (options?.fail) throw new Error('Simulated provider failure');
    return {
      text: [
        `Simulated ${input.provider} reply.`,
        'This is not a live Gemini or Grok connection.',
        `Authorized messages supplied: ${input.history.length}.`,
        input.history.map(item => `${item.kind}:${item.text}`).join(' | '),
        'Models may dissent. This text does not prove that anything is true, and it cannot grant permission.',
      ].join('\n'),
    };
  };
}
