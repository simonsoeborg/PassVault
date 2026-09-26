import type { ThemePref } from '../../../shared/types'

/**
 * Stamps the chosen rendition on <html>. "System" is resolved here through
 * matchMedia rather than left to prefers-color-scheme, because Electron's
 * nativeTheme.themeSource does not reach the page reliably.
 */
export function applyTheme(pref: ThemePref): () => void {
  const media = window.matchMedia('(prefers-color-scheme: light)')
  const stamp = () => {
    const light = pref === 'light' || (pref === 'system' && media.matches)
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
  }
  stamp()
  if (pref !== 'system') return () => undefined
  media.addEventListener('change', stamp)
  return () => media.removeEventListener('change', stamp)
}
