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
  scene: Scene
  serialized: string
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
  update: (id, scene, serialized) => set(state => ({ tabs: state.tabs.map(tab => tab.id === id ? {
    ...tab, scene, serialized, revision: tab.revision + Number(tab.serialized !== serialized)
  } : tab) })),
  patch: (id, values) => set(state => ({ tabs: state.tabs.map(tab => tab.id === id ? { ...tab, ...values } : tab) })),
  remove: id => set(state => {
    const index = state.tabs.findIndex(tab => tab.id === id)
    const tabs = state.tabs.filter(tab => tab.id !== id)
    return { tabs, activeId: state.activeId === id ? (tabs[Math.min(index, tabs.length - 1)]?.id || '') : state.activeId }
  })
}))
