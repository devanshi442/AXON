"""
api/services/analysis_service.py — Unified scientific computation service for AXON LunarSight.

Coordinates SPICE ephemerides, terrain DEM discovery, horizon ray-marching,
solar power modeling, DTE visibility analysis, and multi-site comparison.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

try:
    from api.cache import analysis_cache, horizon_cache
    from api.config import (
        API_VERSION,
        BENCHMARK_FILE,
        KERNELS_DIR,
        LOCK_FILE,
        PUBLIC_DATA_DIR,
        ROOT,
        TERRAIN_DIR,
    )
    from api.validation import (
        validate_coordinates,
        validate_date_range,
        validate_mast_height,
        validate_sample_count,
        validate_step_seconds,
    )
except ImportError:
    from cache import analysis_cache, horizon_cache
    from config import (
        API_VERSION,
        BENCHMARK_FILE,
        KERNELS_DIR,
        LOCK_FILE,
        PUBLIC_DATA_DIR,
        ROOT,
        TERRAIN_DIR,
    )
    from validation import (
        validate_coordinates,
        validate_date_range,
        validate_mast_height,
        validate_sample_count,
        validate_step_seconds,
    )
from lunarsight_core import benchmark as B
from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import horizon as H
from lunarsight_core import metrics as M
from lunarsight_core import power as P
from lunarsight_core import sites as S
from lunarsight_core import terrain as T
from lunarsight_core import visibility as V

logger = logging.getLogger("lunarsight.analysis")

# Thread-safety: SpiceyPy C routines are process-global and not thread-safe.
_SPICE_LOCK = threading.Lock()


class AnalysisService:
    """
    Central service for all lunar scientific calculations across endpoints.
    """

    def __init__(self):
        self._kernels_loaded = False
        self._kernel_error: Optional[str] = None
        self._kernel_hashes: Dict[str, str] = {}
        self._dem_hashes: Dict[str, str] = {}
        self._refresh_kernel_hashes()
        self._refresh_dem_hashes()

    # -----------------------------------------------------------------------
    # Lifecycle & Readiness
    # -----------------------------------------------------------------------

    def _refresh_dem_hashes(self) -> Dict[str, str]:
        hashes = {}
        lock_file = ROOT / "terrain.lock"
        if lock_file.is_file():
            try:
                for line in lock_file.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#"):
                        parts = line.split()
                        if len(parts) >= 2:
                            sha = parts[0]
                            path_str = parts[1]
                            fname = Path(path_str).name
                            stem = Path(path_str).stem
                            hashes[path_str] = sha
                            hashes[fname] = sha
                            hashes[stem] = sha
            except Exception as exc:
                logger.warning(f"Failed to read terrain.lock: {exc}")
        self._dem_hashes = hashes
        return hashes

    def _refresh_kernel_hashes(self) -> Dict[str, str]:
        hashes = {}
        if LOCK_FILE.is_file():
            try:
                for line in LOCK_FILE.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#"):
                        parts = line.split()
                        if len(parts) >= 2:
                            hashes[parts[1]] = parts[0]
            except Exception as exc:
                logger.warning(f"Failed to read kernels.lock: {exc}")
        self._kernel_hashes = hashes
        return hashes

    def _get_kernel_composite_hash(self) -> str:
        if self._kernel_hashes:
            composite_kernels = json.dumps(self._kernel_hashes, sort_keys=True)
            return hashlib.sha256(composite_kernels.encode("utf-8")).hexdigest()[:16]
        return "no_kernels"

    def load_kernels(self) -> bool:
        """Furnish all required NAIF SPICE kernels under global lock."""
        with _SPICE_LOCK:
            try:
                if KERNELS_DIR.is_dir() and (KERNELS_DIR / C.LSK_FILENAME).is_file():
                    G.load_kernels(KERNELS_DIR)
                    self._kernels_loaded = True
                    self._kernel_error = None
                    self._refresh_kernel_hashes()
                    logger.info("SPICE kernels loaded successfully.")
                    return True
                else:
                    self._kernels_loaded = False
                    self._kernel_error = f"Kernels directory or leap-seconds file ({C.LSK_FILENAME}) missing."
                    logger.warning(self._kernel_error)
                    return False
            except Exception as exc:
                self._kernels_loaded = False
                self._kernel_error = str(exc)
                logger.error(f"Error loading SPICE kernels: {exc}")
                return False

    def unload_kernels(self) -> None:
        """Clear SPICE kernel pool."""
        with _SPICE_LOCK:
            try:
                G.unload_kernels()
                self._kernels_loaded = False
                logger.info("SPICE kernels unloaded.")
            except Exception as exc:
                logger.warning(f"Error unloading SPICE kernels: {exc}")

    @property
    def is_kernels_loaded(self) -> bool:
        return self._kernels_loaded

    def require_kernels(self) -> None:
        """Raise HTTP 503 if SPICE kernels are not ready."""
        if not self._kernels_loaded:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"SPICE kernels not loaded. {self._kernel_error or 'Please check kernel availability.'}",
            )

    def get_readiness(self) -> Dict[str, Any]:
        """Assess overall readiness of kernels, terrain DEMs, and benchmark files."""
        available_kernels = []
        if KERNELS_DIR.is_dir():
            for k in [C.LSK_FILENAME, "pck00011.tpc", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]:
                if (KERNELS_DIR / k).is_file():
                    available_kernels.append(k)

        available_dems = []
        if TERRAIN_DIR.is_dir():
            for dem_id, dem_info in T.DEM_CATALOGUE.items():
                if (TERRAIN_DIR / dem_info.filename).is_file():
                    available_dems.append(dem_id)

        benchmark_status = "missing"
        if BENCHMARK_FILE.is_file():
            benchmark_status = "present"

        is_ready = self._kernels_loaded and len(available_kernels) >= 5

        warnings = []
        if len(available_dems) == 0:
            warnings.append("No local DEM rasters found. Terrain requests will fall back to flat-horizon mode.")

        return {
            "status": "ready" if is_ready else "not_ready",
            "ready": is_ready,
            "kernels_loaded": self._kernels_loaded,
            "kernels_available": available_kernels,
            "terrain_dems_available": available_dems,
            "benchmark_status": benchmark_status,
            "warnings": warnings,
        }

    def get_provenance_data(self) -> Dict[str, Any]:
        """Return comprehensive scientific provenance metadata and audit benchmarks."""
        benchmark_data = {"status": "pending", "message": "Benchmark artifact not found."}
        if BENCHMARK_FILE.is_file():
            try:
                benchmark_data = json.loads(BENCHMARK_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass

        return {
            "service": "AXON LunarSight API",
            "version": API_VERSION,
            "frame": C.MOON_FRAME,
            "time_scale": "UTC (internal Ephemeris Time via NAIF leap seconds)",
            "abcorr": C.ABCORR,
            "moon_radius_km": C.MOON_RADIUS_KM,
            "sun_angular_radius_deg": C.SUN_ANGULAR_RADIUS_DEG,
            "earth_angular_radius_deg": C.EARTH_ANGULAR_RADIUS_DEG,
            "horizon_modes": ["flat", "terrain"],
            "terrain_tiers": {
                "T1": "High-resolution polar DEM (20-40 m/px, LOLA Polar Stereographic)",
                "T2": "Global LOLA DEM (~474 m/px, LDEM_64 Equirectangular)",
                "T3": "Flat spherical horizon datum (0° tangent)",
            },
            "kernels": self._kernel_hashes,
            "kernels_loaded": self._kernels_loaded,
            "benchmark": benchmark_data,
            "caveats": [
                "Direct line-of-sight geometry is not an RF communication link budget (path loss, transponder EIRP, and antenna beam patterns not simulated).",
                "Sun above horizon indicates unoccluded geometric line-of-sight to the solar upper limb; does not simulate photovoltaic dust degradation, thermal midday bandgap derating, or lander tilt.",
                "Elevated mountain summits look down over surrounding lowlands, producing true negative horizon dip angles (down to -3.37°), which increases peak illumination beyond flat sphere datums.",
            ],
        }

    # -----------------------------------------------------------------------
    # Site Resolution
    # -----------------------------------------------------------------------

    def resolve_site(
        self,
        site_id: Optional[str] = None,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        site_name: Optional[str] = None,
    ) -> Tuple[str, str, float, float, str]:
        """
        Resolve location identity and coordinates.
        Supports both registered site IDs and custom lunar coordinates.
        Returns: (resolved_site_id, resolved_site_name, lat, lon, kind)
        """
        if site_id:
            s = S.get_site_by_id(site_id)
            if s and s.lat is not None and s.lon is not None:
                r_lat = lat if lat is not None else s.lat
                r_lon = lon if lon is not None else s.lon
                r_name = site_name if site_name else s.name
                r_lat, r_lon = validate_coordinates(r_lat, r_lon)
                
                # Standardized site_origin: official_mission | published_candidate | user_defined | dem_derived
                if (lat is not None and abs(lat - s.lat) > 1e-4) or (lon is not None and abs(lon - s.lon) > 1e-4):
                    origin = "user_defined"
                elif s.id.endswith("-site") or s.id.endswith("-crest") or getattr(s, "coord_kind", "") == "specific_site" or "peak" in s.name.lower() or "crest" in s.name.lower() or "evaluated site" in s.name.lower():
                    origin = "dem_derived"
                elif s.kind in ("mission", "reference"):
                    origin = "official_mission"
                elif s.kind == "candidate":
                    origin = "published_candidate"
                else:
                    origin = "user_defined"
                return s.id, r_name, r_lat, r_lon, origin
            elif lat is None or lon is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Site '{site_id}' not found in registry and coordinates not provided.",
                )

        if lat is None or lon is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Coordinates 'lat' and 'lon' are required when site_id is not specified.",
            )

        r_lat, r_lon = validate_coordinates(lat, lon)
        resolved_id = site_id or f"custom-{r_lat:+.4f}-{r_lon:+.4f}"
        resolved_name = site_name or f"Custom Site ({r_lat:+.4f}°, {r_lon:+.4f}°)"
        return resolved_id, resolved_name, r_lat, r_lon, "user_defined"

    # -----------------------------------------------------------------------
    # Horizon & Terrain Engine
    # -----------------------------------------------------------------------

    def get_horizon_mask(
        self,
        lat: float,
        lon: float,
        mast_height_m: float = 0.0,
        max_range_km: float = 50.0,
        az_step_deg: float = 1.0,
        preferred_dem_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Compute or retrieve cached 360-degree terrain horizon mask.
        Returns horizon mask dict.
        """
        cache_key = f"h:{round(lat, 4)}:{round(lon, 4)}:{round(mast_height_m, 2)}:{round(max_range_km, 1)}:{round(az_step_deg, 2)}"
        cached = horizon_cache.get(cache_key)
        if cached:
            return cached

        mask_data = H.compute_horizon_raymarch(
            lat=lat,
            lon=lon,
            observer_height_m=mast_height_m,
            max_range_km=max_range_km,
            az_step_deg=az_step_deg,
            preferred_dem_id=preferred_dem_id,
        )
        if mask_data:
            dem_id = mask_data.get("dem_id")
            tier = "T2" if dem_id == "LDEM_64" else "T1"
            mask_data["coverage_tier"] = tier
            warnings = []
            if tier == "T2" and (lat > 75.0 or lat < -75.0):
                warnings.append(
                    f"Site is at high polar latitude ({lat:+.2f}°) where high-resolution Tier 1 polar DEM is unavailable or Tier 2 was selected; using Tier 2 global LDEM_64 (~474 m/px). Horizon skyline precision is limited."
                )
            if "warnings" not in mask_data:
                mask_data["warnings"] = warnings
            else:
                mask_data["warnings"].extend(warnings)
        horizon_cache.set(cache_key, mask_data)
        return mask_data

    # -----------------------------------------------------------------------
    # Instantaneous Geometry
    # -----------------------------------------------------------------------

    def compute_instantaneous_geometry(
        self,
        lat: float,
        lon: float,
        utc: str,
        mast_height_m: float = 0.0,
        mask_data: Optional[Dict[str, Any]] = None,
        antenna_margin_deg: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Compute topocentric Sun and Earth azimuth and elevation at a single timestamp.
        """
        self.require_kernels()
        with _SPICE_LOCK:
            pos, e_vec, n_vec, u_vec = G.site_to_enu(lat, lon, alt_km=0.0, mast_height_m=mast_height_m)
            et = G.spice.str2et(utc)
            s_az, s_el = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et, pos, e_vec, n_vec, u_vec)
            e_az, e_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, e_vec, n_vec, u_vec)

        h_el = None
        if mask_data and mask_data.get("mask_deg"):
            h_el = H.lookup_horizon_elevation(mask_data["mask_deg"], s_az)
            h_el_earth = H.lookup_horizon_elevation(mask_data["mask_deg"], e_az)
            sun_vis = (s_el + C.SUN_ANGULAR_RADIUS_DEG) > h_el
            earth_vis = e_el >= (h_el_earth + antenna_margin_deg)
        else:
            sun_vis = (s_el + C.SUN_ANGULAR_RADIUS_DEG) > 0.0
            earth_vis = e_el >= antenna_margin_deg

        return {
            "utc": utc,
            "sun_azimuth_deg": round(s_az, 2),
            "sun_elevation_deg": round(s_el, 2),
            "terrain_elevation_at_sun_deg": round(h_el, 2) if h_el is not None else None,
            "earth_azimuth_deg": round(e_az, 2),
            "earth_elevation_deg": round(e_el, 2),
            "sun_visible": bool(sun_vis),
            "earth_visible": bool(earth_vis),
        }

    # -----------------------------------------------------------------------
    # Comprehensive Site Analysis Engine (Dynamic & Unified)
    # -----------------------------------------------------------------------

    def analyze_site(
        self,
        site_id: Optional[str] = None,
        site_name: Optional[str] = None,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        start_utc: str = "",
        stop_utc: str = "",
        step_seconds: int = 3600,
        mast_height_m: float = 1.5,
        horizon_mode: str = "terrain",
        solar_array_type: str = "vertical",
        solar_tilt_deg: Optional[float] = None,
        solar_azimuth_deg: Optional[float] = None,
        array_area_m2: float = 1.0,
        array_efficiency: float = 0.28,
        antenna_margin_deg: float = 0.0,
        earth_criterion: str = "center",
        refine_precision: bool = False,
    ) -> Dict[str, Any]:
        """
        Unified analysis pipeline for arbitrary coordinates and catalog sites.
        """
        t0 = time.perf_counter()
        self.require_kernels()

        # 1. Validation
        dt_start, dt_stop = validate_date_range(start_utc, stop_utc)
        step_seconds = validate_step_seconds(step_seconds)
        validate_sample_count(dt_start, dt_stop, step_seconds)
        mast_height_m = validate_mast_height(mast_height_m)
        r_id, r_name, r_lat, r_lon, r_kind = self.resolve_site(site_id, lat, lon, site_name)

        # 2. Cache check
        if self._kernel_hashes:
            composite_kernels = json.dumps(self._kernel_hashes, sort_keys=True)
            kernel_hash = hashlib.sha256(composite_kernels.encode("utf-8")).hexdigest()[:16]
        else:
            kernel_hash = "no_kernels"
        cache_params = {
            "lat": round(r_lat, 4),
            "lon": round(r_lon, 4),
            "start": start_utc,
            "stop": stop_utc,
            "step": step_seconds,
            "mast": round(mast_height_m, 2),
            "mode": horizon_mode,
            "solar": solar_array_type,
            "area": array_area_m2,
            "eff": array_efficiency,
            "margin": antenna_margin_deg,
            "crit": earth_criterion,
            "refine": refine_precision,
        }
        cache_key = analysis_cache.make_key("analyze", cache_params, kernel_hash)
        cached_result = analysis_cache.get(cache_key)
        if cached_result:
            cached_result["cached"] = True
            cached_result["elapsed_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)
            return cached_result

        warnings: List[str] = []

        # 3. SPICE Timeseries Ephemerides
        with _SPICE_LOCK:
            try:
                ts = G.compute_site_timeseries(
                    r_lat,
                    r_lon,
                    start_utc,
                    stop_utc,
                    step_seconds,
                    alt_km=0.0,
                    mast_height_m=mast_height_m,
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"SPICE ephemeris computation failed: {exc}",
                )

        # 4. Topographic Horizon Mask
        mask_data = None
        dem_id = None
        coverage_status = "idealized"
        coverage_tier = "T3"
        site_elevation_m = None

        if horizon_mode == "terrain":
            try:
                mask_data = self.get_horizon_mask(
                    lat=r_lat,
                    lon=r_lon,
                    mast_height_m=mast_height_m,
                    max_range_km=50.0,
                )
                dem_id = mask_data.get("dem_id")
                coverage_status = mask_data.get("coverage_status", "unavailable")
                site_elevation_m = mask_data.get("site_height_m", 0.0)

                if coverage_status == "unavailable" or dem_id is None:
                    horizon_mode = "flat_fallback"
                    coverage_tier = "T3"
                    warnings.append(
                        f"No terrain DEM covers coordinate ({r_lat:+.4f}°, {r_lon:+.4f}°). "
                        "Calculation automatically fell back to flat spherical horizon (Tier 3)."
                    )
                else:
                    coverage_tier = "T2" if dem_id == "LDEM_64" else "T1"
                    if coverage_tier == "T2" and (r_lat > 75.0 or r_lat < -75.0):
                        warnings.append(
                            f"Site is at high polar latitude ({r_lat:+.2f}°) where high-resolution Tier 1 polar DEM is unavailable or Tier 2 was selected; using Tier 2 global LDEM_64 (~474 m/px). Horizon skyline precision is limited."
                        )
                    if coverage_status == "partial":
                        warnings.append(
                            f"Site near DEM boundary; ray-marching truncated before 50 km for some azimuths."
                        )
            except Exception as exc:
                horizon_mode = "flat_fallback"
                coverage_tier = "T3"
                coverage_status = "unavailable"
                warnings.append(f"Topographic ray-march failed ({exc}); defaulted to flat horizon.")
                mask_data = None

        # 5. Instantaneous geometry at start_utc
        instantaneous = self.compute_instantaneous_geometry(
            lat=r_lat,
            lon=r_lon,
            utc=start_utc,
            mast_height_m=mast_height_m,
            mask_data=mask_data,
            antenna_margin_deg=antenna_margin_deg,
        )

        # 6. Comprehensive Solar, Earth, Joint Metrics & Power
        power_config = {
            "orientation": solar_array_type,
            "tilt_deg": solar_tilt_deg,
            "az0_deg": solar_azimuth_deg or 0.0,
            "area_m2": array_area_m2,
            "efficiency": array_efficiency,
        }

        dual_metrics = M.compute_site_flat_and_terrain_metrics(
            timeseries=ts,
            horizon_mask=mask_data if horizon_mode == "terrain" else None,
            sun_threshold_deg=0.0,
            dte_margin_deg=antenna_margin_deg,
            earth_criterion=earth_criterion,
            power_config=power_config,
            site_lat=r_lat,
            site_lon=r_lon,
            refine_edges=refine_precision,
        )

        active_metrics = dual_metrics["terrain"] if (horizon_mode == "terrain" and dual_metrics["terrain"]) else dual_metrics["flat"]

        # Deterministic Analysis ID
        analysis_id = hashlib.sha256(
            f"{r_id}:{r_lat}:{r_lon}:{start_utc}:{stop_utc}:{step_seconds}:{mast_height_m}:{horizon_mode}".encode("utf-8")
        ).hexdigest()[:16]

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        result = {
            "analysis_id": f"scn-{analysis_id}",
            "site_id": r_id,
            "site_name": r_name,
            "lat": r_lat,
            "lon": r_lon,
            "mast_height_m": mast_height_m,
            "start_utc": start_utc,
            "stop_utc": stop_utc,
            "total_period_hours": active_metrics["total_period_hours"],
            "horizon_mode": horizon_mode,
            "dem_id": dem_id,
            "coverage_status": coverage_status,
            "coverage_tier": coverage_tier,
            "tier": coverage_tier,
            "site_origin": r_kind,
            "site_elevation_m": site_elevation_m,
            "instantaneous": instantaneous,
            "sun": active_metrics["sun"],
            "earth": active_metrics["earth"],
            "joint": active_metrics["joint"],
            "power": active_metrics["power"],
            "flat": dual_metrics["flat"],
            "terrain": dual_metrics["terrain"],
            "delta_terrain_minus_flat": dual_metrics["delta_terrain_minus_flat"],
            "lunations": active_metrics.get("lunations"),
            "best_lunation": active_metrics.get("best_lunation"),
            "worst_lunation": active_metrics.get("worst_lunation"),
            "provenance": {
                "frame": C.MOON_FRAME,
                "abcorr": C.ABCORR,
                "time_scale": "UTC (internal Ephemeris Time)",
                "api_version": API_VERSION,
                "kernels": self._kernel_hashes,
                "model_assumptions": "Topocentric line-of-sight geometry with 3D terrain ray-marching.",
            },
            "api_version": API_VERSION,
            "reproducibility": {
                "request_echo": {
                    "site_id": site_id,
                    "site_name": site_name,
                    "lat": r_lat,
                    "lon": r_lon,
                    "start_utc": start_utc,
                    "stop_utc": stop_utc,
                    "step_seconds": step_seconds,
                    "mast_height_m": mast_height_m,
                    "horizon_mode": horizon_mode,
                    "solar_array_type": solar_array_type,
                    "array_area_m2": array_area_m2,
                    "array_efficiency": array_efficiency,
                    "antenna_margin_deg": antenna_margin_deg,
                    "earth_criterion": earth_criterion,
                    "refine_precision": refine_precision,
                },
                "resolved_coords": {"lat": r_lat, "lon": r_lon},
                "site_origin": r_kind,
                "conventions": {
                    "frame": C.MOON_FRAME,
                    "coordinates": "Planetocentric, East-positive [-180, 180]",
                    "time": "UTC (internal Ephemeris Time / TDB)",
                    "datum_radius_km": 1737.4,
                },
                "utc_window": {
                    "start_utc": start_utc,
                    "stop_utc": stop_utc,
                    "total_period_hours": round(active_metrics.get("total_period_hours", 0.0), 4),
                },
                "step": step_seconds,
                "step_seconds": step_seconds,
                "frame": C.MOON_FRAME,
                "coordinates_convention": "Planetocentric, East-positive [-180, 180]",
                "time_scale": "UTC (internal Ephemeris Time / TDB)",
                "api_version": API_VERSION,
                "science_model_version": "AXON-1.0-SPACEAPPS2026",
                "model_version": "AXON-1.0-SPACEAPPS2026",
                "kernels": self._kernel_hashes,
                "kernel_names_and_sha256": self._kernel_hashes,
                "dem": {
                    "id": dem_id,
                    "tier": coverage_tier,
                    "status": coverage_status,
                    "resolution_m": mask_data.get("resolution_m") if mask_data else None,
                    "sha256": self._dem_hashes.get(dem_id or "") or self._dem_hashes.get(f"{dem_id}.JP2"),
                },
                "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "calculated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "warnings": warnings,
                "limitations": [
                    "Sun above horizon is direct geometric line of sight to the solar upper limb.",
                    "Direct line-of-sight geometry is not a telecommunications RF link budget.",
                    "Solar power potential is a clear-sky geometric proxy, not a complete spacecraft power simulation.",
                ],
            },
            "warnings": warnings,
            "limitations": [
                "Sun above horizon is direct geometric line of sight to the solar upper limb.",
                "Direct line-of-sight geometry is not a telecommunications RF link budget.",
                "Solar power potential is a clear-sky geometric proxy, not a complete spacecraft power simulation.",
            ],
            "caveats": [
                "Sun above horizon is direct geometric line of sight to the solar upper limb.",
                "Direct line-of-sight geometry is not a telecommunications RF link budget.",
                "Solar power potential is a clear-sky geometric proxy, not a complete spacecraft power simulation.",
            ],
            "elapsed_ms": elapsed_ms,
            "cached": False,
        }

        # Cache valid result
        analysis_cache.set(cache_key, result)
        return result

    # -----------------------------------------------------------------------
    # Multi-Site Comparison Engine
    # -----------------------------------------------------------------------

    def compare_sites(
        self,
        sites_specs: List[Dict[str, Any]],
        baseline_site_id: Optional[str] = None,
        start_utc: Optional[str] = None,
        stop_utc: Optional[str] = None,
        window_days: int = 30,
        threshold_deg: float = 0.0,
        antenna_margin_deg: float = 0.0,
        solar_array_type: str = "vertical",
        array_area_m2: float = 1.0,
        array_efficiency: float = 0.28,
        horizon_mode: str = "terrain",
    ) -> Dict[str, Any]:
        """
        Compare 2 to 4 lunar locations over a fair, synchronized (or legacy) observation window.
        """
        t0 = time.perf_counter()
        self.require_kernels()

        if len(sites_specs) < 2 or len(sites_specs) > 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Comparison requires between 2 and 4 sites, received {len(sites_specs)}.",
            )

        # Cache check
        kernel_hash = self._get_kernel_composite_hash()
        cache_params = {
            "sites": sites_specs,
            "baseline_site_id": baseline_site_id,
            "start_utc": start_utc,
            "stop_utc": stop_utc,
            "window_days": window_days,
            "threshold_deg": threshold_deg,
            "antenna_margin_deg": antenna_margin_deg,
            "solar_array_type": solar_array_type,
            "array_area_m2": array_area_m2,
            "array_efficiency": array_efficiency,
            "horizon_mode": horizon_mode,
        }
        cache_key = analysis_cache.make_key("compare", cache_params, kernel_hash)
        cached_result = analysis_cache.get(cache_key)
        if cached_result:
            logger.debug("Comparison cache hit.")
            cached_copy = dict(cached_result)
            cached_copy["cached"] = True
            return cached_copy

        # Determine common window
        common_window = bool(start_utc)
        if common_window:
            if not stop_utc:
                dt_start = datetime.datetime.fromisoformat(start_utc.replace("Z", "+00:00"))
                dt_stop = dt_start + datetime.timedelta(days=window_days)
                stop_str = dt_stop.strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                stop_str = stop_utc
            start_str = start_utc
            dt_start, dt_stop = validate_date_range(start_str, stop_str)
            validate_sample_count(dt_start, dt_stop, 3600)
        else:
            # Fall back to first site's utc if top-level start_utc is omitted
            first_utc = sites_specs[0].get("utc")
            if not first_utc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Either top-level 'start_utc' or site-level 'utc' must be provided.",
                )
            dt_start = datetime.datetime.fromisoformat(first_utc.replace("Z", "+00:00"))
            dt_stop = dt_start + datetime.timedelta(days=window_days)
            start_str = dt_start.strftime("%Y-%m-%dT%H:%M:%SZ")
            stop_str = dt_stop.strftime("%Y-%m-%dT%H:%M:%SZ")
            validate_sample_count(dt_start, dt_stop, 3600)

        results: List[Dict[str, Any]] = []
        warnings: List[str] = []

        for idx, spec in enumerate(sites_specs):
            site_utc = spec.get("utc") or start_str
            # In individual mode if not common_window
            s_start = site_utc if not common_window else start_str
            dt_s_start = datetime.datetime.fromisoformat(s_start.replace("Z", "+00:00"))
            dt_s_stop = dt_s_start + datetime.timedelta(days=window_days)
            s_stop = dt_s_stop.strftime("%Y-%m-%dT%H:%M:%SZ") if not common_window else stop_str

            m_height = spec.get("mast_height_m", 1.5)

            try:
                r_id, r_name, r_lat, r_lon, r_kind = self.resolve_site(
                    site_id=spec.get("id"),
                    lat=spec.get("lat"),
                    lon=spec.get("lon"),
                    site_name=spec.get("name"),
                )

                # Horizon mask
                mask_data = None
                dem_id = None
                cov_status = "idealized"
                cov_tier = "T3"
                site_elev = None

                if horizon_mode == "terrain":
                    try:
                        mask_data = self.get_horizon_mask(r_lat, r_lon, mast_height_m=m_height)
                        dem_id = mask_data.get("dem_id")
                        cov_status = mask_data.get("coverage_status", "unavailable")
                        site_elev = mask_data.get("site_height_m")
                        cov_tier = "T2" if dem_id == "LDEM_64" else "T1"
                        if cov_tier == "T2" and (r_lat > 75.0 or r_lat < -75.0):
                            warnings.append(
                                f"Site '{r_name}' is at high polar latitude ({r_lat:+.2f}°) where high-resolution Tier 1 polar DEM is unavailable or Tier 2 was selected; using Tier 2 global LDEM_64 (~474 m/px). Horizon skyline precision is limited."
                            )
                    except Exception as exc:
                        warnings.append(f"Site {r_name} terrain fallback: {exc}")
                        mask_data = None

                # Instantaneous state
                instantaneous = self.compute_instantaneous_geometry(
                    lat=r_lat,
                    lon=r_lon,
                    utc=s_start,
                    mast_height_m=m_height,
                    mask_data=mask_data,
                    antenna_margin_deg=antenna_margin_deg,
                )

                # Timeseries & Dual metrics
                with _SPICE_LOCK:
                    ts = G.compute_site_timeseries(r_lat, r_lon, s_start, s_stop, 3600, 0.0, m_height)

                dual = M.compute_site_flat_and_terrain_metrics(
                    timeseries=ts,
                    horizon_mask=mask_data if horizon_mode == "terrain" else None,
                    sun_threshold_deg=threshold_deg,
                    dte_margin_deg=antenna_margin_deg,
                    solar_array_type=solar_array_type,
                    area_m2=array_area_m2,
                    efficiency=array_efficiency,
                )

                results.append({
                    "id": r_id,
                    "name": r_name,
                    "site_origin": r_kind,
                    "status": "success",
                    "lat": r_lat,
                    "lon": r_lon,
                    "utc": s_start,
                    "mast_height_m": m_height,
                    "dem_id": dem_id,
                    "coverage_status": cov_status,
                    "coverage_tier": cov_tier,
                    "tier": cov_tier,
                    "site_elevation_m": site_elev,
                    "instantaneous": instantaneous,
                    "flat": dual["flat"],
                    "terrain": dual["terrain"],
                    "delta_terrain_minus_flat": dual["delta_terrain_minus_flat"],
                    "power": dual["terrain"].get("power") if dual.get("terrain") else dual["flat"].get("power"),
                })
            except Exception as exc:
                # Isolate failure to this specific site without failing entire comparison
                results.append({
                    "id": spec.get("id") or f"site_{idx+1}",
                    "name": spec.get("name") or f"Site {idx+1}",
                    "site_origin": "user_defined",
                    "status": "failed",
                    "error": str(exc),
                    "utc": s_start,
                    "mast_height_m": m_height,
                })
                warnings.append(f"Site {spec.get('name') or spec.get('id') or idx+1} failed: {exc}")

        # Pairwise and baseline deltas for successful sites
        successful_sites = [s for s in results if s["status"] == "success"]
        pairwise_delta = None
        deltas_vs_baseline = None
        base_id_resolved = None

        if len(successful_sites) >= 2:
            # 1. Resolve baseline site
            base_site = None
            if baseline_site_id:
                for s in successful_sites:
                    if s["id"] == baseline_site_id or s["name"] == baseline_site_id:
                        base_site = s
                        break
            if base_site is None:
                base_site = successful_sites[0]
            base_id_resolved = base_site["id"]

            # 2. Compute deltas relative to baseline site for every site
            deltas_vs_baseline = {}
            base_data = base_site.get("terrain") or base_site.get("flat") or {}
            base_p = base_site.get("power") or {}
            base_sun = base_data.get("sun", {})
            base_earth = base_data.get("earth", {})

            for s in successful_sites:
                s_data = s.get("terrain") or s.get("flat") or {}
                s_p = s.get("power") or {}
                s_sun = s_data.get("sun", {})
                s_earth = s_data.get("earth", {})
                deltas_vs_baseline[s["id"]] = {
                    "site_name": s["name"],
                    "sun_hours": round(s_sun.get("total_hours", 0.0) - base_sun.get("total_hours", 0.0), 1),
                    "sun_pct": round(s_sun.get("percentage", 0.0) - base_sun.get("percentage", 0.0), 2),
                    "dte_hours": round(s_earth.get("total_hours", 0.0) - base_earth.get("total_hours", 0.0), 1),
                    "dte_pct": round(s_earth.get("percentage", 0.0) - base_earth.get("percentage", 0.0), 2),
                    "energy_kwh": round(s_p.get("total_energy_kwh", 0.0) - base_p.get("total_energy_kwh", 0.0), 2),
                    "energy_kwh_m2": round(s_p.get("specific_energy_kwh_m2", 0.0) - base_p.get("specific_energy_kwh_m2", 0.0), 2),
                }

            # 3. Retain backwards-compatible pairwise delta (Site 1 minus Site 0)
            s0 = successful_sites[0]
            s1 = successful_sites[1]
            site0_data = s0.get("terrain") or s0.get("flat") or {}
            site1_data = s1.get("terrain") or s1.get("flat") or {}
            p0 = s0.get("power") or {}
            p1 = s1.get("power") or {}

            sun0 = site0_data.get("sun", {})
            sun1 = site1_data.get("sun", {})
            earth0 = site0_data.get("earth", {})
            earth1 = site1_data.get("earth", {})

            pairwise_delta = {
                "sun_hours": round(sun1.get("total_hours", 0.0) - sun0.get("total_hours", 0.0), 1),
                "sun_pct": round(sun1.get("percentage", 0.0) - sun0.get("percentage", 0.0), 2),
                "dte_hours": round(earth1.get("total_hours", 0.0) - earth0.get("total_hours", 0.0), 1),
                "dte_pct": round(earth1.get("percentage", 0.0) - earth0.get("percentage", 0.0), 2),
                "energy_kwh": round(p1.get("total_energy_kwh", 0.0) - p0.get("total_energy_kwh", 0.0), 2),
                "energy_kwh_m2": round(p1.get("specific_energy_kwh_m2", 0.0) - p0.get("specific_energy_kwh_m2", 0.0), 2),
            }

        # Transparent Individual Metric Rankings (No magic scores!)
        rankings = None
        if len(successful_sites) >= 2:
            def _get_val(s, path, default=0.0):
                curr = s.get("terrain") or s.get("flat") or {}
                for key in path:
                    if not isinstance(curr, dict):
                        return default
                    curr = curr.get(key, default)
                return curr if curr is not None else default

            rankings = {
                "by_sunlight_percentage": [
                    s["name"] for s in sorted(successful_sites, key=lambda s: _get_val(s, ["sun", "percentage"]), reverse=True)
                ],
                "by_earth_visibility_percentage": [
                    s["name"] for s in sorted(successful_sites, key=lambda s: _get_val(s, ["earth", "percentage"]), reverse=True)
                ],
                "by_joint_availability_hours": [
                    s["name"] for s in sorted(successful_sites, key=lambda s: _get_val(s, ["joint", "total_hours"]), reverse=True)
                ],
                "by_shortest_dark_gap": [
                    s["name"] for s in sorted(successful_sites, key=lambda s: _get_val(s, ["sun", "longest_dark_gap_hours"]))
                ],
                "by_solar_energy": [
                    s["name"] for s in sorted(successful_sites, key=lambda s: s.get("power", {}).get("total_energy_kwh", 0.0), reverse=True)
                ],
            }

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        result = {
            "sites": results,
            "baseline_site_id": base_id_resolved,
            "deltas_vs_baseline": deltas_vs_baseline,
            "pairwise_delta_1_minus_0": pairwise_delta,
            "rankings": rankings,
            "window_days": window_days,
            "common_window": common_window,
            "start_utc": start_str,
            "stop_utc": stop_str,
            "threshold_deg": threshold_deg,
            "antenna_margin_deg": antenna_margin_deg,
            "solar_array_type": solar_array_type,
            "warnings": warnings,
            "api_version": API_VERSION,
            "reproducibility": {
                "request_echo": {
                    "sites": sites_specs,
                    "start_utc": start_str,
                    "stop_utc": stop_str,
                    "window_days": window_days,
                    "common_window": common_window,
                    "threshold_deg": threshold_deg,
                    "antenna_margin_deg": antenna_margin_deg,
                    "solar_array_type": solar_array_type,
                    "horizon_mode": horizon_mode,
                },
                "resolved_coords": [{"id": s.get("id"), "name": s.get("name"), "lat": s.get("lat"), "lon": s.get("lon")} for s in results],
                "site_origin": [s.get("site_origin", "user_defined") for s in results],
                "site_origins": [s.get("site_origin", "user_defined") for s in results],
                "conventions": {
                    "frame": C.MOON_FRAME,
                    "coordinates": "Planetocentric, East-positive [-180, 180]",
                    "time": "UTC (internal Ephemeris Time / TDB)",
                    "datum_radius_km": 1737.4,
                },
                "utc_window": {
                    "start_utc": start_str,
                    "stop_utc": stop_str,
                    "window_days": window_days,
                    "common_window": common_window,
                },
                "step": 3600,
                "step_seconds": 3600,
                "frame": C.MOON_FRAME,
                "coordinates_convention": "Planetocentric, East-positive [-180, 180]",
                "time_scale": "UTC (internal Ephemeris Time / TDB)",
                "api_version": API_VERSION,
                "science_model_version": "AXON-1.0-SPACEAPPS2026",
                "model_version": "AXON-1.0-SPACEAPPS2026",
                "kernels": self._kernel_hashes,
                "kernel_names_and_sha256": self._kernel_hashes,
                "dem": [
                    {
                        "site_id": s.get("id"),
                        "dem_id": s.get("dem_id"),
                        "tier": s.get("coverage_tier"),
                        "resolution_m": s.get("resolution_m"),
                        "sha256": self._dem_hashes.get(s.get("dem_id") or "") or self._dem_hashes.get(f"{s.get('dem_id')}.JP2"),
                    }
                    for s in results
                ],
                "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "calculated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "warnings": warnings,
                "limitations": [
                    "Sun above horizon is direct geometric line of sight to the solar upper limb.",
                    "Direct line-of-sight geometry is not a telecommunications RF link budget.",
                    "Solar power potential is a clear-sky geometric proxy, not a complete spacecraft power simulation.",
                ],
            },
            "warnings": warnings,
            "limitations": [
                "Sun above horizon is direct geometric line of sight to the solar upper limb.",
                "Direct line-of-sight geometry is not a telecommunications RF link budget.",
                "Solar power potential is a clear-sky geometric proxy, not a complete spacecraft power simulation.",
            ],
            "caveats": [
                "Sun above horizon is direct geometric line of sight to the solar upper limb.",
                "Direct line-of-sight geometry is not a telecommunications RF link budget.",
                "Solar power potential is a clear-sky geometric proxy, not a complete spacecraft power simulation.",
            ],
            "elapsed_ms": elapsed_ms,
            "cached": False,
        }

        # Cache valid comparison result
        analysis_cache.set(cache_key, result)
        return result
    # -----------------------------------------------------------------------
    # Best Operating Window Search Engine
    # -----------------------------------------------------------------------

    def search_best_operating_windows(
        self,
        site_id: Optional[str] = None,
        site_name: Optional[str] = None,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        search_start_utc: str = "",
        search_stop_utc: str = "",
        min_window_hours: float = 24.0,
        step_seconds: int = 3600,
        mast_height_m: float = 1.5,
        horizon_mode: str = "terrain",
        sun_threshold_deg: float = 0.0,
        antenna_margin_deg: float = 0.0,
        earth_criterion: str = "center",
        top_n: int = 10,
    ) -> Dict[str, Any]:
        """
        Scan a search time range for candidate operating windows meeting duration and visibility criteria.
        Ranks transparently by continuous joint operating window duration, then lowest dark gap.
        """
        t0 = time.perf_counter()
        self.require_kernels()

        dt_start, dt_stop = validate_date_range(search_start_utc, search_stop_utc)
        step_seconds = validate_step_seconds(step_seconds)
        validate_sample_count(dt_start, dt_stop, step_seconds)
        mast_height_m = validate_mast_height(mast_height_m)
        r_id, r_name, r_lat, r_lon, r_kind = self.resolve_site(site_id, lat, lon, site_name)

        # Cache check
        kernel_hash = self._get_kernel_composite_hash()
        cache_params = {
            "site_id": site_id,
            "lat": lat,
            "lon": lon,
            "search_start_utc": search_start_utc,
            "search_stop_utc": search_stop_utc,
            "min_window_hours": min_window_hours,
            "step_seconds": step_seconds,
            "mast_height_m": mast_height_m,
            "horizon_mode": horizon_mode,
            "sun_threshold_deg": sun_threshold_deg,
            "antenna_margin_deg": antenna_margin_deg,
            "earth_criterion": earth_criterion,
            "top_n": top_n,
        }
        cache_key = analysis_cache.make_key("best_windows", cache_params, kernel_hash)
        cached_result = analysis_cache.get(cache_key)
        if cached_result:
            cached_copy = dict(cached_result)
            cached_copy["cached"] = True
            return cached_copy

        # 1. Ephemerides timeseries
        with _SPICE_LOCK:
            ts = G.compute_site_timeseries(
                r_lat, r_lon, search_start_utc, search_stop_utc, step_seconds, alt_km=0.0, mast_height_m=mast_height_m
            )

        # 2. Horizon mask
        mask_data = None
        dem_id = None
        if horizon_mode == "terrain":
            try:
                mask_data = self.get_horizon_mask(r_lat, r_lon, mast_height_m=mast_height_m)
                dem_id = mask_data.get("dem_id")
            except Exception:
                mask_data = None

        # 3. Visibility evaluations
        sun_vis = V.compute_sun_visibility(
            ts["sun_elevation_deg"],
            ts["sun_azimuth_deg"],
            mask=mask_data,
            threshold_deg=sun_threshold_deg,
        )
        earth_vis = V.compute_earth_visibility(
            ts["earth_elevation_deg"],
            ts["earth_azimuth_deg"],
            mask=mask_data,
            margin_deg=antenna_margin_deg,
            criterion=earth_criterion,
        )

        sun_mask = sun_vis["visible"]
        earth_mask = earth_vis["visible"]
        joint_mask = [s and e for s, e in zip(sun_mask, earth_mask)]

        # 4. Contiguous Joint Windows
        joint_windows = M.extract_windows_refined(
            ts["times"],
            joint_mask,
            step_seconds=step_seconds,
            refine_edges=False,
        )

        # 5. Filter windows by min duration
        candidates = []
        for w in joint_windows:
            dur = w["duration_hours"]
            if dur >= min_window_hours:
                # Find corresponding index slice to compute stats during this window
                start_utc = w["start"]
                end_utc = w["end"]
                try:
                    s_idx = ts["times"].index(start_utc)
                    e_idx = ts["times"].index(end_utc)
                    sub_sun = sun_mask[s_idx : e_idx + 1]
                    sub_earth = earth_mask[s_idx : e_idx + 1]
                    s_hours = min(dur, round(sum(sub_sun) * (step_seconds / 3600.0), 1))
                    e_hours = min(dur, round(sum(sub_earth) * (step_seconds / 3600.0), 1))
                    longest_dark = min(dur, M._longest_run_hours(sub_sun, step_seconds, False))
                except Exception:
                    s_hours = dur
                    e_hours = dur
                    longest_dark = 0.0

                candidates.append({
                    "start_utc": start_utc,
                    "end_utc": end_utc,
                    "duration_hours": round(dur, 1),
                    "duration_days": round(dur / 24.0, 1),
                    "sun_availability_hours": round(s_hours, 1),
                    "earth_visibility_hours": round(e_hours, 1),
                    "longest_dark_gap_hours": round(longest_dark, 1),
                    "precision": w.get("precision", "hourly"),
                })

        # Transparent sorting: longest continuous duration first, then lowest dark gap, then chronological
        candidates.sort(key=lambda x: (x["duration_hours"], -x["longest_dark_gap_hours"], x["start_utc"]), reverse=True)

        ranked = []
        for i, c in enumerate(candidates[:top_n]):
            if i > 0:
                prev = candidates[i - 1]
                if c["duration_hours"] == prev["duration_hours"] and c["longest_dark_gap_hours"] == prev["longest_dark_gap_hours"]:
                    c["rank"] = prev["rank"]
                    c["is_tie"] = True
                    prev["is_tie"] = True
                else:
                    c["rank"] = i + 1
                    c["is_tie"] = False
            else:
                c["rank"] = 1
                c["is_tie"] = False
            ranked.append(c)

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        cov_tier = "T2" if dem_id == "LDEM_64" else ("T1" if dem_id else "T3")

        result = {
            "status": "success",
            "site_id": r_id,
            "site_name": r_name,
            "site_origin": r_kind,
            "lat": r_lat,
            "lon": r_lon,
            "search_start_utc": search_start_utc,
            "search_stop_utc": search_stop_utc,
            "min_window_hours": min_window_hours,
            "horizon_mode": horizon_mode if mask_data else "flat",
            "dem_id": dem_id,
            "coverage_tier": cov_tier,
            "tier": cov_tier,
            "candidate_windows_count": len(candidates),
            "total_candidates_found": len(candidates),
            "ranked_windows": ranked,
            "windows": ranked,
            "ranking_criterion": "Sorted by continuous joint operating window duration, then lowest dark gap",
            "ranking_criteria": ["duration_hours DESC", "longest_dark_gap_hours ASC", "chronological_start ASC"],
            "tie_handling": "Equal duration and dark gap assign identical rank with is_tie=True",
            "elapsed_ms": elapsed_ms,
            "cached": False,
        }

        # Cache valid comparison result
        analysis_cache.set(cache_key, result)
        return result
    # Alias
    search_best_windows = search_best_operating_windows


# Global service instance
analysis_service = AnalysisService()
