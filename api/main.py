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
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

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

# Logging is plain text, not structured JSON. Request IDs are included in
# unhandled-error logs for correlation; normal access logging remains uvicorn's
# default format unless a JSON formatter is introduced later.
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
_dev_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
_cors_origins = list(dict.fromkeys(_dev_origins + ALLOWED_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress large JSON responses (site registries, timeseries, comparisons) when
# clients advertise gzip support. Small payloads remain uncompressed.
app.add_middleware(GZipMiddleware, minimum_size=1024)

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
    headers = dict(exc.headers or {})
    headers["X-Request-ID"] = req_id
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error": error_obj,
        },
        headers=headers,
    )


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Structured response for router-level 404/405 and other Starlette exceptions."""
    return await http_exception_handler(request, exc)


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
    logger.error(
        "Internal calculation error method=%s path=%s request_id=%s error=%s",
        request.method,
        request.url.path,
        req_id,
        exc,
        exc_info=True,
    )
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
# Frontend Static Asset Mounting & Single-Page Application (SPA) Fallback
# ---------------------------------------------------------------------------

_DIST_DIR = ROOT / "web" / "dist"

if _DIST_DIR.is_dir():
    # Mount build artifacts (hashed JS/CSS bundles)
    if (_DIST_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_DIST_DIR / "assets"), name="frontend-assets")
    # Mount precomputed scientific datasets (19 site timeseries, horizons, events)
    if (_DIST_DIR / "data").is_dir():
        app.mount("/data", StaticFiles(directory=_DIST_DIR / "data"), name="frontend-data")
    # Mount 3D heightmaps and terrain texture layers
    if (_DIST_DIR / "terrain").is_dir():
        app.mount("/terrain", StaticFiles(directory=_DIST_DIR / "terrain"), name="frontend-terrain")
    if (_DIST_DIR / "images").is_dir():
        app.mount("/images", StaticFiles(directory=_DIST_DIR / "images"), name="frontend-images")

    @app.get("/", include_in_schema=False)
    async def serve_spa_root():
        """Serve the React production application root."""
        index_file = _DIST_DIR / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        return {"status": "ok", "service": "AXON LunarSight API", "message": "Frontend build not found"}

    @app.api_route(
        "/{full_path:path}",
        methods=["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        include_in_schema=False,
    )
    async def serve_spa_fallback(request: Request, full_path: str):
        """
        Fallback router for React client-side routing (e.g. /explorer, /methods).
        Does NOT intercept /api, /docs, /redoc, or /openapi.json.
        """
        if full_path == "api" or full_path.startswith("api/"):
            req_path = "/" + full_path.rstrip("/")
            for r in router.routes:
                if hasattr(r, "path_regex") and r.path_regex.match(req_path):
                    supported = getattr(r, "methods", set())
                    if request.method not in supported:
                        raise HTTPException(
                            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                            detail="Method Not Allowed",
                        )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API endpoint not found",
            )

        if full_path in ("docs", "redoc", "openapi.json"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documentation endpoint not found")

        # Static assets and SPA navigation only accept GET and HEAD
        if request.method not in ("GET", "HEAD"):
            raise HTTPException(status_code=status.HTTP_405_METHOD_NOT_ALLOWED, detail="Method Not Allowed")

        # 1. Exact static file matches (e.g. favicon.svg, robots.txt) with traversal protection
        try:
            candidate = (_DIST_DIR / full_path.lstrip("/\\")).resolve()
            if candidate.is_file() and candidate.is_relative_to(_DIST_DIR.resolve()):
                return FileResponse(candidate)
        except Exception:
            pass

        # 2. Client-side routing fallback to index.html
        index_file = _DIST_DIR / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")


# ---------------------------------------------------------------------------
# Backwards-compatibility helper functions & re-exports
# ---------------------------------------------------------------------------

def get_kernel_hashes() -> Dict[str, str]:
    return analysis_service._kernel_hashes


def get_benchmark_data() -> Dict[str, Any]:
    return analysis_service.get_provenance_data().get("benchmark", {})


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api.main:app", host="0.0.0.0", port=port, workers=1)

