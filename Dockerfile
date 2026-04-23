FROM hub.kubesphere.com.cn/aicp-tests/evealscope-perf:0.17.1
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PULSEBENCH_DATA_DIR=/data \
    PULSEBENCH_RUNS_DIR=/data/runs \
    PULSEBENCH_BATCHES_DIR=/data/batches \
    PULSEBENCH_FRONTEND_DIST=/app/frontend-dist \
    PULSEBENCH_BACKEND_DIR=/app/backend \
    PULSEBENCH_FRONTEND_PORT=9001 \
    PULSEBENCH_BACKEND_PORT=9002

COPY backend/requirements.txt /tmp/requirements.txt
RUN python - <<'PY'
from pathlib import Path

requirements = []
for raw_line in Path("/tmp/requirements.txt").read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    if line.startswith("evalscope"):
        continue
    requirements.append(line)
Path("/tmp/runtime-requirements.txt").write_text("\n".join(requirements) + "\n", encoding="utf-8")
PY
RUN pip install --no-cache-dir -r /tmp/runtime-requirements.txt

COPY backend ./backend
COPY docker ./docker
COPY frontend/dist ./frontend-dist

RUN mkdir -p /data/runs /data/batches

EXPOSE 9001 9002
VOLUME ["/data"]

CMD ["python", "/app/docker/serve.py"]
