import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectEntry } from '../shared/contracts'

export function safeTitle(title: string): string {
  const name = title.trim().replace(/\.excalidraw$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 100).replace(/[. ]+$/g, '')
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? 'Sem título' : name
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const temporary = `${filePath}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await fs.rename(temporary, filePath)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
  }
}

// A new project never overwrites a file with an existing title.
export async function createProject(root: string, title: string, content: string, extension: 'excalidraw' | 'md' | 'txt' = 'excalidraw'): Promise<string> {
  const base = safeTitle(title.replace(new RegExp('\\.' + extension + '$', 'i'), ''))
  for (let index = 0; index < 10000; index++) {
    const target = path.join(root, `${base}${index ? ` (${index + 1})` : ''}.${extension}`)
    try {
      await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' })
      return target
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('Não foi possível encontrar um nome disponível para o projeto.')
}

export async function readTree(root: string, depth = 0): Promise<ProjectEntry[]> {
  if (depth > 8) return []
  const entries = await fs.readdir(root, { withFileTypes: true })
  const result: ProjectEntry[] = []
  for (const item of entries) {
    if (item.isSymbolicLink() || item.name.startsWith('.')) continue
    const fullPath = path.join(root, item.name)
    if (item.isDirectory()) {
      result.push({ name: item.name, path: fullPath, kind: 'folder', children: await readTree(fullPath, depth + 1).catch(() => []) })
    } else if (item.isFile() && /\.(excalidraw|md|txt)$/i.test(item.name)) {
      result.push({ name: item.name, path: fullPath, kind: 'file' })
    }
  }
  return result.sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name))
}

export async function authorizeWorkspaceFile(root: string, requested: string): Promise<string> {
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(requested)])
  const relative = path.relative(realRoot, realFile)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.')) || !/\.(excalidraw|md|txt)$/i.test(realFile)) {
    throw new Error('O arquivo não pertence à pasta de projetos autorizada.')
  }
  return realFile
}

export async function workspaceDirectory(root: string, requested: string): Promise<string> {
  const [base, folder] = await Promise.all([fs.realpath(root), fs.realpath(requested)])
  const relative = path.relative(base, folder)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !(await fs.stat(folder)).isDirectory()) {
    throw new Error('Escolha uma pasta dentro do espaço de trabalho.')
  }
  return folder
}

export async function createFolder(root: string, parent: string, name: string): Promise<void> {
  const directory = await workspaceDirectory(root, parent)
  const trimmed = name.trim()
  if (!trimmed || trimmed.startsWith('.') || safeTitle(trimmed) !== trimmed) throw new Error('Nome de pasta inválido.')
  if (path.relative(await fs.realpath(root), directory).split(path.sep).filter(Boolean).length >= 8) {
    throw new Error('O limite é de oito níveis de subpastas.')
  }
  try { await fs.mkdir(path.join(directory, trimmed)) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Já existe uma pasta ou arquivo com esse nome.')
    throw error
  }
}
