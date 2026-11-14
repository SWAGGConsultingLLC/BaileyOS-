"""
POST /api/validate  -- runs the deterministic Python corridor validator.

Request JSON : {"corridor": <GeoJSON FeatureCollection>, "nodes": [{"id","name","type","lat","lon"}, ...]}
Success 200  : {"report": {...}, "report_sha256": "<hex>", "report_canonical_json": "<string>"}
Failure      : {"error": "...", "code": "bad_request" | "too_large" | "method"}  (400 / 413 / 405)

No API keys, no network calls, no AI, no storage. Pure computation on the posted data, capped at 64 KB.
Server-to-server use only: no CORS headers are sent.
See validation/README.md for the report schema.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _validate_corridor import build_report, seal  # noqa: E402

MAX_BODY_BYTES = 64 * 1024


class handler(BaseHTTPRequestHandler):  # Vercel's Python runtime looks for this name
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(405, {"error": "Use POST with {corridor, nodes}.", "code": "method"})

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return self._send(400, {"error": "Empty body.", "code": "bad_request"})
        if length > MAX_BODY_BYTES:
            return self._send(413, {"error": "Body larger than 64 KB.", "code": "too_large"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._send(400, {"error": "Body must be JSON.", "code": "bad_request"})
        if not isinstance(data, dict) or "corridor" not in data or "nodes" not in data:
            return self._send(400, {"error": "Need both 'corridor' and 'nodes'.", "code": "bad_request"})
        self._send(200, seal(build_report(data)))
