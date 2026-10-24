import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useThemeStore } from './stores/themeStore'
import Layout from './components/Layout'
import ExplorerPage from './pages/ExplorerPage'
import MethodsPage from './pages/MethodsPage'

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
      <Layout>
        <Routes>
          <Route path="/" element={<ExplorerPage />} />
          <Route path="/methods" element={<MethodsPage />} />
        </Routes>
      </Layout>
    </div>
  )
}
