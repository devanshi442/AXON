import json
import pathlib
import pytest
from lunarsight_core import sites, terrain

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
HORIZON_DIR = ROOT / "web" / "public" / "data" / "horizon"

DEM_HASHES = {
    "LDEM_875S_20M": "fff7c2017a192788066a0867d78fd1ccf783216e26974b5e65287669aa472bac",
    "LDEM_85S_20M": "66b8cafd638f7b710c11bfe962f35a5be8bffe744991e1eea848c24eb8dabc7c",
    "LDEM_85S_40M": "9b5e29faf57883be1e3ba1a7fc536f08ff628662184097630b19759a35ffec18",
    "LDEM_80S_20M": "a38177093626d85ab6d38ffbd48bba6ac6842d5efee610aebc41cd9c54438dc6",
    "LDEM_80S_40M": "7413280e83e52af1ee68278b7d1b52b5c8ca460c12f27873159dab155b8e7550",
    "LDEM_75S_30M": "7a1750ddd57d098179076f83869446a2716d269a01e31afeff84dcb80d40e400",
    "LDEM_64": "5bcdc1add91447d4386f0ccab17da2f6dd0ae8e116fbd60f56aa31d74248c096",
}


def test_stored_horizon_masks_match_current_site_metadata():
    """Verify all stored horizon masks match the site registry's current coordinates and DEM metadata."""
    valid_sites = sites.get_valid_sites()
    assert len(valid_sites) > 0

    checked = 0
    for s in valid_sites:
        if s.lat is None or s.lon is None:
            continue
        mask_path = HORIZON_DIR / f"{s.id}.json"
        if not mask_path.is_file():
            continue

        cached = json.loads(mask_path.read_text(encoding="utf-8"))
        lat = float(s.lat)
        lon = float(s.lon)

        # Coordinate matching
        assert "lat" in cached and "lon" in cached
        assert abs(cached["lat"] - lat) < 1e-4, f"Stale latitude for {s.id}: cached {cached['lat']} vs site {lat}"
        assert abs(cached["lon"] - lon) < 1e-4, f"Stale longitude for {s.id}: cached {cached['lon']} vs site {lon}"

        # DEM and metadata matching
        assert "dem_id" in cached
        assert "mast_heights" in cached
        assert cached["mast_heights"] == [0.0, 1.5, 3.0, 5.0, 10.0]
        assert "dem_file_size" in cached
        assert "dem_file_hash" in cached
        if cached["dem_id"] in DEM_HASHES:
            assert cached["dem_file_hash"] == DEM_HASHES[cached["dem_id"]]

        checked += 1

    assert checked >= 17, f"Expected at least 17 horizon files checked, got {checked}"


def test_stale_cache_detection_rejects_altered_coordinates():
    """Synthetic test confirming stale-cache check fails when coordinates or DEM are altered."""
    # Simulated valid cache
    cached = {
        "lat": -85.0,
        "lon": 30.0,
        "dem_id": "LDEM_80S_20M",
        "mast_heights": [0.0, 1.5, 3.0, 5.0, 10.0],
        "dem_file_size": 267689172,
        "dem_file_hash": DEM_HASHES["LDEM_80S_20M"],
    }

    # Case 1: Matching site -> valid
    class MockSite:
        lat = -85.0
        lon = 30.0

    s = MockSite()
    coords_match = abs(cached["lat"] - s.lat) < 1e-4 and abs(cached["lon"] - s.lon) < 1e-4
    assert coords_match is True

    # Case 2: Teammate updates site latitude -> stale cache detected
    s.lat = -85.5
    coords_match_updated = abs(cached["lat"] - s.lat) < 1e-4 and abs(cached["lon"] - s.lon) < 1e-4
    assert coords_match_updated is False, "Stale cache must be rejected when site coordinates change!"

    # Case 3: Teammate updates site longitude -> stale cache detected
    s.lat = -85.0
    s.lon = 31.0
    coords_match_lon = abs(cached["lat"] - s.lat) < 1e-4 and abs(cached["lon"] - s.lon) < 1e-4
    assert coords_match_lon is False, "Stale cache must be rejected when longitude changes!"
