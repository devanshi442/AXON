# AXON LunarSight — Unified Production Dockerfile
# NASA Space Apps Challenge 2026
# Multi-stage build: React + Vite frontend builder -> Python 3.12 scientific backend runtime

# =============================================================================
# STAGE 1: Frontend Build (Node.js 20)
# =============================================================================
FROM node:20-slim AS frontend-builder

WORKDIR /app/web

# Install frontend dependencies
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copy web source tree and static assets
COPY web/ ./

# Compile production Vite bundle (emits to /app/web/dist)
RUN npm run build

# =============================================================================
# STAGE 2: Python 3.12 Scientific Backend & Unified Web Service
# =============================================================================
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AXON_ALLOWED_ORIGINS="*"

WORKDIR /app

# Install system dependencies for GDAL/Rasterio, SPICE, and health checking
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

# Copy compiled frontend distribution from Stage 1
COPY --from=frontend-builder /app/web/dist /app/web/dist

# Terrain DEM directory: create mount point.
# Precomputed horizons for all 19 sites are embedded in the frontend dist.
# For on-demand 3D ray-marching on custom coordinates, DEMs can be mounted or fetched.
RUN mkdir -p /app/terrain

EXPOSE 8000

# Readiness check confirms scientific engine (SPICE kernels, topocentric geometry) is operational
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=5 \
    CMD curl -fsS http://localhost:${PORT:-8000}/api/ready | grep -E -q '"ready":\s*true' || exit 1

# Note on concurrency: SpiceyPy C library is process-global.
# Run single Uvicorn process (threads serialized by _SPICE_LOCK).
# Dynamic port binding: uses Render's $PORT environment variable, defaulting to 8000 locally.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
