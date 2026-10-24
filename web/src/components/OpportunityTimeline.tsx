import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  compute30DayWindows,
} from '../stores/scenarioStore'

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
    timeseriesCache,
  } = useScenarioStore()

  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A')

  const siteId = activeTab === 'A' ? scenarioAId : scenarioBId
  const utc = activeTab === 'A' ? utcA : utcB
  const site = sites.find((s) => s.id === siteId)
  const ts = timeseriesCache[siteId]

  const oppData = compute30DayWindows(ts, utc, thresholdDeg)

  return (
    <div className="bg-space-800 border border-space-700 rounded-2xl p-4 flex flex-col gap-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-space-100 uppercase tracking-wider">
            30-Day Opportunity Timelines &amp; Windows
          </h2>
          <p className="text-2xs text-space-400 mt-0.5">
            Solar Power Generation potential and Direct-to-Earth (DTE) communication availability calculated over 720 hours.
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

      {/* Threshold Slider */}
      <div className="bg-space-900/80 p-3 rounded-xl border border-space-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <label htmlFor="threshold-slider" className="text-xs font-medium text-space-200">
              Minimum Elevation Threshold:
            </label>
            <span className="text-xs font-bold font-mono text-earth-300 px-2 py-0.5 bg-space-800 rounded border border-space-700">
              {thresholdDeg.toFixed(1)}°
            </span>
          </div>
          <span className="text-3xs text-space-400">
            Minimum angle above idealized horizon for solar array illumination and antenna pointing.
          </span>
        </div>
        <div className="flex items-center gap-3 flex-1 max-w-sm">
          <span className="text-3xs text-space-400 font-mono">0°</span>
          <input
            id="threshold-slider"
            type="range"
            min="0"
            max="25"
            step="0.5"
            value={thresholdDeg}
            onChange={(e) => setThresholdDeg(parseFloat(e.target.value))}
            className="w-full accent-earth-500 cursor-pointer"
          />
          <span className="text-3xs text-space-400 font-mono">25°</span>
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
            <div className="p-3 bg-space-900 rounded-xl border border-sun-500/30">
              <span className="text-3xs uppercase tracking-wider text-sun-400 font-semibold">
                Solar Power Generation (Sun &gt;= {thresholdDeg}°)
              </span>
              <div className="text-xl font-bold font-mono text-sun-300 mt-1">
                {oppData.sun.total_hours} hrs
                <span className="text-xs text-space-400 font-normal ml-1.5">
                  ({oppData.sun.percentage}%)
                </span>
              </div>
              <div className="text-3xs text-space-400 mt-0.5">
                {oppData.sun.windows.length} continuous interval(s)
              </div>
              {oppData.sun.longest_dark_gap_hours != null && (
                <div className="mt-1.5 px-2 py-1 bg-rose-950/30 border border-rose-800/40 rounded text-3xs text-rose-300 font-mono">
                  Longest dark gap: {oppData.sun.longest_dark_gap_hours} h
                </div>
              )}
            </div>

            <div className="p-3 bg-space-900 rounded-xl border border-earth-500/30">
              <span className="text-3xs uppercase tracking-wider text-earth-400 font-semibold">
                Direct-To-Earth Comm (Earth &gt;= {thresholdDeg}°)
              </span>
              <div className="text-xl font-bold font-mono text-earth-300 mt-1">
                {oppData.earth.total_hours} hrs
                <span className="text-xs text-space-400 font-normal ml-1.5">
                  ({oppData.earth.percentage}%)
                </span>
              </div>
              <div className="text-3xs text-space-400 mt-0.5">
                {oppData.earth.windows.length} continuous interval(s)
              </div>
              {oppData.earth.longest_dark_gap_hours != null && (
                <div className="mt-1.5 px-2 py-1 bg-rose-950/30 border border-rose-800/40 rounded text-3xs text-rose-300 font-mono">
                  Longest blackout: {oppData.earth.longest_dark_gap_hours} h
                </div>
              )}
            </div>

            <div className="p-3 bg-space-900 rounded-xl border border-emerald-500/30">
              <span className="text-3xs uppercase tracking-wider text-emerald-400 font-semibold">
                Joint Power &amp; DTE Comm Windows
              </span>
              <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                {oppData.joint.total_hours} hrs
                <span className="text-xs text-space-400 font-normal ml-1.5">
                  ({oppData.joint.percentage}%)
                </span>
              </div>
              <div className="text-3xs text-space-400 mt-0.5">
                {oppData.joint.windows.length} joint window(s)
              </div>
              {oppData.joint.longest_dark_gap_hours != null && (
                <div className="mt-1.5 px-2 py-1 bg-rose-950/30 border border-rose-800/40 rounded text-3xs text-rose-300 font-mono">
                  Longest joint blackout: {oppData.joint.longest_dark_gap_hours} h
                </div>
              )}
            </div>
          </div>

          {/* Graphical Opportunity Bars */}
          <div className="p-3 bg-space-900 rounded-xl border border-space-700 flex flex-col gap-3">
            <span className="text-2xs font-semibold text-space-200">
              30-Day Opportunity Visualizer (720 Hours Timeline)
            </span>

            {/* Sun Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-space-400 mb-1">
                <span className="text-sun-400 font-medium">Solar Power Generation Potential</span>
                <span>{oppData.sun.total_hours} / 720 hrs</span>
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
                    No periods above {thresholdDeg}° threshold
                  </div>
                )}
              </div>
            </div>

            {/* Earth Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-space-400 mb-1">
                <span className="text-earth-400 font-medium">Direct-to-Earth (DTE) Line-of-Sight Window</span>
                <span>{oppData.earth.total_hours} / 720 hrs</span>
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
                    No periods above {thresholdDeg}° threshold (Occulted)
                  </div>
                )}
              </div>
            </div>

            {/* Joint Timeline Bar */}
            <div>
              <div className="flex justify-between text-3xs text-space-400 mb-1">
                <span className="text-emerald-400 font-medium">Joint Solar Power &amp; DTE Comm Windows</span>
                <span>{oppData.joint.total_hours} / 720 hrs</span>
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

      <p className="text-3xs text-space-500 text-center">
        * Hourly sampling precision. Flat idealized horizon (0°). Does not replace mission-critical link budgets or thermal design.
      </p>
    </div>
  )
}
