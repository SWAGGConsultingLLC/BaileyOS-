import { isActiveSteward, type StewardGrant } from './decide';

export type ReportAccess =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

/** Steward report access. The subject must already be the verified map user. Email is not an input. */
export function stewardReportAccess(subject: string | null, grant: StewardGrant | null): ReportAccess {
  if (!subject) return { ok: false, status: 401, error: 'Sign in required.' };
  if (!isActiveSteward(subject, grant)) return { ok: false, status: 403, error: 'Steward only' };
  return { ok: true };
}
