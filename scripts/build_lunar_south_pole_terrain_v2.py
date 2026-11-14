#!/usr/bin/env python3
"""Build browser-ready South Pole LOLA assets from the 30 m 75S DEM.

Input:
  terrain/LDEM_75S_30M.JP2
  - 30 m/pixel
  - 75°S to 90°S
  - South-polar stereographic, centred at 90°S, 0°E
  - DN scale = 0.5 m; values are relative to the lunar reference radius

Outputs:
  web/public/terrain/lunar-south-pole-75s-120m.webp
  web/public/terrain/lunar-south-pole-height-2048.f32

The display hillshade is resampled to 7,600 x 7,600 (~120 m/pixel) to stay
within practical WebGL texture/memory limits. The compact height grid is
2048 x 2048 and is used only for visual relief displacement.
"""
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DEM = ROOT / "terrain" / "LDEM_75S_30M.JP2"
OUTPUT_DIR = ROOT / "web" / "public" / "terrain"
HILLSHADE_OUTPUT = OUTPUT_DIR / "lunar-south-pole-75s-120m.webp"
HEIGHT_OUTPUT = OUTPUT_DIR / "lunar-south-pole-height-2048.f32"

HALF_EXTENT_M = 457_440.0
IMAGE_SIZE = 7_600
HEIGHT_SIZE = 2_048
NODATA_DN = -32768


def read_elevation(out_size: int) -> tuple[np.ndarray, np.ndarray, float]:
    if not SOURCE_DEM.is_file():
        raise FileNotFoundError(f"Missing LOLA 75S DEM: {SOURCE_DEM}")

    with rasterio.open(SOURCE_DEM) as dataset:
        raw = dataset.read(
            1,
            out_shape=(out_size, out_size),
            resampling=Resampling.bilinear,
        )

    valid = raw != NODATA_DN
    # PDS label: 0.5 m/DN relative to the 1,737,400 m reference radius.
    elevation = raw.astype(np.float32) * 0.5
    elevation[~valid] = 0.0
    pixel_size = (2.0 * HALF_EXTENT_M) / out_size
    return elevation, valid, pixel_size


def make_hillshade() -> None:
    elevation, valid, pixel_size = read_elevation(IMAGE_SIZE)

    # Raster rows run north-to-south, so y spacing is negative northing.
    dz_dnorth, dz_deast = np.gradient(elevation, -pixel_size, pixel_size)

    # Illumination from azimuth 315° and altitude 32°.
    azimuth = np.deg2rad(315.0)
    altitude = np.deg2rad(32.0)
    nx = -dz_deast
    ny = -dz_dnorth
    nz = np.ones_like(elevation)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= norm
    ny /= norm
    nz /= norm

    sun_east = np.cos(altitude) * np.sin(azimuth)
    sun_north = np.cos(altitude) * np.cos(azimuth)
    sun_up = np.sin(altitude)
    illumination = nx * sun_east + ny * sun_north + nz * sun_up
    shade = np.clip(0.24 + 0.76 * np.maximum(illumination, 0.0), 0.0, 1.0)
    shade = np.power(shade, 0.88)

    # The native coverage is a circular polar cap; corners outside 75°S
    # are explicitly transparent instead of exposing the square source grid.
    coords = (np.arange(IMAGE_SIZE, dtype=np.float32) + 0.5) * pixel_size - HALF_EXTENT_M
    xx, yy = np.meshgrid(coords, coords)
    inside_polar_coverage = (xx * xx + yy * yy) <= (HALF_EXTENT_M * HALF_EXTENT_M)
    visible = valid & inside_polar_coverage

    gray = np.clip(18.0 + shade * 226.0, 0, 255).astype(np.uint8)
    rgba = np.empty((IMAGE_SIZE, IMAGE_SIZE, 4), dtype=np.uint8)
    rgba[..., 0] = gray
    rgba[..., 1] = gray
    rgba[..., 2] = gray
    rgba[..., 3] = np.where(visible, 255, 0).astype(np.uint8)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(
        HILLSHADE_OUTPUT,
        format="WEBP",
        quality=94,
        method=6,
    )


def make_height_grid() -> None:
    elevation, valid, _ = read_elevation(HEIGHT_SIZE)
    elevation[~valid] = 0.0
    elevation.astype("<f4", copy=False).tofile(HEIGHT_OUTPUT)


def main() -> None:
    make_hillshade()
    make_height_grid()
    print(
        f"Built {HILLSHADE_OUTPUT.relative_to(ROOT)} "
        f"({HILLSHADE_OUTPUT.stat().st_size / (1024 * 1024):.2f} MiB, "
        f"{IMAGE_SIZE} x {IMAGE_SIZE}, ~120 m/pixel)"
    )
    print(
        f"Built {HEIGHT_OUTPUT.relative_to(ROOT)} "
        f"({HEIGHT_OUTPUT.stat().st_size / (1024 * 1024):.2f} MiB, "
        f"{HEIGHT_SIZE} x {HEIGHT_SIZE} Float32)"
    )


if __name__ == "__main__":
    main()
