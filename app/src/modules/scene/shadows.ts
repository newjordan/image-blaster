export const MAX_SHADOW_CATCHER_OPACITY = 0.8

export function shadowCatcherOpacity(sunIntensity: number) {
  return Math.min(Math.max(sunIntensity, 0), 1) * MAX_SHADOW_CATCHER_OPACITY
}
