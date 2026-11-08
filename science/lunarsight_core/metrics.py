"""
metrics.py — Contiguous window extraction, 1-minute SPICE root-finding refinement,
and comprehensive multi-lunation statistics for AXON LunarSight.

Pure functions operating on ephemeris timeseries and terrain masks.
"""

from __future__ import annotations

import datetime
import math
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import horizon
from lunarsight_core import power
from lunarsight_core import visibility


def _longest_run_hours(mask: List[bool], step_seconds: int, target_val: bool) -> float:
    """Compute longest contiguous run of target_val in hours."""
    longest = 0
    current = 0
    for v in mask:
        if v == target_val:
            current += 1
            if current > longest:
                longest = current
        else:
            current = 0
    return round(longest * (step_seconds / 3600.0), 2)


def refine_transition_spice(
    et_start: float,
    et_end: float,
    lat_deg: float,
    lon_deg: float,
    target_body_id: int,
    mask: Optional[Dict[str, Any] | List[float]] = None,
    threshold_deg: float = 0.0,
    is_sun: bool = True,
    margin_deg: float = 0.0,
    criterion: str = "center",
    max_iterations: int = 6,  # 3600s / 64 = 56s (< 1 min)
) -> float:
    """
    Refine the epoch when the visibility condition flips between et_start and et_end
    using bisection root finding with SPICE topocentric geometry.
    """
    pos_site, east, north, up = G.site_to_enu(lat_deg, lon_deg)

    def eval_condition(et: float) -> bool:
        az, el, dist = G.compute_topocentric_state(target_body_id, et, pos_site, east, north, up)
        if is_sun:
            r_sun = math.degrees(math.atan(C.SUN_RADIUS_KM / dist))
            v = visibility.compute_sun_visibility(el, az, mask=mask, sun_ang_radius_deg=r_sun, threshold_deg=threshold_deg)
            return bool(v["visible"])
        else:
            r_earth = math.degrees(math.atan(C.EARTH_EQUATORIAL_RADIUS_KM / dist))
            v = visibility.compute_earth_visibility(el, az, mask=mask, earth_ang_radius_deg=r_earth, margin_deg=margin_deg, criterion=criterion)
            return bool(v["visible"])

    val_start = eval_condition(et_start)
    lo = et_start
    hi = et_end

    for _ in range(max_iterations):
        mid = (lo + hi) / 2.0
        val_mid = eval_condition(mid)
        if val_mid == val_start:
            lo = mid
        else:
            hi = mid

    return (lo + hi) / 2.0


def extract_windows_refined(
    times: List[str],
    mask: List[bool],
    step_seconds: int = 3600,
    site_lat: Optional[float] = None,
    site_lon: Optional[float] = None,
    target_body_id: Optional[int] = None,
    horizon_mask: Optional[Dict[str, Any] | List[float]] = None,
    threshold_deg: float = 0.0,
    is_sun: bool = True,
    margin_deg: float = 0.0,
    criterion: str = "center",
    refine_edges: bool = True,
) -> List[Dict[str, Any]]:
    """
    Extract contiguous True intervals with optional ~1-minute SPICE edge refinement.
    """
    intervals = []
    in_interval = False
    start_idx = 0
    n = len(mask)

    can_refine = (
        refine_edges
        and site_lat is not None
        and site_lon is not None
        and target_body_id is not None
        and hasattr(G, "spice")
    )

    for i in range(n):
        val = mask[i]
        if val and not in_interval:
            in_interval = True
            start_idx = i
        elif not val and in_interval:
            in_interval = False
            end_idx = i - 1

            start_utc = times[start_idx]
            end_utc = times[end_idx]
            precision = "hourly"

            # Refine rising edge
            if can_refine and start_idx > 0:
                try:
                    et0 = G.spice.str2et(times[start_idx - 1])
                    et1 = G.spice.str2et(times[start_idx])
                    et_rise = refine_transition_spice(
                        et0, et1, site_lat, site_lon, target_body_id,
                        mask=horizon_mask, threshold_deg=threshold_deg,
                        is_sun=is_sun, margin_deg=margin_deg, criterion=criterion,
                    )
                    start_utc = G.spice.et2utc(et_rise, "ISOC", 0) + "Z"
                    precision = "1-minute"
                except Exception:
                    pass

            # Refine setting edge
            if can_refine and i < n:
                try:
                    et0 = G.spice.str2et(times[end_idx])
                    et1 = G.spice.str2et(times[i])
                    et_set = refine_transition_spice(
                        et0, et1, site_lat, site_lon, target_body_id,
                        mask=horizon_mask, threshold_deg=threshold_deg,
                        is_sun=is_sun, margin_deg=margin_deg, criterion=criterion,
                    )
                    end_utc = G.spice.et2utc(et_set, "ISOC", 0) + "Z"
                    precision = "1-minute"
                except Exception:
                    pass

            # Calculate duration in hours
            if precision != "hourly":
                try:
                    dt_start = datetime.datetime.fromisoformat(start_utc.replace("Z", "+00:00"))
                    dt_end = datetime.datetime.fromisoformat(end_utc.replace("Z", "+00:00"))
                    dur_hrs = round((dt_end - dt_start).total_seconds() / 3600.0, 2)
                except Exception:
                    dur_hrs = round((end_idx - start_idx + 1) * (step_seconds / 3600.0), 2)
            else:
                dur_hrs = round((end_idx - start_idx + 1) * (step_seconds / 3600.0), 2)

            intervals.append({
                "start": start_utc,
                "end": end_utc,
                "start_utc": start_utc,
                "end_utc": end_utc,
                "duration_hours": max(0.0, dur_hrs),
                "precision": precision,
            })

    if in_interval:
        end_idx = n - 1
        start_utc = times[start_idx]
        end_utc = times[end_idx]
        precision = "hourly"

        if can_refine and start_idx > 0:
            try:
                et0 = G.spice.str2et(times[start_idx - 1])
                et1 = G.spice.str2et(times[start_idx])
                et_rise = refine_transition_spice(
                    et0, et1, site_lat, site_lon, target_body_id,
                    mask=horizon_mask, threshold_deg=threshold_deg,
                    is_sun=is_sun, margin_deg=margin_deg, criterion=criterion,
                )
                start_utc = G.spice.et2utc(et_rise, "ISOC", 0) + "Z"
                precision = "1-minute"
            except Exception:
                pass

        if precision != "hourly":
            try:
                dt_start = datetime.datetime.fromisoformat(start_utc.replace("Z", "+00:00"))
                dt_end = datetime.datetime.fromisoformat(end_utc.replace("Z", "+00:00"))
                dur_hrs = round((dt_end - dt_start).total_seconds() / 3600.0, 2)
            except Exception:
                dur_hrs = round((end_idx - start_idx + 1) * (step_seconds / 3600.0), 2)
        else:
            dur_hrs = round((end_idx - start_idx + 1) * (step_seconds / 3600.0), 2)

        intervals.append({
            "start": start_utc,
            "end": end_utc,
            "start_utc": start_utc,
            "end_utc": end_utc,
            "duration_hours": max(0.0, dur_hrs),
            "precision": precision,
        })

    return intervals


def compute_comprehensive_metrics(
    timeseries: Dict[str, Any],
    mask: Optional[Dict[str, Any] | List[float]] = None,
    sun_threshold_deg: float = 0.0,
    dte_margin_deg: float = 0.0,
    earth_criterion: str = "center",
    power_config: Optional[Dict[str, Any]] = None,
    refine_edges: bool = False,
    site_lat: Optional[float] = None,
    site_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Compute comprehensive availability windows, power potential, and statistics
    for both flat and terrain modes.
    """
    times = timeseries["times"]
    sun_el = timeseries["sun_elevation_deg"]
    sun_az = timeseries["sun_azimuth_deg"]
    earth_el = timeseries["earth_elevation_deg"]
    earth_az = timeseries["earth_azimuth_deg"]
    sun_dist = timeseries.get("sun_distance_km")
    earth_dist = timeseries.get("earth_distance_km")
    sun_radius = timeseries.get("sun_angular_radius_deg", C.SUN_ANGULAR_RADIUS_DEG)
    earth_radius = timeseries.get("earth_angular_radius_deg", C.EARTH_ANGULAR_RADIUS_DEG)
    step_s = timeseries.get("step_seconds", 3600)
    total_hours = len(times) * (step_s / 3600.0)

    # 1. Compute visibility
    sun_vis = visibility.compute_sun_visibility(
        sun_el, sun_az, mask=mask, sun_ang_radius_deg=sun_radius, threshold_deg=sun_threshold_deg
    )
    earth_vis = visibility.compute_earth_visibility(
        earth_el, earth_az, mask=mask, earth_ang_radius_deg=earth_radius, margin_deg=dte_margin_deg, criterion=earth_criterion
    )

    sun_mask = sun_vis["visible"]
    earth_mask = earth_vis["visible"]
    joint_mask = [s and e for s, e in zip(sun_mask, earth_mask)]

    # 2. Windows with optional SPICE refinement
    sun_windows = extract_windows_refined(
        times, sun_mask, step_seconds=step_s,
        site_lat=site_lat, site_lon=site_lon, target_body_id=C.SUN_NAIF_ID,
        horizon_mask=mask, threshold_deg=sun_threshold_deg, is_sun=True,
        refine_edges=refine_edges,
    )
    earth_windows = extract_windows_refined(
        times, earth_mask, step_seconds=step_s,
        site_lat=site_lat, site_lon=site_lon, target_body_id=C.EARTH_NAIF_ID,
        horizon_mask=mask, margin_deg=dte_margin_deg, criterion=earth_criterion, is_sun=False,
        refine_edges=refine_edges,
    )
    joint_windows = extract_windows_refined(
        times, joint_mask, step_seconds=step_s,
        site_lat=site_lat, site_lon=site_lon, target_body_id=C.SUN_NAIF_ID,
        horizon_mask=mask, threshold_deg=sun_threshold_deg, is_sun=True,
        refine_edges=False,  # Joint edge depends on both bodies, keep hourly
    )

    # Totals and extremes
    sun_hours = sum(w["duration_hours"] for w in sun_windows)
    earth_hours = sum(w["duration_hours"] for w in earth_windows)
    joint_hours = sum(w["duration_hours"] for w in joint_windows)

    sun_fraction = sun_hours / total_hours if total_hours else 0.0
    earth_fraction = earth_hours / total_hours if total_hours else 0.0
    joint_fraction = joint_hours / total_hours if total_hours else 0.0

    longest_sun_w = max((w["duration_hours"] for w in sun_windows), default=0.0)
    longest_dark_gap = _longest_run_hours(sun_mask, step_s, False)

    longest_earth_w = max((w["duration_hours"] for w in earth_windows), default=0.0)
    longest_earth_outage = _longest_run_hours(earth_mask, step_s, False)

    longest_joint_w = max((w["duration_hours"] for w in joint_windows), default=0.0)
    longest_joint_gap = _longest_run_hours(joint_mask, step_s, False)

    # 3. Power Model
    p_cfg = power_config or {}
    power_res = power.compute_solar_power(
        sun_el_deg=sun_el,
        sun_az_deg=sun_az,
        sun_fraction=sun_vis["fraction"],
        sun_distance_km=sun_dist,
        area_m2=p_cfg.get("area_m2", 1.0),
        efficiency=p_cfg.get("efficiency", 0.28),
        orientation=p_cfg.get("orientation", "horizontal"),
        az0_deg=p_cfg.get("az0_deg", 0.0),
        step_seconds=step_s,
    )

    # 4. Multi-lunation / monthly breakdown (synodic month ~708.7 hours)
    lunation_hours = 708.7
    steps_per_lunation = max(1, int(round(lunation_hours / (step_s / 3600.0))))
    lunations = []
    n_samples = len(times)

    for start_i in range(0, n_samples, steps_per_lunation):
        end_i = min(n_samples, start_i + steps_per_lunation)
        sub_sun = sun_mask[start_i:end_i]
        sub_earth = earth_mask[start_i:end_i]
        sub_joint = joint_mask[start_i:end_i]
        sub_hours = len(sub_sun) * (step_s / 3600.0)

        s_hrs = sum(sub_sun) * (step_s / 3600.0)
        e_hrs = sum(sub_earth) * (step_s / 3600.0)
        j_hrs = sum(sub_joint) * (step_s / 3600.0)
        dark_gap = _longest_run_hours(sub_sun, step_s, False)

        lunations.append({
            "lunation_index": len(lunations) + 1,
            "start_utc": times[start_i],
            "end_utc": times[end_i - 1],
            "total_hours": round(sub_hours, 1),
            "sun_hours": round(s_hrs, 1),
            "sun_percentage": round(s_hrs / sub_hours * 100.0, 1) if sub_hours else 0.0,
            "earth_hours": round(e_hrs, 1),
            "joint_hours": round(j_hrs, 1),
            "longest_dark_gap_hours": dark_gap,
        })

    best_lunation = max(lunations, key=lambda l: l["joint_hours"]) if lunations else None
    worst_lunation = max(lunations, key=lambda l: l["longest_dark_gap_hours"]) if lunations else None

    result = {
        "mode": "terrain" if mask else "flat",
        "coverage_status": sun_vis["coverage_status"],
        "dem_id": sun_vis["dem_id"],
        "total_period_hours": round(total_hours, 1),
        "sun": {
            "total_hours": round(sun_hours, 1),
            "percentage": round(sun_fraction * 100.0, 1),
            "windows_count": len(sun_windows),
            "longest_window_hours": longest_sun_w,
            "longest_dark_gap_hours": longest_dark_gap,
            "windows": sun_windows,
        },
        "earth": {
            "total_hours": round(earth_hours, 1),
            "percentage": round(earth_fraction * 100.0, 1),
            "windows_count": len(earth_windows),
            "longest_window_hours": longest_earth_w,
            "longest_dark_gap_hours": longest_earth_outage,
            "criterion": earth_criterion,
            "margin_deg": dte_margin_deg,
            "windows": earth_windows,
        },
        "joint": {
            "total_hours": round(joint_hours, 1),
            "percentage": round(joint_fraction * 100.0, 1),
            "windows_count": len(joint_windows),
            "longest_window_hours": longest_joint_w,
            "longest_joint_gap_hours": longest_joint_gap,
            "windows": joint_windows,
        },
        "power": {
            "area_m2": power_res["area_m2"],
            "efficiency": power_res["efficiency"],
            "orientation": power_res["orientation"],
            "total_energy_kwh": round(power_res["total_energy_wh"] / 1000.0, 2),
            "specific_energy_kwh_m2": round(power_res["specific_energy_wh_m2"] / 1000.0, 2),
            "peak_power_watts": power_res["peak_power_watts"],
            "mean_power_watts": power_res["mean_power_watts"],
            "caveat": power_res["caveat"],
        },
        "lunations": lunations,
        "best_lunation": best_lunation,
        "worst_lunation": worst_lunation,
    }

    return result


def compute_site_flat_and_terrain_metrics(
    timeseries: Dict[str, Any],
    horizon_mask: Optional[Dict[str, Any]] = None,
    sun_threshold_deg: float = 0.0,
    dte_margin_deg: float = 0.0,
    earth_criterion: str = "center",
    power_config: Optional[Dict[str, Any]] = None,
    site_lat: Optional[float] = None,
    site_lon: Optional[float] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Compute metrics for both Flat and Terrain modes, plus delta (terrain - flat).
    """
    if "antenna_margin_deg" in kwargs:
        dte_margin_deg = kwargs["antenna_margin_deg"]

    if power_config is None and ("solar_array_type" in kwargs or "orientation" in kwargs):
        power_config = {
            "orientation": kwargs.get("solar_array_type") or kwargs.get("orientation", "flat"),
            "tilt_deg": kwargs.get("solar_tilt_deg") or kwargs.get("tilt_deg"),
            "azimuth_deg": kwargs.get("solar_azimuth_deg") or kwargs.get("azimuth_deg"),
        }

    flat_res = compute_comprehensive_metrics(
        timeseries=timeseries,
        mask=None,
        sun_threshold_deg=sun_threshold_deg,
        dte_margin_deg=dte_margin_deg,
        earth_criterion=earth_criterion,
        power_config=power_config,
        site_lat=site_lat,
        site_lon=site_lon,
    )

    if horizon_mask is None or (isinstance(horizon_mask, dict) and horizon_mask.get("coverage_status") == "unavailable"):
        return {
            "flat": flat_res,
            "terrain": None,
            "delta_terrain_minus_flat": None,
        }

    terrain_res = compute_comprehensive_metrics(
        timeseries=timeseries,
        mask=horizon_mask,
        sun_threshold_deg=sun_threshold_deg,
        dte_margin_deg=dte_margin_deg,
        earth_criterion=earth_criterion,
        power_config=power_config,
        site_lat=site_lat,
        site_lon=site_lon,
    )

    # Compute headline delta: how wrong flat horizon is
    delta = {
        "sun_hours": round(terrain_res["sun"]["total_hours"] - flat_res["sun"]["total_hours"], 1),
        "sun_percentage": round(terrain_res["sun"]["percentage"] - flat_res["sun"]["percentage"], 1),
        "longest_dark_gap_hours": round(terrain_res["sun"]["longest_dark_gap_hours"] - flat_res["sun"]["longest_dark_gap_hours"], 1),
        "earth_hours": round(terrain_res["earth"]["total_hours"] - flat_res["earth"]["total_hours"], 1),
        "earth_percentage": round(terrain_res["earth"]["percentage"] - flat_res["earth"]["percentage"], 1),
        "joint_hours": round(terrain_res["joint"]["total_hours"] - flat_res["joint"]["total_hours"], 1),
        "energy_kwh": round(terrain_res["power"]["total_energy_kwh"] - flat_res["power"]["total_energy_kwh"], 2),
    }

    return {
        "flat": flat_res,
        "terrain": terrain_res,
        "delta_terrain_minus_flat": delta,
    }


# Backwards compatibility / convenience alias
compute_dual_metrics = compute_site_flat_and_terrain_metrics
extract_windows = extract_windows_refined


def rank_windows(
    sites_windows: Dict[str, List[Dict[str, Any]]],
    min_duration_hours: float = 24.0,
    top_n: int = 10,
) -> List[Dict[str, Any]]:
    """
    Rank top contiguous joint windows across sites. No magic scoring — transparent sorting
    by duration and start date.
    """
    ranked = []
    for site_id, windows in sites_windows.items():
        for w in windows:
            if w["duration_hours"] >= min_duration_hours:
                ranked.append({
                    "site_id": site_id,
                    "start": w["start"],
                    "end": w["end"],
                    "duration_hours": w["duration_hours"],
                    "duration_days": round(w["duration_hours"] / 24.0, 1),
                    "precision": w.get("precision", "hourly"),
                })

    ranked.sort(key=lambda x: x["duration_hours"], reverse=True)
    return ranked[:top_n]
