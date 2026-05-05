import worlds from 'virtual:worlds'
import { ViewerQuality, type World, type WorldEntry } from '../types/world'

export function loadWorlds(): WorldEntry[] {
  return worlds as WorldEntry[]
}

function localWorldAssetUrl(url: string | undefined): string {
  return url?.startsWith('/worlds/') ? url : ''
}

export function getSplatUrl(world: World, quality: ViewerQuality = ViewerQuality.High): string {
  const urls = world.assets.splats.spz_urls
  if (quality === ViewerQuality.Low) {
    return localWorldAssetUrl(urls['500k']) || localWorldAssetUrl(urls['150k']) || localWorldAssetUrl(urls['100k']) || localWorldAssetUrl(urls.full_res)
  }
  return localWorldAssetUrl(urls.full_res) || localWorldAssetUrl(urls['500k']) || localWorldAssetUrl(urls['150k']) || localWorldAssetUrl(urls['100k'])
}
