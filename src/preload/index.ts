import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, OpenedProject } from '../shared/contracts'

const api: DesktopAPI = {
  checkUpdate: () => ipcRenderer.invoke('release:check'),
  createFolder: (parent, name) => ipcRenderer.invoke('workspace:mkdir', parent, name),
  workspace: () => ipcRenderer.invoke('workspace:get'),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  open: path => ipcRenderer.invoke('project:open', path),
  save: input => ipcRenderer.invoke('project:save', input),
  session: () => ipcRenderer.invoke('session:get'),
  saveSession: session => ipcRenderer.invoke('session:save', session),
  onClosing: callback => {
    const listener = async () => {
      try { await callback(); await ipcRenderer.invoke('app:close-ready') }
      catch (error) { await ipcRenderer.invoke('app:close-ready', String(error)) }
    }
    ipcRenderer.on('app:closing', listener)
    return () => { ipcRenderer.removeListener('app:closing', listener) }
  },
  onOpenFiles: callback => {
    const listener = (_event: Electron.IpcRendererEvent, projects: OpenedProject[]) => callback(projects)
    ipcRenderer.on('projects:opened', listener)
    ipcRenderer.send('renderer:ready')
    return () => { ipcRenderer.removeListener('projects:opened', listener) }
  }
}
contextBridge.exposeInMainWorld('desktop', api)
