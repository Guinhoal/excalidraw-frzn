const repository = 'Guinhoal/excalidraw-frzn'

interface Release {
  tag_name: string
  assets: { name: string; state: string }[]
}

export function availableUpdate(installed: number, release: Release) {
  for (const asset of release.assets) {
    const match = /^Excalidraw-FRZN-build-(\d+)\.exe$/.exec(asset.name)
    if (asset.state === 'uploaded' && match && Number(match[1]) > installed) {
      return { build: Number(match[1]), url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}` }
    }
  }
  return null
}

export async function checkUpdate(installed: number) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'Excalidraw-FRZN' }
  if (process.env.FRZN_UPDATE_TOKEN) headers.Authorization = `Bearer ${process.env.FRZN_UPDATE_TOKEN}`
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers, signal: AbortSignal.timeout(8000) })
  if (response.status === 404) throw new Error('Nenhuma versão publicada está acessível no GitHub.')
  if (!response.ok) throw new Error(`Falha ao consultar o GitHub (HTTP ${response.status}).`)
  return availableUpdate(installed, await response.json() as Release)
}
