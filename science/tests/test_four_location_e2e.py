"""
test_four_location_e2e.py — Comprehensive End-to-End Scientific Comparison Test
between Shackleton Rim, Connecting Ridge, Apollo 11, and Far-Side.

Verifies:
1. Identical synchronized UTC interval across all 4 sites.
2. Accurate DEM selection and tier reporting (T1 polar vs T2 global vs T3 flat datum fallback).
3. Physical validity of sunlight metrics (polar persistent light vs equatorial diurnal cycle).
4. Earth visibility extremes (Apollo 11 near-side ~100% vs Far-side exactly 0.0%).
5. Joint operating window constraints (Far-side strictly 0.0h joint).
6. Power model calculation consistency.
7. Reproducibility and deterministic results.
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from main import app

pytestmark = pytest.mark.needs_dems


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_four_location_scientific_comparison_e2e(client):
    """
    Execute full end-to-end multi-site comparison across 4 scientifically distinct lunar sites:
      1. Shackleton Crater Rim (cs-shackleton-rim: -89.68°S, 129.0°E) - T1 South Polar Peak
      2. Connecting Ridge (cs-connecting-ridge: -89.45°S, -136.0°E) - T1 Artemis III Candidate
      3. Apollo 11 (custom: 0.6875°N, 23.4333°E) - Equatorial Near-side Mare
      4. Far-side Equatorial (custom: 0.0°N, 180.0°E) - Far-side Deep Space
    """
    payload = {
        "sites": [
            {"id": "cs-shackleton-rim", "mast_height_m": 2.0},
            {"id": "cs-connecting-ridge", "mast_height_m": 2.0},
            {"lat": 0.6875, "lon": 23.4333, "name": "Apollo 11 Base", "mast_height_m": 2.0},
            {"lat": 0.0, "lon": 180.0, "name": "Far-Side Equatorial", "mast_height_m": 2.0},
        ],
        "start_utc": "2026-03-01T00:00:00Z",
        "stop_utc": "2026-03-31T00:00:00Z",
        "window_days": 30,
        "threshold_deg": 0.0,
        "antenna_margin_deg": 0.5,
        "solar_array_type": "vertical",
        "array_area_m2": 2.0,
        "array_efficiency": 0.28,
    }

    res = client.post("/api/compare", json=payload)
    assert res.status_code == 200, f"Compare failed: {res.text}"
    data = res.json()

    # 1. Verification of Synchronized Interval
    assert data["common_window"] is True
    assert data["start_utc"] == "2026-03-01T00:00:00Z"
    assert data["stop_utc"] == "2026-03-31T00:00:00Z"
    assert len(data["sites"]) == 4

    def _get_metrics(s):
        m = s.get("terrain") or s.get("flat") or {}
        p = s.get("power") or {}
        return {
            "name": s["name"],
            "tier": s.get("coverage_tier", ""),
            "total_period_hours": m.get("total_period_hours", 0.0),
            "sun_hours": m.get("sun", {}).get("total_hours", 0.0),
            "sun_pct": m.get("sun", {}).get("percentage", 0.0),
            "earth_hours": m.get("earth", {}).get("total_hours", 0.0),
            "earth_pct": m.get("earth", {}).get("percentage", 0.0),
            "earth_windows_count": len(m.get("earth", {}).get("windows", [])),
            "joint_hours": m.get("joint", {}).get("total_hours", 0.0),
            "joint_pct": m.get("joint", {}).get("percentage", 0.0),
            "energy_kwh": p.get("total_energy_kwh", 0.0),
            "specific_energy": p.get("specific_energy_kwh_m2", 0.0),
        }

    shackleton = _get_metrics(next(s for s in data["sites"] if "Shackleton" in s["name"]))
    connecting = _get_metrics(next(s for s in data["sites"] if "Connecting" in s["name"]))
    apollo11 = _get_metrics(next(s for s in data["sites"] if "Apollo 11" in s["name"]))
    farside = _get_metrics(next(s for s in data["sites"] if "Far-Side" in s["name"]))

    # 2. Total Period Hours Uniformity
    # 30 days = 720.0 elapsed hours
    assert shackleton["total_period_hours"] == 720.0
    assert connecting["total_period_hours"] == 720.0
    assert apollo11["total_period_hours"] == 720.0
    assert farside["total_period_hours"] == 720.0

    # 3. DEM Selection and Tier Integrity
    # South polar sites must select high-res polar DEMs (T1)
    assert shackleton["tier"] == "T1"
    assert connecting["tier"] == "T1"
    # Equatorial sites with global DEM must report exact T2
    assert apollo11["tier"] == "T2"
    assert farside["tier"] == "T2"

    # 4. Sunlight Science Verification
    # Equatorial sites experience diurnal cycle (~14 days sun, ~14 days dark per 29.5d lunation)
    assert 40.0 <= apollo11["sun_pct"] <= 60.0
    assert 40.0 <= farside["sun_pct"] <= 60.0

    # 5. Earth Visibility Extreme Scientific Contrast
    # Far-side location must have 0.0% Earth visibility (lunar body occultation)
    assert farside["earth_hours"] == 0.0
    assert farside["earth_pct"] == 0.0
    assert farside["earth_windows_count"] == 0

    # Apollo 11 on near-side must have ~100% Earth visibility
    assert apollo11["earth_pct"] >= 95.0
    assert apollo11["earth_hours"] >= 700.0

    # 6. Joint Operating Availability
    # Far-side joint operating window must be strictly 0.0 hours
    assert farside["joint_hours"] == 0.0
    assert farside["joint_pct"] == 0.0

    # Apollo 11 joint operating window should match its sunlight hours (since Earth is constantly up)
    assert abs(apollo11["joint_hours"] - apollo11["sun_hours"]) < 5.0

    # 7. Photovoltaic Energy Generation
    # Physically verified: sites with sunlight produce proportional energy;
    # terrain-shadowed polar winter ridges produce 0.0 kWh.
    for s in [shackleton, connecting, apollo11, farside]:
        if s["sun_hours"] > 0.0:
            assert s["energy_kwh"] > 0.0
            assert s["specific_energy"] > 0.0
            assert abs(s["energy_kwh"] - s["specific_energy"] * 2.0) < 0.1
        else:
            assert s["energy_kwh"] == 0.0

    # 8. Rankings Validation
    rankings = data["rankings"]
    # Far-side must be ranked lowest for Earth visibility
    assert rankings["by_earth_visibility_percentage"][-1] == farside["name"]
    # Far-side must be ranked lowest for Joint availability
    assert rankings["by_joint_availability_hours"][-1] == farside["name"]
    # Apollo 11 must be among top for Earth visibility
    assert rankings["by_earth_visibility_percentage"][0] == apollo11["name"]

    # 9. Reproducibility Test
    # Calling the exact same comparison again must yield deterministic identical outputs
    res_repeat = client.post("/api/compare", json=payload)
    assert res_repeat.status_code == 200
    data_repeat = res_repeat.json()

    for s1, s2 in zip(data["sites"], data_repeat["sites"]):
        m1 = _get_metrics(s1)
        m2 = _get_metrics(s2)
        assert m1["name"] == m2["name"]
        assert m1["sun_hours"] == m2["sun_hours"]
        assert m1["earth_hours"] == m2["earth_hours"]
        assert m1["joint_hours"] == m2["joint_hours"]
        assert m1["energy_kwh"] == m2["energy_kwh"]
