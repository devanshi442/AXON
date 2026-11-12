"""
Contract tests for AXON API response models and the published OpenAPI schema.

These tests are deliberately independent of SPICE kernels, DEM rasters, and the
live JPL Horizons service. Service calls are monkeypatched with representative
payloads so the tests assert serialization behaviour, not scientific results.
"""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from main import app


ANALYZE_REQUEST = {
    "lat": -89.5,
    "lon": 120.0,
    "start_utc": "2026-03-01T00:00:00Z",
    "stop_utc": "2026-03-02T00:00:00Z",
}

EXPECTED_ERROR_CODES = {
    ("get", "/api/health"): {500, 504},
    ("get", "/api/ready"): {500, 504},
    ("get", "/api/provenance"): {429, 500, 504},
    ("get", "/api/sites"): {429, 500, 504},
    ("get", "/api/sites/{site_id}"): {404, 422, 429, 500, 504},
    ("post", "/api/geometry/timeseries"): {400, 413, 422, 429, 500, 503, 504},
    ("post", "/api/geometry/events"): {400, 413, 422, 429, 500, 503, 504},
    ("post", "/api/horizon"): {400, 413, 422, 429, 500, 503, 504},
    ("post", "/api/site/analyze"): {400, 404, 413, 422, 429, 500, 503, 504},
    ("post", "/api/compare"): {400, 413, 422, 429, 500, 503, 504},
    ("post", "/api/site/best-windows"): {400, 404, 413, 422, 429, 500, 503, 504},
    ("post", "/api/verify"): {400, 413, 422, 429, 500, 503, 504},
    ("get", "/api/cache/stats"): {429, 500, 504},
    ("post", "/api/cache/clear"): {401, 403, 413, 422, 429, 500, 504},
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Synthetic service payloads
# ---------------------------------------------------------------------------

def _window():
    return {
        "start": "2026-03-01T00:00:00Z",
        "end": "2026-03-01T10:00:00Z",
        "start_utc": "2026-03-01T00:00:00Z",
        "end_utc": "2026-03-01T10:00:00Z",
        "duration_hours": 10.0,
        "precision": "hourly",
    }


def _body(gap_key):
    return {
        "total_hours": 10.0,
        "percentage": 41.7,
        "window_count": 1,
        "windows_count": 1,
        "longest_window_hours": 10.0,
        gap_key: 2.0,
        "windows": [_window()],
    }


def _earth():
    return {**_body("longest_dark_gap_hours"), "criterion": "center", "margin_deg": 0.0}


def _power():
    return {
        "area_m2": 1.0,
        "efficiency": 0.28,
        "orientation": "vertical",
        "total_energy_kwh": 1.0,
        "specific_energy_kwh_m2": 1.0,
        "peak_power_watts": 100.0,
        "mean_power_watts": 50.0,
        "caveat": "Geometric proxy only.",
    }


def _lunation():
    return {
        "lunation_index": 1,
        "start_utc": "2026-03-01T00:00:00Z",
        "end_utc": "2026-03-02T00:00:00Z",
        "total_hours": 24.0,
        "sun_hours": 12.0,
        "sun_percentage": 50.0,
        "earth_hours": 12.0,
        "joint_hours": 10.0,
        "longest_dark_gap_hours": 2.0,
    }


def _instantaneous():
    return {
        "utc": "2026-03-01T00:00:00Z",
        "sun_azimuth_deg": 1.0,
        "sun_elevation_deg": 2.0,
        "terrain_elevation_at_sun_deg": None,
        "earth_azimuth_deg": 3.0,
        "earth_elevation_deg": 4.0,
        "sun_visible": True,
        "earth_visible": True,
    }


def _analyze_payload():
    return {
        "analysis_id": "scn-test",
        "site_id": "custom--89.5000-+120.0000",
        "site_name": "Custom",
        "lat": -89.5,
        "lon": 120.0,
        "mast_height_m": 1.5,
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-02T00:00:00Z",
        "total_period_hours": 24.0,
        "horizon_mode": "flat_fallback",
        "dem_id": None,
        "coverage_status": "unavailable",
        "coverage_tier": "T3",
        "tier": "T3",
        "site_origin": "user_defined",
        "site_elevation_m": None,
        "instantaneous": _instantaneous(),
        "sun": _body("longest_dark_gap_hours"),
        "earth": _earth(),
        "joint": _body("longest_joint_gap_hours"),
        "power": _power(),
        "flat": {"sun": _body("longest_dark_gap_hours")},
        "terrain": None,
        "delta_terrain_minus_flat": None,
        "lunations": [_lunation()],
        "best_lunation": _lunation(),
        "worst_lunation": _lunation(),
        "provenance": {"frame": "MOON_ME"},
        "api_version": "0.3.0",
        "reproducibility": {"step_seconds": 3600},
        "warnings": [],
        "limitations": ["Geometric line of sight only."],
        "caveats": ["Not an RF link budget."],
        "elapsed_ms": 1.0,
        "cached": False,
    }


def _compare_payload():
    site = {
        "id": "a",
        "name": "A",
        "status": "success",
        "lat": -89.5,
        "lon": 120.0,
        "utc": "2026-03-01T00:00:00Z",
        "mast_height_m": 1.5,
        "dem_id": None,
        "coverage_status": "idealized",
        "coverage_tier": "T3",
        "tier": "T3",
        "site_elevation_m": None,
        "instantaneous": _instantaneous(),
        "flat": {},
        "terrain": None,
        "delta_terrain_minus_flat": None,
        "power": _power(),
        "site_origin": "user_defined",
    }
    return {
        "sites": [site, dict(site, id="b", name="B")],
        "baseline_site_id": "a",
        "deltas_vs_baseline": {"a": {"site_name": "A", "sun_hours": 0.0}},
        "pairwise_delta_1_minus_0": {"sun_hours": 1.0},
        "rankings": {
            "by_sunlight_percentage": ["A", "B"],
            "by_earth_visibility_percentage": ["A", "B"],
            "by_joint_availability_hours": ["A", "B"],
            "by_shortest_dark_gap": ["A", "B"],
            "by_solar_energy": ["A", "B"],
        },
        "window_days": 1,
        "common_window": True,
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-02T00:00:00Z",
        "threshold_deg": 0.0,
        "antenna_margin_deg": 0.0,
        "solar_array_type": "vertical",
        "warnings": [],
        "limitations": ["Geometric line of sight only."],
        "caveats": ["Not an RF link budget."],
        "elapsed_ms": 1.0,
        "reproducibility": {"step": 3600},
        "api_version": "0.3.0",
        "cached": False,
    }


def _ranked_window():
    return {
        "rank": 1,
        "is_tie": False,
        "start_utc": "2026-03-01T00:00:00Z",
        "end_utc": "2026-03-02T00:00:00Z",
        "duration_hours": 24.0,
        "duration_days": 1.0,
        "sun_availability_hours": 24.0,
        "earth_visibility_hours": 24.0,
        "longest_dark_gap_hours": 0.0,
        "precision": "hourly",
    }


def _window_payload(empty=False):
    windows = [] if empty else [_ranked_window()]
    return {
        "status": "success",
        "site_id": "custom--89.5000-+120.0000",
        "site_name": "Custom",
        "site_origin": "user_defined",
        "lat": -89.5,
        "lon": 120.0,
        "search_start_utc": "2026-03-01T00:00:00Z",
        "search_stop_utc": "2026-03-02T00:00:00Z",
        "min_window_hours": 24.0,
        "horizon_mode": "flat",
        "dem_id": None,
        "coverage_tier": "T3",
        "tier": "T3",
        "candidate_windows_count": len(windows),
        "total_candidates_found": len(windows),
        "ranked_windows": windows,
        "windows": windows,
        "ranking_criterion": "Duration then dark gap.",
        "ranking_criteria": ["duration_hours DESC"],
        "tie_handling": "Equal duration and gap share a rank.",
        "elapsed_ms": 1.0,
        "cached": False,
    }


def _events_payload():
    return {
        "mode": "flat",
        "coverage_status": "idealized",
        "dem_id": None,
        "total_period_hours": 24.0,
        "sun": _body("longest_dark_gap_hours"),
        "earth": _earth(),
        "joint": _body("longest_joint_gap_hours"),
        "power": _power(),
        "lunations": [_lunation()],
        "best_lunation": _lunation(),
        "worst_lunation": _lunation(),
    }


# ---------------------------------------------------------------------------
# OpenAPI contract
# ---------------------------------------------------------------------------

def test_every_path_documents_a_200_response_schema():
    spec = app.openapi()
    assert len(spec["paths"]) == 14
    for path, methods in spec["paths"].items():
        for method, operation in methods.items():
            response = operation["responses"].get("200")
            assert response is not None, f"{method.upper()} {path} lacks a 200 response"
            schema = response.get("content", {}).get("application/json", {}).get("schema")
            assert schema, f"{method.upper()} {path} lacks a 200 JSON schema"


def test_error_envelope_component_is_published():
    spec = app.openapi()
    assert "ErrorEnvelope" in spec["components"]["schemas"]
    assert "ErrorInfo" in spec["components"]["schemas"]


def test_no_http_validation_error_component_is_emitted():
    assert "HTTPValidationError" not in json.dumps(app.openapi())


def test_documented_error_codes_match_contract():
    spec = app.openapi()
    for (method, path), expected in EXPECTED_ERROR_CODES.items():
        responses = spec["paths"][path][method]["responses"]
        actual = {int(code) for code in responses if code.isdigit() and int(code) >= 400}
        assert actual == expected, f"{method.upper()} {path}: {sorted(actual)} != {sorted(expected)}"


def test_openapi_artifact_matches_application():
    artifact = json.loads((ROOT / "openapi.json").read_text(encoding="utf-8"))
    assert artifact == app.openapi(), "openapi.json is stale; regenerate it from api.main:app"


# ---------------------------------------------------------------------------
# Response-field preservation
# ---------------------------------------------------------------------------

def test_analyze_response_preserves_all_payload_fields(client, monkeypatch):
    from api import routes

    payload = _analyze_payload()
    monkeypatch.setattr(routes.analysis_service, "analyze_site", lambda **kwargs: payload)

    response = client.post("/api/site/analyze", json=ANALYZE_REQUEST)
    assert response.status_code == 200
    data = response.json()

    assert set(payload) <= set(data)
    assert data["limitations"] == payload["limitations"]
    assert data["caveats"] == payload["caveats"]
    assert data["reproducibility"] == payload["reproducibility"]
    assert data["api_version"] == payload["api_version"]
    assert data["sun"]["window_count"] == data["sun"]["windows_count"] == 1
    assert data["joint"]["longest_joint_gap_hours"] == 2.0
    assert data["joint"]["longest_dark_gap_hours"] is None


def test_compare_response_preserves_limitations_and_caveats(client, monkeypatch):
    from api import routes

    payload = _compare_payload()
    monkeypatch.setattr(routes.analysis_service, "compare_sites", lambda **kwargs: payload)

    response = client.post(
        "/api/compare",
        json={"sites": [{"id": "a"}, {"id": "b"}], "start_utc": "2026-03-01T00:00:00Z"},
    )
    assert response.status_code == 200
    data = response.json()

    assert set(payload) <= set(data)
    assert data["limitations"] == payload["limitations"]
    assert data["caveats"] == payload["caveats"]
    assert data["cached"] is False


def test_best_windows_preserves_alias_fields(client, monkeypatch):
    from api import routes

    payload = _window_payload()
    monkeypatch.setattr(
        routes.analysis_service,
        "search_best_operating_windows",
        lambda **kwargs: payload,
    )

    response = client.post(
        "/api/site/best-windows",
        json={
            "lat": -89.5,
            "lon": 120.0,
            "search_start_utc": "2026-03-01T00:00:00Z",
            "search_stop_utc": "2026-03-02T00:00:00Z",
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert set(payload) <= set(data)
    assert data["status"] == "success"
    assert data["candidate_windows_count"] == data["total_candidates_found"] == 1
    assert data["windows"] == data["ranked_windows"]
    assert data["cached"] is False


def test_best_windows_preserves_empty_result_fields(client, monkeypatch):
    from api import routes

    payload = _window_payload(empty=True)
    monkeypatch.setattr(
        routes.analysis_service,
        "search_best_operating_windows",
        lambda **kwargs: payload,
    )

    response = client.post(
        "/api/site/best-windows",
        json={
            "lat": -89.5,
            "lon": 120.0,
            "search_start_utc": "2026-03-01T00:00:00Z",
            "search_stop_utc": "2026-03-02T00:00:00Z",
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert set(payload) <= set(data)
    assert data["candidate_windows_count"] == data["total_candidates_found"] == 0
    assert data["windows"] == data["ranked_windows"] == []


def test_events_response_preserves_all_payload_fields(client, monkeypatch):
    from api import routes

    payload = _events_payload()
    monkeypatch.setattr(routes.analysis_service, "require_kernels", lambda: None)
    monkeypatch.setattr(routes.G, "compute_site_timeseries", lambda *args, **kwargs: {})
    monkeypatch.setattr(routes.M, "compute_comprehensive_metrics", lambda **kwargs: dict(payload))

    response = client.post(
        "/api/geometry/events",
        json={
            "lat": -89.5,
            "lon": 120.0,
            "start_utc": "2026-03-01T00:00:00Z",
            "stop_utc": "2026-03-02T00:00:00Z",
            "horizon_mode": "flat",
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert set(payload) <= set(data)
    assert data["horizon_mode"] == "flat"
    assert data["joint"]["longest_joint_gap_hours"] == 2.0


def test_site_registry_responses_are_typed(client):
    response = client.get("/api/sites")
    assert response.status_code == 200
    data = response.json()

    assert {"count", "sites", "skipped_sites"} <= set(data)
    assert data["count"] == len(data["sites"])
    if not data["sites"]:
        pytest.skip("Site registry is empty in this checkout.")

    first = data["sites"][0]
    assert {
        "id",
        "name",
        "kind",
        "lat",
        "lon",
        "coord_status",
        "coord_kind",
        "uncertainty_km",
        "verified",
        "source_urls",
        "terrain_tier",
        "metadata",
    } <= set(first)

    detail = client.get(f"/api/sites/{first['id']}")
    assert detail.status_code == 200
    detail_data = detail.json()
    assert set(first) <= set(detail_data)
    assert set(detail_data["precomputed_assets"]) == {"horizon", "timeseries", "summary", "events"}


def test_provenance_and_cache_stats_responses_are_typed(client):
    provenance = client.get("/api/provenance")
    assert provenance.status_code == 200
    assert {
        "service",
        "version",
        "frame",
        "time_scale",
        "abcorr",
        "moon_radius_km",
        "sun_angular_radius_deg",
        "earth_angular_radius_deg",
        "horizon_modes",
        "terrain_tiers",
        "kernels",
        "kernels_loaded",
        "benchmark",
        "caveats",
    } <= set(provenance.json())

    cache = client.get("/api/cache/stats")
    assert cache.status_code == 200
    assert {
        "size",
        "maxsize",
        "ttl_seconds",
        "hits",
        "misses",
        "total_lookups",
        "hit_ratio",
        "evictions",
    } <= set(cache.json()["analysis_cache"])


# ---------------------------------------------------------------------------
# /api/verify: both HTTP 200 shapes
# ---------------------------------------------------------------------------

def test_verify_success_shape(client, monkeypatch):
    from api import routes
    import requests

    class FakeResponse:
        text = "$$SOE\n2026-Mar-01 00:00, 1, 1, 10.000, 5.000\n$$EOE"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(routes.analysis_service, "require_kernels", lambda: None)
    monkeypatch.setattr(
        routes.G,
        "site_to_enu",
        lambda *args, **kwargs: ((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
    )
    monkeypatch.setattr(routes.G.spice, "str2et", lambda utc: 0.0)
    monkeypatch.setattr(routes.G, "compute_topocentric_az_el", lambda *args, **kwargs: (10.0, 5.0))
    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: FakeResponse())

    response = client.post(
        "/api/verify",
        json={"lat": -80.0, "lon": 1.0, "utc": "2026-03-01T00:00:00Z"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "success"
    assert data["max_difference_deg"] == {"sun": 0.0, "earth": 0.0}
    assert data["pass_tolerance_0_01_deg"] is True
    assert set(data["spice"]) == {"sun", "earth"}
    assert set(data["horizons"]) == {"sun", "earth"}


def test_verify_diagnostic_error_shape(client, monkeypatch):
    from api import routes
    import requests

    def fail(*args, **kwargs):
        raise requests.ConnectionError("simulated offline network")

    monkeypatch.setattr(routes.analysis_service, "require_kernels", lambda: None)
    monkeypatch.setattr(
        routes.G,
        "site_to_enu",
        lambda *args, **kwargs: ((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
    )
    monkeypatch.setattr(routes.G.spice, "str2et", lambda utc: 0.0)
    monkeypatch.setattr(routes.G, "compute_topocentric_az_el", lambda *args, **kwargs: (10.0, 5.0))
    monkeypatch.setattr(requests, "get", fail)

    response = client.post(
        "/api/verify",
        json={"lat": -80.0, "lon": 1.0, "utc": "2026-03-01T00:00:00Z"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "error"
    assert "communication failed" in data["detail"].lower()
    assert data["note"]


# ---------------------------------------------------------------------------
# Framework-level error envelopes
# ---------------------------------------------------------------------------

def test_unknown_route_returns_error_envelope(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    body = response.json()

    assert "detail" in body and "error" in body
    assert body["error"]["code"] == "HTTP_404"
    assert body["error"]["request_id"]
    assert body["error"]["path"] == "/api/does-not-exist"


def test_method_not_allowed_returns_error_envelope(client):
    response = client.get("/api/site/analyze")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "HTTP_405"


def test_validation_error_returns_error_envelope(client):
    response = client.post("/api/site/analyze", json={"lat": 999.0})
    assert response.status_code == 422
    body = response.json()

    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["field"]
    assert isinstance(body["detail"], list)
