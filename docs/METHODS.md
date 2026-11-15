# AXON LunarSight — Science Methods & Technical Formulation

> [!NOTE]
> **Scope & Nature of the Model:**
> AXON LunarSight is a high-precision planetary geometry and topocentric terrain horizon model. It calculates geometric line-of-sight and solar disk exposure relative to local topography. It is **not** an empirical photovoltaic battery/thermal engineering simulation or a radio-frequency telecommunications link budget.

---

## Table of Contents
- [1. Astronomical Reference Systems & Geometry Engine](#1-astronomical-reference-systems--geometry-engine)
- [2. Topographic Horizon Engine & LOLA DEMs](#2-topographic-horizon-engine--lola-dems)
- [3. Observer Mast Height Modeling & Monotonicity](#3-observer-mast-height-modeling--monotonicity)
- [4. Solar Disk Fraction & Illumination Physics](#4-solar-disk-fraction--illumination-physics)
- [5. Solar Array Power Potential Proxy Models](#5-solar-array-power-potential-proxy-models)
- [6. Direct-to-Earth (DTE) Communication Windows](#6-direct-to-earth-dte-communication-windows)
- [7. Sub-Minute Event Refinement via SPICE Bisection](#7-sub-minute-event-refinement-via-spice-bisection)
- [8. Flat Sphere Baseline vs Topographic Skyline](#8-flat-sphere-baseline-vs-topographic-skyline)

---

## 1. Astronomical Reference Systems & Geometry Engine

AXON LunarSight computes lunar topocentric ephemerides directly from the NASA NAIF SPICE toolkit (`SpiceyPy`) using pinned planetary ephemerides and high-precision lunar orientation kernels:
- **Reference Frame:** Lunar mean-Earth / polar-axis body-fixed frame (`MOON_ME`), identical to the LOLA GDR reference frame and NASA JPL Horizons observer tables.
- **Reference Datum:** Sphere of radius $R = 1,737.4\text{ km}$ (IAU / NAIF `pck00011.tpc`).
- **Internal Time Scale:** Ephemeris Time / Barycentric Dynamical Time ($\text{ET}$ / $\text{TDB}$), converted from user UTC strings via NAIF leap seconds kernel `naif0012.tls`.
- **Light-Time & Aberration:** `LT+S` (light-time and stellar aberration correction).
- **Coordinate Conventions:** East-positive longitude $\lambda \in [-180^\circ, +180^\circ]$, planetocentric latitude $\phi \in [-90^\circ, +90^\circ]$.

### Topocentric Basis (East-North-Up)
For an observer at latitude $\phi$, longitude $\lambda$, and radial distance $r = R_0 + z_0 + h$ (where $z_0$ is surface elevation and $h$ is observer mast height):
$$\mathbf{r}_{\text{obs}} = r \begin{bmatrix} \cos\phi \cos\lambda \\ \cos\phi \sin\lambda \\ \sin\phi \end{bmatrix}$$
The orthonormal local East-North-Up ($\text{ENU}$) unit vectors are:
$$\mathbf{u}_{\text{East}} = \begin{bmatrix} -\sin\lambda \\ \cos\lambda \\ 0 \end{bmatrix}, \quad \mathbf{u}_{\text{North}} = \begin{bmatrix} -\sin\phi \cos\lambda \\ -\sin\phi \sin\lambda \\ \cos\phi \end{bmatrix}, \quad \mathbf{u}_{\text{Up}} = \begin{bmatrix} \cos\phi \cos\lambda \\ \cos\phi \sin\lambda \\ \sin\phi \end{bmatrix}$$
Given the target body position $\mathbf{r}_{\text{body}}(t)$ in frame `MOON_ME`, the topocentric vector is $\boldsymbol{\rho} = \mathbf{r}_{\text{body}} - \mathbf{r}_{\text{obs}}$.
Azimuth and elevation:
$$\text{Az} = \text{atan2}(\boldsymbol{\rho} \cdot \mathbf{u}_{\text{East}}, \boldsymbol{\rho} \cdot \mathbf{u}_{\text{North}}) \pmod{360^\circ}$$
$$\text{El} = \text{atan2}(\boldsymbol{\rho} \cdot \mathbf{u}_{\text{Up}}, \sqrt{(\boldsymbol{\rho} \cdot \mathbf{u}_{\text{East}})^2 + (\boldsymbol{\rho} \cdot \mathbf{u}_{\text{North}})^2})$$

---

## 2. Topographic Horizon Engine & LOLA DEMs

### Analytical Polar Stereographic Transformation
Lunar Orbiter Laser Altimeter (LOLA) polar DEMs are projected on a polar stereographic plane tangent to the South Pole ($lat_{\text{ts}} = -90^\circ, lon_0 = 0^\circ$) on a sphere of radius $R = 1,737,400\text{ m}$.
For any 3D unit vector $(u_x, u_y, u_z)$ in `MOON_ME`, the polar stereographic coordinates $(x, y)$ are computed without trigonometric transcendental functions:
$$x = \frac{2 R}{1 - u_z} u_y, \quad y = \frac{2 R}{1 - u_z} u_x$$
With raster affine transform:
$$\text{col} = \frac{x - x_{\text{origin}}}{\Delta x}, \quad \text{row} = \frac{y_{\text{origin}} - y}{\Delta y}$$

### 3D Ray-Marching Algorithm
1. At azimuth step $\theta \in [0^\circ, 359^\circ]$ (at $1.0^\circ$ resolution), great-circle steps proceed along arc length $s$ from $s_{\text{min}} = 2 \times \text{pixel\_res}$ to $s_{\text{max}} = 50.0\text{ km}$ at half-pixel increments $\Delta s = \frac{\Delta x}{2}$.
2. The unit vector $\mathbf{u}(s)$ along the great circle is:
   $$\mathbf{u}(s) = \cos(s/R)\,\mathbf{u}_{\text{site}} + \sin(s/R)\,(\cos\theta\,\mathbf{u}_{\text{North}} + \sin\theta\,\mathbf{u}_{\text{East}})$$
3. The surface radius $r(s)$ is evaluated by windowed bilinear interpolation from the DEM:
   $$\mathbf{p}_{\text{terrain}}(s) = r(s)\,\mathbf{u}(s), \quad r(s) = R_0 + \text{DN}(s) \times 0.5\text{ m}$$
4. The displacement vector in local $\text{ENU}$ from the observer $\mathbf{p}_{\text{obs}} = (R_0 + z_0 + h)\,\mathbf{u}_{\text{site}}$ is $\mathbf{d} = \mathbf{p}_{\text{terrain}} - \mathbf{p}_{\text{obs}}$.
5. The skyline elevation is the maximum over all ray steps:
   $$h_{\text{mask}}(\theta) = \max_s \text{atan2}(\mathbf{d} \cdot \mathbf{u}_{\text{Up}}, \sqrt{(\mathbf{d} \cdot \mathbf{u}_{\text{East}})^2 + (\mathbf{d} \cdot \mathbf{u}_{\text{North}})^2})$$
Because all calculations are conducted in 3D Cartesian space, planetary curvature is intrinsically exact without small-angle planar approximations.

### No Clamping of Negative Horizons
Skyline values are **unclamped**. When an observer stands atop an isolated mountain or ridge (e.g., Connecting Ridge or Mons Mouton), the surrounding terrain drops below the local horizontal tangent plane. The resulting horizon elevation is negative (down to $-3.37^\circ$), correctly capturing the geometric dip of the horizon.

---

## 3. Observer Mast Height Modeling & Monotonicity

Lander hardware typically elevates antennas and solar panels on vertical masts above the landing footpads. AXON evaluates 5 standard mast heights:
$$h \in \{0.0\text{ m}, 1.5\text{ m}, 3.0\text{ m}, 5.0\text{ m}, 10.0\text{ m}\}$$
Default mast height is $1.5\text{ m}$.

### Mast Monotonicity Law
Raising the observer position increases radial distance $r$, tilting the local horizon line downward. Consequently:
$$h_{\text{mask}}(h_2, \theta) \le h_{\text{mask}}(h_1, \theta) \quad \forall \; h_2 > h_1$$
Total illumination hours and communication visibility are strictly monotonically non-decreasing with increasing mast height:
$$H(h_2) \ge H(h_1) \quad \text{for } h_2 > h_1$$
Sunlight and communication access never decrease as the mast rises.

---

## 4. Solar Disk Fraction & Illumination Physics

### Visibility Rule
The Sun is an extended celestial disk with angular radius $r_{\text{sun}}(t) = \text{atan}(R_{\text{sun}} / d_{\text{sun}}(t)) \approx 0.2665^\circ$.
Sun "up" (illuminated) is defined by the solar upper limb clearing the local skyline:
$$\text{el}_{\text{sun, center}} + 0.267^\circ > h_{\text{mask}}(\text{az}) + \tau_{\text{sun}}$$
Where $\tau_{\text{sun}}$ is an optional elevation threshold (default $0.0^\circ$).

### Circular-Segment Solar Disk Fraction
The geometric fraction $f_{\text{sun}} \in [0, 1]$ of the solar disk above the local terrain skyline $h_{\text{mask}}(\text{az})$ is evaluated analytically using the circular segment area formula:
$$h_{\text{above}} = \text{clip}(\text{el}_{\text{sun}} + r_{\text{sun}} - (h_{\text{mask}}(\text{az}) + \tau_{\text{sun}}), 0.0, 2\,r_{\text{sun}})$$
$$d_{\text{norm}} = \text{clip}\left(1.0 - \frac{h_{\text{above}}}{r_{\text{sun}}}, -1.0, 1.0\right)$$
$$\theta = \arccos(d_{\text{norm}}), \quad f_{\text{sun}} = \frac{\theta - d_{\text{norm}}\sin\theta}{\pi}$$
- $f_{\text{sun}} = 0.0$: Solar disk completely behind topography (shadow).
- $0.0 < f_{\text{sun}} < 1.0$: Partial solar occultation (grazing limb).
- $f_{\text{sun}} = 1.0$: Full solar disk unoccluded above horizon.

---

## 5. Solar Array Power Potential Proxy Models

Solar flux follows the astronomical inverse-square law:
$$S(d) = S_0 \left(\frac{1\text{ AU}}{d_{\text{sun}}}\right)^2, \quad S_0 = 1,361.0\text{ W/m}^2\text{ (SORCE / IAU 2015)}$$
Delivered electrical power potential:
$$P(t) = S(d(t)) \cdot A \cdot \eta \cdot \max(0, \cos i) \cdot f_{\text{sun}}(t)$$
Where $A$ is array area ($1.0\text{ m}^2$ baseline), $\eta = 0.28$ (triple-junction GaAs reference efficiency), and incidence angle factor $\cos i$:
1. **Horizontal Flat Array:** $\cos i = \sin(\text{el})$ (poor at poles where $\text{el} \approx 1^\circ\text{–}2^\circ$).
2. **Vertical Fixed Array:** $\cos i = \sin(\text{el})\cos(\text{tilt}) + \cos(\text{el})\sin(\text{tilt})\cos(\text{az} - \text{az}_0)$ (planar panel tilted and oriented towards azimuth $\text{az}_0$).
3. **Vertical Mast Array (Azimuth Tracking):** $\cos i = \cos(\text{el})$ (optimal for polar grazing sunlight, intercepting near-normal flux).
4. **Full 2-Axis Tracking Array:** $\cos i = 1.0$ (normal beam incidence).

---

## 6. Direct-to-Earth (DTE) Communication Windows

Earth visibility evaluates line-of-sight to Earth's center of mass, accounting for lunar libration and a user-selected RF antenna clearance margin $\mu_{\text{clearance}}$:
$$h_{\text{req}} = h_{\text{mask}}(\text{az}_{\text{earth}}) + \mu_{\text{clearance}}$$
Three geometrical criteria are supported:
- **Center LOS (Default):** $\text{el}_{\text{earth}} \ge h_{\text{req}}$
- **Full Disk Clear:** $\text{el}_{\text{earth}} - r_{\text{earth}} \ge h_{\text{req}}$ (where $r_{\text{earth}} \approx 0.95^\circ$)
- **Any Limb Visible:** $\text{el}_{\text{earth}} + r_{\text{earth}} \ge h_{\text{req}}$

Raising the clearance margin $\mu_{\text{clearance}}$ strictly tightens the geometric constraint, ensuring communication availability never increases when an antenna clearance buffer is applied.

---

## 7. Sub-Minute Event Refinement via SPICE Bisection

Hourly timeseries discretize ephemerides into 1-hour steps. To prevent temporal quantization errors at event boundaries, transition intervals $[t_k, t_{k+1}]$ where visibility state changes ($v_k \ne v_{k+1}$) are recursively refined using bisection root-finding on the continuous objective function:
$$g(t) = \text{el}(t) + r_{\text{body}}(t) - (h_{\text{mask}}(\text{az}(t)) + \tau)$$
The bisection solver queries `spiceypy` ephemerides dynamically to isolate sunrise, sunset, acquisition of signal (AOS), and loss of signal (LOS) to within $\le 60\text{ seconds}$ precision.

---

## 8. Flat Sphere Baseline vs Topographic Skyline

In all comparison tables and user interfaces, the idealized baseline is explicitly labeled **"flat sphere, 0 deg horizon"**:
- **Baseline Definition:** A smooth sphere of radius $R = 1,737.4\text{ km}$ with elevation $0\text{ m}$ and a fixed $0.0^\circ$ tangent horizon.
- **Physical Non-Equivalence:** The baseline is **not** an equivalent physical horizon at the site's elevation. For an elevated peak (Connecting Ridge at $+1,653\text{ m}$), the true horizon drops to $-3.37^\circ$, yielding higher solar availability ($58.3\%$) than the flat sphere datum ($53.4\%$). For crater interiors (Shackleton floor at $-2,785\text{ m}$), towering crater walls block the low polar Sun, reducing availability to $0.0\%$.
