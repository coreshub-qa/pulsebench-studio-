from __future__ import annotations

import argparse
import http.client
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BACKEND_HOST = os.getenv("PULSEBENCH_BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("PULSEBENCH_BACKEND_PORT", "9002"))
BACKEND_PROXY_TIMEOUT = float(os.getenv("PULSEBENCH_BACKEND_PROXY_TIMEOUT", "180"))
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


class SPARequestHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, directory: str, **kwargs):
        self._root = Path(directory).resolve()
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        requested_path = urlparse(self.path).path
        if requested_path.startswith("/api/"):
            self._proxy_api_request()
            return

        relative = requested_path.lstrip("/")
        candidate = (self._root / relative).resolve() if relative else self._root
        if requested_path != "/" and (
            not candidate.exists()
            or self._root not in candidate.parents and candidate != self._root
        ):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self) -> None:
        self._proxy_api_or_404()

    def do_PUT(self) -> None:
        self._proxy_api_or_404()

    def do_PATCH(self) -> None:
        self._proxy_api_or_404()

    def do_DELETE(self) -> None:
        self._proxy_api_or_404()

    def do_OPTIONS(self) -> None:
        self._proxy_api_or_404()

    def _proxy_api_or_404(self) -> None:
        requested_path = urlparse(self.path).path
        if requested_path.startswith("/api/"):
            self._proxy_api_request()
            return
        self.send_error(404, "Not found.")

    def _proxy_api_request(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(content_length) if content_length else None
        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in HOP_BY_HOP_HEADERS and key.lower() != "host"
        }
        headers["Host"] = f"{BACKEND_HOST}:{BACKEND_PORT}"

        connection = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=BACKEND_PROXY_TIMEOUT)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            self.send_response(response.status, response.reason)
            is_event_stream = False
            for key, value in response.getheaders():
                if key.lower() not in HOP_BY_HOP_HEADERS:
                    self.send_header(key, value)
                if key.lower() == "content-type" and "text/event-stream" in value.lower():
                    is_event_stream = True
            self.end_headers()
            if is_event_stream:
                self._relay_event_stream(response)
                return
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception as exc:
            self.send_error(502, f"Backend proxy failed: {exc}")
        finally:
            connection.close()

    def _relay_event_stream(self, response: http.client.HTTPResponse) -> None:
        while True:
            line = response.readline()
            if not line:
                break
            self.wfile.write(line)
            self.wfile.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=9001)
    parser.add_argument("--directory", required=True)
    args = parser.parse_args()

    handler = partial(SPARequestHandler, directory=args.directory)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
