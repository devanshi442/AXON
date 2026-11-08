import type { ChangeEvent } from 'react'
import type { SelectableSite } from '../types/mission'
import {
  useScenarioStore,
  getElevationAtTime,
  getMaskForMastHeight,
  SUN_UPPER_LIMB_DEG,
} from '../stores/scenarioStore'
import {
  lookupHorizonElevation,
  computeSolarFraction,
  computeEarthVisibility,
  computeSolarPowerWatts,
  formatUtcDisplay,
} from '../utils/scienceMath'

interface ScenarioPanelProps {
  type: 'A' | 'B'
  sites: SelectableSite[]
}

export default function ScenarioPanel({ type, sites }: ScenarioPanelProps) {
  const {
    scenarioAId,
    scenarioBId,
    utcA,
    utcB,
    setScenarioA,
    setScenarioB,
    setUtcA,
    setUtcB,
    horizonMode,
    mastHeightM,
    dteMarginDeg,
    earthCriterion,
    solarArrayType,
    arrayAreaM2,
    arrayEfficiency,
    timeseriesCache,
    horizonCache,
    loading,
    error,
  } = useScenarioStore()

  const siteId = type === 'A' ? scenarioAId : scenarioBId
  const utc = type === 'A' ? utcA : utcB
  const setSite = type === 'A' ? setScenarioA : setScenarioB
  const setUtc = type === 'A' ? setUtcA : setUtcB

  const selectedSite = sites.find((s) => s.id === siteId)
  const ts = timeseriesCache[siteId]
  const horizon = horizonCache[siteId]
  const isLoading = loading[siteId]
  const hasError = error[siteId]

  const elevationData = getElevationAtTime(ts, utc)

  // Step UTC by delta hours
  const stepHours = (delta: number) => {
    const d = new Date(utc)
    d.setUTCHours(d.getUTCHours() + delta)
    setUtc(d.toISOString())
  }

  // Format date for datetime-local input (YYYY-MM-DDTHH:mm)
  const dtLocalValue = utc.slice(0, 16)

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    setUtc(new Date(e.target.value + ':00Z').toISOString())
  }

  // Terrain mask for selected mast height
  const mask = horizonMode === 'terrain' ? getMaskForMastHeight(horizon, mastHeightM) : null

  // Horizon elevations at current azimuths
  const sunAz = elevationData.sunAzimuth ?? 0.0
  const earthAz = elevationData.earthAzimuth ?? 0.0
  const sunEl = elevationData.sunElevation ?? -999.0
  const earthEl = elevationData.earthElevation ?? -999.0

  const sunHorizonEl = mask && elevationData.sunAzimuth !== null ? lookupHorizonElevation(mask, sunAz) : 0.0
  const earthHorizonEl = mask && elevationData.earthAzimuth !== null ? lookupHorizonElevation(mask, earthAz) : 0.0

  // Solar fraction & power
  const fSun =
    elevationData.sunElevation !== null
      ? horizonMode === 'terrain' && mask
        ? computeSolarFraction(sunAz, sunEl, mask)
        : sunEl + SUN_UPPER_LIMB_DEG >= 0.0
        ? 1.0
        : 0.0
      : 0.0

  const solarPowerW =
    elevationData.sunElevation !== null
      ? computeSolarPowerWatts(
          sunEl,
          sunAz,
          fSun,
          solarArrayType,
          arrayAreaM2,
          arrayEfficiency
        )
      : 0.0

  // Earth DTE visibility
  const isEarthUp =
    elevationData.earthElevation !== null
      ? horizonMode === 'terrain' && mask
        ? computeEarthVisibility(earthAz, earthEl, mask, dteMarginDeg, earthCriterion)
        : earthEl >= dteMarginDeg
      : false

  const isScenarioA = type === 'A'
  const accentBorder = isScenarioA ? 'border-sun-500/50' : 'border-earth-500/50'
  const badgeBg = isScenarioA ? 'bg-sun-500/20 text-sun-300' : 'bg-earth-500/20 text-earth-300'

  return (
    <div className={`p-4 bg-space-800 border ${accentBorder} rounded-2xl flex flex-col gap-4 shadow-card`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider ${badgeBg}`}>
            Scenario {type}
          </span>
          <span className="text-xs text-space-400 font-medium">
            {isScenarioA ? 'Primary Site Evaluation' : 'Secondary Comparison Site'}
          </span>
        </div>
        {selectedSite?.lat !== null && (
          <div className="flex items-center gap-2">
            {horizon?.dem_id && (
              <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-space-900 border border-space-700 text-cyan-300">
                {horizon.dem_id}
              </span>
            )}
            <span className="text-3xs font-mono text-space-400">
              {selectedSite?.lat}° Lat · {selectedSite?.lon}° Lon
            </span>
          </div>
        )}
      </div>

      {/* Site Selector & UTC Time Control */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Site dropdown */}
        <div>
          <label className="block text-3xs uppercase tracking-wider text-space-400 font-medium mb-1">
            Site / Mission
          </label>
          <select
            value={siteId}
            onChange={(e) => setSite(e.target.value)}
            className="w-full px-3 py-1.5 bg-space-900 border border-space-600 rounded-lg text-xs text-space-100 focus:outline-none focus:border-earth-500 transition-colors"
          >
            <optgroup label="Artemis / Candidate Landing Sites">
              {sites
                .filter((s) => s.kind === 'candidate' && s.lat !== null)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.lat}°, {s.lon}°)
                  </option>
                ))}
            </optgroup>
            <optgroup label="CLPS Missions with Coordinates">
              {sites
                .filter((s) => s.kind === 'mission' && s.lat !== null)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.lat}°, {s.lon}°)
                  </option>
                ))}
            </optgroup>
            <optgroup label="Reference Lunar Anchors">
              {sites
                .filter((s) => s.kind === 'reference' && s.lat !== null)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.lat}°, {s.lon}°)
                  </option>
                ))}
            </optgroup>
          </select>
        </div>

        {/* UTC Time input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-3xs uppercase tracking-wider text-space-400 font-medium">
              Date &amp; Time (UTC)
            </label>
            <span className="text-3xs font-mono text-cyan-300 font-medium">
              {formatUtcDisplay(utc)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={dtLocalValue}
              onChange={handleDateChange}
              className="flex-1 px-2.5 py-1.5 bg-space-900 border border-space-600 rounded-lg text-xs text-space-100 font-mono focus:outline-none focus:border-earth-500"
            />
            <div className="flex gap-1 text-3xs">
              <button
                onClick={() => stepHours(-24)}
                className="px-1.5 py-1 bg-space-700 hover:bg-space-600 text-space-200 rounded font-mono"
                title="Back 1 day"
              >
                -1d
              </button>
              <button
                onClick={() => stepHours(-1)}
                className="px-1.5 py-1 bg-space-700 hover:bg-space-600 text-space-200 rounded font-mono"
                title="Back 1 hour"
              >
                -1h
              </button>
              <button
                onClick={() => stepHours(1)}
                className="px-1.5 py-1 bg-space-700 hover:bg-space-600 text-space-200 rounded font-mono"
                title="Forward 1 hour"
              >
                +1h
              </button>
              <button
                onClick={() => stepHours(24)}
                className="px-1.5 py-1 bg-space-700 hover:bg-space-600 text-space-200 rounded font-mono"
                title="Forward 1 day"
              >
                +1d
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Geometry Status & Readouts */}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-space-400 animate-pulse">
          Loading precomputed ephemeris data...
        </div>
      ) : hasError ? (
        <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-xl text-xs text-rose-300">
          {hasError}
        </div>
      ) : elevationData.isOutRange ? (
        <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-xl text-xs text-amber-300">
          Selected time is outside precomputed coverage (2024–2028). Please choose a date within coverage.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Sun Elevation Card */}
          <div className="p-3 rounded-xl bg-space-900/90 border border-space-700 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-3xs uppercase tracking-wider text-sun-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sun-500"></span>
                Sun (Solar Power)
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-3xs font-medium ${
                  fSun >= 0.99
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : fSun > 0.0
                    ? 'bg-amber-950/60 text-amber-400 border border-amber-800/80'
                    : 'bg-space-800 text-space-400 border border-space-700'
                }`}
              >
                {fSun >= 0.99 ? 'Fully Lit' : fSun > 0 ? `Partial (${Math.round(fSun * 100)}%)` : 'In Shadow'}
              </span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-sun-300">
                {elevationData.sunElevation !== null
                  ? `${elevationData.sunElevation >= 0 ? '+' : ''}${elevationData.sunElevation.toFixed(2)}°`
                  : 'N/A'}
              </div>
              <div className="text-3xs text-space-400 mt-0.5 flex items-center justify-between">
                <span>Terrain Horizon: {sunHorizonEl.toFixed(2)}°</span>
                <span className="text-sun-400/90 font-mono font-medium">{solarPowerW.toFixed(1)} W</span>
              </div>
            </div>
            <div className="text-3xs font-mono text-space-400 flex items-center justify-between">
              <span>Azimuth: {elevationData.sunAzimuth !== null ? `${elevationData.sunAzimuth.toFixed(1)}°` : 'N/A'}</span>
              <span>Limb: {elevationData.sunElevation !== null ? `${(elevationData.sunElevation + SUN_UPPER_LIMB_DEG).toFixed(2)}°` : 'N/A'}</span>
            </div>
          </div>

          {/* Earth Elevation Card */}
          <div className="p-3 rounded-xl bg-space-900/90 border border-space-700 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-3xs uppercase tracking-wider text-earth-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-earth-500"></span>
                Earth (DTE Comm)
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-3xs font-medium ${
                  isEarthUp
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                    : 'bg-space-800 text-space-400 border border-space-700'
                }`}
              >
                {isEarthUp ? 'Direct LOS' : 'Blocked / Below Horizon'}
              </span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-earth-300">
                {elevationData.earthElevation !== null
                  ? `${elevationData.earthElevation >= 0 ? '+' : ''}${elevationData.earthElevation.toFixed(2)}°`
                  : 'N/A'}
              </div>
              <div className="text-3xs text-space-400 mt-0.5 flex items-center justify-between">
                <span>Terrain Horizon: {earthHorizonEl.toFixed(2)}°</span>
                <span>Margin: +{dteMarginDeg.toFixed(1)}°</span>
              </div>
            </div>
            <div className="text-3xs font-mono text-space-400 flex items-center justify-between">
              <span>Azimuth: {elevationData.earthAzimuth !== null ? `${elevationData.earthAzimuth.toFixed(1)}°` : 'N/A'}</span>
              <span className="capitalize">{earthCriterion.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Visual Horizon Diagram */}
      <div className="p-3 bg-space-900/60 rounded-xl border border-space-700/60 text-2xs">
        <div className="flex justify-between text-3xs text-space-400 mb-1 font-mono">
          <span>Nadir (-90°)</span>
          <span className="text-space-300 font-semibold">
            {horizonMode === 'terrain' ? `Local Skyline (${sunHorizonEl.toFixed(1)}° Sun / ${earthHorizonEl.toFixed(1)}° Earth)` : 'Datum (0°)'}
          </span>
          <span>Zenith (+90°)</span>
        </div>
        <div className="relative w-full h-5 bg-space-950 rounded-full overflow-hidden border border-space-700">
          {/* Horizon line at center */}
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-space-600 z-10" />

          {/* Local terrain horizon region for Sun */}
          {horizonMode === 'terrain' && (
            <div
              style={{
                left: `${Math.max(0, Math.min(100, ((sunHorizonEl + 90) / 180) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-1 -translate-x-1/2 bg-amber-600/60 z-10"
              title={`Sun Azimuth Skyline: ${sunHorizonEl.toFixed(2)}°`}
            />
          )}

          {/* Sun marker */}
          {elevationData.sunElevation !== null && (
            <div
              style={{
                left: `${Math.max(0, Math.min(100, ((elevationData.sunElevation + 90) / 180) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-sun-500 rounded-full shadow-lg z-20 flex items-center justify-center text-[8px]"
              title={`Sun: ${elevationData.sunElevation.toFixed(2)}° (Horizon: ${sunHorizonEl.toFixed(2)}°)`}
            />
          )}

          {/* Earth marker */}
          {elevationData.earthElevation !== null && (
            <div
              style={{
                left: `${Math.max(0, Math.min(100, ((elevationData.earthElevation + 90) / 180) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-earth-500 rounded-full shadow-lg z-20 flex items-center justify-center text-[8px]"
              title={`Earth: ${elevationData.earthElevation.toFixed(2)}° (Horizon: ${earthHorizonEl.toFixed(2)}°)`}
            />
          )}
        </div>
        <div className="mt-2 text-3xs text-space-400 flex items-center justify-between">
          <span>* Mode: {horizonMode === 'terrain' ? `LOLA DEM (${horizon?.dem_id || 'DEM'}, mast: ${mastHeightM}m)` : 'Flat Lunar Datum (0°)'}</span>
          <span className="text-space-300">Array: {solarArrayType}</span>
        </div>
      </div>
    </div>
  )
}
