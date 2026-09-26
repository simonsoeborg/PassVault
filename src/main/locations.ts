import { app } from 'electron'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SyncLocation } from '../shared/types'

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Folders a vault can live in so the user's own sync tool carries it between machines. */
export function suggestLocations(): SyncLocation[] {
  const home = homedir()
  const found: SyncLocation[] = []
  const add = (kind: SyncLocation['kind'], label: string, path: string | undefined) => {
    if (!path || !isDirectory(path) || found.some((f) => f.path === path)) return
    found.push({ id: `${kind}:${path}`, kind, label, path })
  }

  if (process.platform === 'darwin') {
    add('icloud', 'iCloud Drive', join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'))
    const cloudStorage = join(home, 'Library', 'CloudStorage')
    if (isDirectory(cloudStorage)) {
      for (const name of readdirSync(cloudStorage)) {
        const path = join(cloudStorage, name)
        const suffix = name.includes('-') ? ` (${name.split('-').slice(1).join('-')})` : ''
        if (name.startsWith('Dropbox')) add('dropbox', `Dropbox${suffix}`, path)
        else if (name.startsWith('OneDrive')) add('onedrive', `OneDrive${suffix}`, path)
        else if (name.startsWith('GoogleDrive')) add('googledrive', 'Google Drive', path)
      }
    }
  }

  if (process.platform === 'win32') {
    add('onedrive', 'OneDrive', process.env.OneDriveConsumer)
    add('onedrive', 'OneDrive (Work)', process.env.OneDriveCommercial)
    add('onedrive', 'OneDrive', process.env.OneDrive)
    add('onedrive', 'OneDrive', join(home, 'OneDrive'))
    add('icloud', 'iCloud Drive', join(home, 'iCloudDrive'))
  }

  add('dropbox', 'Dropbox', join(home, 'Dropbox'))
  add('syncthing', 'Syncthing', join(home, 'Sync'))
  add('nextcloud', 'Nextcloud', join(home, 'Nextcloud'))
  add('documents', 'Documents', app.getPath('documents'))
  return found
}
