"""
POST /api/consensus  -- Queen Ant Colony Consensus Engine V3 (quorum logic, see _consensus.py).

Request JSON : {"report_canonical_json": str, "report_sha256": str,
                "gemini": {"raw_reply"|"verdict","reason","reviewed_report_sha256","model","reviewed_at"} | {"unavailable":true,"reason":str} | null,
                "kimi":   same shape | null}
Success 200  : the ruling object (see validation/README.md)
Failure      : {"error","code"}  400 bad_request / 405 method / 413 too_large
No keys, no network, no AI, no storage. Server-to-server use only (no CORS headers).
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _consensus import convene  # noqa: E402

MAX_BODY_BYTES = 96 * 1024


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(405, {"error": "Use POST.", "code": "method"})

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return self._send(400, {"error": "Empty body.", "code": "bad_request"})
        if length > MAX_BODY_BYTES:
            return self._send(413, {"error": "Body larger than 96 KB.", "code": "too_large"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._send(400, {"error": "Body must be JSON.", "code": "bad_request"})
        if not isinstance(data, dict):
            return self._send(400, {"error": "Body must be a JSON object.", "code": "bad_request"})
        self._send(200, convene(data.get("report_canonical_json"), data.get("report_sha256"),
                                data.get("gemini"), data.get("kimi")))
