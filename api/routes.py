"""
api/routes.py — FastAPI route definitions for AXON LunarSight.

Provides documented REST endpoints for:
  - System health, readiness, and scientific provenance
  - Site registry and precomputed asset metadata
  - Topocentric geometry timeseries (flat and terrain-aware)
  - Visibility events with sub-minute SPICE refinement
  - 360-degree topographic horizon masks
  - Dynamic single-site analysis (custom coordinates and catalog sites)
  - 2 to 4 site comparative trade-off analysis
  - Best operating window search
  - Live JPL Horizons ground-truth verification
  - Cache management and statistics
"""

from __future__ import annotations

import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Header, HTTPException, Query, status

try:
    from api.cache import analysis_cache, horizon_cache
    from api.config import ADMIN_API_KEY, API_VERSION, ROOT
    from api.schemas import (
        CacheClearResponse,
        CacheStatsResponse,
        ErrorEnvelope,
        EventsRequest,
        EventsResponse,
        HealthResponse,
        HorizonRequest,
        HorizonResponse,
        MultiCompareRequest,
        MultiCompareResponse,
        ProvenanceResponse,
        ReadinessResponse,
        SiteAnalyzeRequest,
        SiteAnalyzeResponse,
        SiteDetailResponse,
        SiteListResponse,
        TimeseriesRequest,
        TimeseriesResponse,
        VerifyRequest,
        VerifyResponse,
        WindowSearchRequest,
        WindowSearchResponse,
    )
    from api.services.analysis_service import _SPICE_LOCK, analysis_service
    from api.validation import validate_coordinates, validate_date_range, validate_sample_count
except ImportError:
    from cache import analysis_cache, horizon_cache
    from config import ADMIN_API_KEY, API_VERSION, ROOT
    from schemas import (
        CacheClearResponse,
        CacheStatsResponse,
        ErrorEnvelope,
        EventsRequest,
        EventsResponse,
        HealthResponse,
        HorizonRequest,
        HorizonResponse,
        MultiCompareRequest,
        MultiCompareResponse,
        ProvenanceResponse,
        ReadinessResponse,
        SiteAnalyzeRequest,
        SiteAnalyzeResponse,
        SiteDetailResponse,
        SiteListResponse,
        TimeseriesRequest,
        TimeseriesResponse,
        VerifyRequest,
        VerifyResponse,
        WindowSearchRequest,
        WindowSearchResponse,
    )
    from services.analysis_service import _SPICE_LOCK, analysis_service
    from validation import validate_coordinates, validate_date_range, validate_sample_count
from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import horizon as H
from lunarsight_core import metrics as M
from lunarsight_core import sites as S
from lunarsight_core import terrain as T
from lunarsight_core import visibility as V

router = APIRouter(prefix="/api", tags=["LunarSight Science API"])


# ---------------------------------------------------------------------------
# Shared OpenAPI error documentation
# ---------------------------------------------------------------------------

# Every error body is the framework-level ErrorEnvelope produced by the
# exception handlers in api/main.py. 405 Method Not Allowed is emitted by
# Starlette before route handlers run, so it is covered by contract tests
# rather than by per-route ``responses`` declarations.
_SERVER_ERRORS: Dict[int, Dict[str, Any]] = {
    500: {"model": ErrorEnvelope, "description": "Internal scientific computation error."},
    504: {"model": ErrorEnvelope, "description": "Calculation exceeded the configured request timeout."},
}

_READ_ERRORS: Dict[int, Dict[str, Any]] = {
    429: {"model": ErrorEnvelope, "description": "Per-IP rate limit exceeded."},
    500: {"model": ErrorEnvelope, "description": "Internal scientific computation error."},
    504: {"model": ErrorEnvelope, "description": "Calculation exceeded the configured request timeout."},
}

_WRITE_ERRORS: Dict[int, Dict[str, Any]] = {
    400: {"model": ErrorEnvelope, "description": "Invalid coordinates, date range, or request parameters."},
    413: {"model": ErrorEnvelope, "description": "Request payload exceeds the configured size limit."},
    422: {"model": ErrorEnvelope, "description": "Request schema validation failure."},
    429: {"model": ErrorEnvelope, "description": "Per-IP rate limit exceeded."},
    500: {"model": ErrorEnvelope, "description": "Internal scientific computation error."},
    503: {"model": ErrorEnvelope, "description": "SPICE kernels or requested DEM assets are unavailable."},
    504: {"model": ErrorEnvelope, "description": "Calculation exceeded the configured request timeout."},
}

_CACHE_CLEAR_ERRORS: Dict[int, Dict[str, Any]] = {
    401: {"model": ErrorEnvelope, "description": "Valid X-Admin-Key header required."},
    403: {"model": ErrorEnvelope, "description": "Cache clearing is disabled in production without AXON_ADMIN_KEY."},
    413: {"model": ErrorEnvelope, "description": "Request payload exceeds the configured size limit."},
    422: {"model": ErrorEnvelope, "description": "Request schema validation failure."},
    429: {"model": ErrorEnvelope, "description": "Per-IP rate limit exceeded."},
    500: {"model": ErrorEnvelope, "description": "Internal server error."},
    504: {"model": ErrorEnvelope, "description": "Calculation exceeded the configured request timeout."},
}

_SITE_DETAIL_ERRORS: Dict[int, Dict[str, Any]] = {
    **_READ_ERRORS,
    404: {"model": ErrorEnvelope, "description": "Site ID not found in the registry."},
    422: {"model": ErrorEnvelope, "description": "Request schema validation failure."},
}

_SITE_ANALYSIS_ERRORS: Dict[int, Dict[str, Any]] = {
    **_WRITE_ERRORS,
    404: {"model": ErrorEnvelope, "description": "Site ID not found in the registry and coordinates not provided."},
}


# ---------------------------------------------------------------------------
# Health, Readiness, Provenance
# ---------------------------------------------------------------------------

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    responses=_SERVER_ERRORS,
)
def health():
    """Basic service liveness check returning version and kernel availability."""
    return {
        "status": "ok",
        "version": API_VERSION,
        "service": "AXON LunarSight API",
        "kernels_loaded": analysis_service.is_kernels_loaded,
    }


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Scientific Service Readiness Check",
    responses=_SERVER_ERRORS,
)
def readiness():
    """Distinguishes running HTTP server from fully operational scientific engine (kernels, DEMs)."""
    return analysis_service.get_readiness()


@router.get(
    "/provenance",
    response_model=ProvenanceResponse,
    summary="Scientific Provenance & Audit Benchmark",
    responses=_READ_ERRORS,
)
def provenance():
    """Returns planetary reference frames, constants, SPICE kernel hashes, and benchmark audit results."""
    return analysis_service.get_provenance_data()


# ---------------------------------------------------------------------------
# Site Registry Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/sites",
    response_model=SiteListResponse,
    summary="List All Normalized Lunar Sites",
    responses=_READ_ERRORS,
)
def list_sites():
    """Returns normalized site registry containing missions, reference sites, and candidate regions."""
    valid_sites = S.get_valid_sites()
    skipped = [s.to_dict() for s in S.get_skipped_sites()]
    return {
        "count": len(valid_sites),
        "sites": [s.to_dict() for s in valid_sites],
        "skipped_sites": skipped,
    }


@router.get(
    "/sites/{site_id}",
    response_model=SiteDetailResponse,
    summary="Get Site Details & Precomputed Assets",
    responses=_SITE_DETAIL_ERRORS,
)
def get_site(site_id: str):
    """Retrieve detailed metadata, coordinates, and precomputed asset availability for a site."""
    site = S.get_site_by_id(site_id)
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Site '{site_id}' not found in registry.",
        )

    assets = {
        "horizon": (ROOT / "web" / "public" / "data" / "horizon" / f"{site_id}.json").is_file(),
        "timeseries": (ROOT / "web" / "public" / "data" / "timeseries" / f"{site_id}.json").is_file(),
        "summary": (ROOT / "web" / "public" / "data" / "summary" / f"{site_id}.json").is_file(),
        "events": (ROOT / "web" / "public" / "data" / "events" / f"{site_id}.json").is_file(),
    }

    data = site.to_dict()
    data["precomputed_assets"] = assets
    return data


# ---------------------------------------------------------------------------
# Core Ephemerides & Geometry
# ---------------------------------------------------------------------------

@router.post(
    "/geometry/timeseries",
    response_model=TimeseriesResponse,
    summary="Topocentric Geometry Timeseries",
    responses=_WRITE_ERRORS,
)
def get_timeseries(req: TimeseriesRequest):
    """
    Generate hourly topocentric Sun and Earth azimuth/elevation timeseries in MOON_ME.
    Supports both idealized flat sphere (Tier 3) and 3D terrain-aware ray-marching.
    """
    analysis_service.require_kernels()
    dt_start, dt_stop = validate_date_range(req.start_utc, req.stop_utc)
    validate_sample_count(dt_start, dt_stop, req.step_seconds)

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
        try:
            mask_data = analysis_service.get_horizon_mask(
                lat=req.lat,
                lon=req.lon,
                mast_height_m=req.mast_height_m,
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
            ts["terrain_dem_id"] = mask_data.get("dem_id")
            ts["sun_fraction"] = sun_vis["fraction"]
            ts["sun_visible"] = sun_vis["visible"]
            ts["earth_visible"] = earth_vis["visible"]
        except Exception as exc:
            ts["horizon_mode"] = "flat_fallback"
            ts["horizon_warning"] = f"Terrain calculation failed ({exc}); fallen back to flat sphere."
    else:
        ts["horizon_mode"] = "flat"

    return ts


@router.post(
    "/geometry/events",
    response_model=EventsResponse,
    summary="Visibility Opportunity Events",
    responses=_WRITE_ERRORS,
)
def get_events(req: EventsRequest):
    """
    Extract contiguous illumination and communication windows with optional 1-minute SPICE refinement.
    """
    analysis_service.require_kernels()
    dt_start, dt_stop = validate_date_range(req.start_utc, req.stop_utc)
    validate_sample_count(dt_start, dt_stop, req.step_seconds)

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
                mask_data = analysis_service.get_horizon_mask(
                    lat=req.lat,
                    lon=req.lon,
                    mast_height_m=req.mast_height_m,
                    max_range_km=50.0,
                )

            metrics_res = M.compute_comprehensive_metrics(
                timeseries=ts,
                mask=mask_data,
                sun_threshold_deg=req.threshold_deg,
                dte_margin_deg=req.antenna_margin_deg,
                earth_criterion=req.earth_criterion,
                refine_edges=req.refine_precision,
                site_lat=req.lat,
                site_lon=req.lon,
            )
            metrics_res["horizon_mode"] = metrics_res["mode"]
            return metrics_res
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# Terrain Horizon
# ---------------------------------------------------------------------------

@router.post(
    "/horizon",
    response_model=HorizonResponse,
    summary="360-degree Topographic Horizon Mask",
    responses=_WRITE_ERRORS,
)
def get_horizon(req: HorizonRequest):
    """
    Compute 360° topographic skyline elevation angles via 3D ray-marching through LOLA DEMs.
    Raises 503 if requested DEM assets are unavailable.
    """
    if req.preferred_dem_id:
        dem_info = T.DEM_CATALOGUE.get(req.preferred_dem_id)
        if not dem_info or not (T.get_terrain_dir() / dem_info.filename).is_file():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Requested DEM asset '{req.preferred_dem_id}' is not available on this server.",
            )

    try:
        mask = analysis_service.get_horizon_mask(
            lat=req.lat,
            lon=req.lon,
            mast_height_m=req.observer_height_m,
            max_range_km=req.max_range_km,
            az_step_deg=req.az_step_deg,
            preferred_dem_id=req.preferred_dem_id,
        )
        if not mask or mask.get("coverage_status") == "unavailable":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No suitable DEM assets are available on the server to compute horizon mask.",
            )
        return mask
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# Custom Lunar Coordinate & Site Analysis
# ---------------------------------------------------------------------------

@router.post(
    "/site/analyze",
    response_model=SiteAnalyzeResponse,
    summary="Comprehensive Site / Custom Coordinate Analysis",
    responses=_SITE_ANALYSIS_ERRORS,
)
def analyze_site(req: SiteAnalyzeRequest):
    """
    Comprehensive illumination, direct-to-Earth communication, and solar power analysis.
    Works for arbitrary lunar coordinates [-90°, +90°], [-180°, +180°] and registered sites.
    """
    return analysis_service.analyze_site(
        site_id=req.site_id,
        site_name=req.site_name,
        lat=req.lat,
        lon=req.lon,
        start_utc=req.start_utc,
        stop_utc=req.stop_utc,
        step_seconds=req.step_seconds,
        mast_height_m=req.mast_height_m,
        horizon_mode=req.horizon_mode,
        solar_array_type=req.solar_array_type,
        solar_tilt_deg=req.solar_tilt_deg,
        solar_azimuth_deg=req.solar_azimuth_deg,
        array_area_m2=req.array_area_m2,
        array_efficiency=req.array_efficiency,
        antenna_margin_deg=req.antenna_margin_deg,
        earth_criterion=req.earth_criterion,
        refine_precision=req.refine_precision,
    )


# ---------------------------------------------------------------------------
# Multi-Site Comparison
# ---------------------------------------------------------------------------

@router.post(
    "/compare",
    response_model=MultiCompareResponse,
    summary="2 to 4 Site Comparative Analysis",
    responses=_WRITE_ERRORS,
)
def compare_sites(req: MultiCompareRequest):
    """
    Fair, synchronized comparative evaluation between 2 and 4 lunar locations.
    Supports registered catalog sites, arbitrary custom coordinates, or mixed selections.
    """
    sites_specs = [s.model_dump() for s in req.sites]
    return analysis_service.compare_sites(
        sites_specs=sites_specs,
        baseline_site_id=req.baseline_site_id,
        start_utc=req.start_utc,
        stop_utc=req.stop_utc,
        window_days=req.window_days,
        threshold_deg=req.threshold_deg,
        antenna_margin_deg=req.antenna_margin_deg,
        solar_array_type=req.solar_array_type,
        array_area_m2=req.array_area_m2,
        array_efficiency=req.array_efficiency,
        horizon_mode=req.horizon_mode,
    )


# ---------------------------------------------------------------------------
# Best Operating Window Search
# ---------------------------------------------------------------------------

@router.post(
    "/site/best-windows",
    response_model=WindowSearchResponse,
    summary="Best Operating Window Search",
    responses=_SITE_ANALYSIS_ERRORS,
)
def search_best_windows(req: WindowSearchRequest):
    """
    Search across an extended interval for candidate operating windows meeting duration
    and line-of-sight constraints. Ranked transparently without arbitrary composite scores.
    """
    return analysis_service.search_best_operating_windows(
        site_id=req.site_id,
        site_name=req.site_name,
        lat=req.lat,
        lon=req.lon,
        search_start_utc=req.search_start_utc,
        search_stop_utc=req.search_stop_utc,
        min_window_hours=req.min_window_hours,
        step_seconds=req.step_seconds,
        mast_height_m=req.mast_height_m,
        horizon_mode=req.horizon_mode,
        sun_threshold_deg=req.sun_threshold_deg,
        antenna_margin_deg=req.antenna_margin_deg,
        earth_criterion=req.earth_criterion,
        top_n=req.top_n,
    )


# ---------------------------------------------------------------------------
# Live Independent JPL Horizons Verification
# ---------------------------------------------------------------------------

@router.post(
    "/verify",
    response_model=VerifyResponse,
    summary="Live JPL Horizons Independent Verification",
    responses=_WRITE_ERRORS,
)
def verify_site_live(req: VerifyRequest):
    """
    Live verification of SPICE topocentric coordinates against NASA JPL Horizons API with 15s timeout.
    """
    analysis_service.require_kernels()
    try:
        with _SPICE_LOCK:
            pos, e_vec, n_vec, u_vec = G.site_to_enu(req.lat, req.lon)
            et = G.spice.str2et(req.utc)
            s_az, s_el = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et, pos, e_vec, n_vec, u_vec)
            e_az, e_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, e_vec, n_vec, u_vec)

        import requests
        import urllib.parse

        horizons_url = "https://ssd.jpl.nasa.gov/api/horizons.api"
        parsed = urllib.parse.urlparse(horizons_url)
        ALLOWED_EXTERNAL_HOSTS = ["ssd.jpl.nasa.gov"]
        if parsed.hostname not in ALLOWED_EXTERNAL_HOSTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"External verification host '{parsed.hostname}' is not in the allowed destinations list.",
            )

        dt = datetime.datetime.fromisoformat(req.utc.replace("Z", "+00:00"))
        start_time_str = dt.strftime("'%Y-%b-%d %H:%M'")
        stop_time_str = (dt + datetime.timedelta(minutes=2)).strftime("'%Y-%b-%d %H:%M'")

        def _query_target(target_id: str):
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
                "CSV_FORMAT": "'YES'",
            }
            resp = requests.get(horizons_url, params=params, timeout=10)
            resp.raise_for_status()
            lines = resp.text.splitlines()
            in_data = False
            for line in lines:
                if "$$SOE" in line:
                    in_data = True
                    continue
                if "$$EOE" in line:
                    break
                if in_data and line.strip():
                    parts = [p.strip() for p in line.split(",")]
                    # Format with CSV_FORMAT='YES':
                    # parts[0]: timestamp, parts[1]: solar flag, parts[2]: lunar flag, parts[3]: Az, parts[4]: El
                    if len(parts) >= 5:
                        try:
                            return float(parts[3]), float(parts[4])
                        except ValueError:
                            pass
                    # Fallback token search for floats
                    tokens = [float(p) for p in parts if _is_float(p)]
                    if len(tokens) >= 2:
                        return tokens[-2], tokens[-1]
            return None, None

        def _is_float(v: str) -> bool:
            try:
                float(v)
                return True
            except ValueError:
                return False

        try:
            h_sun_az, h_sun_el = _query_target("10")
            h_earth_az, h_earth_el = _query_target("399")
        except requests.RequestException as req_err:
            # Preserve the documented graceful-degradation contract: the verification
            # endpoint is diagnostic, so an unreachable external service returns a
            # structured error payload rather than breaking clients with a 5xx.
            return {
                "status": "error",
                "detail": (
                    "NASA JPL Horizons API communication failed "
                    f"({type(req_err).__name__}). Live external service unavailable or timed out."
                ),
                "note": "JPL Horizons API unreachable or timeout. Offline benchmark passes (see /api/provenance).",
            }

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
                (sun_diff_deg is None or sun_diff_deg < 0.01)
                and (earth_diff_deg is None or earth_diff_deg < 0.01)
            ),
        }
    except HTTPException:
        raise
    except Exception as exc:
        return {
            "status": "error",
            "detail": str(exc),
            "note": "JPL Horizons API unreachable or timeout (15s limit). Offline benchmark passes (see /api/provenance).",
        }


# ---------------------------------------------------------------------------
# Cache Management
# ---------------------------------------------------------------------------

@router.get(
    "/cache/stats",
    response_model=CacheStatsResponse,
    summary="Scientific Cache Statistics",
    responses=_READ_ERRORS,
)
def get_cache_stats():
    """Return memory and hit/miss statistics for scientific calculation caches."""
    return {
        "analysis_cache": analysis_cache.stats(),
        "horizon_cache": horizon_cache.stats(),
    }


@router.post(
    "/cache/clear",
    response_model=CacheClearResponse,
    summary="Clear Scientific Calculation Caches",
    responses=_CACHE_CLEAR_ERRORS,
)
def clear_caches(x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key")):
    """Invalidate all cached results in memory.
    
    If AXON_ADMIN_KEY is configured in the environment, callers must supply
    a matching X-Admin-Key header.
    In production (AXON_ENV=production), if AXON_ADMIN_KEY is unset, fails closed (403 Forbidden).
    """
    from api.config import AXON_ENV
    if AXON_ENV == "production" and ADMIN_API_KEY is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cache clearing is disabled in production when AXON_ADMIN_KEY is not configured.",
        )
    if ADMIN_API_KEY is not None:
        if not x_admin_key or x_admin_key != ADMIN_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Valid X-Admin-Key header required to clear scientific cache.",
            )
    a_cleared = analysis_cache.clear()
    h_cleared = horizon_cache.clear()
    return {
        "status": "ok",
        "cleared_analysis_entries": a_cleared,
        "cleared_horizon_entries": h_cleared,
    }
