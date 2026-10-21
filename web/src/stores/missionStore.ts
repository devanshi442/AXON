import { create } from 'zustand'
import type { Mission } from '../types/mission'

interface MissionStore {
  selectedId: string | null
  select: (id: string | null) => void
  missions: Mission[]
  setMissions: (missions: Mission[]) => void
}

export const useMissionStore = create<MissionStore>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  missions: [],
  setMissions: (missions) => set({ missions }),
}))
