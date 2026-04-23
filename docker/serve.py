from __future__ import annotations

import os
import signal
import subprocess
import sys
import time


BACKEND_PORT = os.getenv("PULSEBENCH_BACKEND_PORT", "9002")
FRONTEND_PORT = os.getenv("PULSEBENCH_FRONTEND_PORT", "9001")
FRONTEND_DIR = os.getenv("PULSEBENCH_FRONTEND_DIST", "/app/frontend-dist")
BACKEND_DIR = os.getenv("PULSEBENCH_BACKEND_DIR", "/app/backend")


processes: list[subprocess.Popen[str]] = []
stopping = False


def stop_all() -> None:
    global stopping
    if stopping:
        return
    stopping = True
    for process in processes:
        if process.poll() is None:
            process.terminate()
    deadline = time.time() + 10
    for process in processes:
        while process.poll() is None and time.time() < deadline:
            time.sleep(0.2)
        if process.poll() is None:
            process.kill()


def handle_signal(signum: int, _frame: object) -> None:
    stop_all()
    sys.exit(128 + signum)


def main() -> int:
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    backend = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app:app",
            "--app-dir",
            BACKEND_DIR,
            "--host",
            "0.0.0.0",
            "--port",
            BACKEND_PORT,
        ]
    )
    frontend = subprocess.Popen(
        [
            sys.executable,
            "/app/docker/frontend_server.py",
            "--host",
            "0.0.0.0",
            "--port",
            FRONTEND_PORT,
            "--directory",
            FRONTEND_DIR,
        ]
    )
    processes.extend([backend, frontend])

    try:
        while True:
            for process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    stop_all()
                    return exit_code
            time.sleep(1)
    finally:
        stop_all()


if __name__ == "__main__":
    raise SystemExit(main())
