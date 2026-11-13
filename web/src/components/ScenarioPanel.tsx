import { useMemo, useState, useEffect, type ChangeEvent } from 'react'
import type { SelectableSite, HorizonProfile } from '../types/mission'
import {
  useScenarioStore,
  getElevationAtTime,
  getMaskForMastHeight,
  compute30DayWindows,
  SUN_UPPER_LIMB_DEG,
} from '../stores/scenarioStore'
import {
  lookupHorizonElevation,
  computeSolarFraction,
  computeEarthVisibility,
  computeSolarPowerWatts,
  formatUtcDisplay,
} from '../utils/scienceMath'
import { analyzeSite } from '../api/client'
import PanelCornerBrackets from './PanelCornerBrackets'

interface ScenarioPanelProps {
  type: 'A' | 'B'
  sites: SelectableSite[]
}

export default function ScenarioPanel({ type, sites }: ScenarioPanelProps) {
  const [customLat, setCustomLat] = useState('')
  const [customLon, setCustomLon] = useState('')
  const [apiResult, setApiResult] = useState<Record<string, unknown> | null>(null)
  const [apiError, setApiError] = useState('')
  const [apiLoading, setApiLoading] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const {
    scenarioAId,
    scenarioBId,
    utcA,
    utcB,
    syncBToA,
    setScenarioA,
    setScenarioB,
    setUtcA,
    setUtcB,
    setSyncBToA,
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
    loading,
    error,
    injectCustomSite,
    pickedCoords,
  } = useScenarioStore()

  // Auto-expand the custom coordinate form only when the user actually picked
  // a custom point on the map/globe, so it doesn't sit open by default.
  useEffect(() => {
    if (pickedCoords) {
      setCustomLat(pickedCoords.lat)
      setCustomLon(pickedCoords.lon)
      setShowCustomForm(true)
    }
  }, [pickedCoords])

  const siteId = type === 'A' ? scenarioAId : scenarioBId
  const utc = type === 'A' ? utcA : utcB
  const setSite = type === 'A' ? setScenarioA : setScenarioB
  const setUtc = type === 'A' ? setUtcA : setUtcB
  const isScenarioA = type === 'A'
  const utcLocked = !isScenarioA && syncBToA

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

  const handleCustomAnalyze = async () => {
    const lat = Number(customLat)
    const lon = Number(customLon)

    if (
      customLat.trim() === '' ||
      customLon.trim() === '' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      setApiError('Enter valid coordinates. Latitude: -90 to 90; longitude: -180 to 180.')
      return
    }

    setApiLoading(true)
    setApiError('')
    setApiResult(null)

    try {
      const start = new Date(utc)
      const stop = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)

      const result = await analyzeSite({
        site_name: 'Custom Lunar Site',
        lat,
        lon,
        start_utc: start.toISOString(),
        stop_utc: stop.toISOString(),
        step_seconds: 3600,
        horizon_mode: horizonMode,
        mast_height_m: mastHeightM,
        solar_array_type: solarArrayType,
        array_area_m2: arrayAreaM2,
        array_efficiency: arrayEfficiency,
        antenna_margin_deg: dteMarginDeg,
        earth_criterion: earthCriterion,
      })

      // Synthesize GeometryTimeseries from the API result
      const tsr = result.timeseries as any
      const hor = result.horizon as any
      const customId = type === 'A' ? 'custom-a' : 'custom-b'

      if (tsr && tsr.sun_elevation_deg) {
        // Build times array if not present
        if (!tsr.times && tsr.start_utc && tsr.step_seconds) {
          const n = tsr.sun_elevation_deg.length
          const stepMs = tsr.step_seconds * 1000
          const startMs = new Date(tsr.start_utc).getTime()
          tsr.times = Array.from({ length: n }, (_: unknown, i: number) =>
            new Date(startMs + i * stepMs).toISOString().replace('.000Z', 'Z')
          )
        }

        const injectedHorizon: HorizonProfile | undefined = hor
          ? {
              site_id: customId,
              site_name: 'Custom Lunar Site',
              kind: 'custom',
              lat,
              lon,
              coord_status: 'ok',
              site_height_m: 0,
              resolution_m: 20,
              default_range_km: 50,
              masks: hor.masks,
              dem_id: hor.dem_id || 'LOLA DEM',
              coverage_status: hor.coverage_status || 'ok',
            }
          : undefined

        injectCustomSite(customId, tsr, injectedHorizon)
        setSite(customId)
        setApiResult({ __banner: `Custom site loaded — scenario switched to ${customId}.` })
      } else {
        setApiResult(result)
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Analysis request failed.')
    } finally {
      setApiLoading(false)
    }
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
        ? computeSolarFraction(sunAz, sunEl - thresholdDeg, mask)
        : sunEl + SUN_UPPER_LIMB_DEG >= thresholdDeg
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

  // 30-Day Opportunity Window computation for plain-language summary
  const opp = useMemo(() => {
    return compute30DayWindows(ts, utc, {
      sunThresholdDeg: thresholdDeg,
      horizonMode,
      mastHeightM,
      dteMarginDeg,
      earthCriterion,
      solarArrayType,
      arrayAreaM2,
      arrayEfficiency,
      horizonProfile: horizon,
    })
  }, [
    ts,
    utc,
    thresholdDeg,
    horizonMode,
    mastHeightM,
    dteMarginDeg,
    earthCriterion,
    solarArrayType,
    arrayAreaM2,
    arrayEfficiency,
    horizon,
  ])

  const sunlightPct = opp?.sun.percentage ?? 0
  const sunlightHours = opp ? Math.round(opp.sun.total_hours) : 0
  const totalPeriodHours = opp ? Math.round(opp.total_period_hours) : 720
  const accentBorder = isScenarioA ? 'border-[#E0A04A]' : 'border-[#6FA8C9]'
  const badgeBg = isScenarioA ? 'bg-[#E0A04A] text-[#050608]' : 'bg-[#6FA8C9] text-[#050608]'

  return (
    <div className={`relative p-4 bg-[#0D1014] border ${accentBorder} rounded flex flex-col gap-4`}>
      <PanelCornerBrackets />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider font-mono ${badgeBg}`}>
            Scenario {type}
          </span>
          <span className="text-xs text-[#8A8A88] font-medium">
            {isScenarioA ? 'Primary Site Evaluation' : 'Secondary Comparison Site'}
          </span>
        </div>
        {(selectedSite?.lat != null || (siteId.startsWith('custom-') && (ts?.lat != null || customLat))) && (
          <div className="flex items-center gap-2 font-mono">
            {horizon?.dem_id && (
              <span className="text-3xs px-1.5 py-0.5 rounded bg-[#050608] border border-[#2A2D31] text-[#6FA8C9]">
                {horizon.dem_id}
              </span>
            )}
            <span className="text-3xs text-[#8A8A88]">
              {selectedSite?.lat ?? ts?.lat ?? customLat}° Lat · {selectedSite?.lon ?? ts?.lon ?? customLon}° Lon
            </span>
          </div>
        )}
      </div>

      {/* Region Centre Caveat */}
      {(selectedSite?.coord_kind === 'region_centre' || selectedSite?.coord_kind === 'planned_region_center') && (
        <div className="px-3 py-2 rounded bg-[#2A1210] border border-[#7F2318] text-3xs text-[#E0A04A] flex items-center gap-2 font-mono">
          <span className="font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/40 shrink-0">
            Region Centre
          </span>
          <span>Region centre; results can differ strongly from the crest or evaluated site.</span>
        </div>
      )}

      {/* Site Selector & UTC Time Control */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Site dropdown */}
        <div>
          <label className="block text-3xs uppercase tracking-wider text-[#8A8A88] font-medium mb-1 font-mono">
            Site / Mission
          </label>
          <select
            value={siteId}
            onChange={(e) => setSite(e.target.value)}
            className="w-full px-3 py-1.5 bg-[#050608] border border-[#2A2D31] rounded text-xs text-[#E4E4E2] focus:outline-none focus:border-[#B9A58C] transition-colors font-mono"
          >
            {siteId.startsWith('custom-') && (
              <optgroup label="Custom Coordinates Evaluated">
                <option value={siteId}>
                  Custom Site ({ts?.lat ?? customLat}°, {ts?.lon ?? customLon}°)
                </option>
              </optgroup>
            )}
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
          <button
            type="button"
            onClick={() => setShowCustomForm((v) => !v)}
            className="mt-1.5 text-3xs font-mono text-[#6DBF8B] hover:text-[#8BDBA5] underline decoration-dotted"
          >
            {showCustomForm ? '− Hide custom coordinates' : '+ Custom Coordinates'}
          </button>
        </div>

        {/* UTC Time input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-3xs uppercase tracking-wider text-[#8A8A88] font-medium font-mono">
              Date &amp; Time (UTC)
            </label>
            <span className="text-3xs font-mono text-[#6FA8C9] font-medium">
              {formatUtcDisplay(utc)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="datetime-local"
              value={dtLocalValue}
              onChange={handleDateChange}
              disabled={utcLocked}
              className="flex-1 min-w-0 px-2.5 py-1.5 bg-[#050608] border border-[#2A2D31] rounded text-xs text-[#E4E4E2] font-mono focus:outline-none focus:border-[#B9A58C] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex gap-1 text-3xs font-mono shrink-0">
              <button
                onClick={() => stepHours(-24)}
                disabled={utcLocked}
                className="px-1.5 py-1 bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="Back 1 day"
              >
                -1d
              </button>
              <button
                onClick={() => stepHours(-1)}
                disabled={utcLocked}
                className="px-1.5 py-1 bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="Back 1 hour"
              >
                -1h
              </button>
              <button
                onClick={() => stepHours(1)}
                disabled={utcLocked}
                className="px-1.5 py-1 bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="Forward 1 hour"
              >
                +1h
              </button>
              <button
                onClick={() => stepHours(24)}
                disabled={utcLocked}
                className="px-1.5 py-1 bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="Forward 1 day"
              >
                +1d
              </button>
            </div>
          </div>
          {!isScenarioA && (
            <label className="mt-1.5 flex items-center gap-1.5 text-3xs font-mono text-[#8A8A88] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncBToA}
                onChange={(e) => setSyncBToA(e.target.checked)}
                className="accent-[#6FA8C9]"
              />
              Sync time with Scenario A
            </label>
          )}
        </div>
      </div>

      {/* Custom Coordinate Analysis - collapsed by default, expands on toggle or map pick */}
      {showCustomForm && (
        <div className="p-3 rounded bg-[#050608] border border-[#2A2D31] space-y-3 animate-fade-in">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#6DBF8B] uppercase tracking-wider">
                Custom Lunar Site Analysis
              </h3>
              <p className="text-3xs text-[#8A8A88] mt-1">
                Analyse a custom location using latitude and longitude.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomForm(false)}
              className="text-3xs font-mono text-[#8A8A88] hover:text-[#E4E4E2]"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-3xs text-[#8A8A88] mb-1">
                Latitude (°)
              </label>
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                placeholder="e.g. -89.5"
                className="w-full px-3 py-2 bg-[#0D1014] border border-[#2A2D31] rounded text-xs text-[#E4E4E2]"
              />
            </div>

            <div>
              <label className="block text-3xs text-[#8A8A88] mb-1">
                Longitude (°)
              </label>
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                value={customLon}
                onChange={(e) => setCustomLon(e.target.value)}
                placeholder="e.g. 45.2"
                className="w-full px-3 py-2 bg-[#0D1014] border border-[#2A2D31] rounded text-xs text-[#E4E4E2]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleCustomAnalyze}
            disabled={apiLoading}
            className="px-4 py-2 rounded bg-[#6DBF8B] text-[#050608] text-xs font-semibold disabled:opacity-50"
          >
            {apiLoading ? 'Analysing...' : 'Analyse Custom Site'}
          </button>

          {apiError && (
            <p className="text-xs text-[#E5604A]">{apiError}</p>
          )}

          {apiResult && (
            <div className="p-3 rounded bg-[#132A1C] border border-[#2A5C3D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[#6DBF8B] font-bold text-xs">✓</span>
                <p className="text-xs text-[#6DBF8B] font-medium font-mono">
                  {typeof apiResult.__banner === 'string'
                    ? apiResult.__banner
                    : `Custom site (${customLat}°, ${customLon}°) analyzed and loaded into Scenario ${type}.`}
                </p>
              </div>
              <span className="text-3xs text-[#8A8A88] font-mono">Horizon &amp; Ephemeris Active</span>
            </div>
          )}
        </div>
      )}

      {/* Geometry Status & Readouts */}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-[#8A8A88] animate-pulse font-mono">
          Loading precomputed ephemeris data...
        </div>
      ) : hasError ? (
        <div className="p-3 bg-[#2A1210] border border-[#7F2318] rounded text-xs text-[#E5604A] font-mono">
          {hasError}
        </div>
      ) : elevationData.isOutRange ? (
        <div className="p-3 bg-[#2A1210] border border-[#7F2318] rounded text-xs text-[#E0A04A] font-mono">
          Selected time is outside precomputed coverage (2024–2028). Please choose a date within coverage.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Sun Elevation Card */}
          <div className="p-3 rounded bg-[#050608] border border-[#2A2D31] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#E0A04A] font-semibold flex items-center gap-1 font-mono">
                <span className="w-2 h-2 rounded-full bg-[#E0A04A]"></span>
                Sun (Solar Power)
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-3xs font-medium font-mono ${
                  fSun >= 0.99
                    ? 'bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/40'
                    : fSun > 0.0
                    ? 'bg-[#E0A04A]/10 text-[#E0A04A] border border-[#E0A04A]/30'
                    : 'bg-[#171B22] text-[#8A8A88] border border-[#2A2D31]'
                }`}
              >
                {fSun >= 0.99 ? 'Fully Lit' : fSun > 0 ? `Partial (${Math.round(fSun * 100)}%)` : 'In Shadow'}
              </span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-[#E0A04A]">
                {elevationData.sunElevation !== null
                  ? `${elevationData.sunElevation >= 0 ? '+' : ''}${elevationData.sunElevation.toFixed(2)}°`
                  : 'N/A'}
              </div>
              <div className="text-3xs text-[#8A8A88] mt-0.5 flex items-center justify-between font-mono">
                <span>Terrain Horizon: {sunHorizonEl.toFixed(2)}°</span>
                <span className="text-[#E0A04A] font-bold">{solarPowerW.toFixed(1)} W</span>
              </div>
            </div>
            <div className="text-3xs font-mono text-[#8A8A88] flex items-center justify-between">
              <span>Azimuth: {elevationData.sunAzimuth !== null ? `${elevationData.sunAzimuth.toFixed(1)}°` : 'N/A'}</span>
              <span>Limb: {elevationData.sunElevation !== null ? `${(elevationData.sunElevation + SUN_UPPER_LIMB_DEG).toFixed(2)}°` : 'N/A'}</span>
            </div>
          </div>

          {/* Earth Elevation Card */}
          <div className="p-3 rounded bg-[#050608] border border-[#2A2D31] flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-3xs uppercase tracking-wider text-[#6FA8C9] font-semibold flex items-center gap-1 font-mono min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#6FA8C9] shrink-0"></span>
                <abbr title="Direct-to-Earth contact: Geometric line-of-sight between the lunar surface site and Earth centre" className="cursor-help underline decoration-dotted decoration-[#6FA8C9]/60 whitespace-nowrap">
                  EARTH · DIRECT-TO-EARTH CONTACT
                </abbr>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-3xs font-medium font-mono shrink-0 ${
                  isEarthUp
                    ? 'bg-[#6FA8C9]/20 text-[#6FA8C9] border border-[#6FA8C9]/40'
                    : 'bg-[#171B22] text-[#8A8A88] border border-[#2A2D31]'
                }`}
              >
                {isEarthUp ? 'Direct LOS' : 'Blocked / Below Horizon'}
              </span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-[#6FA8C9]">
                {elevationData.earthElevation !== null
                  ? `${elevationData.earthElevation >= 0 ? '+' : ''}${elevationData.earthElevation.toFixed(2)}°`
                  : 'N/A'}
              </div>
              <div className="text-3xs text-[#8A8A88] mt-0.5 flex items-center justify-between font-mono">
                <span>Terrain Horizon: {earthHorizonEl.toFixed(2)}°</span>
                <span>Margin: +{dteMarginDeg.toFixed(1)}°</span>
              </div>
            </div>
            <div className="text-3xs font-mono text-[#8A8A88] flex items-center justify-between">
              <span>Azimuth: {elevationData.earthAzimuth !== null ? `${elevationData.earthAzimuth.toFixed(1)}°` : 'N/A'}</span>
              <span className="capitalize">{earthCriterion.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Plain-Language 30-Day Operational Summary */}
          <div className="col-span-2 p-3 bg-[#050608] border border-[#2A2D31] rounded text-xs text-[#E4E4E2]">
            <div className="text-3xs uppercase font-mono tracking-wider text-[#8A8A88] mb-1">
              30-Day Operational Lighting Summary
            </div>
            <div className="font-medium text-[#E4E4E2]">
              Sunlight for <span className="font-bold text-[#E0A04A]">{sunlightPct.toFixed(1)}%</span> of the next 30 days ({sunlightHours} of {totalPeriodHours} h){horizonMode === 'terrain' ? ` at mast ${mastHeightM} m.` : ' on flat sphere (0° horizon).'}
            </div>
          </div>
        </div>
      )}

      {/* Visual Horizon Diagram */}
      <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] text-2xs">
        <div className="flex justify-between text-3xs text-[#8A8A88] mb-1 font-mono">
          <span>Nadir (-90°)</span>
          <span className="text-[#E4E4E2] font-semibold">
            {horizonMode === 'terrain' ? (
              <span>
                <abbr
                  title="Terrain horizon seen from the site: 3D ray-marched topographic obstacle elevation across 360° azimuth"
                  className="cursor-help underline decoration-dotted decoration-[#8A8A88]/60"
                >
                  Local skyline (terrain horizon seen from the site)
                </abbr>{' '}
                ({sunHorizonEl.toFixed(1)}° Sun / {earthHorizonEl.toFixed(1)}° Earth)
              </span>
            ) : (
              'Flat sphere, 0 deg horizon'
            )}
          </span>
          <span>Zenith (+90°)</span>
        </div>
        <div className="relative w-full h-5 bg-[#0D1014] rounded overflow-hidden border border-[#2A2D31]">
          {/* Horizon line at center */}
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-[#2A2D31] z-10" />

          {/* Local terrain horizon region for Sun */}
          {horizonMode === 'terrain' && (
            <div
              style={{
                left: `${Math.max(0, Math.min(100, ((sunHorizonEl + 90) / 180) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-1 -translate-x-1/2 bg-[#C88B35] z-10"
              title={`Sun Azimuth Skyline: ${sunHorizonEl.toFixed(2)}°`}
            />
          )}

          {/* Sun marker */}
          {elevationData.sunElevation !== null && (
            <div
              style={{
                left: `${Math.max(0, Math.min(100, ((elevationData.sunElevation + 90) / 180) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-[#E0A04A] rounded-full z-20 flex items-center justify-center text-[8px]"
              title={`Sun: ${elevationData.sunElevation.toFixed(2)}° (Horizon: ${sunHorizonEl.toFixed(2)}°)`}
            />
          )}

          {/* Earth marker */}
          {elevationData.earthElevation !== null && (
            <div
              style={{
                left: `${Math.max(0, Math.min(100, ((elevationData.earthElevation + 90) / 180) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-[#6FA8C9] rounded-full z-20 flex items-center justify-center text-[8px]"
              title={`Earth: ${elevationData.earthElevation.toFixed(2)}° (Horizon: ${earthHorizonEl.toFixed(2)}°)`}
            />
          )}
        </div>
        {/* Explicit axis labels for the elevation gauge */}
        <div className="mt-1 flex justify-between text-[9px] font-mono text-[#6B6F75]">
          <span>-90° Nadir</span>
          <span>0° Flat Horizon</span>
          <span>Local Skyline</span>
          <span>+90° Zenith</span>
        </div>
        <div className="mt-1.5 text-3xs text-[#8A8A88] flex items-center justify-between font-mono">
          <span>* Mode: {horizonMode === 'terrain' ? `LOLA DEM (${horizon?.dem_id || 'DEM'}, mast: ${mastHeightM}m)` : 'Flat sphere, 0 deg horizon'}</span>
          <span className="text-[#E4E4E2]">Array: {solarArrayType}</span>
        </div>
      </div>
    </div>
  )
}
