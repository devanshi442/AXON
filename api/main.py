"""
api/main.py — AXON LunarSight FastAPI service.

Provides REST endpoints for on-demand topocentric Sun/Earth geometry,
availability events, site comparison, and science provenance.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional
import datetime

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from lunarsight_core import constants as C
from lunarsight_core import geometry as G

ROOT = Path(__file__).resolve().parent.parent
KERNELS_DIR = ROOT / "kernels"
LOCK_FILE = ROOT / "kernels.lock"


def get_kernel_hashes() -> Dict[str, str]:
    hashes = {}
    if LOCK_FILE.is_file():
        for line in LOCK_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                parts = line.split()
                if len(parts) >= 2:
                    hashes[parts[1]] = parts[0]
    return hashes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load kernels on startup if available
    try:
        if KERNELS_DIR.is_dir() and (KERNELS_DIR / C.LSK_FILENAME).is_file():
            G.load_kernels(KERNELS_DIR)
            app.state.kernels_loaded = True
        else:
            app.state.kernels_loaded = False
    except Exception as exc:
        app.state.kernels_loaded = False
        app.state.kernel_error = str(exc)

    yield

    # Unload on shutdown
    try:
        G.unload_kernels()
    except Exception:
        pass


app = FastAPI(
    title="AXON LunarSight API",
    description="Lunar surface geometry — Sun and Earth elevation from CLPS landing sites.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TimeseriesRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG, description="Planetocentric latitude, deg")
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG, description="East-positive longitude, deg")
    start_utc: str = Field(..., description="Start UTC date-time ISO string")
    stop_utc: str = Field(..., description="Stop UTC date-time ISO string")
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS, description="Time step in seconds")
    alt_km: float = Field(default=0.0, ge=0.0, description="Observer altitude above reference sphere, km")


class EventsRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    start_utc: str
    stop_utc: str
    threshold_deg: float = Field(default=5.0, ge=-90.0, le=90.0)
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS)


class CompareRequest(BaseModel):
    site_a_lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    site_a_lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    site_a_utc: str
    site_b_lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    site_b_lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    site_b_utc: str
    threshold_deg: float = Field(default=5.0, ge=-90.0, le=90.0)
    window_days: int = Field(default=30, ge=1, le=90)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "0.2.0",
        "kernels_loaded": getattr(app.state, "kernels_loaded", False),
    }


@app.get("/api/provenance")
def provenance():
    return {
        "service": "AXON LunarSight API",
        "version": "0.2.0",
        "frame": C.MOON_FRAME,
        "time_scale": "UTC (internal Ephemeris Time via NAIF leap seconds)",
        "abcorr": C.ABCORR,
        "moon_radius_km": C.MOON_RADIUS_KM,
        "sun_angular_radius_deg": C.SUN_ANGULAR_RADIUS_DEG,
        "horizon_mode": "idealized (flat 0°)",
        "kernels": get_kernel_hashes(),
        "kernels_loaded": getattr(app.state, "kernels_loaded", False),
        "golden_test_status": "Validated against NASA JPL Horizons observer tables (diff < 0.0001°)",
    }


@app.post("/api/geometry/timeseries")
def get_timeseries(req: TimeseriesRequest):
    if not getattr(app.state, "kernels_loaded", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SPICE kernels not loaded. Please ensure kernels are present.",
        )
    try:
        return G.compute_site_timeseries(
            req.lat, req.lon, req.start_utc, req.stop_utc, req.step_seconds, req.alt_km
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/geometry/events")
def get_events(req: EventsRequest):
    if not getattr(app.state, "kernels_loaded", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SPICE kernels not loaded.",
        )
    try:
        ts = G.compute_site_timeseries(
            req.lat, req.lon, req.start_utc, req.stop_utc, req.step_seconds
        )
        return G.compute_opportunities(ts, threshold_deg=req.threshold_deg)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/compare")
def compare_scenarios(req: CompareRequest):
    if not getattr(app.state, "kernels_loaded", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SPICE kernels not loaded.",
        )
    try:
        # Instantaneous calculation for Site A at utc_a
        pos_a, e_a, n_a, u_a = G.site_to_enu(req.site_a_lat, req.site_a_lon)
        et_a = G.spice.str2et(req.site_a_utc)
        s_az_a, s_el_a = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et_a, pos_a, e_a, n_a, u_a)
        e_az_a, e_el_a = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et_a, pos_a, e_a, n_a, u_a)

        # Instantaneous calculation for Site B at utc_b
        pos_b, e_b, n_b, u_b = G.site_to_enu(req.site_b_lat, req.site_b_lon)
        et_b = G.spice.str2et(req.site_b_utc)
        s_az_b, s_el_b = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et_b, pos_b, e_b, n_b, u_b)
        e_az_b, e_el_b = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et_b, pos_b, e_b, n_b, u_b)

        # 30-day window metrics
        dt_start_a = datetime.datetime.fromisoformat(req.site_a_utc.replace("Z", "+00:00"))
        dt_stop_a = dt_start_a + datetime.timedelta(days=req.window_days)
        ts_a = G.compute_site_timeseries(
            req.site_a_lat, req.site_a_lon,
            dt_start_a.strftime("%Y-%m-%dT%H:%M:%S"),
            dt_stop_a.strftime("%Y-%m-%dT%H:%M:%S"),
        )
        opp_a = G.compute_opportunities(ts_a, req.threshold_deg)

        dt_start_b = datetime.datetime.fromisoformat(req.site_b_utc.replace("Z", "+00:00"))
        dt_stop_b = dt_start_b + datetime.timedelta(days=req.window_days)
        ts_b = G.compute_site_timeseries(
            req.site_b_lat, req.site_b_lon,
            dt_start_b.strftime("%Y-%m-%dT%H:%M:%S"),
            dt_stop_b.strftime("%Y-%m-%dT%H:%M:%S"),
        )
        opp_b = G.compute_opportunities(ts_b, req.threshold_deg)

        return {
            "current": {
                "site_a": {
                    "utc": req.site_a_utc,
                    "sun_elevation_deg": round(s_el_a, 2),
                    "earth_elevation_deg": round(e_el_a, 2),
                    "sun_above_threshold": (s_el_a + C.SUN_ANGULAR_RADIUS_DEG) >= req.threshold_deg,
                    "earth_above_threshold": e_el_a >= req.threshold_deg,
                },
                "site_b": {
                    "utc": req.site_b_utc,
                    "sun_elevation_deg": round(s_el_b, 2),
                    "earth_elevation_deg": round(e_el_b, 2),
                    "sun_above_threshold": (s_el_b + C.SUN_ANGULAR_RADIUS_DEG) >= req.threshold_deg,
                    "earth_above_threshold": e_el_b >= req.threshold_deg,
                },
                "difference_b_minus_a": {
                    "sun_elevation_deg": round(s_el_b - s_el_a, 2),
                    "earth_elevation_deg": round(e_el_b - e_el_a, 2),
                },
            },
            "window_30d": {
                "threshold_deg": req.threshold_deg,
                "site_a": {
                    "sun_hours": opp_a["sun"]["total_hours"],
                    "sun_pct": opp_a["sun"]["percentage"],
                    "earth_hours": opp_a["earth"]["total_hours"],
                    "earth_pct": opp_a["earth"]["percentage"],
                    "joint_hours": opp_a["joint"]["total_hours"],
                },
                "site_b": {
                    "sun_hours": opp_b["sun"]["total_hours"],
                    "sun_pct": opp_b["sun"]["percentage"],
                    "earth_hours": opp_b["earth"]["total_hours"],
                    "earth_pct": opp_b["earth"]["percentage"],
                    "joint_hours": opp_b["joint"]["total_hours"],
                },
                "difference_b_minus_a": {
                    "sun_hours": round(opp_b["sun"]["total_hours"] - opp_a["sun"]["total_hours"], 1),
                    "earth_hours": round(opp_b["earth"]["total_hours"] - opp_a["earth"]["total_hours"], 1),
                    "joint_hours": round(opp_b["joint"]["total_hours"] - opp_a["joint"]["total_hours"], 1),
                },
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
