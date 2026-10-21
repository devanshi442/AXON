import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeStore {
  dark: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      dark: true,   // default to dark mode
      toggle: () => set((state) => ({ dark: !state.dark })),
    }),
    { name: 'lunarsight-theme' }
  )
)
