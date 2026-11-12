export interface HighlightToken { content: string; color?: string }
export function escapeXML(text: string): string {
  return text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!)
}

export function validateCode(code: string): void {
  if (code.length > 60000 || code.split('\n').length > 300) throw new Error('Use até 300 linhas e 60.000 caracteres por bloco.')
}

export function createCodeSvg(tokens: HighlightToken[][], title: string): { svg: string; width: number; height: number } {
  const lines: HighlightToken[][] = []
  // Wrap long lines rather than allocating gigantic image textures.
  for (const source of tokens) {
    let line: HighlightToken[] = []
    let length = 0
    for (const token of source) {
      const characters = [...token.content]
      for (let offset = 0; offset < characters.length;) {
        if (length === 160) { lines.push(line); line = []; length = 0 }
        const size = Math.min(160 - length, characters.length - offset)
        line.push({ content: characters.slice(offset, offset + size).join(''), color: token.color })
        offset += size; length += size
      }
    }
    lines.push(line)
  }
  const width = Math.max(360, Math.max(...lines.map(line => line.reduce((sum, token) => sum + [...token.content].length, 0)), 0) * 8.5 + 80)
  const height = Math.max(120, lines.length * 23 + 88)
  const text = lines.map((line, index) => `<text x="28" y="${84 + index * 23}" xml:space="preserve">${line.map(token => `<tspan fill="${escapeXML(token.color || '#e6edf3')}">${escapeXML(token.content)}</tspan>`).join('')}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="14" fill="#161b22"/><path d="M0 52H${width}" stroke="#30363d"/><circle cx="25" cy="26" r="5" fill="#ff6b6b"/><circle cx="43" cy="26" r="5" fill="#ffd166"/><circle cx="61" cy="26" r="5" fill="#74c69d"/><text x="86" y="31" fill="#9da7b3" font-family="monospace" font-size="12">${escapeXML(title.slice(0, 80))}</text><g font-family="Consolas, monospace" font-size="14">${text}</g></svg>`
  return { svg, width, height }
}
