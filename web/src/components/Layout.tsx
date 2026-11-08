import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useThemeStore } from '../stores/themeStore'

interface LayoutProps {
  children: ReactNode
}

const navLinks = [
  { path: '/',           label: 'Explorer',   id: 'nav-explorer' },
  { path: '/methods',    label: 'Methods',    id: 'nav-methods'  },
  { path: '/globe-test', label: 'Globe Test', id: 'nav-globe-test' },
]

export default function Layout({ children }: LayoutProps) {
  const { dark, toggle } = useThemeStore()
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-space-900 dark:bg-space-900 text-space-100">
      {/* ── Navigation bar ── */}
      <header className="sticky top-0 z-50 border-b border-space-700 bg-space-900/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link
            to="/"
            id="nav-logo"
            className="flex items-center gap-2 font-semibold text-space-100 hover:text-earth-300 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-earth-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="9" />
              <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
            </svg>
            <span className="text-earth-300">AXON</span>
            <span className="text-space-300 font-light hidden sm:inline">LunarSight</span>
          </Link>

          {/* Nav links */}
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {navLinks.map(({ path, label, id }) => {
              const active = location.pathname === path
              return (
                <Link
                  key={path}
                  to={path}
                  id={id}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-space-700 text-space-100'
                      : 'text-space-300 hover:text-space-100 hover:bg-space-800'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {label}
                </Link>
              )
            })}

            {/* Theme toggle */}
            <button
              id="btn-theme-toggle"
              onClick={toggle}
              className="ml-2 p-2 rounded-lg text-space-300 hover:text-space-100 hover:bg-space-800 transition-colors"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-space-700 px-4 py-3 text-center text-2xs text-space-400">
        AXON LunarSight · NASA Space Apps Challenge 2026 ·{' '}
        <span className="text-sun-500">☀</span> Sun = amber ·{' '}
        <span className="text-earth-500">⊕</span> Earth = cyan ·{' '}
        Geometry is not a link budget or mission recommendation.
      </footer>
    </div>
  )
}
