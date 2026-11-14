import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const bin = path.join(process.cwd(), 'vendor', 'python', 'bin', 'python3');
if (fs.existsSync(bin)) process.exit(0);
if (process.env.VERCEL !== '1' && process.env.ENSURE_PYTHON !== '1') {
  console.log('Data Nest: using system python3. Set ENSURE_PYTHON=1 to download the standalone runtime.');
  process.exit(0);
}

const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const file = `cpython-3.12.11+20250918-${arch}-unknown-linux-gnu-install_only_stripped.tar.gz`;
const url = `https://github.com/astral-sh/python-build-standalone/releases/download/20250918/${file}`;
fs.mkdirSync('vendor', { recursive: true });
execSync(`curl -fsSL -o /tmp/baileyos-cpython.tgz -L ${JSON.stringify(url)}`, { stdio: 'inherit' });
execSync('tar -xzf /tmp/baileyos-cpython.tgz -C vendor', { stdio: 'inherit' });
execSync('rm -rf vendor/python/lib/python3.12/test vendor/python/lib/python3.12/ensurepip vendor/python/lib/python3.12/idlelib', { stdio: 'inherit' });
if (!fs.existsSync(bin)) {
  console.error('Standalone Python did not extract to vendor/python/bin/python3');
  process.exit(1);
}
