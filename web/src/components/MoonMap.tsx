import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import {
  DEFAULT_LUNAR_VIEW,
  clampLunarZoom,
  type LunarViewState,
} from '../types/lunarView'

interface MoonMapProps {
  viewState: LunarViewState
  selectedPoint: { lat: number; lon: number } | null
  scenarioPoints?: {
    a: { lat: number; lon: number } | null
    b: { lat: number; lon: number } | null
  }
  onViewChange: (view: LunarViewState) => void
  onPickCoords?: (lat: number, lon: number) => void
}

const MOON_RADIUS_KM = 1737.4
const POLAR_IMAGE_HALF_EXTENT_M = 457_440
const POLAR_70S_RADIUS_M = 2 * MOON_RADIUS_KM * 1000 * Math.tan((20 * Math.PI) / 360)

type ProjectedPoint = { x: number; y: number }
type MapMetrics = {
  width: number
  height: number
  centerX: number
  centerY: number
  pixelsPerMeter: number
  poleX: number
  poleY: number
}

function latLonToPolar(lat: number, lon: number): ProjectedPoint {
  const rho = 2 * MOON_RADIUS_KM * 1000 * Math.tan(((90 + lat) * Math.PI) / 360)
  const lonRad = (lon * Math.PI) / 180
  return { x: rho * Math.sin(lonRad), y: rho * Math.cos(lonRad) }
}

function polarToLatLon(x: number, y: number, fallbackLon = 0) {
  const rho = Math.hypot(x, y)
  const lat = -90 + (2 * Math.atan(rho / (2 * MOON_RADIUS_KM * 1000)) * 180) / Math.PI
  const lon = rho < 0.01 ? fallbackLon : (Math.atan2(x, y) * 180) / Math.PI
  return {
    lat: Math.max(-90, Math.min(-70, lat)),
    lon: ((lon + 540) % 360) - 180,
  }
}

function getPixelsPerMeter(minDimension: number, zoom: number) {
  // The full 70°S WAC coverage boundary fills ~88% of the viewport at zoom 1.
  return ((minDimension * 0.44) / POLAR_70S_RADIUS_M) * zoom
}

export default function MoonMap({
  viewState,
  selectedPoint,
  scenarioPoints = { a: null, b: null },
  onViewChange,
  onPickCoords,
}: MoonMapProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    moved: boolean
    centerX: number
    centerY: number
    pixelsPerMeter: number
    fallbackLon: number
  } | null>(null)
  const [terrainLoaded, setTerrainLoaded] = useState(false)
  const [imageryLoaded, setImageryLoaded] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 600, height: 420 })

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return

    const update = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height })
      }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const metrics = useMemo<MapMetrics>(() => {
    const { width, height } = viewportSize
    const pixelsPerMeter = getPixelsPerMeter(Math.min(width, height), viewState.zoom)
    const center = latLonToPolar(viewState.centerLat, viewState.centerLon)
    return {
      width,
      height,
      centerX: center.x,
      centerY: center.y,
      pixelsPerMeter,
      poleX: width / 2 - center.x * pixelsPerMeter,
      poleY: height / 2 + center.y * pixelsPerMeter,
    }
  }, [viewportSize, viewState.centerLat, viewState.centerLon, viewState.zoom])

  const worldToScreen = (point: ProjectedPoint) => ({
    x: viewportSize.width / 2 + (point.x - metrics.centerX) * metrics.pixelsPerMeter,
    y: viewportSize.height / 2 - (point.y - metrics.centerY) * metrics.pixelsPerMeter,
  })

  const screenToLatLon = (clientX: number, clientY: number, rect: DOMRect) => {
    const screenX = clientX - rect.left
    const screenY = clientY - rect.top
    const worldX = metrics.centerX + (screenX - metrics.width / 2) / metrics.pixelsPerMeter
    const worldY = metrics.centerY - (screenY - metrics.height / 2) / metrics.pixelsPerMeter
    return polarToLatLon(worldX, worldY, viewState.centerLon)
  }

  const imagerySize = POLAR_70S_RADIUS_M * 2 * metrics.pixelsPerMeter
  const imageryLeft =
    viewportSize.width / 2 +
    (-POLAR_70S_RADIUS_M - metrics.centerX) * metrics.pixelsPerMeter
  const imageryTop =
    viewportSize.height / 2 -
    (POLAR_70S_RADIUS_M - metrics.centerY) * metrics.pixelsPerMeter

  const terrainSize = POLAR_IMAGE_HALF_EXTENT_M * 2 * metrics.pixelsPerMeter
  const terrainLeft =
    viewportSize.width / 2 +
    (-POLAR_IMAGE_HALF_EXTENT_M - metrics.centerX) * metrics.pixelsPerMeter
  const terrainTop =
    viewportSize.height / 2 -
    (POLAR_IMAGE_HALF_EXTENT_M - metrics.centerY) * metrics.pixelsPerMeter

  const ringData = [
    { lat: -70, label: '70°S' },
    { lat: -75, label: '75°S' },
    { lat: -80, label: '80°S' },
    { lat: -85, label: '85°S' },
  ].map((ring) => ({
    ...ring,
    radius:
      2 *
      MOON_RADIUS_KM *
      1000 *
      Math.tan(((90 + ring.lat) * Math.PI) / 360) *
      metrics.pixelsPerMeter,
  }))

  const emitView = (centerX: number, centerY: number, zoom: number) => {
    const center = polarToLatLon(centerX, centerY, viewState.centerLon)
    onViewChange({
      centerLat: center.lat,
      centerLon: center.lon,
      zoom: clampLunarZoom(zoom),
      origin: 'map',
    })
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.site-marker-pin, .map-viewport-control')) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      centerX: metrics.centerX,
      centerY: metrics.centerY,
      pixelsPerMeter: metrics.pixelsPerMeter,
      fallbackLon: viewState.centerLon,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.hypot(dx, dy) > 3) drag.moved = true
    if (!drag.moved) return

    emitView(
      drag.centerX - dx / drag.pixelsPerMeter,
      drag.centerY + dy / drag.pixelsPerMeter,
      viewState.zoom
    )
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (!drag.moved && onPickCoords) {
      const rect = event.currentTarget.getBoundingClientRect()
      const point = screenToLatLon(event.clientX, event.clientY, rect)
      onPickCoords(point.lat, point.lon)
    }

    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const worldX = metrics.centerX + (cursorX - metrics.width / 2) / metrics.pixelsPerMeter
    const worldY = metrics.centerY - (cursorY - metrics.height / 2) / metrics.pixelsPerMeter
    const nextZoom = clampLunarZoom(viewState.zoom * Math.exp(-event.deltaY * 0.0014))
    const nextScale = getPixelsPerMeter(Math.min(metrics.width, metrics.height), nextZoom)

    emitView(
      worldX - (cursorX - metrics.width / 2) / nextScale,
      worldY + (cursorY - metrics.height / 2) / nextScale,
      nextZoom
    )
  }

  const zoomAroundCenter = (factor: number) => {
    emitView(
      metrics.centerX,
      metrics.centerY,
      clampLunarZoom(viewState.zoom * factor)
    )
  }

  const resetView = () => onViewChange({ ...DEFAULT_LUNAR_VIEW })

  return (
    <div className="bg-[#18191B] border border-[#363A3F] rounded p-4 flex flex-col gap-3 w-full h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs min-h-[36px]">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#638BFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
          </svg>
          <div>
            <h2 className="text-sm font-semibold text-[#EDEEF0] uppercase tracking-wider">
              South Polar Stereographic Map
            </h2>
            <span className="text-[9px] font-mono text-[#777D86]">
              LROC WAC imagery · LOLA relief · 70°S–90°S
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-3xs">
          <button
            type="button"
            onClick={resetView}
            className="map-viewport-control px-2.5 py-1 rounded border border-[#363A3F] bg-[#111113] text-[#AFB3BA] hover:text-white"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative w-full h-[420px] min-h-[420px] bg-[#111113] rounded overflow-hidden border border-[#363A3F] select-none cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        aria-label="Synchronized south polar map. Drag to pan and scroll to zoom."
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(99,139,255,0.035),transparent_68%)]" />

        <img
          src="/terrain/lunar-south-pole-wac-70s-299m.webp"
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => setImageryLoaded(true)}
          className="absolute max-w-none pointer-events-none transition-opacity duration-500"
          style={{
            width: imagerySize,
            height: imagerySize,
            left: imageryLeft,
            top: imageryTop,
            opacity: imageryLoaded ? 0.98 : 0,
            imageRendering: 'auto',
            clipPath: 'circle(50% at 50% 50%)',
            WebkitClipPath: 'circle(50% at 50% 50%)',
          }}
        />

        <img
          src="/terrain/lunar-south-pole-75s-120m.webp"
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => setTerrainLoaded(true)}
          className="absolute max-w-none pointer-events-none transition-opacity duration-500"
          style={{
            width: terrainSize,
            height: terrainSize,
            left: terrainLeft,
            top: terrainTop,
            opacity: terrainLoaded ? 0.24 : 0,
            imageRendering: 'auto',
            mixBlendMode: 'soft-light',
            clipPath: 'circle(50% at 50% 50%)',
            WebkitClipPath: 'circle(50% at 50% 50%)',
          }}
        />

        <div
          className="absolute rounded-full border border-dashed border-[#638BFF]/45 pointer-events-none"
          style={{
            width: ringData[0].radius * 2,
            height: ringData[0].radius * 2,
            left: metrics.poleX - ringData[0].radius,
            top: metrics.poleY - ringData[0].radius,
          }}
        />
        <div
          className="absolute h-px bg-white/35 pointer-events-none"
          style={{
            width: ringData[0].radius * 2,
            left: metrics.poleX - ringData[0].radius,
            top: metrics.poleY,
          }}
        />
        <div
          className="absolute w-px bg-white/35 pointer-events-none"
          style={{
            height: ringData[0].radius * 2,
            left: metrics.poleX,
            top: metrics.poleY - ringData[0].radius,
          }}
        />

        {ringData.slice(1).map((ring) => (
          <div
            key={ring.lat}
            className="absolute rounded-full border border-dashed border-[#515761]/70 pointer-events-none"
            style={{
              width: ring.radius * 2,
              height: ring.radius * 2,
              left: metrics.poleX - ring.radius,
              top: metrics.poleY - ring.radius,
            }}
          />
        ))}

        {ringData.map((ring) => (
          <span
            key={`label-${ring.lat}`}
            className="absolute -translate-x-1/2 px-1 py-0.5 bg-[#111113]/75 text-[9px] text-[#AFB3BA] font-mono pointer-events-none"
            style={{ left: metrics.poleX, top: metrics.poleY - ring.radius + 3 }}
          >
            {ring.label}
          </span>
        ))}

        <span
          className="absolute w-2 h-2 rounded-full bg-[#E9AD51] border border-[#111113] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: metrics.poleX, top: metrics.poleY }}
        />

        {([
          { key: 'a', label: 'A', point: scenarioPoints.a, color: '#E9AD51' },
          { key: 'b', label: 'B', point: scenarioPoints.b, color: '#638BFF' },
        ] as const).map(({ key, label, point, color }) => {
          if (!point || point.lat > -70 || point.lat < -90 || !Number.isFinite(point.lon)) return null
          const { x, y } = worldToScreen(latLonToPolar(point.lat, point.lon))
          return (
            <div
              key={key}
              data-scenario-marker={label}
              aria-label={'Scenario ' + label + ' at ' + point.lat.toFixed(3) + ' degrees latitude, ' + point.lon.toFixed(3) + ' degrees longitude'}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: x, top: y }}
            >
              <span
                className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_2px_rgba(17,17,19,0.9)]"
                style={{ borderColor: color, backgroundColor: 'rgba(17,17,19,0.92)' }}
              />
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold font-mono"
                style={{ color }}
              >
                {label}
              </span>
            </div>
          )
        })}

        {selectedPoint && (() => {
          const { x, y } = worldToScreen(latLonToPolar(selectedPoint.lat, selectedPoint.lon))
          return (
            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: x, top: y }}
              aria-label={`Selected coordinates ${selectedPoint.lat.toFixed(3)} degrees latitude, ${selectedPoint.lon.toFixed(3)} degrees longitude`}
            >
              <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E9AD51] shadow-[0_0_0_2px_rgba(17,17,19,0.9),0_0_14px_rgba(233,173,81,0.65)]" />
              <span className="absolute left-1/2 top-1/2 h-12 w-px -translate-x-1/2 -translate-y-1/2 bg-[#E9AD51]/90" />
              <span className="absolute left-1/2 top-1/2 h-px w-12 -translate-x-1/2 -translate-y-1/2 bg-[#E9AD51]/90" />
              <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#111113] bg-[#E9AD51]" />
              <span className="absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap rounded bg-[#111113]/90 px-1.5 py-0.5 text-[9px] font-mono text-[#F3C77B] border border-[#E9AD51]/50">
                {selectedPoint.lat.toFixed(2)}° · {selectedPoint.lon.toFixed(2)}°
              </span>
            </div>
          )
        })()}

        <div className="absolute left-3 bottom-3 z-20 flex items-center gap-1.5">
          <button
            type="button"
            className="map-viewport-control grid w-8 h-8 place-items-center rounded border border-[#363A3F] bg-[#18191B]/95 text-[#EDEEF0] hover:border-[#638BFF]"
            onClick={() => zoomAroundCenter(1.35)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="map-viewport-control grid w-8 h-8 place-items-center rounded border border-[#363A3F] bg-[#18191B]/95 text-[#EDEEF0] hover:border-[#638BFF]"
            onClick={() => zoomAroundCenter(1 / 1.35)}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="ml-1 rounded bg-[#111113]/85 px-2 py-1 text-[9px] text-[#AFB3BA] font-mono">
            {viewState.zoom.toFixed(1)}×
          </span>
        </div>

        <div className="absolute right-3 bottom-3 z-20 rounded bg-[#111113]/85 border border-[#363A3F] px-2 py-1 text-[9px] text-[#AFB3BA] font-mono pointer-events-none">
          {selectedPoint
            ? `Selected · ${selectedPoint.lat.toFixed(2)}°, ${selectedPoint.lon.toFixed(2)}°`
            : imageryLoaded
              ? terrainLoaded
                ? 'LROC WAC imagery · LOLA terrain overlay'
                : 'LROC WAC · loading LOLA relief…'
              : 'Loading LROC polar imagery…'}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-[#777D86]">
        <span>70°S–90°S WAC coverage · 30 m source LOLA DEM inside 75°S · Drag to pan</span>
        <span>{viewState.centerLat.toFixed(2)}° · {viewState.centerLon.toFixed(2)}°</span>
      </div>
    </div>
  )
}