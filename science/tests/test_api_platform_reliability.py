"""
Regression tests for API/platform reliability fixes.

These tests are intentionally narrow: they cover request correlation, response
compression, DEM-selection error handling, and cache-key isolation without
changing or weakening the scientific invariants asserted elsewhere.
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


def test_request_id_is_echoed(client):
    """Client-supplied request IDs must be preserved in the response header."""
    response = client.get("/api/health", headers={"X-Request-ID": "platform-regression-123"})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "platform-regression-123"


def test_gzip_compression_for_large_json(client):
    """Large JSON responses must be gzip-compressed when the client accepts it."""
    response = client.get("/api/sites", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"


@pytest.mark.needs_kernels
def test_verify_network_failure_returns_structured_error(client, monkeypatch):
    """JPL Horizons outages retain the documented 200 diagnostic payload contract."""
    import requests

    def fail(*args, **kwargs):
        raise requests.ConnectionError("simulated offline network")

    monkeypatch.setattr(requests, "get", fail)
    response = client.post(
        "/api/verify",
        json={"lat": -80.13, "lon": 1.44, "utc": "2026-02-15T00:00:00Z"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert "communication failed" in data["detail"].lower()


def test_horizon_preferred_dem_unavailable_returns_503(client, monkeypatch):
    """Selecting a DEM that is not installed must return 503, not an import error."""
    from api import routes

    monkeypatch.setattr(routes.T, "DEM_CATALOGUE", {})
    response = client.post(
        "/api/horizon",
        json={"lat": -89.5, "lon": 0.0, "preferred_dem_id": "LDEM_64"},
    )
    assert response.status_code == 503
    assert "not available" in response.json()["detail"].lower()


def test_horizon_cache_key_includes_preferred_dem(monkeypatch):
    """Different preferred DEMs must not share the same cached horizon mask."""
    from api.services import analysis_service as service_module

    service_module.horizon_cache.clear()
    calls = []

    def fake_raymarch(**kwargs):
        preferred = kwargs.get("preferred_dem_id")
        calls.append(preferred)
        return {
            "dem_id": preferred,
            "coverage_status": "full",
            "site_height_m": 0.0,
            "horizon_deg": [0.0] * 360,
            "azimuth_deg": list(range(360)),
        }

    monkeypatch.setattr(service_module.H, "compute_horizon_raymarch", fake_raymarch)

    mask_a = service_module.analysis_service.get_horizon_mask(
        lat=-89.5, lon=0.0, preferred_dem_id="DEM_A"
    )
    mask_b = service_module.analysis_service.get_horizon_mask(
        lat=-89.5, lon=0.0, preferred_dem_id="DEM_B"
    )

    assert mask_a["dem_id"] == "DEM_A"
    assert mask_b["dem_id"] == "DEM_B"
    assert calls == ["DEM_A", "DEM_B"]
    service_module.horizon_cache.clear()
