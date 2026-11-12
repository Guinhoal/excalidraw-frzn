export interface ProjectEntry {
  name: string
  path: string
  kind: 'folder' | 'file'
  children?: ProjectEntry[]
}
export interface OpenedProject { path: string; content: string }
export interface WorkspaceInfo { root: string; entries: ProjectEntry[] }
export interface Session { paths: string[]; activePath?: string }
export interface DesktopAPI {
  checkUpdate(): Promise<{ build: number; url: string } | null>
  createFolder(parent: string, name: string): Promise<void>
  workspace(): Promise<WorkspaceInfo>
  chooseWorkspace(): Promise<WorkspaceInfo | null>
  open(path?: string): Promise<OpenedProject[]>
  save(input: { path?: string; directory?: string; title: string; content: string; saveAs?: boolean }): Promise<string | null>
  session(): Promise<Session>
  saveSession(session: Session): Promise<void>
  onClosing(callback: () => Promise<void>): () => void
  onOpenFiles(callback: (projects: OpenedProject[]) => void): () => void
}
