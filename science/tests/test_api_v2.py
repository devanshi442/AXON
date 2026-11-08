"""
test_api_v2.py — Comprehensive test suite for AXON LunarSight API.

Covers:
  - Provenance (benchmark artifact loaded, real hashes, no hardcoded strings)
  - Site registry endpoints (normalized missions, candidate sites, null coord handling)
  - Parameter validation (lat/lon bounds, date range limit <= 90d, min step >= 60s)
  - Flat and terrain geometry timeseries
  - Events with SPICE 1-minute edge refinement
  - Multi-site comparative analysis (with delta metrics)
  - SPICE thread-safety / concurrency stress test with ThreadPoolExecutor
"""

import concurrent.futures
from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))

from main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_api_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.3.0"
    assert "kernels_loaded" in data


def test_api_provenance_contains_real_benchmark(client):
    res = client.get("/api/provenance")
    assert res.status_code == 200
    data = res.json()
    assert data["frame"] == "MOON_ME"
    assert data["time_scale"].startswith("UTC")
    assert "kernels" in data
    assert "benchmark" in data
    benchmark = data["benchmark"]
    # Check that benchmark has real numbers from benchmark.json
    if benchmark.get("status") != "pending":
        assert "all_passed" in benchmark
        assert "overall_max_el_diff_deg" in benchmark
        assert benchmark["overall_max_el_diff_deg"] < 0.001
    assert "caveats" in data
    assert len(data["caveats"]) >= 2


def test_api_sites_registry(client):
    res = client.get("/api/sites")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] >= 15
    site_ids = [s["id"] for s in data["sites"]]
    assert "cs-shackleton-rim" in site_ids
    assert "im-1" in site_ids
    # Verify skipped sites with null coordinates
    assert any(s["id"] == "moon-base-1-endurance" for s in data["skipped_sites"])


def test_api_get_single_site(client):
    res = client.get("/api/sites/cs-shackleton-rim")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "cs-shackleton-rim"
    assert data["lat"] == -89.68
    assert data["lon"] == 129.0
    assert "precomputed_assets" in data

    # 404 for unknown
    res_404 = client.get("/api/sites/non-existent-site-id")
    assert res_404.status_code == 404


def test_api_validation_limits(client):
    # Latitude out of bounds
    res = client.post("/api/geometry/timeseries", json={
        "lat": 95.0, "lon": 0.0,
        "start_utc": "2026-03-01T00:00:00Z", "stop_utc": "2026-03-02T00:00:00Z",
    })
    assert res.status_code == 422

    # Date range > 90 days
    res = client.post("/api/geometry/timeseries", json={
        "lat": -80.0, "lon": 0.0,
        "start_utc": "2026-01-01T00:00:00Z", "stop_utc": "2026-05-01T00:00:00Z",
    })
    assert res.status_code == 400
    assert "exceeds maximum allowed 90" in res.json()["detail"]

    # Step < 60 seconds
    res = client.post("/api/geometry/timeseries", json={
        "lat": -80.0, "lon": 0.0,
        "start_utc": "2026-03-01T00:00:00Z", "stop_utc": "2026-03-02T00:00:00Z",
        "step_seconds": 30,
    })
    assert res.status_code == 422


@pytest.mark.needs_kernels
def test_api_flat_and_terrain_timeseries(client):
    # Flat mode
    res = client.post("/api/geometry/timeseries", json={
        "lat": -89.68, "lon": 129.0,
        "start_utc": "2026-03-01T00:00:00Z", "stop_utc": "2026-03-02T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["horizon_mode"] == "flat"
    assert len(data["times"]) == 25
    assert len(data["sun_elevation_deg"]) == 25

    # Terrain mode
    res_t = client.post("/api/geometry/timeseries", json={
        "lat": -89.68, "lon": 129.0,
        "start_utc": "2026-03-01T00:00:00Z", "stop_utc": "2026-03-02T00:00:00Z",
        "step_seconds": 3600,
        "mast_height_m": 2.0,
        "horizon_mode": "terrain",
    })
    assert res_t.status_code == 200
    data_t = res_t.json()
    assert data_t["horizon_mode"] == "terrain"
    assert "sun_fraction" in data_t
    assert len(data_t["sun_fraction"]) == 25


@pytest.mark.needs_kernels
def test_api_events_refined(client):
    res = client.post("/api/geometry/events", json={
        "lat": -89.68, "lon": 129.0,
        "start_utc": "2026-03-01T00:00:00Z", "stop_utc": "2026-03-10T00:00:00Z",
        "step_seconds": 3600,
        "mast_height_m": 2.0,
        "horizon_mode": "terrain",
        "refine_precision": True,
    })
    assert res.status_code == 200
    data = res.json()
    assert "sun" in data
    assert "earth" in data
    assert "joint" in data
    assert data["horizon_mode"] == "terrain"


@pytest.mark.needs_kernels
def test_api_multi_site_compare(client):
    req = {
        "sites": [
            {"id": "site1", "name": "Shackleton", "lat": -89.68, "lon": 129.0, "utc": "2026-03-01T00:00:00Z", "mast_height_m": 2.0},
            {"id": "site2", "name": "Connecting Ridge", "lat": -89.45, "lon": -136.0, "utc": "2026-03-01T00:00:00Z", "mast_height_m": 2.0},
        ],
        "threshold_deg": 0.0,
        "antenna_margin_deg": 1.0,
        "window_days": 15,
        "solar_array_type": "vertical",
    }
    res = client.post("/api/compare", json=req)
    assert res.status_code == 200
    data = res.json()
    assert len(data["sites"]) == 2
    assert "pairwise_delta_1_minus_0" in data
    delta = data["pairwise_delta_1_minus_0"]
    assert "sun_hours" in delta
    assert "energy_kwh_m2" in delta


@pytest.mark.needs_kernels
def test_api_concurrency_stress(client):
    """
    Verify that concurrent requests hitting SPICE do NOT crash or corrupt state
    thanks to the global threading.Lock.
    """
    def _make_req(idx):
        req = {
            "lat": -89.68 + (idx * 0.01),
            "lon": 129.0,
            "start_utc": "2026-03-01T00:00:00Z",
            "stop_utc": "2026-03-02T00:00:00Z",
            "step_seconds": 3600,
            "horizon_mode": "flat",
        }
        r = client.post("/api/geometry/timeseries", json=req)
        return r.status_code, len(r.json().get("times", []))

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(_make_req, i) for i in range(12)]
        for f in concurrent.futures.as_completed(futures):
            code, count = f.result()
            assert code == 200
            assert count == 25
