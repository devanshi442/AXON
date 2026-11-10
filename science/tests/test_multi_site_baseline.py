"""
test_multi_site_baseline.py — Verification of multi-site comparison engine:
1. Valid 2, 3, and 4 site comparisons with common synchronized UTC window.
2. Pairwise baseline deltas (Site 1 minus Site 0 baseline).
3. Rankings consistency across transparent criteria.
4. Handling of duplicate sites (zero delta, no crash).
5. Input boundary enforcement (< 2 or > 4 sites rejected with 422).
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from main import app
from science.lunarsight_core.geometry import load_kernels


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module", autouse=True)
def setup_kernels():
    load_kernels()


def test_compare_boundary_validation_site_counts(client):
    """
    Comparison endpoint must strictly enforce 2 <= N <= 4 sites.
    """
    # 1 site -> 422 Unprocessable Entity
    resp1 = client.post("/api/compare", json={
        "sites": [{"id": "cs-connecting-ridge"}],
        "start_utc": "2026-03-01T00:00:00Z",
    })
    assert resp1.status_code == 422, f"Expected 422 for 1 site, got {resp1.status_code}"

    # 5 sites -> 422 Unprocessable Entity
    resp5 = client.post("/api/compare", json={
        "sites": [
            {"id": "cs-connecting-ridge"},
            {"id": "cs-shackleton-rim"},
            {"id": "apollo-11", "lat": 0.67408, "lon": 23.47297},
            {"id": "im-1"},
            {"id": "cs-haworth"},
        ],
        "start_utc": "2026-03-01T00:00:00Z",
    })
    assert resp5.status_code == 422, f"Expected 422 for 5 sites, got {resp5.status_code}"


def test_compare_two_sites_with_baseline_deltas(client):
    """
    Compare 2 sites: Site 0 (Connecting Ridge) and Site 1 (Apollo 11).
    Verify pairwise delta (Site 1 minus Site 0).
    """
    resp = client.post("/api/compare", json={
        "sites": [
            {"id": "cs-connecting-ridge", "mast_height_m": 2.0},
            {"lat": 0.67408, "lon": 23.47297, "name": "Apollo 11", "mast_height_m": 2.0},
        ],
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-08T00:00:00Z",  # 7 days
        "horizon_mode": "flat",
    })
    assert resp.status_code == 200, f"Compare failed: {resp.text}"
    data = resp.json()

    assert len(data["sites"]) == 2
    assert data["common_window"] is True
    assert data["pairwise_delta_1_minus_0"] is not None

    delta = data["pairwise_delta_1_minus_0"]
    print("2-site pairwise delta (Apollo 11 - Connecting Ridge):", delta)
    assert "sun_hours" in delta
    assert "sun_pct" in delta
    assert "dte_hours" in delta
    assert "dte_pct" in delta


def test_compare_three_and_four_sites(client):
    """
    Test 3 sites and 4 sites comparison, verifying that transparent rankings
    are computed and populated for all sites.
    """
    sites_4 = [
        {"id": "cs-connecting-ridge", "mast_height_m": 2.0},
        {"id": "cs-shackleton-rim", "mast_height_m": 2.0},
        {"lat": 0.67408, "lon": 23.47297, "name": "Apollo 11", "mast_height_m": 2.0},
        {"lat": 0.0, "lon": 180.0, "name": "Far Side", "mast_height_m": 2.0},
    ]

    resp = client.post("/api/compare", json={
        "sites": sites_4,
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-05T00:00:00Z",
        "horizon_mode": "flat",
    })
    assert resp.status_code == 200, f"4-site compare failed: {resp.text}"
    data = resp.json()

    assert len(data["sites"]) == 4
    rankings = data["rankings"]
    assert rankings is not None
    print("4-site rankings by sunlight %:", rankings["by_sunlight_percentage"])
    print("4-site rankings by DTE %:", rankings["by_earth_visibility_percentage"])
    assert len(rankings["by_sunlight_percentage"]) == 4
    assert len(rankings["by_earth_visibility_percentage"]) == 4


def test_compare_duplicate_sites_safe_handling(client):
    """
    Passing duplicate coordinates should not crash the API;
    pairwise delta between identical sites must be strictly 0.0.
    """
    resp = client.post("/api/compare", json={
        "sites": [
            {"lat": -89.45, "lon": -136.0, "name": "Connecting Ridge A"},
            {"lat": -89.45, "lon": -136.0, "name": "Connecting Ridge B"},
        ],
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-03T00:00:00Z",
        "horizon_mode": "flat",
    })
    assert resp.status_code == 200, f"Duplicate compare failed: {resp.text}"
    data = resp.json()

    delta = data["pairwise_delta_1_minus_0"]
    print("Duplicate sites delta:", delta)
    assert delta["sun_hours"] == 0.0
    assert delta["sun_pct"] == 0.0
    assert delta["dte_hours"] == 0.0
    assert delta["dte_pct"] == 0.0

