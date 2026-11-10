"""
api/validation.py — Coordinate, timestamp, and parameter validation routines.
"""

from __future__ import annotations

import datetime
from typing import Optional, Tuple
from fastapi import HTTPException, status
from lunarsight_core import constants as C


def validate_coordinates(lat: float, lon: float) -> Tuple[float, float]:
    """
    Validate that lunar coordinates are strictly within planetary bounds:
      Latitude: -90.0° to +90.0° (Planetocentric)
      Longitude: -180.0° to +180.0° (East-positive)
    Raises HTTPException(400) or HTTPException(422) if out of bounds.
    """
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid numeric coordinate format: {exc}",
        )

    if not (C.LAT_MIN_DEG <= lat_f <= C.LAT_MAX_DEG):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Latitude {lat_f}° out of valid lunar bounds [{C.LAT_MIN_DEG}°, {C.LAT_MAX_DEG}°].",
        )

    if not (C.LON_MIN_DEG <= lon_f <= C.LON_MAX_DEG):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Longitude {lon_f}° out of valid lunar bounds [{C.LON_MIN_DEG}°, {C.LON_MAX_DEG}°].",
        )

    return lat_f, lon_f


def validate_date_range(
    start_utc: str, stop_utc: str, max_days: float = C.MAX_API_DATE_RANGE_DAYS
) -> Tuple[datetime.datetime, datetime.datetime]:
    """
    Validate ISO 8601 UTC date-time strings, chronological ordering, and maximum allowed duration.
    """
    if not start_utc or not stop_utc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both start_utc and stop_utc must be non-empty ISO 8601 strings.",
        )

    try:
        dt_start = datetime.datetime.fromisoformat(start_utc.replace("Z", "+00:00"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ISO 8601 start_utc date string '{start_utc}': {exc}",
        )

    try:
        dt_stop = datetime.datetime.fromisoformat(stop_utc.replace("Z", "+00:00"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ISO 8601 stop_utc date string '{stop_utc}': {exc}",
        )

    if dt_stop <= dt_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stop_utc must be strictly after start_utc",
        )

    delta_days = (dt_stop - dt_start).total_seconds() / 86400.0
    if delta_days > max_days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Requested range of {delta_days:.1f} days exceeds maximum allowed {max_days:.0f} days.",
        )

    return dt_start, dt_stop


def validate_step_seconds(step_seconds: int) -> int:
    """Ensure step_seconds is an integer >= MIN_STEP_SECONDS."""
    if step_seconds < C.MIN_STEP_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"step_seconds ({step_seconds}) must be at least {C.MIN_STEP_SECONDS} seconds.",
        )
    return step_seconds


MAX_SAMPLE_POINTS: int = 8784


def validate_sample_count(
    dt_start: datetime.datetime,
    dt_stop: datetime.datetime,
    step_seconds: int,
    max_samples: int = MAX_SAMPLE_POINTS,
) -> int:
    """
    Ensure requested timeseries sample count does not exceed server guard-rail limit (8,784 points).
    Protects memory and responsiveness during high-resolution requests.
    """
    total_seconds = (dt_stop - dt_start).total_seconds()
    num_samples = int(total_seconds / max(1, step_seconds)) + 1
    if num_samples > max_samples:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Requested resolution ({step_seconds}s) over {total_seconds / 86400.0:.1f} days requires "
                f"{num_samples} samples, exceeding maximum allowed limit of {max_samples} points per request."
            ),
        )
    return num_samples


def validate_mast_height(mast_height_m: float) -> float:
    """Ensure mast height is within physical bounds [0.0, 100.0] meters."""
    if not (0.0 <= mast_height_m <= 100.0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"mast_height_m ({mast_height_m}) must be between 0.0 and 100.0 meters.",
        )
    return float(mast_height_m)

