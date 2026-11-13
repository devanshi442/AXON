import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  compute30DayWindows,
} from '../stores/scenarioStore'
import { type EarthCriterion, type SolarOrientation, formatUtcDisplay } from '../utils/scienceMath'
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
    setThresholdDeg,
    horizonMode,
    setHorizonMode,
    mastHeightM,
    setMastHeightM,
    dteMarginDeg,
    setDteMarginDeg,
    earthCriterion,
    setEarthCriterion,
    solarArrayType,
    setSolarArrayType,
    arrayAreaM2,
    arrayEfficiency,
    windowDays,
    setWindowDays,
    timeseriesCache,
    horizonCache,
  } = useScenarioStore()

  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A')

  const siteId = activeTab === 'A' ? scenarioAId : scenarioBId
  const utc = activeTab === 'A' ? utcA : utcB
  const site = sites.find((s) => s.id === siteId)
  const ts = timeseriesCache[siteId]
  const horizon = horizonCache[siteId]

  const oppData = compute30DayWindows(ts, utc, {
    horizonMode,
    horizonProfile: horizon,
    mastHeightM,
    sunThresholdDeg: thresholdDeg,
    dteMarginDeg,
    earthCriterion,
    solarArrayType,
    arrayAreaM2,
    arrayEfficiency,
    windowDays,
  })

  const mastHeights = [0.0, 1.5, 3.0, 5.0, 10.0]
const timelineHours = oppData?.total_period_hours ?? 0

const getWindowStyle = (start: string, end: string) => {
  if (!oppData || timelineHours <= 0) {
    return { left: '0%', width: '0%' }
  }

  const timelineStart = new Date(oppData.start_utc).getTime()
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
  return (
    <div className="relative bg-[#0D1014] border border-[#2A2D31] rounded p-4 flex flex-col gap-4">
      <PanelCornerBrackets />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider flex items-center gap-2">
            <span>⚡</span> {windowDays}-Day Opportunity Timelines &amp; Science Windows
          </h2>
          <p className="text-2xs text-[#8A8A88] mt-0.5">
            Solar power generation potential and Direct-to-Earth (DTE) communication availability over up to {windowDays} days of available coverage.
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex items-center gap-1 bg-[#050608] p-1 rounded border border-[#2A2D31] text-xs font-mono">
          <button
            onClick={() => setActiveTab('A')}
            title={`Scenario A (${sites.find((s) => s.id === scenarioAId)?.name || 'A'})`}
            className={`px-3 py-1 rounded font-medium transition-colors max-w-[160px] sm:max-w-[220px] truncate ${
              activeTab === 'A'
                ? 'bg-[#E0A04A] text-[#050608] font-bold'
                : 'text-[#8A8A88] hover:text-[#E4E4E2]'
            }`}
          >
            Scenario A ({sites.find((s) => s.id === scenarioAId)?.name || 'A'})
          </button>
          <button
            onClick={() => setActiveTab('B')}
            title={`Scenario B (${sites.find((s) => s.id === scenarioBId)?.name || 'B'})`}
            className={`px-3 py-1 rounded font-medium transition-colors max-w-[160px] sm:max-w-[220px] truncate ${
              activeTab === 'B'
                ? 'bg-[#6FA8C9] text-[#050608] font-bold'
                : 'text-[#8A8A88] hover:text-[#E4E4E2]'
            }`}
          >
            Scenario B ({sites.find((s) => s.id === scenarioBId)?.name || 'B'})
          </button>
        </div>
      </div>

      {/* Science Model Controls Bar */}
      <div className="bg-[#050608] p-3.5 rounded border border-[#2A2D31] flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#2A2D31]">
          {/* Horizon Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-3xs uppercase tracking-wider text-[#8A8A88] font-medium font-mono">Horizon Mode:</span>
            <div className="flex items-center bg-[#0D1014] p-0.5 rounded border border-[#2A2D31] text-xs">
              <button
                onClick={() => setHorizonMode('terrain')}
                className={`px-2.5 py-1 rounded font-medium transition-colors text-3xs font-mono ${
                  horizonMode === 'terrain'
                    ? 'bg-[#6DBF8B]/20 text-[#6DBF8B] border border-[#6DBF8B]/50 font-bold'
                    : 'text-[#8A8A88] hover:text-[#E4E4E2]'
                }`}
              >
                Terrain-Aware (LOLA DEM)
              </button>
              <button
                onClick={() => setHorizonMode('flat')}
                className={`px-2.5 py-1 rounded font-medium transition-colors text-3xs font-mono ${
                  horizonMode === 'flat'
                    ? 'bg-[#171B22] text-[#E4E4E2] font-bold border border-[#2A2D31]'
                    : 'text-[#8A8A88] hover:text-[#E4E4E2]'
                }`}
              >
                Flat sphere, 0 deg horizon
              </button>
            </div>
          </div>

          {/* Observer Mast Height Selection */}
          <div className="flex items-center gap-2">
            <span className="text-3xs uppercase tracking-wider text-[#8A8A88] font-medium font-mono">Observer Mast Height:</span>
            <div className="flex items-center gap-1">
              {mastHeights.map((h) => (
                <button
                  key={h}
                  onClick={() => setMastHeightM(h)}
                  className={`px-2 py-0.5 rounded font-mono text-3xs border transition-colors ${
                    mastHeightM === h
                      ? 'bg-[#6FA8C9]/20 text-[#6FA8C9] border-[#6FA8C9]/50 font-bold'
                      : 'bg-[#0D1014] text-[#8A8A88] border-[#2A2D31] hover:text-[#E4E4E2]'
                  }`}
                >
                  {h}m
                </button>
              ))}
            </div>
          </div>

          {/* Solar Array Orientation */}
          <div className="flex items-center gap-2 font-mono">
            <span className="text-3xs uppercase tracking-wider text-[#8A8A88] font-medium">Solar Array:</span>
            <select
              value={solarArrayType}
              onChange={(e) => setSolarArrayType(e.target.value as SolarOrientation)}
              className="px-2 py-1 bg-[#0D1014] border border-[#2A2D31] rounded text-3xs text-[#E4E4E2] focus:outline-none"
            >
              <option value="vertical">Vertical Mast (Azimuth Tracking)</option>
              <option value="flat">Horizontal Surface (cos i = sin el)</option>
              <option value="tracking">Full 2-Axis Sun Tracking</option>
            </select>
          </div>

          {/* Analysis Window Duration Selection */}
          <div className="flex items-center gap-2">
            <span className="text-3xs uppercase tracking-wider text-[#8A8A88] font-medium font-mono">Duration:</span>
            <div className="flex items-center gap-1">
              {[7, 14, 30, 60, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setWindowDays(days)}
                  className={`px-2 py-0.5 rounded font-mono text-3xs border transition-colors ${
                    windowDays === days
                      ? 'bg-[#E0A04A]/20 text-[#E0A04A] border-[#E0A04A]/50 font-bold'
                      : 'bg-[#0D1014] text-[#8A8A88] border-[#2A2D31] hover:text-[#E4E4E2]'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sliders & Criteria */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 font-mono">
          {/* Sun Elevation Threshold */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-3xs">
              <span className="text-[#8A8A88] font-medium">Sun Elevation Threshold:</span>
              <span className="font-mono text-[#E0A04A] font-bold">{thresholdDeg.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={thresholdDeg}
              onChange={(e) => setThresholdDeg(parseFloat(e.target.value))}
              className="w-full accent-[#E0A04A] cursor-pointer"
            />
          </div>

          {/* DTE Antenna Clearance Margin */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-3xs">
              <span className="text-[#8A8A88] font-medium">Antenna Clearance Margin:</span>
              <span className="font-mono text-[#6FA8C9] font-bold">+{dteMarginDeg.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={dteMarginDeg}
              onChange={(e) => setDteMarginDeg(parseFloat(e.target.value))}
              className="w-full accent-[#6FA8C9] cursor-pointer"
            />
          </div>

          {/* Earth Disk Criterion */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-3xs">
              <span className="text-[#8A8A88] font-medium">Earth LOS Criterion:</span>
              <span className="font-mono text-[#6FA8C9] capitalize">{earthCriterion.replace('_', ' ')}</span>
            </div>
            <select
              value={earthCriterion}
              onChange={(e) => setEarthCriterion(e.target.value as EarthCriterion)}
              className="w-full px-2 py-1 bg-[#0D1014] border border-[#2A2D31] rounded text-3xs text-[#E4E4E2] focus:outline-none"
            >
              <option value="center">Center LOS (Earth center &gt;= horizon + margin)</option>
              <option value="full_disk">Full Disk Clear (Lower limb above horizon)</option>
              <option value="any_limb">Any Limb Visible (Grazing contact)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Opportunity Visualization */}
      {!oppData ? (
        <div className="py-8 text-center text-xs text-[#8A8A88] bg-[#050608] rounded border border-[#2A2D31] font-mono">
          No time series loaded for {site?.name}. Select a site with precomputed coverage.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary Metric Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Sun Card */}
            <div className="p-3 bg-[#050608] rounded border border-[#E0A04A]/40 flex flex-col justify-between">
              <div>
                <span className="text-3xs uppercase tracking-wider text-[#E0A04A] font-semibold flex items-center justify-between font-mono">
                  <span>Solar Illumination &amp; Power</span>
                  <span className="text-[#8A8A88] font-normal">
                    {horizonMode === 'terrain' ? 'Terrain Masked' : 'Flat sphere, 0 deg horizon'}
                  </span>
                </span>
                <div className="text-xl font-bold font-mono text-[#E0A04A] mt-1">
                  {oppData.sun.total_hours} hrs
                  <span className="text-xs text-[#8A8A88] font-normal ml-1.5">
                    ({oppData.sun.percentage}%)
                  </span>
                </div>
                <div className="text-3xs text-[#8A8A88] mt-0.5 flex items-center justify-between font-mono">
                  <span>{oppData.sun.windows.length} illuminated window(s)</span>
                  <span className="text-[#E0A04A] font-bold">
                    ⚡ {oppData.solar_energy_kwh} kWh / m²
                  </span>
                </div>
                <div className="text-3xs text-[#8A8A88] font-mono mt-1">
                  Daylight: {windowDays}-day window from {formatUtcDisplay(utc)}, mast {mastHeightM} m
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-[#2A2D31] flex flex-col gap-1">
                {oppData.delta_sun_hours !== 0 && (
                  <div className="text-3xs font-mono text-[#E0A04A]">
                    Terrain Impact: {oppData.delta_sun_hours > 0 ? '+' : ''}{oppData.delta_sun_hours} hrs vs flat
                  </div>
                )}
                {oppData.sun.longest_dark_gap_hours != null && (
                  <div className="px-2 py-0.5 bg-[#2A1210] border border-[#7F2318] rounded text-3xs text-[#E5604A] font-mono flex items-center justify-between">
                    <span>Max Dark Gap:</span>
                    <span>{oppData.sun.longest_dark_gap_hours} hrs</span>
                  </div>
                )}
              </div>
            </div>

            {/* Earth Card */}
            <div className="p-3 bg-[#050608] rounded border border-[#6FA8C9]/40 flex flex-col justify-between">
              <div>
                <span className="text-3xs uppercase tracking-wider text-[#6FA8C9] font-semibold flex items-center justify-between font-mono">
                  <span>Direct-To-Earth (DTE) Comm</span>
                  <span className="text-[#8A8A88] font-normal">Margin: +{dteMarginDeg}°</span>
                </span>
                <div className="text-xl font-bold font-mono text-[#6FA8C9] mt-1">
                  {oppData.earth.total_hours} hrs
                  <span className="text-xs text-[#8A8A88] font-normal ml-1.5">
                    ({oppData.earth.percentage}%)
                  </span>
                </div>
                <div className="text-3xs text-[#8A8A88] mt-0.5 font-mono">
                  {oppData.earth.windows.length} continuous window(s)
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-[#2A2D31] flex flex-col gap-1">
                {oppData.delta_earth_hours !== 0 && (
                  <div className="text-3xs font-mono text-[#6FA8C9]">
                    Terrain Impact: {oppData.delta_earth_hours > 0 ? '+' : ''}{oppData.delta_earth_hours} hrs vs flat
                  </div>
                )}
                {oppData.earth.longest_dark_gap_hours != null && (
                  <div className="px-2 py-0.5 bg-[#2A1210] border border-[#7F2318] rounded text-3xs text-[#E5604A] font-mono flex items-center justify-between">
                    <span>Max Comm Blackout:</span>
                    <span>{oppData.earth.longest_dark_gap_hours} hrs</span>
                  </div>
                )}
              </div>
            </div>

            {/* Joint Card */}
            <div className="p-3 bg-[#050608] rounded border border-[#6DBF8B]/40 flex flex-col justify-between">
              <div>
                <span className="text-3xs uppercase tracking-wider text-[#6DBF8B] font-semibold flex items-center justify-between font-mono">
                  <span>Joint Power &amp; Comm Window</span>
                  <span className="text-[#6DBF8B]/80 font-normal">Concurrent</span>
                </span>
                <div className="text-xl font-bold font-mono text-[#6DBF8B] mt-1">
                  {oppData.joint.total_hours} hrs
                  <span className="text-xs text-[#8A8A88] font-normal ml-1.5">
                    ({oppData.joint.percentage}%)
                  </span>
                </div>
                <div className="text-3xs text-[#8A8A88] mt-0.5 font-mono">
                  {oppData.joint.windows.length} joint operations window(s)
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-[#2A2D31] flex flex-col gap-1">
                {oppData.joint.longest_window_hours != null && (
                  <div className="px-2 py-0.5 bg-[#132A1C] border border-[#2A5C3D] rounded text-3xs text-[#6DBF8B] font-mono flex items-center justify-between">
                    <span>Longest Joint Window:</span>
                    <span>{oppData.joint.longest_window_hours} hrs</span>
                  </div>
                )}
                {oppData.joint.longest_dark_gap_hours != null && (
                  <div className="px-2 py-0.5 bg-[#2A1210] border border-[#7F2318] rounded text-3xs text-[#E5604A] font-mono flex items-center justify-between">
                    <span>Longest Joint Gap:</span>
                    <span>{oppData.joint.longest_dark_gap_hours} hrs</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Graphical Opportunity Bars */}
          <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-3 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold text-[#E4E4E2]">
                {windowDays}-Day Opportunity Visualizer ({oppData.total_period_hours} Timeline from {formatUtcDisplay(utc)})
              </span>
              <span className="text-3xs text-[#8A8A88]">
                {horizonMode === 'terrain' ? `Topography: ${horizon?.dem_id || 'LOLA DEM'}` : 'Idealized Horizon'}
              </span>
            </div>

            {/* Sun Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-[#8A8A88] mb-1">
                <span className="text-[#E0A04A] font-medium">Solar Power Generation Potential</span>
                <span>{oppData.sun.total_hours} / {oppData.total_period_hours} hrs ({oppData.sun.percentage}%)</span>
              </div>
              <div className="relative w-full h-5 bg-[#0D1014] rounded overflow-hidden border border-[#2A2D31]">
                {oppData.sun.windows.length > 0 ? (
                  oppData.sun.windows.map((w, idx) => (
                    <div
                      key={idx}
                     style={getWindowStyle(w.start, w.end)}
                      className="absolute top-0 h-full bg-[#E0A04A] hover:brightness-110 transition-all border-r border-[#050608]"
                      title={`Sun window: ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
                    />
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xs text-[#6B6F75]">
                    No periods above threshold (Terrain shadowed)
                  </div>
                )}
              </div>
            </div>

            {/* Earth Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-[#8A8A88] mb-1">
                <span className="text-[#6FA8C9] font-medium">Direct-to-Earth (DTE) Line-of-Sight Window</span>
                <span>{oppData.earth.total_hours} / {oppData.total_period_hours} hrs ({oppData.earth.percentage}%)</span>
              </div>
              <div className="relative w-full h-5 bg-[#0D1014] rounded overflow-hidden border border-[#2A2D31]">
                {oppData.earth.windows.length > 0 ? (
                  oppData.earth.windows.map((w, idx) => (
                    <div
                      key={idx}
                      style={getWindowStyle(w.start, w.end)}
                      className="absolute top-0 h-full bg-[#6FA8C9] hover:brightness-110 transition-all border-r border-[#050608]"
                      title={`Earth window: ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
                    />
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xs text-[#6B6F75]">
                    No periods above threshold (Occulted)
                  </div>
                )}
              </div>
            </div>

            {/* Joint Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-[#8A8A88] mb-1">
                <span className="text-[#6DBF8B] font-medium">Joint Solar Power &amp; DTE Comm Windows</span>
                <span>{oppData.joint.total_hours} / {oppData.total_period_hours} hrs ({oppData.joint.percentage}%)</span>
              </div>
              <div className="relative w-full h-5 bg-[#0D1014] rounded overflow-hidden border border-[#2A2D31]">
                {oppData.joint.windows.length > 0 ? (
                  oppData.joint.windows.map((w, idx) => (
                    <div
                      key={idx}
                      style={getWindowStyle(w.start, w.end)}
                      className="absolute top-0 h-full bg-[#6DBF8B] hover:brightness-110 transition-all border-r border-[#050608]"
                      title={`Joint window: ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
                    />
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xs text-[#6B6F75]">
                    No concurrent periods
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Window List Table */}
          <div className="p-3 bg-[#050608] rounded border border-[#2A2D31]">
            <h3 className="text-2xs font-semibold text-[#E4E4E2] mb-2 font-mono">
              Contiguous Availability Intervals (Starting {utc})
            </h3>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left text-3xs font-mono">
                <thead>
                  <tr className="border-b border-[#2A2D31] text-[#8A8A88] font-medium">
                    <th className="pb-1.5">Type</th>
                    <th className="pb-1.5">Start (UTC)</th>
                    <th className="pb-1.5">End (UTC)</th>
                    <th className="pb-1.5 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2D31]">
                  {oppData.joint.windows.map((w, idx) => (
                    <tr key={`j-${idx}`} className="text-[#6DBF8B]">
                      <td className="py-1">Sun &amp; Earth</td>
                      <td className="py-1">{w.start}</td>
                      <td className="py-1">{w.end}</td>
                      <td className="py-1 text-right">{w.duration_hours}h</td>
                    </tr>
                  ))}
                  {oppData.sun.windows.map((w, idx) => (
                    <tr key={`s-${idx}`} className="text-[#E0A04A]/80">
                      <td className="py-1">Sun Only</td>
                      <td className="py-1">{w.start}</td>
                      <td className="py-1">{w.end}</td>
                      <td className="py-1 text-right">{w.duration_hours}h</td>
                    </tr>
                  ))}
                  {oppData.earth.windows.map((w, idx) => (
                    <tr key={`e-${idx}`} className="text-[#6FA8C9]/80">
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
        </div>
      )}

      {/* Scientific Caveat Warning */}
      <div className="px-3 py-2 rounded bg-[#050608] border border-[#2A2D31] text-3xs text-[#8A8A88] text-center leading-relaxed">
        ⚠️ <strong>Operational Notice:</strong> Sun-above-horizon indicates geometric line-of-sight (f_sun &gt; 0), not delivered electrical power; Earth visibility is line-of-sight, not an RF link budget.
      </div>
    </div>
  )
}
