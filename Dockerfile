# AXON LunarSight — Scientific Backend Dockerfile
# NASA Space Apps Challenge 2026
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AXON_ALLOWED_ORIGINS="*"

WORKDIR /app

# Install system dependencies for GDAL/Rasterio and SPICE
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt ./
COPY api/requirements.txt ./api-requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -r api-requirements.txt

# Copy source tree and install lunarsight_core package
COPY science/ ./science/
RUN pip install --no-cache-dir -e ./science/

COPY data/ ./data/
COPY kernels/ ./kernels/
COPY kernels.lock ./
COPY pipeline/ ./pipeline/
COPY api/ ./api/

# Terrain DEMs are deliberately not baked into the image. They are ~1.5 GB and
# should be supplied through a read-only volume or downloaded at deploy time:
#   docker run -v /host/terrain:/app/terrain:ro ...
# Create the mount point so the application and readiness endpoint can inspect it.
RUN mkdir -p /app/terrain

EXPOSE 8000

# Readiness (not just liveness) must confirm the scientific engine is usable.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/ready | grep -q '"ready":true' || exit 1

# Note on concurrency: SpiceyPy C library is process-global.
# Run with single Uvicorn process (threads inside process are serialized by _SPICE_LOCK).
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

