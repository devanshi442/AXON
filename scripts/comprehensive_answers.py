import os
import json
import math
import numpy as np
from lunarsight_core import sites, terrain, horizon, geometry as G, visibility, metrics

def check_q2():
    print("==================================================")
    print("QUESTION 2: Cross-DEM Height Sampling Agreement")
    print("==================================================")
    # IM-1
    lat, lon = -80.13, 1.44
    dems_im1 = ["LDEM_75S_30M", "LDEM_80S_40M", "LDEM_80S_20M"]
    heights_im1 = {}
    for did in dems_im1:
        dinfo = terrain.DEM_CATALOGUE[did]
        h, _ = terrain.sample_height_at_point(lat, lon, dem_info=dinfo)
        heights_im1[did] = h
        print(f"IM-1 (-80.13, 1.44) on {did:15s}: {h:8.2f} m")
    diffs_im1 = [abs(h1 - h2) for h1 in heights_im1.values() for h2 in heights_im1.values()]
    print(f"IM-1 Max Difference across DEMs: {max(diffs_im1):.2f} m (<= 50 m requirement: {max(diffs_im1) <= 50.0})")
    print()

    # 5 more points
    test_points = [
        ("Mons Mouton", -84.7906, 29.1957),
        ("Malapert Massif", -85.99, 0.0),
        ("Faustini Rim", -87.1, 85.0),
        ("Haworth", -87.4, -5.0),
        ("Shackleton Rim", -89.68, 129.0),
    ]

    for pname, plat, plon in test_points:
        print(f"Point: {pname} ({plat:.4f}, {plon:.4f}):")
        applicable_dems = []
        for did, dinfo in terrain.DEM_CATALOGUE.items():
            if did == "LDEM_64":
                continue
            if plat <= dinfo.max_lat:
                applicable_dems.append((did, dinfo))
        pt_heights = {}
        for did, dinfo in applicable_dems:
            h, _ = terrain.sample_height_at_point(plat, plon, dem_info=dinfo)
            pt_heights[did] = h
            print(f"  {did:15s}: {h:8.2f} m")
        if len(pt_heights) > 1:
            diffs = [abs(h1 - h2) for h1 in pt_heights.values() for h2 in pt_heights.values()]
            print(f"  -> Max difference: {max(diffs):.2f} m")
        print()

def check_q3():
    print("==================================================")
    print("QUESTION 3: DEM Window Coverage at Edge & Per-Azimuth Valid Range")
    print("==================================================")
    # Check needs-check-farside on LDEM_75S_30M
    lat_farside, lon_farside = -75.0, 132.5
    dinfo, status, valid_ranges = terrain.select_dem_for_site(lat_farside, lon_farside, max_range_km=50.0, preferred_dem_id="LDEM_75S_30M")
    print(f"needs-check-farside (-75.0, 132.5) on LDEM_75S_30M:")
    print(f"  coverage_status: {status}")
    print(f"  min_valid_range_km: {min(valid_ranges):.1f} km, max_valid_range_km: {max(valid_ranges):.1f} km")
    # North azimuth (0 deg) vs South azimuth (180 deg)
    print(f"  Azimuth   0 deg (North): {valid_ranges[0]:.1f} km (immediately hits -75 lat limit)")
    print(f"  Azimuth 180 deg (South): {valid_ranges[180]:.1f} km")
    print()

    # Per-azimuth valid range for every site's chosen DEM
    print("Every site's chosen DEM and valid range coverage:")
    valid_sites = sites.get_valid_sites()
    for s in valid_sites:
        chosen_dem, c_status, v_ranges = terrain.select_dem_for_site(s.lat, s.lon, max_range_km=50.0)
        min_r = min(v_ranges)
        max_r = max(v_ranges)
        print(f"  {s.id:35s} ({s.lat:6.2f}, {s.lon:7.2f}) -> {chosen_dem.id:15s} | status: {c_status:7s} | valid range: [{min_r:.1f}, {max_r:.1f}] km")
    print()

def check_q4():
    print("==================================================")
    print("QUESTION 4: Equatorial / Mid-Latitude Sites on LDEM_64")
    print("==================================================")
    target_ids = ["blue-ghost-m1", "peregrine-m1", "im-3-reiner-gamma"]
    all_sites = {s.id: s for s in sites.get_valid_sites()}
    for sid in target_ids:
        s = all_sites[sid]
        mask_data = horizon.compute_horizon(s.lat, s.lon, observer_height_m=0.0)
        mask = np.array(mask_data['mask_deg'])
        print(f"Site: {sid} ({s.name}) [lat: {s.lat}, lon: {s.lon}]:")
        print(f"  DEM used: {mask_data['dem_id']}")
        print(f"  mask min: {np.min(mask):+.3f} deg, max: {np.max(mask):+.3f} deg, mean: {np.mean(mask):+.3f} deg")
        print(f"  fraction of mask <= 0.0 deg: {np.mean(mask <= 0.0) * 100:.1f}%")
        print()

def check_q5():
    print("==================================================")
    print("QUESTION 5: PSR Sanity Numbers in Crater Floors")
    print("==================================================")
    G.load_kernels()
    psr_points = [
        ("Shackleton Crater Floor (East)",  -89.85, 90.0),
        ("Shackleton Deep Floor",           -89.92, 120.0),
        ("Faustini Crater Floor 1",         -87.30, 84.0),
        ("Faustini Crater Floor 2",         -87.25, 82.0),
        ("Haworth Crater Floor 1",          -87.40, -5.0),
        ("Haworth Crater Floor 2",          -87.50, -4.0),
    ]

    start_utc = "2026-01-01T00:00:00Z"
    stop_utc = "2027-01-01T00:00:00Z"
    step_s = 3600  # hourly for 1 year = 8761 samples

    for pname, plat, plon in psr_points:
        m_data = horizon.compute_horizon(plat, plon, observer_height_m=0.0, max_range_km=50.0)
        ts = G.compute_site_timeseries(plat, plon, start_utc, stop_utc, step_seconds=step_s)
        sun_el = ts["sun_elevation_deg"]
        sun_az = ts["sun_azimuth_deg"]

        flat_v = visibility.compute_sun_visibility(sun_el, sun_az, mask=None, threshold_deg=0.0)
        terr_v = visibility.compute_sun_visibility(sun_el, sun_az, mask=m_data, threshold_deg=0.0)

        n_total = len(sun_el)
        flat_pct = (np.sum(flat_v["visible"]) / n_total) * 100.0
        terr_pct = (np.sum(terr_v["visible"]) / n_total) * 100.0

        mask_arr = np.array(m_data["mask_deg"])
        print(f"Point: {pname} ({plat:.2f}, {plon:.2f}) [DEM: {m_data['dem_id']}]:")
        print(f"  Horizon Mask: min={np.min(mask_arr):+.2f} deg, max={np.max(mask_arr):+.2f} deg, mean={np.mean(mask_arr):+.2f} deg")
        print(f"  1-Year Samples: {n_total} hours")
        print(f"  Flat Horizon Sun-Up   : {flat_pct:6.2f}% ({np.sum(flat_v['visible'])} hrs)")
        print(f"  Terrain Horizon Sun-Up: {terr_pct:6.2f}% ({np.sum(terr_v['visible'])} hrs)")
        print(f"  True PSR (terr == 0.0%): {terr_pct == 0.0}")
        print()

if __name__ == "__main__":
    check_q2()
    check_q3()
    check_q4()
    check_q5()
