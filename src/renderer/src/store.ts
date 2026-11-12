import { create } from 'zustand'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export interface Scene {
  elements: readonly ExcalidrawElement[]
  appState: Partial<AppState>
  files: BinaryFiles
}
export interface ProjectTab {
  id: string
  title: string
  path?: string
  format?: 'md' | 'txt'
  scene: Scene
  serialized: string
  savedText?: string
  revision: number
  savedRevision: number
  saving: boolean
  error?: string
  savedAt?: number
}
interface State {
  tabs: ProjectTab[]
  activeId: string
  activate(id: string): void
  add(tab: ProjectTab): void
  update(id: string, scene: Scene, serialized: string): void
  patch(id: string, values: Partial<ProjectTab>): void
  remove(id: string): void
}
export const useProjects = create<State>((set) => ({
  tabs: [], activeId: '',
  activate: activeId => set({ activeId }),
  add: tab => set(state => ({ tabs: [...state.tabs, tab], activeId: tab.id })),
  update: (id, scene, serialized) => set(state => {
    const current = state.tabs.find(tab => tab.id === id)
    if (!current) return state
    const changed = current.serialized !== serialized
    const previous = current.scene.appState
    const next = scene.appState
    if (!changed && previous.scrollX === next.scrollX && previous.scrollY === next.scrollY && previous.zoom?.value === next.zoom?.value) return state
    return { tabs: state.tabs.map(tab => tab.id === id ? {
      ...tab, scene, serialized, revision: tab.revision + Number(changed)
    } : tab) }
  }),
  patch: (id, values) => set(state => ({ tabs: state.tabs.map(tab => tab.id === id ? { ...tab, ...values } : tab) })),
  remove: id => set(state => {
    const index = state.tabs.findIndex(tab => tab.id === id)
    const tabs = state.tabs.filter(tab => tab.id !== id)
    return { tabs, activeId: state.activeId === id ? (tabs[Math.min(index, tabs.length - 1)]?.id || '') : state.activeId }
  })
}))
