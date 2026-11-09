import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'

interface MoonMapProps {
  sites: SelectableSite[]
}

type ProjectionMode = 'equirectangular' | 'polar_stereographic'

export default function MoonMap({ sites }: MoonMapProps) {
  const { scenarioAId, scenarioBId, setScenarioA, setScenarioB } = useScenarioStore()
  const [hoveredSite, setHoveredSite] = useState<SelectableSite | null>(null)
  const [selectedPin, setSelectedPin] = useState<SelectableSite | null>(null)
  const [projection, setProjection] = useState<ProjectionMode>('polar_stereographic')

  // Global Equirectangular:
  // Lon: -180..180 -> X: 0..100%
  // Lat: -90..90   -> Y: 100%..0% (North at top, South at bottom)
  const toEqX = (lon: number) => ((lon + 180) / 360) * 100
  const toEqY = (lat: number) => ((90 - lat) / 180) * 100

  // South Polar Stereographic (lat <= -70°):
  // Center: (50%, 50%) is South Pole (-90°)
  // Range: 90° to 70°S = 20° span mapped to radius R = 42%
  const toPolarCoord = (lat: number, lon: number) => {
    const rFrac = Math.max(0, Math.min(1.0, (lat - (-90.0)) / 20.0))
    const rPct = rFrac * 42.0 // radius in percentage
    const thetaRad = ((lon - 90.0) * Math.PI) / 180.0 // orient 0° Lon up
    const x = 50.0 + rPct * Math.cos(thetaRad)
    const y = 50.0 + rPct * Math.sin(thetaRad)
    return { x, y }
  }

  // Filter sites with valid coordinates
  const mappableSites = sites.filter((s) => s.lat !== null && s.lon !== null)
  const polarSites = mappableSites.filter((s) => s.lat !== null && s.lat <= -70)

  const activePin = selectedPin || hoveredSite

  return (
    <div className="bg-[#0D1014] border border-[#2A2D31] rounded p-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#6FA8C9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
          </svg>
          <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider">
            {projection === 'polar_stereographic' ? 'South Polar Stereographic (70°S–90°S)' : 'Global Lunar Map (Equirectangular)'}
          </h2>
        </div>

        {/* Projection Switcher & Legend */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#050608] p-0.5 rounded border border-[#2A2D31] text-3xs font-medium">
            <button
              onClick={() => setProjection('polar_stereographic')}
              className={`px-2 py-1 rounded transition-colors ${projection === 'polar_stereographic'
                  ? 'bg-[#E0A04A]/20 text-[#E0A04A] font-bold border border-[#E0A04A]/40'
                  : 'text-[#8A8A88] hover:text-[#E4E4E2]'
                }`}
            >
              🏔️ South Pole
            </button>
            <button
              onClick={() => setProjection('equirectangular')}
              className={`px-2 py-1 rounded transition-colors ${projection === 'equirectangular'
                  ? 'bg-[#6FA8C9]/20 text-[#6FA8C9] font-bold border border-[#6FA8C9]/40'
                  : 'text-[#8A8A88] hover:text-[#E4E4E2]'
                }`}
            >
              🌐 Global
            </button>
          </div>

          <div className="flex items-center gap-3 text-3xs">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E0A04A]"></span>
              <span className="text-[#E0A04A]">Scenario A</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6FA8C9]"></span>
              <span className="text-[#6FA8C9]">Scenario B</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map viewport */}
      <div className="relative w-full aspect-[2/1] bg-[#050608] rounded overflow-hidden border border-[#2A2D31] select-none group">
        {projection === 'polar_stereographic' ? (
          /* South Polar Stereographic Canvas */
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 100">
            {/* Range Rings around South Pole (center: 100, 50) */}
            {/* -70° outer boundary (r = 42) */}
            <circle cx="100" cy="50" r="42" fill="#090C10" stroke="#2A2D31" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.8" />
            <text x="100" y="9" fill="#8A8A88" fontSize="3" textAnchor="middle">70°S Outer Limit</text>

            {/* -75° ring (r = 31.5) */}
            <circle cx="100" cy="50" r="31.5" fill="none" stroke="#2A2D31" strokeWidth="0.4" strokeDasharray="1.5,1.5" />
            <text x="100" y="20.5" fill="#6B6F75" fontSize="2.6" textAnchor="middle">75°S</text>

            {/* -80° ring (r = 21) */}
            <circle cx="100" cy="50" r="21" fill="none" stroke="#2A2D31" strokeWidth="0.4" strokeDasharray="1.5,1.5" />
            <text x="100" y="31" fill="#6B6F75" fontSize="2.6" textAnchor="middle">80°S</text>

            {/* -85° ring (r = 10.5) */}
            <circle cx="100" cy="50" r="10.5" fill="none" stroke="#2A2D31" strokeWidth="0.4" strokeDasharray="1,1" />
            <text x="100" y="41" fill="#8A8A88" fontSize="2.4" textAnchor="middle">85°S</text>

            {/* South Pole (center: 100, 50) */}
            <circle cx="100" cy="50" r="1.5" fill="#E0A04A" />
            <line x1="100" y1="8" x2="100" y2="92" stroke="#171B22" strokeWidth="0.4" />
            <line x1="58" y1="50" x2="142" y2="50" stroke="#171B22" strokeWidth="0.4" />

            {/* Major Crater Annotations */}
            <text x="100" y="54" fill="#E0A04A" fontSize="3" fontWeight="bold" textAnchor="middle">Shackleton Rim (90°S)</text>
            <text x="108" y="38" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Malapert Massif (-85.9°)</text>
            <text x="88" y="38" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Mons Mouton (-84.8°)</text>
            <text x="115" y="58" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Nobile Rim (-85.3°)</text>
            <text x="82" y="58" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Haworth (-87.4°)</text>
          </svg>
        ) : (
          /* Global Equirectangular Graticule */
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" viewBox="0 0 360 180" preserveAspectRatio="none">
            {[-60, -30, 0, 30, 60].map((lat) => (
              <line
                key={`lat-${lat}`}
                x1="0"
                y1={90 - lat}
                x2="360"
                y2={90 - lat}
                stroke="#2A2D31"
                strokeDasharray={lat === 0 ? "none" : "2,2"}
                strokeWidth={lat === 0 ? "0.75" : "0.5"}
              />
            ))}
            {[-120, -60, 0, 60, 120].map((lon) => (
              <line
                key={`lon-${lon}`}
                x1={lon + 180}
                y1="0"
                x2={lon + 180}
                y2="180"
                stroke="#2A2D31"
                strokeDasharray={lon === 0 ? "none" : "2,2"}
                strokeWidth={lon === 0 ? "0.75" : "0.5"}
              />
            ))}
            {/* South Pole target band */}
            <rect x="0" y="160" width="360" height="20" fill="#6FA8C9" opacity="0.1" />
            <line x1="0" y1="160" x2="360" y2="160" stroke="#6FA8C9" strokeDasharray="3,3" strokeWidth="0.5" opacity="0.4" />
            <text x="180" y="174" fill="#6FA8C9" fontSize="4.2" fontWeight="bold" textAnchor="middle">
              South Pole Target Band (&lt; -70° Lat)
            </text>
          </svg>
        )}

        {/* Site markers */}
        {(projection === 'polar_stereographic' ? polarSites : mappableSites).map((site) => {
          const isA = site.id === scenarioAId
          const isB = site.id === scenarioBId
          const isBoth = isA && isB

          let pos = { x: 50, y: 50 }
          if (projection === 'polar_stereographic') {
            pos = toPolarCoord(site.lat!, site.lon!)
          } else {
            pos = { x: toEqX(site.lon!), y: toEqY(site.lat!) }
          }

          let markerColor = 'bg-white ring-1 ring-[#8A8A88]'
          if (isBoth) {
            markerColor = 'bg-[#E0A04A] ring-2 ring-[#6FA8C9]'
          } else if (isA) {
            markerColor = 'bg-[#E0A04A] ring-2 border border-white'
          } else if (isB) {
            markerColor = 'bg-[#6FA8C9] ring-2 border border-white'
          } else if (site.kind === 'candidate') {
            markerColor = 'bg-white ring-1 ring-[#B9A58C]'
          }

          return (
            <div
              key={site.id}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform duration-150 hover:scale-125"
              onClick={() => setSelectedPin(site)}
              onMouseEnter={() => setHoveredSite(site)}
              onMouseLeave={() => setHoveredSite(null)}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full ${markerColor} flex items-center justify-center`}
                title={`${site.name} (${site.lat}°, ${site.lon}°)`}
              >
                {site.kind === 'candidate' ? (
                  <div className="w-1.5 h-1.5 bg-[#050608] rounded-full"></div>
                ) : site.coord_kind === 'actual' ? (
                  <div className="w-1 h-1 bg-white rounded-full"></div>
                ) : (
                  <div className="w-1 h-1 border border-white rounded-full"></div>
                )}
              </div>
            </div>
          )
        })}

        {/* Legend Overlay corner */}
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-[#050608]/90 border border-[#2A2D31] rounded text-3xs text-[#8A8A88] font-mono">
          {projection === 'polar_stereographic'
            ? 'South Polar Stereographic · R=1737.4 km · Lat ≤ -70°'
            : 'Planetocentric Lat [-90, +90] | East-Positive Lon [-180, +180]'}
        </div>
      </div>

      {/* Pin Details & Quick Actions */}
      {activePin ? (
        <div className="p-3 bg-[#050608] border border-[#2A2D31] rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#E4E4E2]">{activePin.name}</span>
              {activePin.kind === 'candidate' ? (
                <span className="px-1.5 py-0.5 rounded text-3xs font-medium bg-[#B9A58C]/15 border border-[#B9A58C]/30 text-[#B9A58C] font-mono">
                  Candidate Site
                </span>
              ) : activePin.isMission ? (
                <span className="px-1.5 py-0.5 rounded text-3xs font-medium bg-[#171B22] text-[#8A8A88] font-mono">
                  Mission
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-3xs font-medium bg-[#171B22] text-[#8A8A88] font-mono">
                  Reference Site
                </span>
              )}
              {activePin.coord_kind === 'specific_site' ? (
                <span className="px-1.5 py-0.5 rounded text-3xs bg-[#171B22] border border-[#2A2D31] text-[#E4E4E2] font-mono">
                  Specific Site
                </span>
              ) : activePin.coord_kind === 'actual' ? (
                <span className="px-1.5 py-0.5 rounded text-3xs bg-[#132A1C] border border-[#2A5C3D] text-[#6DBF8B] font-mono">
                  Actual Touchdown
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-3xs bg-[#2A1210] border border-[#7F2318] text-[#E0A04A] font-mono">
                  Region Centre
                </span>
              )}
            </div>
            <div className="text-[#8A8A88] font-mono text-2xs mt-0.5">
              Lat: {activePin.lat}° · Lon: {activePin.lon}° · {activePin.region_type ? activePin.region_type.replace(/_/g, ' ') : 'Surface Site'}
            </div>
            {(activePin.coord_kind === 'region_centre' || activePin.coord_kind === 'planned_region_center') && (
              <div className="mt-1 text-3xs text-[#E0A04A] bg-[#E0A04A]/10 px-2 py-0.5 rounded border border-[#E0A04A]/20 font-mono">
                Region centre; results can differ strongly from the crest or evaluated site.
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScenarioA(activePin.id)}
              className="px-2.5 py-1 rounded bg-[#E0A04A]/15 hover:bg-[#E0A04A]/30 text-[#E0A04A] border border-[#E0A04A]/40 font-medium font-mono transition-colors"
            >
              Set as A
            </button>
            <button
              onClick={() => setScenarioB(activePin.id)}
              className="px-2.5 py-1 rounded bg-[#6FA8C9]/15 hover:bg-[#6FA8C9]/30 text-[#6FA8C9] border border-[#6FA8C9]/40 font-medium font-mono transition-colors"
            >
              Set as B
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2.5 text-center text-3xs text-[#8A8A88]">
          Click or hover on a landing site marker to inspect coordinates or assign to Scenario A or B.
        </div>
      )}
    </div>
  )
}
