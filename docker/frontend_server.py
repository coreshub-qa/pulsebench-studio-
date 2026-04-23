from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


class SPARequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str, **kwargs):
        self._root = Path(directory).resolve()
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        requested_path = urlparse(self.path).path
        if requested_path.startswith("/api/"):
            self.send_error(404, "API endpoint is not served by the frontend server.")
            return

        relative = requested_path.lstrip("/")
        candidate = (self._root / relative).resolve() if relative else self._root
        if requested_path != "/" and (
            not candidate.exists()
            or self._root not in candidate.parents and candidate != self._root
        ):
            self.path = "/index.html"
        return super().do_GET()


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
