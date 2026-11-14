import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SelectableSite } from '../types/mission'
import {
  DEFAULT_LUNAR_VIEW,
  clampLunarZoom,
  type LunarViewState,
} from '../types/lunarView'

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
  viewState?: LunarViewState
  onViewChange?: (view: LunarViewState) => void
  restrictToSouthPole?: boolean
}

const GLOBE_RADIUS = 1.5
const MOON_RADIUS_METERS = 1_737_400
const POLAR_HALF_EXTENT_METERS = 457_440
const POLAR_WAC_HALF_EXTENT_METERS =
  2 * MOON_RADIUS_METERS * Math.tan((10 * Math.PI) / 180)
const TERRAIN_TRIGGER_ZOOM = 1.2
const TERRAIN_VERTICAL_EXAGGERATION = 4

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
  return { lat: Number(latDeg.toFixed(3)), lon: Number(lonDeg.toFixed(3)) }
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

function northUpVector(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  return new THREE.Vector3(
    -Math.sin(lat) * Math.cos(lon),
    Math.cos(lat),
    Math.sin(lat) * Math.sin(lon)
  ).normalize()
}

// Keep the globe's screen-up aligned with the flat map's fixed longitude grid.
// This gives both views the same geographic orientation as their shared center moves.
function polarMapUpVector(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lon = (lonDeg * Math.PI) / 180
  const north = northUpVector(latDeg, lonDeg)
  const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon))
  return north.multiplyScalar(Math.cos(lon)).addScaledVector(east, -Math.sin(lon)).normalize()
}

function removeSouthPolarCap(geometry: THREE.BufferGeometry, cutoffLatitude = -82): void {
  const index = geometry.getIndex()
  const positions = geometry.getAttribute('position')
  if (!index || !positions) return

  const retained: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    const b = index.getX(i + 1)
    const c = index.getX(i + 2)
    const meanY = (
      positions.getY(a) +
      positions.getY(b) +
      positions.getY(c)
    ) / 3
    const latitude = (Math.asin(Math.max(-1, Math.min(1, meanY / GLOBE_RADIUS))) * 180) / Math.PI
    if (latitude > cutoffLatitude) retained.push(a, b, c)
  }

  geometry.setIndex(retained)
  geometry.computeVertexNormals()
}

function createPolarTerrainGeometry(heightGrid: Float32Array, radius: number): THREE.BufferGeometry {
  // One continuous 70°S–90°S polar surface. WAC imagery covers the full disk;
  // LOLA displacement is sampled only where the 75°S DEM is available.
  const gridSize = 1024
  const gridStride = gridSize + 1
  const vertexCount = gridStride * gridStride
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const valid = new Uint8Array(vertexCount)

  for (let row = 0; row <= gridSize; row++) {
    const y = POLAR_WAC_HALF_EXTENT_METERS -
      (row / gridSize) * POLAR_WAC_HALF_EXTENT_METERS * 2

    for (let col = 0; col <= gridSize; col++) {
      const x = -POLAR_WAC_HALF_EXTENT_METERS +
        (col / gridSize) * POLAR_WAC_HALF_EXTENT_METERS * 2
      const rho = Math.hypot(x, y)
      if (rho > POLAR_WAC_HALF_EXTENT_METERS) continue

      const index = row * gridStride + col
      const angularDistance = 2 * Math.atan(rho / (2 * MOON_RADIUS_METERS))
      const lat = -90 + (angularDistance * 180) / Math.PI
      const lon = (Math.atan2(x, y) * 180) / Math.PI

      let elevation = 0
      if (rho <= POLAR_HALF_EXTENT_METERS) {
        const heightCol = Math.max(
          0,
          Math.min(2047, Math.round(
            ((x + POLAR_HALF_EXTENT_METERS) / (2 * POLAR_HALF_EXTENT_METERS)) * 2047
          ))
        )
        const heightRow = Math.max(
          0,
          Math.min(2047, Math.round(
            ((POLAR_HALF_EXTENT_METERS - y) / (2 * POLAR_HALF_EXTENT_METERS)) * 2047
          ))
        )
        const rawElevation = heightGrid[heightRow * 2048 + heightCol] || 0
        const reliefFade = Math.max(
          0,
          Math.min(1, (POLAR_HALF_EXTENT_METERS - rho) / (POLAR_HALF_EXTENT_METERS * 0.08))
        )
        elevation = rawElevation * reliefFade
      }

      const displacedRadius =
        radius + (elevation / MOON_RADIUS_METERS) * radius * TERRAIN_VERTICAL_EXAGGERATION
      const position = latLonToVector3(lat, lon, displacedRadius)

      positions[index * 3] = position.x
      positions[index * 3 + 1] = position.y
      positions[index * 3 + 2] = position.z
      uvs[index * 2] =
        (x + POLAR_WAC_HALF_EXTENT_METERS) / (2 * POLAR_WAC_HALF_EXTENT_METERS)
      uvs[index * 2 + 1] =
        (y + POLAR_WAC_HALF_EXTENT_METERS) / (2 * POLAR_WAC_HALF_EXTENT_METERS)
      valid[index] = 1
    }
  }

  const indices: number[] = []
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const a = row * gridStride + col
      const b = a + 1
      const c = a + gridStride
      const d = c + 1

      if (valid[a] && valid[b] && valid[c]) indices.push(a, c, b)
      if (valid[b] && valid[c] && valid[d]) indices.push(b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
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
  heightClass = 'h-[420px]',
  showControls = true,
  compact = false,
  mode = 'interactive',
  viewState = DEFAULT_LUNAR_VIEW,
  onViewChange = () => undefined,
  restrictToSouthPole = false,
}: LunarGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const defaultDistanceRef = useRef<number>(3.9)
  const markersGroupRef = useRef<THREE.Group | null>(null)
  const sitesRef = useRef(sites)
  sitesRef.current = sites
  const viewStateRef = useRef(viewState)
  viewStateRef.current = viewState
  const onSelectSiteRef = useRef(onSelectSite)
  onSelectSiteRef.current = onSelectSite
  const onPickCoordsRef = useRef(onPickCoords)
  onPickCoordsRef.current = onPickCoords
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange
  const ensureTerrainDetailRef = useRef<(() => void) | null>(null)
  const suppressViewEmitRef = useRef(false)
  const [currentView, setCurrentView] = useState<'south_pole' | 'custom'>('south_pole')
  const [terrainStatus, setTerrainStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')

  const webGLSupported = isWebGLAvailable()
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const publishCurrentView = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || suppressViewEmitRef.current) return

    const target = controls?.target ?? new THREE.Vector3(0, 0, 0)
    const direction = camera.position.clone().sub(target).normalize()
    const point = vector3ToLatLon(direction)
    const previous = viewStateRef.current
    const centerLat = restrictToSouthPole
      ? Math.max(-90, Math.min(-70, point.lat))
      : point.lat

    // OrbitControls' minPolarAngle is relative to camera.up. Because camera.up
    // is deliberately rotated to keep map north-up, that constraint is not a
    // geographic latitude constraint and can move the camera off the south pole.
    // Clamp the actual lunar latitude instead, preserving the camera's distance
    // and longitude while keeping the selected region inside 70°S–90°S.
    if (restrictToSouthPole && Math.abs(centerLat - point.lat) > 1e-5) {
      const distance = camera.position.distanceTo(target)
      suppressViewEmitRef.current = true
      camera.position.copy(latLonToVector3(centerLat, point.lon, distance))
      camera.up.copy(polarMapUpVector(centerLat, point.lon))
      camera.lookAt(target)
      controls?.update()
      suppressViewEmitRef.current = false
    }

    const centerLon = Math.abs(centerLat + 90) < 0.02 ? previous.centerLon : point.lon

    const nextView: LunarViewState = {
      centerLat,
      centerLon,
      zoom: clampLunarZoom(camera.zoom),
      origin: 'globe',
    }
    camera.up.copy(polarMapUpVector(centerLat, centerLon))
    camera.lookAt(target)
    viewStateRef.current = nextView
    onViewChangeRef.current(nextView)
    // Terrain is always pre-loaded; this is a no-op after first call
    ensureTerrainDetailRef.current?.()
  }, [restrictToSouthPole])

  const setCameraView = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera) return

    setCurrentView('south_pole')
    const dist = defaultDistanceRef.current ||
      computeFittingDistance(GLOBE_RADIUS, camera.fov, camera.aspect, 1.08)
    camera.position.set(0, -dist, 0)
    camera.up.set(1, 0, 0)
    camera.zoom = 1
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(0, 0, 0)
      controls.update()
    }
    publishCurrentView()
  }, [publishCurrentView])

  const adjustZoom = useCallback((factor: number) => {
    const camera = cameraRef.current
    if (!camera) return
    camera.zoom = clampLunarZoom(camera.zoom * factor)
    camera.updateProjectionMatrix()
    controlsRef.current?.update()
    publishCurrentView()
  }, [publishCurrentView])

  useEffect(() => {
    if (!webGLSupported || !mountRef.current) return

    const container = mountRef.current
    let controls: OrbitControls | null = null
    let terrainRequested = false
    let sceneDisposed = false
    let terrainMesh: THREE.Mesh | null = null
    let terrainTexture: THREE.Texture | null = null
    let terrainGeometry: THREE.BufferGeometry | null = null
    let wheelHandler: ((event: WheelEvent) => void) | null = null
    let touchStartHandler: ((event: TouchEvent) => void) | null = null
    let touchMoveHandler: ((event: TouchEvent) => void) | null = null
    let lastPinchDistance: number | null = null

    const scene = new THREE.Scene()
    scene.background = mode === 'hero' ? null : new THREE.Color(0x111113)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
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
      const initialH = container.clientHeight || 420
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
      camera.position.copy(
        latLonToVector3(viewStateRef.current.centerLat, viewStateRef.current.centerLon, initialDist)
      )
      camera.up.copy(polarMapUpVector(viewStateRef.current.centerLat, viewStateRef.current.centerLon))
      camera.zoom = clampLunarZoom(viewStateRef.current.zoom)
      camera.updateProjectionMatrix()
      camera.lookAt(0, 0, 0)
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: mode === 'hero',
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.setAttribute('aria-label', 'Rendering of the Moon')
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    const applyCurrentView = (width: number, height: number) => {
      const centerLat = viewStateRef.current.centerLat
      const centerLon = viewStateRef.current.centerLon
      const fitDistance =
        defaultDistanceRef.current ||
        computeFittingDistance(GLOBE_RADIUS, camera.fov, camera.aspect, 1.08)

      camera.position.copy(latLonToVector3(centerLat, centerLon, fitDistance))
      camera.up.copy(polarMapUpVector(centerLat, centerLon))
      camera.zoom = clampLunarZoom(viewStateRef.current.zoom)
      camera.updateProjectionMatrix()
      camera.lookAt(0, 0, 0)
      if (controls) {
        suppressViewEmitRef.current = true
        controls.target.set(0, 0, 0)
        controls.update()
        suppressViewEmitRef.current = false
      }
      if (width > 0 && height > 0) renderer.render(scene, camera)
    }

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

      const fitDistance = computeFittingDistance(GLOBE_RADIUS, camera.fov, aspect, 1.08)
      defaultDistanceRef.current = fitDistance
      if (mode !== 'hero') applyCurrentView(width, height)
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
      controls.enableDamping = false
      controls.enableZoom = false
      controls.enablePan = false
      // Geographic latitude is clamped explicitly in publishCurrentView.
      // Do not use minPolarAngle here: OrbitControls measures it against the
      // rotated camera.up vector, not the Moon's global Y/polar axis.
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI
      controls.rotateSpeed = prefersReducedMotion ? 0.45 : 0.8

      if (autoRotate && !prefersReducedMotion) {
        controls.autoRotate = true
        controls.autoRotateSpeed = autoRotateSpeed
      } else {
        controls.autoRotate = false
      }

      controls.addEventListener('start', () => {
        if (controls) controls.autoRotate = false
      })
      controls.addEventListener('change', () => publishCurrentView())
      controlsRef.current = controls
      applyCurrentView(initialRect.width, initialRect.height)

      wheelHandler = (event: WheelEvent) => {
        event.preventDefault()
        camera.zoom = clampLunarZoom(camera.zoom * Math.exp(-event.deltaY * 0.00135))
        camera.updateProjectionMatrix()
        controls?.update()
        publishCurrentView()
      }
      renderer.domElement.addEventListener('wheel', wheelHandler, { passive: false })

      touchStartHandler = (event: TouchEvent) => {
        if (event.touches.length === 2) {
          const dx = event.touches[0].clientX - event.touches[1].clientX
          const dy = event.touches[0].clientY - event.touches[1].clientY
          lastPinchDistance = Math.hypot(dx, dy)
        } else {
          lastPinchDistance = null
        }
      }
      touchMoveHandler = (event: TouchEvent) => {
        if (event.touches.length !== 2 || lastPinchDistance === null) return
        event.preventDefault()
        const dx = event.touches[0].clientX - event.touches[1].clientX
        const dy = event.touches[0].clientY - event.touches[1].clientY
        const distance = Math.hypot(dx, dy)
        if (distance > 0 && lastPinchDistance > 0) {
          camera.zoom = clampLunarZoom(camera.zoom * (distance / lastPinchDistance))
          camera.updateProjectionMatrix()
          controls?.update()
          publishCurrentView()
        }
        lastPinchDistance = distance
      }
      renderer.domElement.addEventListener('touchstart', touchStartHandler, { passive: true })
      renderer.domElement.addEventListener('touchmove', touchMoveHandler, { passive: false })
    }

    // Minimal ambient so PSRs stay dark; grazing directional for crater-rim shading
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.18)
    scene.add(ambientLight)

    // Primary grazing sunlight — low elevation angle matches lunar South Pole geometry
    const dirLight = new THREE.DirectionalLight(0xfff8e7, 1.1)
    dirLight.position.set(6, 0.6, 3) // nearly horizontal, slight positive Y tilt
    scene.add(dirLight)

    // Faint fill from opposite side so shadowed faces aren't pure black in the renderer
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.07)
    fillLight.position.set(-4, -1, -4)
    scene.add(fillLight)

    const sphereGeom = new THREE.SphereGeometry(
      GLOBE_RADIUS,
      mode === 'interactive' ? 256 : 96,
      mode === 'interactive' ? 128 : 64
    )
    // Keep a reference to the geometry currently attached to the base globe.
    // When polar imagery arrives, replace this geometry with a cloned, capped
    // version so WebGL receives a fresh index buffer/VAO.
    let activeSphereGeometry: THREE.BufferGeometry = sphereGeom
    const textureLoader = new THREE.TextureLoader()
    const moonTexture = textureLoader.load('/images/moon_color_2k.jpg', () => {
      if (!sceneDisposed) renderer.render(scene, camera)
    })
    moonTexture.colorSpace = THREE.SRGBColorSpace
    moonTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())

    const sphereMat = new THREE.MeshStandardMaterial({
      map: moonTexture,
      roughness: 0.95,
      metalness: 0.02,
    })
    const moonMesh = new THREE.Mesh(sphereGeom, sphereMat)
    scene.add(moonMesh)

    const loadTerrainDetail = () => {
      if (mode !== 'interactive' || terrainRequested || sceneDisposed) return
      terrainRequested = true
      setTerrainStatus('loading')

      Promise.all([
        new Promise<THREE.Texture>((resolve, reject) => {
          textureLoader.load(
            '/terrain/lunar-south-pole-wac-70s-299m.webp',
            (texture) => resolve(texture),
            undefined,
            (error) => reject(error)
          )
        }),
        fetch('/terrain/lunar-south-pole-height-2048.f32').then((response) => {
          if (!response.ok) throw new Error(`Terrain height grid request failed: ${response.status}`)
          return response.arrayBuffer()
        }),
      ])
        .then(([texture, heightBuffer]) => {
          if (sceneDisposed) {
            texture.dispose()
            return
          }

          const heightGrid = new Float32Array(heightBuffer)
          if (heightGrid.length !== 2048 * 2048) {
            texture.dispose()
            throw new Error('Unexpected LOLA height-grid dimensions')
          }

          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
          texture.generateMipmaps = true
          texture.minFilter = THREE.LinearMipmapLinearFilter
          texture.magFilter = THREE.LinearFilter

          terrainTexture = texture
          // Replace the 70°S–90°S sphere cap with the same WAC polar mosaic
          // used by MoonMap. LOLA elevation displaces the surface inside 75°S.
          const clippedSphereGeometry = sphereGeom.clone()
          removeSouthPolarCap(clippedSphereGeometry, -70)
          moonMesh.geometry = clippedSphereGeometry
          activeSphereGeometry.dispose()
          activeSphereGeometry = clippedSphereGeometry

          terrainGeometry = createPolarTerrainGeometry(heightGrid, GLOBE_RADIUS)
          // WAC is an optical/reflectance image with its own lunar illumination
          // and shadow contrast already baked in. Keep that contrast while the
          // same continuous surface carries LOLA displacement inside 75°S.
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.015,
          })
          terrainMesh = new THREE.Mesh(terrainGeometry, material)
          terrainMesh.renderOrder = 2
          terrainMesh.frustumCulled = false
          scene.add(terrainMesh)
          setTerrainStatus('loaded')
          renderer.render(scene, camera)
        })
        .catch((error) => {
          if (sceneDisposed) return
          console.warn('Could not load detailed LOLA terrain overlay', error)
          setTerrainStatus('error')
        })
    }

    ensureTerrainDetailRef.current = loadTerrainDetail
    // Always load terrain detail immediately in interactive mode — don't gate on zoom
    if (mode === 'interactive') {
      loadTerrainDetail()
    }

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
        if (event.button !== 0) return
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        raycaster.setFromCamera(mouse, camera)
        const markerHits = raycaster.intersectObjects(markersGroup!.children, true)
        if (markerHits.length > 0) {
          let current: THREE.Object3D | null = markerHits[0].object
          while (current && !current.userData.site) current = current.parent
          if (current?.userData.site && onSelectSiteRef.current) {
            onSelectSiteRef.current(current.userData.site)
            return
          }
        }

        const pickSurfaces: THREE.Object3D[] = []
        if (terrainMesh) pickSurfaces.push(terrainMesh)
        pickSurfaces.push(moonMesh)
        const surfaceHits = raycaster.intersectObjects(pickSurfaces, true)
        if (surfaceHits.length > 0) {
          const point = surfaceHits[0].point
          const { lat, lon } = vector3ToLatLon(point)
          onPickCoordsRef.current?.(lat, lon)
        }
      }

      renderer.domElement.addEventListener('click', onPointerDown)

      if (autoRotate && !prefersReducedMotion) {
        onPointerEnter = () => {
          if (controls) controls.autoRotate = false
        }
        onPointerLeave = () => {
          if (controls) controls.autoRotate = true
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
        if (controls) controls.update()
        if (markersGroup && markersGroup.children.length > 0) {
          const camDist = camera.position.length()
          const distanceScale = Math.max(0.35, Math.min(1.0, camDist / 3.9))
          // The globe zoom is projection-based (camera.zoom), so world-space
          // markers otherwise grow on screen by up to 12× and obscure craters.
          // Counter-scale them to keep site pins readable at every zoom level.
          const markerScale = distanceScale / Math.max(1, camera.zoom)
          for (let i = 0; i < markersGroup.children.length; i++) {
            markersGroup.children[i].scale.set(markerScale, markerScale, markerScale)
          }
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      sceneDisposed = true
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      if (onPointerDown) renderer.domElement.removeEventListener('click', onPointerDown)
      if (onPointerEnter) renderer.domElement.removeEventListener('pointerenter', onPointerEnter)
      if (onPointerLeave) renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      if (wheelHandler) renderer.domElement.removeEventListener('wheel', wheelHandler)
      if (touchStartHandler) renderer.domElement.removeEventListener('touchstart', touchStartHandler)
      if (touchMoveHandler) renderer.domElement.removeEventListener('touchmove', touchMoveHandler)
      if (controls) controls.dispose()
      controlsRef.current = null
      cameraRef.current = null
      markersGroupRef.current = null
      ensureTerrainDetailRef.current = null
      renderer.dispose()
      activeSphereGeometry.dispose()
      sphereMat.dispose()
      moonTexture.dispose()
      if (terrainMesh) {
        scene.remove(terrainMesh)
        terrainMesh.geometry.dispose()
        const material = terrainMesh.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material.dispose()
      }
      terrainGeometry?.dispose()
      terrainTexture?.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, [webGLSupported, mode, autoRotate, autoRotateSpeed, prefersReducedMotion, publishCurrentView, restrictToSouthPole])

  useEffect(() => {
    if (mode !== 'interactive') return
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || viewState.origin === 'globe') return

    const centerLat = Math.max(-90, Math.min(-70, viewState.centerLat))
    const centerLon = viewState.centerLon
    const distance = defaultDistanceRef.current
    suppressViewEmitRef.current = true
    camera.position.copy(latLonToVector3(centerLat, centerLon, distance))
    camera.up.copy(polarMapUpVector(centerLat, centerLon))
    camera.zoom = clampLunarZoom(viewState.zoom)
    camera.updateProjectionMatrix()
    camera.lookAt(0, 0, 0)
    controls.target.set(0, 0, 0)
    controls.update()
    suppressViewEmitRef.current = false
    setCurrentView(Math.abs(centerLat + 90) < 0.02 ? 'south_pole' : 'custom')

    if (viewState.zoom >= TERRAIN_TRIGGER_ZOOM) ensureTerrainDetailRef.current?.()
  }, [viewState, mode])

  useEffect(() => {
    if (mode === 'hero' || !selectedSiteId) return
    const target = sitesRef.current.find((site) => site.id === selectedSiteId)
    if (!target || target.lat === null || target.lon === null) return

    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    const dist = defaultDistanceRef.current ||
      computeFittingDistance(GLOBE_RADIUS, camera.fov, camera.aspect, 1.08)
    camera.position.copy(latLonToVector3(target.lat, target.lon, dist))
    camera.up.copy(polarMapUpVector(target.lat, target.lon))
    camera.zoom = clampLunarZoom(viewStateRef.current.zoom)
    camera.updateProjectionMatrix()
    camera.lookAt(0, 0, 0)
    suppressViewEmitRef.current = true
    controls.target.set(0, 0, 0)
    controls.update()
    suppressViewEmitRef.current = false
    setCurrentView(Math.abs(target.lat + 90) < 0.02 ? 'south_pole' : 'custom')
    publishCurrentView()
  }, [selectedSiteId, mode, publishCurrentView])

  useEffect(() => {
    if (mode === 'hero') return
    const group = markersGroupRef.current
    if (!group) return

    while (group.children.length > 0) {
      const object = group.children[0]
      group.remove(object)
      if ((object as THREE.Mesh).geometry) (object as THREE.Mesh).geometry.dispose()
      if ((object as THREE.Mesh).material) {
        const material = (object as THREE.Mesh).material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material.dispose()
      }
    }

    const colorA = 0xe9ad51
    const colorB = 0x638bff
    const colorWhite = 0xffffff
    const colorHighlight = 0x9ab2ff

    const filledDotGeom = new THREE.CircleGeometry(0.032, 24)
    const hollowRingGeom = new THREE.RingGeometry(0.018, 0.038, 24)
    const selectionRingGeom = new THREE.RingGeometry(0.046, 0.062, 24)

    sitesRef.current
      .filter((site) => site.lat !== null && site.lat <= -70 && site.lon !== null)
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

        const position = latLonToVector3(site.lat, site.lon, GLOBE_RADIUS * 1.006)
        const normal = position.clone().normalize()
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          normal
        )

        const markerGroup = new THREE.Group()
        markerGroup.position.copy(position)
        markerGroup.quaternion.copy(quaternion)
        markerGroup.userData = { site }

        const geometry = isRegionCentre ? hollowRingGeom : filledDotGeom
        const material = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          depthTest: true,
        })
        const baseMesh = new THREE.Mesh(geometry, material)
        baseMesh.userData = { site }
        markerGroup.add(baseMesh)

        if (isSelected) {
          const selectedMaterial = new THREE.MeshBasicMaterial({
            color: colorHighlight,
            side: THREE.DoubleSide,
            depthTest: true,
          })
          const selectedMesh = new THREE.Mesh(selectionRingGeom, selectedMaterial)
          selectedMesh.position.z += 0.002
          selectedMesh.userData = { site }
          markerGroup.add(selectedMesh)
        }

        const hitGeom = new THREE.CircleGeometry(0.08, 12)
        const hitMaterial = new THREE.MeshBasicMaterial({
          visible: false,
          side: THREE.DoubleSide,
        })
        const hitMesh = new THREE.Mesh(hitGeom, hitMaterial)
        hitMesh.userData = { site }
        markerGroup.add(hitMesh)

        group.add(markerGroup)
      })
  }, [selectedSiteId, scenarioAId, scenarioBId, mode])

  if (!webGLSupported) {
    return (
      <div className="p-4 bg-[#18191B] border border-[#363A3F] rounded text-[#EDEEF0] h-full">
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
    <div className="bg-[#18191B] border border-[#363A3F] rounded p-4 flex flex-col gap-3 w-full h-full">
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs min-h-[36px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[#EDEEF0] uppercase tracking-wider">
              3D South Pole Globe
            </span>
            <span className="text-[9px] font-mono text-[#777D86]">
              Drag to rotate · Scroll or pinch to zoom · Linked to flat map
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustZoom(1.35)}
              className="grid w-7 h-7 place-items-center rounded border border-[#363A3F] bg-[#111113] text-[#EDEEF0] hover:border-[#638BFF]"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => adjustZoom(1 / 1.35)}
              className="grid w-7 h-7 place-items-center rounded border border-[#363A3F] bg-[#111113] text-[#EDEEF0] hover:border-[#638BFF]"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={setCameraView}
              className={`px-2.5 py-1.5 rounded text-3xs font-mono font-medium transition-colors cursor-pointer ${
                currentView === 'south_pole'
                  ? 'bg-[#638BFF]/15 text-[#A8BDFF] border border-[#638BFF]/50'
                  : 'bg-[#111113] text-[#AFB3BA] hover:text-[#EDEEF0] border border-[#363A3F]'
              }`}
            >
              Reset South Pole
            </button>
          </div>
        </div>
      )}

      <div className="relative w-full flex-1 min-h-0">
        <div
          ref={mountRef}
          id="globe-canvas-container"
          className={`w-full ${heightClass} bg-[#111113] border border-[#363A3F] rounded overflow-hidden relative cursor-grab active:cursor-grabbing select-none`}
          tabIndex={0}
          aria-label="3D Interactive Lunar Globe. Drag to rotate, scroll or pinch to zoom."
        />
        <div className="absolute left-3 bottom-3 pointer-events-none rounded border border-[#363A3F] bg-[#111113]/90 px-2 py-1 text-[9px] font-mono text-[#AFB3BA]">
          {terrainStatus === 'loaded'
            ? 'LROC WAC imagery · LOLA DEM-derived relief · 70°S–90°S'
            : terrainStatus === 'loading'
              ? 'Loading LROC WAC + LOLA polar terrain…'
              : terrainStatus === 'error'
                ? 'Polar terrain unavailable · global texture active'
                : 'Loading LROC WAC polar imagery…'}
        </div>
      </div>

      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-3xs font-mono text-[#AFB3BA] min-h-[18px]">
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
          <div>Click pin or terrain to inspect coordinates</div>
        </div>
      )}
    </div>
  )
}