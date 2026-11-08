"""
constants.py — AXON LunarSight science conventions.

Physical constants added 2026-10-24 (Tier 2-F of the data-acquisition task).
Citation key abbreviations used in comments:
  IAU2015  = IAU 2015 nominal solar and planetary radii
             (Prša et al. 2016, AJ 152, 41)  https://doi.org/10.3847/0004-6256/152/2/41
  SORCE    = NASA SORCE mission TIM instrument composite (avg 2003-2019)
             Coddington et al. 2016, BAMS: https://doi.org/10.1175/BAMS-D-14-00265.1
  NAIF-PCK = NAIF pck00011.tpc, accessed 2026-10-21
             https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc
  HOR-HDR  = JPL Horizons header in science/fixtures/horizons/im-1_sun_2024-02-22_2024-03-22.json
             field: "Solar constant (1 AU) = 1367.6 W/m^2" [source: DE441 header text]

These values are the single source of truth for every computation in this project.
They are also displayed on the Methods page of the web app (web/src/pages/Methods.tsx).

CONVENTIONS (§4.4 of the blueprint, Rule 4 of the project spec)
───────────────────────────────────────────────────────────────
• Time input and display:  UTC
• Internal time scale:     Ephemeris Time (ET) via NAIF leap-seconds kernel
• Longitude convention:    East-positive, range −180 to +180 degrees
• Latitude convention:     Planetocentric
• Reference frame:         Lunar mean-Earth/polar-axis frame  (SPICE name: "MOON_ME")
                           This is the frame used by LOLA and by JPL Horizons for
                           lunar-surface observers.  Do NOT mix with the principal-axis
                           frame (MOON_PA).
• Reference radius:        1737.4 km  (IAU / NAIF pck00011.tpc value)
• Atmospheric refraction:  None (the Moon has no appreciable atmosphere)
• Sun "up" definition:     Upper limb — Sun is considered above the horizon when
                           (center elevation + SUN_ANGULAR_RADIUS_DEG) > horizon mask.
                           Default: flat horizon = 0°.
• Flat-horizon label:      "Idealized horizon, not terrain-aware"
• Earth visibility label:  "Geometric only — not a communication link budget"
• No values are invented.  Unknown = None in Python / null in JSON / "Not published" in UI.
"""

# ── Lunar body ──────────────────────────────────────────────────────────────
MOON_RADIUS_KM: float = 1737.4          # IAU mean radius; used in terrain curvature math
MOON_NAIF_ID: int = 301                  # NAIF body code for the Moon
MOON_FRAME: str = "MOON_ME"             # Mean-Earth/polar-axis frame (LOLA convention)

# ── Sun ─────────────────────────────────────────────────────────────────────
SUN_NAIF_ID: int = 10

# Sun mean radius  [IAU2015]
SUN_RADIUS_KM: float = 695700.0

# Solar irradiance at 1 AU
# Two values appear in this project:
#   1367.6 W/m² — from JPL Horizons DE441 header text (HOR-HDR).
#               This is the historical WMO/NASA 1981 value still embedded in the
#               Horizons banner text; it is NOT a measured value.
#   1361.0 W/m² — NASA SORCE/TIM measured mean (2003-2019), IAU 2015 nominal (SORCE).
#               This is the modern accepted value for modelling purposes.
# Decision: use 1361.0 W/m² for science calculations; retain 1367.6 for cross-checking
# Horizons output metadata only.
SOLAR_IRRADIANCE_W_M2: float = 1361.0          # SORCE / IAU 2015 nominal [SORCE]
SOLAR_IRRADIANCE_HORIZONS_W_M2: float = 1367.6  # Horizons banner text only [HOR-HDR]

# Mean Sun–Moon distance used for angular radius calculation
# 1 AU = IAU 2012 definition
AU_KM: float = 149_597_870.7

# Angular radius of the Sun as seen from the Moon at 1 AU (mean)
# Formula: atan(R_sun / d_1AU) — NOT a plain ratio
# = atan(695700 / 149597870.7) = 0.26645°  [IAU2015]
import math as _math
SUN_ANGULAR_RADIUS_DEG: float = _math.degrees(_math.atan(SUN_RADIUS_KM / AU_KM))
# ≈ 0.2664°; we keep 0.267° below as the operational rounded-up conservative value
# used in the UI for "upper-limb above horizon" checks
SUN_ANGULAR_RADIUS_DEG_ROUNDED: float = 0.267  # conservative (rounded up)

# ── Earth ───────────────────────────────────────────────────────────────────
EARTH_NAIF_ID: int = 399

# Earth equatorial radius  [IAU2015 / WGS-84]
EARTH_EQUATORIAL_RADIUS_KM: float = 6378.137

# Angular radius of Earth as seen from Moon (mean Earth–Moon distance = 384400 km)
# Formula: atan(R_earth / d_earth_moon)
# = atan(6378.137 / 384400) = 0.9490°  [IAU2015]
EARTH_MOON_MEAN_DISTANCE_KM: float = 384400.0
EARTH_ANGULAR_RADIUS_DEG: float = _math.degrees(
    _math.atan(EARTH_EQUATORIAL_RADIUS_KM / EARTH_MOON_MEAN_DISTANCE_KM)
)  # ≈ 0.949°


# ── Time ────────────────────────────────────────────────────────────────────
# Leap-seconds kernel name (must match kernels/ directory)
LSK_FILENAME: str = "naif0012.tls"
# All displayed times are UTC.  Internally we use ET (TDB-ish) via spiceypy.str2et.

# ── Ephemeris step constraints (API guard-rails) ──────────────────────────
MIN_STEP_SECONDS: int = 60              # minimum time step the API will accept
MAX_DATE_RANGE_DAYS: int = 365 * 9     # cap: 2024 through 2032 inclusive
MAX_API_DATE_RANGE_DAYS: int = 90      # on-demand API request cap (90 days)

# ── Horizon defaults ─────────────────────────────────────────────────────
FLAT_HORIZON_DEG: float = 0.0          # flat / idealized horizon elevation
DEFAULT_MAST_HEIGHT_M: float = 0.0     # observer height above the surface datum

# ── Terrain ─────────────────────────────────────────────────────────────
# Maximum ray-trace distance for horizon masks (km); see blueprint §4.1
HORIZON_MAX_DISTANCE_KM: float = 50.0
HORIZON_AZIMUTH_STEP_DEG: float = 1.0  # 1° steps around the full 360°

# ── Light-time correction ────────────────────────────────────────────────
# "LT+S" = light-time + stellar aberration (recommended for observer tables)
ABCORR: str = "LT+S"

# ── Coordinate bounds ────────────────────────────────────────────────────
LAT_MIN_DEG: float = -90.0
LAT_MAX_DEG: float = 90.0
LON_MIN_DEG: float = -180.0
LON_MAX_DEG: float = 180.0
