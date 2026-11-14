import { readFileSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const html = readFileSync(path.join(process.cwd(), 'public/landing-stone/index.html'), 'utf8');

export function GET() {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
