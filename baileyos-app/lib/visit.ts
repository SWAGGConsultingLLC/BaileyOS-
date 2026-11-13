export const VISIT_CATEGORIES = ['logged_out_visitor', 'logged_in', 'blocked'] as const;
export type VisitCategory = (typeof VISIT_CATEGORIES)[number];

export function parseVisitCategory(value: unknown): VisitCategory | null {
  if (value === 'logged_out_visitor' || value === 'logged_in' || value === 'blocked') return value;
  return null;
}
