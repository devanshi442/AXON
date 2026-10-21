"""
constants.py — AXON LunarSight science conventions.

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
# Angular radius of the Sun as seen from the Moon at 1 AU
# = arctan(695700 km / 149597870 km) ≈ 0.2665°
# We use 0.267° (rounded up; conservative) for "Sun up = upper limb above horizon"
SUN_ANGULAR_RADIUS_DEG: float = 0.267

# ── Earth ───────────────────────────────────────────────────────────────────
EARTH_NAIF_ID: int = 399

# ── Time ────────────────────────────────────────────────────────────────────
# Leap-seconds kernel name (must match kernels/ directory)
LSK_FILENAME: str = "naif0012.tls"
# All displayed times are UTC.  Internally we use ET (TDB-ish) via spiceypy.str2et.

# ── Ephemeris step constraints (API guard-rails) ──────────────────────────
MIN_STEP_SECONDS: int = 60              # minimum time step the API will accept
MAX_DATE_RANGE_DAYS: int = 365 * 9     # cap: 2024 through 2032 inclusive

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
