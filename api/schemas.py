"""
api/schemas.py — Pydantic request and response schemas for AXON LunarSight API.

All models strictly conform to project science conventions:
- Coordinates: Latitude [-90°, +90°], East-positive Longitude [-180°, +180°].
- Time: UTC ISO 8601 strings.
- Units: Angles in degrees, distances in km or meters, power in Watts, energy in kWh or Wh.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from lunarsight_core import constants as C


# ---------------------------------------------------------------------------
# Common / Error Schemas
# ---------------------------------------------------------------------------

class ErrorInfo(BaseModel):
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error description")
    details: Optional[Any] = Field(default=None, description="Additional context or validation details")
    timestamp: str = Field(..., description="UTC timestamp of error occurrence")


class ErrorEnvelope(BaseModel):
    error: ErrorInfo


# ---------------------------------------------------------------------------
# Health, Readiness, Provenance
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = Field(default="ok", examples=["ok"])
    version: str = Field(..., examples=["0.3.0"])
    service: str = Field(default="AXON LunarSight API")
    kernels_loaded: bool = Field(..., description="True if SPICE kernels are currently furnished")


class ReadinessResponse(BaseModel):
    status: str = Field(..., examples=["ready"])
    ready: bool = Field(..., description="True if all critical scientific assets and engines are ready")
    kernels_loaded: bool
    kernels_available: List[str]
    terrain_dems_available: List[str]
    benchmark_status: str
    warnings: List[str] = Field(default_factory=list)


class ProvenanceResponse(BaseModel):
    service: str
    version: str
    frame: str = Field(default=C.MOON_FRAME, description="Lunar reference frame")
    time_scale: str
    abcorr: str
    moon_radius_km: float
    sun_angular_radius_deg: float
    earth_angular_radius_deg: float
    horizon_modes: List[str]
    terrain_tiers: Dict[str, str]
    kernels: Dict[str, str]
    kernels_loaded: bool
    benchmark: Dict[str, Any]
    caveats: List[str]


# ---------------------------------------------------------------------------
# Timeseries Schemas
# ---------------------------------------------------------------------------

class TimeseriesRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG, description="Planetocentric latitude in degrees [-90, +90]")
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG, description="East-positive longitude in degrees [-180, +180]")
    start_utc: str = Field(..., description="UTC start date-time ISO string", examples=["2026-03-01T00:00:00Z"])
    stop_utc: str = Field(..., description="UTC stop date-time ISO string", examples=["2026-03-02T00:00:00Z"])
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS, description="Time step in seconds (min 60)")
    alt_km: float = Field(default=0.0, ge=0.0, description="Observer altitude above reference sphere in km")
    mast_height_m: float = Field(default=0.0, ge=0.0, le=100.0, description="Observer mast height in meters")
    horizon_mode: str = Field(default="flat", pattern="^(flat|terrain)$", description="'flat' or 'terrain'")


class TimeseriesResponse(BaseModel):
    start_utc: str
    stop_utc: str
    step_seconds: int
    times: List[str]
    sun_azimuth_deg: List[float]
    sun_elevation_deg: List[float]
    earth_azimuth_deg: List[float]
    earth_elevation_deg: List[float]
    sun_distance_km: Optional[List[float]] = None
    earth_distance_km: Optional[List[float]] = None
    sun_angular_radius_deg: Optional[List[float]] = None
    earth_angular_radius_deg: Optional[List[float]] = None
    frame: str
    abcorr: str
    horizon_mode: str
    terrain_dem_id: Optional[str] = None
    sun_fraction: Optional[List[float]] = None
    sun_visible: Optional[List[bool]] = None
    earth_visible: Optional[List[bool]] = None
    horizon_warning: Optional[str] = None


# ---------------------------------------------------------------------------
# Events Schemas
# ---------------------------------------------------------------------------

class EventsRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    start_utc: str
    stop_utc: str
    threshold_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    antenna_margin_deg: float = Field(default=0.0, ge=0.0, le=90.0)
    earth_criterion: str = Field(default="center", pattern="^(center|full_disk|any_limb)$")
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS)
    mast_height_m: float = Field(default=0.0, ge=0.0, le=100.0)
    horizon_mode: str = Field(default="flat", pattern="^(flat|terrain)$")
    refine_precision: bool = Field(default=True, description="Refine event edges to ~1-minute via SPICE bisection")


# ---------------------------------------------------------------------------
# Horizon Schemas
# ---------------------------------------------------------------------------

class HorizonRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    observer_height_m: float = Field(default=0.0, ge=0.0, le=100.0)
    max_range_km: float = Field(default=50.0, ge=5.0, le=150.0)
    az_step_deg: float = Field(default=1.0, ge=0.1, le=10.0)
    preferred_dem_id: Optional[str] = None


class HorizonResponse(BaseModel):
    lat: float
    lon: float
    h_m: float
    dem_id: Optional[str]
    resolution_m: Optional[float]
    max_range_km: float
    az_step: float
    mask_deg: List[float]
    coverage_status: str
    max_valid_range_km: List[float]
    site_height_m: float
    coverage_tier: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    method: str
    generated: str


# ---------------------------------------------------------------------------
# Site Analyze Schemas (Custom Lunar Coordinates & Predefined Sites)
# ---------------------------------------------------------------------------

class SiteAnalyzeRequest(BaseModel):
    site_id: Optional[str] = Field(default=None, description="Optional registered site ID from catalog (e.g. 'im-2')")
    site_name: Optional[str] = Field(default=None, description="Custom label for the evaluated location")
    lat: Optional[float] = Field(default=None, ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG, description="Planetocentric latitude in degrees [-90, +90]")
    lon: Optional[float] = Field(default=None, ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG, description="East-positive longitude in degrees [-180, +180]")
    start_utc: str = Field(..., description="UTC start timestamp (ISO 8601)", examples=["2026-03-01T00:00:00Z"])
    stop_utc: str = Field(..., description="UTC stop timestamp (ISO 8601)", examples=["2026-03-15T00:00:00Z"])
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS, description="Ephemeris time step in seconds (min 60)")
    mast_height_m: float = Field(default=1.5, ge=0.0, le=100.0, description="Observer/hardware mast height in meters")
    horizon_mode: str = Field(default="terrain", pattern="^(terrain|flat)$", description="Horizon mode: 'terrain' (default) or 'flat'")
    solar_array_type: str = Field(
        default="vertical",
        pattern="^(flat|horizontal|vertical|vertical_fixed|vertical_azimuth_tracking|tilted|tracking|sun_tracking)$",
        description="Solar panel orientation model",
    )
    solar_tilt_deg: Optional[float] = Field(default=None, ge=0.0, le=90.0, description="Panel tilt relative to horizontal (deg)")
    solar_azimuth_deg: Optional[float] = Field(default=None, ge=0.0, le=360.0, description="Fixed panel facing azimuth (deg from North)")
    array_area_m2: float = Field(default=1.0, gt=0.0, description="Total photovoltaic surface area in square meters")
    array_efficiency: float = Field(default=0.28, gt=0.0, le=1.0, description="Solar cell conversion efficiency (default 0.28 = 28%)")
    antenna_margin_deg: float = Field(default=0.0, ge=0.0, le=90.0, description="Antenna elevation clearance margin above topography")
    earth_criterion: str = Field(default="center", pattern="^(center|full_disk|any_limb)$", description="DTE line-of-sight criterion")
    refine_precision: bool = Field(default=False, description="Refine event window transition edges via SPICE bisection")


class OpportunityWindowSchema(BaseModel):
    start: str
    end: str
    start_utc: Optional[str] = None
    end_utc: Optional[str] = None
    duration_hours: float
    precision: Optional[str] = "hourly"


class BodyOpportunitySchema(BaseModel):
    total_hours: float
    percentage: float
    windows_count: int
    longest_window_hours: float
    longest_dark_gap_hours: float
    windows: List[OpportunityWindowSchema]
    criterion: Optional[str] = None
    margin_deg: Optional[float] = None


class SolarPowerSummarySchema(BaseModel):
    area_m2: float
    efficiency: float
    orientation: str
    total_energy_kwh: float
    specific_energy_kwh_m2: float
    peak_power_watts: float
    mean_power_watts: float
    caveat: str


class InstantaneousGeometrySchema(BaseModel):
    utc: str
    sun_azimuth_deg: float
    sun_elevation_deg: float
    terrain_elevation_at_sun_deg: Optional[float] = None
    earth_azimuth_deg: float
    earth_elevation_deg: float
    sun_visible: bool
    earth_visible: bool


class SiteAnalyzeResponse(BaseModel):
    analysis_id: str = Field(..., description="Deterministic analysis scenario identifier")
    site_id: Optional[str] = None
    site_name: str
    lat: float
    lon: float
    mast_height_m: float
    start_utc: str
    stop_utc: str
    total_period_hours: float
    horizon_mode: str
    dem_id: Optional[str] = None
    coverage_status: str
    coverage_tier: str
    site_elevation_m: Optional[float] = None
    instantaneous: Optional[InstantaneousGeometrySchema] = None
    sun: BodyOpportunitySchema
    earth: BodyOpportunitySchema
    joint: BodyOpportunitySchema
    power: SolarPowerSummarySchema
    flat: Optional[Dict[str, Any]] = None
    terrain: Optional[Dict[str, Any]] = None
    delta_terrain_minus_flat: Optional[Dict[str, Any]] = None
    lunations: Optional[List[Dict[str, Any]]] = None
    best_lunation: Optional[Dict[str, Any]] = None
    worst_lunation: Optional[Dict[str, Any]] = None
    provenance: Dict[str, Any]
    warnings: List[str] = Field(default_factory=list)
    caveats: List[str] = Field(default_factory=list)
    elapsed_ms: float
    cached: bool


# ---------------------------------------------------------------------------
# Multi-Site Comparison Schemas
# ---------------------------------------------------------------------------

class CompareSiteSpec(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: Optional[float] = Field(default=None, ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    utc: Optional[str] = Field(default=None, description="Site-specific start UTC (for legacy per-site mode)")
    mast_height_m: float = Field(default=1.5, ge=0.0, le=100.0)


class MultiCompareRequest(BaseModel):
    sites: List[CompareSiteSpec] = Field(..., min_length=2, max_length=4, description="2 to 4 lunar locations")
    start_utc: Optional[str] = Field(default=None, description="Common UTC start timestamp for fair comparison")
    stop_utc: Optional[str] = Field(default=None, description="Common UTC stop timestamp")
    window_days: int = Field(default=30, ge=1, le=90, description="Comparison duration in days")
    threshold_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    antenna_margin_deg: float = Field(default=0.0, ge=0.0, le=90.0)
    solar_array_type: str = Field(default="vertical", pattern="^(flat|horizontal|vertical|vertical_fixed|vertical_azimuth_tracking|tilted|tracking|sun_tracking)$")
    array_area_m2: float = Field(default=1.0, gt=0.0)
    array_efficiency: float = Field(default=0.28, gt=0.0, le=1.0)
    horizon_mode: str = Field(default="terrain", pattern="^(terrain|flat)$")


class ComparedSiteResult(BaseModel):
    id: str
    name: str
    status: str = Field(default="success", description="'success' or 'failed'")
    error: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    utc: str
    mast_height_m: float
    dem_id: Optional[str] = None
    coverage_status: Optional[str] = None
    coverage_tier: Optional[str] = None
    site_elevation_m: Optional[float] = None
    instantaneous: Optional[Dict[str, Any]] = None
    flat: Optional[Dict[str, Any]] = None
    terrain: Optional[Dict[str, Any]] = None
    delta_terrain_minus_flat: Optional[Dict[str, Any]] = None
    power: Optional[Dict[str, Any]] = None
    site_origin: Optional[str] = None


class TransparentRankings(BaseModel):
    by_sunlight_percentage: List[str]
    by_earth_visibility_percentage: List[str]
    by_joint_availability_hours: List[str]
    by_shortest_dark_gap: List[str]
    by_solar_energy: List[str]


class MultiCompareResponse(BaseModel):
    sites: List[ComparedSiteResult]
    pairwise_delta_1_minus_0: Optional[Dict[str, Any]] = None
    rankings: Optional[TransparentRankings] = None
    window_days: int
    common_window: bool
    start_utc: str
    stop_utc: str
    threshold_deg: float
    antenna_margin_deg: float
    solar_array_type: str
    warnings: List[str] = Field(default_factory=list)
    elapsed_ms: float
    reproducibility: Optional[Dict[str, Any]] = None
    cached: bool = False


# ---------------------------------------------------------------------------
# Best Operating Window Search Schemas
# ---------------------------------------------------------------------------

class WindowSearchRequest(BaseModel):
    site_id: Optional[str] = None
    site_name: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: Optional[float] = Field(default=None, ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    search_start_utc: str = Field(..., description="UTC start of search interval", examples=["2026-03-01T00:00:00Z"])
    search_stop_utc: str = Field(..., description="UTC end of search interval", examples=["2026-04-15T00:00:00Z"])
    min_window_hours: float = Field(default=24.0, ge=1.0, le=720.0, description="Minimum window duration in hours")
    step_seconds: int = Field(default=3600, ge=C.MIN_STEP_SECONDS)
    mast_height_m: float = Field(default=1.5, ge=0.0, le=100.0)
    horizon_mode: str = Field(default="terrain", pattern="^(terrain|flat)$")
    sun_threshold_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    antenna_margin_deg: float = Field(default=0.0, ge=0.0, le=90.0)
    earth_criterion: str = Field(default="center", pattern="^(center|full_disk|any_limb)$")
    top_n: int = Field(default=10, ge=1, le=50)


class RankedWindow(BaseModel):
    rank: int
    start_utc: str
    end_utc: str
    duration_hours: float
    duration_days: float
    sun_availability_hours: float
    earth_visibility_hours: float
    longest_dark_gap_hours: float
    precision: str


class WindowSearchResponse(BaseModel):
    site_name: str
    lat: float
    lon: float
    search_start_utc: str
    search_stop_utc: str
    min_window_hours: float
    horizon_mode: str
    dem_id: Optional[str] = None
    candidate_windows_count: int
    ranked_windows: List[RankedWindow]
    ranking_criterion: str = Field(
        default="Sorted by continuous joint operating window duration, then lowest dark gap",
        description="Explanation of transparent sorting logic (no arbitrary magic score)",
    )
    elapsed_ms: float


# ---------------------------------------------------------------------------
# Live Verification & Cache Schemas
# ---------------------------------------------------------------------------

class VerifyRequest(BaseModel):
    lat: float = Field(..., ge=C.LAT_MIN_DEG, le=C.LAT_MAX_DEG)
    lon: float = Field(..., ge=C.LON_MIN_DEG, le=C.LON_MAX_DEG)
    utc: str = Field(..., description="UTC ISO date-time string", examples=["2026-03-01T00:00:00Z"])


class CacheStatsResponse(BaseModel):
    analysis_cache: Dict[str, Any]
    horizon_cache: Dict[str, Any]
