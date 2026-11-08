"""
horizon.py — Topographic horizon mask calculation from LOLA DEMs.

Implements two independent algorithms:
1. Ray-Marching (primary): steps along great circles in 3D at half-pixel spacing, vectorized.
2. Pixel-Binning (independent cross-check): bins all pixels in the DEM window into azimuth buckets.

All elevation calculations operate in full 3D Cartesian coordinates to accurately account
for spherical lunar curvature (R = 1737.4 km) without planar approximations.
"""

from __future__ import annotations

import datetime
import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from lunarsight_core import constants as C
from lunarsight_core import terrain

MOON_RADIUS_M = C.MOON_RADIUS_KM * 1000.0


def compute_horizon_raymarch(
    lat_deg: float,
    lon_deg: float,
    observer_height_m: float = 0.0,
    max_range_km: float = 50.0,
    az_step_deg: float = 1.0,
    min_range_m: float = 40.0,
    preferred_dem_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compute 360-degree terrain horizon mask using great-circle ray-marching in 3D.
    Vectorized along each azimuth ray for performance.
    """
    dem_info, coverage_status, valid_ranges = terrain.select_dem_for_site(
        lat_deg, lon_deg, max_range_km=max_range_km, preferred_dem_id=preferred_dem_id
    )

    if dem_info is None or coverage_status == "unavailable":
        n_bins = int(round(360.0 / az_step_deg))
        return {
            "lat": lat_deg,
            "lon": lon_deg,
            "h_m": observer_height_m,
            "dem_id": None,
            "resolution_m": None,
            "max_range_km": max_range_km,
            "az_step": az_step_deg,
            "mask_deg": [0.0] * n_bins,
            "coverage_status": "unavailable",
            "max_valid_range_km": [0.0] * n_bins,
            "site_height_m": 0.0,
            "method": "ray_march",
            "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

    # Load windowed DEM
    w_dem = terrain.get_windowed_dem(dem_info, lat_deg, lon_deg, max_range_km=max_range_km)

    # Sample site elevation z0
    site_h = w_dem.sample_latlon(lat_deg, lon_deg)
    if site_h is None:
        site_h = 0.0

    # Observer 3D position in lunar body-fixed frame (MOON_ME)
    lat_rad = math.radians(lat_deg)
    lon_rad = math.radians(lon_deg)
    cos_lat = math.cos(lat_rad)
    sin_lat = math.sin(lat_rad)
    cos_lon = math.cos(lon_rad)
    sin_lon = math.sin(lon_rad)

    u_site = np.array([cos_lat * cos_lon, cos_lat * sin_lon, sin_lat], dtype=np.float64)
    r_obs = MOON_RADIUS_M + site_h + observer_height_m
    pos_obs = r_obs * u_site

    # Local ENU basis vectors
    east = np.array([-sin_lon, cos_lon, 0.0], dtype=np.float64)
    north = np.array([-sin_lat * cos_lon, -sin_lat * sin_lon, cos_lat], dtype=np.float64)
    up = u_site

    # Step parameters: half-pixel spacing
    step_m = max(10.0, dem_info.resolution_m * 0.5)
    n_bins = int(round(360.0 / az_step_deg))
    mask_deg = []
    actual_valid_ranges = []

    for i in range(n_bins):
        az = i * az_step_deg
        az_rad = math.radians(az)
        v_dir = math.cos(az_rad) * north + math.sin(az_rad) * east

        max_r_km = valid_ranges[int(round(az)) % 360]
        max_dist_m = max_r_km * 1000.0

        dists = np.arange(min_range_m, max_dist_m + step_m * 0.5, step_m, dtype=np.float64)
        if len(dists) == 0:
            mask_deg.append(0.0)
            actual_valid_ranges.append(0.0)
            continue

        sigmas = dists / MOON_RADIUS_M
        cos_sigmas = np.cos(sigmas)
        sin_sigmas = np.sin(sigmas)

        # Great-circle 3D positions on unit sphere
        pts_u = cos_sigmas[:, None] * u_site[None, :] + sin_sigmas[:, None] * v_dir[None, :]
        pts_u /= np.linalg.norm(pts_u, axis=1, keepdims=True)

        pts_lat = np.degrees(np.arcsin(np.clip(pts_u[:, 2], -1.0, 1.0)))
        pts_lon = np.degrees(np.arctan2(pts_u[:, 1], pts_u[:, 0]))

        if dem_info.proj_type == "polar_stereographic":
            pts_x, pts_y = terrain.latlon_to_polar_xy(pts_lat, pts_lon)
            heights = w_dem.sample_xy_array(pts_x, pts_y)
        else:
            heights = w_dem.sample_latlon_array(pts_lat, pts_lon)

        valid_pts = ~np.isnan(heights)
        if not np.any(valid_pts):
            mask_deg.append(0.0)
            actual_valid_ranges.append(0.0)
            continue

        # Valid segment
        valid_idx = np.where(valid_pts)[0]
        last_valid_dist = dists[valid_idx[-1]]

        pts_u_v = pts_u[valid_pts]
        h_v = heights[valid_pts]
        dists_v = dists[valid_pts]

        p_terrain = (MOON_RADIUS_M + h_v)[:, None] * pts_u_v
        diff = p_terrain - pos_obs[None, :]

        e = diff @ east
        n = diff @ north
        u = diff @ up
        d_horiz = np.hypot(e, n)

        els = np.degrees(np.arctan2(u, d_horiz))
        max_el = float(np.max(els))

        mask_deg.append(round(max_el, 3))
        actual_valid_ranges.append(round(float(last_valid_dist) / 1000.0, 2))

    return {
        "lat": lat_deg,
        "lon": lon_deg,
        "h_m": observer_height_m,
        "dem_id": dem_info.id,
        "resolution_m": dem_info.resolution_m,
        "max_range_km": max_range_km,
        "az_step": az_step_deg,
        "mask_deg": mask_deg,
        "coverage_status": coverage_status,
        "max_valid_range_km": actual_valid_ranges,
        "site_height_m": round(site_h, 2),
        "method": "ray_march",
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def compute_horizon_pixel_binning(
    lat_deg: float,
    lon_deg: float,
    observer_height_m: float = 0.0,
    max_range_km: float = 50.0,
    az_step_deg: float = 1.0,
    min_range_m: float = 40.0,
    preferred_dem_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Independent cross-check algorithm: iterates over pixels in the windowed DEM,
    projects each to 3D Cartesian space, and bins into azimuth buckets.
    """
    dem_info, coverage_status, _ = terrain.select_dem_for_site(
        lat_deg, lon_deg, max_range_km=max_range_km, preferred_dem_id=preferred_dem_id
    )

    if dem_info is None or coverage_status == "unavailable":
        n_bins = int(round(360.0 / az_step_deg))
        return {
            "lat": lat_deg,
            "lon": lon_deg,
            "h_m": observer_height_m,
            "dem_id": None,
            "mask_deg": [0.0] * n_bins,
            "coverage_status": "unavailable",
            "method": "pixel_binning",
        }

    w_dem = terrain.get_windowed_dem(dem_info, lat_deg, lon_deg, max_range_km=max_range_km)
    site_h = w_dem.sample_latlon(lat_deg, lon_deg) or 0.0

    lat_rad = math.radians(lat_deg)
    lon_rad = math.radians(lon_deg)
    cos_lat = math.cos(lat_rad)
    sin_lat = math.sin(lat_rad)
    cos_lon = math.cos(lon_rad)
    sin_lon = math.sin(lon_rad)

    u_site = np.array([cos_lat * cos_lon, cos_lat * sin_lon, sin_lat], dtype=np.float64)
    r_obs = MOON_RADIUS_M + site_h + observer_height_m
    pos_obs = r_obs * u_site

    east = np.array([-sin_lon, cos_lon, 0.0], dtype=np.float64)
    north = np.array([-sin_lat * cos_lon, -sin_lat * sin_lon, cos_lat], dtype=np.float64)
    up = u_site

    n_bins = int(round(360.0 / az_step_deg))
    bin_max_el = np.full(n_bins, -90.0, dtype=np.float64)

    # Subsample step for speed while retaining peak coverage
    step = 1 if w_dem.width <= 2500 else 2
    r_indices = np.arange(0, w_dem.height, step)
    c_indices = np.arange(0, w_dem.width, step)
    cols_mesh, rows_mesh = np.meshgrid(c_indices, r_indices)

    cols_global = cols_mesh + w_dem.col_offset
    rows_global = rows_mesh + w_dem.row_offset

    trans = w_dem.transform
    xs = trans[2] + (cols_global + 0.5) * trans[0]
    ys = trans[5] + (rows_global + 0.5) * trans[4]

    if dem_info.proj_type == "polar_stereographic":
        lats, lons = terrain.polar_xy_to_latlon(xs, ys)
    else:
        lons, lats = xs, ys

    lats_rad = np.radians(lats)
    lons_rad = np.radians(lons)

    u_pts_x = np.cos(lats_rad) * np.cos(lons_rad)
    u_pts_y = np.cos(lats_rad) * np.sin(lons_rad)
    u_pts_z = np.sin(lats_rad)

    dns = w_dem.data[::step, ::step]
    valid_mask = dns != terrain.NODATA_VALUE
    heights = dns.astype(np.float64) * dem_info.scale

    radii = MOON_RADIUS_M + heights
    p_x = radii * u_pts_x
    p_y = radii * u_pts_y
    p_z = radii * u_pts_z

    diff_x = p_x - pos_obs[0]
    diff_y = p_y - pos_obs[1]
    diff_z = p_z - pos_obs[2]

    e = diff_x * east[0] + diff_y * east[1] + diff_z * east[2]
    n = diff_x * north[0] + diff_y * north[1] + diff_z * north[2]
    u = diff_x * up[0] + diff_y * up[1] + diff_z * up[2]

    d_horiz = np.hypot(e, n)
    in_range = valid_mask & (d_horiz >= min_range_m) & (d_horiz <= max_range_km * 1000.0)

    e_sub = e[in_range]
    n_sub = n[in_range]
    u_sub = u[in_range]
    d_sub = d_horiz[in_range]

    azs = (np.degrees(np.arctan2(e_sub, n_sub)) % 360.0)
    els = np.degrees(np.arctan2(u_sub, d_sub))

    # Fast binning for distant pixels (d >= 500m)
    far_mask = d_sub >= 500.0
    bin_indices = (azs[far_mask] / az_step_deg).astype(int) % n_bins
    np.maximum.at(bin_max_el, bin_indices, els[far_mask])

    # For near pixels (d < 500m), account for finite pixel angular width
    near_mask = ~far_mask
    if np.any(near_mask):
        azs_near = azs[near_mask]
        els_near = els[near_mask]
        ds_near = d_sub[near_mask]
        half_widths_deg = np.degrees(np.arctan((dem_info.resolution_m * 0.5) / ds_near))

        for az_center, el_val, hw in zip(azs_near, els_near, half_widths_deg):
            min_bin = int(math.floor((az_center - hw) / az_step_deg))
            max_bin = int(math.ceil((az_center + hw) / az_step_deg))
            for b in range(min_bin, max_bin + 1):
                idx = b % n_bins
                if el_val > bin_max_el[idx]:
                    bin_max_el[idx] = el_val

    bin_max_el[bin_max_el == -90.0] = 0.0
    return {
        "lat": lat_deg,
        "lon": lon_deg,
        "h_m": observer_height_m,
        "dem_id": dem_info.id,
        "mask_deg": [round(float(v), 3) for v in bin_max_el],
        "coverage_status": coverage_status,
        "method": "pixel_binning",
    }


def lookup_horizon(mask: Dict[str, Any] | List[float], az_deg: float) -> float:
    """
    Look up the horizon elevation at any arbitrary azimuth with linear interpolation and wraparound.
    """
    if isinstance(mask, dict):
        mask_deg = mask["mask_deg"]
        az_step = mask.get("az_step", 1.0)
    else:
        mask_deg = mask
        az_step = 360.0 / len(mask_deg)

    n = len(mask_deg)
    az_norm = az_deg % 360.0
    idx_f = az_norm / az_step
    idx0 = int(math.floor(idx_f)) % n
    idx1 = (idx0 + 1) % n
    frac = idx_f - math.floor(idx_f)

    v0 = mask_deg[idx0]
    v1 = mask_deg[idx1]
    return float((1.0 - frac) * v0 + frac * v1)


# Canonical alias
compute_horizon = compute_horizon_raymarch
