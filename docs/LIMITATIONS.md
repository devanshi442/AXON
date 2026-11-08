# AXON LunarSight — Scientific Limitations & Operational Caveats

> [!WARNING]
> **Mission Planning Notice:**
> AXON LunarSight provides deterministic topocentric line-of-sight geometry based on orbital altimetry and planetary ephemerides. Operational mission planning requires understanding the boundaries between geometric visibility and full engineering simulations.

---

## 1. Geometric Line-of-Sight vs RF Communications Link Budget

- **Unobstructed Vector $\ne$ Telecommunications Link:** An Earth elevation above the terrain horizon ($h_{\text{mask}} + \mu_{\text{clearance}}$) confirms geometric line-of-sight between the landing site and Earth's center of mass.
- **Excluded Telecommunications Factors:**
  - **Transponder EIRP & Path Loss:** Transmitter power, antenna beamwidth, and free-space path loss ($\approx 210\text{ dB}$ at X-band and Ka-band) are not modeled.
  - **Ground Station Scheduling:** Availability of receiving ground stations (NASA Deep Space Network 34m/70m dishes or commercial ground networks like KSAT / Goonhilly) is not scheduled.
  - **Terrestrial & Space Weather:** Atmospheric attenuation on Earth (rain fade, tropospheric absorption, ionospheric scintillation) is omitted.
  - **Lunar Multipath & Jitter:** Lunar surface multipath reflections, antenna pointing jitter, and polarization mismatch are excluded.

---

## 2. Solar Disk Upper Limb vs Delivered Electrical Power

- **Sun Above Skyline $\ne$ Delivered Watts:** Upper-limb visibility ($f_{\text{sun}} > 0$) confirms that grazing direct solar rays reach the topocentric observer point.
- **Excluded Photovoltaic Factors:**
  - **Panel Thermal Derating:** High surface temperatures during the lunar midday decrease silicon and GaAs solar cell bandgap efficiency; this thermal coefficient is not modeled.
  - **Plume Dust Contamination:** Landing engine exhaust lofts abrasive lunar regolith particles that settle on solar arrays, reducing transmittance.
  - **Battery & Power Conditioning Losses:** Battery charge/discharge round-trip efficiency ($\approx 85\text{–}90\%$), bus voltage regulation losses, and parasitic survival heater loads are not simulated.
  - **Lander Micro-Tilt:** Lander tilt relative to local surface normals alters array cosine incidence angles.

---

## 3. Digital Elevation Model (DEM) Resolution & Feature Scale

- **Raster Resolution Limits:** LOLA GDR polar DEMs provide resolutions between $20\text{ m/pixel}$ (`LDEM_875S_20M`, `LDEM_85S_20M`, `LDEM_80S_20M`), $30\text{ m/pixel}$ (`LDEM_75S_30M`), and $64\text{ pixels/degree}$ ($\approx 474\text{ m/pixel}$ for `LDEM_64`).
- **Sub-Pixel Obstacles:** While large craters, impact basins, massifs, and regional ridges are accurately resolved, sub-pixel hazards (such as 1–5 meter boulders, small craters, micro-dunes, and local touchdown slopes) cannot be resolved and may cast localized shadows.
- **Horizon Skyline vs Multi-Bounce Scattering:** The model computes direct line-of-sight skyline horizons. Secondary solar reflection (albedo scattering from illuminated crater rims onto shadowed crater floors) and thermal re-radiation are not calculated.

---

## 4. Region Centroid vs Specific Evaluated Landing Crests

- **Candidate Region Centroids:** Broad exploration regions defined in NASA Artemis announcements cover exploration areas $2\text{ km}$ to $50\text{ km}$ across. Region centroids often lie in local topographic saddles or crater floors.
- **The Malapert Massif Case Study:**
  - **Stated Region Centroid ($-85.99^\circ\text{S}, -2.93^\circ\text{E}$):** Lies at $+4,841\text{ m}$ elevation behind a northern topographic crest, causing **$0.0\%$ Earth line-of-sight** across all 5 years.
  - **DEM-Derived Crest ($-85.9627^\circ\text{S}, -2.3725^\circ\text{E}$):** Located $\approx 1.4\text{ km}$ northeast at $+4,993\text{ m}$, this ridge crest achieves continuous **$100.0\%$ Earth line-of-sight**.
  - **Architectural Handling:** This operational caveat is documented directly in the UI and catalog notes via `SITE_ANNOTATIONS` in [`science/lunarsight_core/sites.py`](../science/lunarsight_core/sites.py) compiled through [`pipeline/validate_missions.py`](../pipeline/validate_missions.py).

---

## 5. The "Flat Sphere, 0 Deg Horizon" Baseline

- **Definition:** The baseline comparison models the Moon as an idealized, uniform sphere of radius $R = 1,737.4\text{ km}$ with elevation $0\text{ m}$ and an unoccluded $0.0^\circ$ tangent horizon.
- **Non-Equivalence for Elevated Peaks:** The baseline is **not** an equivalent horizon at the site's elevation. An observer standing atop a high summit (such as Connecting Ridge at $+1,653\text{ m}$) looks downward over lower surrounding lowlands, depressing the local horizon dip angle to $-3.37^\circ$. Consequently, peak terrain illumination ($58.3\%$) exceeds the flat sphere datum ($53.4\%$).
