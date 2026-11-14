# Archived South Pole LOLA Terrain Pipeline

This folder preserves the first 80 m/pixel South Pole terrain-generation path.
It is retained for historical reference and possible comparison, but it is **not
used by the current Explorer UI**.

## Archived contents

- `scripts/build_lunar_globe_terrain.py` — the original builder for an 80 m/pixel
  LOLA hillshade and a 1024 × 1024 Float32 height grid.
- `web/public/terrain/lunar-south-pole-80m.webp` — the generated legacy
  hillshade texture.
- `web/public/terrain/lunar-south-pole-height-1024.f32` — the generated legacy
  height grid.

## Why it is archived

The current flat map and 3D globe use the newer 75°S–90°S LOLA hillshade,
2048 × 2048 height grid, and shared LROC WAC polar imagery. The active
components no longer reference either legacy asset, so they are kept out of
`web/public/terrain` to avoid deploying redundant files.

## Rebuilding the archived outputs

The preserved builder expects the original, locally-held (and Git-ignored)
LOLA source rasters at:

- `terrain/pgda/LDEM_80S_80MPP_ADJ_HILL.TIF`
- `terrain/pgda/LDEM_80S_80MPP_ADJ.TIF`

Because the builder is stored under this archive root, place those source files
under `archive/legacy-lunar-terrain/terrain/pgda/` before running it from the
repository root:

```powershell
python archive/legacy-lunar-terrain/scripts/build_lunar_globe_terrain.py
```

The generated outputs will be written inside this archive at
`web/public/terrain/`; they will not overwrite the active application assets.

## Restoring to the active application

Restore these files only when intentionally reverting to the legacy pipeline.
Copy the selected assets into the active `web/public/terrain/` folder and update
the relevant component references in the same change. Do not point the current
globe or map at these older outputs by accident.
