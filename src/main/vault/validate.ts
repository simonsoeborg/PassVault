// Structural validation of decrypted vault data. A vault file can arrive from any
// synced device, so nothing is trusted just because it decrypted.

import { ENTRY_TYPES, type CustomField, type EntrySnapshot, type StoredEntry, type StoredFolder, type Tombstone, type VaultData } from '../../shared/types'

type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

const MAX_STRING = 1_000_000
const MAX_ITEMS = 100_000
const MAX_HISTORY = 20

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown, max = MAX_STRING): value is string => typeof value === 'string' && value.length <= max

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)

function stringRecord(value: unknown): Record<string, string> | null {
  if (!isObject(value)) return null
  const out: Record<string, string> = {}
  for (const [key, field] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key) || !isString(field)) return null
    out[key] = field
  }
  return out
}

function customFields(value: unknown): CustomField[] | null {
  if (!Array.isArray(value) || value.length > 200) return null
  const out: CustomField[] = []
  for (const item of value) {
    if (!isObject(item) || !isId(item.id) || !isString(item.label, 200) || !isString(item.value) || typeof item.secret !== 'boolean') return null
    out.push({ id: item.id, label: item.label, value: item.value, secret: item.secret })
  }
  return out
}

function tags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null
  return value.every((tag) => isString(tag, 80)) ? (value as string[]) : null
}

function snapshot(value: unknown): EntrySnapshot | null {
  if (!isObject(value)) return null
  const fields = stringRecord(value.fields)
  const custom = customFields(value.custom)
  const tagList = tags(value.tags)
  if (!isString(value.title, 1000) || !fields || !custom || !tagList || !isString(value.notes) || !isTime(value.updatedAt)) return null
  return { title: value.title, fields, custom, notes: value.notes, tags: tagList, updatedAt: value.updatedAt }
}

function entry(value: unknown): StoredEntry | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !ENTRY_TYPES.includes(value.type as StoredEntry['type'])) return null
  const fields = stringRecord(value.fields)
  const custom = customFields(value.custom)
  const tagList = tags(value.tags)
  if (!fields || !custom || !tagList) return null
  if (!isString(value.title, 1000) || !isString(value.notes)) return null
  if (!(value.folderId === null || isId(value.folderId))) return null
  if (typeof value.favorite !== 'boolean' || !isTime(value.createdAt) || !isTime(value.updatedAt)) return null
  if (!(value.trashedAt === null || isTime(value.trashedAt))) return null
  if (!Array.isArray(value.history) || value.history.length > MAX_HISTORY) return null
  const history: EntrySnapshot[] = []
  for (const item of value.history) {
    const snap = snapshot(item)
    if (!snap) return null
    history.push(snap)
  }
  return {
    id: value.id,
    type: value.type as StoredEntry['type'],
    title: value.title,
    folderId: value.folderId as string | null,
    tags: tagList,
    favorite: value.favorite,
    fields,
    custom,
    notes: value.notes,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    trashedAt: value.trashedAt as number | null,
    history,
  }
}

function folder(value: unknown): StoredFolder | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !isString(value.name, 200) || !(value.parentId === null || isId(value.parentId))) return null
  if (!isTime(value.createdAt) || !isTime(value.updatedAt)) return null
  return { id: value.id, name: value.name, parentId: value.parentId as string | null, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

function tombstone(value: unknown): Tombstone | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || (value.kind !== 'entry' && value.kind !== 'folder') || !isTime(value.deletedAt)) return null
  return { id: value.id, kind: value.kind, deletedAt: value.deletedAt }
}

function list<T>(value: unknown, parse: (item: unknown) => T | null, label: string): Validation<T[]> {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return { ok: false, error: `${label} is not a list` }
  const out: T[] = []
  for (let i = 0; i < value.length; i++) {
    const parsed = parse(value[i])
    if (!parsed) return { ok: false, error: `${label} item ${i} is malformed` }
    out.push(parsed)
  }
  return { ok: true, value: out }
}

export function validateVaultData(value: unknown): Validation<VaultData> {
  if (!isObject(value)) return { ok: false, error: 'root is not an object' }
  if (value.schema !== 1) return { ok: false, error: 'unknown schema' }
  if (!isString(value.name, 200) || !isTime(value.nameUpdatedAt) || !isTime(value.createdAt)) {
    return { ok: false, error: 'vault metadata is malformed' }
  }
  const folders = list(value.folders, folder, 'folders')
  if (!folders.ok) return folders
  const entries = list(value.entries, entry, 'entries')
  if (!entries.ok) return entries
  const tombstones = list(value.tombstones, tombstone, 'tombstones')
  if (!tombstones.ok) return tombstones

  // Break folder cycles and dangling parents instead of rejecting the whole vault.
  const folderIds = new Set(folders.value.map((f) => f.id))
  const byId = new Map(folders.value.map((f) => [f.id, f]))
  for (const f of folders.value) {
    if (f.parentId && !folderIds.has(f.parentId)) f.parentId = null
    const seen = new Set<string>([f.id])
    let cursor = f.parentId
    while (cursor) {
      if (seen.has(cursor)) {
        f.parentId = null
        break
      }
      seen.add(cursor)
      cursor = byId.get(cursor)?.parentId ?? null
    }
  }
  for (const e of entries.value) {
    if (e.folderId && !folderIds.has(e.folderId)) e.folderId = null
  }

  return {
    ok: true,
    value: {
      schema: 1,
      name: value.name,
      nameUpdatedAt: value.nameUpdatedAt,
      createdAt: value.createdAt,
      folders: folders.value,
      entries: entries.value,
      tombstones: tombstones.value,
    },
  }
}
