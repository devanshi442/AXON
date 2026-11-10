"""
api/main.py — AXON LunarSight FastAPI application entrypoint.

Provides production-ready REST endpoints for:
  - Topocentric Sun and Earth ephemeris geometry (flat and terrain-aware)
  - 360-degree topographic horizon masks via 3D LOLA DEM ray-marching
  - Custom lunar coordinate and registered site analysis
  - Synchronized multi-site comparison (2-4 sites) with transparent rankings
  - Candidate operating window search
  - Live JPL Horizons ground-truth verification
  - Scientific provenance, cache inspection, and readiness monitoring

Thread safety: SPICE calculations are strictly serialized behind a global process lock.
"""

from __future__ import annotations

import asyncio
import collections
import logging
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List

# Ensure both repo root and api directory are in sys.path regardless of execution context
_API_DIR = Path(__file__).resolve().parent
_ROOT_DIR = _API_DIR.parent
for _p in [str(_ROOT_DIR), str(_API_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from api.config import (
        ALLOWED_ORIGINS,
        API_VERSION,
        MAX_BODY_BYTES,
        RATE_LIMIT_PER_MINUTE,
        REQUEST_TIMEOUT_SECONDS,
        ROOT,
        SERVICE_NAME,
    )
    from api.routes import router
    from api.schemas import (
        CompareSiteSpec,
        EventsRequest,
        HorizonRequest,
        MultiCompareRequest,
        SiteAnalyzeRequest,
        TimeseriesRequest,
        VerifyRequest,
    )
    from api.services.analysis_service import _SPICE_LOCK, analysis_service
except ImportError:
    from config import (
        ALLOWED_ORIGINS,
        API_VERSION,
        MAX_BODY_BYTES,
        RATE_LIMIT_PER_MINUTE,
        REQUEST_TIMEOUT_SECONDS,
        ROOT,
        SERVICE_NAME,
    )
    from routes import router
    from schemas import (
        CompareSiteSpec,
        EventsRequest,
        HorizonRequest,
        MultiCompareRequest,
        SiteAnalyzeRequest,
        TimeseriesRequest,
        VerifyRequest,
    )
    from services.analysis_service import _SPICE_LOCK, analysis_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("lunarsight.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle management. Loads SPICE kernels on startup and cleanly unloads them on shutdown.
    """
    logger.info("Initializing AXON LunarSight scientific service...")
    loaded = analysis_service.load_kernels()
    app.state.kernels_loaded = loaded
    if loaded:
        logger.info("AXON LunarSight scientific engine ready.")
    else:
        logger.warning("SPICE kernels not loaded on startup. API will operate in degraded state.")

    yield

    logger.info("Shutting down AXON LunarSight API...")
    analysis_service.unload_kernels()
    app.state.kernels_loaded = False


app = FastAPI(
    title=SERVICE_NAME,
    description=(
        "NASA Space Apps Challenge 2026 — Lunar landing site evaluation model.\n\n"
        "Calculates lunar surface topocentric geometry, 3D LOLA DEM terrain horizon skylines, "
        "photovoltaic solar generation proxies, and direct-to-Earth (DTE) communication visibility."
    ),
    version=API_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_RATE_LIMIT_BUCKETS: Dict[str, List[float]] = collections.defaultdict(list)

@app.middleware("http")
async def security_and_limit_middleware(request: Request, call_next):
    """
    Enforce request ID tracking, payload size boundaries (including chunked streams),
    sliding-window IP rate limiting, and per-request execution timeouts.
    """
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id

    # 1. Content-Length check
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_BODY_BYTES:
                status_code = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413)
                return JSONResponse(
                    status_code=status_code,
                    content={
                        "detail": f"Request payload exceeds maximum allowed size ({MAX_BODY_BYTES // (1024*1024)} MB).",
                        "error": {
                            "code": "PAYLOAD_TOO_LARGE",
                            "message": f"Request payload exceeds maximum allowed size ({MAX_BODY_BYTES // (1024*1024)} MB).",
                            "request_id": request_id,
                            "path": request.url.path,
                        },
                    },
                    headers={"X-Request-ID": request_id},
                )
        except ValueError:
            pass

    # 2. Chunked stream body size check
    transfer_encoding = request.headers.get("transfer-encoding", "").lower()
    if "chunked" in transfer_encoding or (not content_length and request.method in ["POST", "PUT", "PATCH"]):
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            status_code = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413)
            return JSONResponse(
                status_code=status_code,
                content={
                    "detail": f"Request payload exceeds maximum allowed size ({MAX_BODY_BYTES // (1024*1024)} MB).",
                    "error": {
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": f"Chunked stream payload exceeds maximum allowed size ({MAX_BODY_BYTES // (1024*1024)} MB).",
                        "request_id": request_id,
                        "path": request.url.path,
                    },
                },
                headers={"X-Request-ID": request_id},
            )

    # 3. Simple in-memory sliding-window rate limit (skip health and ready probes)
    if request.url.path not in ["/api/health", "/api/ready"]:
        from api.config import AXON_TRUST_PROXY
        if AXON_TRUST_PROXY and request.headers.get("x-forwarded-for"):
            client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        bucket = [t for t in _RATE_LIMIT_BUCKETS[client_ip] if now - t < 60.0]
        if len(bucket) >= RATE_LIMIT_PER_MINUTE:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": f"Rate limit exceeded ({RATE_LIMIT_PER_MINUTE} req/min). Please throttle requests.",
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": f"Rate limit exceeded ({RATE_LIMIT_PER_MINUTE} requests per minute).",
                        "request_id": request_id,
                        "path": request.url.path,
                    },
                },
                headers={"X-Request-ID": request_id},
            )
        bucket.append(now)
        _RATE_LIMIT_BUCKETS[client_ip] = bucket

    # 4. Per-request timeout execution wrapper
    # Note on wait_for and _SPICE_LOCK:
    # Python's asyncio.wait_for raises TimeoutError when the timeout expires.
    # However, synchronous C-extension code (such as CSPICE calls inside spiceypy)
    # running inside an executor or thread holding _SPICE_LOCK cannot be preemptively
    # interrupted mid-call by asyncio. To prevent thread starvation and unbounded execution:
    # 1. Strict upfront validation caps sample count to N <= 8,784 (validate_sample_count).
    # 2. Maximum date range is capped to 90 days for comparison and window search.
    # 3. Single-worker deployment serializes CSPICE calls safely without mutex deadlocks.
    try:
        response = await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECONDS)
        response.headers["X-Request-ID"] = request_id
        return response
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            content={
                "detail": f"Request processing timed out ({REQUEST_TIMEOUT_SECONDS}s limit exceeded).",
                "error": {
                    "code": "GATEWAY_TIMEOUT",
                    "message": f"Calculation exceeded maximum server timeout of {REQUEST_TIMEOUT_SECONDS}s.",
                    "request_id": request_id,
                    "path": request.url.path,
                },
            },
            headers={"X-Request-ID": request_id},
        )

# Include scientific route definitions
app.include_router(router)


# ---------------------------------------------------------------------------
# Global Exception Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Structured HTTP exception response maintaining standard detail field and unified error schema."""
    req_id = getattr(request.state, "request_id", None) or uuid.uuid4().hex[:12]
    error_obj = {
        "code": f"HTTP_{exc.status_code}",
        "message": str(exc.detail),
        "request_id": req_id,
        "path": request.url.path,
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error": error_obj,
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Structured request parameter validation error handler."""
    req_id = getattr(request.state, "request_id", None) or uuid.uuid4().hex[:12]
    status_code = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)
    first_err = exc.errors()[0] if exc.errors() else {}
    field_name = " -> ".join(str(loc) for loc in first_err.get("loc", []))
    error_obj = {
        "code": "VALIDATION_ERROR",
        "message": first_err.get("msg", "Invalid parameter"),
        "field": field_name,
        "request_id": req_id,
        "path": request.url.path,
    }
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": exc.errors(),
            "error": error_obj,
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Sanitized handler for unexpected errors preventing system traceback leakage."""
    req_id = getattr(request.state, "request_id", None) or uuid.uuid4().hex[:12]
    logger.error(f"Internal calculation error during {request.method} {request.url.path}: {exc}", exc_info=True)
    error_obj = {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "An internal scientific computation error occurred. Please verify ephemeris date ranges and coordinates.",
        "request_id": req_id,
        "path": request.url.path,
    }
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal scientific computation error occurred. Please verify ephemeris date ranges and coordinates.",
            "error": error_obj,
        },
        headers={"X-Request-ID": req_id},
    )


# ---------------------------------------------------------------------------
# Backwards-compatibility helper functions & re-exports
# ---------------------------------------------------------------------------

def get_kernel_hashes() -> Dict[str, str]:
    return analysis_service._kernel_hashes


def get_benchmark_data() -> Dict[str, Any]:
    return analysis_service.get_provenance_data().get("benchmark", {})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, workers=1)

