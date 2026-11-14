"""
terrain.py — DEM raster access, projection mathematics, windowed caching, and coverage testing.

Supports:
- Polar stereographic LOLA DEMs (75S, 80S, 85S, 875S at 20m, 30m, 40m)
- Global cylindrical LOLA DEM (64 ppd, LDEM_64.JP2)
- LOLA PSR binary map (LPSR_85S_060M_201608.JP2)
- Windowed caching to avoid multi-GB raster memory allocations
- Exact Moon spherical polar stereographic transformations (R = 1737400 m, lat_ts = -90°)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import rasterio
from rasterio.windows import Window

from lunarsight_core import constants as C

MOON_RADIUS_M = C.MOON_RADIUS_KM * 1000.0  # 1737400.0 m
NODATA_VALUE = -32768


@dataclass
class DEMInfo:
    id: str
    name: str
    filename: str
    proj_type: str  # "polar_stereographic" | "cylindrical"
    resolution_m: float
    max_lat: float  # e.g. -75.0, -80.0, -85.0, -87.5
    min_lat: float  # -90.0
    bound_box_m: float  # half-width in meters from pole (e.g. 151680.0)
    scale: float = 0.5
    offset_m: float = 1737400.0


# Catalogue of supported DEMs in priority order (highest resolution first)
DEM_CATALOGUE: Dict[str, DEMInfo] = {
    "LDEM_875S_20M": DEMInfo(
        id="LDEM_875S_20M",
        name="LOLA 87.5°S 20 m/px DEM",
        filename="LDEM_875S_20M.JP2",
        proj_type="polar_stereographic",
        resolution_m=20.0,
        max_lat=-87.5,
        min_lat=-90.0,
        bound_box_m=75840.0,
    ),
    "LDEM_85S_20M": DEMInfo(
        id="LDEM_85S_20M",
        name="LOLA 85°S 20 m/px DEM",
        filename="LDEM_85S_20M.JP2",
        proj_type="polar_stereographic",
        resolution_m=20.0,
        max_lat=-85.0,
        min_lat=-90.0,
        bound_box_m=151680.0,
    ),
    "LDEM_85S_40M": DEMInfo(
        id="LDEM_85S_40M",
        name="LOLA 85°S 40 m/px DEM",
        filename="LDEM_85S_40M.JP2",
        proj_type="polar_stereographic",
        resolution_m=40.0,
        max_lat=-85.0,
        min_lat=-90.0,
        bound_box_m=151680.0,
    ),
    "LDEM_80S_20M": DEMInfo(
        id="LDEM_80S_20M",
        name="LOLA 80°S 20 m/px DEM",
        filename="LDEM_80S_20M.JP2",
        proj_type="polar_stereographic",
        resolution_m=20.0,
        max_lat=-80.0,
        min_lat=-90.0,
        bound_box_m=304000.0,
    ),
    "LDEM_80S_40M": DEMInfo(
        id="LDEM_80S_40M",
        name="LOLA 80°S 40 m/px DEM",
        filename="LDEM_80S_40M.JP2",
        proj_type="polar_stereographic",
        resolution_m=40.0,
        max_lat=-80.0,
        min_lat=-90.0,
        bound_box_m=304000.0,
    ),
    "LDEM_75S_30M": DEMInfo(
        id="LDEM_75S_30M",
        name="LOLA 75°S 30 m/px DEM",
        filename="LDEM_75S_30M.JP2",
        proj_type="polar_stereographic",
        resolution_m=30.0,
        max_lat=-75.0,
        min_lat=-90.0,
        bound_box_m=457440.0,
    ),
    "LDEM_64": DEMInfo(
        id="LDEM_64",
        name="LOLA Global 64 ppd DEM (~474 m/px)",
        filename="global/LDEM_64.JP2",
        proj_type="cylindrical",
        resolution_m=473.8,
        max_lat=90.0,
        min_lat=-90.0,
        bound_box_m=0.0,
    ),
}


def latlon_to_polar_xy(lat_deg: float | np.ndarray, lon_deg: float | np.ndarray) -> Tuple[Any, Any]:
    """
    Convert (lat, lon) to South Polar Stereographic (x, y) coordinates in meters
    on Moon sphere R = 1737400 m, lat_ts = -90°, lon_0 = 0°.
    Matches LOLA GDR projection exactly. Supports scalar and numpy arrays.
    """
    colat_rad = np.radians(90.0 + np.asarray(lat_deg))  # 0 at South Pole
    r = 2.0 * MOON_RADIUS_M * np.tan(colat_rad / 2.0)
    lon_rad = np.radians(np.asarray(lon_deg))
    x = r * np.sin(lon_rad)
    y = r * np.cos(lon_rad)
    if isinstance(lat_deg, (int, float)) and isinstance(lon_deg, (int, float)):
        return float(x), float(y)
    return x, y


def polar_xy_to_latlon(x: float | np.ndarray, y: float | np.ndarray) -> Tuple[Any, Any]:
    """
    Convert South Polar Stereographic (x, y) in meters back to (lat, lon) in degrees.
    Supports scalar and numpy arrays.
    """
    x_arr = np.asarray(x)
    y_arr = np.asarray(y)
    r = np.hypot(x_arr, y_arr)
    colat_rad = 2.0 * np.arctan(r / (2.0 * MOON_RADIUS_M))
    lat_deg = np.degrees(colat_rad) - 90.0
    lon_deg = np.degrees(np.arctan2(x_arr, y_arr))
    if isinstance(x, (int, float)) and isinstance(y, (int, float)):
        return float(lat_deg), float(lon_deg)
    return lat_deg, lon_deg


def get_terrain_dir() -> Path:
    """Return path to terrain/ directory."""
    root = Path(__file__).resolve().parent.parent.parent
    return root / "terrain"


def select_dem_for_site(
    lat_deg: float,
    lon_deg: float,
    max_range_km: float = 50.0,
    preferred_dem_id: Optional[str] = None,
) -> Tuple[Optional[DEMInfo], str, List[float]]:
    """
    Select the highest-resolution DEM whose coverage contains the site analysis window.
    Returns: (dem_info, coverage_status, max_valid_range_km_per_azimuth_360)
    Coverage status is:
      - 'full': analysis window completely covered by the DEM
      - 'partial': site is covered but some azimuths truncate before max_range_km
      - 'unavailable': site outside DEM or no file found
    """
    terrain_dir = get_terrain_dir()
    max_range_m = max_range_km * 1000.0

    # If preferred DEM specified and exists, test it
    candidates = []
    if preferred_dem_id and preferred_dem_id in DEM_CATALOGUE:
        candidates.append(DEM_CATALOGUE[preferred_dem_id])

    # Otherwise order candidates by resolution
    polar_candidates = [
        DEM_CATALOGUE["LDEM_875S_20M"],
        DEM_CATALOGUE["LDEM_85S_20M"],
        DEM_CATALOGUE["LDEM_80S_20M"],
        DEM_CATALOGUE["LDEM_75S_30M"],
        DEM_CATALOGUE["LDEM_85S_40M"],
        DEM_CATALOGUE["LDEM_80S_40M"],
    ]

    for c in polar_candidates:
        if c not in candidates:
            candidates.append(c)

    # For non-polar sites, append global DEM
    candidates.append(DEM_CATALOGUE["LDEM_64"])

    # Check each candidate
    for dem in candidates:
        dem_path = terrain_dir / dem.filename
        if not dem_path.is_file():
            continue

        if dem.proj_type == "polar_stereographic":
            # Check if site is within lat bounds
            if lat_deg > dem.max_lat or lat_deg < dem.min_lat:
                continue

            site_x, site_y = latlon_to_polar_xy(lat_deg, lon_deg)
            # Test window coverage around site
            # Check distance to boundaries: |x| <= bound, |y| <= bound
            # And distance from pole: r <= bound
            # Check 360 azimuths at max_range
            valid_ranges = []
            fully_covered = True
            for az in range(360):
                az_rad = math.radians(az)
                # Great-circle step in ENU
                # Local basis at site in polar stereographic projection:
                # East is roughly (+cos lon, -sin lon) etc., but exact great circle:
                # Step along great circle:
                sigma = max_range_m / MOON_RADIUS_M
                # Observer vector
                lat_rad = math.radians(lat_deg)
                lon_rad = math.radians(lon_deg)
                u_site = np.array([
                    math.cos(lat_rad) * math.cos(lon_rad),
                    math.cos(lat_rad) * math.sin(lon_rad),
                    math.sin(lat_rad),
                ])
                east = np.array([-math.sin(lon_rad), math.cos(lon_rad), 0.0])
                north = np.array([-math.sin(lat_rad) * math.cos(lon_rad), -math.sin(lat_rad) * math.sin(lon_rad), math.cos(lat_rad)])
                v_dir = math.cos(az_rad) * north + math.sin(az_rad) * east

                u_pt = math.cos(sigma) * u_site + math.sin(sigma) * v_dir
                pt_lat = math.degrees(math.asin(np.clip(u_pt[2], -1.0, 1.0)))
                pt_lon = math.degrees(math.atan2(u_pt[1], u_pt[0]))
                pt_x, pt_y = latlon_to_polar_xy(pt_lat, pt_lon)

                # Is pt inside dem bounds?
                inside = (abs(pt_x) <= dem.bound_box_m) and (abs(pt_y) <= dem.bound_box_m) and (pt_lat <= dem.max_lat)
                if inside:
                    valid_ranges.append(max_range_km)
                else:
                    fully_covered = False
                    # Approximate distance to boundary
                    # Binary search along great circle for max valid range
                    lo = 0.0
                    hi = max_range_m
                    for _ in range(8):
                        mid = (lo + hi) / 2.0
                        sig = mid / MOON_RADIUS_M
                        upt = math.cos(sig) * u_site + math.sin(sig) * v_dir
                        plat = math.degrees(math.asin(np.clip(upt[2], -1.0, 1.0)))
                        plon = math.degrees(math.atan2(upt[1], upt[0]))
                        px, py = latlon_to_polar_xy(plat, plon)
                        if (abs(px) <= dem.bound_box_m) and (abs(py) <= dem.bound_box_m) and (plat <= dem.max_lat):
                            lo = mid
                        else:
                            hi = mid
                    valid_ranges.append(round(lo / 1000.0, 2))

            if fully_covered:
                return dem, "full", [max_range_km] * 360
            elif not preferred_dem_id:
                # If not fully covered, try next larger DEM before settling for partial
                continue
            else:
                return dem, "partial", valid_ranges

        elif dem.proj_type == "cylindrical":
            # Global cylindrical covers all latitudes
            return dem, "full", [max_range_km] * 360

    # If no fully covered polar DEM was found, check if the largest polar DEM (75S) partially covers it
    dem_75 = DEM_CATALOGUE["LDEM_75S_30M"]
    dem_75_path = terrain_dir / dem_75.filename
    if dem_75_path.is_file() and lat_deg <= -75.0:
        # Compute valid ranges on 75S
        valid_ranges = []
        for az in range(360):
            az_rad = math.radians(az)
            sigma = max_range_m / MOON_RADIUS_M
            lat_rad = math.radians(lat_deg)
            lon_rad = math.radians(lon_deg)
            u_site = np.array([
                math.cos(lat_rad) * math.cos(lon_rad),
                math.cos(lat_rad) * math.sin(lon_rad),
                math.sin(lat_rad),
            ])
            east = np.array([-math.sin(lon_rad), math.cos(lon_rad), 0.0])
            north = np.array([-math.sin(lat_rad) * math.cos(lon_rad), -math.sin(lat_rad) * math.sin(lon_rad), math.cos(lat_rad)])
            v_dir = math.cos(az_rad) * north + math.sin(az_rad) * east

            lo = 0.0
            hi = max_range_m
            for _ in range(8):
                mid = (lo + hi) / 2.0
                sig = mid / MOON_RADIUS_M
                upt = math.cos(sig) * u_site + math.sin(sig) * v_dir
                plat = math.degrees(math.asin(np.clip(upt[2], -1.0, 1.0)))
                plon = math.degrees(math.atan2(upt[1], upt[0]))
                px, py = latlon_to_polar_xy(plat, plon)
                if (abs(px) <= dem_75.bound_box_m) and (abs(py) <= dem_75.bound_box_m) and (plat <= dem_75.max_lat):
                    lo = mid
                else:
                    hi = mid
            valid_ranges.append(round(lo / 1000.0, 2))
        return dem_75, "partial", valid_ranges

    # Fall back to global if available
    glob_dem = DEM_CATALOGUE["LDEM_64"]
    if (terrain_dir / glob_dem.filename).is_file():
        return glob_dem, "full", [max_range_km] * 360

    return None, "unavailable", [0.0] * 360


# ── Windowed Raster Cache ───────────────────────────────────────────────────

_RASTER_CACHE: Dict[str, Any] = {}


class WindowedDEM:
    """
    Cached, windowed slice of a DEM raster around a given site.
    Avoids holding whole multi-gigabyte rasters in memory.
    """

    def __init__(
        self,
        dem_info: DEMInfo,
        data: np.ndarray,
        col_offset: int,
        row_offset: int,
        transform: Any,
        is_wrapped: bool = False,
        center_lon: float = 0.0,
    ):
        self.dem_info = dem_info
        self.data = data  # 2D array of DN (int16 or float32)
        self.col_offset = col_offset
        self.row_offset = row_offset
        self.transform = transform
        self.height, self.width = data.shape
        self.is_wrapped = is_wrapped
        self.center_lon = center_lon

    def sample_xy(self, x: float, y: float) -> Optional[float]:
        """
        Sample elevation in meters relative to reference sphere (1737.4 km)
        using bilinear interpolation.
        Returns None if out of window or nodata.
        """
        if self.dem_info.proj_type == "cylindrical":
            if self.is_wrapped:
                d_lon = ((x - self.center_lon + 180.0) % 360.0) - 180.0
                x = self.center_lon + d_lon
            else:
                x = ((x + 180.0) % 360.0) - 180.0

        # Pixel coordinates (aligned to pixel centers, matching rasterio +0.5 convention)
        inv_trans = ~self.transform
        col_f, row_f = inv_trans @ (x, y)
        col_local = (col_f - 0.5) - self.col_offset
        row_local = (row_f - 0.5) - self.row_offset

        if not (0 <= col_local < self.width - 1 and 0 <= row_local < self.height - 1):
            return None

        c0 = int(col_local)
        r0 = int(row_local)
        c1 = c0 + 1
        r1 = r0 + 1

        v00 = self.data[r0, c0]
        v10 = self.data[r0, c1]
        v01 = self.data[r1, c0]
        v11 = self.data[r1, c1]

        if v00 == NODATA_VALUE or v10 == NODATA_VALUE or v01 == NODATA_VALUE or v11 == NODATA_VALUE:
            return None

        dc = col_local - c0
        dr = row_local - r0

        interp_dn = (
            (1.0 - dc) * (1.0 - dr) * v00
            + dc * (1.0 - dr) * v10
            + (1.0 - dc) * dr * v01
            + dc * dr * v11
        )
        # Elevation relative to reference sphere = DN * scale
        return float(interp_dn * self.dem_info.scale)

    def sample_xy_array(self, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
        """
        Vectorized bilinear sampling of elevation in meters relative to reference sphere.
        Returns 1D np.ndarray of float64 (np.nan for nodata / out-of-bounds).
        """
        xs = np.asarray(xs, dtype=np.float64)
        ys = np.asarray(ys, dtype=np.float64)

        if self.dem_info.proj_type == "cylindrical":
            if self.is_wrapped:
                d_lon = ((xs - self.center_lon + 180.0) % 360.0) - 180.0
                xs = self.center_lon + d_lon
            else:
                xs = ((xs + 180.0) % 360.0) - 180.0

        c_trans = self.transform

        col_f = (xs - c_trans[2]) / c_trans[0]
        row_f = (ys - c_trans[5]) / c_trans[4]

        col_local = (col_f - 0.5) - self.col_offset
        row_local = (row_f - 0.5) - self.row_offset

        valid = (col_local >= 0) & (col_local < self.width - 1) & (row_local >= 0) & (row_local < self.height - 1)
        out = np.full(len(xs), np.nan, dtype=np.float64)
        if not np.any(valid):
            return out

        c_sub = col_local[valid]
        r_sub = row_local[valid]

        c0 = c_sub.astype(np.int32)
        r0 = r_sub.astype(np.int32)
        c1 = c0 + 1
        r1 = r0 + 1

        v00 = self.data[r0, c0]
        v10 = self.data[r0, c1]
        v01 = self.data[r1, c0]
        v11 = self.data[r1, c1]

        data_valid = (v00 != NODATA_VALUE) & (v10 != NODATA_VALUE) & (v01 != NODATA_VALUE) & (v11 != NODATA_VALUE)

        dc = c_sub - c0
        dr = r_sub - r0

        interp = (
            (1.0 - dc) * (1.0 - dr) * v00
            + dc * (1.0 - dr) * v10
            + (1.0 - dc) * dr * v01
            + dc * dr * v11
        )

        valid_idx = np.where(valid)[0]
        out[valid_idx[data_valid]] = interp[data_valid] * self.dem_info.scale
        return out

    def sample_latlon_array(self, lats_deg: np.ndarray, lons_deg: np.ndarray) -> np.ndarray:
        """Vectorized sampling at (lat, lon) arrays."""
        if self.dem_info.proj_type == "polar_stereographic":
            xs, ys = latlon_to_polar_xy(lats_deg, lons_deg)
            return self.sample_xy_array(xs, ys)
        else:
            return self.sample_xy_array(lons_deg, lats_deg)

    def sample_latlon(self, lat_deg: float, lon_deg: float) -> Optional[float]:
        """Sample elevation at given (lat, lon) in degrees."""
        if self.dem_info.proj_type == "polar_stereographic":
            x, y = latlon_to_polar_xy(lat_deg, lon_deg)
            return self.sample_xy(x, y)
        elif self.dem_info.proj_type == "cylindrical":
            return self.sample_xy(lon_deg, lat_deg)
        return None


def get_windowed_dem(
    dem_info: DEMInfo,
    lat_deg: float,
    lon_deg: float,
    max_range_km: float = 50.0,
) -> WindowedDEM:
    """
    Read and cache a windowed subgrid of the DEM around the site.
    Buffer = max_range + 5 km.
    """
    terrain_dir = get_terrain_dir()
    dem_path = terrain_dir / dem_info.filename
    if not dem_path.is_file():
        raise FileNotFoundError(f"DEM raster file not found: {dem_path}")

    # Cache key rounded to ~2 km
    cache_key = f"{dem_info.id}_{round(lat_deg, 2)}_{round(lon_deg, 2)}_{round(max_range_km, 1)}"
    if cache_key in _RASTER_CACHE:
        return _RASTER_CACHE[cache_key]

    with rasterio.open(dem_path) as src:
        transform = src.transform
        inv_trans = ~transform

        if dem_info.proj_type == "polar_stereographic":
            site_x, site_y = latlon_to_polar_xy(lat_deg, lon_deg)
            buffer_m = (max_range_km + 5.0) * 1000.0
            x_min = site_x - buffer_m
            x_max = site_x + buffer_m
            y_min = site_y - buffer_m
            y_max = site_y + buffer_m

            col_min_f, row_max_f = inv_trans @ (x_min, y_min)
            col_max_f, row_min_f = inv_trans @ (x_max, y_max)
            c_min = max(0, int(math.floor(min(col_min_f, col_max_f))))
            c_max = min(src.width, int(math.ceil(max(col_min_f, col_max_f))))
            r_min = max(0, int(math.floor(min(row_min_f, row_max_f))))
            r_max = min(src.height, int(math.ceil(max(row_min_f, row_max_f))))
            width = c_max - c_min
            height = r_max - r_min
            window = Window(c_min, r_min, width, height)
            data = src.read(1, window=window)
            is_wrapped = False
            center_lon = lon_deg
        else:
            # Cylindrical with seamless anti-meridian wrap support
            d_deg = (max_range_km + 5.0) / (C.MOON_RADIUS_KM * math.pi / 180.0)
            norm_lon = ((lon_deg + 180.0) % 360.0) - 180.0
            col_center_f, row_center_f = inv_trans @ (norm_lon, lat_deg)
            half_w = int(math.ceil(d_deg / transform[0])) + 2
            half_h = int(math.ceil(d_deg / abs(transform[4]))) + 2

            r_min = max(0, int(math.floor(row_center_f - half_h)))
            r_max = min(src.height, int(math.ceil(row_center_f + half_h)))
            h_win = r_max - r_min

            c_left_idx = int(math.floor(col_center_f - half_w))
            c_right_idx = int(math.ceil(col_center_f + half_w))

            if c_left_idx < 0:
                # Wraps across -180 longitude seam
                w_left = Window(0, r_min, c_right_idx, h_win)
                d_left = src.read(1, window=w_left)
                wrap_w = -c_left_idx
                w_wrap = Window(src.width - wrap_w, r_min, wrap_w, h_win)
                d_wrap = src.read(1, window=w_wrap)
                data = np.hstack([d_wrap, d_left])
                c_min = src.width - wrap_w
                is_wrapped = True
                center_lon = 180.0
            elif c_right_idx > src.width:
                # Wraps across +180 longitude seam
                w_right = Window(c_left_idx, r_min, src.width - c_left_idx, h_win)
                d_right = src.read(1, window=w_right)
                wrap_w = c_right_idx - src.width
                w_wrap = Window(0, r_min, wrap_w, h_win)
                d_wrap = src.read(1, window=w_wrap)
                data = np.hstack([d_right, d_wrap])
                c_min = c_left_idx
                is_wrapped = True
                center_lon = 180.0
            else:
                window = Window(c_left_idx, r_min, c_right_idx - c_left_idx, h_win)
                data = src.read(1, window=window)
                c_min = c_left_idx
                is_wrapped = False
                center_lon = norm_lon

        w_dem = WindowedDEM(
            dem_info=dem_info,
            data=data,
            col_offset=c_min,
            row_offset=r_min,
            transform=transform,
            is_wrapped=is_wrapped,
            center_lon=center_lon,
        )

        # Evict cache if too large (> 10 items)
        if len(_RASTER_CACHE) > 10:
            _RASTER_CACHE.pop(next(iter(_RASTER_CACHE)))

        _RASTER_CACHE[cache_key] = w_dem
        return w_dem


def sample_height_at_point(
    lat_deg: float,
    lon_deg: float,
    dem_info: Optional[DEMInfo] = None,
) -> Tuple[float, DEMInfo]:
    """
    Sample elevation in meters at a specific point on the Moon.
    If dem_info is None, automatically selects the highest resolution DEM available.
    """
    if dem_info is None:
        dem_info, _, _ = select_dem_for_site(lat_deg, lon_deg, max_range_km=10.0)
        if dem_info is None:
            return 0.0, DEM_CATALOGUE["LDEM_64"]

    w_dem = get_windowed_dem(dem_info, lat_deg, lon_deg, max_range_km=10.0)
    h = w_dem.sample_latlon(lat_deg, lon_deg)
    if h is None:
        return 0.0, dem_info
    return round(h, 2), dem_info
