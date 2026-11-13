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
    windowDays,
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
    horizonMode, horizonProfile: hA, mastHeightM, sunThresholdDeg: thresholdDeg,
    dteMarginDeg, earthCriterion, solarArrayType, arrayAreaM2, arrayEfficiency, windowDays,
  })

  const oppB = compute30DayWindows(tsB, utcB, {
    horizonMode, horizonProfile: hB, mastHeightM, sunThresholdDeg: thresholdDeg,
    dteMarginDeg, earthCriterion, solarArrayType, arrayAreaM2, arrayEfficiency, windowDays,
  })

  const maskA = horizonMode === 'terrain' ? getMaskForMastHeight(hA, mastHeightM) : null
  const maskB = horizonMode === 'terrain' ? getMaskForMastHeight(hB, mastHeightM) : null

  const fSunA = elA.sunElevation !== null
      ? maskA && elA.sunAzimuth !== null ? computeSolarFraction(elA.sunAzimuth, elA.sunElevation - thresholdDeg, maskA)
      : elA.sunElevation + SUN_UPPER_LIMB_DEG >= thresholdDeg ? 1.0 : 0.0 : 0.0

  const fSunB = elB.sunElevation !== null
      ? maskB && elB.sunAzimuth !== null ? computeSolarFraction(elB.sunAzimuth, elB.sunElevation - thresholdDeg, maskB)
      : elB.sunElevation + SUN_UPPER_LIMB_DEG >= thresholdDeg ? 1.0 : 0.0 : 0.0

  const pWattsA = elA.sunElevation !== null
      ? computeSolarPowerWatts(elA.sunElevation, elA.sunAzimuth ?? 0, fSunA, solarArrayType, arrayAreaM2, arrayEfficiency) : 0.0

  const pWattsB = elB.sunElevation !== null
      ? computeSolarPowerWatts(elB.sunElevation, elB.sunAzimuth ?? 0, fSunB, solarArrayType, arrayAreaM2, arrayEfficiency) : 0.0

  const hasRegionCentre = 
    (siteA?.coord_kind === 'region_centre' || siteA?.coord_kind === 'planned_region_center') ||
    (siteB?.coord_kind === 'region_centre' || siteB?.coord_kind === 'planned_region_center')

  // --- Visual Diverging Bar Component ---
  const DivergingBar = ({ valA, valB, unit = '', invert = false, maxDelta = 100, label }: { valA: number | null, valB: number | null, unit?: string, invert?: boolean, maxDelta?: number, label: string }) => {
    if (valA === null || valB === null) {
      return (
        <div className="py-2.5 flex items-center justify-between border-b border-[#2A2D31] font-mono">
          <span className="text-3xs text-[#8A8A88]">{label}</span>
          <span className="text-3xs text-[#8A8A88]">N/A</span>
        </div>
      )
    }

    const delta = valB - valA
    const isBBetter = invert ? delta < 0 : delta > 0
    const isTie = delta === 0
    
    // Scale bar based on percentage of maxDelta
    const pct = Math.min(100, (Math.abs(delta) / maxDelta) * 100)
    const sign = delta > 0 ? '+' : ''
    
    return (
      <div className="py-3 flex flex-col gap-1.5 border-b border-[#2A2D31] last:border-0 font-mono">
        <div className="flex justify-between items-end">
          <span className="text-3xs text-[#8A8A88] font-medium uppercase tracking-wider">{label}</span>
          <span className={`text-xs font-bold ${isTie ? 'text-[#8A8A88]' : isBBetter ? 'text-[#6FA8C9]' : 'text-[#E0A04A]'}`}>
            {sign}{delta.toFixed(1)}{unit}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-3xs text-[#E0A04A] w-12 text-right">{valA.toFixed(1)}{unit}</span>
          
          <div className="flex-1 h-2.5 bg-[#050608] rounded-full flex relative overflow-hidden ring-1 ring-[#2A2D31]">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#8A8A88] z-10" />
            <div className="flex-1 flex justify-end">
              {!isTie && !isBBetter && <div style={{ width: `${pct}%` }} className="h-full bg-[#E0A04A]" />}
            </div>
            <div className="flex-1">
              {!isTie && isBBetter && <div style={{ width: `${pct}%` }} className="h-full bg-[#6FA8C9]" />}
            </div>
          </div>
          
          <span className="text-3xs text-[#6FA8C9] w-12 text-left">{valB.toFixed(1)}{unit}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-[#0D1014] border border-[#2A2D31] rounded p-4 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider flex items-center gap-2">
            <span>⚖️</span> Side-by-Side Advantage (B vs A)
          </h2>
          <p className="text-2xs text-[#8A8A88] mt-0.5">
            Diverging baseline comparison. Bars extending right (<span className="text-[#6FA8C9]">Blue</span>) favor Scenario B. Bars extending left (<span className="text-[#E0A04A]">Orange</span>) favor Scenario A.
          </p>
        </div>
      </div>

      {hasRegionCentre && (
        <div className="p-2.5 rounded bg-[#2A1210] border border-[#7F2318] text-3xs text-[#E0A04A] font-medium font-sans">
          ⚠️ Note: One or both selections are generic region centres. Metrics will differ wildly from actual peaks.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        
        {/* Physical Context */}
        <div className="bg-[#050608] border border-[#2A2D31] rounded p-3">
          <h3 className="text-xs font-semibold text-[#B9A58C] uppercase tracking-wider mb-2 font-mono flex items-center gap-2">
            <span>📍</span> Geography &amp; Context
          </h3>
          <div className="flex flex-col text-3xs font-mono text-[#8A8A88] gap-1.5">
            <div className="flex justify-between border-b border-[#2A2D31] pb-1.5">
              <span>Date</span>
              <span className="text-[#E4E4E2]">{formatUtcDisplay(utcA)}</span>
            </div>
            <div className="flex justify-between border-b border-[#2A2D31] pb-1.5">
              <span>Lat/Lon (A)</span>
              <span className="text-[#E0A04A]">{siteA?.lat ?? 'N/A'}°, {siteA?.lon ?? 'N/A'}°</span>
            </div>
            <div className="flex justify-between">
              <span>Lat/Lon (B)</span>
              <span className="text-[#6FA8C9]">{siteB?.lat ?? 'N/A'}°, {siteB?.lon ?? 'N/A'}°</span>
            </div>
          </div>
        </div>

        {/* Instantaneous Lighting */}
        <div className="bg-[#050608] border border-[#2A2D31] rounded p-3">
          <h3 className="text-xs font-semibold text-[#E4E4E2] uppercase tracking-wider mb-2 font-mono flex items-center gap-2">
            <span>☀️</span> Instantaneous (At UTC)
          </h3>
          <DivergingBar label="Solar Array Power" valA={pWattsA} valB={pWattsB} unit="W" maxDelta={100} />
          <DivergingBar label="Sun Elevation" valA={elA.sunElevation} valB={elB.sunElevation} unit="°" maxDelta={5} />
          <DivergingBar label="Earth Elevation" valA={elA.earthElevation} valB={elB.earthElevation} unit="°" maxDelta={10} />
        </div>

        {/* 30-Day Aggregates */}
        <div className="md:col-span-2 bg-[#050608] border border-[#2A2D31] rounded p-3">
          <h3 className="text-xs font-semibold text-[#6DBF8B] uppercase tracking-wider mb-2 font-mono flex items-center gap-2">
            <span>⚡</span> {windowDays}-Day Mission Windows
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <DivergingBar label="Total Sun Hours" valA={oppA?.sun.total_hours ?? null} valB={oppB?.sun.total_hours ?? null} unit="h" maxDelta={windowDays * 24} />
              <DivergingBar label="Solar Yield" valA={oppA?.solar_energy_kwh ?? null} valB={oppB?.solar_energy_kwh ?? null} unit="kWh" maxDelta={50} />
              <DivergingBar label="Longest Dark Gap" valA={oppA?.sun.longest_dark_gap_hours ?? null} valB={oppB?.sun.longest_dark_gap_hours ?? null} unit="h" invert maxDelta={100} />
            </div>
            <div>
              <DivergingBar label="Total DTE Earth Hours" valA={oppA?.earth.total_hours ?? null} valB={oppB?.earth.total_hours ?? null} unit="h" maxDelta={windowDays * 24} />
              <DivergingBar label="Joint Comm & Power Window" valA={oppA?.joint.total_hours ?? null} valB={oppB?.joint.total_hours ?? null} unit="h" maxDelta={windowDays * 24} />
              <DivergingBar label="Longest DTE Blackout" valA={oppA?.earth.longest_dark_gap_hours ?? null} valB={oppB?.earth.longest_dark_gap_hours ?? null} unit="h" invert maxDelta={100} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}