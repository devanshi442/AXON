import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  compute30DayWindows,
} from '../stores/scenarioStore'
import { type EarthCriterion, type SolarOrientation, formatUtcDisplay } from '../utils/scienceMath'

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
  })

  const mastHeights = [0.0, 1.5, 3.0, 5.0, 10.0]

  return (
    <div className="bg-space-800 border border-space-700 rounded-2xl p-4 flex flex-col gap-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-space-100 uppercase tracking-wider flex items-center gap-2">
            <span>⚡</span> 30-Day Opportunity Timelines &amp; Science Windows
          </h2>
          <p className="text-2xs text-space-400 mt-0.5">
            Solar power generation potential and Direct-to-Earth (DTE) communication availability calculated over 720 hours.
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex items-center gap-1 bg-space-900 p-1 rounded-xl border border-space-700 text-xs">
          <button
            onClick={() => setActiveTab('A')}
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              activeTab === 'A'
                ? 'bg-sun-500 text-space-950 font-bold'
                : 'text-space-400 hover:text-space-200'
            }`}
          >
            Scenario A ({sites.find((s) => s.id === scenarioAId)?.name || 'A'})
          </button>
          <button
            onClick={() => setActiveTab('B')}
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              activeTab === 'B'
                ? 'bg-earth-500 text-space-950 font-bold'
                : 'text-space-400 hover:text-space-200'
            }`}
          >
            Scenario B ({sites.find((s) => s.id === scenarioBId)?.name || 'B'})
          </button>
        </div>
      </div>

      {/* Science Model Controls Bar */}
      <div className="bg-space-900/90 p-3.5 rounded-xl border border-space-700/80 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-space-800">
          {/* Horizon Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-3xs uppercase tracking-wider text-space-400 font-medium">Horizon Mode:</span>
            <div className="flex items-center bg-space-950 p-0.5 rounded-lg border border-space-700 text-xs">
              <button
                onClick={() => setHorizonMode('terrain')}
                className={`px-2.5 py-1 rounded font-medium transition-colors text-3xs ${
                  horizonMode === 'terrain'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                    : 'text-space-400 hover:text-space-200'
                }`}
              >
                Terrain-Aware (LOLA DEM)
              </button>
              <button
                onClick={() => setHorizonMode('flat')}
                className={`px-2.5 py-1 rounded font-medium transition-colors text-3xs ${
                  horizonMode === 'flat'
                    ? 'bg-space-700 text-space-100 font-bold'
                    : 'text-space-400 hover:text-space-200'
                }`}
              >
                Flat Datum (0°)
              </button>
            </div>
          </div>

          {/* Observer Mast Height Selection */}
          <div className="flex items-center gap-2">
            <span className="text-3xs uppercase tracking-wider text-space-400 font-medium">Observer Mast Height:</span>
            <div className="flex items-center gap-1">
              {mastHeights.map((h) => (
                <button
                  key={h}
                  onClick={() => setMastHeightM(h)}
                  className={`px-2 py-0.5 rounded font-mono text-3xs border transition-colors ${
                    mastHeightM === h
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                      : 'bg-space-950 text-space-400 border-space-700 hover:text-space-200'
                  }`}
                >
                  {h}m
                </button>
              ))}
            </div>
          </div>

          {/* Solar Array Orientation */}
          <div className="flex items-center gap-2">
            <span className="text-3xs uppercase tracking-wider text-space-400 font-medium">Solar Array:</span>
            <select
              value={solarArrayType}
              onChange={(e) => setSolarArrayType(e.target.value as SolarOrientation)}
              className="px-2 py-1 bg-space-950 border border-space-700 rounded text-3xs text-space-200 focus:outline-none"
            >
              <option value="vertical">Vertical Mast (Azimuth Tracking)</option>
              <option value="flat">Horizontal Surface (cos i = sin el)</option>
              <option value="tracking">Full 2-Axis Sun Tracking</option>
            </select>
          </div>
        </div>

        {/* Sliders & Criteria */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Sun Elevation Threshold */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-3xs">
              <span className="text-space-400 font-medium">Sun Elevation Threshold:</span>
              <span className="font-mono text-sun-300 font-bold">{thresholdDeg.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={thresholdDeg}
              onChange={(e) => setThresholdDeg(parseFloat(e.target.value))}
              className="w-full accent-sun-500 cursor-pointer"
            />
          </div>

          {/* DTE Antenna Clearance Margin */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-3xs">
              <span className="text-space-400 font-medium">Antenna Clearance Margin:</span>
              <span className="font-mono text-earth-300 font-bold">+{dteMarginDeg.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={dteMarginDeg}
              onChange={(e) => setDteMarginDeg(parseFloat(e.target.value))}
              className="w-full accent-earth-500 cursor-pointer"
            />
          </div>

          {/* Earth Disk Criterion */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-3xs">
              <span className="text-space-400 font-medium">Earth LOS Criterion:</span>
              <span className="font-mono text-cyan-300 capitalize">{earthCriterion.replace('_', ' ')}</span>
            </div>
            <select
              value={earthCriterion}
              onChange={(e) => setEarthCriterion(e.target.value as EarthCriterion)}
              className="w-full px-2 py-1 bg-space-950 border border-space-700 rounded text-3xs text-space-200 focus:outline-none"
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
        <div className="py-8 text-center text-xs text-space-400 bg-space-900 rounded-xl border border-space-700/60">
          No time series loaded for {site?.name}. Select a site with precomputed coverage.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary Metric Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Sun Card */}
            <div className="p-3 bg-space-900 rounded-xl border border-sun-500/30 flex flex-col justify-between">
              <div>
                <span className="text-3xs uppercase tracking-wider text-sun-400 font-semibold flex items-center justify-between">
                  <span>Solar Illumination &amp; Power</span>
                  <span className="text-space-400 font-mono font-normal">
                    {horizonMode === 'terrain' ? 'Terrain Masked' : 'Flat Datum'}
                  </span>
                </span>
                <div className="text-xl font-bold font-mono text-sun-300 mt-1">
                  {oppData.sun.total_hours} hrs
                  <span className="text-xs text-space-400 font-normal ml-1.5">
                    ({oppData.sun.percentage}%)
                  </span>
                </div>
                <div className="text-3xs text-space-400 mt-0.5 flex items-center justify-between">
                  <span>{oppData.sun.windows.length} illuminated window(s)</span>
                  <span className="text-sun-400 font-mono font-medium">
                    ⚡ {oppData.solar_energy_kwh} kWh / m²
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-space-800 flex flex-col gap-1">
                {oppData.delta_sun_hours !== 0 && (
                  <div className="text-3xs font-mono text-amber-300">
                    Terrain Impact: {oppData.delta_sun_hours > 0 ? '+' : ''}{oppData.delta_sun_hours} hrs vs flat
                  </div>
                )}
                {oppData.sun.longest_dark_gap_hours != null && (
                  <div className="px-2 py-0.5 bg-rose-950/40 border border-rose-800/40 rounded text-3xs text-rose-300 font-mono flex items-center justify-between">
                    <span>Max Dark Gap:</span>
                    <span>{oppData.sun.longest_dark_gap_hours} hrs</span>
                  </div>
                )}
              </div>
            </div>

            {/* Earth Card */}
            <div className="p-3 bg-space-900 rounded-xl border border-earth-500/30 flex flex-col justify-between">
              <div>
                <span className="text-3xs uppercase tracking-wider text-earth-400 font-semibold flex items-center justify-between">
                  <span>Direct-To-Earth (DTE) Comm</span>
                  <span className="text-space-400 font-mono font-normal">Margin: +{dteMarginDeg}°</span>
                </span>
                <div className="text-xl font-bold font-mono text-earth-300 mt-1">
                  {oppData.earth.total_hours} hrs
                  <span className="text-xs text-space-400 font-normal ml-1.5">
                    ({oppData.earth.percentage}%)
                  </span>
                </div>
                <div className="text-3xs text-space-400 mt-0.5">
                  {oppData.earth.windows.length} continuous window(s)
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-space-800 flex flex-col gap-1">
                {oppData.delta_earth_hours !== 0 && (
                  <div className="text-3xs font-mono text-cyan-300">
                    Terrain Impact: {oppData.delta_earth_hours > 0 ? '+' : ''}{oppData.delta_earth_hours} hrs vs flat
                  </div>
                )}
                {oppData.earth.longest_dark_gap_hours != null && (
                  <div className="px-2 py-0.5 bg-rose-950/40 border border-rose-800/40 rounded text-3xs text-rose-300 font-mono flex items-center justify-between">
                    <span>Max Comm Blackout:</span>
                    <span>{oppData.earth.longest_dark_gap_hours} hrs</span>
                  </div>
                )}
              </div>
            </div>

            {/* Joint Card */}
            <div className="p-3 bg-space-900 rounded-xl border border-emerald-500/30 flex flex-col justify-between">
              <div>
                <span className="text-3xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center justify-between">
                  <span>Joint Power &amp; Comm Window</span>
                  <span className="text-emerald-400/80 font-mono font-normal">Concurrent</span>
                </span>
                <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                  {oppData.joint.total_hours} hrs
                  <span className="text-xs text-space-400 font-normal ml-1.5">
                    ({oppData.joint.percentage}%)
                  </span>
                </div>
                <div className="text-3xs text-space-400 mt-0.5">
                  {oppData.joint.windows.length} joint operations window(s)
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-space-800 flex flex-col gap-1">
                {oppData.joint.longest_window_hours != null && (
                  <div className="px-2 py-0.5 bg-emerald-950/40 border border-emerald-800/40 rounded text-3xs text-emerald-300 font-mono flex items-center justify-between">
                    <span>Longest Joint Window:</span>
                    <span>{oppData.joint.longest_window_hours} hrs</span>
                  </div>
                )}
                {oppData.joint.longest_dark_gap_hours != null && (
                  <div className="px-2 py-0.5 bg-rose-950/40 border border-rose-800/40 rounded text-3xs text-rose-300 font-mono flex items-center justify-between">
                    <span>Longest Joint Gap:</span>
                    <span>{oppData.joint.longest_dark_gap_hours} hrs</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Graphical Opportunity Bars */}
          <div className="p-3 bg-space-900 rounded-xl border border-space-700 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold text-space-200">
                30-Day Opportunity Visualizer (720 Hours Timeline from {formatUtcDisplay(utc)})
              </span>
              <span className="text-3xs text-space-400 font-mono">
                {horizonMode === 'terrain' ? `Topography: ${horizon?.dem_id || 'LOLA DEM'}` : 'Idealized Horizon'}
              </span>
            </div>

            {/* Sun Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-space-400 mb-1">
                <span className="text-sun-400 font-medium">Solar Power Generation Potential</span>
                <span>{oppData.sun.total_hours} / 720 hrs ({oppData.sun.percentage}%)</span>
              </div>
              <div className="w-full h-5 bg-space-950 rounded-lg overflow-hidden flex border border-space-700/80">
                {oppData.sun.windows.length > 0 ? (
                  oppData.sun.windows.map((w, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${(w.duration_hours / 720) * 100}%` }}
                      className="h-full bg-sun-500 hover:brightness-110 transition-all border-r border-space-900"
                      title={`Sun window: ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
                    />
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xs text-space-500">
                    No periods above threshold (Terrain shadowed)
                  </div>
                )}
              </div>
            </div>

            {/* Earth Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-space-400 mb-1">
                <span className="text-earth-400 font-medium">Direct-to-Earth (DTE) Line-of-Sight Window</span>
                <span>{oppData.earth.total_hours} / 720 hrs ({oppData.earth.percentage}%)</span>
              </div>
              <div className="w-full h-5 bg-space-950 rounded-lg overflow-hidden flex border border-space-700/80">
                {oppData.earth.windows.length > 0 ? (
                  oppData.earth.windows.map((w, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${(w.duration_hours / 720) * 100}%` }}
                      className="h-full bg-earth-500 hover:brightness-110 transition-all border-r border-space-900"
                      title={`Earth window: ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
                    />
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xs text-space-500">
                    No periods above threshold (Occulted)
                  </div>
                )}
              </div>
            </div>

            {/* Joint Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-space-400 mb-1">
                <span className="text-emerald-400 font-medium">Joint Solar Power &amp; DTE Comm Windows</span>
                <span>{oppData.joint.total_hours} / 720 hrs ({oppData.joint.percentage}%)</span>
              </div>
              <div className="w-full h-5 bg-space-950 rounded-lg overflow-hidden flex border border-space-700/80">
                {oppData.joint.windows.length > 0 ? (
                  oppData.joint.windows.map((w, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${(w.duration_hours / 720) * 100}%` }}
                      className="h-full bg-emerald-500 hover:brightness-110 transition-all border-r border-space-900"
                      title={`Joint window: ${w.start} to ${w.end} (${w.duration_hours} hrs)`}
                    />
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xs text-space-500">
                    No concurrent periods
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Window List Table */}
          <div className="p-3 bg-space-900 rounded-xl border border-space-700">
            <h3 className="text-2xs font-semibold text-space-200 mb-2">
              Contiguous Availability Intervals (Starting {utc})
            </h3>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left text-3xs">
                <thead>
                  <tr className="border-b border-space-700 text-space-400 font-medium">
                    <th className="pb-1.5">Type</th>
                    <th className="pb-1.5">Start (UTC)</th>
                    <th className="pb-1.5">End (UTC)</th>
                    <th className="pb-1.5 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-space-800 font-mono">
                  {oppData.joint.windows.map((w, idx) => (
                    <tr key={`j-${idx}`} className="text-emerald-300">
                      <td className="py-1">Sun &amp; Earth</td>
                      <td className="py-1">{w.start}</td>
                      <td className="py-1">{w.end}</td>
                      <td className="py-1 text-right">{w.duration_hours}h</td>
                    </tr>
                  ))}
                  {oppData.sun.windows.map((w, idx) => (
                    <tr key={`s-${idx}`} className="text-sun-300/80">
                      <td className="py-1">Sun Only</td>
                      <td className="py-1">{w.start}</td>
                      <td className="py-1">{w.end}</td>
                      <td className="py-1 text-right">{w.duration_hours}h</td>
                    </tr>
                  ))}
                  {oppData.earth.windows.map((w, idx) => (
                    <tr key={`e-${idx}`} className="text-earth-300/80">
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
      <div className="px-3 py-2 rounded-xl bg-space-900/60 border border-space-700/60 text-3xs text-space-400 text-center leading-relaxed">
        ⚠️ <strong>Operational Notice:</strong> Sun-above-horizon indicates geometric line-of-sight (f_sun &gt; 0), not delivered electrical power; Earth visibility is line-of-sight, not an RF link budget.
      </div>
    </div>
  )
}
