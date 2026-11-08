import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useThemeStore } from './stores/themeStore'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import ExplorerPage from './pages/ExplorerPage'
import MethodsPage from './pages/MethodsPage'

const GlobeTestPage = lazy(() => import('./pages/GlobeTestPage'))

export default function App() {
  const { dark } = useThemeStore()

  // Sync <html> class so CSS variables and non-Tailwind selectors (Leaflet, etc.) work
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  return (
    <div className={dark ? 'dark' : ''}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/explorer"
          element={
            <Layout>
              <ExplorerPage />
            </Layout>
          }
        />
        <Route
          path="/methods"
          element={
            <Layout>
              <MethodsPage />
            </Layout>
          }
        />
        <Route
          path="/globe-test"
          element={
            <Layout>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-24 text-[#8A8A88]">
                    Loading 3D Lunar Globe...
                  </div>
                }
              >
                <GlobeTestPage />
              </Suspense>
            </Layout>
          }
        />
      </Routes>
    </div>
  )
}
