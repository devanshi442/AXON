"""
science/tests/test_api_request_integrity.py — Patch C regression tests.

Covers geometry sample-count guard-rails, analyze/best-windows cache identity,
cache-hit immutability, and horizon cache precision. Tests are isolated from
SPICE kernels and DEM assets via monkeypatching.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from main import app


OVERSIZED_START = "2026-01-01T00:00:00Z"
OVERSIZED_STOP = "2026-04-01T00:00:00Z"  # exactly 90 days


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def service(monkeypatch):
    from api.services import analysis_service as service_module

    service_module.analysis_cache.clear()
    service_module.horizon_cache.clear()
    monkeypatch.setattr(
        service_module.analysis_service,
        "require_kernels",
        lambda: None,
    )
    yield service_module
    service_module.horizon_cache.clear()
    service_module.analysis_cache.clear()


# ---------------------------------------------------------------------------
# Geometry sample-count guard-rails
# ---------------------------------------------------------------------------

def test_geometry_timeseries_rejects_oversized_request_before_computation(
    client,
    monkeypatch,
):
    from api import routes

    monkeypatch.setattr(routes.analysis_service, "require_kernels", lambda: None)
    called = []

    def fail_if_called(*args, **kwargs):
        called.append((args, kwargs))
        raise AssertionError("compute_site_timeseries must not run")

    monkeypatch.setattr(routes.G, "compute_site_timeseries", fail_if_called)

    response = client.post(
        "/api/geometry/timeseries",
        json={
            "lat": 0.0,
            "lon": 0.0,
            "start_utc": OVERSIZED_START,
            "stop_utc": OVERSIZED_STOP,
            "step_seconds": 60,
            "horizon_mode": "flat",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "HTTP_400"
    assert "8784" in payload["detail"]
    assert called == []


def test_geometry_events_rejects_oversized_request_before_computation(
    client,
    monkeypatch,
):
    from api import routes

    monkeypatch.setattr(routes.analysis_service, "require_kernels", lambda: None)
    called = []

    def fail_if_called(*args, **kwargs):
        called.append((args, kwargs))
        raise AssertionError("compute_site_timeseries must not run")

    monkeypatch.setattr(routes.G, "compute_site_timeseries", fail_if_called)

    response = client.post(
        "/api/geometry/events",
        json={
            "lat": 0.0,
            "lon": 0.0,
            "start_utc": OVERSIZED_START,
            "stop_utc": OVERSIZED_STOP,
            "step_seconds": 60,
            "horizon_mode": "flat",
        },
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "HTTP_400"
    assert "8784" in payload["detail"]
    assert called == []


def test_validate_sample_count_accepts_exactly_8784():
    from api.validation import MAX_SAMPLE_POINTS, validate_sample_count

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    stop = start + timedelta(seconds=(MAX_SAMPLE_POINTS - 1) * 60)

    assert validate_sample_count(start, stop, 60) == MAX_SAMPLE_POINTS


def test_validate_sample_count_rejects_8785():
    from api.validation import MAX_SAMPLE_POINTS, validate_sample_count

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    stop = start + timedelta(seconds=MAX_SAMPLE_POINTS * 60)

    with pytest.raises(HTTPException) as exc_info:
        validate_sample_count(start, stop, 60)

    assert exc_info.value.status_code == 400
    assert str(MAX_SAMPLE_POINTS + 1) in exc_info.value.detail


# ---------------------------------------------------------------------------
# Analyze cache identity
# ---------------------------------------------------------------------------

def _install_fake_analyze(monkeypatch, service_module, calls):
    def fake_timeseries(
        lat,
        lon,
        start,
        stop,
        step_seconds,
        alt_km=0.0,
        mast_height_m=0.0,
    ):
        return {
            "times": [start],
            "sun_azimuth_deg": [0.0],
            "sun_elevation_deg": [10.0],
            "earth_azimuth_deg": [0.0],
            "earth_elevation_deg": [10.0],
        }

    def fake_instantaneous(**kwargs):
        return {"utc": kwargs["utc"]}

    def fake_metrics(**kwargs):
        cfg = kwargs["power_config"]
        calls.append(cfg)
        metrics = {
            "total_period_hours": 24.0,
            "sun": {"total_hours": 12.0},
            "earth": {"total_hours": 12.0},
            "joint": {"total_hours": 12.0},
            "power": {
                "az0_deg": cfg.get("az0_deg"),
                "tilt_deg": cfg.get("tilt_deg"),
            },
            "lunations": [],
            "best_lunation": None,
            "worst_lunation": None,
        }
        return {
            "flat": metrics,
            "terrain": None,
            "delta_terrain_minus_flat": None,
        }

    monkeypatch.setattr(
        service_module.G,
        "compute_site_timeseries",
        fake_timeseries,
    )
    monkeypatch.setattr(
        service_module.analysis_service,
        "compute_instantaneous_geometry",
        fake_instantaneous,
    )
    monkeypatch.setattr(
        service_module.M,
        "compute_site_flat_and_terrain_metrics",
        fake_metrics,
    )


def test_analyze_cache_key_isolates_solar_azimuth(service, monkeypatch):
    calls = []
    _install_fake_analyze(monkeypatch, service, calls)

    base = {
        "lat": -89.5,
        "lon": 0.0,
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-01-02T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
        "solar_array_type": "tilted",
        "solar_tilt_deg": 30.0,
    }

    first = service.analysis_service.analyze_site(
        solar_azimuth_deg=0.0,
        **base,
    )
    second = service.analysis_service.analyze_site(
        solar_azimuth_deg=180.0,
        **base,
    )

    assert len(calls) == 2
    assert first["power"]["az0_deg"] == 0.0
    assert second["power"]["az0_deg"] == 180.0


def test_analyze_cache_key_isolates_site_name(service, monkeypatch):
    calls = []
    _install_fake_analyze(monkeypatch, service, calls)

    base = {
        "lat": -89.5,
        "lon": 0.0,
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-01-02T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }

    first = service.analysis_service.analyze_site(
        site_name="Ridge A",
        **base,
    )
    second = service.analysis_service.analyze_site(
        site_name="Ridge B",
        **base,
    )

    assert len(calls) == 2
    assert first["site_name"] == "Ridge A"
    assert second["site_name"] == "Ridge B"


def test_analyze_cache_key_preserves_full_coordinate_precision(
    service,
    monkeypatch,
):
    calls = []
    _install_fake_analyze(monkeypatch, service, calls)

    base = {
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-01-02T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
        "site_name": "Precision Site",
    }

    first = service.analysis_service.analyze_site(
        lat=-89.50001,
        lon=0.0,
        **base,
    )
    second = service.analysis_service.analyze_site(
        lat=-89.50002,
        lon=0.0,
        **base,
    )

    assert len(calls) == 2
    assert first["site_id"] == second["site_id"]
    assert first["lat"] != second["lat"]


def test_analyze_cache_key_isolates_mast_height(service, monkeypatch):
    calls = []
    _install_fake_analyze(monkeypatch, service, calls)

    base = {
        "lat": -89.5,
        "lon": 0.0,
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-01-02T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }

    first = service.analysis_service.analyze_site(
        mast_height_m=1.5001,
        **base,
    )
    second = service.analysis_service.analyze_site(
        mast_height_m=1.5002,
        **base,
    )

    assert len(calls) == 2
    assert first["mast_height_m"] == 1.5001
    assert second["mast_height_m"] == 1.5002


def test_analyze_cache_hit_does_not_mutate_cached_payload(
    service,
    monkeypatch,
):
    calls = []
    _install_fake_analyze(monkeypatch, service, calls)

    base = {
        "lat": -89.5,
        "lon": 0.0,
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-01-02T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }

    first = service.analysis_service.analyze_site(**base)
    first_elapsed = first["elapsed_ms"]

    second = service.analysis_service.analyze_site(**base)

    assert second["cached"] is True
    assert first["cached"] is False
    assert first["elapsed_ms"] == first_elapsed
    assert len(calls) == 1


def test_identical_analyze_requests_hit_cache(service, monkeypatch):
    calls = []
    _install_fake_analyze(monkeypatch, service, calls)

    base = {
        "lat": -89.5,
        "lon": 0.0,
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-01-02T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }

    first = service.analysis_service.analyze_site(**base)
    second = service.analysis_service.analyze_site(**base)

    assert first["cached"] is False
    assert second["cached"] is True
    assert first["analysis_id"] == second["analysis_id"]
    assert len(calls) == 1


# ---------------------------------------------------------------------------
# Best-windows cache identity
# ---------------------------------------------------------------------------

def _install_fake_best_windows(monkeypatch, service_module, calls):
    times = ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"]

    def fake_timeseries(
        lat,
        lon,
        start,
        stop,
        step_seconds,
        alt_km=0.0,
        mast_height_m=0.0,
    ):
        calls.append((lat, lon))
        return {
            "times": times,
            "sun_azimuth_deg": [0.0, 0.0],
            "sun_elevation_deg": [10.0, 10.0],
            "earth_azimuth_deg": [0.0, 0.0],
            "earth_elevation_deg": [10.0, 10.0],
        }

    def fake_sun_visibility(*args, **kwargs):
        return {"visible": [True, True], "fraction": [1.0, 1.0]}

    def fake_earth_visibility(*args, **kwargs):
        return {"visible": [True, True], "fraction": [1.0, 1.0]}

    def fake_extract_windows(
        times_arg,
        mask,
        step_seconds=3600,
        refine_edges=False,
    ):
        return [
            {
                "start": times_arg[0],
                "end": times_arg[-1],
                "duration_hours": 24.0,
                "precision": "hourly",
            }
        ]

    monkeypatch.setattr(
        service_module.G,
        "compute_site_timeseries",
        fake_timeseries,
    )
    monkeypatch.setattr(
        service_module.V,
        "compute_sun_visibility",
        fake_sun_visibility,
    )
    monkeypatch.setattr(
        service_module.V,
        "compute_earth_visibility",
        fake_earth_visibility,
    )
    monkeypatch.setattr(
        service_module.M,
        "extract_windows_refined",
        fake_extract_windows,
    )
    monkeypatch.setattr(
        service_module.M,
        "_longest_run_hours",
        lambda *args, **kwargs: 0.0,
    )


def test_best_windows_cache_key_isolates_site_name(service, monkeypatch):
    calls = []
    _install_fake_best_windows(monkeypatch, service, calls)

    base = {
        "lat": -89.5,
        "lon": 0.0,
        "search_start_utc": "2026-01-01T00:00:00Z",
        "search_stop_utc": "2026-01-02T00:00:00Z",
        "min_window_hours": 1.0,
        "step_seconds": 3600,
        "horizon_mode": "flat",
        "top_n": 5,
    }

    first = service.analysis_service.search_best_operating_windows(
        site_name="Ridge A",
        **base,
    )
    second = service.analysis_service.search_best_operating_windows(
        site_name="Ridge B",
        **base,
    )

    assert len(calls) == 2
    assert first["site_name"] == "Ridge A"
    assert second["site_name"] == "Ridge B"


def test_best_windows_cache_key_preserves_full_coordinate_precision(
    service,
    monkeypatch,
):
    calls = []
    _install_fake_best_windows(monkeypatch, service, calls)

    base = {
        "search_start_utc": "2026-01-01T00:00:00Z",
        "search_stop_utc": "2026-01-02T00:00:00Z",
        "min_window_hours": 1.0,
        "step_seconds": 3600,
        "horizon_mode": "flat",
        "top_n": 5,
        "site_name": "Precision Site",
    }

    first = service.analysis_service.search_best_operating_windows(
        lat=-89.50001,
        lon=0.0,
        **base,
    )
    second = service.analysis_service.search_best_operating_windows(
        lat=-89.50002,
        lon=0.0,
        **base,
    )

    assert len(calls) == 2
    assert first["site_id"] == second["site_id"]
    assert first["lat"] != second["lat"]


def test_identical_best_windows_requests_hit_cache(service, monkeypatch):
    calls = []
    _install_fake_best_windows(monkeypatch, service, calls)

    base = {
        "lat": -89.5,
        "lon": 0.0,
        "search_start_utc": "2026-01-01T00:00:00Z",
        "search_stop_utc": "2026-01-02T00:00:00Z",
        "min_window_hours": 1.0,
        "step_seconds": 3600,
        "horizon_mode": "flat",
        "top_n": 5,
        "site_name": "Same Site",
    }

    first = service.analysis_service.search_best_operating_windows(**base)
    second = service.analysis_service.search_best_operating_windows(**base)

    assert first["cached"] is False
    assert second["cached"] is True
    assert len(calls) == 1


# ---------------------------------------------------------------------------
# Horizon cache identity
# ---------------------------------------------------------------------------

def _install_fake_horizon(monkeypatch, service_module, calls):
    def fake_raymarch(**kwargs):
        calls.append(kwargs)
        n_bins = int(round(360.0 / kwargs["az_step_deg"]))
        return {
            "lat": kwargs["lat"],
            "lon": kwargs["lon"],
            "h_m": kwargs["observer_height_m"],
            "dem_id": "TEST_DEM",
            "resolution_m": 20.0,
            "max_range_km": kwargs["max_range_km"],
            "az_step": kwargs["az_step_deg"],
            "mask_deg": [0.0] * n_bins,
            "coverage_status": "full",
            "max_valid_range_km": [kwargs["max_range_km"]] * n_bins,
            "site_height_m": 0.0,
            "method": "ray_march",
            "generated": "2026-01-01T00:00:00Z",
        }

    monkeypatch.setattr(
        service_module.H,
        "compute_horizon_raymarch",
        fake_raymarch,
    )


def test_horizon_cache_key_preserves_full_coordinate_precision(
    service,
    monkeypatch,
):
    calls = []
    _install_fake_horizon(monkeypatch, service, calls)

    first = service.analysis_service.get_horizon_mask(
        lat=-89.50001,
        lon=0.0,
    )
    second = service.analysis_service.get_horizon_mask(
        lat=-89.50002,
        lon=0.0,
    )

    assert len(calls) == 2
    assert first["lat"] == -89.50001
    assert second["lat"] == -89.50002


def test_horizon_cache_key_isolates_mast_height(service, monkeypatch):
    calls = []
    _install_fake_horizon(monkeypatch, service, calls)

    first = service.analysis_service.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        mast_height_m=1.5001,
    )
    second = service.analysis_service.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        mast_height_m=1.5002,
    )

    assert len(calls) == 2
    assert first["h_m"] == 1.5001
    assert second["h_m"] == 1.5002


def test_horizon_cache_key_isolates_max_range_and_azimuth_step(
    service,
    monkeypatch,
):
    calls = []
    _install_fake_horizon(monkeypatch, service, calls)
    svc = service.analysis_service

    svc.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        mast_height_m=1.5,
        max_range_km=50.0,
        az_step_deg=1.0,
    )
    svc.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        mast_height_m=1.5,
        max_range_km=50.04,
        az_step_deg=1.0,
    )
    svc.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        mast_height_m=1.5,
        max_range_km=50.0,
        az_step_deg=1.004,
    )

    assert len(calls) == 3


def test_horizon_cache_key_distinguishes_none_and_auto_dem_id(
    service,
    monkeypatch,
):
    calls = []
    _install_fake_horizon(monkeypatch, service, calls)

    service.analysis_service.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        preferred_dem_id=None,
    )
    service.analysis_service.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        preferred_dem_id="auto",
    )

    assert len(calls) == 2
    assert [call["preferred_dem_id"] for call in calls] == [None, "auto"]


def test_identical_horizon_requests_hit_cache(service, monkeypatch):
    calls = []
    _install_fake_horizon(monkeypatch, service, calls)

    first = service.analysis_service.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        mast_height_m=1.5,
        max_range_km=50.0,
        az_step_deg=1.0,
    )
    second = service.analysis_service.get_horizon_mask(
        lat=-89.5,
        lon=0.0,
        mast_height_m=1.5,
        max_range_km=50.0,
        az_step_deg=1.0,
    )

    assert len(calls) == 1
    assert second["h_m"] == first["h_m"]
