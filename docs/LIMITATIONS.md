# AXON LunarSight — Scientific Limitations & Operational Caveats

## 1. Digital Elevation Model (DEM) Resolution & Feature Scale
- **Raster Resolution:** The polar DEMs (LOLA GDR) provide resolutions of 20 m/pixel (`LDEM_875S_20M`, `LDEM_85S_20M`, `LDEM_80S_20M`), 30 m/pixel (`LDEM_75S_30M`), 40 m/pixel (`LDEM_80S_40M`), and 64 pixels/degree (`LDEM_64` global).
- **Sub-Pixel Obstacles:** While large craters, ridges, and massifs are accurately represented, sub-pixel topography (e.g. 1–5 meter boulders, small craters, micro-dune ripples, lander tilt on sloping terrain) cannot be resolved.
- **Horizon Skyline vs Local Viewshed:** The model computes the topocentric horizon skyline (the elevation profile of the surrounding horizon). It does not compute secondary solar reflection from illuminated crater rims onto shadowed terrain, nor does it model subsurface thermal conduction.

---

## 2. Geometric Line-of-Sight vs RF Link Budget
- **No Link Margin Computation:** An Earth elevation above the terrain horizon indicates that geometric line-of-sight exists between the lunar surface and Earth's center of mass.
- **Excluded RF Factors:** Actual radio frequency communications depend on:
  - Spacecraft antenna gain pattern and pointing accuracy
  - Transmitter power (EIRP) and free-space path loss (~210 dB at X-band / Ka-band)
  - Ground station availability (NASA Deep Space Network / commercial antennas)
  - Atmospheric attenuation on Earth (rain fade, ionospheric scintillation)
  - Lunar multipath reflections and antenna polarization mismatch

---

## 3. Solar Disk Visibility vs Delivered Electrical Power
- **Sun Above Horizon:** Upper-limb visibility indicates that solar rays reach the topocentric observer point ($f_{\text{sun}} > 0$).
- **Excluded Photovoltaic Factors:** Actual electrical power generated depends on:
  - Sun incidence angle on the solar array ($\cos i$)
  - Solar array surface orientation and lander tilt
  - Temperature degradation (solar panel efficiency decreases at high temperatures during the lunar midday)
  - Lunar dust deposition from rocket exhaust during touchdown
  - Battery charge/discharge round-trip efficiency and thermal parasitic heater loads

---

## 4. Coordinate Uncertainty & Data Verification Protocol
- **Null Coordinates Skipped:** Planned missions with undefined landing coordinates (`moon-base-1-endurance`) are explicitly skipped by the site registry and build pipeline. They are never assigned placeholder or fabricated coordinates.
- **Two-Reviewer Verification Protocol:** Every mission and site in `data/missions.yaml` carries an explicit `verified` boolean flag. Entries remain marked `verified: false` until an independent second reviewer verifies the landing coordinates and date against primary flight documentation or post-landing orbital imaging (e.g. LROC NAC).

