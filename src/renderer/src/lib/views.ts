import type { EntrySummary, EntryType, FolderView } from '../../../shared/types'
import { TYPE_META } from './entryTypes'

export type View =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'type'; type: EntryType }
  | { kind: 'folder'; id: string }
  | { kind: 'health' }
  | { kind: 'trash' }

export function viewKey(view: View): string {
  return view.kind === 'type' ? `type:${view.type}` : view.kind === 'folder' ? `folder:${view.id}` : view.kind
}

export function unhealthy(entry: EntrySummary): boolean {
  const h = entry.health
  return h.weak || h.reused || h.expired || h.expiring
}

export function matchesView(entry: EntrySummary, view: View): boolean {
  if (view.kind === 'trash') return entry.trashedAt !== null
  if (entry.trashedAt) return false
  switch (view.kind) {
    case 'all':
      return true
    case 'favorites':
      return entry.favorite
    case 'type':
      return entry.type === view.type
    case 'folder':
      return entry.folderId === view.id
    case 'health':
      return unhealthy(entry)
  }
}

export function viewTitle(view: View, folders: FolderView[]): string {
  switch (view.kind) {
    case 'all':
      return 'All items'
    case 'favorites':
      return 'Favourites'
    case 'type':
      return TYPE_META[view.type].plural
    case 'folder':
      return folders.find((folder) => folder.id === view.id)?.name ?? 'Folder'
    case 'health':
      return 'Health'
    case 'trash':
      return 'Trash'
  }
}
