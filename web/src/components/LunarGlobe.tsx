import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SelectableSite } from '../types/mission'

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

export function latLonToVector3(latDeg: number, lonDeg: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const latRad = (latDeg * Math.PI) / 180.0
  const lonRad = (lonDeg * Math.PI) / 180.0
  const x = radius * Math.cos(latRad) * Math.cos(lonRad)
  const y = radius * Math.sin(latRad)
  const z = -radius * Math.cos(latRad) * Math.sin(lonRad)
  return new THREE.Vector3(x, y, z)
}

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
  const [currentView, setCurrentView] = useState<'south_pole' | 'custom'>('south_pole')

  const webGLSupported = isWebGLAvailable()
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const setCameraView = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera) return

    setCurrentView('south_pole')
    const dist = defaultDistanceRef.current || computeFittingDistance(GLOBE_RADIUS, camera.fov, camera.aspect, 1.08)

    camera.position.set(0, -dist, 0)
    camera.up.set(1, 0, 0)
    if (controls) controls.target.set(0, 0, 0)

    camera.lookAt(0, 0, 0)
    if (controls) controls.update()
  }, [])

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

    const scene = new THREE.Scene()
    scene.background = mode === 'hero' ? null : new THREE.Color(0x050608)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    cameraRef.current = camera

    if (mode === 'hero') {
      const tiltRad = (25 * Math.PI) / 180
      const dist = 3.9
      const camX = dist * Math.cos(tiltRad)
      const camY = -dist * Math.sin(tiltRad)
      camera.position.set(camX, camY, 0)
      camera.up.set(Math.sin(tiltRad), Math.cos(tiltRad), 0)
      camera.lookAt(0, 0, 0)
    } else {
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: mode === 'hero' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.setAttribute('aria-label', 'Rendering of the Moon')
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    const updateDimensions = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      const aspect = width / height
      camera.aspect = aspect

      if (aspect < 1) {
        camera.fov = 2 * Math.atan(Math.tan((45 * Math.PI) / 360) / aspect) * (180 / Math.PI)
      } else {
        camera.fov = 45
      }

      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)

      const fitDist = computeFittingDistance(GLOBE_RADIUS, camera.fov, aspect, 1.08)
      defaultDistanceRef.current = fitDist

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

    const initialRect = container.getBoundingClientRect()
    if (initialRect.width > 0 && initialRect.height > 0) {
      updateDimensions(initialRect.width, initialRect.height)
    }

    if (mode === 'interactive') {
      controls = new OrbitControls(camera, renderer.domElement)
      controls.addEventListener('start', () => {
        isUserInteracting = true
      })
      controls.enableDamping = false
      controls.enablePan = false
      controls.minDistance = 1.9
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4)
    dirLight.position.set(5, 3, 5)
    scene.add(dirLight)

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

    let markersGroup: THREE.Group | null = null
    if (mode === 'interactive') {
      markersGroup = new THREE.Group()
      scene.add(markersGroup)
      markersGroupRef.current = markersGroup
    }

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

        const surfaceHits = raycaster.intersectObject(moonMesh)
        if (surfaceHits.length > 0) {
          const pt = surfaceHits[0].point
          const { lat, lon } = vector3ToLatLon(pt)
          if (onPickCoordsRef.current) {
            onPickCoordsRef.current(lat, lon)
          }
        }
      }

      renderer.domElement.addEventListener('click', onPointerDown)

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

    let animId = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)

      if (mode === 'hero') {
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

  useEffect(() => {
    if (mode === 'hero') return
    const group = markersGroupRef.current
    if (!group) return

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

    const colorA = 0xe0a04a
    const colorB = 0x6fa8c9
    const colorWhite = 0xffffff
    const colorHighlight = 0xb9a58c

    const filledDotGeom = new THREE.CircleGeometry(0.032, 24)
    const hollowRingGeom = new THREE.RingGeometry(0.018, 0.038, 24)
    const selectionRingGeom = new THREE.RingGeometry(0.046, 0.062, 24)

    sites
      .filter((s) => s.lat !== null && s.lat <= -70 && s.lon !== null)
      .forEach((site) => {
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

        const geom = isRegionCentre ? hollowRingGeom : filledDotGeom
        const mat = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          depthTest: true,
        })
        const baseMesh = new THREE.Mesh(geom, mat)
        baseMesh.userData = { site }
        markerMeshGroup.add(baseMesh)

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

  if (!webGLSupported) {
    return (
      <div className="p-4 bg-[#18191B] border border-[#363A3F] rounded text-[#EDEEF0]">
        <h3 className="text-xs font-bold text-[#E9AD51] mb-1">
          WebGL Hardware Acceleration Unavailable
        </h3>
        <p className="text-3xs text-[#AFB3BA]">
          Use the Flat Polar Map beside this panel to select sites and coordinates.
        </p>
      </div>
    )
  }

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

  return (
    <div className="bg-[#18191B] border border-[#363A3F] rounded p-4 flex flex-col gap-3 w-full">
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#EDEEF0] uppercase tracking-wider">
              🌐 3D South Pole Globe
            </span>
            <span className="px-2 py-0.5 rounded bg-[#111113] border border-[#363A3F] text-3xs font-mono text-[#AFB3BA]">
              Lat: -90° to -70°S | Lon: -180° to +180°E
            </span>
          </div>
          <button
            onClick={setCameraView}
            className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors cursor-pointer ${
              currentView === 'south_pole'
                ? 'bg-[#E9AD51]/20 text-[#E9AD51] border border-[#E9AD51]/50'
                : 'bg-[#111113] text-[#AFB3BA] hover:text-[#EDEEF0] border border-[#363A3F]'
            }`}
          >
            🏔️ Reset South Pole View
          </button>
        </div>
      )}

      <div
        ref={mountRef}
        id="globe-canvas-container"
        className={`w-full ${heightClass} bg-[#111113] border border-[#363A3F] rounded overflow-hidden relative cursor-grab active:cursor-grabbing select-none`}
        tabIndex={0}
        aria-label="3D Interactive Lunar Globe (drag to rotate, scroll to zoom)"
      />

      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-3xs font-mono text-[#AFB3BA]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E9AD51]" />
              <span className="text-[#E9AD51]">Scenario A</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#638BFF]" />
              <span className="text-[#638BFF]">Scenario B</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span>South Pole Site</span>
            </span>
          </div>
          <div>Click pin or surface to assign A / B</div>
        </div>
      )}
    </div>
  )
}
