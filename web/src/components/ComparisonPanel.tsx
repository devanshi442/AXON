import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  getElevationAtTime,
  compute30DayWindows,
} from '../stores/scenarioStore'

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
    timeseriesCache,
  } = useScenarioStore()

  const siteA = sites.find((s) => s.id === scenarioAId)
  const siteB = sites.find((s) => s.id === scenarioBId)

  const tsA = timeseriesCache[scenarioAId]
  const tsB = timeseriesCache[scenarioBId]

  const elA = getElevationAtTime(tsA, utcA)
  const elB = getElevationAtTime(tsB, utcB)

  const oppA = compute30DayWindows(tsA, utcA, thresholdDeg)
  const oppB = compute30DayWindows(tsB, utcB, thresholdDeg)

  const diffSunEl =
    elB.sunElevation !== null && elA.sunElevation !== null
      ? elB.sunElevation - elA.sunElevation
      : null

  const diffEarthEl =
    elB.earthElevation !== null && elA.earthElevation !== null
      ? elB.earthElevation - elA.earthElevation
      : null

  const diffSunHours =
    oppB && oppA ? oppB.sun.total_hours - oppA.sun.total_hours : null

  const diffEarthHours =
    oppB && oppA ? oppB.earth.total_hours - oppA.earth.total_hours : null

  const diffJointHours =
    oppB && oppA ? oppB.joint.total_hours - oppA.joint.total_hours : null

  const fmtDiff = (val: number | null, unit: string = '') => {
    if (val === null) return 'N/A'
    const sign = val > 0 ? '+' : ''
    return `${sign}${val.toFixed(1)}${unit}`
  }

  return (
    <div className="bg-space-800 border border-space-700 rounded-2xl p-4 flex flex-col gap-4 shadow-card">
      <div>
        <h2 className="text-sm font-semibold text-space-100 uppercase tracking-wider">
          Side-by-Side Comparison (Scenario B vs Scenario A)
        </h2>
        <p className="text-2xs text-space-400 mt-0.5">
          Direct trade-off analysis of geometry, illumination, and Earth line-of-sight metrics.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" role="table">
          <thead>
            <tr className="border-b border-space-700 text-3xs font-semibold text-space-400 uppercase tracking-wider">
              <th className="py-2.5 px-3">Metric</th>
              <th className="py-2.5 px-3 text-sun-400">
                Scenario A: {siteA?.name || 'A'}
              </th>
              <th className="py-2.5 px-3 text-earth-400">
                Scenario B: {siteB?.name || 'B'}
              </th>
              <th className="py-2.5 px-3 text-right">Difference (B − A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-space-800 text-2xs font-mono">
            {/* Site and Coordinates */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Landing Site Coordinates</td>
              <td className="py-2.5 px-3 text-space-200">
                {siteA?.lat !== null ? `${siteA?.lat}°, ${siteA?.lon}°` : 'Not published'}
              </td>
              <td className="py-2.5 px-3 text-space-200">
                {siteB?.lat !== null ? `${siteB?.lat}°, ${siteB?.lon}°` : 'Not published'}
              </td>
              <td className="py-2.5 px-3 text-right text-space-400">—</td>
            </tr>

            {/* Target Timestamp */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">Evaluation Date / Time (UTC)</td>
              <td className="py-2.5 px-3 text-space-200">{utcA}</td>
              <td className="py-2.5 px-3 text-space-200">{utcB}</td>
              <td className="py-2.5 px-3 text-right text-space-400">—</td>
            </tr>

            {/* Instantaneous Sun Elevation */}
            <tr className="bg-space-900/40">
              <td className="py-2.5 px-3 text-sun-300 font-sans font-medium">
                Current Sun Elevation (Center)
              </td>
              <td className="py-2.5 px-3 text-sun-300">
                {elA.sunElevation !== null ? `${elA.sunElevation.toFixed(2)}°` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-sun-300">
                {elB.sunElevation !== null ? `${elB.sunElevation.toFixed(2)}°` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-right font-bold text-space-200">
                {fmtDiff(diffSunEl, '°')}
              </td>
            </tr>

            {/* Instantaneous Earth Elevation */}
            <tr className="bg-space-900/40">
              <td className="py-2.5 px-3 text-earth-300 font-sans font-medium">
                Current Earth Elevation (Center LOS)
              </td>
              <td className="py-2.5 px-3 text-earth-300">
                {elA.earthElevation !== null ? `${elA.earthElevation.toFixed(2)}°` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-earth-300">
                {elB.earthElevation !== null ? `${elB.earthElevation.toFixed(2)}°` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-right font-bold text-space-200">
                {fmtDiff(diffEarthEl, '°')}
              </td>
            </tr>

            {/* 30-Day Sun Illumination */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">
                30-Day Sunlight Hours (&gt;= {thresholdDeg}°)
              </td>
              <td className="py-2.5 px-3 text-space-200">
                {oppA ? `${oppA.sun.total_hours} hrs (${oppA.sun.percentage}%)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-space-200">
                {oppB ? `${oppB.sun.total_hours} hrs (${oppB.sun.percentage}%)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-right font-bold text-space-200">
                {fmtDiff(diffSunHours, 'h')}
              </td>
            </tr>

            {/* 30-Day Earth Visibility */}
            <tr>
              <td className="py-2.5 px-3 text-space-300 font-sans font-medium">
                30-Day Earth Line-of-Sight Hours (&gt;= {thresholdDeg}°)
              </td>
              <td className="py-2.5 px-3 text-space-200">
                {oppA ? `${oppA.earth.total_hours} hrs (${oppA.earth.percentage}%)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-space-200">
                {oppB ? `${oppB.earth.total_hours} hrs (${oppB.earth.percentage}%)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-right font-bold text-space-200">
                {fmtDiff(diffEarthHours, 'h')}
              </td>
            </tr>

            {/* 30-Day Joint Availability */}
            <tr className="bg-emerald-950/20">
              <td className="py-2.5 px-3 text-emerald-300 font-sans font-medium">
                30-Day Concurrent Sun &amp; Earth Hours
              </td>
              <td className="py-2.5 px-3 text-emerald-300">
                {oppA ? `${oppA.joint.total_hours} hrs (${oppA.joint.percentage}%)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-emerald-300">
                {oppB ? `${oppB.joint.total_hours} hrs (${oppB.joint.percentage}%)` : 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-right font-bold text-space-200">
                {fmtDiff(diffJointHours, 'h')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-space-900/60 rounded-xl border border-space-700/60 text-3xs text-space-400">
        <strong className="text-space-200">Comparison Context:</strong> Near-side mare sites (like Blue Ghost in Mare Crisium) enjoy steady Earth line-of-sight and standard ~14-day diurnal illumination cycles. South polar sites (like IM-1 near Malapert A and IM-2 at Mons Mouton) experience grazing Sun angles and libration wobble that dips Earth near the local horizon.
      </div>
    </div>
  )
}
