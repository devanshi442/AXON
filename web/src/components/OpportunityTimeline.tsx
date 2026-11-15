import { useState, useMemo } from 'react'
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

  const siteA = sites.find((s) => s.id === scenarioAId)
  const siteB = sites.find((s) => s.id === scenarioBId)
  const tsA = timeseriesCache[scenarioAId]
  const tsB = timeseriesCache[scenarioBId]
  const horizonA = horizonCache[scenarioAId]
  const horizonB = horizonCache[scenarioBId]

  const nameA = siteA?.name || tsA?.site_name || (scenarioAId.startsWith('custom-') ? 'Custom Site A' : scenarioAId)
  const nameB = siteB?.name || tsB?.site_name || (scenarioBId.startsWith('custom-') ? 'Custom Site B' : scenarioBId)

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

  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [showRawWindows, setShowRawWindows] = useState(false)

  // Extract 1-hour granular slices for the graph (works when either A, B, or both are loaded)
  const graphData = useMemo(() => {
    const refTs = tsA || tsB
    const refOpp = oppA || oppB
    if (!refTs || !refOpp) return null

    const durationMs = windowDays * 24 * 3600 * 1000
    const startA = oppA ? new Date(oppA.start_utc).getTime() : new Date(refOpp.start_utc).getTime()
    const startB = oppB ? new Date(oppB.start_utc).getTime() : new Date(refOpp.start_utc).getTime()

    const stepMs = refTs.step_seconds * 1000
    const numPoints = Math.max(1, Math.ceil(durationMs / stepMs))

    let minEl = Math.min(-3, thresholdDeg - 2)
    let maxEl = Math.max(3, thresholdDeg + 2)

    const points: {
      idx: number
      pctX: number
      sunA: number | null
      sunB: number | null
      earthA: number | null
      earthB: number | null
      timeA: number
      timeB: number
    }[] = []

    const firstMsA = tsA ? new Date(tsA.times[0]).getTime() : 0
    const firstMsB = tsB ? new Date(tsB.times[0]).getTime() : 0

    for (let i = 0; i <= numPoints; i++) {
      const timeA = startA + i * stepMs
      const timeB = startB + i * stepMs

      let sunA: number | null = null
      let earthA: number | null = null
      if (tsA && tsA.times.length > 0) {
        const idxA = Math.max(0, Math.min(tsA.times.length - 1, Math.floor((timeA - firstMsA) / stepMs)))
        sunA = tsA.sun_elevation_deg[idxA] ?? null
        earthA = tsA.earth_elevation_deg[idxA] ?? null
      }

      let sunB: number | null = null
      let earthB: number | null = null
      if (tsB && tsB.times.length > 0) {
        const idxB = Math.max(0, Math.min(tsB.times.length - 1, Math.floor((timeB - firstMsB) / stepMs)))
        sunB = tsB.sun_elevation_deg[idxB] ?? null
        earthB = tsB.earth_elevation_deg[idxB] ?? null
      }

      if (sunA !== null) {
        minEl = Math.min(minEl, sunA)
        maxEl = Math.max(maxEl, sunA)
      }
      if (sunB !== null) {
        minEl = Math.min(minEl, sunB)
        maxEl = Math.max(maxEl, sunB)
      }

      points.push({
        idx: i,
        pctX: (i / numPoints) * 100,
        sunA,
        sunB,
        earthA,
        earthB,
        timeA,
        timeB,
      })
    }

    minEl -= 0.8
    maxEl += 0.8

    const toY = (val: number) => {
      const range = maxEl - minEl
      if (range === 0) return 50
      return 100 - ((val - minEl) / range) * 100
    }

    const baselineY = toY(thresholdDeg)

    const validA = points.filter((p) => p.sunA !== null)
    const pathA = validA.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.pctX.toFixed(2)} ${toY(p.sunA!).toFixed(2)}`).join(' ')
    const areaA =
      validA.length > 1
        ? `${pathA} L ${validA[validA.length - 1].pctX.toFixed(2)} ${baselineY.toFixed(2)} L ${validA[0].pctX.toFixed(2)} ${baselineY.toFixed(2)} Z`
        : ''

    const validB = points.filter((p) => p.sunB !== null)
    const pathB = validB.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.pctX.toFixed(2)} ${toY(p.sunB!).toFixed(2)}`).join(' ')
    const areaB =
      validB.length > 1
        ? `${pathB} L ${validB[validB.length - 1].pctX.toFixed(2)} ${baselineY.toFixed(2)} L ${validB[0].pctX.toFixed(2)} ${baselineY.toFixed(2)} Z`
        : ''

    return { points, pathA, areaA, pathB, areaB, minEl, maxEl, baselineY, toY }
  }, [tsA, tsB, oppA, oppB, windowDays, thresholdDeg])

  const hoveredPoint = graphData && hoverIdx !== null ? graphData.points[hoverIdx] ?? null : null

  const formatTick = (timeMs: number) => {
    const d = new Date(timeMs)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`
  }

  const windowLabel = windowDays === 0.5 ? '12-Hour' : windowDays === 1 ? '24-Hour' : `${windowDays}-Day`

  return (
    <div className="relative bg-[#18191B] border border-[#363A3F] rounded p-4 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#EDEEF0] uppercase tracking-wider flex items-center gap-2">
            <span></span> {windowLabel} Opportunity Timelines &amp; Science Windows (1-Hour Granularity)
          </h2>
          <p className="text-2xs text-[#AFB3BA] mt-0.5">
            Continuous hourly Sun elevation for <span className="text-[#E9AD51] font-semibold">Scenario A ({nameA})</span> vs{' '}
            <span className="text-[#638BFF] font-semibold">Scenario B ({nameB})</span> against the {thresholdDeg.toFixed(1)}° baseline. Hover anywhere for exact hourly values.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRawWindows((v) => !v)}
            className="px-2.5 py-1 rounded text-3xs font-mono bg-[#111113] text-[#638BFF] border border-[#363A3F] hover:border-[#638BFF]/50 transition-colors"
          >
            {showRawWindows ? 'Hide Interval Schedule ▲' : 'Interval Schedule ▼'}
          </button>
        </div>
      </div>

      {!oppA && !oppB ? (
        <div className="py-8 text-center text-xs text-[#AFB3BA] bg-[#111113] rounded border border-[#363A3F] font-mono">
          Loading ephemeris time series for Scenario A and B...
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Summary Metric Badges (A vs B side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-[#111113] rounded border border-[#E9AD51]/40 flex flex-col justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#E9AD51] font-semibold font-mono">
                Solar Illumination ({windowLabel})
              </span>
              <div className="flex items-baseline gap-4 mt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-[#E9AD51]">{oppA?.sun.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#AFB3BA] font-mono">A · {oppA?.sun.percentage ?? 0}%</div>
                </div>
                <div className="h-6 w-px bg-[#363A3F]" />
                <div>
                  <div className="text-lg font-bold font-mono text-[#638BFF]">{oppB?.sun.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#AFB3BA] font-mono">B · {oppB?.sun.percentage ?? 0}%</div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#111113] rounded border border-[#638BFF]/40 flex flex-col justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#638BFF] font-semibold font-mono">
                Direct-To-Earth Comm ({windowLabel})
              </span>
              <div className="flex items-baseline gap-4 mt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-[#E9AD51]">{oppA?.earth.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#AFB3BA] font-mono">A · {oppA?.earth.percentage ?? 0}%</div>
                </div>
                <div className="h-6 w-px bg-[#363A3F]" />
                <div>
                  <div className="text-lg font-bold font-mono text-[#638BFF]">{oppB?.earth.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#AFB3BA] font-mono">B · {oppB?.earth.percentage ?? 0}%</div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#111113] rounded border border-[#30C48D]/40 flex flex-col justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#30C48D] font-semibold font-mono">
                Joint Power + Comm ({windowLabel})
              </span>
              <div className="flex items-baseline gap-4 mt-1">
                <div>
                  <div className="text-lg font-bold font-mono text-[#E9AD51]">{oppA?.joint.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#AFB3BA] font-mono">A · {oppA?.joint.percentage ?? 0}%</div>
                </div>
                <div className="h-6 w-px bg-[#363A3F]" />
                <div>
                  <div className="text-lg font-bold font-mono text-[#638BFF]">{oppB?.joint.total_hours ?? 0}h</div>
                  <div className="text-3xs text-[#AFB3BA] font-mono">B · {oppB?.joint.percentage ?? 0}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive 1-Hour Granular Line & Baseline Chart */}
          {graphData && (
            <div className="p-3 bg-[#111113] rounded border border-[#363A3F] flex flex-col gap-2 font-mono select-none">
              <div className="flex flex-wrap justify-between items-center text-3xs gap-2 mb-1">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-[#E9AD51] rounded-full"></span>
                    <span className="text-[#E9AD51] font-semibold">Scenario A: {nameA}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-[#638BFF] rounded-full"></span>
                    <span className="text-[#638BFF] font-semibold">Scenario B: {nameB}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-px border-t border-dashed border-[#30C48D]"></span>
                    <span className="text-[#30C48D]">Baseline Threshold ({thresholdDeg.toFixed(1)}°)</span>
                  </div>
                </div>
                <span className="text-[#AFB3BA]">
                  Step: 1h ({graphData.points.length - 1} hourly samples) · Mast: {mastHeightM}m
                </span>
              </div>

              <div
                className="relative w-full h-[230px] border-b border-l border-[#363A3F] cursor-crosshair bg-[#151619]"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  const idx = Math.round(ratio * (graphData.points.length - 1))
                  setHoverIdx(idx)
                }}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <svg
                  className="absolute inset-0 w-full h-full overflow-visible"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {/* Shaded area under Scenario A & B curves */}
                  {graphData.areaB && (
                    <path d={graphData.areaB} fill="#638BFF" fillOpacity="0.08" />
                  )}
                  {graphData.areaA && (
                    <path d={graphData.areaA} fill="#E9AD51" fillOpacity="0.12" />
                  )}

                  {/* Baseline Threshold Line */}
                  <line
                    x1="0"
                    y1={graphData.baselineY}
                    x2="100"
                    y2={graphData.baselineY}
                    stroke="#30C48D"
                    strokeDasharray="2,2"
                    strokeWidth="0.6"
                    vectorEffect="non-scaling-stroke"
                  />

                  {/* Scenario B Curve */}
                  {graphData.pathB && (
                    <path
                      d={graphData.pathB}
                      fill="none"
                      stroke="#638BFF"
                      strokeWidth="1.8"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {/* Scenario A Curve */}
                  {graphData.pathA && (
                    <path
                      d={graphData.pathA}
                      fill="none"
                      stroke="#E9AD51"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>

                {/* Y-Axis Labels */}
                <div className="absolute left-1.5 top-1 text-[10px] text-[#AFB3BA] bg-[#111113]/80 px-1 rounded">
                  +{graphData.maxEl.toFixed(1)}°
                </div>
                <div
                  className="absolute left-1.5 text-[10px] text-[#30C48D] bg-[#111113]/80 px-1 rounded -translate-y-1/2"
                  style={{ top: `${Math.max(10, Math.min(90, graphData.baselineY))}%` }}
                >
                  Baseline {thresholdDeg.toFixed(1)}°
                </div>
                <div className="absolute left-1.5 bottom-1 text-[10px] text-[#AFB3BA] bg-[#111113]/80 px-1 rounded">
                  {graphData.minEl.toFixed(1)}°
                </div>

                {/* Hover Crosshair & 1-Hour Telemetry Readout */}
                {hoveredPoint && (
                  <>
                    <div
                      className="absolute top-0 bottom-0 w-px bg-[#EDEEF0]/40 pointer-events-none"
                      style={{ left: `${hoveredPoint.pctX}%` }}
                    />

                    <div
                      className={`absolute top-2 z-20 w-60 bg-[#18191B]/95 backdrop-blur border border-[#638BFF]/50 rounded p-2.5 text-3xs font-mono shadow-xl pointer-events-none ${
                        hoveredPoint.pctX > 55 ? '-translate-x-[105%]' : 'translate-x-[5%]'
                      }`}
                      style={{ left: `${hoveredPoint.pctX}%` }}
                    >
                      <div className="font-bold text-[#EDEEF0] border-b border-[#363A3F] pb-1 mb-1.5 flex justify-between">
                        <span>Hour +{hoveredPoint.idx}h</span>
                        <span className="text-[#AFB3BA]">{formatTick(hoveredPoint.timeA)}</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[#E9AD51]">
                          <span>A Sun / Earth El:</span>
                          <span className="font-bold">
                            {hoveredPoint.sunA !== null ? `${hoveredPoint.sunA.toFixed(2)}°` : 'N/A'} /{' '}
                            {hoveredPoint.earthA !== null ? `${hoveredPoint.earthA.toFixed(2)}°` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[#638BFF]">
                          <span>B Sun / Earth El:</span>
                          <span className="font-bold">
                            {hoveredPoint.sunB !== null ? `${hoveredPoint.sunB.toFixed(2)}°` : 'N/A'} /{' '}
                            {hoveredPoint.earthB !== null ? `${hoveredPoint.earthB.toFixed(2)}°` : 'N/A'}
                          </span>
                        </div>
                        {hoveredPoint.sunA !== null && hoveredPoint.sunB !== null && (
                          <div className="pt-1 border-t border-[#363A3F] flex justify-between items-center text-[#30C48D]">
                            <span>Delta (B − A):</span>
                            <span className="font-bold">
                              {hoveredPoint.sunB - hoveredPoint.sunA >= 0 ? '+' : ''}
                              {(hoveredPoint.sunB - hoveredPoint.sunA).toFixed(2)}°
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {hoveredPoint.sunA !== null && (
                      <div
                        className="absolute w-2.5 h-2.5 rounded-full bg-[#E9AD51] border-2 border-[#111113] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: `${hoveredPoint.pctX}%`, top: `${graphData.toY(hoveredPoint.sunA)}%` }}
                      />
                    )}
                    {hoveredPoint.sunB !== null && (
                      <div
                        className="absolute w-2.5 h-2.5 rounded-full bg-[#638BFF] border-2 border-[#111113] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: `${hoveredPoint.pctX}%`, top: `${graphData.toY(hoveredPoint.sunB)}%` }}
                      />
                    )}
                  </>
                )}
              </div>

              {/* X-Axis Labels */}
              <div className="flex justify-between text-[10px] text-[#AFB3BA] px-1 pt-0.5">
                <span>Start (0h)</span>
                <span>+{Math.round((windowDays * 24) / 4)}h</span>
                <span>+{Math.round((windowDays * 24) / 2)}h</span>
                <span>+{Math.round((windowDays * 24 * 3) / 4)}h</span>
                <span>End (+{Math.round(windowDays * 24)}h)</span>
              </div>
            </div>
          )}

          {/* Collapsible Raw Interval Table */}
          {showRawWindows && (
            <div className="p-3 bg-[#111113] rounded border border-[#363A3F] max-h-56 overflow-y-auto animate-fade-in">
              <table className="w-full text-left text-3xs font-mono">
                <thead>
                  <tr className="border-b border-[#363A3F] text-[#AFB3BA]">
                    <th className="pb-1.5">Scenario</th>
                    <th className="pb-1.5">Window Type</th>
                    <th className="pb-1.5">Start (UTC)</th>
                    <th className="pb-1.5">End (UTC)</th>
                    <th className="pb-1.5 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#363A3F]">
                  {oppA?.joint.windows.map((w, idx) => (
                    <tr key={`a-j-${idx}`} className="text-[#E9AD51]">
                      <td className="py-1">A ({nameA})</td>
                      <td className="py-1">Joint Sun + Earth</td>
                      <td className="py-1">{w.start}</td>
                      <td className="py-1">{w.end}</td>
                      <td className="py-1 text-right">{w.duration_hours}h</td>
                    </tr>
                  ))}
                  {oppB?.joint.windows.map((w, idx) => (
                    <tr key={`b-j-${idx}`} className="text-[#638BFF]">
                      <td className="py-1">B ({nameB})</td>
                      <td className="py-1">Joint Sun + Earth</td>
                      <td className="py-1">{w.start}</td>
                      <td className="py-1">{w.end}</td>
                      <td className="py-1 text-right">{w.duration_hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
