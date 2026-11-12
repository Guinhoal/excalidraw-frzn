import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectEntry } from '../shared/contracts'

export function safeTitle(title: string): string {
  const name = title.replace(/\.excalidraw$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 100)
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
export async function createProject(root: string, title: string, content: string): Promise<string> {
  const base = safeTitle(title)
  for (let index = 0; index < 10000; index++) {
    const target = path.join(root, `${base}${index ? ` (${index + 1})` : ''}.excalidraw`)
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
    } else if (item.isFile() && /\.excalidraw$/i.test(item.name)) {
      result.push({ name: item.name, path: fullPath, kind: 'file' })
    }
  }
  return result.sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name))
}

export async function authorizeWorkspaceFile(root: string, requested: string): Promise<string> {
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(requested)])
  const relative = path.relative(realRoot, realFile)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !/\.excalidraw$/i.test(realFile)) {
    throw new Error('O arquivo não pertence à pasta de projetos autorizada.')
  }
  return realFile
}
