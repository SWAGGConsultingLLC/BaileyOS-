export type ProviderName = 'gemini' | 'grok';

export type HistoryEntry = {
  id: string;
  kind: 'steward' | 'participant' | 'model';
  authorId: string;
  provider?: ProviderName;
  text: string;
  simulated?: boolean;
};

export type TurnRequest = {
  id: string;
  provider: ProviderName;
  intent: string;
  by: string;
  status: 'pending' | 'rejected' | 'granted' | 'complete' | 'failed' | 'stale';
  historyDigest: string;
  outputId?: string;
};

export type ModelOutput = {
  id: string;
  provider: ProviderName;
  text: string;
  historyDigest: string;
  digest: string;
};

export type ReleaseRecord = {
  outputId: string;
  digest: string;
  snapshot: string;
  provider: ProviderName;
};

export type SharedSession = {
  id: string;
  participantIds: string[];
  history: HistoryEntry[];
  requests: TurnRequest[];
  outputs: ModelOutput[];
  releases: ReleaseRecord[];
};

export type Actor = {
  id: string;
  role: 'steward' | 'member';
};

export type ProviderInput = {
  provider: ProviderName;
  history: HistoryEntry[];
};

export type Provider = (input: ProviderInput) => Promise<{ text: string }>;
