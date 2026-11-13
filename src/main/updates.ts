import type { UpdateStatus } from '../shared/contracts'

const repository = 'Guinhoal/excalidraw-frzn'
const api = `https://api.github.com/repos/${repository}`

interface Release {
  tag_name: string
  assets: { name: string; state: string }[]
}

export function availableUpdate(installed: number, release: Release): UpdateStatus {
  const builds = release.assets.flatMap(asset => {
    const match = /^Excalidraw-FRZN-build-(\d+)\.exe$/.exec(asset.name)
    return asset.state === 'uploaded' && match ? [Number(match[1])] : []
  })
  if (!builds.length) return { state: 'unavailable', message: 'A última release ainda não tem instalador Windows compatível.' }
  const build = Math.max(...builds)
  if (build <= installed) return { state: 'current', build: installed }
  return { state: 'available', build, url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}` }
}

export async function checkUpdate(installed: number, request = fetch): Promise<UpdateStatus> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'Excalidraw-FRZN' }
  if (process.env.FRZN_UPDATE_TOKEN) headers.Authorization = `Bearer ${process.env.FRZN_UPDATE_TOKEN}`
  const options = { headers, signal: AbortSignal.timeout(12000) }
  try {
    const response = await request(`${api}/releases/latest`, options)
    if (response.ok) return availableUpdate(installed, await response.json() as Release)
    if (response.status === 404) {
      const repo = await request(api, options)
      return { state: 'unavailable', message: repo.ok ? 'Aguardando a primeira release estável no GitHub.' : 'Não foi possível acessar o repositório de atualizações.' }
    }
    const message = response.status === 401 ? 'Credencial do GitHub inválida.' :
      response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' ? 'Limite de consultas do GitHub atingido. Tente mais tarde.' :
      `Consulta indisponível (GitHub HTTP ${response.status}).`
    return { state: 'unavailable', message }
  } catch {
    return { state: 'unavailable', message: 'Sem resposta do GitHub. Verifique a conexão e tente novamente.' }
  }
}
