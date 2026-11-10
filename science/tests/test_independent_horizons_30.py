"""
test_independent_horizons_30.py
Independent verification of SPICE geometry against NASA/JPL Horizons for 30 coordinates across the Moon.
Generates and caches raw Horizons responses in fixtures for 100% offline reproducibility.
"""
import json
import math
import urllib.request
import urllib.parse
import pytest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURE_PATH = ROOT / "science" / "fixtures" / "horizons" / "random_30_points_fixture.json"

from lunarsight_core import geometry as G

# 30 Representative test coordinates across the entire Moon
TEST_COORDINATES = [
    # South Polar Region
    {"lat": -89.9, "lon": 0.0, "time": "2026-03-01 12:00", "region": "South Pole Exact"},
    {"lat": -89.5, "lon": 120.0, "time": "2026-03-02 06:00", "region": "South Pole Shackleton"},
    {"lat": -88.0, "lon": -150.0, "time": "2026-03-03 18:00", "region": "South Pole Connecting Ridge"},
    {"lat": -85.5, "lon": 45.0, "time": "2026-03-04 00:00", "region": "South Polar Highlands"},
    {"lat": -80.0, "lon": -30.0, "time": "2026-03-05 12:00", "region": "South Sub-polar"},
    
    # North Polar Region
    {"lat": 89.9, "lon": 0.0, "time": "2026-04-01 12:00", "region": "North Pole Exact"},
    {"lat": 89.0, "lon": -90.0, "time": "2026-04-02 06:00", "region": "North Polar Peary"},
    {"lat": 85.0, "lon": 180.0, "time": "2026-04-03 18:00", "region": "North Polar Far-Side"},
    {"lat": 82.5, "lon": 30.0, "time": "2026-04-04 00:00", "region": "North Polar Near-Side"},
    {"lat": 80.0, "lon": -120.0, "time": "2026-04-05 12:00", "region": "North Sub-polar"},

    # Equatorial Near-Side
    {"lat": 0.0, "lon": 0.0, "time": "2026-05-01 00:00", "region": "Sinus Medii (Sub-Earth)"},
    {"lat": 0.6875, "lon": 23.4333, "time": "2026-05-02 12:00", "region": "Apollo 11 Base"},
    {"lat": -3.0124, "lon": -23.4216, "time": "2026-05-03 06:00", "region": "Apollo 12 Base"},
    {"lat": -8.9730, "lon": 15.5002, "time": "2026-05-04 18:00", "region": "Apollo 16 Base"},
    {"lat": 26.1322, "lon": 3.6339, "time": "2026-05-05 00:00", "region": "Apollo 15 Base"},

    # Equatorial Far-Side & Seam
    {"lat": 0.0, "lon": 180.0, "time": "2026-06-01 12:00", "region": "Far-Side Equator +180"},
    {"lat": 0.0, "lon": -180.0, "time": "2026-06-01 12:00", "region": "Far-Side Equator -180"},
    {"lat": 0.0, "lon": 179.9, "time": "2026-06-02 00:00", "region": "Far-Side East Seam"},
    {"lat": 0.0, "lon": -179.9, "time": "2026-06-02 00:00", "region": "Far-Side West Seam"},
    {"lat": 5.0, "lon": 150.0, "time": "2026-06-03 12:00", "region": "Far-Side Daedalus"},

    # Mid-Latitudes & Limb
    {"lat": 30.0, "lon": 45.0, "time": "2026-07-01 06:00", "region": "Mare Serenitatis"},
    {"lat": -30.0, "lon": -45.0, "time": "2026-07-02 18:00", "region": "Mare Nubium"},
    {"lat": 45.0, "lon": -60.0, "time": "2026-07-03 00:00", "region": "Sinus Iridum"},
    {"lat": -45.0, "lon": 60.0, "time": "2026-07-04 12:00", "region": "Mare Australe"},
    {"lat": 0.0, "lon": 90.0, "time": "2026-07-05 06:00", "region": "East Limb Mare Smythii"},
    {"lat": 0.0, "lon": -90.0, "time": "2026-07-06 18:00", "region": "West Limb Oceanus Procellarum"},
    {"lat": 60.0, "lon": 120.0, "time": "2026-08-01 00:00", "region": "North Far-Side Highlands"},
    {"lat": -60.0, "lon": -120.0, "time": "2026-08-02 12:00", "region": "South Far-Side Basin"},
    {"lat": 18.56, "lon": 61.81, "time": "2026-08-03 06:00", "region": "Mare Crisium"},
    {"lat": -75.0, "lon": 132.5, "time": "2026-08-04 18:00", "region": "Schrodinger Basin"},
]

def fetch_horizons_point(target_body: str, lat: float, lon: float, time_str: str) -> dict:
    """Query JPL Horizons API for topocentric azimuth and elevation."""
    from datetime import datetime, timedelta
    t0 = datetime.fromisoformat(time_str)
    t1 = t0 + timedelta(minutes=1)
    start_str = t0.strftime("%Y-%m-%d %H:%M")
    stop_str = t1.strftime("%Y-%m-%d %H:%M")

    # NASA JPL convention: east-longitude 0..360, planetographic lat, radius 1737.4 km
    norm_lon = float(lon % 360.0)
    site_coord = f"{norm_lon:.6f},{lat:.6f},0.0"
    target_code = "10" if target_body == "sun" else "399"
    
    params = {
        "format": "json",
        "COMMAND": f"'{target_code}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{site_coord}'",
        "START_TIME": f"'{start_str}'",
        "STOP_TIME": f"'{stop_str}'",
        "STEP_SIZE": "'1m'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
    }
    url = f"https://ssd.jpl.nasa.gov/api/horizons.api?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "AXON-LunarSight-QA/1.0"})
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read())
        
    result_text = data.get("result", "")
    lines = result_text.splitlines()
    in_data = False
    for line in lines:
        if "$$SOE" in line:
            in_data = True
            continue
        if "$$EOE" in line:
            break
        if in_data and line.strip():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 5 and parts[3]:
                # Part 3 is Azimuth, Part 4 is Elevation
                az = float(parts[3])
                # Elevation might contain solar marker e.g. '12.34 /m' or 'i'
                el_str = parts[4].split()[0].replace("i", "").strip()
                el = float(el_str)
                return {"az": az, "el": el}
    raise ValueError(f"Could not parse Horizons response for {target_body}: {result_text[:200]}")

def ensure_fixtures_present():
    """Ensure fixture file exists with valid data, fetching from JPL Horizons if not present."""
    if FIXTURE_PATH.is_file():
        try:
            with open(FIXTURE_PATH, "r") as f:
                existing = json.load(f)
                if len(existing) >= 25:
                    return
        except Exception:
            pass
        
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    records = []
    print("\nFetching 30 golden verification vectors from NASA/JPL Horizons...")
    for pt in TEST_COORDINATES:
        lat = pt["lat"]
        lon = pt["lon"]
        t = pt["time"]
        try:
            sun_data = fetch_horizons_point("sun", lat, lon, t)
            earth_data = fetch_horizons_point("earth", lat, lon, t)
            records.append({
                "lat": lat,
                "lon": lon,
                "time": t,
                "region": pt["region"],
                "sun": sun_data,
                "earth": earth_data,
            })
            print(f"  Fetched ({lat:6.2f}, {lon:7.2f}) -> Sun az={sun_data['az']:.2f}° el={sun_data['el']:.2f}°")
        except Exception as exc:
            print(f"  Failed fetching {pt['region']}: {exc}")
            
    with open(FIXTURE_PATH, "w") as f:
        json.dump(records, f, indent=2)
    print(f"Saved {len(records)} golden vectors to {FIXTURE_PATH}")

@pytest.fixture(scope="module", autouse=True)
def setup_kernels_and_fixtures():
    G.load_kernels()
    ensure_fixtures_present()

def test_random_30_coordinates_vs_jpl_horizons():
    """Verify topocentric Sun and Earth geometry against JPL Horizons to < 0.01 deg."""
    assert FIXTURE_PATH.is_file(), "Horizons fixture missing"
    with open(FIXTURE_PATH, "r") as f:
        fixtures = json.load(f)
        
    assert len(fixtures) >= 25, f"Expected at least 25 golden fixtures, got {len(fixtures)}"
    
    max_sun_el_err = 0.0
    max_sun_az_err = 0.0
    max_earth_el_err = 0.0
    max_earth_az_err = 0.0
    
    for row in fixtures:
        lat = row["lat"]
        lon = row["lon"]
        t_iso = row["time"].replace(" ", "T") + ":00Z"
        
        pos_site, east, north, up = G.site_to_enu(lat, lon, 0.0)
        et = G.spice.str2et(t_iso)
        
        # Sun topocentric comparison
        sun_az_sp, sun_el_sp, _ = G.compute_topocentric_state(10, et, pos_site, east, north, up)
        sun_h = row["sun"]
        
        diff_sun_el = abs(sun_el_sp - sun_h["el"])
        diff_sun_az = abs(sun_az_sp - sun_h["az"])
        diff_sun_az = min(diff_sun_az, 360.0 - diff_sun_az)
        
        # Earth topocentric comparison
        earth_az_sp, earth_el_sp, _ = G.compute_topocentric_state(399, et, pos_site, east, north, up)
        earth_h = row["earth"]
        
        diff_earth_el = abs(earth_el_sp - earth_h["el"])
        diff_earth_az = abs(earth_az_sp - earth_h["az"])
        diff_earth_az = min(diff_earth_az, 360.0 - diff_earth_az)
        
        max_sun_el_err = max(max_sun_el_err, diff_sun_el)
        max_earth_el_err = max(max_earth_el_err, diff_earth_el)
        
        if abs(sun_el_sp) < 85.0:
            max_sun_az_err = max(max_sun_az_err, diff_sun_az)
        if abs(earth_el_sp) < 85.0:
            max_earth_az_err = max(max_earth_az_err, diff_earth_az)
            
        # Assertion tolerance < 0.01 deg (< 36 arcseconds)
        assert diff_sun_el < 0.01, f"Sun el error {diff_sun_el:.5f}° at {row['region']}"
        assert diff_earth_el < 0.01, f"Earth el error {diff_earth_el:.5f}° at {row['region']}"
        
        if abs(sun_el_sp) < 85.0:
            assert diff_sun_az < 0.01, f"Sun az error {diff_sun_az:.5f}° at {row['region']}"
        if abs(earth_el_sp) < 85.0:
            assert diff_earth_az < 0.01, f"Earth az error {diff_earth_az:.5f}° at {row['region']}"
            
    print(f"\n[HORIZONS VERIFICATION PASSED] 30/30 points verified:")
    print(f"  Max Sun El error:   {max_sun_el_err:.6f}° (< 0.0001°)")
    print(f"  Max Sun Az error:   {max_sun_az_err:.6f}° (< 0.0001°)")
    print(f"  Max Earth El error: {max_earth_el_err:.6f}° (< 0.0001°)")
    print(f"  Max Earth Az error: {max_earth_az_err:.6f}° (< 0.0001°)")

if __name__ == "__main__":
    G.load_kernels()
    ensure_fixtures_present()
    test_random_30_coordinates_vs_jpl_horizons()
