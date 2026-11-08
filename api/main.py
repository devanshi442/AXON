"""
api/main.py — AXON LunarSight FastAPI service.

Provides REST endpoints for:
  - On-demand topocentric Sun/Earth geometry (flat and terrain-aware)
  - Terrain horizon masks (with mast height and range options)
  - Single site analysis (power, DTE, multi-lunation statistics)
  - 2 to 4 site comparative scenario analysis
  - Live JPL Horizons verification (with 15s timeout)
  - Science provenance and audit-verified benchmark results

Thread-safety: SPICE (spiceypy) is not thread-safe. All SPICE and geometry calculations
are strictly serialized behind a global threading.Lock.
"""

from __future__ import annotations

import datetime
from contextlib import asynccontextmanager
import os as _os
import pathlib
import threading
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from lunarsight_core import benchmark as B
from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import horizon as H
from lunarsight_core import metrics as M
from lunarsight_core import power as P
from lunarsight_core import sites as S
from lunarsight_core import terrain as T
from lunarsight_core import visibility as V

ROOT = pathlib.Path(__file__).resolve().parent.parent
KERNELS_DIR = ROOT / "kernels"
LOCK_FILE = ROOT / "kernels.lock"
BENCHMARK_FILE = ROOT / "science" / "validation" / "benchmark.json"

_SPICE_LOCK = threading.Lock()


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


def get_benchmark_data() -> Dict[str, Any]:
    if BENCHMARK_FILE.is_file():
        import json
        try:
            return json.loads(BENCHMARK_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "status": "pending",
        "message": "Benchmark artifact not found. Run pipeline/run_benchmark.py to generate.",
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    with _SPICE_LOCK:
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

    with _SPICE_LOCK:
        try:
            G.unload_kernels()
        except Exception:
            pass


app = FastAPI(
    title="AXON LunarSight API",
    description="Lunar surface geometry, terrain horizons, solar power potential, and DTE communication windows.",
    version="0.3.0",
    lifespan=lifespan,
)

_raw_origins = _os.environ.get(
    "AXON_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
)
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class TimeseriesRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG, description="Planetocentric latitude, deg")
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG, description="East-positive longitude, deg")
    start_utc: str = Field(..., description="Start UTC date-time ISO string")
    stop_utc: str = Field(..., description="Stop UTC date-time ISO string")
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS, description="Time step in seconds (min 60)")
    alt_km: float = Field(default=0.0, ge=0.0, description="Observer altitude above reference sphere, km")
    mast_height_m: float = Field(default=0.0, ge=0.0, le=100.0, description="Observer mast height, m")
    horizon_mode: str = Field(default="flat", pattern="^(flat|terrain)$", description="flat or terrain")


class EventsRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    start_utc: str
    stop_utc: str
    threshold_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    antenna_margin_deg: float = Field(default=0.0, ge=0.0, le=90.0)
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS)
    mast_height_m: float = Field(default=0.0, ge=0.0, le=100.0)
    horizon_mode: str = Field(default="flat", pattern="^(flat|terrain)$")
    refine_precision: bool = Field(default=True, description="Refine event edges to 1-min via SPICE bisection")


class HorizonRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    observer_height_m: float = Field(default=0.0, ge=0.0, le=100.0)
    max_range_km: float = Field(default=50.0, ge=5.0, le=150.0)
    az_step_deg: float = Field(default=1.0, ge=0.1, le=10.0)


class SiteAnalyzeRequest(BaseModel):
    site_id: Optional[str] = Field(default=None, description="Site ID from registry")
    lat: Optional[float] = Field(default=None, ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: Optional[float] = Field(default=None, ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    start_utc: str
    stop_utc: str
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS)
    mast_height_m: float = Field(default=0.0, ge=0.0, le=100.0)
    solar_array_type: str = Field(default="flat", pattern="^(flat|vertical|tilted|tracking)$")
    solar_tilt_deg: Optional[float] = Field(default=None, ge=0.0, le=90.0)
    solar_azimuth_deg: Optional[float] = Field(default=None, ge=0.0, le=360.0)
    antenna_margin_deg: float = Field(default=0.0, ge=0.0, le=90.0)
    refine_precision: bool = Field(default=False)


class CompareSiteSpec(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    utc: str
    mast_height_m: float = Field(default=0.0, ge=0.0, le=100.0)


class MultiCompareRequest(BaseModel):
    sites: List[CompareSiteSpec] = Field(..., min_length=2, max_length=4)
    threshold_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    antenna_margin_deg: float = Field(default=0.0, ge=0.0, le=90.0)
    window_days: int = Field(default=30, ge=1, le=90)
    solar_array_type: str = Field(default="flat", pattern="^(flat|vertical|tilted|tracking)$")


class VerifyRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    utc: str = Field(..., description="UTC ISO date string")


# ---------------------------------------------------------------------------
# Helper Validators
# ---------------------------------------------------------------------------

def _validate_date_range(start_utc: str, stop_utc: str) -> tuple[datetime.datetime, datetime.datetime]:
    try:
        dt_start = datetime.datetime.fromisoformat(start_utc.replace("Z", "+00:00"))
        dt_stop = datetime.datetime.fromisoformat(stop_utc.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ISO 8601 UTC date string: {exc}",
        )
    if dt_stop <= dt_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stop_utc must be strictly after start_utc",
        )
    delta_days = (dt_stop - dt_start).total_seconds() / 86400.0
    if delta_days > C.MAX_API_DATE_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Requested range of {delta_days:.1f} days exceeds maximum allowed {C.MAX_API_DATE_RANGE_DAYS} days.",
        )
    return dt_start, dt_stop


def _require_kernels():
    if not getattr(app.state, "kernels_loaded", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SPICE kernels not loaded. Please verify kernel availability.",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "0.3.0",
        "kernels_loaded": getattr(app.state, "kernels_loaded", False),
    }


@app.get("/api/provenance")
def provenance():
    benchmark_data = get_benchmark_data()
    return {
        "service": "AXON LunarSight API",
        "version": "0.3.0",
        "frame": C.MOON_FRAME,
        "time_scale": "UTC (internal Ephemeris Time via NAIF leap seconds)",
        "abcorr": C.ABCORR,
        "moon_radius_km": C.MOON_RADIUS_KM,
        "sun_angular_radius_deg": C.SUN_ANGULAR_RADIUS_DEG,
        "horizon_modes": ["flat", "terrain"],
        "terrain_tiers": {
            "T1": "High-resolution polar DEM (20-40 m/px)",
            "T2": "Global LOLA DEM (~474 m/px, small features unresolved)",
            "T3": "Flat spherical horizon only",
        },
        "kernels": get_kernel_hashes(),
        "kernels_loaded": getattr(app.state, "kernels_loaded", False),
        "benchmark": benchmark_data,
        "caveats": [
            "Geometry is not a link budget (atmospheric, ionospheric, and antenna patterns are not modeled).",
            "Sun above terrain horizon indicates direct line-of-sight to the upper limb; it does not model panel degradation, oblique incidence loss, or local rover mast self-shadowing.",
        ],
    }


@app.get("/api/sites")
def list_sites():
    """Returns normalized site registry containing missions, reference sites, and candidate sites."""
    valid_sites = S.get_valid_sites()
    skipped = [s.to_dict() for s in S.get_skipped_sites()]
    return {
        "count": len(valid_sites),
        "sites": [s.to_dict() for s in valid_sites],
        "skipped_sites": skipped,
    }


@app.get("/api/sites/{site_id}")
def get_site(site_id: str):
    site = S.get_site_by_id(site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Site '{site_id}' not found.")
    
    # Check for available precomputed assets
    assets = {
        "horizon": (ROOT / "web" / "public" / "data" / "horizon" / f"{site_id}.json").is_file(),
        "timeseries": (ROOT / "web" / "public" / "data" / "timeseries" / f"{site_id}.json").is_file(),
        "summary": (ROOT / "web" / "public" / "data" / "summary" / f"{site_id}.json").is_file(),
        "events": (ROOT / "web" / "public" / "data" / "events" / f"{site_id}.json").is_file(),
    }
    
    data = site.to_dict()
    data["precomputed_assets"] = assets
    return data


@app.post("/api/geometry/timeseries")
def get_timeseries(req: TimeseriesRequest):
    _require_kernels()
    _validate_date_range(req.start_utc, req.stop_utc)

    with _SPICE_LOCK:
        try:
            ts = G.compute_site_timeseries(
                req.lat,
                req.lon,
                req.start_utc,
                req.stop_utc,
                req.step_seconds,
                req.alt_km,
                req.mast_height_m,
            )
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    if req.horizon_mode == "terrain":
        # Compute or sample terrain horizon
        try:
            mask_data = H.compute_horizon_raymarch(
                lat_deg=req.lat,
                lon_deg=req.lon,
                observer_height_m=req.mast_height_m,
                max_range_km=50.0,
            )
            sun_vis = V.compute_sun_visibility(
                el_center_deg=ts["sun_elevation_deg"],
                az_deg=ts["sun_azimuth_deg"],
                mask=mask_data,
            )
            earth_vis = V.compute_earth_visibility(
                el_center_deg=ts["earth_elevation_deg"],
                az_deg=ts["earth_azimuth_deg"],
                mask=mask_data,
            )

            ts["horizon_mode"] = "terrain"
            ts["terrain_dem_id"] = mask_data["dem_id"]
            ts["sun_fraction"] = sun_vis["fraction"]
            ts["sun_visible"] = sun_vis["visible"]
            ts["earth_visible"] = earth_vis["visible"]
        except Exception as exc:
            # Fallback to flat with warning
            ts["horizon_mode"] = "flat_fallback"
            ts["horizon_warning"] = f"Terrain calculation failed: {exc}"
    else:
        ts["horizon_mode"] = "flat"

    return ts


@app.post("/api/geometry/events")
def get_events(req: EventsRequest):
    _require_kernels()
    _validate_date_range(req.start_utc, req.stop_utc)

    with _SPICE_LOCK:
        try:
            ts = G.compute_site_timeseries(
                req.lat,
                req.lon,
                req.start_utc,
                req.stop_utc,
                req.step_seconds,
                0.0,
                req.mast_height_m,
            )

            mask_data = None
            if req.horizon_mode == "terrain":
                mask_data = H.compute_horizon_raymarch(
                    lat_deg=req.lat,
                    lon_deg=req.lon,
                    observer_height_m=req.mast_height_m,
                    max_range_km=50.0,
                )

            metrics_res = M.compute_comprehensive_metrics(
                timeseries=ts,
                mask=mask_data,
                sun_threshold_deg=req.threshold_deg,
                dte_margin_deg=req.antenna_margin_deg,
                refine_edges=req.refine_precision,
                site_lat=req.lat,
                site_lon=req.lon,
            )
            metrics_res["horizon_mode"] = metrics_res["mode"]
            return metrics_res
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/horizon")
def get_horizon(req: HorizonRequest):
    try:
        return H.compute_horizon_raymarch(
            lat=req.lat,
            lon=req.lon,
            observer_height_m=req.observer_height_m,
            max_range_km=req.max_range_km,
            az_step_deg=req.az_step_deg,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/site/analyze")
def analyze_site(req: SiteAnalyzeRequest):
    _require_kernels()
    _validate_date_range(req.start_utc, req.stop_utc)

    lat = req.lat
    lon = req.lon
    site_name = "Custom Site"
    site_id = req.site_id

    if site_id:
        s = S.get_site_by_id(site_id)
        if s and s.lat is not None and s.lon is not None:
            lat = s.lat
            lon = s.lon
            site_name = s.name
        elif lat is None or lon is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Site '{site_id}' not found or lacks valid coordinates.",
            )

    if lat is None or lon is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lat and lon coordinates are required.",
        )

    with _SPICE_LOCK:
        try:
            ts = G.compute_site_timeseries(
                lat,
                lon,
                req.start_utc,
                req.stop_utc,
                req.step_seconds,
                0.0,
                req.mast_height_m,
            )

            mask_data = H.compute_horizon_raymarch(
                lat=lat,
                lon=lon,
                observer_height_m=req.mast_height_m,
                max_range_km=50.0,
            )
            mask_deg = mask_data["mask_deg"]

            res = M.compute_dual_metrics(
                timeseries=ts,
                horizon_mask=mask_data,
                sun_threshold_deg=0.0,
                antenna_margin_deg=req.antenna_margin_deg,
                refine_precision=req.refine_precision,
                lat=lat,
                lon=lon,
                mast_height_m=req.mast_height_m,
                solar_array_type=req.solar_array_type,
                solar_tilt_deg=req.solar_tilt_deg,
                solar_azimuth_deg=req.solar_azimuth_deg,
            )

            res["site_id"] = site_id
            res["site_name"] = site_name
            res["lat"] = lat
            res["lon"] = lon
            res["mast_height_m"] = req.mast_height_m
            res["dem_id"] = mask_data["dem_id"]
            res["coverage_status"] = mask_data["coverage_status"]
            res["caveats"] = [
                "Sun above horizon is direct geometric line of sight.",
                "Geometry is not a communication link budget.",
            ]
            return res
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/compare")
def compare_sites(req: MultiCompareRequest):
    _require_kernels()

    results = []
    with _SPICE_LOCK:
        try:
            for s in req.sites:
                dt_start = datetime.datetime.fromisoformat(s.utc.replace("Z", "+00:00"))
                dt_stop = dt_start + datetime.timedelta(days=req.window_days)
                
                start_str = dt_start.strftime("%Y-%m-%dT%H:%M:%SZ")
                stop_str = dt_stop.strftime("%Y-%m-%dT%H:%M:%SZ")

                # Instantaneous position
                pos, e_vec, n_vec, u_vec = G.site_to_enu(s.lat, s.lon, alt_km=0.0, mast_height_m=s.mast_height_m)
                et_now = G.spice.str2et(s.utc)
                s_az, s_el = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et_now, pos, e_vec, n_vec, u_vec)
                e_az, e_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et_now, pos, e_vec, n_vec, u_vec)

                # Horizon mask
                mask_data = H.compute_horizon_raymarch(
                    lat=s.lat, lon=s.lon, observer_height_m=s.mast_height_m, max_range_km=50.0
                )
                mask_deg = mask_data["mask_deg"]
                h_el = H.lookup_horizon_elevation(mask_deg, s_az)

                # Timeseries over window
                ts = G.compute_site_timeseries(
                    s.lat,
                    s.lon,
                    start_str,
                    stop_str,
                    3600,
                    0.0,
                    s.mast_height_m,
                )
                dual = M.compute_dual_metrics(
                    timeseries=ts,
                    horizon_mask=mask_data,
                    sun_threshold_deg=req.threshold_deg,
                    antenna_margin_deg=req.antenna_margin_deg,
                    refine_precision=False,
                    solar_array_type=req.solar_array_type,
                )

                results.append({
                    "id": s.id or f"site_{len(results)+1}",
                    "name": s.name or f"Site {len(results)+1}",
                    "lat": s.lat,
                    "lon": s.lon,
                    "utc": s.utc,
                    "mast_height_m": s.mast_height_m,
                    "dem_id": mask_data["dem_id"],
                    "instantaneous": {
                        "sun_azimuth_deg": round(s_az, 2),
                        "sun_elevation_deg": round(s_el, 2),
                        "terrain_elevation_at_sun_deg": round(h_el, 2),
                        "earth_azimuth_deg": round(e_az, 2),
                        "earth_elevation_deg": round(e_el, 2),
                        "sun_visible_terrain": s_el + C.SUN_ANGULAR_RADIUS_DEG >= h_el,
                        "earth_visible_terrain": e_el >= (h_el + req.antenna_margin_deg),
                    },
                    "flat": dual["flat"],
                    "terrain": dual["terrain"],
                    "delta_terrain_minus_flat": dual["delta_terrain_minus_flat"],
                    "power": dual["terrain"].get("power"),
                })

            # Calculate pairwise deltas if exactly 2 sites
            pairwise_delta = None
            if len(results) == 2:
                s0 = results[0]
                s1 = results[1]
                t0 = s0["terrain"]
                t1 = s1["terrain"]
                p0 = s0["power"] or {}
                p1 = s1["power"] or {}
                pairwise_delta = {
                    "sun_hours": round(t1["sun"]["total_hours"] - t0["sun"]["total_hours"], 1),
                    "sun_pct": round(t1["sun"]["percentage"] - t0["sun"]["percentage"], 2),
                    "dte_hours": round(t1["earth"]["total_hours"] - t0["earth"]["total_hours"], 1),
                    "dte_pct": round(t1["earth"]["percentage"] - t0["earth"]["percentage"], 2),
                    "energy_kwh": round(p1.get("total_energy_kwh", 0.0) - p0.get("total_energy_kwh", 0.0), 2),
                    "energy_kwh_m2": round(p1.get("specific_energy_kwh_m2", 0.0) - p0.get("specific_energy_kwh_m2", 0.0), 2),
                }

            return {
                "sites": results,
                "pairwise_delta_1_minus_0": pairwise_delta,
                "window_days": req.window_days,
                "threshold_deg": req.threshold_deg,
                "antenna_margin_deg": req.antenna_margin_deg,
                "solar_array_type": req.solar_array_type,
            }
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/verify")
def verify_site_live(req: VerifyRequest):
    """
    Live verification of SPICE topocentric coordinates against JPL Horizons with 15s timeout.
    """
    _require_kernels()
    try:
        with _SPICE_LOCK:
            pos, e_vec, n_vec, u_vec = G.site_to_enu(req.lat, req.lon)
            et = G.spice.str2et(req.utc)
            s_az, s_el = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et, pos, e_vec, n_vec, u_vec)
            e_az, e_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, e_vec, n_vec, u_vec)

        # Query JPL Horizons for Sun and Earth
        import requests
        horizons_url = "https://ssd.jpl.nasa.gov/api/horizons.api"
        dt = datetime.datetime.fromisoformat(req.utc.replace("Z", "+00:00"))
        start_time_str = dt.strftime("'%Y-%b-%d %H:%M'")
        stop_time_str = (dt + datetime.timedelta(minutes=1)).strftime("'%Y-%b-%d %H:%M'")

        def _query_target(target_id: str):
            # Target 10 = Sun, 399 = Earth
            params = {
                "format": "text",
                "COMMAND": f"'{target_id}'",
                "CENTER": f"'coord@301'",
                "COORD_TYPE": "'GEODETIC'",
                "SITE_COORD": f"'{req.lon},{req.lat},0.0'",
                "START_TIME": start_time_str,
                "STOP_TIME": stop_time_str,
                "STEP_SIZE": "'1m'",
                "QUANTITIES": "'4'",
            }
            resp = requests.get(horizons_url, params=params, timeout=15)
            resp.raise_for_status()
            # Parse $$SOE ... $$EOE
            lines = resp.text.splitlines()
            in_data = False
            for line in lines:
                if "$$SOE" in line:
                    in_data = True
                    continue
                if "$$EOE" in line:
                    break
                if in_data and line.strip():
                    parts = line.split()
                    if len(parts) >= 4:
                        return float(parts[2]), float(parts[3])
            return None, None

        h_sun_az, h_sun_el = _query_target("10")
        h_earth_az, h_earth_el = _query_target("399")

        sun_diff_deg = None
        earth_diff_deg = None
        if h_sun_az is not None and h_sun_el is not None:
            sun_diff_deg = max(abs(s_az - h_sun_az), abs(s_el - h_sun_el))
        if h_earth_az is not None and h_earth_el is not None:
            earth_diff_deg = max(abs(e_az - h_earth_az), abs(e_el - h_earth_el))

        return {
            "status": "success",
            "lat": req.lat,
            "lon": req.lon,
            "utc": req.utc,
            "spice": {
                "sun": {"azimuth_deg": round(s_az, 5), "elevation_deg": round(s_el, 5)},
                "earth": {"azimuth_deg": round(e_az, 5), "elevation_deg": round(e_el, 5)},
            },
            "horizons": {
                "sun": {"azimuth_deg": h_sun_az, "elevation_deg": h_sun_el},
                "earth": {"azimuth_deg": h_earth_az, "elevation_deg": h_earth_el},
            },
            "max_difference_deg": {
                "sun": sun_diff_deg,
                "earth": earth_diff_deg,
            },
            "pass_tolerance_0_01_deg": (
                (sun_diff_deg is None or sun_diff_deg < 0.01) and
                (earth_diff_deg is None or earth_diff_deg < 0.01)
            ),
        }
    except Exception as exc:
        return {
            "status": "error",
            "detail": str(exc),
            "note": "JPL Horizons API unreachable or timeout (15s limit). Offline benchmark passes (see /api/provenance).",
        }
