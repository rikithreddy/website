#!/usr/bin/env python3
"""Local server for LostArchives: serves the site and exposes a CSV editor.

    python3 server.py            # http://127.0.0.1:8125/
    python3 server.py --port N
"""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(ROOT, "archive.csv")

ROUTES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/debug": "debug.html",
    "/debug.html": "debug.html",
}

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _send(self, code, body, ctype="application/octet-stream"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, indent=2), "application/json; charset=utf-8")

    def _file(self, path):
        full = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            self._send(404, "not found", "text/plain; charset=utf-8")
            return
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            self._send(200, f.read(), MIME.get(ext, "application/octet-stream"))

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/archive":
            try:
                with open(CSV, "r", encoding="utf-8") as f:
                    self._json(200, {"csv": f.read()})
            except OSError as e:
                self._json(500, {"error": str(e)})
            return
        self._file(ROUTES.get(path, path))

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/archive":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                payload = json.loads(body)
                csv = payload.get("csv")
                if csv is None:
                    self._json(400, {"error": "missing 'csv'"})
                    return
                if not csv.endswith("\n"):
                    csv += "\n"
                tmp = CSV + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write(csv)
                os.replace(tmp, CSV)
                self._json(200, {"ok": True})
            except (OSError, ValueError) as e:
                self._json(400, {"error": str(e)})
            return
        self._send(405, "method not allowed", "text/plain; charset=utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8125)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print("LostArchives -> http://%s:%d/  (edit: http://%s:%d/debug)" % (
        args.host, args.port, args.host, args.port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
