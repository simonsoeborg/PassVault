// One-way import from KeePass 2 (KDBX 3.1 and 4). Groups become folders; the
// field-level rules live in mapping.ts so .kdbx and .kdb behave identically.

import { argon2d, argon2id } from 'hash-wasm'
import * as kdbxweb from 'kdbxweb'
import type { EntrySnapshot, StoredEntry, StoredFolder } from '../../shared/types'
import { ImportError } from './errors'
import { clip, isEmptyEntry, mapEntry, type ImportOptions, type ImportResult, type RawEntry, type RawField, type RawFile } from './mapping'

const STANDARD = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes'])

let argon2Registered = false

export function registerArgon2(): void {
  if (argon2Registered) return
  kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
    if (version !== 0x13) {
      throw new ImportError('UNSUPPORTED', 'This database uses Argon2 version 1.0. Re-save it in KeePassXC or KeePass first.')
    }
    const derive = type === 2 ? argon2id : argon2d
    // kdbxweb passes memory in KiB, which is what hash-wasm expects.
    const out = await derive({
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      memorySize: memory,
      iterations,
      parallelism,
      hashLength: length,
      outputType: 'binary',
    })
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
  })
  argon2Registered = true
}

type Field = kdbxweb.KdbxEntryField | undefined

const text = (field: Field): string => (field === undefined ? '' : typeof field === 'string' ? field : field.getText())

function toRaw(entry: kdbxweb.KdbxEntry): RawEntry {
  const f = entry.fields
  const extra: RawField[] = []
  for (const [label, value] of f) {
    if (STANDARD.has(label)) continue
    extra.push({ label, value: text(value), secret: typeof value !== 'string' })
  }
  const files: RawFile[] = []
  for (const [name, binary] of entry.binaries) {
    const value = 'hash' in binary ? binary.value : binary
    const bytes = value instanceof kdbxweb.ProtectedValue ? value.getBinary() : new Uint8Array(value as ArrayBuffer)
    files.push({ name, bytes })
  }
  return {
    title: text(f.get('Title')),
    username: text(f.get('UserName')),
    password: text(f.get('Password')),
    url: text(f.get('URL')),
    notes: text(f.get('Notes')),
    tags: entry.tags ?? [],
    extra,
    files,
  }
}

export async function importKdbx(options: ImportOptions): Promise<ImportResult> {
  registerArgon2()
  const { file, password, keyFile, rootFolderId, now, newId } = options

  let db: kdbxweb.Kdbx
  try {
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyFile ? keyFile.slice() : null)
    await credentials.ready
    db = await kdbxweb.Kdbx.load(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, credentials)
  } catch (error) {
    if (error instanceof ImportError) throw error
    if (error instanceof kdbxweb.KdbxError) {
      if (error.code === kdbxweb.Consts.ErrorCodes.InvalidKey) {
        throw new ImportError('WRONG_PASSWORD', 'That password or key file does not open this KeePass database.')
      }
      if (error.code === kdbxweb.Consts.ErrorCodes.InvalidVersion || error.code === kdbxweb.Consts.ErrorCodes.Unsupported) {
        throw new ImportError('UNSUPPORTED', 'This KeePass database uses a format PassVault cannot read.')
      }
      if (error.code === kdbxweb.Consts.ErrorCodes.BadSignature) {
        throw new ImportError('NOT_A_DATABASE', 'This file is not a KeePass database.')
      }
    }
    throw new ImportError('CORRUPT', 'The KeePass database could not be read. It may be damaged.')
  }

  const folders: StoredFolder[] = []
  const entries: StoredEntry[] = []
  const report = { folders: 0, entries: 0, ssh: 0, totp: 0, skipped: 0, attachmentsSkipped: 0 }
  const recycleBin = db.meta.recycleBinUuid?.id

  const convert = (entry: kdbxweb.KdbxEntry, folderId: string, trashed: boolean) => {
    const data = mapEntry(toRaw(entry), newId)
    report.attachmentsSkipped += data.droppedFiles
    if (isEmptyEntry(data)) {
      report.skipped++
      return
    }
    const created = entry.times.creationTime?.getTime() ?? now
    const updated = entry.times.lastModTime?.getTime() ?? created
    const history: EntrySnapshot[] = entry.history.slice(-10).map((old) => {
      const snap = mapEntry(toRaw(old), newId)
      return {
        title: snap.title,
        fields: snap.fields,
        custom: snap.custom,
        notes: snap.notes,
        tags: snap.tags,
        updatedAt: old.times.lastModTime?.getTime() ?? created,
      }
    })
    entries.push({
      id: newId(),
      type: data.type,
      title: data.title,
      folderId,
      tags: data.tags,
      favorite: false,
      fields: data.fields,
      custom: data.custom,
      notes: data.notes,
      createdAt: created,
      updatedAt: Math.max(updated, created),
      trashedAt: trashed ? now : null,
      history,
    })
    report.entries++
    if (data.type === 'ssh') report.ssh++
    if (data.hasTotp) report.totp++
  }

  const walk = (group: kdbxweb.KdbxGroup, folderId: string, trashed: boolean) => {
    for (const entry of group.entries) convert(entry, folderId, trashed)
    for (const child of group.groups) {
      if (trashed || child.uuid.id === recycleBin) {
        walk(child, rootFolderId, true)
        continue
      }
      const folder: StoredFolder = { id: newId(), name: clip(child.name || 'Group', 200), parentId: folderId, createdAt: now, updatedAt: now }
      folders.push(folder)
      report.folders++
      walk(child, folder.id, false)
    }
  }
  walk(db.getDefaultGroup(), rootFolderId, false)

  return { folders, entries, report }
}
