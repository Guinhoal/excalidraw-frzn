import { extname } from 'node:path'
import { MAX_SCENE_BYTES, validateScene } from '../shared/scene.ts'

export type DocumentFormat = 'excalidraw' | 'md' | 'txt'

export function documentFormat(file: string): DocumentFormat {
  const extension = extname(file).slice(1).toLowerCase()
  if (extension === 'md' || extension === 'txt' || extension === 'excalidraw') return extension
  throw new Error('Escolha um desenho .excalidraw ou uma nota .md ou .txt.')
}

export function sizeLimit(format: DocumentFormat) {
  return format === 'excalidraw' ? MAX_SCENE_BYTES : 4 * 1024 * 1024
}

export function validateDocument(format: DocumentFormat, content: string): void {
  if (format === 'excalidraw') return validateScene(content)
  if (format !== 'md' && format !== 'txt') throw new Error('Formato de arquivo inválido.')
  if (content.includes('\0') || Buffer.byteLength(content, 'utf8') > sizeLimit(format)) {
    throw new Error('Use uma nota de texto UTF-8 de até 4 MB.')
  }
}
