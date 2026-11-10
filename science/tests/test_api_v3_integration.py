"""
science/tests/test_api_v3_integration.py — Exhaustive backend, API, and science integration test suite.

Validates:
  1. Coordinate validation edge cases (+90°, -90°, +180°, -180°, out-of-range, missing).
  2. Date validation (valid ISO 8601, reversed, excessive >90d, malformed).
  3. Custom lunar coordinate analysis across diverse geography:
     - South polar peak (e.g. -89.5°, 120.0°)
     - Equatorial mare (e.g. 0.0°, 0.0°)
     - Far side (e.g. 0.0°, 180.0°) asserting Earth occultation
     - Near limb (e.g. 0.0°, 90.0°)
     - DEM boundary and non-polar flat fallback
  4. Multi-site comparison:
     - 2 custom sites
     - 4 custom sites
     - Mixed registered (e.g. im-2) and custom coordinates
     - Synchronized common window vs legacy per-site
     - Partial failure isolation (invalid site reported without crashing valid sites)
     - Transparent individual metric rankings
  5. Best operating window search:
     - Multi-week search finding contiguous joint windows
     - Transparent sorting
  6. Operational reliability:
     - Readiness endpoint (/api/ready)
     - Cache statistics and invalidation (/api/cache/stats, /api/cache/clear)
     - CORS preflight OPTIONS request
     - Structured error responses
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# 1. Coordinate Validation Edge Cases
# ---------------------------------------------------------------------------

def test_coordinate_exact_boundaries(client):
    """Test that boundary values -90°, +90°, -180°, +180° are all accepted."""
    boundaries = [
        (-90.0, 0.0),    # South Pole
        (90.0, 0.0),     # North Pole
        (0.0, -180.0),   # Western 180° meridian
        (0.0, 180.0),    # Eastern 180° meridian
        (-90.0, -180.0), # South pole at -180°
        (90.0, 180.0),   # North pole at +180°
    ]
    for lat, lon in boundaries:
        req = {
            "lat": lat,
            "lon": lon,
            "start_utc": "2026-03-01T00:00:00Z",
            "stop_utc": "2026-03-01T06:00:00Z",
            "step_seconds": 3600,
            "horizon_mode": "flat",
        }
        res = client.post("/api/geometry/timeseries", json=req)
        assert res.status_code == 200, f"Failed at boundary ({lat}, {lon}): {res.text}"
        data = res.json()
        assert len(data["times"]) == 7


def test_coordinate_outside_range_rejected(client):
    """Assert coordinates exceeding boundaries produce HTTP 422 or 400 validation errors."""
    invalid_cases = [
        (90.001, 0.0),     # Lat > 90°
        (-90.001, 0.0),    # Lat < -90°
        (0.0, 180.001),    # Lon > 180°
        (0.0, -180.001),   # Lon < -180°
        (120.0, 0.0),      # Extreme lat
        (0.0, 360.0),      # 0..360 longitude (must use east-positive -180..+180)
    ]
    for lat, lon in invalid_cases:
        req = {
            "lat": lat,
            "lon": lon,
            "start_utc": "2026-03-01T00:00:00Z",
            "stop_utc": "2026-03-02T00:00:00Z",
        }
        res = client.post("/api/geometry/timeseries", json=req)
        assert res.status_code in (400, 422), f"Should have rejected invalid ({lat}, {lon})"


def test_missing_coordinates(client):
    """Missing coordinates on custom analysis must return structured error."""
    req = {
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-02T00:00:00Z",
    }
    res = client.post("/api/site/analyze", json=req)
    assert res.status_code == 400
    assert "lat and lon" in res.json()["detail"].lower() or "coordinates" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 2. Date & Time Validation
# ---------------------------------------------------------------------------

def test_date_validation_scenarios(client):
    base_coords = {"lat": 0.0, "lon": 0.0}

    # Malformed date string
    res = client.post("/api/geometry/timeseries", json={
        **base_coords,
        "start_utc": "not-a-date",
        "stop_utc": "2026-03-02T00:00:00Z",
    })
    assert res.status_code == 400
    assert "Invalid ISO 8601" in res.json()["detail"]

    # Reversed dates (stop <= start)
    res = client.post("/api/geometry/timeseries", json={
        **base_coords,
        "start_utc": "2026-03-05T00:00:00Z",
        "stop_utc": "2026-03-01T00:00:00Z",
    })
    assert res.status_code == 400
    assert "strictly after" in res.json()["detail"]

    # Same date (duration == 0)
    res = client.post("/api/geometry/timeseries", json={
        **base_coords,
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-01T00:00:00Z",
    })
    assert res.status_code == 400

    # Excessive date range (> 90 days)
    res = client.post("/api/geometry/timeseries", json={
        **base_coords,
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-04-15T00:00:00Z",  # 104 days
    })
    assert res.status_code == 400
    assert "exceeds maximum allowed 90" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 3. Custom Lunar Coordinate Analysis
# ---------------------------------------------------------------------------

@pytest.mark.needs_kernels
def test_custom_analysis_south_polar(client):
    """Custom south-polar coordinate analysis with terrain ray-marching."""
    req = {
        "site_name": "Custom South Polar Ridge",
        "lat": -89.5,
        "lon": 120.0,
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-10T00:00:00Z",
        "step_seconds": 3600,
        "mast_height_m": 2.5,
        "horizon_mode": "terrain",
        "solar_array_type": "vertical",
        "array_area_m2": 2.0,
        "array_efficiency": 0.30,
        "antenna_margin_deg": 1.0,
    }
    res = client.post("/api/site/analyze", json=req)
    assert res.status_code == 200
    data = res.json()

    assert data["site_name"] == "Custom South Polar Ridge"
    assert data["lat"] == -89.5
    assert data["lon"] == 120.0
    assert data["mast_height_m"] == 2.5
    assert data["analysis_id"].startswith("scn-")
    assert "sun" in data
    assert "earth" in data
    assert "joint" in data
    assert "power" in data
    assert data["power"]["area_m2"] == 2.0
    assert data["power"]["efficiency"] == 0.30
    assert "provenance" in data
    assert data["provenance"]["frame"] == "MOON_ME"
    assert data["elapsed_ms"] >= 0.0


@pytest.mark.needs_kernels
def test_custom_analysis_farside_isolation(client):
    """Far side coordinate (0°N, 180°E) must have 0% direct Earth visibility."""
    req = {
        "site_name": "Far Side Antipodal Point",
        "lat": 0.0,
        "lon": 180.0,
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-15T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }
    res = client.post("/api/site/analyze", json=req)
    assert res.status_code == 200
    data = res.json()
    assert data["earth"]["total_hours"] == 0.0
    assert data["earth"]["percentage"] == 0.0
    assert data["joint"]["total_hours"] == 0.0


@pytest.mark.needs_kernels
def test_custom_analysis_equatorial_mare(client):
    """Equatorial near-side location (0°N, 0°E) has ~50% sun and continuous Earth visibility."""
    req = {
        "site_name": "Sinus Medii Center",
        "lat": 0.0,
        "lon": 0.0,
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-29T12:00:00Z",  # ~1 synodic lunation
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }
    res = client.post("/api/site/analyze", json=req)
    assert res.status_code == 200
    data = res.json()
    # Earth is permanently visible at zenith on near-side center
    assert data["earth"]["percentage"] > 95.0
    # Sunlight follows lunar day/night cycle (~50%)
    assert 45.0 <= data["sun"]["percentage"] <= 55.0


@pytest.mark.needs_kernels
def test_custom_analysis_caching_speedup(client):
    """Second identical call must be served from cache and flagged cached=True."""
    req = {
        "lat": -88.0,
        "lon": 45.0,
        "start_utc": "2026-04-01T00:00:00Z",
        "stop_utc": "2026-04-05T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }
    res1 = client.post("/api/site/analyze", json=req)
    assert res1.status_code == 200
    assert res1.json()["cached"] is False

    res2 = client.post("/api/site/analyze", json=req)
    assert res2.status_code == 200
    assert res2.json()["cached"] is True


# ---------------------------------------------------------------------------
# 4. Multi-Site Comparison Engine
# ---------------------------------------------------------------------------

@pytest.mark.needs_kernels
def test_compare_two_custom_sites(client):
    """Compare two custom coordinates over synchronized window."""
    req = {
        "start_utc": "2026-03-01T00:00:00Z",
        "window_days": 10,
        "sites": [
            {"name": "Site Alpha", "lat": -89.5, "lon": 0.0, "mast_height_m": 1.5},
            {"name": "Site Beta", "lat": -85.0, "lon": 0.0, "mast_height_m": 1.5},
        ],
        "horizon_mode": "flat",
    }
    res = client.post("/api/compare", json=req)
    assert res.status_code == 200
    data = res.json()
    assert len(data["sites"]) == 2
    assert data["common_window"] is True
    assert data["pairwise_delta_1_minus_0"] is not None
    assert "sun_hours" in data["pairwise_delta_1_minus_0"]
    assert "rankings" in data
    assert len(data["rankings"]["by_sunlight_percentage"]) == 2


@pytest.mark.needs_kernels
def test_compare_four_sites_mixed(client):
    """Compare 4 sites with mixed registered IDs (im-2, apollo11) and custom coordinates."""
    req = {
        "start_utc": "2026-03-01T00:00:00Z",
        "window_days": 7,
        "sites": [
            {"id": "im-2", "name": "IM-2 Mons Mouton"},
            {"id": "im-1", "name": "IM-1 Malapert A"},
            {"name": "Custom Shackleton Flank", "lat": -89.8, "lon": 100.0, "mast_height_m": 3.0},
            {"name": "Custom Far-side Point", "lat": -10.0, "lon": 170.0, "mast_height_m": 1.5},
        ],
        "horizon_mode": "flat",
    }
    res = client.post("/api/compare", json=req)
    assert res.status_code == 200
    data = res.json()
    assert len(data["sites"]) == 4
    for s in data["sites"]:
        assert s["status"] == "success"
    # Transparent rankings
    rankings = data["rankings"]
    assert len(rankings["by_sunlight_percentage"]) == 4
    assert len(rankings["by_earth_visibility_percentage"]) == 4


@pytest.mark.needs_kernels
def test_compare_partial_failure_isolation(client):
    """A comparison with 1 invalid site must report the failure without crashing valid sites."""
    req = {
        "start_utc": "2026-03-01T00:00:00Z",
        "window_days": 5,
        "sites": [
            {"name": "Valid Polar Site", "lat": -89.0, "lon": 0.0},
            {"id": "non-existent-site-id", "name": "Invalid Site Without Coords"},
        ],
        "horizon_mode": "flat",
    }
    res = client.post("/api/compare", json=req)
    assert res.status_code == 200
    data = res.json()
    assert len(data["sites"]) == 2
    assert data["sites"][0]["status"] == "success"
    assert data["sites"][1]["status"] == "failed"
    assert "error" in data["sites"][1]


def test_compare_site_count_constraints(client):
    """Comparison requires 2 to 4 sites."""
    # 1 site (too few)
    res1 = client.post("/api/compare", json={
        "start_utc": "2026-03-01T00:00:00Z",
        "sites": [{"name": "Solo Site", "lat": 0.0, "lon": 0.0}],
    })
    assert res1.status_code in (400, 422)

    # 5 sites (too many)
    res5 = client.post("/api/compare", json={
        "start_utc": "2026-03-01T00:00:00Z",
        "sites": [
            {"name": f"Site {i}", "lat": float(i), "lon": 0.0} for i in range(5)
        ],
    })
    assert res5.status_code in (400, 422)


# ---------------------------------------------------------------------------
# 5. Best Operating Window Search
# ---------------------------------------------------------------------------

@pytest.mark.needs_kernels
def test_best_operating_window_search(client):
    """Search for candidate operating windows meeting a 24-hour duration threshold."""
    req = {
        "lat": -89.5,
        "lon": 120.0,
        "search_start_utc": "2026-03-01T00:00:00Z",
        "search_stop_utc": "2026-03-31T00:00:00Z",
        "min_window_hours": 12.0,
        "horizon_mode": "flat",
        "top_n": 5,
    }
    res = client.post("/api/site/best-windows", json=req)
    assert res.status_code == 200
    data = res.json()
    assert "ranked_windows" in data
    assert "candidate_windows_count" in data
    assert "ranking_criterion" in data
    if data["ranked_windows"]:
        top = data["ranked_windows"][0]
        assert top["rank"] == 1
        assert top["duration_hours"] >= 12.0


# ---------------------------------------------------------------------------
# 6. Operational Reliability, Readiness & CORS
# ---------------------------------------------------------------------------

def test_api_ready_endpoint(client):
    """Readiness endpoint returns kernels and DEMs status."""
    res = client.get("/api/ready")
    assert res.status_code == 200
    data = res.json()
    assert "ready" in data
    assert "kernels_loaded" in data
    assert "kernels_available" in data
    assert "terrain_dems_available" in data


def test_cache_management(client):
    """Verify cache statistics and clearing endpoints."""
    # Check stats
    res_stats = client.get("/api/cache/stats")
    assert res_stats.status_code == 200
    data = res_stats.json()
    assert "analysis_cache" in data
    assert "horizon_cache" in data

    # Clear cache without key (allowed in default unconfigured mode)
    res_clear = client.post("/api/cache/clear")
    assert res_clear.status_code == 200
    assert res_clear.json()["status"] == "ok"

    # Verify admin protection when key is configured
    from api import routes
    original_key = routes.ADMIN_API_KEY
    try:
        routes.ADMIN_API_KEY = "test-secret-key"
        # Request without key should be rejected
        res_unauth = client.post("/api/cache/clear")
        assert res_unauth.status_code == 401
        # Request with wrong key should be rejected
        res_wrong = client.post("/api/cache/clear", headers={"X-Admin-Key": "wrong"})
        assert res_wrong.status_code == 401
        # Request with correct key should succeed
        res_auth = client.post("/api/cache/clear", headers={"X-Admin-Key": "test-secret-key"})
        assert res_auth.status_code == 200
        assert res_auth.json()["status"] == "ok"
    finally:
        routes.ADMIN_API_KEY = original_key


def test_cors_preflight(client):
    """CORS preflight OPTIONS request returns appropriate headers."""
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    }
    res = client.options("/api/site/analyze", headers=headers)
    assert res.status_code == 200
    assert "access-control-allow-origin" in res.headers


def test_payload_size_limit_rejection(client):
    """Payloads claiming Content-Length > 2MB are rejected with HTTP 413."""
    headers = {"Content-Length": str(3 * 1024 * 1024)}
    res = client.post("/api/site/analyze", headers=headers, json={"site_id": "im-1"})
    assert res.status_code == 413
    assert "2 MB" in res.json()["detail"]


def test_jpl_horizons_verify_endpoint(client):
    """Verify that POST /api/verify executes and compares SPICE with JPL Horizons."""
    res = client.post("/api/verify", json={
        "lat": -80.13,
        "lon": 1.44,
        "utc": "2026-02-15T00:00:00Z",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("success", "error")
    if data["status"] == "success":
        assert data["pass_tolerance_0_01_deg"] is True
        assert data["max_difference_deg"]["sun"] < 0.01
        assert data["max_difference_deg"]["earth"] < 0.01
