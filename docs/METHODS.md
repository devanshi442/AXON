# AXON LunarSight — Science Methods & Technical Formulation

## 1. Astronomical Reference Systems & Geometry Engine

AXON LunarSight computes lunar topocentric ephemerides directly from the NASA NAIF SPICE toolkit (`SpiceyPy`) using pinned planetary ephemerides and high-precision lunar orientation kernels:
- **Reference Frame:** Lunar mean-Earth / polar-axis body-fixed frame (`MOON_ME`), identical to the LOLA GDR reference frame and NASA JPL Horizons observer tables.
- **Reference Datum:** Sphere of radius $R = 1737.4\text{ km}$ (IAU / NAIF `pck00011.tpc`).
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
1. At azimuth step $\theta \in [0^\circ, 359^\circ]$ (at $1^\circ$ resolution), great-circle steps proceed along arc length $s$ from $s_{\text{min}} = 2 \times \text{pixel\_res}$ to $s_{\text{max}} = 50\text{ km}$ at half-pixel increments $\Delta s = \frac{\Delta x}{2}$.
2. The unit vector $\mathbf{u}(s)$ along the great circle is:
   $$\mathbf{u}(s) = \cos(s/R)\,\mathbf{u}_{\text{site}} + \sin(s/R)\,(\cos\theta\,\mathbf{u}_{\text{North}} + \sin\theta\,\mathbf{u}_{\text{East}})$$
3. The surface radius $r(s)$ is evaluated by windowed bilinear interpolation from the DEM:
   $$\mathbf{p}_{\text{terrain}}(s) = r(s)\,\mathbf{u}(s)$$
4. The displacement vector in local $\text{ENU}$ from the observer $\mathbf{p}_{\text{obs}} = (R_0 + z_0 + h)\,\mathbf{u}_{\text{site}}$ is $\mathbf{d} = \mathbf{p}_{\text{terrain}} - \mathbf{p}_{\text{obs}}$.
5. The skyline elevation is the maximum over all ray steps:
   $$h_{\text{mask}}(\theta) = \max_s \text{atan2}(\mathbf{d} \cdot \mathbf{u}_{\text{Up}}, \sqrt{(\mathbf{d} \cdot \mathbf{u}_{\text{East}})^2 + (\mathbf{d} \cdot \mathbf{u}_{\text{North}})^2})$$
Because all calculations are conducted in 3D Cartesian space, planetary curvature is intrinsically exact without small-angle planar approximations.

### Pixel-Binning Cross-Check
An independent algorithm converts every pixel in the local bounding window directly to 3D Cartesian coordinates, projects into local $\text{ENU}$, computes $(az, el)$, bins into $1^\circ$ azimuth intervals, and takes the maximum elevation. In our test suite, the ray-march and pixel-binning algorithms cross-check to within $\le 0.1^\circ$.

---

## 3. Solar Fraction & Delivered Electrical Power Model

### Local-Flat-Mask Solar Disk Fraction
The geometric angular radius of the Sun is $r_{\text{sun}}(t) = \text{atan}(R_{\text{sun}} / d_{\text{sun}}(t)) \approx 0.2665^\circ$.
The fraction $f_{\text{sun}} \in [0, 1]$ of the solar disk above the local terrain skyline $h_{\text{mask}}(\text{az})$:
$$f_{\text{sun}} = \text{clip}\left(\frac{\text{el}_{\text{sun}} + r_{\text{sun}} - h_{\text{mask}}(\text{az})}{2\,r_{\text{sun}}}, 0, 1\right)$$
A site is considered illuminated when $f_{\text{sun}} > 0$ and the upper limb elevation exceeds the configured sun threshold $\tau_{\text{sun}}$.

### Solar Array Power Models
Solar flux follows the inverse-square law:
$$S(d) = S_0 \left(\frac{1\text{ AU}}{d_{\text{sun}}}\right)^2, \quad S_0 = 1361.0\text{ W/m}^2\text{ (SORCE / IAU 2015)}$$
Delivered electrical power:
$$P(t) = S(d(t)) \cdot A \cdot \eta \cdot \max(0, \cos i) \cdot f_{\text{sun}}(t)$$
Where $A$ is array area ($\text{m}^2$), $\eta = 0.28$ (triple-junction GaAs efficiency), and incidence angle factor $\cos i$:
1. **Horizontal Flat Array:** $\cos i = \sin(\text{el})$
2. **Vertical Mast Array (Azimuth Tracking):** $\cos i = \cos(\text{el})$ (optimal for polar grazing sunlight)
3. **Full 2-Axis Tracking Array:** $\cos i = 1.0$

---

## 4. Direct-to-Earth (DTE) Communication Windows

Earth visibility considers terrain horizon masking, lunar libration, and RF antenna clearance margin $\mu_{\text{clearance}}$:
$$h_{\text{req}} = h_{\text{mask}}(\text{az}_{\text{earth}}) + \mu_{\text{clearance}}$$
Three geometrical criteria are supported:
- **Center LOS:** $\text{el}_{\text{earth}} \ge h_{\text{req}}$
- **Full Disk Clear:** $\text{el}_{\text{earth}} - r_{\text{earth}} \ge h_{\text{req}}$
- **Any Limb Visible:** $\text{el}_{\text{earth}} + r_{\text{earth}} \ge h_{\text{req}}$

---

## 5. Event Refinement via Bisection Root-Finding

Hourly ephemeris scans detect bracketed transitions $[t_k, t_{k+1}]$. For every transition:
$$g(t) = \text{el}(t) + r_{\text{body}}(t) - h_{\text{mask}}(\text{az}(t)) - \tau$$
A bisection root-finder evaluates SPICE ephemerides recursively to resolve the exact minute of sunrise, sunset, AOS (acquisition of signal), and LOS (loss of signal) to within $\le 60\text{ seconds}$ error tolerance.
