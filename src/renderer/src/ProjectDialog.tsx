import { useEffect, useRef, useState } from 'react'
import type { ProjectEntry, WorkspaceInfo } from '../../shared/contracts'

function folderOptions(entries: ProjectEntry[], prefix = ''): { path: string; label: string }[] {
  return entries.flatMap(item => {
    if (item.kind !== 'folder') return []
    const label = prefix + item.name
    return [{ path: item.path, label }, ...folderOptions(item.children || [], label + ' / ')]
  })
}

export function ProjectDialog({ kind, workspace, onCreate, onClose }: {
  kind: 'folder' | 'file'; workspace: WorkspaceInfo; onCreate(directory: string, name: string): Promise<void>; onClose(): void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [directory, setDirectory] = useState(workspace.root)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="workspace-dialog" aria-labelledby="create-heading" onCancel={e => busy ? e.preventDefault() : onClose()}>
    <form onSubmit={async e => {
      e.preventDefault()
      if (busy) return
      setBusy(true)
      try { await onCreate(directory, name.trim()); onClose() }
      catch (err) { setError(String(err)); setBusy(false) }
    }}>
      <h2 id="create-heading">{kind === 'folder' ? 'Nova pasta' : 'Novo desenho'}</h2>
      <label>Nome<input autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label>
      <label>Criar em<select value={directory} onChange={e => setDirectory(e.target.value)}>
        <option value={workspace.root}>{workspace.root.split(/[\\/]/).at(-1)} (raiz)</option>
        {folderOptions(workspace.entries).map(folder => <option key={folder.path} value={folder.path}>{folder.label}</option>)}
      </select></label>
      {error && <p role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="button primary" disabled={busy || !name.trim()}>Criar</button></div>
    </form>
  </dialog>
}
