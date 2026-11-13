import { handleOracle } from '@/lib/oracle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Shape and error codes are documented on handleOracle in lib/oracle.ts.
export function OPTIONS(req: Request) {
  return handleOracle(req);
}

export function POST(req: Request) {
  return handleOracle(req);
}
