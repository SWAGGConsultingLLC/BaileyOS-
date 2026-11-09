import { handleWorkspace, liveDeps } from '@/lib/workspace/handle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return handleWorkspace(req, liveDeps());
}

export function POST(req: Request) {
  return handleWorkspace(req, liveDeps());
}
