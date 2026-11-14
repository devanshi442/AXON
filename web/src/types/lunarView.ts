export type LunarViewOrigin = 'globe' | 'map' | 'external'

export interface LunarViewState {
  centerLat: number
  centerLon: number
  /** Perspective zoom: 1 is the full South Pole view; higher values zoom in. */
  zoom: number
  origin: LunarViewOrigin
}

export const DEFAULT_LUNAR_VIEW: LunarViewState = {
  centerLat: -90,
  centerLon: 0,
  zoom: 1,
  origin: 'external',
}

export const MIN_LUNAR_ZOOM = 1
export const MAX_LUNAR_ZOOM = 12

export function clampLunarZoom(zoom: number): number {
  return Math.max(MIN_LUNAR_ZOOM, Math.min(MAX_LUNAR_ZOOM, zoom))
}
