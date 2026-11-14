import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useThemeStore } from '../stores/themeStore'

interface LayoutProps {
  children: ReactNode
}

const navLinks = [
  { path: '/explorer', label: 'Explorer', id: 'nav-explorer', description: 'Site comparison' },
  { path: '/methods', label: 'Methods', id: 'nav-methods', description: 'Science & validation' },
]

export default function Layout({ children }: LayoutProps) {
  const { dark, toggle } = useThemeStore()
  const location = useLocation()
  const activePage = navLinks.find(({ path }) => location.pathname === path)

  return (
    <div className="axon-shell">
      <aside className="axon-sidebar">
        <Link to="/" id="nav-logo" className="axon-brand" aria-label="AXON LunarSight home">
          <span className="axon-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="10.5" />
              <path d="M3.8 10.2h20.4M3.8 17.8h20.4M14 3.5c4.1 4.7 4.1 16.3 0 21M14 3.5c-4.1 4.7-4.1 16.3 0 21" />
              <path d="M7 6.4c4.4 2.5 9.6 2.5 14 0M7 21.6c4.4-2.5 9.6-2.5 14 0" />
            </svg>
          </span>
          <span className="axon-brand-copy">
            <strong>AXON</strong>
            <small>LUNARSIGHT</small>
          </span>
        </Link>

        <div className="axon-sidebar-rule" />

        <div className="axon-nav-group">
          <div className="axon-nav-label">WORKSPACE</div>
          <nav aria-label="Main navigation" className="axon-nav">
            {navLinks.map(({ path, label, id, description }) => {
              const active = location.pathname === path
              return (
                <Link
                  key={path}
                  to={path}
                  id={id}
                  className={`axon-nav-item ${active ? 'active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="axon-nav-icon" aria-hidden="true">
                    {path === '/explorer' ? (
                      <svg viewBox="0 0 20 20" fill="none">
                        <circle cx="8.5" cy="8.5" r="5.5" />
                        <path d="m12.5 12.5 4 4M8.5 5.7v5.6M5.7 8.5h5.6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" fill="none">
                        <path d="M4 3.5h8l4 4v9H4z" />
                        <path d="M12 3.5v4h4M7 11h6M7 14h6" />
                      </svg>
                    )}
                  </span>
                  <span className="axon-nav-copy">
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  {active && <span className="axon-nav-active-dot" aria-hidden="true" />}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="axon-sidebar-spacer" />

        <div className="axon-sidebar-note">
          <span className="axon-sidebar-note-line" />
          <div>
            <div className="axon-sidebar-note-title">LUNAR OPERATIONS</div>
            <div className="axon-sidebar-note-copy">Terrain-aware site intelligence</div>
          </div>
        </div>
        <div className="axon-sidebar-footer">
          <span className="axon-status-dot" />
          <span>MISSION DATA WORKSPACE</span>
        </div>
      </aside>

      <div className="axon-app-main">
        <header className="axon-topbar">
          <div className="axon-breadcrumb">
            <span>MISSION WORKSPACE</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
            <strong>{activePage?.label ?? 'Overview'}</strong>
          </div>
          <div className="axon-topbar-actions">
            <span className="axon-live-status"><i /> SPICE / LOLA DATA</span>
            <button
              id="btn-theme-toggle"
              type="button"
              onClick={toggle}
              className="axon-theme-toggle"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="10" r="3.2" />
                  <path d="M10 1.8v2M10 16.2v2M18.2 10h-2M3.8 10h-2m14-5.8-1.4 1.4m-8.8 8.8-1.4 1.4m11.6 0-1.4-1.4M5.2 5.2 3.8 3.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M16.9 12.4A7.2 7.2 0 0 1 7.6 3.1a7.3 7.3 0 1 0 9.3 9.3Z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        <main className="axon-page-content">{children}</main>

        <footer className="axon-footer">
          <span>AXON LUNARSIGHT · ARTEMIS SOUTH POLAR ANALYSIS</span>
          <span>LOLA TERRAIN · SPICE EPHEMERIDES · JPL HORIZONS CROSS-CHECKS</span>
        </footer>
      </div>
    </div>
  )
}
