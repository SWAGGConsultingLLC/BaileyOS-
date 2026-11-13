export const AGE_GATE_EVENTS = ['gate_shown', 'backed_out', 'click', 'dwell'] as const;
export type AgeGateEvent = (typeof AGE_GATE_EVENTS)[number];

export function parseAgeGateLog(body: Record<string, unknown>): { event: AgeGateEvent; dwell_ms?: number } | { error: string } {
  const event = body.event;
  if (event !== 'gate_shown' && event !== 'backed_out' && event !== 'click' && event !== 'dwell') {
    return { error: 'Bad request' };
  }
  if (event === 'dwell') {
    const dwell = body.dwell_ms;
    if (typeof dwell !== 'number' || !Number.isFinite(dwell) || !Number.isInteger(dwell) || dwell < 0) {
      return { error: 'Bad request' };
    }
    return { event, dwell_ms: dwell };
  }
  if (body.dwell_ms != null) return { error: 'Bad request' };
  return { event };
}
