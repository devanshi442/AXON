#!/usr/bin/env python3
"""Build browser-ready South Pole LOLA terrain assets.

Sources:
- terrain/pgda/LDEM_80S_80MPP_ADJ_HILL.TIF (80 m/pixel hillshade)
- terrain/pgda/LDEM_80S_80MPP_ADJ.TIF (80 m/pixel elevation)

The hillshade keeps its native 7,600 px grid for crisp map/globe texture.
The compact Float32 elevation grid is used to displace the 3D polar mesh.
"""
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_HILLSHADE = ROOT / "terrain" / "pgda" / "LDEM_80S_80MPP_ADJ_HILL.TIF"
SOURCE_ELEVATION = ROOT / "terrain" / "pgda" / "LDEM_80S_80MPP_ADJ.TIF"
OUTPUT_DIR = ROOT / "web" / "public" / "terrain"
HILLSHADE_OUTPUT = OUTPUT_DIR / "lunar-south-pole-80m.webp"
HEIGHT_OUTPUT = OUTPUT_DIR / "lunar-south-pole-height-1024.f32"
HEIGHT_SIZE = 1024


def build_hillshade() -> None:
    if not SOURCE_HILLSHADE.is_file():
        raise FileNotFoundError(f"Missing local LOLA hillshade: {SOURCE_HILLSHADE}")

    with rasterio.open(SOURCE_HILLSHADE) as dataset:
        shade = dataset.read(1).astype(np.float32, copy=False)
        valid = np.isfinite(shade)
        if dataset.nodata is not None:
            valid &= shade != dataset.nodata

    # Normalize in-place to keep peak memory modest while retaining the
    # native 7,600 px grid (80 m/pixel).
    np.subtract(shade, 65.0, out=shade)
    np.divide(shade, 170.0, out=shade)
    np.clip(shade, 0.0, 1.0, out=shade)
    np.power(shade, 0.92, out=shade)
    shade *= 202.0
    shade += 38.0

    rgba = np.empty((*shade.shape, 4), dtype=np.uint8)
    rgba[..., 0] = np.clip(shade * 0.84, 0, 255).astype(np.uint8)
    rgba[..., 1] = np.clip(shade * 0.90, 0, 255).astype(np.uint8)
    rgba[..., 2] = np.clip(shade, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 242, 0).astype(np.uint8)

    Image.fromarray(rgba, mode="RGBA").save(
        HILLSHADE_OUTPUT,
        format="WEBP",
        quality=92,
        method=6,
    )


def build_height_grid() -> None:
    if not SOURCE_ELEVATION.is_file():
        raise FileNotFoundError(f"Missing local LOLA elevation raster: {SOURCE_ELEVATION}")

    with rasterio.open(SOURCE_ELEVATION) as dataset:
        height = dataset.read(
            1,
            out_shape=(HEIGHT_SIZE, HEIGHT_SIZE),
            resampling=Resampling.bilinear,
        ).astype(np.float32, copy=False)

    # Invalid coverage is kept at zero displacement; the alpha-masked
    # hillshade texture defines the visible coverage boundary.
    height[~np.isfinite(height)] = 0.0
    height.astype("<f4", copy=False).tofile(HEIGHT_OUTPUT)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_hillshade()
    build_height_grid()

    print(
        f"Built {HILLSHADE_OUTPUT.relative_to(ROOT)} "
        f"({HILLSHADE_OUTPUT.stat().st_size / (1024 * 1024):.2f} MiB, "
        "7,600 x 7,600, 80 m/pixel)"
    )
    print(
        f"Built {HEIGHT_OUTPUT.relative_to(ROOT)} "
        f"({HEIGHT_OUTPUT.stat().st_size / (1024 * 1024):.2f} MiB, "
        f"{HEIGHT_SIZE} x {HEIGHT_SIZE} Float32 elevations)"
    )


if __name__ == "__main__":
    main()
