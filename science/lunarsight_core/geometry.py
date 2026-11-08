"""
geometry.py — Core SPICE ephemeris calculations for AXON LunarSight.

Calculates topocentric Sun and Earth azimuth and elevation from lunar surface sites
in the MOON_ME frame, adhering to project science conventions.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import spiceypy as spice
from lunarsight_core import constants as C


def check_kernel_file(p: Path) -> None:
    """Check that a kernel file exists and is not an unresolved Git-LFS pointer."""
    if not p.is_file():
        raise FileNotFoundError(f"Missing required SPICE kernel: {p}")
    size = p.stat().st_size
    if size < 1000:
        try:
            head = p.read_bytes()[:60]
            if b"git-lfs" in head or head.startswith(b"version https://git-lfs"):
                raise RuntimeError(
                    f"SPICE kernel '{p.name}' is a Git-LFS pointer ({size} bytes), not the real kernel. "
                    f"Please run 'python pipeline/fetch_kernels.py' to download the real SPICE kernel."
                )
        except Exception:
            pass


def load_kernels(kernels_dir: Optional[Path | str] = None) -> List[str]:
    """Load standard NAIF kernels from kernels_dir or repo default."""
    if kernels_dir is None:
        # Default to repo root / kernels
        kernels_dir = Path(__file__).resolve().parent.parent.parent / "kernels"
    else:
        kernels_dir = Path(kernels_dir)

    expected = [
        C.LSK_FILENAME,
        "pck00011.tpc",
        "de440s.bsp",
        "moon_pa_de440_200625.bpc",
        "moon_de440_250416.tf",
    ]
    loaded = []
    for k in expected:
        p = kernels_dir / k
        check_kernel_file(p)
        spice.furnsh(str(p))
        loaded.append(k)
    return loaded


def unload_kernels() -> None:
    """Clear all loaded SPICE kernels."""
    spice.kclear()


def site_to_enu(
    lat_deg: float, lon_deg: float, alt_km: float = 0.0
) -> Tuple[List[float], List[float], List[float], List[float]]:
    """
    Compute Cartesian position and East-North-Up basis vectors in MOON_ME frame.
    lat: planetocentric latitude (-90 to +90 deg)
    lon: East-positive longitude (-180 to +180 deg)
    """
    if not (C.LAT_MIN_DEG <= lat_deg <= C.LAT_MAX_DEG):
        raise ValueError(f"Latitude {lat_deg} out of bounds [{C.LAT_MIN_DEG}, {C.LAT_MAX_DEG}]")
    if not (C.LON_MIN_DEG <= lon_deg <= C.LON_MAX_DEG):
        raise ValueError(f"Longitude {lon_deg} out of bounds [{C.LON_MIN_DEG}, {C.LON_MAX_DEG}]")

    lat_rad = math.radians(lat_deg)
    lon_rad = math.radians(lon_deg)
    r = C.MOON_RADIUS_KM + alt_km

    cos_lat = math.cos(lat_rad)
    sin_lat = math.sin(lat_rad)
    cos_lon = math.cos(lon_rad)
    sin_lon = math.sin(lon_rad)

    pos_site = [
        r * cos_lat * cos_lon,
        r * cos_lat * sin_lon,
        r * sin_lat,
    ]

    up = [cos_lat * cos_lon, cos_lat * sin_lon, sin_lat]
    east = [-sin_lon, cos_lon, 0.0]
    north = [-sin_lat * cos_lon, -sin_lat * sin_lon, cos_lat]

    return pos_site, east, north, up


def compute_topocentric_az_el(
    target_id: int | str,
    et: float,
    pos_site: List[float],
    east: List[float],
    north: List[float],
    up: List[float],
) -> Tuple[float, float]:
    """
    Calculate topocentric azimuth and elevation in degrees for target body.
    Azimuth: degrees clockwise from North (0° = North, 90° = East).
    Elevation: degrees above local idealized horizon.
    """
    pos_target, _ = spice.spkpos(
        str(target_id), et, C.MOON_FRAME, C.ABCORR, str(C.MOON_NAIF_ID)
    )

    dx = pos_target[0] - pos_site[0]
    dy = pos_target[1] - pos_site[1]
    dz = pos_target[2] - pos_site[2]

    e = dx * east[0] + dy * east[1] + dz * east[2]
    n = dx * north[0] + dy * north[1] + dz * north[2]
    u = dx * up[0] + dy * up[1] + dz * up[2]

    d_horiz = math.hypot(e, n)
    elev = math.degrees(math.atan2(u, d_horiz))
    azi = math.degrees(math.atan2(e, n)) % 360.0
    return azi, elev


def compute_site_timeseries(
    lat_deg: float,
    lon_deg: float,
    start_utc: str,
    stop_utc: str,
    step_seconds: int = 3600,
    alt_km: float = 0.0,
) -> Dict[str, Any]:
    """Generate hourly topocentric time series for Sun and Earth."""
    pos_site, east, north, up = site_to_enu(lat_deg, lon_deg, alt_km)

    et_start = spice.str2et(start_utc)
    et_stop = spice.str2et(stop_utc)

    if et_stop < et_start:
        raise ValueError(f"Stop time {stop_utc} before start time {start_utc}")

    times_utc: List[str] = []
    sun_az: List[float] = []
    sun_el: List[float] = []
    earth_az: List[float] = []
    earth_el: List[float] = []

    et = et_start
    while et <= et_stop + 1e-3:
        utc_str = spice.et2utc(et, "ISOC", 0) + "Z"
        times_utc.append(utc_str)

        s_az, s_el = compute_topocentric_az_el(C.SUN_NAIF_ID, et, pos_site, east, north, up)
        e_az, e_el = compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos_site, east, north, up)

        sun_az.append(round(s_az, 4))
        sun_el.append(round(s_el, 4))
        earth_az.append(round(e_az, 4))
        earth_el.append(round(e_el, 4))

        et += step_seconds

    return {
        "start_utc": start_utc,
        "stop_utc": stop_utc,
        "step_seconds": step_seconds,
        "times": times_utc,
        "sun_azimuth_deg": sun_az,
        "sun_elevation_deg": sun_el,
        "earth_azimuth_deg": earth_az,
        "earth_elevation_deg": earth_el,
        "frame": C.MOON_FRAME,
        "abcorr": C.ABCORR,
        "horizon_mode": "idealized",
    }


def find_intervals(
    times: List[str], mask: List[bool], step_seconds: int = 3600
) -> List[Dict[str, Any]]:
    """Extract contiguous True intervals from a boolean mask."""
    intervals = []
    in_interval = False
    start_idx = 0

    for i, val in enumerate(mask):
        if val and not in_interval:
            in_interval = True
            start_idx = i
        elif not val and in_interval:
            in_interval = False
            duration_hrs = round((i - start_idx) * (step_seconds / 3600.0), 2)
            intervals.append({
                "start": times[start_idx],
                "end": times[i - 1],
                "duration_hours": duration_hrs,
            })

    if in_interval:
        duration_hrs = round((len(mask) - start_idx) * (step_seconds / 3600.0), 2)
        intervals.append({
            "start": times[start_idx],
            "end": times[-1],
            "duration_hours": duration_hrs,
        })

    return intervals


def _longest_gap_hours(mask: List[bool], step_s: int) -> float:
    """Return the longest contiguous False run in mask, in hours."""
    longest = 0
    current = 0
    for v in mask:
        if not v:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return round(longest * step_s / 3600.0, 2)


def _longest_window_hours(windows: List[Dict[str, Any]]) -> float:
    """Return the longest window duration in hours from a list of intervals."""
    if not windows:
        return 0.0
    return max(w["duration_hours"] for w in windows)


def compute_opportunities(
    timeseries: Dict[str, Any], threshold_deg: float = 5.0
) -> Dict[str, Any]:
    """
    Compute availability windows (Sun, Earth, Joint) from time series.
    Sun up uses upper limb correction: (center elevation + SUN_ANGULAR_RADIUS_DEG) >= threshold.
    Earth visibility: center elevation >= threshold.

    Returns summary metrics including:
    - total_hours per body
    - percentage of period
    - windows list
    - longest_window_hours (best case continuous illumination/visibility)
    - longest_dark_gap_hours (worst case outage — relevant for battery sizing)
    """
    times = timeseries["times"]
    sun_el = timeseries["sun_elevation_deg"]
    earth_el = timeseries["earth_elevation_deg"]
    step_s = timeseries.get("step_seconds", 3600)
    total_hours = len(times) * (step_s / 3600.0)

    # Sun mask includes upper-limb correction
    sun_mask = [(el + C.SUN_ANGULAR_RADIUS_DEG) >= threshold_deg for el in sun_el]
    earth_mask = [el >= threshold_deg for el in earth_el]
    joint_mask = [s and e for s, e in zip(sun_mask, earth_mask)]

    sun_windows = find_intervals(times, sun_mask, step_s)
    earth_windows = find_intervals(times, earth_mask, step_s)
    joint_windows = find_intervals(times, joint_mask, step_s)

    sun_hours = sum(w["duration_hours"] for w in sun_windows)
    earth_hours = sum(w["duration_hours"] for w in earth_windows)
    joint_hours = sum(w["duration_hours"] for w in joint_windows)

    return {
        "threshold_deg": threshold_deg,
        "total_period_hours": round(total_hours, 1),
        "sun": {
            "total_hours": round(sun_hours, 1),
            "percentage": round((sun_hours / total_hours * 100.0), 1) if total_hours else 0.0,
            "windows": sun_windows,
            "window_count": len(sun_windows),
            "longest_window_hours": _longest_window_hours(sun_windows),
            "longest_dark_gap_hours": _longest_gap_hours(sun_mask, step_s),
        },
        "earth": {
            "total_hours": round(earth_hours, 1),
            "percentage": round((earth_hours / total_hours * 100.0), 1) if total_hours else 0.0,
            "windows": earth_windows,
            "window_count": len(earth_windows),
            "longest_window_hours": _longest_window_hours(earth_windows),
            "longest_dark_gap_hours": _longest_gap_hours(earth_mask, step_s),
        },
        "joint": {
            "total_hours": round(joint_hours, 1),
            "percentage": round((joint_hours / total_hours * 100.0), 1) if total_hours else 0.0,
            "windows": joint_windows,
            "window_count": len(joint_windows),
            "longest_window_hours": _longest_window_hours(joint_windows),
            "longest_dark_gap_hours": _longest_gap_hours(joint_mask, step_s),
        },
    }

