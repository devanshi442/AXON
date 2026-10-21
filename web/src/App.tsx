import { Routes, Route } from 'react-router-dom'
import { useThemeStore } from './stores/themeStore'
import Layout from './components/Layout'
import ExplorerPage from './pages/ExplorerPage'
import MethodsPage from './pages/MethodsPage'

export default function App() {
  const { dark } = useThemeStore()

  return (
    <div className={dark ? 'dark' : ''}>
      <Layout>
        <Routes>
          <Route path="/" element={<ExplorerPage />} />
          <Route path="/methods" element={<MethodsPage />} />
          {/* Phase 2+ routes will be added here */}
        </Routes>
      </Layout>
    </div>
  )
}
