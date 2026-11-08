import { handleWorkspace, liveDeps } from '@/lib/workspace/handle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deps = liveDeps();

export function GET(req: Request) {
  return handleWorkspace(req, deps);
}

export function POST(req: Request) {
  return handleWorkspace(req, deps);
}
