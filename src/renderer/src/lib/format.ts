const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(at: number | null, now = Date.now()): string {
  if (!at) return 'never'
  const diff = now - at
  if (diff < 45_000) return 'just now'
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`
  if (diff < 30 * DAY) {
    const days = Math.round(diff / DAY)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  return shortDate(at)
}

export function shortDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KiB`
  return `${(size / 1024 / 1024).toFixed(1)} MiB`
}

export function mebibytes(kib: number): string {
  return `${Math.round(kib / 1024)} MiB`
}

/** Names the sync tool a vault path lives under, so the user sees where their file travels. */
export function locationLabel(path: string): string {
  const p = path.replace(/\\/g, '/')
  if (/Mobile Documents\/com~apple~CloudDocs|\/iCloudDrive\//i.test(p)) return 'iCloud Drive'
  if (/\/CloudStorage\/Dropbox|\/Dropbox\//i.test(p)) return 'Dropbox'
  if (/\/CloudStorage\/OneDrive|\/OneDrive/i.test(p)) return 'OneDrive'
  if (/\/CloudStorage\/GoogleDrive/i.test(p)) return 'Google Drive'
  if (/\/Nextcloud\//i.test(p)) return 'Nextcloud'
  if (/\/Sync\//.test(p)) return 'Syncthing'
  const parts = p.split('/').filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : 'This computer'
}

export function shortenPath(path: string, max = 48): string {
  const home = path.replace(/^\/Users\/[^/]+|^\/home\/[^/]+|^[A-Z]:\\Users\\[^\\]+/i, '~')
  if (home.length <= max) return home
  return `…${home.slice(home.length - max + 1)}`
}

export function modKey(platform: string): string {
  return platform === 'darwin' ? '⌘' : 'Ctrl'
}

export function formatShortcut(accelerator: string, platform: string): string {
  const mac = platform === 'darwin'
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl' || part === 'CmdOrCtrl') return mac ? '⌘' : 'Ctrl'
      if (part === 'Shift') return mac ? '⇧' : 'Shift'
      if (part === 'Alt' || part === 'Option') return mac ? '⌥' : 'Alt'
      if (part === 'Control' || part === 'Ctrl') return mac ? '⌃' : 'Ctrl'
      return part
    })
    .join(mac ? '' : '+')
}
