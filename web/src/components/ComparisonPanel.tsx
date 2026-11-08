import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  getElevationAtTime,
  compute30DayWindows,
  getMaskForMastHeight,
} from '../stores/scenarioStore'
import {
  lookupHorizonElevation,
  computeSolarFraction,
  computeSolarPowerWatts,
  formatUtcDisplay,
} from '../utils/scienceMath'

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
        ? computeSolarFraction(elA.sunAzimuth, elA.sunElevation, maskA)
        : elA.sunElevation >= 0.0 ? 1.0 : 0.0
      : 0.0

  const fSunB =
    elB.sunElevation !== null
      ? maskB && elB.sunAzimuth !== null
        ? computeSolarFraction(elB.sunAzimuth, elB.sunElevation, maskB)
        : elB.sunElevation >= 0.0 ? 1.0 : 0.0
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

  return (
    <div className="bg-space-800 border border-space-700 rounded-2xl p-4 flex flex-col gap-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-space-100 uppercase tracking-wider flex items-center gap-2">
            <span>⚖️</span> Side-by-Side Landing Site Comparison (Scenario B vs Scenario A)
          </h2>
          <p className="text-2xs text-space-400 mt-0.5">
            Direct trade-off evaluation of illumination, terrain occlusion, solar power yield, and direct-to-Earth communications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-3xs font-mono bg-space-900 border border-space-700 text-emerald-400">
            Mode: {horizonMode === 'terrain' ? `Terrain (${mastHeightM}m mast)` : 'Flat sphere, 0 deg horizon'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" role="table">
          <thead>
            <tr className="border-b border-space-700 text-3xs font-semibold text-space-400 uppercase tracking-wider bg-space-900/60">
              <th className="py-2.5 px-3">Metric</th>
              <th className="py-2.5 px-3 text-sun-400">
                Scenario A: {siteA?.name || 'A'}
              </th>
              <th className="py-2.5 px-3 text-earth-400">
                Scenario B: {siteB?.name || 'B'}
              </th>
              <th className="py-2.5 px-3 text-right">Delta (Scenario B − A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-space-800 text-2xs font-mono">
            {/* Coordinates & Region */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Landing Site Coordinates</td>
              <td className="py-2.5 px-3 text-space-200">
                {siteA?.lat != null ? `${siteA.lat}° Lat, ${siteA.lon}° Lon` : 'Not published'}
              </td>
              <td className="py-2.5 px-3 text-space-200">
                {siteB?.lat != null ? `${siteB.lat}° Lat, ${siteB.lon}° Lon` : 'Not published'}
              </td>
              <td className="py-2.5 px-3 text-right text-space-400 font-sans">
                {siteB?.lat != null && siteA?.lat != null
                  ? `${Math.abs(siteB.lat - siteA.lat).toFixed(2)}° ΔLat`
                  : 'N/A'}
              </td>
            </tr>

            {/* Coordinate Kind Notice */}
            {(siteA?.coord_kind === 'region_centre' || siteA?.coord_kind === 'planned_region_center' ||
              siteB?.coord_kind === 'region_centre' || siteB?.coord_kind === 'planned_region_center') && (
              <tr className="bg-amber-500/5">
                <td className="py-2 px-3 text-amber-300 font-sans font-medium text-3xs">Coordinate Notice</td>
                <td className="py-2 px-3 text-amber-300/90 font-sans text-3xs">
                  {siteA?.coord_kind === 'region_centre' || siteA?.coord_kind === 'planned_region_center'
                    ? 'Region centre; results can differ strongly from the crest or evaluated site.'
                    : 'Specific site'}
                </td>
                <td className="py-2 px-3 text-amber-300/90 font-sans text-3xs">
                  {siteB?.coord_kind === 'region_centre' || siteB?.coord_kind === 'planned_region_center'
                    ? 'Region centre; results can differ strongly from the crest or evaluated site.'
                    : 'Specific site'}
                </td>
                <td className="py-2 px-3 text-right text-space-400 font-sans text-3xs">
                  —
                </td>
              </tr>
            )}

            {/* DEM Tier / Source */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Topographic DEM Source</td>
              <td className="py-2.5 px-3 text-cyan-300">
                {hA?.dem_id || 'LDEM_64'} ({hA?.coverage_status || 'ok'})
              </td>
              <td className="py-2.5 px-3 text-cyan-300">
                {hB?.dem_id || 'LDEM_64'} ({hB?.coverage_status || 'ok'})
              </td>
              <td className="py-2.5 px-3 text-right text-space-400 font-sans">
                {hA?.dem_id === hB?.dem_id ? 'Identical DEM' : 'Different DEM'}
              </td>
            </tr>

            {/* Target UTC Date */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Evaluation Date (UTC)</td>
              <td className="py-2.5 px-3 text-space-200 font-mono">{formatUtcDisplay(utcA)}</td>
              <td className="py-2.5 px-3 text-space-200 font-mono">{formatUtcDisplay(utcB)}</td>
              <td className="py-2.5 px-3 text-right text-space-400 font-sans">
                {utcA === utcB ? 'Synchronous' : 'Asynchronous dates'}
              </td>
            </tr>

            {/* Sun Elevation & Horizon */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Sun Elevation (at UTC)</td>
              <td className="py-2.5 px-3 text-sun-300">
                {elA.sunElevation != null ? `${elA.sunElevation.toFixed(2)}° (Skyline: ${sunHorizonA.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-sun-300">
                {elB.sunElevation != null ? `${elB.sunElevation.toFixed(2)}° (Skyline: ${sunHorizonB.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffSunEl != null && diffSunEl > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {fmtDiff(diffSunEl, '°', 2)}
              </td>
            </tr>

            {/* Earth Elevation & Horizon */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Earth Elevation (at UTC)</td>
              <td className="py-2.5 px-3 text-earth-300">
                {elA.earthElevation != null ? `${elA.earthElevation.toFixed(2)}° (Skyline: ${earthHorizonA.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-earth-300">
                {elB.earthElevation != null ? `${elB.earthElevation.toFixed(2)}° (Skyline: ${earthHorizonB.toFixed(1)}°)` : 'N/A'}
              </td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffEarthEl != null && diffEarthEl > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {fmtDiff(diffEarthEl, '°', 2)}
              </td>
            </tr>

            {/* Instantaneous Power */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Solar Array Power (1 m² array)</td>
              <td className="py-2.5 px-3 text-sun-300">{pWattsA.toFixed(1)} W</td>
              <td className="py-2.5 px-3 text-sun-300">{pWattsB.toFixed(1)} W</td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffPowerW >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtDiff(diffPowerW, ' W', 1)}
              </td>
            </tr>

            {/* 30-Day Illumination Hours */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">30-Day Illumination Availability</td>
              <td className="py-2.5 px-3 text-sun-300">
                {fmtHrs(oppA?.sun.total_hours)} ({oppA?.sun.percentage ?? 0}%)
              </td>
              <td className="py-2.5 px-3 text-sun-300">
                {fmtHrs(oppB?.sun.total_hours)} ({oppB?.sun.percentage ?? 0}%)
              </td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffSunHours != null && diffSunHours >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtDiff(diffSunHours, ' h')}
              </td>
            </tr>

            {/* 30-Day Solar Energy Yield */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">30-Day Energy Yield (kWh / m²)</td>
              <td className="py-2.5 px-3 text-sun-300">{oppA?.solar_energy_kwh ?? 0} kWh</td>
              <td className="py-2.5 px-3 text-sun-300">{oppB?.solar_energy_kwh ?? 0} kWh</td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffEnergyKwh != null && diffEnergyKwh >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtDiff(diffEnergyKwh, ' kWh', 2)}
              </td>
            </tr>

            {/* Max Dark Gap */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Max Continuous Dark Gap (Battery Sizing)</td>
              <td className="py-2.5 px-3 text-rose-300 font-medium">
                {fmtHrs(oppA?.sun.longest_dark_gap_hours)}
              </td>
              <td className="py-2.5 px-3 text-rose-300 font-medium">
                {fmtHrs(oppB?.sun.longest_dark_gap_hours)}
              </td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffDarkGap != null && diffDarkGap <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtDiff(diffDarkGap, ' h')} {diffDarkGap != null && diffDarkGap <= 0 ? '(shorter night)' : '(longer night)'}
              </td>
            </tr>

            {/* 30-Day DTE Direct Hours */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">30-Day Direct-to-Earth Comm Windows</td>
              <td className="py-2.5 px-3 text-earth-300">
                {fmtHrs(oppA?.earth.total_hours)} ({oppA?.earth.percentage ?? 0}%)
              </td>
              <td className="py-2.5 px-3 text-earth-300">
                {fmtHrs(oppB?.earth.total_hours)} ({oppB?.earth.percentage ?? 0}%)
              </td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffEarthHours != null && diffEarthHours >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtDiff(diffEarthHours, ' h')}
              </td>
            </tr>

            {/* Max DTE Blackout */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Max DTE Comm Blackout Duration</td>
              <td className="py-2.5 px-3 text-rose-300 font-medium">
                {fmtHrs(oppA?.earth.longest_dark_gap_hours)}
              </td>
              <td className="py-2.5 px-3 text-rose-300 font-medium">
                {fmtHrs(oppB?.earth.longest_dark_gap_hours)}
              </td>
              <td className={`py-2.5 px-3 text-right font-bold ${diffBlackout != null && diffBlackout <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtDiff(diffBlackout, ' h')}
              </td>
            </tr>

            {/* Joint Window Hours */}
            <tr className="bg-space-900/60 font-semibold">
              <td className="py-3 px-3 text-emerald-400 font-sans">Concurrent Sun + Earth Operations Window</td>
              <td className="py-3 px-3 text-emerald-300 font-bold">
                {fmtHrs(oppA?.joint.total_hours)} ({oppA?.joint.percentage ?? 0}%)
              </td>
              <td className="py-3 px-3 text-emerald-300 font-bold">
                {fmtHrs(oppB?.joint.total_hours)} ({oppB?.joint.percentage ?? 0}%)
              </td>
              <td className={`py-3 px-3 text-right font-bold text-sm ${diffJointHours != null && diffJointHours >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtDiff(diffJointHours, ' h')}
              </td>
            </tr>

            {/* Terrain Shadow Impact Delta */}
            {horizonMode === 'terrain' && (
              <tr className="bg-amber-950/20 text-amber-300">
                <td className="py-2.5 px-3 font-sans font-medium">Terrain effect vs flat (+ gain / - loss)</td>
                <td className="py-2.5 px-3">{oppA?.delta_sun_hours ?? 0} h sun</td>
                <td className="py-2.5 px-3">{oppB?.delta_sun_hours ?? 0} h sun</td>
                <td className="py-2.5 px-3 text-right font-medium">
                  {fmtDiff((oppB?.delta_sun_hours ?? 0) - (oppA?.delta_sun_hours ?? 0), ' h')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Synthesis Takeaway Card */}
      <div className="p-3.5 bg-space-900 rounded-xl border border-space-700 flex flex-col gap-1 text-2xs text-space-300 leading-relaxed">
        <span className="font-semibold text-xs text-space-100 flex items-center gap-1.5">
          <span>💡</span> Mission Trade-off Synthesis:
        </span>
        <p>
          {diffJointHours != null && diffJointHours > 0 ? (
            <span>
              <strong>Scenario B ({siteB?.name})</strong> provides <strong className="text-emerald-400">+{diffJointHours} hours more concurrent power &amp; communication time</strong> over 30 days compared to Scenario A.
            </span>
          ) : diffJointHours != null && diffJointHours < 0 ? (
            <span>
              <strong>Scenario A ({siteA?.name})</strong> provides <strong className="text-emerald-400">+{Math.abs(diffJointHours)} hours more concurrent power &amp; communication time</strong> over 30 days compared to Scenario B.
            </span>
          ) : (
            <span>Both scenarios offer equivalent concurrent operational windows over this period.</span>
          )}
          {diffDarkGap != null && (
            <span className="ml-1 text-space-400">
              Longest darkness interval difference is {fmtDiff(diffDarkGap, ' hours')}, which directly impacts lander survival heater battery sizing.
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
