"""
power.py — Illustrative lunar solar power potential model.

Formulas & Physics:
P(t) = S(d) * A * eta * max(0, cos i) * f_sun(t)
S(d) = S0 * (1 AU / d)^2
S0 = 1361.0 W/m² (constants.py SORCE / IAU 2015 nominal)
d = instantaneous Sun-Moon distance from SPICE ephemerides

Orientations:
- 'horizontal': cos i = sin(elevation)
- 'vertical_fixed': cos i = cos(elevation) * cos(azimuth - az0)
- 'vertical_azimuth_tracking': cos i = cos(elevation)  (vertical mast azimuth tracking)
- 'sun_tracking': cos i = 1.0  (full dual-axis sun pointing)

Disclaimer:
Geometric power potential under nominal clear-sky direct solar irradiance; does not account
for thermal derating, regolith dust accumulation, battery round-trip losses, or power management link budgets.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Union
import numpy as np

from lunarsight_core import constants as C


def compute_solar_flux(sun_distance_km: Union[float, List[float], np.ndarray]) -> np.ndarray:
    """
    Compute top-of-atmosphere solar irradiance S(d) in W/m² given Sun-Moon distance in km.
    S(d) = S0 * (1 AU / d)^2
    """
    d = np.asarray(sun_distance_km, dtype=np.float64)
    # 1 AU in km
    au_km = C.AU_KM
    ratio = au_km / d
    return C.SOLAR_IRRADIANCE_W_M2 * (ratio * ratio)


def compute_incidence_angle_factor(
    sun_el_deg: Union[float, List[float], np.ndarray],
    sun_az_deg: Union[float, List[float], np.ndarray],
    orientation: str = "horizontal",
    az0_deg: float = 0.0,
) -> np.ndarray:
    """
    Compute cos(i) clipped >= 0 for selected solar panel orientation.
    """
    el_rad = np.radians(np.asarray(sun_el_deg, dtype=np.float64))
    az_rad = np.radians(np.asarray(sun_az_deg, dtype=np.float64))

    if orientation == "horizontal":
        # Panel facing zenith: normal is Up vector -> dot(Sun, Normal) = sin(el)
        cos_i = np.sin(el_rad)
    elif orientation == "vertical_fixed":
        # Vertical panel facing azimuth az0: normal in horizontal plane at az0
        az0_rad = math.radians(az0_deg)
        cos_i = np.cos(el_rad) * np.cos(az_rad - az0_rad)
    elif orientation == "vertical_azimuth_tracking":
        # Vertical cylinder / rotating mast tracking sun in azimuth: cos(az - az_sun) = 1
        cos_i = np.cos(el_rad)
    elif orientation == "sun_tracking":
        # Full 2-axis tracking normal to beam
        cos_i = np.ones_like(el_rad)
    else:
        raise ValueError(f"Unknown orientation '{orientation}'. Choose horizontal, vertical_fixed, vertical_azimuth_tracking, sun_tracking.")

    return np.clip(cos_i, 0.0, 1.0)


def compute_solar_power(
    sun_el_deg: Union[float, List[float], np.ndarray],
    sun_az_deg: Union[float, List[float], np.ndarray],
    sun_fraction: Union[float, List[float], np.ndarray],
    sun_distance_km: Optional[Union[float, List[float], np.ndarray]] = None,
    area_m2: float = 1.0,
    efficiency: float = 0.28,
    orientation: str = "horizontal",
    az0_deg: float = 0.0,
    step_seconds: int = 3600,
) -> Dict[str, Any]:
    """
    Compute solar power generation potential time series and cumulative energy metrics.
    """
    el = np.asarray(sun_el_deg, dtype=np.float64)
    az = np.asarray(sun_az_deg, dtype=np.float64)
    frac = np.asarray(sun_fraction, dtype=np.float64)

    if sun_distance_km is None:
        flux = np.full_like(el, C.SOLAR_IRRADIANCE_W_M2)
    else:
        flux = compute_solar_flux(sun_distance_km)

    cos_i = compute_incidence_angle_factor(el, az, orientation=orientation, az0_deg=az0_deg)

    # Specific power per m² of array: P_spec = S(d) * eta * cos(i) * f_sun
    specific_power_w_m2 = flux * efficiency * cos_i * frac
    # Total power in Watts: P = P_spec * A
    power_watts = specific_power_w_m2 * area_m2

    step_hours = step_seconds / 3600.0
    total_energy_wh = float(np.sum(power_watts) * step_hours)
    specific_energy_wh_m2 = float(np.sum(specific_power_w_m2) * step_hours)

    peak_power_w = float(np.max(power_watts)) if len(power_watts) > 0 else 0.0
    mean_power_w = float(np.mean(power_watts)) if len(power_watts) > 0 else 0.0

    return {
        "area_m2": area_m2,
        "efficiency": efficiency,
        "orientation": orientation,
        "az0_deg": az0_deg,
        "power_watts": np.round(power_watts, 2).tolist(),
        "specific_power_w_m2": np.round(specific_power_w_m2, 2).tolist(),
        "total_energy_wh": round(total_energy_wh, 1),
        "specific_energy_wh_m2": round(specific_energy_wh_m2, 1),
        "peak_power_watts": round(peak_power_w, 2),
        "mean_power_watts": round(mean_power_w, 2),
        "caveat": "Geometric potential under clear-sky solar irradiance, not a mission power subsystem prediction.",
    }
