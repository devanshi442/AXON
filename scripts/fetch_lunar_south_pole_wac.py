#!/usr/bin/env python3
"""Fetch the LROC WAC South Pole image used by AXON's 2D and 3D views.

Source service:
  LROC / Lunaserv WMS, layer: luna_wac_global
  Projection: IAU2000:30120 (Moon south-polar stereographic)
  Coverage: 70°S to 90°S, centred at 90°S / 0°E

The full 70°S disk is requested as 4096 x 4096 pixels. The effective
download spacing is ~299 m/pixel (the upstream WAC layer is nominally
100 m/pixel). This is sized to the Explorer's current maximum zoom and
keeps the Three.js texture practical for desktop and mobile GPUs.
"""
from __future__ import annotations

from io import BytesIO
import math
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "web" / "public" / "terrain" / "lunar-south-pole-wac-70s-299m.webp"

RADIUS_M = 1_737_400.0
HALF_EXTENT_M = 2.0 * RADIUS_M * math.tan(math.radians(10.0))
IMAGE_SIZE = 4096
WMS_HOSTS = [
    "https://wms.im-ldi.com/",
    *(f"https://wms{i}.im-ldi.com/" for i in range(1, 8)),
]


def fetch_image() -> Image.Image:
    bbox = ",".join(f"{value:.3f}" for value in (
        -HALF_EXTENT_M, -HALF_EXTENT_M, HALF_EXTENT_M, HALF_EXTENT_M
    ))
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": "luna_wac_global",
        "STYLES": "",
        "SRS": "IAU2000:30120",
        "BBOX": bbox,
        "WIDTH": str(IMAGE_SIZE),
        "HEIGHT": str(IMAGE_SIZE),
        "FORMAT": "image/jpeg",
        "TRANSPARENT": "FALSE",
    }

    errors: list[str] = []
    for host in WMS_HOSTS:
        url = host + "?" + urlencode(params)
        request = Request(url, headers={"User-Agent": "AXON-LunarSight/1.0"})
        try:
            with urlopen(request, timeout=120) as response:
                content_type = response.headers.get("Content-Type", "")
                if "image/" not in content_type.lower():
                    raise RuntimeError(f"Expected image response, received {content_type!r}")
                payload = response.read()
            image = Image.open(BytesIO(payload)).convert("L")
            if image.size != (IMAGE_SIZE, IMAGE_SIZE):
                raise RuntimeError(f"Unexpected WMS image size: {image.size}")
            print(f"Fetched WAC from {host} ({len(payload) / 1_000_000:.2f} MB)")
            return image
        except (URLError, TimeoutError, OSError, RuntimeError) as exc:
            errors.append(f"{host}: {exc}")

    raise RuntimeError("All LROC WMS endpoints failed:\n" + "\n".join(errors))


def main() -> None:
    image = fetch_image()
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).ellipse(
        (0, 0, IMAGE_SIZE - 1, IMAGE_SIZE - 1),
        fill=255,
    )
    rgba = Image.merge("RGBA", (image, image, image, mask))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(OUTPUT, "WEBP", quality=92, method=6)
    print(
        f"Built {OUTPUT.relative_to(ROOT)} "
        f"({OUTPUT.stat().st_size / 1_000_000:.2f} MB, "
        f"{IMAGE_SIZE} x {IMAGE_SIZE}, "
        f"{(2 * HALF_EXTENT_M / IMAGE_SIZE):.1f} m/output pixel)"
    )


if __name__ == "__main__":
    main()