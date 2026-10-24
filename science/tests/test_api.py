"""
test_api.py — Unit tests for the FastAPI service in api/main.py.
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))

from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_api_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_api_provenance(client):
    res = client.get("/api/provenance")
    assert res.status_code == 200
    data = res.json()
    assert data["frame"] == "MOON_ME"
    assert "kernels" in data
    assert "sun_angular_radius_deg" in data


@pytest.mark.needs_kernels
def test_api_geometry_timeseries(client):
    req = {
        "lat": -80.13,
        "lon": 1.44,
        "start_utc": "2026-03-01T00:00:00",
        "stop_utc": "2026-03-02T00:00:00",
        "step_seconds": 3600,
    }
    res = client.post("/api/geometry/timeseries", json=req)
    assert res.status_code == 200
    data = res.json()
    assert len(data["times"]) == 25
    assert len(data["sun_elevation_deg"]) == 25
    assert len(data["earth_elevation_deg"]) == 25


def test_api_invalid_coords(client):
    req = {
        "lat": 105.0,  # Invalid lat > 90
        "lon": 0.0,
        "start_utc": "2026-03-01T00:00:00",
        "stop_utc": "2026-03-02T00:00:00",
    }
    res = client.post("/api/geometry/timeseries", json=req)
    assert res.status_code == 422  # Validation error
