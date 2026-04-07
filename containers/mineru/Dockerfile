FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MINERU_MODEL_SOURCE=huggingface \
    OPENMAIC_CONTAINER_REV=2026-04-07-ocr-rollout-1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    libgl1 \
    libsm6 \
    libxext6 \
    libxrender1 \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    torch \
    torchvision \
    --index-url https://download.pytorch.org/whl/cpu \
  && pip install --no-cache-dir "mineru[core]"

EXPOSE 8000

CMD ["mineru-api", "--host", "0.0.0.0", "--port", "8000"]
