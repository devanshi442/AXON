import { useMemo, useState, useEffect, useRef } from 'react'
import type { SelectableSite, HorizonProfile } from '../types/mission'
import {
  AU_KM,
  SOLAR_IRRADIANCE_W_M2,
} from '../constants/scienceConventions'
import {
  useScenarioStore,
  getElevationAtTime,
  getMaskForMastHeight,
  compute30DayWindows,
} from '../stores/scenarioStore'
import {
  lookupHorizonElevation,
  computeSolarFraction,
  computeEarthVisibility,
  computeSolarPowerWatts,
  formatUtcDisplay,
} from '../utils/scienceMath'
import { analyzeSite } from '../api/client'

interface ScenarioPanelProps {
  type: 'A' | 'B'
  sites: SelectableSite[]
  customPointRequest?: { requestId: number; target: 'A' | 'B'; lat: number; lon: number } | null
  onCustomPointRequestHandled?: (requestId: number) => void
  onCustomAnalysisComplete?: (type: 'A' | 'B') => void
}

export default function ScenarioPanel({
  type,
  sites,
  customPointRequest = null,
  onCustomPointRequestHandled,
  onCustomAnalysisComplete,
}: ScenarioPanelProps) {
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
    setScenarioA,
    setScenarioB,
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
    loading,
    error,
    injectCustomSite,
  } = useScenarioStore()

  const siteId = type === 'A' ? scenarioAId : scenarioBId
  const utc = type === 'A' ? utcA : utcB
  const setSite = type === 'A' ? setScenarioA : setScenarioB
  const isScenarioA = type === 'A'

  const selectedSite = sites.find((s) => s.id === siteId)
  const ts = timeseriesCache[siteId]
  const horizon = horizonCache[siteId]
  const isLoading = loading[siteId]
  const hasError = error[siteId]

  const elevationData = getElevationAtTime(ts, utc)

  // Group south polar sites for the dropdown selector
  const southPolarSites = useMemo(
    () => sites.filter((s) => s.lat !== null && s.lat <= -70),
    [sites]
  )

  const handleCustomAnalyze = async (coordinates?: { lat: number; lon: number }) => {
    const latText = coordinates ? String(coordinates.lat) : customLat
    const lonText = coordinates ? String(coordinates.lon) : customLon
    const lat = Number(latText)
    const lon = Number(lonText)

    if (
      latText.trim() === '' ||
      lonText.trim() === '' ||
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

    setCustomLat(latText)
    setCustomLon(lonText)
    setApiLoading(true)
    setApiError('')
    setApiResult(null)

    try {
      const start = new Date(utc)
      const stop = new Date(start.getTime() + Math.max(windowDays, 30) * 24 * 60 * 60 * 1000)

      const result = await analyzeSite({
        site_name: `Custom Site (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
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

      const tsr = result.timeseries as any
      const hor = result.horizon as any
      const customId = type === 'A' ? 'custom-a' : 'custom-b'

      // The API response carries the analysed coordinates at the top level;
      // its nested timeseries payload does not reliably repeat them. Store
      // them with the cached series so ExplorerPage can place the active A/B
      // marker from the same source of truth used by the scenario selector.
      if (tsr && typeof tsr === 'object') {
        tsr.site_id = customId
        tsr.site_name =
          typeof result.site_name === 'string'
            ? result.site_name
            : `Custom Site (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`
        tsr.lat = lat
        tsr.lon = lon
      }

      if (tsr && tsr.sun_elevation_deg) {
        if (!tsr.times && tsr.start_utc && tsr.step_seconds) {
          const n = tsr.sun_elevation_deg.length
          const stepMs = tsr.step_seconds * 1000
          const startMs = new Date(tsr.start_utc).getTime()
          tsr.times = Array.from({ length: n }, (_: unknown, i: number) =>
            new Date(startMs + i * stepMs).toISOString().replace('.000Z', 'Z')
          )
        }

        const availableMasks = Array.isArray(hor?.mask_deg)
          ? ({ ['h_' + mastHeightM.toFixed(1) + 'm']: hor.mask_deg } as HorizonProfile['masks'])
          : undefined
        const injectedHorizon: HorizonProfile | undefined = hor
          ? {
              site_id: customId,
              site_name: 'Custom Site (' + lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°)',
              kind: 'custom',
              lat,
              lon,
              coord_status: 'ok',
              site_height_m: hor.site_height_m ?? 0,
              resolution_m: hor.resolution_m ?? 20,
              default_range_km: hor.max_range_km ?? 50,
              masks: availableMasks ?? ({} as HorizonProfile['masks']),
              dem_id: hor.dem_id || result.dem_id || 'LOLA DEM',
              coverage_status: hor.coverage_status || result.coverage_status || 'ok',
              generated_at: hor.generated,
            }
          : undefined

        injectCustomSite(customId, tsr, injectedHorizon)
        setSite(customId)
        setApiResult({
          __banner: `Custom site (${lat.toFixed(2)}°, ${lon.toFixed(2)}°) loaded into Scenario ${type}.`,
        })
        onCustomAnalysisComplete?.(type)
      } else {
        setApiError('The analysis endpoint returned summary metrics but no hourly timeseries. Restart the API after updating the backend, then retry.')
      }
    } catch (err) {
      // Offline / No-Backend Fallback: clone nearest known South Polar site's timeseries
      // so the user can still immediately see the 30-day timeline & comparison without a server crash.
      const nearestSite = [...southPolarSites].sort((a, b) => {
        const dA = Math.hypot((a.lat ?? -90) - lat, (a.lon ?? 0) - lon)
        const dB = Math.hypot((b.lat ?? -90) - lat, (b.lon ?? 0) - lon)
        return dA - dB
      })[0]

      const fallbackTs = nearestSite ? timeseriesCache[nearestSite.id] : undefined
      const fallbackHor = nearestSite ? horizonCache[nearestSite.id] : undefined

      if (fallbackTs) {
        const customId = type === 'A' ? 'custom-a' : 'custom-b'
        const clonedTs = {
          ...fallbackTs,
          site_id: customId,
          site_name: `Custom (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
          lat,
          lon,
        }
        injectCustomSite(customId, clonedTs, fallbackHor)
        setSite(customId)
        setApiResult({
          __banner: `Custom point (${lat.toFixed(2)}°, ${lon.toFixed(2)}°) loaded using nearest precomputed DEM proxy (${nearestSite.name}).`,
        })
        onCustomAnalysisComplete?.(type)
      } else {
        setApiError(err instanceof Error ? err.message : 'Analysis request failed.')
      }
    } finally {
      setApiLoading(false)
    }
  }

  const handledCustomRequestRef = useRef<number | null>(null)
  useEffect(() => {
    if (!customPointRequest || customPointRequest.target !== type) return
    if (handledCustomRequestRef.current === customPointRequest.requestId) return

    handledCustomRequestRef.current = customPointRequest.requestId
    setCustomLat(String(customPointRequest.lat))
    setCustomLon(String(customPointRequest.lon))
    setShowCustomForm(true)
    onCustomPointRequestHandled?.(customPointRequest.requestId)
    void handleCustomAnalyze({ lat: customPointRequest.lat, lon: customPointRequest.lon })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customPointRequest?.requestId, customPointRequest?.target, type])

  // Terrain mask for selected mast height
  const mask = horizonMode === 'terrain' ? getMaskForMastHeight(horizon, mastHeightM) : null

  const sunAz = elevationData.sunAzimuth ?? 0.0
  const earthAz = elevationData.earthAzimuth ?? 0.0
  const sunEl = elevationData.sunElevation ?? -999.0
  const earthEl = elevationData.earthElevation ?? -999.0

  const sunHorizonEl = mask && elevationData.sunAzimuth !== null ? lookupHorizonElevation(mask, sunAz) : 0.0
  const earthHorizonEl = mask && elevationData.earthAzimuth !== null ? lookupHorizonElevation(mask, earthAz) : 0.0

  const fSun =
    elevationData.sunElevation !== null
      ? horizonMode === 'terrain' && mask
        ? computeSolarFraction(sunAz, sunEl, mask, thresholdDeg)
        : computeSolarFraction(sunAz, sunEl, null, thresholdDeg)
      : 0.0

  const instantaneousFlux = elevationData.sunDistance
    ? SOLAR_IRRADIANCE_W_M2 * Math.pow(AU_KM / elevationData.sunDistance, 2)
    : SOLAR_IRRADIANCE_W_M2

  const solarPowerW =
    elevationData.sunElevation !== null
      ? computeSolarPowerWatts(
          sunEl,
          sunAz,
          fSun,
          solarArrayType,
          arrayAreaM2,
          arrayEfficiency,
          instantaneousFlux
        )
      : 0.0

  const isEarthUp =
    elevationData.earthElevation !== null
      ? horizonMode === 'terrain' && mask
        ? computeEarthVisibility(earthAz, earthEl, mask, dteMarginDeg, earthCriterion)
        : computeEarthVisibility(earthAz, earthEl, null, dteMarginDeg, earthCriterion)
      : false

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
      windowDays,
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
    windowDays,
    horizon,
  ])

  const sunlightPct = opp?.sun.percentage ?? 0
  const sunlightHours = opp ? Math.round(opp.sun.total_hours) : 0
  const totalPeriodHours = opp ? Math.round(opp.total_period_hours) : Math.round(windowDays * 24)
  const accentBorder = isScenarioA ? 'border-[#F5A623]/60' : 'border-[#38BDF8]/60'
  const badgeBg = isScenarioA ? 'bg-[#F5A623] text-[#080A0E]' : 'bg-[#38BDF8] text-[#080A0E]'

  return (
    <div className={`relative p-4 bg-[#0C1017] border ${accentBorder} rounded flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider font-mono ${badgeBg}`}>
            Scenario {type}
          </span>
          <span className="text-xs text-[#94A3B8] font-medium">
            {isScenarioA ? 'Baseline Reference Site' : 'Target / Comparison Site'}
          </span>
        </div>
        {(selectedSite?.lat != null || (siteId.startsWith('custom-') && (ts?.lat != null || customLat))) && (
          <div className="flex items-center gap-2 font-mono">
            {horizon?.dem_id && (
              <span className="text-3xs px-1.5 py-0.5 rounded bg-[#080A0E] border border-[#1E2633] text-[#38BDF8]">
                {horizon.dem_id}
              </span>
            )}
            <span className="text-3xs text-[#94A3B8]">
              {selectedSite?.lat ?? ts?.lat ?? customLat}° Lat · {selectedSite?.lon ?? ts?.lon ?? customLon}° Lon
            </span>
          </div>
        )}
      </div>

      {/* Site Selector Dropdown + Custom Coords Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-[#080A0E] border border-[#1E2633] rounded">
        <div className="flex-1 min-w-0">
          <label className="block text-3xs uppercase tracking-wider text-[#94A3B8] font-mono mb-1">
            Select Preset Site or Use Custom Coordinates
          </label>
          <select
            value={siteId}
            onChange={(e) => {
              const val = e.target.value
              if (val === '__custom__') {
                setShowCustomForm(true)
              } else {
                setSite(val)
              }
            }}
            className="w-full px-2.5 py-1.5 bg-[#0C1017] border border-[#1E2633] rounded text-xs text-[#F1F5F9] font-semibold focus:outline-none focus:border-[#38BDF8]"
          >
            {siteId.startsWith('custom-') && (
              <option value={siteId}>
                 Custom Point ({ts?.lat ?? customLat}°, {ts?.lon ?? customLon}°)
              </option>
            )}
            <optgroup label="Artemis III Candidate Sites (South Pole)">
              {southPolarSites
                .filter((s) => s.kind === 'candidate')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.lat}°, {s.lon}°)
                  </option>
                ))}
            </optgroup>
            <optgroup label="CLPS Missions & Reference Anchors">
              {southPolarSites
                .filter((s) => s.kind !== 'candidate')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.lat}°, {s.lon}°)
                  </option>
                ))}
            </optgroup>
            <option value="__custom__">+ Enter Arbitrary Lat/Lon Coordinates...</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowCustomForm((v) => !v)}
          className="self-start sm:self-end shrink-0 px-3 py-1.5 rounded text-3xs font-mono font-semibold text-[#30C48D] bg-[#30C48D]/15 border border-[#30C48D]/40 hover:bg-[#30C48D]/25 transition-colors"
        >
          {showCustomForm ? '− Hide Custom Coords' : 'Custom Lat/Lon'}
        </button>
      </div>

      {/* Custom Coordinate Analysis Form */}
      {showCustomForm && (
        <div className="p-3 rounded bg-[#111113] border border-[#30C48D]/40 space-y-3 animate-fade-in">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#30C48D] uppercase tracking-wider">
                Arbitrary Coordinate Targeting (Scenario {type})
              </h3>
              <p className="text-3xs text-[#AFB3BA] mt-0.5">
                Enter any South Polar coordinate (or click directly on the map above) and press <strong>Run Analysis</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomForm(false)}
              className="text-3xs font-mono text-[#AFB3BA] hover:text-[#EDEEF0]"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div>
              <label className="block text-3xs text-[#AFB3BA] font-mono mb-1">
                Latitude (-90° to -70°)
              </label>
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                placeholder="e.g. -88.5"
                className="w-full px-2.5 py-1.5 bg-[#18191B] border border-[#363A3F] rounded text-xs text-[#EDEEF0] font-mono"
              />
            </div>

            <div>
              <label className="block text-3xs text-[#AFB3BA] font-mono mb-1">
                Longitude (-180° to +180°)
              </label>
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                value={customLon}
                onChange={(e) => setCustomLon(e.target.value)}
                placeholder="e.g. 124.2"
                className="w-full px-2.5 py-1.5 bg-[#18191B] border border-[#363A3F] rounded text-xs text-[#EDEEF0] font-mono"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleCustomAnalyze()}
              disabled={apiLoading}
              className="w-full px-4 py-1.5 rounded bg-[#30C48D] hover:bg-[#5aa877] text-[#111113] text-xs font-bold font-mono uppercase tracking-wider disabled:opacity-50 transition-colors cursor-pointer"
            >
              {apiLoading ? 'Computing...' : `Run Scenario ${type}`}
            </button>
          </div>

          {apiError && <p className="text-xs text-[#EF6464] font-mono">{apiError}</p>}

          {apiResult && (
            <div className="p-2 rounded bg-[#132A1C] border border-[#2A5C3D] flex items-center justify-between">
              <span className="text-3xs text-[#30C48D] font-mono">
                 {typeof apiResult.__banner === 'string' ? apiResult.__banner : `Custom site loaded into Scenario ${type}.`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Region Centre Caveat */}
      {(selectedSite?.coord_kind === 'region_centre' || selectedSite?.coord_kind === 'planned_region_center') && (
        <div className="px-3 py-1.5 rounded bg-[#2A1210] border border-[#7F2318] text-3xs text-[#E9AD51] flex items-center gap-2 font-mono">
          <span className="font-bold uppercase px-1.5 py-0.5 rounded bg-[#E9AD51]/20 border border-[#E9AD51]/40 shrink-0">
            Region Centre
          </span>
          <span>Broad region centroid; illumination differs from local topographic peaks.</span>
        </div>
      )}

      {/* Geometry Status & Readouts */}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-[#AFB3BA] animate-pulse font-mono">
          Loading precomputed ephemeris data...
        </div>
      ) : hasError ? (
        <div className="p-3 bg-[#2A1210] border border-[#7F2318] rounded text-xs text-[#EF6464] font-mono">
          {hasError}
        </div>
      ) : elevationData.isOutRange ? (
        <div className="p-3 bg-[#2A1210] border border-[#7F2318] rounded text-xs text-[#E9AD51] font-mono">
          Selected time ({formatUtcDisplay(utc)}) is outside precomputed coverage (2024–2028).
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Sun Elevation Card */}
          <div className="p-3 rounded bg-[#080A0E] border border-[#1E2633] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-3xs uppercase tracking-wider text-[#F5A623] font-semibold flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623]"></span>
                Sun Power
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-3xs font-medium font-mono ${
                  fSun >= 0.99
                    ? 'bg-[#F5A623]/20 text-[#F5A623] border border-[#F5A623]/40'
                    : fSun > 0.0
                    ? 'bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30'
                    : 'bg-[#18202C] text-[#64748B] border border-[#1E2633]'
                }`}
              >
                {fSun >= 0.99 ? 'Fully Lit' : fSun > 0 ? `Partial (${Math.round(fSun * 100)}%)` : 'In Shadow'}
              </span>
            </div>
            <div className="my-1.5">
              <div className="text-xl font-bold font-mono text-[#F5A623]">
                {elevationData.sunElevation !== null
                  ? `${elevationData.sunElevation >= 0 ? '+' : ''}${elevationData.sunElevation.toFixed(2)}°`
                  : 'N/A'}
              </div>
              <div className="text-3xs text-[#94A3B8] mt-0.5 flex items-center justify-between font-mono">
                <span>Skyline: {sunHorizonEl.toFixed(1)}°</span>
                <span className="text-[#F5A623] font-bold">{solarPowerW.toFixed(1)} W</span>
              </div>
            </div>
          </div>

          {/* Earth Elevation Card */}
          <div className="p-3 rounded bg-[#080A0E] border border-[#1E2633] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-3xs uppercase tracking-wider text-[#38BDF8] font-semibold flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"></span>
                Earth DTE
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-3xs font-medium font-mono shrink-0 ${
                  isEarthUp
                    ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                    : 'bg-[#18202C] text-[#64748B] border border-[#1E2633]'
                }`}
              >
                {isEarthUp ? 'Direct LOS' : 'Occulted'}
              </span>
            </div>
            <div className="my-1.5">
              <div className="text-xl font-bold font-mono text-[#38BDF8]">
                {elevationData.earthElevation !== null
                  ? `${elevationData.earthElevation >= 0 ? '+' : ''}${elevationData.earthElevation.toFixed(2)}°`
                  : 'N/A'}
              </div>
              <div className="text-3xs text-[#94A3B8] mt-0.5 flex items-center justify-between font-mono">
                <span>Skyline: {earthHorizonEl.toFixed(1)}°</span>
                <span>Margin: +{dteMarginDeg.toFixed(1)}°</span>
              </div>
            </div>
          </div>

          {/* Operational Lighting Summary */}
          <div className="col-span-2 px-3 py-2 bg-[#080A0E] border border-[#1E2633] rounded text-xs text-[#F1F5F9] flex items-center justify-between">
            <div>
              <span className="text-3xs uppercase font-mono tracking-wider text-[#94A3B8] mr-2">
                {windowDays === 0.5 ? '12h' : windowDays === 1 ? '24h' : `${windowDays}d`} Forecast:
              </span>
              <span className="font-medium">
                Sunlight for <strong className="text-[#F5A623]">{sunlightPct.toFixed(1)}%</strong> ({sunlightHours} of {totalPeriodHours} h) at mast {mastHeightM} m
              </span>
            </div>
            <span className="text-3xs font-mono text-[#2DD4BF]">
              {opp?.solar_energy_kwh ?? 0} kWh/m²
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
