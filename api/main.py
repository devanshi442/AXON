"""
api/main.py — AXON LunarSight FastAPI service (Phase 0 stub).

Phase 2 adds:  POST /api/geometry/timeseries, GET /api/geometry/events
Phase 3 adds:  GET /api/compare, POST /api/verify
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AXON LunarSight API",
    description="Lunar surface geometry — Sun and Earth elevation from CLPS landing sites.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],   # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0", "phase": 0}


@app.get("/api/provenance")
def provenance():
    """Return kernel versions and git info.  Populated in Phase 2."""
    return {
        "note": "Provenance endpoint — fully populated in Phase 2.",
        "frame": "MOON_ME",
        "time_scale": "ET (via NAIF leap-seconds kernel)",
        "kernels": "not yet loaded",
    }
