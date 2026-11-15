"""
visibility.py — Topographic vs. flat visibility logic for Sun and Earth.

Formulas & Approximations:
- Sun: Fraction of the solar disk above the local terrain horizon mask.
  f = clip((el_center + r_sun - mask(az)) / (2 * r_sun), 0, 1)
  Approximation: Local-flat-mask approximation — across the solar disk diameter (~0.53°),
  the horizon skyline is treated as locally horizontal at elevation mask(az).
  Sun "up" is defined as f > 0 (upper limb above mask or threshold).
- Earth: Direct-to-Earth (DTE) visibility with selectable criterion:
  - 'center': el_center >= mask(az) + margin
  - 'full_disk': (el_center - r_earth) >= mask(az) + margin
  - 'any_limb': (el_center + r_earth) >= mask(az) + margin
  Antenna clearance margin (degrees) provides link margin against grazing diffraction.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Union
import numpy as np

from lunarsight_core import constants as C
from lunarsight_core import horizon


def get_mask_elevation(
    mask: Optional[Dict[str, Any] | List[float]], az_deg: float | np.ndarray
) -> np.ndarray:
    """Return horizon mask elevation in degrees for given azimuth(s)."""
    if mask is None:
        return np.zeros_like(az_deg, dtype=np.float64) if isinstance(az_deg, np.ndarray) else 0.0

    if isinstance(az_deg, (int, float)):
        res = horizon.lookup_horizon(mask, float(az_deg))
        return 0.0 if (res is None or math.isnan(res)) else float(res)

    # Array of azimuths
    azs = np.asarray(az_deg, dtype=np.float64)
    if isinstance(mask, dict):
        mask_deg = np.asarray(mask["mask_deg"], dtype=np.float64)
        az_step = float(mask.get("az_step", 1.0))
    else:
        mask_deg = np.asarray(mask, dtype=np.float64)
        az_step = 360.0 / len(mask_deg)

    n = len(mask_deg)
    az_norm = azs % 360.0
    idx_f = az_norm / az_step
    idx0 = np.floor(idx_f).astype(np.int32) % n
    idx1 = (idx0 + 1) % n
    frac = idx_f - np.floor(idx_f)

    result = (1.0 - frac) * mask_deg[idx0] + frac * mask_deg[idx1]
    return np.nan_to_num(result, nan=0.0)


def compute_sun_visibility(
    el_center_deg: Union[float, List[float], np.ndarray],
    az_deg: Union[float, List[float], np.ndarray],
    mask: Optional[Dict[str, Any] | List[float]] = None,
    sun_ang_radius_deg: Union[float, List[float], np.ndarray] = C.SUN_ANGULAR_RADIUS_DEG,
    threshold_deg: float = 0.0,
) -> Dict[str, Any]:
    """
    Compute solar disk fraction above the local terrain horizon or flat threshold.
    Sun 'up' (visible) is defined as fraction > 0 (upper limb above mask).
    """
    is_scalar = isinstance(el_center_deg, (int, float))
    el = np.asarray(el_center_deg, dtype=np.float64)
    az = np.asarray(az_deg, dtype=np.float64)
    r_sun = np.asarray(sun_ang_radius_deg, dtype=np.float64)

    mask_el = get_mask_elevation(mask, az)
    if mask is not None:
        effective_horizon = mask_el + threshold_deg
    else:
        effective_horizon = threshold_deg

    # Local-flat-mask approximation: circular-segment area of disk above mask
    # 0 = completely below horizon, 1 = completely above horizon
    r_safe = np.maximum(r_sun, 1e-9)
    h_above = np.clip(el + r_sun - effective_horizon, 0.0, 2.0 * r_safe)
    d_norm = np.clip(1.0 - h_above / r_safe, -1.0, 1.0)
    theta = np.arccos(d_norm)
    fraction = np.clip((theta - d_norm * np.sin(theta)) / np.pi, 0.0, 1.0)
    visible = fraction > 0.0

    coverage_status = "idealized"
    dem_id = None
    if mask and isinstance(mask, dict):
        coverage_status = mask.get("coverage_status", "full")
        dem_id = mask.get("dem_id")

    if is_scalar:
        return {
            "visible": bool(visible.item()),
            "fraction": round(float(fraction.item()), 4),
            "effective_horizon_deg": round(float(effective_horizon.item()), 3),
            "mode": "terrain" if mask else "flat",
            "coverage_status": coverage_status,
            "dem_id": dem_id,
        }

    return {
        "visible": visible.tolist(),
        "fraction": np.round(fraction, 4).tolist(),
        "effective_horizon_deg": np.round(effective_horizon, 3).tolist(),
        "mode": "terrain" if mask else "flat",
        "coverage_status": coverage_status,
        "dem_id": dem_id,
    }


def compute_earth_visibility(
    el_center_deg: Union[float, List[float], np.ndarray],
    az_deg: Union[float, List[float], np.ndarray],
    mask: Optional[Dict[str, Any] | List[float]] = None,
    earth_ang_radius_deg: Union[float, List[float], np.ndarray] = C.EARTH_ANGULAR_RADIUS_DEG,
    margin_deg: float = 0.0,
    criterion: str = "center",
) -> Dict[str, Any]:
    """
    Compute Earth (DTE) geometric line-of-sight visibility with antenna clearance margin.
    criterion options:
      - 'center': Earth center elevation >= mask + margin (default)
      - 'full_disk': Entire Earth disk above mask + margin ((el - r) >= mask + margin)
      - 'any_limb': Upper Earth limb above mask + margin ((el + r) >= mask + margin)
    """
    is_scalar = isinstance(el_center_deg, (int, float))
    el = np.asarray(el_center_deg, dtype=np.float64)
    az = np.asarray(az_deg, dtype=np.float64)
    r_earth = np.asarray(earth_ang_radius_deg, dtype=np.float64)

    mask_el = get_mask_elevation(mask, az)
    required_el = mask_el + margin_deg

    if criterion == "full_disk":
        visible = (el - r_earth) >= required_el
    elif criterion == "any_limb":
        visible = (el + r_earth) >= required_el
    else:  # "center"
        visible = el >= required_el

    coverage_status = "idealized"
    dem_id = None
    if mask and isinstance(mask, dict):
        coverage_status = mask.get("coverage_status", "full")
        dem_id = mask.get("dem_id")

    if is_scalar:
        return {
            "visible": bool(visible.item()),
            "effective_horizon_deg": round(float(required_el.item()), 3),
            "criterion": criterion,
            "margin_deg": margin_deg,
            "mode": "terrain" if mask else "flat",
            "coverage_status": coverage_status,
            "dem_id": dem_id,
        }

    return {
        "visible": visible.tolist(),
        "effective_horizon_deg": np.round(required_el, 3).tolist(),
        "criterion": criterion,
        "margin_deg": margin_deg,
        "mode": "terrain" if mask else "flat",
        "coverage_status": coverage_status,
        "dem_id": dem_id,
    }

