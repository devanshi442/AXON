import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  compute30DayWindows,
} from '../stores/scenarioStore'
import { formatUtcDisplay } from '../utils/scienceMath'
import PanelCornerBrackets from './PanelCornerBrackets'

interface OpportunityTimelineProps {
  sites: SelectableSite[]
}

export default function OpportunityTimeline({ sites }: OpportunityTimelineProps) {
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
    windowDays,
    timeseriesCache,
    horizonCache,
  } = useScenarioStore()

  const [showRawTable, setShowRawTable] = useState(false)

  const siteA = sites.find((s) => s.id === scenarioAId)
  const siteB = sites.find((s) => s.id === scenarioBId)
  const tsA = timeseriesCache[scenarioAId]
  const tsB = timeseriesCache[scenarioBId]
  const horizonA = horizonCache[scenarioAId]
  const horizonB = horizonCache[scenarioBId]

  const commonOpts = {
    horizonMode,
    mastHeightM,
    sunThresholdDeg: thresholdDeg,
    dteMarginDeg,
    earthCriterion,
    solarArrayType,
    arrayAreaM2,
    arrayEfficiency,
    windowDays,
  }

  const oppA = compute30DayWindows(tsA, utcA, { ...commonOpts, horizonProfile: horizonA })
  const oppB = compute30DayWindows(tsB, utcB, { ...commonOpts, horizonProfile: horizonB })

  const getWindowStyle = (opp: typeof oppA, start: string, end: string) => {
    const timelineHours = opp?.total_period_hours ?? 0
    if (!opp || timelineHours <= 0) {
      return { left: '0%', width: '0%' }
    }

    const timelineStart = new Date(opp.start_utc).getTime()
    const windowStart = new Date(start).getTime()
    const windowEnd = new Date(end).getTime()

    const startOffsetHours = (windowStart - timelineStart) / 3600000
    const durationHours = (windowEnd - windowStart) / 3600000

    const left = Math.max(0, Math.min(100, (startOffsetHours / timelineHours) * 100))
    const right = Math.max(left, Math.min(100, ((startOffsetHours + durationHours) / timelineHours) * 100))

    return {
      left: `${left}%`,
      width: `${right - left}%`,
    }
  }

  // One row of stacked A/B bars for a given metric (sun / earth / joint)
  const MetricRow = ({
    label,
    color,
    oppKey,
    emptyLabel,
  }: {
    label: string
    color: string
    oppKey: 'sun' | 'earth' | 'joint'
    emptyLabel: string
  }) => (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-3xs text-[#8A8A88]">
        <span className="font-medium" style={{ color }}>{label}</span>
        <span className="font-mono">
          A: {oppA ? `${oppA[oppKey].total_hours}h (${oppA[oppKey].percentage}%)` : 'N/A'} · B:{' '}
          {oppB ? `${oppB[oppKey].total_hours}h (${oppB[oppKey].percentage}%)` : 'N/A'}
        </span>
      </div>
      {/* Scenario A bar */}
      <div className="relative w-full h-4 bg-[#0D1014] rounded overflow-hidden border border-[#2A2D31]">
        <span className="absolute left-1 top-0 bottom-0 flex items-center text-[8px] font-mono text-[#6B6F75] z-20 pointer-events-none">A</span>
        {oppA && oppA[oppKey].windows.length > 0 ? (
          oppA[oppKey].windows.map((w, idx) => (
            <div
              key={idx}
              className="absolute top-0 h-full hover:brightness-110 transition-all border-r border-[#050608]"
              title={`${label} (A): ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
              style={{ ...getWindowStyle(oppA, w.start, w.end), backgroundColor: color }}
            />
          ))
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[8px] text-[#6B6F75] font-mono">
            {emptyLabel}
          </div>
        )}
      </div>
      {/* Scenario B bar */}
      <div className="relative w-full h-4 bg-[#0D1014] rounded overflow-hidden border border-[#2A2D31]">
        <span className="absolute left-1 top-0 bottom-0 flex items-center text-[8px] font-mono text-[#6B6F75] z-20 pointer-events-none">B</span>
        {oppB && oppB[oppKey].windows.length > 0 ? (
          oppB[oppKey].windows.map((w, idx) => (
            <div
              key={idx}
              className="absolute top-0 h-full hover:brightness-110 transition-all border-r border-[#050608] opacity-80"
              title={`${label} (B): ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
              style={{ ...getWindowStyle(oppB, w.start, w.end), backgroundColor: color }}
            />
          ))
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[8px] text-[#6B6F75] font-mono">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative bg-[#0D1014] border border-[#2A2D31] rounded p-4 flex flex-col gap-4">
      <PanelCornerBrackets />
      <div>
        <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider flex items-center gap-2">
          <span>⚡</span> {windowDays}-Day Opportunity Timelines &amp; Science Windows
        </h2>
        <p className="text-2xs text-[#8A8A88] mt-0.5">
          Scenario A (<span className="text-[#E0A04A]">{siteA?.name || 'A'}</span>) and Scenario B (
          <span className="text-[#6FA8C9]">{siteB?.name || 'B'}</span>) shown together on the same UTC axis so
          overlapping windows and dark gaps are visible at a glance.
        </p>
      </div>

      {!oppA && !oppB ? (
        <div className="py-8 text-center text-xs text-[#8A8A88] bg-[#050608] rounded border border-[#2A2D31] font-mono">
          No time series loaded yet. Select sites for Scenario A and B with precomputed coverage.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary Metric Badges (A vs B side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Sun Card */}
            <div className="p-3 bg-[#050608] rounded border border-[#E0A04A]/40 flex flex-col justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#E0A04A] font-semibold font-mono">
                Solar Illumination &amp; Power
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-[#E0A04A]">{oppA?.sun.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#8A8A88] font-mono">A · {oppA?.sun.percentage ?? 0}%</div>
                </div>
                <div className="h-6 w-px bg-[#2A2D31]" />
                <div>
                  <div className="text-lg font-bold font-mono text-[#E0A04A]/80">{oppB?.sun.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#8A8A88] font-mono">B · {oppB?.sun.percentage ?? 0}%</div>
                </div>
              </div>
              <div className="text-3xs text-[#8A8A88] font-mono mt-1.5 pt-1.5 border-t border-[#2A2D31]">
                ⚡ A: {oppA?.solar_energy_kwh ?? 0} kWh/m² · B: {oppB?.solar_energy_kwh ?? 0} kWh/m²
              </div>
            </div>

            {/* Earth Card */}
            <div className="p-3 bg-[#050608] rounded border border-[#6FA8C9]/40 flex flex-col justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#6FA8C9] font-semibold font-mono">
                Direct-To-Earth (DTE) Comm
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-[#6FA8C9]">{oppA?.earth.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#8A8A88] font-mono">A · {oppA?.earth.percentage ?? 0}%</div>
                </div>
                <div className="h-6 w-px bg-[#2A2D31]" />
                <div>
                  <div className="text-lg font-bold font-mono text-[#6FA8C9]/80">{oppB?.earth.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#8A8A88] font-mono">B · {oppB?.earth.percentage ?? 0}%</div>
                </div>
              </div>
              <div className="text-3xs text-[#8A8A88] font-mono mt-1.5 pt-1.5 border-t border-[#2A2D31]">
                Margin: +{dteMarginDeg}° · {earthCriterion.replace('_', ' ')}
              </div>
            </div>

            {/* Joint Card */}
            <div className="p-3 bg-[#050608] rounded border border-[#6DBF8B]/40 flex flex-col justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#6DBF8B] font-semibold font-mono">
                Joint Power &amp; Comm Window
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-[#6DBF8B]">{oppA?.joint.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#8A8A88] font-mono">A · {oppA?.joint.percentage ?? 0}%</div>
                </div>
                <div className="h-6 w-px bg-[#2A2D31]" />
                <div>
                  <div className="text-lg font-bold font-mono text-[#6DBF8B]/80">{oppB?.joint.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#8A8A88] font-mono">B · {oppB?.joint.percentage ?? 0}%</div>
                </div>
              </div>
              <div className="text-3xs text-[#8A8A88] font-mono mt-1.5 pt-1.5 border-t border-[#2A2D31]">
                Max dark gap A: {oppA?.sun.longest_dark_gap_hours ?? 'N/A'}h · B: {oppB?.sun.longest_dark_gap_hours ?? 'N/A'}h
              </div>
            </div>
          </div>

          {/* Stacked A/B Opportunity Bars on shared UTC axis */}
          <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-3.5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold text-[#E4E4E2]">
                {windowDays}-Day Opportunity Visualizer (shared UTC axis)
              </span>
              <span className="text-3xs text-[#8A8A88]">
                {horizonMode === 'terrain' ? 'Terrain-Aware (LOLA DEM)' : 'Flat sphere, 0 deg horizon'} · mast {mastHeightM}m
              </span>
            </div>

            <MetricRow label="Solar Power Generation" color="#E0A04A" oppKey="sun" emptyLabel="No sunlight above threshold" />
            <MetricRow label="Direct-to-Earth (DTE) Line-of-Sight" color="#6FA8C9" oppKey="earth" emptyLabel="Occulted" />
            <MetricRow label="Joint Solar + DTE Window" color="#6DBF8B" oppKey="joint" emptyLabel="No concurrent periods" />

            <div className="flex justify-between text-3xs text-[#8A8A88] pt-1 border-t border-[#2A2D31]">
              <span>Scenario A from {formatUtcDisplay(utcA)}</span>
              <span>Scenario B from {formatUtcDisplay(utcB)}</span>
            </div>
          </div>

          {/* Raw interval table, collapsed by default */}
          <div className="bg-[#050608] rounded border border-[#2A2D31]">
            <button
              type="button"
              onClick={() => setShowRawTable((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-2xs font-mono text-[#E4E4E2] hover:bg-[#0D1014] transition-colors"
            >
              <span>View Raw Interval Schedule (CSV / Table)</span>
              <span className="text-[#8A8A88]">{showRawTable ? '▲' : '▼'}</span>
            </button>
            {showRawTable && (
              <div className="px-3 pb-3 animate-fade-in">
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-3xs font-mono">
                    <thead>
                      <tr className="border-b border-[#2A2D31] text-[#8A8A88] font-medium">
                        <th className="pb-1.5">Scenario</th>
                        <th className="pb-1.5">Type</th>
                        <th className="pb-1.5">Start (UTC)</th>
                        <th className="pb-1.5">End (UTC)</th>
                        <th className="pb-1.5 text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A2D31]">
                      {oppA?.joint.windows.map((w, idx) => (
                        <tr key={`a-j-${idx}`} className="text-[#6DBF8B]">
                          <td className="py-1">A</td>
                          <td className="py-1">Sun &amp; Earth</td>
                          <td className="py-1">{w.start}</td>
                          <td className="py-1">{w.end}</td>
                          <td className="py-1 text-right">{w.duration_hours}h</td>
                        </tr>
                      ))}
                      {oppA?.sun.windows.map((w, idx) => (
                        <tr key={`a-s-${idx}`} className="text-[#E0A04A]/80">
                          <td className="py-1">A</td>
                          <td className="py-1">Sun Only</td>
                          <td className="py-1">{w.start}</td>
                          <td className="py-1">{w.end}</td>
                          <td className="py-1 text-right">{w.duration_hours}h</td>
                        </tr>
                      ))}
                      {oppA?.earth.windows.map((w, idx) => (
                        <tr key={`a-e-${idx}`} className="text-[#6FA8C9]/80">
                          <td className="py-1">A</td>
                          <td className="py-1">Earth Only</td>
                          <td className="py-1">{w.start}</td>
                          <td className="py-1">{w.end}</td>
                          <td className="py-1 text-right">{w.duration_hours}h</td>
                        </tr>
                      ))}
                      {oppB?.joint.windows.map((w, idx) => (
                        <tr key={`b-j-${idx}`} className="text-[#6DBF8B]">
                          <td className="py-1">B</td>
                          <td className="py-1">Sun &amp; Earth</td>
                          <td className="py-1">{w.start}</td>
                          <td className="py-1">{w.end}</td>
                          <td className="py-1 text-right">{w.duration_hours}h</td>
                        </tr>
                      ))}
                      {oppB?.sun.windows.map((w, idx) => (
                        <tr key={`b-s-${idx}`} className="text-[#E0A04A]/80">
                          <td className="py-1">B</td>
                          <td className="py-1">Sun Only</td>
                          <td className="py-1">{w.start}</td>
                          <td className="py-1">{w.end}</td>
                          <td className="py-1 text-right">{w.duration_hours}h</td>
                        </tr>
                      ))}
                      {oppB?.earth.windows.map((w, idx) => (
                        <tr key={`b-e-${idx}`} className="text-[#6FA8C9]/80">
                          <td className="py-1">B</td>
                          <td className="py-1">Earth Only</td>
                          <td className="py-1">{w.start}</td>
                          <td className="py-1">{w.end}</td>
                          <td className="py-1 text-right">{w.duration_hours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scientific Caveat Warning */}
      <div className="px-3 py-2 rounded bg-[#050608] border border-[#2A2D31] text-3xs text-[#8A8A88] text-center leading-relaxed">
        ⚠️ <strong>Operational Notice:</strong> Sun-above-horizon indicates geometric line-of-sight (f_sun &gt; 0), not delivered electrical power; Earth visibility is line-of-sight, not an RF link budget.
      </div>
    </div>
  )
}
