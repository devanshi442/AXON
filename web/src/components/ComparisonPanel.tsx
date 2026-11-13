import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  getElevationAtTime,
  compute30DayWindows,
  getMaskForMastHeight,
  SUN_UPPER_LIMB_DEG,
} from '../stores/scenarioStore'
import {
  lookupHorizonElevation,
  computeSolarFraction,
  computeSolarPowerWatts,
  formatUtcDisplay,
} from '../utils/scienceMath'
import PanelCornerBrackets from './PanelCornerBrackets'

interface ComparisonPanelProps {
  sites: SelectableSite[]
}

export default function ComparisonPanel({ sites }: ComparisonPanelProps) {
  const {
    scenarioAId,
    scenarioBId,
    utcA,
    utcB,
    thresholdDeg,
    horizonMode,
    mastHeightM,
    dteMarginDeg,
    earthCriterion,
    solarArrayType,
    arrayAreaM2,
    arrayEfficiency,
    timeseriesCache,
    horizonCache,
  } = useScenarioStore()

  const siteA = sites.find((s) => s.id === scenarioAId)
  const siteB = sites.find((s) => s.id === scenarioBId)

  const tsA = timeseriesCache[scenarioAId]
  const tsB = timeseriesCache[scenarioBId]

  const hA = horizonCache[scenarioAId]
  const hB = horizonCache[scenarioBId]

  const elA = getElevationAtTime(tsA, utcA)
  const elB = getElevationAtTime(tsB, utcB)

  const oppA = compute30DayWindows(tsA, utcA, {
    horizonMode,
    horizonProfile: hA,
    mastHeightM,
    sunThresholdDeg: thresholdDeg,
    dteMarginDeg,
    earthCriterion,
    solarArrayType,
    arrayAreaM2,
    arrayEfficiency,
  })

  const oppB = compute30DayWindows(tsB, utcB, {
    horizonMode,
    horizonProfile: hB,
    mastHeightM,
    sunThresholdDeg: thresholdDeg,
    dteMarginDeg,
    earthCriterion,
    solarArrayType,
    arrayAreaM2,
    arrayEfficiency,
  })

  // Instantaneous power calculations
  const maskA = horizonMode === 'terrain' ? getMaskForMastHeight(hA, mastHeightM) : null
  const maskB = horizonMode === 'terrain' ? getMaskForMastHeight(hB, mastHeightM) : null

  const fSunA =
    elA.sunElevation !== null
      ? maskA && elA.sunAzimuth !== null
        ? computeSolarFraction(elA.sunAzimuth, elA.sunElevation - thresholdDeg, maskA)
        : elA.sunElevation + SUN_UPPER_LIMB_DEG >= thresholdDeg ? 1.0 : 0.0
      : 0.0

  const fSunB =
    elB.sunElevation !== null
      ? maskB && elB.sunAzimuth !== null
        ? computeSolarFraction(elB.sunAzimuth, elB.sunElevation - thresholdDeg, maskB)
        : elB.sunElevation + SUN_UPPER_LIMB_DEG >= thresholdDeg ? 1.0 : 0.0
      : 0.0

  const pWattsA =
    elA.sunElevation !== null
      ? computeSolarPowerWatts(elA.sunElevation, elA.sunAzimuth ?? 0, fSunA, solarArrayType, arrayAreaM2, arrayEfficiency)
      : 0.0

  const pWattsB =
    elB.sunElevation !== null
      ? computeSolarPowerWatts(elB.sunElevation, elB.sunAzimuth ?? 0, fSunB, solarArrayType, arrayAreaM2, arrayEfficiency)
      : 0.0

  const sunHorizonA = maskA && elA.sunAzimuth !== null ? lookupHorizonElevation(maskA, elA.sunAzimuth) : 0.0
  const sunHorizonB = maskB && elB.sunAzimuth !== null ? lookupHorizonElevation(maskB, elB.sunAzimuth) : 0.0
  const earthHorizonA = maskA && elA.earthAzimuth !== null ? lookupHorizonElevation(maskA, elA.earthAzimuth) : 0.0
  const earthHorizonB = maskB && elB.earthAzimuth !== null ? lookupHorizonElevation(maskB, elB.earthAzimuth) : 0.0

  // Arithmetic differences (B - A)
  const diffSunEl =
    elB.sunElevation !== null && elA.sunElevation !== null
      ? elB.sunElevation - elA.sunElevation
      : null

  const diffEarthEl =
    elB.earthElevation !== null && elA.earthElevation !== null
      ? elB.earthElevation - elA.earthElevation
      : null

  const diffPowerW = pWattsB - pWattsA
  const diffSunHours = oppB && oppA ? oppB.sun.total_hours - oppA.sun.total_hours : null
  const diffEnergyKwh = oppB && oppA ? oppB.solar_energy_kwh - oppA.solar_energy_kwh : null
  const diffEarthHours = oppB && oppA ? oppB.earth.total_hours - oppA.earth.total_hours : null
  const diffJointHours = oppB && oppA ? oppB.joint.total_hours - oppA.joint.total_hours : null

  const diffDarkGap =
    oppB && oppA
      ? (oppB.sun.longest_dark_gap_hours ?? 0) - (oppA.sun.longest_dark_gap_hours ?? 0)
      : null

  const diffBlackout =
    oppB && oppA
      ? (oppB.earth.longest_dark_gap_hours ?? 0) - (oppA.earth.longest_dark_gap_hours ?? 0)
      : null

  const fmtDiff = (val: number | null, unit: string = '', decimals = 1) => {
    if (val === null) return 'N/A'
    const sign = val > 0 ? '+' : ''
    return `${sign}${val.toFixed(decimals)}${unit}`
  }

  const fmtHrs = (val: number | null | undefined) => (val == null ? 'N/A' : `${val} h`)

  const isRegionCentreA =
    siteA?.coord_kind === 'region_centre' || siteA?.coord_kind === 'planned_region_center'
  const isRegionCentreB =
    siteB?.coord_kind === 'region_centre' || siteB?.coord_kind === 'planned_region_center'
  const hasRegionCentre = isRegionCentreA || isRegionCentreB

  // Winner pill: "good" means higher-is-better unless invert=true (lower-is-better, e.g. dark gaps)
  const WinnerPill = ({ value, invert = false, unit = '' }: { value: number | null; invert?: boolean; unit?: string }) => {
    if (value === null) return <span className="text-[#8A8A88] font-sans">N/A</span>
    const bGood = invert ? value <= 0 : value >= 0
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold ${
          bGood ? 'bg-[#132A1C] text-[#6DBF8B] border border-[#2A5C3D]' : 'bg-[#2A1210] text-[#E5604A] border border-[#7F2318]'
        }`}
      >
        {fmtDiff(value, unit)}
      </span>
    )
  }

  const SectionHeader = ({ icon, label }: { icon: string; label: string }) => (
    <tr className="bg-[#050608]">
      <td colSpan={4} className="py-1.5 px-3 text-3xs uppercase tracking-wider font-mono font-semibold text-[#B9A58C] border-y border-[#2A2D31]">
        <span className="mr-1.5">{icon}</span>{label}
      </td>
    </tr>
  )

  return (
    <div className="relative bg-[#0D1014] border border-[#2A2D31] rounded p-4 flex flex-col gap-4">
      <PanelCornerBrackets />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider flex items-center gap-2">
            <span>⚖️</span> Side-by-Side Landing Site Comparison (Scenario B vs Scenario A)
          </h2>
          <p className="text-2xs text-[#8A8A88] mt-0.5">
            Direct trade-off evaluation of illumination, terrain occlusion, solar power yield, and direct-to-Earth communications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-3xs font-mono bg-[#050608] border border-[#2A2D31] text-[#6DBF8B]">
            Mode: {horizonMode === 'terrain' ? `Terrain (${mastHeightM}m mast)` : 'Flat sphere, 0 deg horizon'}
          </span>
        </div>
      </div>

      {/* Synthesis Takeaway Card - now at the TOP, read before the raw numbers */}
      <div className="p-3.5 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-1 text-2xs text-[#8A8A88] leading-relaxed">
        <span className="font-semibold text-xs text-[#E4E4E2] flex items-center gap-1.5 font-sans">
          <span>💡</span> Mission Trade-off Synthesis:
        </span>
        <p className="font-sans">
          {diffJointHours != null && diffJointHours > 0 ? (
            <span>
              <strong>Scenario B ({siteB?.name})</strong> provides <strong className="text-[#6DBF8B]">+{diffJointHours} hours more concurrent power &amp; communication time</strong> over 30 days compared to Scenario A.
            </span>
          ) : diffJointHours != null && diffJointHours < 0 ? (
            <span>
              <strong>Scenario A ({siteA?.name})</strong> provides <strong className="text-[#6DBF8B]">+{Math.abs(diffJointHours)} hours more concurrent power &amp; communication time</strong> over 30 days compared to Scenario B.
            </span>
          ) : (
            <span>Both scenarios offer equivalent concurrent operational windows over this period.</span>
          )}
          {diffDarkGap != null && (
            <span className="ml-1 text-[#8A8A88]">
              {' '}Longest darkness interval difference is {fmtDiff(diffDarkGap, ' hours')}, which directly impacts lander survival heater battery sizing.
            </span>
          )}
        </p>
        {hasRegionCentre && (
          <div className="mt-1 pt-1.5 border-t border-[#2A2D31] text-[#E0A04A] font-medium">
            ⚠️ One site is a region centre, so this is not a like-for-like comparison.
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" role="table">
          <thead>
            <tr className="border-b border-[#2A2D31] text-3xs font-semibold text-[#8A8A88] uppercase tracking-wider bg-[#050608]">
              <th className="py-2.5 px-3">Metric</th>
              <th className="py-2.5 px-3 text-[#E0A04A]">
                Scenario A: {siteA?.name || 'A'}
              </th>
              <th className="py-2.5 px-3 text-[#6FA8C9]">
                Scenario B: {siteB?.name || 'B'}
              </th>
              <th className="py-2.5 px-3 text-right">Delta (Scenario B − A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2A2D31] text-2xs font-mono">

            {/* ===== SECTION 1: Site & Topography ===== */}
            <SectionHeader icon="📍" label="Site & Topography" />

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Landing Site Coordinates</td>
              <td className="py-2.5 px-3 text-[#E4E4E2]">
                {siteA?.lat != null ? `${siteA.lat}° Lat, ${siteA.lon}° Lon` : 'Not published'}
              </td>
              <td className="py-2.5 px-3 text-[#E4E4E2]">
                {siteB?.lat != null ? `${siteB.lat}° Lat, ${siteB.lon}° Lon` : 'Not published'}
              </td>
              <td className="py-2.5 px-3 text-right text-[#8A8A88] font-sans">
                {siteB?.lat != null && siteA?.lat != null
                  ? `${Math.abs(siteB.lat - siteA.lat).toFixed(2)}° ΔLat`
                  : 'N/A'}
              </td>
            </tr>

            {(isRegionCentreA || isRegionCentreB) && (
              <tr className="bg-[#E0A04A]/5">
                <td className="py-2 px-3 text-[#E0A04A] font-sans font-medium text-3xs">Coordinate Notice</td>
                <td className="py-2 px-3 text-[#E0A04A]/90 font-sans text-3xs">
                  {isRegionCentreA ? 'Region centre; results can differ strongly from the crest or evaluated site.' : 'Specific site'}
                </td>
                <td className="py-2 px-3 text-[#E0A04A]/90 font-sans text-3xs">
                  {isRegionCentreB ? 'Region centre; results can differ strongly from the crest or evaluated site.' : 'Specific site'}
                </td>
                <td className="py-2 px-3 text-right text-[#8A8A88] font-sans text-3xs">—</td>
              </tr>
            )}

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Topographic DEM Source</td>
              <td className="py-2.5 px-3 text-[#6FA8C9]">
                {hA?.dem_id || 'LDEM_64'} ({hA?.coverage_status || 'ok'})
              </td>
              <td className="py-2.5 px-3 text-[#6FA8C9]">
                {hB?.dem_id || 'LDEM_64'} ({hB?.coverage_status || 'ok'})
              </td>
              <td className="py-2.5 px-3 text-right text-[#8A8A88] font-sans">
                {hA?.dem_id === hB?.dem_id ? 'Identical DEM' : 'Different DEM'}
              </td>
            </tr>

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Evaluation Date (UTC)</td>
              <td className="py-2.5 px-3 text-[#E4E4E2] font-mono">{formatUtcDisplay(utcA)}</td>
              <td className="py-2.5 px-3 text-[#E4E4E2] font-mono">{formatUtcDisplay(utcB)}</td>
              <td className="py-2.5 px-3 text-right text-[#8A8A88] font-sans">
                {utcA === utcB ? 'Synchronous' : 'Asynchronous dates'}
              </td>
            </tr>

            {/* ===== SECTION 2: Solar Power & Survival Night ===== */}
            <SectionHeader icon="☀️" label="Solar Power & Survival Night" />

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Sun Elevation (at UTC)</td>
              <td className="py-2.5 px-3 text-[#E0A04A]">
                {elA.sunElevation != null ? `${elA.sunElevation.toFixed(2)}° (Skyline: ${sunHorizonA.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-[#E0A04A]">
                {elB.sunElevation != null ? `${elB.sunElevation.toFixed(2)}° (Skyline: ${sunHorizonB.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-right"><WinnerPill value={diffSunEl} unit="°" /></td>
            </tr>

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Solar Array Power (1 m² array)</td>
              <td className="py-2.5 px-3 text-[#E0A04A]">{pWattsA.toFixed(1)} W</td>
              <td className="py-2.5 px-3 text-[#E0A04A]">{pWattsB.toFixed(1)} W</td>
              <td className="py-2.5 px-3 text-right"><WinnerPill value={diffPowerW} unit=" W" /></td>
            </tr>

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">30-Day Illumination Availability</td>
              <td className="py-2.5 px-3 text-[#E0A04A]">
                {fmtHrs(oppA?.sun.total_hours)} ({oppA?.sun.percentage ?? 0}%)
              </td>
              <td className="py-2.5 px-3 text-[#E0A04A]">
                {fmtHrs(oppB?.sun.total_hours)} ({oppB?.sun.percentage ?? 0}%)
              </td>
              <td className="py-2.5 px-3 text-right"><WinnerPill value={diffSunHours} unit=" h" /></td>
            </tr>

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">30-Day Energy Yield (kWh / m²)</td>
              <td className="py-2.5 px-3 text-[#E0A04A]">{oppA?.solar_energy_kwh ?? 0} kWh</td>
              <td className="py-2.5 px-3 text-[#E0A04A]">{oppB?.solar_energy_kwh ?? 0} kWh</td>
              <td className="py-2.5 px-3 text-right"><WinnerPill value={diffEnergyKwh} unit=" kWh" /></td>
            </tr>

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Max Continuous Dark Gap (Battery Sizing)</td>
              <td className="py-2.5 px-3 text-[#E5604A] font-medium">
                {fmtHrs(oppA?.sun.longest_dark_gap_hours)}
              </td>
              <td className="py-2.5 px-3 text-[#E5604A] font-medium">
                {fmtHrs(oppB?.sun.longest_dark_gap_hours)}
              </td>
              <td className="py-2.5 px-3 text-right">
                <WinnerPill value={diffDarkGap} invert unit=" h" />
                <span className="ml-1 text-3xs text-[#8A8A88] font-sans">
                  {diffDarkGap != null && diffDarkGap <= 0 ? '(shorter night)' : diffDarkGap != null ? '(longer night)' : ''}
                </span>
              </td>
            </tr>

            {horizonMode === 'terrain' && (
              <tr className="bg-[#E0A04A]/10 text-[#E0A04A]">
                <td className="py-2.5 px-3 font-sans font-medium">Terrain effect vs flat (+ gain / - loss)</td>
                <td className="py-2.5 px-3">{oppA?.delta_sun_hours ?? 0} h sun</td>
                <td className="py-2.5 px-3">{oppB?.delta_sun_hours ?? 0} h sun</td>
                <td className="py-2.5 px-3 text-right font-medium">
                  {fmtDiff((oppB?.delta_sun_hours ?? 0) - (oppA?.delta_sun_hours ?? 0), ' h')}
                </td>
              </tr>
            )}

            {/* ===== SECTION 3: Direct-to-Earth Communications ===== */}
            <SectionHeader icon="📡" label="Direct-to-Earth Communications" />

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Earth Elevation (at UTC)</td>
              <td className="py-2.5 px-3 text-[#6FA8C9]">
                {elA.earthElevation != null ? `${elA.earthElevation.toFixed(2)}° (Skyline: ${earthHorizonA.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-[#6FA8C9]">
                {elB.earthElevation != null ? `${elB.earthElevation.toFixed(2)}° (Skyline: ${earthHorizonB.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-right"><WinnerPill value={diffEarthEl} unit="°" /></td>
            </tr>

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">30-Day Direct-to-Earth Comm Windows</td>
              <td className="py-2.5 px-3 text-[#6FA8C9]">
                {fmtHrs(oppA?.earth.total_hours)} ({oppA?.earth.percentage ?? 0}%)
              </td>
              <td className="py-2.5 px-3 text-[#6FA8C9]">
                {fmtHrs(oppB?.earth.total_hours)} ({oppB?.earth.percentage ?? 0}%)
              </td>
              <td className="py-2.5 px-3 text-right"><WinnerPill value={diffEarthHours} unit=" h" /></td>
            </tr>

            <tr>
              <td className="py-2.5 px-3 text-[#8A8A88] font-sans font-medium">Max DTE Comm Blackout Duration</td>
              <td className="py-2.5 px-3 text-[#E5604A] font-medium">
                {fmtHrs(oppA?.earth.longest_dark_gap_hours)}
              </td>
              <td className="py-2.5 px-3 text-[#E5604A] font-medium">
                {fmtHrs(oppB?.earth.longest_dark_gap_hours)}
              </td>
              <td className="py-2.5 px-3 text-right"><WinnerPill value={diffBlackout} invert unit=" h" /></td>
            </tr>

            <tr className="bg-[#050608] font-semibold">
              <td className="py-3 px-3 text-[#6DBF8B] font-sans">Concurrent Sun + Earth Operations Window</td>
              <td className="py-3 px-3 text-[#6DBF8B] font-bold">
                {fmtHrs(oppA?.joint.total_hours)} ({oppA?.joint.percentage ?? 0}%)
              </td>
              <td className="py-3 px-3 text-[#6DBF8B] font-bold">
                {fmtHrs(oppB?.joint.total_hours)} ({oppB?.joint.percentage ?? 0}%)
              </td>
              <td className="py-3 px-3 text-right text-sm"><WinnerPill value={diffJointHours} unit=" h" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
