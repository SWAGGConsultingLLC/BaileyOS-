import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function pythonBin(): string {
  const vendored = path.join(process.cwd(), 'vendor', 'python', 'bin', 'python3');
  if (process.env.DATA_NEST_PYTHON && fs.existsSync(process.env.DATA_NEST_PYTHON)) return process.env.DATA_NEST_PYTHON;
  if (fs.existsSync(vendored)) return vendored;
  return 'python3';
}

export function runPython(code: string, input: string): { ok: true; stdout: string } | { ok: false; error: string } {
  const bin = pythonBin();
  const result = spawnSync(bin, ['-c', code], {
    input,
    encoding: 'utf8',
    timeout: 20_000,
    cwd: process.cwd(),
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONPATH: path.join(process.cwd(), 'api'),
    },
  });
  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
    return { ok: false, error: missing ? 'Python is not available on this server.' : 'Python could not start.' };
  }
  if (result.status !== 0) {
    const detail = (result.stderr || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    return { ok: false, error: detail || 'Python exited with an error.' };
  }
  return { ok: true, stdout: result.stdout };
}

export function runPythonJson(code: string, payload: unknown): { ok: true; data: unknown } | { ok: false; error: string } {
  const ran = runPython(code, JSON.stringify(payload));
  if (!ran.ok) return ran;
  try {
    return { ok: true, data: JSON.parse(ran.stdout) };
  } catch {
    return { ok: false, error: 'Python did not return JSON.' };
  }
}

export const SEAL_CODE = `
import json, sys
from _validate_corridor import seal
from _ruling import attach_feed_fingerprints
d = json.load(sys.stdin)
fresh = attach_feed_fingerprints(d.get("freshness") or {}, d.get("payloads") or {})
json.dump(seal({"corridor": d.get("corridor"), "nodes": d.get("nodes"), "freshness": fresh}), sys.stdout)
`;

export const CONVENE_CODE = `
import json, sys
from _consensus import convene
d = json.load(sys.stdin)
json.dump(convene(d.get("report_canonical_json"), d.get("report_sha256"), d.get("gemini"), d.get("kimi"), input_canonical_json=d.get("input_canonical_json"), payloads=d.get("payloads")), sys.stdout)
`;

export const RECORD_CODE = `
import json, sys
from datetime import datetime, timezone
from _ruling import build_genesis_record, build_ruling_record, continuity_lights, verify_ruling_record, daily_anchor
d = json.load(sys.stdin)
op = d.get("op")
if op == "verify":
    json.dump(verify_ruling_record(d.get("record")), sys.stdout)
elif op == "anchor":
    json.dump(daily_anchor(d.get("day"), d.get("head_sha256"), d.get("record_count") or 0), sys.stdout)
elif op == "genesis":
    json.dump(build_genesis_record(), sys.stdout)
elif op == "lights":
    json.dump(continuity_lights(d.get("records") or [], configured=bool(d.get("configured")), anchored_today=False, error=d.get("error")), sys.stdout)
else:
    now = datetime.now(timezone.utc)
    json.dump(build_ruling_record(d["sealed"], d["queen"], prev_record_sha256=d.get("prev"), sequence_number=d.get("sequence"), now=now), sys.stdout)
`;
