import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'

export interface LunarGlobeProps {
  sites?: SelectableSite[]
  selectedSiteId?: string | null
  onSelectSite?: (site: SelectableSite) => void
  onPickCoords?: (lat: number, lon: number) => void
  scenarioAId?: string
  scenarioBId?: string
  autoRotate?: boolean
  autoRotateSpeed?: number
  heightClass?: string
  showControls?: boolean
  compact?: boolean
  mode?: 'interactive' | 'hero'
}

const GLOBE_RADIUS = 1.5

/**
 * Converts lunar planetocentric latitude (deg) and east-positive longitude (deg)
 * into Three.js Cartesian coordinates (X, Y, Z) matching the equirectangular
 * NASA SVS CGI Moon Kit texture (centered on 0° longitude).
 *
 * In Three.js standard SphereGeometry:
 * - u=0.5 (0° lon) maps to +X
 * - u=0.75 (+90°E) maps to -Z (East is Right when looking at Near Side)
 * - u=0.25 (-90°E / 90°W) maps to +Z (West is Left)
 * - v=1.0 (+90° lat) maps to +Y (North Pole)
 * - v=0.0 (-90° lat) maps to -Y (South Pole)
 */
export function latLonToVector3(latDeg: number, lonDeg: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const latRad = (latDeg * Math.PI) / 180.0
  const lonRad = (lonDeg * Math.PI) / 180.0
  const x = radius * Math.cos(latRad) * Math.cos(lonRad)
  const y = radius * Math.sin(latRad)
  const z = -radius * Math.cos(latRad) * Math.sin(lonRad)
  return new THREE.Vector3(x, y, z)
}

/**
 * Converts Three.js Cartesian coordinate back to planetocentric latitude and east-positive longitude.
 */
export function vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const norm = v.clone().normalize()
  const latRad = Math.asin(Math.max(-1, Math.min(1, norm.y)))
  const latDeg = (latRad * 180.0) / Math.PI
  const lonRad = Math.atan2(-norm.z, norm.x)
  let lonDeg = (lonRad * 180.0) / Math.PI
  while (lonDeg > 180) lonDeg -= 360
  while (lonDeg < -180) lonDeg += 360
  return { lat: Number(latDeg.toFixed(2)), lon: Number(lonDeg.toFixed(2)) }
}

/**
 * Compute camera distance required to fit a sphere of radius R
 * within the camera's FOV and panel aspect ratio with a small margin.
 */
export function computeFittingDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  margin = 1.08
): number {
  const vHalfFov = (fovDeg * Math.PI) / 360
  const hHalfFov = Math.atan(aspect * Math.tan(vHalfFov))
  const minHalfFov = Math.min(vHalfFov, hHalfFov)
  return (radius * margin) / Math.sin(minHalfFov)
}

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

export default function LunarGlobe({
  sites = [],
  selectedSiteId,
  onSelectSite,
  onPickCoords,
  scenarioAId,
  scenarioBId,
  autoRotate = false,
  autoRotateSpeed = 0.5,
  heightClass = 'min-h-[380px] sm:min-h-[460px] lg:min-h-[520px]',
  showControls = true,
  compact = false,
  mode = 'interactive',
}: LunarGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const defaultDistanceRef = useRef<number>(3.9)
  const markersGroupRef = useRef<THREE.Group | null>(null)
  const onSelectSiteRef = useRef(onSelectSite)
  onSelectSiteRef.current = onSelectSite
  const onPickCoordsRef = useRef(onPickCoords)
  onPickCoordsRef.current = onPickCoords
  const setPickedCoords = useScenarioStore((s) => s.setPickedCoords)
  const [currentView, setCurrentView] = useState<'south_pole' | 'near_side' | 'far_side' | 'custom'>('south_pole')

  // Check WebGL availability
  const webGLSupported = isWebGLAvailable()
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Preset view navigator (interactive mode)
  const setCameraView = useCallback(
    (view: 'south_pole' | 'near_side' | 'far_side') => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera) return

      setCurrentView(view)
      const dist = defaultDistanceRef.current || computeFittingDistance(GLOBE_RADIUS, camera.fov, camera.aspect, 1.08)

      if (view === 'south_pole') {
        // Looking straight down the south pole axis (-Y)
        // With camera.up pointing along +X (0° longitude, Prime Meridian pointing UP)
        // Fitted distance so the full sphere is visible with small margin
        camera.position.set(0, -dist, 0)
        camera.up.set(1, 0, 0)
        if (controls) controls.target.set(0, 0, 0)
      } else if (view === 'near_side') {
        // Looking at 0° lon, 0° lat (Earth-facing Near Side center)
        camera.position.set(dist, 0, 0)
        camera.up.set(0, 1, 0)
        if (controls) controls.target.set(0, 0, 0)
      } else if (view === 'far_side') {
        // Looking at 180° lon (Far Side center)
        camera.position.set(-dist, 0, 0)
        camera.up.set(0, 1, 0)
        if (controls) controls.target.set(0, 0, 0)
      }

      camera.lookAt(0, 0, 0)
      if (controls) controls.update()
    },
    []
  )

  // Focus a specific site (interactive mode)
  const focusSite = useCallback(
    (lat: number, lon: number) => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera) return

      setCurrentView('custom')
      const dist = defaultDistanceRef.current || computeFittingDistance(GLOBE_RADIUS, camera.fov, camera.aspect, 1.08)
      const normal = latLonToVector3(lat, lon, 1.0).normalize()
      const targetPos = normal.clone().multiplyScalar(dist)

      camera.position.copy(targetPos)
      // If polar site, orient camera up toward equator (+X)
      if (Math.abs(lat) > 75) {
        camera.up.set(1, 0, 0)
      } else {
        camera.up.set(0, 1, 0)
      }
      camera.lookAt(0, 0, 0)
      if (controls) {
        controls.target.set(0, 0, 0)
        controls.update()
      }
    },
    []
  )

  // Auto-focus selectedSiteId in interactive mode
  useEffect(() => {
    if (mode === 'hero' || !selectedSiteId) return
    const target = sites.find((s) => s.id === selectedSiteId)
    if (target && target.lat !== null && target.lon !== null) {
      focusSite(target.lat, target.lon)
    }
  }, [selectedSiteId, sites, focusSite, mode])

  useEffect(() => {
    if (!webGLSupported || !mountRef.current) return

    const container = mountRef.current
    let controls: OrbitControls | null = null
    let isUserInteracting = false

    // 1. Scene
    const scene = new THREE.Scene()
    scene.background = mode === 'hero' ? null : new THREE.Color(0x050608)

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    cameraRef.current = camera

    if (mode === 'hero') {
      // Near side, tilted about 25 deg so the southern region is visible toward bottom
      const tiltRad = (25 * Math.PI) / 180
      const dist = 3.9
      const camX = dist * Math.cos(tiltRad)
      const camY = -dist * Math.sin(tiltRad)
      camera.position.set(camX, camY, 0)
      camera.up.set(Math.sin(tiltRad), Math.cos(tiltRad), 0)
      camera.lookAt(0, 0, 0)
    } else {
      // Default initial camera distance computed from initial panel size and FOV
      const initialW = container.clientWidth || 600
      const initialH = container.clientHeight || 490
      const initialAspect = initialW / initialH
      const initialFov =
        initialAspect < 1
          ? 2 * Math.atan(Math.tan((45 * Math.PI) / 360) / initialAspect) * (180 / Math.PI)
          : 45
      camera.fov = initialFov
      camera.aspect = initialAspect
      camera.updateProjectionMatrix()
      const initialDist = computeFittingDistance(GLOBE_RADIUS, initialFov, initialAspect, 1.08)
      defaultDistanceRef.current = initialDist
      camera.position.set(0, -initialDist, 0)
      camera.up.set(1, 0, 0)
      camera.lookAt(0, 0, 0)
    }

    // 3. Renderer with sizing logic
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: mode === 'hero' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.setAttribute('aria-label', 'Rendering of the Moon')
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // Sizing & Aspect handling via ResizeObserver
    const updateDimensions = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      const aspect = width / height
      camera.aspect = aspect

      // Ensure the sphere is NEVER cropped by the viewport:
      // Standard vertical FOV is 45°. If aspect < 1 (portrait/narrow),
      // adapt FOV so horizontal coverage matches 45° landscape.
      if (aspect < 1) {
        camera.fov = 2 * Math.atan(Math.tan((45 * Math.PI) / 360) / aspect) * (180 / Math.PI)
      } else {
        camera.fov = 45
      }

      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)

      // Dynamically compute camera distance so the whole sphere is visible with small margin
      const fitDist = computeFittingDistance(GLOBE_RADIUS, camera.fov, aspect, 1.08)
      defaultDistanceRef.current = fitDist

      // If user hasn't manually orbited/zoomed yet, keep the initial South Pole view fitted
      if (mode !== 'hero' && !isUserInteracting) {
        camera.position.set(0, -fitDist, 0)
        camera.up.set(1, 0, 0)
        camera.lookAt(0, 0, 0)
        if (controls) {
          controls.target.set(0, 0, 0)
          controls.update()
        }
      }
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        updateDimensions(width, height)
      }
    })
    resizeObserver.observe(container)

    // Initial measurement
    const initialRect = container.getBoundingClientRect()
    if (initialRect.width > 0 && initialRect.height > 0) {
      updateDimensions(initialRect.width, initialRect.height)
    }

    // 4. Controls (Interactive mode only)
    if (mode === 'interactive') {
      controls = new OrbitControls(camera, renderer.domElement)
      controls.addEventListener('start', () => {
        isUserInteracting = true
      })
      controls.enableDamping = false // Strict: no unexpected inertia drift
      controls.enablePan = false // Keep globe centered
      controls.minDistance = 1.9 // Closer zoom headroom for south pole features (radius = 1.5)
      controls.maxDistance = 8.0
      controls.rotateSpeed = prefersReducedMotion ? 0.4 : 0.8
      controls.zoomSpeed = prefersReducedMotion ? 0.4 : 0.8

      if (autoRotate && !prefersReducedMotion) {
        controls.autoRotate = true
        controls.autoRotateSpeed = autoRotateSpeed
      } else {
        controls.autoRotate = false
      }

      controlsRef.current = controls
    }

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4)
    dirLight.position.set(5, 3, 5)
    scene.add(dirLight)

    // 6. Moon Sphere & NASA LROC 2K Texture
    const sphereGeom = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64)
    const textureLoader = new THREE.TextureLoader()
    const moonTexture = textureLoader.load('/images/moon_color_2k.jpg', () => {
      renderer.render(scene, camera)
    })
    moonTexture.colorSpace = THREE.SRGBColorSpace

    const sphereMat = new THREE.MeshStandardMaterial({
      map: moonTexture,
      roughness: 0.95,
      metalness: 0.05,
    })
    const moonMesh = new THREE.Mesh(sphereGeom, sphereMat)
    scene.add(moonMesh)

    // 7. Markers Group (Interactive mode only)
    let markersGroup: THREE.Group | null = null
    if (mode === 'interactive') {
      markersGroup = new THREE.Group()
      scene.add(markersGroup)
      markersGroupRef.current = markersGroup
    }

    // 8. Raycasting for interactive click selection
    let onPointerDown: ((event: MouseEvent) => void) | null = null
    let onPointerEnter: (() => void) | null = null
    let onPointerLeave: (() => void) | null = null

    if (mode === 'interactive' && markersGroup) {
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()

      onPointerDown = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObjects(markersGroup!.children, true)

        if (intersects.length > 0) {
          let cur: THREE.Object3D | null = intersects[0].object
          while (cur && !cur.userData.site) {
            cur = cur.parent
          }
          if (cur && cur.userData.site && onSelectSiteRef.current) {
            onSelectSiteRef.current(cur.userData.site)
            return
          }
        }

        // Raycast against lunar sphere surface to pick custom coordinates
        const surfaceHits = raycaster.intersectObject(moonMesh)
        if (surfaceHits.length > 0) {
          const pt = surfaceHits[0].point
          const { lat, lon } = vector3ToLatLon(pt)
          setPickedCoords(lat, lon)
          if (onPickCoordsRef.current) {
            onPickCoordsRef.current(lat, lon)
          }
        }
      }

      renderer.domElement.addEventListener('click', onPointerDown)

      // Hover pause for auto-rotation
      if (autoRotate && controls) {
        onPointerEnter = () => {
          if (controls && !prefersReducedMotion) controls.autoRotate = false
        }
        onPointerLeave = () => {
          if (controls && !prefersReducedMotion) controls.autoRotate = true
        }
        renderer.domElement.addEventListener('pointerenter', onPointerEnter)
        renderer.domElement.addEventListener('pointerleave', onPointerLeave)
      }
    }

    // 9. Render Loop
    let animId = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)

      if (mode === 'hero') {
        // Gentle slow drift of at most +/-10 deg (0.1745 rad)
        if (!prefersReducedMotion) {
          const drift = Math.sin(performance.now() * 0.00035) * ((10 * Math.PI) / 180)
          moonMesh.rotation.y = drift
        } else {
          moonMesh.rotation.y = 0
        }
      } else {
        if (controls && controls.autoRotate) {
          controls.update()
        }
        // Scale marker size down as camera zooms in so markers stay separated and sharp
        if (markersGroup && markersGroup.children.length > 0) {
          const camDist = camera.position.length()
          const markerScale = Math.max(0.35, Math.min(1.0, camDist / 3.9))
          for (let i = 0; i < markersGroup.children.length; i++) {
            markersGroup.children[i].scale.set(markerScale, markerScale, markerScale)
          }
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    // Cleanup
    return () => {
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      if (onPointerDown) renderer.domElement.removeEventListener('click', onPointerDown)
      if (onPointerEnter) renderer.domElement.removeEventListener('pointerenter', onPointerEnter)
      if (onPointerLeave) renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      if (controls) controls.dispose()
      renderer.dispose()
      sphereGeom.dispose()
      sphereMat.dispose()
      moonTexture.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [webGLSupported, mode, autoRotate, autoRotateSpeed, prefersReducedMotion])

  // Update Markers whenever sites, selection, or scenario assignments change (Interactive mode)
  useEffect(() => {
    if (mode === 'hero') return
    const group = markersGroupRef.current
    if (!group) return

    // Clear existing marker meshes
    while (group.children.length > 0) {
      const obj = group.children[0]
      group.remove(obj)
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose()
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    }

    // Design tokens:
    // Scenario A: amber #E0A04A
    // Scenario B: steel blue #6FA8C9
    // All others: white #FFFFFF
    // Frame & headings highlight tan: #B9A58C
    const colorA = 0xe0a04a
    const colorB = 0x6fa8c9
    const colorWhite = 0xffffff
    const colorHighlight = 0xb9a58c

    // Shared geometries (radius <= 4px scale, no glow)
    const filledDotGeom = new THREE.CircleGeometry(0.032, 24)
    const hollowRingGeom = new THREE.RingGeometry(0.018, 0.038, 24)
    const selectionRingGeom = new THREE.RingGeometry(0.046, 0.062, 24)

    sites.forEach((site) => {
      if (site.lat === null || site.lon === null) return

      const isA = site.id === scenarioAId
      const isB = site.id === scenarioBId
      const isSelected = site.id === selectedSiteId
      const isRegionCentre =
        site.coord_kind === 'region_centre' ||
        site.coord_kind === 'planned_region_center'

      let color = colorWhite
      if (isA) color = colorA
      else if (isB) color = colorB

      // Surface normal & position slightly raised to prevent z-fighting
      const pos = latLonToVector3(site.lat, site.lon, GLOBE_RADIUS * 1.006)
      const normal = pos.clone().normalize()
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        normal
      )

      const markerMeshGroup = new THREE.Group()
      markerMeshGroup.position.copy(pos)
      markerMeshGroup.quaternion.copy(quat)
      markerMeshGroup.userData = { site }

      // Base marker: hollow ring for region-centre, filled dot for specific site
      const geom = isRegionCentre ? hollowRingGeom : filledDotGeom
      const mat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        depthTest: true,
      })
      const baseMesh = new THREE.Mesh(geom, mat)
      baseMesh.userData = { site }
      markerMeshGroup.add(baseMesh)

      // Selected ring indicator
      if (isSelected) {
        const selectMat = new THREE.MeshBasicMaterial({
          color: colorHighlight,
          side: THREE.DoubleSide,
          depthTest: true,
        })
        const selectMesh = new THREE.Mesh(selectionRingGeom, selectMat)
        selectMesh.position.z += 0.002
        selectMesh.userData = { site }
        markerMeshGroup.add(selectMesh)
      }

      // Invisible larger hit area for easy clicking
      const hitGeom = new THREE.CircleGeometry(0.08, 12)
      const hitMat = new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide,
      })
      const hitMesh = new THREE.Mesh(hitGeom, hitMat)
      hitMesh.userData = { site }
      markerMeshGroup.add(hitMesh)

      group.add(markerMeshGroup)
    })
  }, [sites, selectedSiteId, scenarioAId, scenarioBId, mode])

  // Fallback view when WebGL is unavailable
  if (!webGLSupported) {
    if (mode === 'hero') {
      return (
        <div
          className={`w-full h-full relative overflow-hidden pointer-events-none select-none ${heightClass}`}
          style={{
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)',
          }}
        >
          <img
            src="/images/moon_color_2k.jpg"
            alt="Rendering of the Moon"
            aria-label="Rendering of the Moon"
            className="w-full h-full object-cover rounded-full"
            style={{
              filter: 'sepia(0.18) contrast(1.05) brightness(0.95)',
            }}
          />
        </div>
      )
    }

    return (
      <div className="p-4 bg-[#0D1014] border border-[#2A2D31] rounded text-[#E4E4E2]">
        <h3 className="text-xs font-bold text-[#E0A04A] mb-1">
          WebGL Hardware Acceleration Unavailable
        </h3>
        <p className="text-3xs text-[#8A8A88] mb-3">
          Your browser environment cannot initialize WebGL. Displaying standard landing site registry:
        </p>
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {sites.map((site) => (
            <div
              key={site.id}
              className="p-2 bg-[#050608] border border-[#2A2D31] rounded flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-semibold text-[#E4E4E2]">{site.name}</span>
                <span className="block text-3xs font-mono text-[#8A8A88]">
                  {site.lat}° Lat, {site.lon}° Lon · {site.coord_kind}
                </span>
              </div>
              {onSelectSite && (
                <button
                  onClick={() => onSelectSite(site)}
                  className="px-2 py-1 bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] text-3xs rounded"
                >
                  Select
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Hero Mode: Return plain container with CSS mask & sepia filter
  if (mode === 'hero') {
    return (
      <div
        ref={mountRef}
        id="hero-moon-canvas-container"
        className={`w-full h-full relative overflow-hidden pointer-events-none select-none ${heightClass}`}
        style={{
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)',
          filter: 'sepia(0.18) contrast(1.05) brightness(0.95)',
        }}
        aria-label="Rendering of the Moon"
      />
    )
  }

  // Interactive Mode
  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Globe View Controls Bar */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#0D1014] border border-[#2A2D31] rounded text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-3xs uppercase font-mono text-[#8A8A88] font-semibold mr-1">
              Presets:
            </span>
            <button
              onClick={() => setCameraView('south_pole')}
              className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                currentView === 'south_pole'
                  ? 'bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/50'
                  : 'bg-[#050608] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]'
              }`}
            >
              🏔️ South Pole
            </button>
            <button
              onClick={() => setCameraView('near_side')}
              className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                currentView === 'near_side'
                  ? 'bg-[#6FA8C9]/20 text-[#6FA8C9] border border-[#6FA8C9]/50'
                  : 'bg-[#050608] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]'
              }`}
            >
              🌍 Near Side
            </button>
            <button
              onClick={() => setCameraView('far_side')}
              className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                currentView === 'far_side'
                  ? 'bg-[#171B22] text-[#E4E4E2] border border-[#2A2D31]'
                  : 'bg-[#050608] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]'
              }`}
            >
              🌑 Far Side
            </button>
          </div>

          {/* Quick Landmark Targets (Phase A verification) */}
          {!compact && (
            <div className="flex items-center gap-1.5 text-3xs font-mono">
              <span className="text-[#8A8A88]">Landmarks:</span>
              <button
                onClick={() => {
                  focusSite(0.67, 23.47)
                  const found = sites.find((s) => s.id === 'test-apollo-11')
                  if (found && onSelectSite) onSelectSite(found)
                }}
                className="px-2 py-0.5 rounded bg-[#050608] hover:bg-[#171B22] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]"
                title="Apollo 11 in Mare Tranquillitatis (0.67°N, 23.47°E)"
              >
                Apollo 11
              </button>
              <button
                onClick={() => {
                  focusSite(-43.3, -11.4)
                  const found = sites.find((s) => s.id === 'test-tycho')
                  if (found && onSelectSite) onSelectSite(found)
                }}
                className="px-2 py-0.5 rounded bg-[#050608] hover:bg-[#171B22] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]"
                title="Tycho Crater in Southern Highlands (43.3°S, 11.4°W)"
              >
                Tycho
              </button>
              <button
                onClick={() => {
                  focusSite(-89.9, 0.0)
                  const found = sites.find((s) => s.id === 'test-shackleton' || s.id.includes('shackleton'))
                  if (found && onSelectSite) onSelectSite(found)
                }}
                className="px-2 py-0.5 rounded bg-[#050608] hover:bg-[#171B22] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]"
                title="Shackleton Crater at South Pole (89.9°S, 0°E)"
              >
                Shackleton
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        id="globe-canvas-container"
        className={`w-full ${heightClass} bg-[#050608] border border-[#2A2D31] rounded overflow-hidden relative cursor-grab active:cursor-grabbing select-none`}
        tabIndex={0}
        aria-label="3D Interactive Lunar Globe (drag to rotate, scroll to zoom)"
      />

      {/* Legend & Credit */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#0D1014] border border-[#2A2D31] rounded text-3xs font-mono text-[#8A8A88]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E0A04A]" />
              <span className="text-[#E0A04A]">Scenario A</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6FA8C9]" />
              <span className="text-[#6FA8C9]">Scenario B</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span>Other Site</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border border-white" />
              <span>Hollow: Region</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span>Filled: Site</span>
            </span>
          </div>
          <div>Drag to rotate · Scroll to zoom · Click globe to pick coordinates · Click pin to inspect</div>
        </div>
      )}
    </div>
  )
}
