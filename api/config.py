"""
api/config.py — Global configuration and environment settings for AXON LunarSight API.
"""

from __future__ import annotations

import os
import pathlib
from typing import List

ROOT = pathlib.Path(__file__).resolve().parent.parent
KERNELS_DIR = ROOT / "kernels"
LOCK_FILE = ROOT / "kernels.lock"
TERRAIN_DIR = ROOT / "terrain"
BENCHMARK_FILE = ROOT / "science" / "validation" / "benchmark.json"
DATA_YAML = ROOT / "data" / "missions.yaml"
PUBLIC_DATA_DIR = ROOT / "web" / "public" / "data"

API_VERSION = "0.3.0"
SERVICE_NAME = "AXON LunarSight API"

# CORS origins
_RAW_ORIGINS = os.environ.get(
    "AXON_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3000",
)
ALLOWED_ORIGINS: List[str] = [o.strip() for o in _RAW_ORIGINS.split(",") if o.strip()]

# Cache parameters (Single source of truth)
CACHE_MAXSIZE: int = int(os.environ.get("AXON_CACHE_MAXSIZE", "512"))
CACHE_TTL_SECONDS: int = int(os.environ.get("AXON_CACHE_TTL_SECONDS", "86400"))  # 24 hours

# Operational Limits & Protection
REQUEST_TIMEOUT_SECONDS: float = float(os.environ.get("AXON_REQUEST_TIMEOUT_SECONDS", "60.0"))
RATE_LIMIT_PER_MINUTE: int = int(os.environ.get("AXON_RATE_LIMIT_PER_MINUTE", "120"))
MAX_BODY_BYTES: int = int(os.environ.get("AXON_MAX_BODY_BYTES", str(2 * 1024 * 1024)))  # 2 MB

# Security & Administration
AXON_ENV: str = os.environ.get("AXON_ENV", "development").lower()
ADMIN_API_KEY: str | None = os.environ.get("AXON_ADMIN_KEY", None)


