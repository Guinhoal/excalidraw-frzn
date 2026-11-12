import { loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw'
import type { OpenedProject } from '../../shared/contracts'
import { useProjects, type Scene, type ProjectTab } from './store'

const saving = new Map<string, Promise<boolean>>()
export const filename = (path: string) => path.split(/[\\/]/).at(-1)!.replace(/\.excalidraw$/i, '')

export function serialize(scene: Scene): string {
  return serializeAsJSON(scene.elements, scene.appState, scene.files, 'local')
}

export function newProject(): void {
  const scene: Scene = { elements: [], appState: { viewBackgroundColor: '#faf9f6', gridModeEnabled: false }, files: {} }
  const used = new Set(useProjects.getState().tabs.map(tab => tab.title))
  let index = 1
  while (used.has(`Sem título ${index}`)) index++
  useProjects.getState().add({ id: crypto.randomUUID(), title: `Sem título ${index}`, scene, serialized: serialize(scene), revision: 0, savedRevision: 0, saving: false })
}

export async function openProjects(projects: OpenedProject[]): Promise<void> {
  for (const project of projects) {
    const existing = useProjects.getState().tabs.find(tab => tab.path?.toLowerCase() === project.path.toLowerCase())
    if (existing) { useProjects.getState().activate(existing.id); continue }
    const restored = await loadFromBlob(new Blob([project.content], { type: 'application/json' }), null, null)
    const scene: Scene = { elements: restored.elements, appState: restored.appState || {}, files: restored.files || {} }
    useProjects.getState().add({ id: crypto.randomUUID(), title: filename(project.path), path: project.path, scene, serialized: serialize(scene), revision: 0, savedRevision: 0, saving: false })
  }
}

export function saveProject(id: string, saveAs = false): Promise<boolean> {
  const previous = saving.get(id) || Promise.resolve(true)
  const task = previous.catch(() => false).then(async () => {
    const tab = useProjects.getState().tabs.find(tab => tab.id === id)
    if (!tab) return true
    if (!saveAs && tab.path && tab.revision === tab.savedRevision && !tab.error) return true
    useProjects.getState().patch(id, { saving: true, error: undefined })
    try {
      const path = await window.desktop.save({ path: tab.path, title: tab.title, content: tab.serialized, saveAs })
      if (!path) return false
      useProjects.getState().patch(id, { path, title: filename(path), savedRevision: tab.revision, savedAt: Date.now() })
      return true
    } catch (error) {
      useProjects.getState().patch(id, { error: String(error) })
      throw error
    } finally {
      useProjects.getState().patch(id, { saving: false })
    }
  })
  saving.set(id, task)
  void task.finally(() => { if (saving.get(id) === task) saving.delete(id) }).catch(() => undefined)
  return task
}

export async function persistSession(): Promise<void> {
  const { tabs, activeId } = useProjects.getState()
  await window.desktop.saveSession({ paths: tabs.flatMap(tab => tab.path ? [tab.path] : []), activePath: tabs.find(tab => tab.id === activeId)?.path })
}

export async function flushProjects(): Promise<void> {
  for (const tab of useProjects.getState().tabs) {
    if (tab.revision !== tab.savedRevision || tab.saving || tab.error) await saveProject(tab.id)
  }
  await persistSession()
}

export function isDirty(tab: ProjectTab): boolean { return tab.revision !== tab.savedRevision }
