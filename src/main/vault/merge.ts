// Merges two copies of the same vault: the one in memory and the one another
// device just wrote to the synced file. Nothing is dropped silently. When both
// sides changed the same entry, the newer edit wins and the other one is kept
// in that entry's history.

import type { EntrySnapshot, StoredEntry, StoredFolder, Tombstone, VaultData } from '../../shared/types'

export const MAX_HISTORY = 20
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000

export interface MergeResult {
  data: VaultData
  added: number
  updated: number
  removed: number
  conflicts: number
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** Identity of an entry's user-visible content, ignoring history. */
export function entryHash(entry: StoredEntry): string {
  const { history: _history, ...content } = entry
  return stable(content)
}

function folderHash(folder: StoredFolder): string {
  return stable(folder)
}

export function snapshotOf(entry: StoredEntry): EntrySnapshot {
  return {
    title: entry.title,
    fields: { ...entry.fields },
    custom: entry.custom.map((field) => ({ ...field })),
    notes: entry.notes,
    tags: [...entry.tags],
    updatedAt: entry.updatedAt,
  }
}

function mergeHistory(...lists: EntrySnapshot[][]): EntrySnapshot[] {
  const seen = new Map<string, EntrySnapshot>()
  for (const snap of lists.flat()) seen.set(stable(snap), snap)
  return [...seen.values()].sort((a, b) => a.updatedAt - b.updatedAt).slice(-MAX_HISTORY)
}

export function baseHashes(data: VaultData): Map<string, string> {
  return new Map(data.entries.map((entry) => [entry.id, entryHash(entry)]))
}

export function mergeVaults(local: VaultData, remote: VaultData, base: Map<string, string> | null, now = Date.now()): MergeResult {
  let added = 0
  let updated = 0
  let removed = 0
  let conflicts = 0

  const tombstones = new Map<string, Tombstone>()
  for (const stone of [...local.tombstones, ...remote.tombstones]) {
    const current = tombstones.get(stone.id)
    if (!current || stone.deletedAt > current.deletedAt) tombstones.set(stone.id, stone)
  }

  // Entries
  const localEntries = new Map(local.entries.map((e) => [e.id, e]))
  const remoteEntries = new Map(remote.entries.map((e) => [e.id, e]))
  const entries: StoredEntry[] = []
  for (const id of new Set([...localEntries.keys(), ...remoteEntries.keys()])) {
    const l = localEntries.get(id)
    const r = remoteEntries.get(id)
    const stone = tombstones.get(id)
    const newest = Math.max(l?.updatedAt ?? 0, r?.updatedAt ?? 0)

    if (stone && newest <= stone.deletedAt) {
      if (l) removed++
      continue
    }
    if (stone) tombstones.delete(id) // edited after deletion elsewhere: keep it

    if (l && !r) {
      entries.push(l)
      continue
    }
    if (r && !l) {
      entries.push(r)
      added++
      continue
    }
    if (!l || !r) continue

    const hl = entryHash(l)
    const hr = entryHash(r)
    if (hl === hr) {
      entries.push({ ...l, history: mergeHistory(l.history, r.history) })
      continue
    }

    const known = base?.get(id)
    const localChanged = known === undefined || hl !== known
    const remoteChanged = known === undefined || hr !== known

    if (!localChanged && remoteChanged) {
      entries.push({ ...r, history: mergeHistory(l.history, r.history) })
      updated++
    } else if (localChanged && !remoteChanged) {
      entries.push({ ...l, history: mergeHistory(l.history, r.history) })
    } else {
      const remoteWins = r.updatedAt > l.updatedAt || (r.updatedAt === l.updatedAt && hr > hl)
      const winner = remoteWins ? r : l
      const loser = remoteWins ? l : r
      entries.push({ ...winner, history: mergeHistory(l.history, r.history, [snapshotOf(loser)]) })
      conflicts++
      if (remoteWins) updated++
    }
  }

  // Folders
  const localFolders = new Map(local.folders.map((f) => [f.id, f]))
  const remoteFolders = new Map(remote.folders.map((f) => [f.id, f]))
  const folders: StoredFolder[] = []
  for (const id of new Set([...localFolders.keys(), ...remoteFolders.keys()])) {
    const l = localFolders.get(id)
    const r = remoteFolders.get(id)
    const stone = tombstones.get(id)
    const newest = Math.max(l?.updatedAt ?? 0, r?.updatedAt ?? 0)
    if (stone && newest <= stone.deletedAt) continue
    if (stone) tombstones.delete(id)
    if (l && r) folders.push(folderHash(l) === folderHash(r) || l.updatedAt >= r.updatedAt ? l : r)
    else folders.push((l ?? r)!)
  }

  const data: VaultData = {
    schema: 1,
    name: remote.nameUpdatedAt > local.nameUpdatedAt ? remote.name : local.name,
    nameUpdatedAt: Math.max(local.nameUpdatedAt, remote.nameUpdatedAt),
    createdAt: Math.min(local.createdAt, remote.createdAt),
    folders,
    entries,
    tombstones: [...tombstones.values()].filter((stone) => now - stone.deletedAt < TOMBSTONE_TTL_MS),
  }
  repairStructure(data)
  return { data, added, updated, removed, conflicts }
}

/** Re-parents orphans and breaks folder cycles that two devices can create together. */
export function repairStructure(data: VaultData): void {
  const byId = new Map(data.folders.map((f) => [f.id, f]))
  for (const folder of data.folders) {
    if (folder.parentId && !byId.has(folder.parentId)) folder.parentId = null
    const seen = new Set([folder.id])
    let cursor = folder.parentId
    while (cursor) {
      if (seen.has(cursor)) {
        folder.parentId = null
        break
      }
      seen.add(cursor)
      cursor = byId.get(cursor)?.parentId ?? null
    }
  }
  for (const entry of data.entries) {
    if (entry.folderId && !byId.has(entry.folderId)) entry.folderId = null
  }
}
