import { createHighlighter, type BundledLanguage } from 'shiki'
import { createCodeSvg, validateCode } from '../../shared/code-svg'

export const languages = ['typescript', 'javascript', 'python', 'json', 'bash', 'sql', 'html', 'css', 'markdown', 'cpp', 'go', 'rust', 'text'] as const
export type CodeLanguage = typeof languages[number]
export interface CodeData { type: 'frzn-code-block'; language: CodeLanguage; rawCode: string; title: string }

let highlighter: ReturnType<typeof createHighlighter> | undefined

export async function renderCode(data: CodeData): Promise<{ svg: string; width: number; height: number }> {
  validateCode(data.rawCode)
  highlighter ??= createHighlighter({ themes: ['github-dark'], langs: languages.filter(lang => lang !== 'text') as BundledLanguage[] })
  const engine = await highlighter
  const result = engine.codeToTokens(data.rawCode.replace(/\t/g, '    '), { lang: data.language, theme: 'github-dark' })
  return createCodeSvg(result.tokens, data.title || data.language)
}

export function isCodeData(value: unknown): value is CodeData {
  if (!value || typeof value !== 'object') return false
  const item = value as CodeData
  return item.type === 'frzn-code-block' && typeof item.rawCode === 'string' && typeof item.title === 'string' && languages.includes(item.language)
}
