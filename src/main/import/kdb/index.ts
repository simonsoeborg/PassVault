// One-way import from KeePass 1 (.kdb). Groups become folders; the field-level
// rules are the shared ones in ../mapping.ts, so a .kdb entry with an ssh:// URL
// or an attached private key becomes an SSH entry exactly as a .kdbx one does.

import type { StoredEntry, StoredFolder } from '../../../shared/types'
import { ImportError } from '../errors'
import { clip, isEmptyEntry, mapEntry, type ImportOptions, type ImportResult, type RawEntry } from '../mapping'
import {
  compositeKey,
  decryptPayload,
  finalKey,
  keyFileKey,
  parentOf,
  parseHeader,
  parsePayload,
  passwordEncodings,
  type KdbEntry,
} from './format'

/**
 * KeePass 1 keeps its own bookkeeping in entries that look like real ones. They
 * carry no user data, so they are dropped rather than imported. Every part of
 * this test has to match — including the default icon, as KeePassXC requires —
 * so that a real entry someone happened to title "Meta-Info" is still imported.
 */
function isMetaStream(entry: KdbEntry): boolean {
  return (
    entry.title === 'Meta-Info' &&
    entry.username === 'SYSTEM' &&
    entry.url === '$' &&
    entry.binaryName === 'bin-stream' &&
    entry.icon === 0 &&
    entry.notes.length > 0
  )
}

function toRaw(entry: KdbEntry): RawEntry {
  return {
    title: entry.title,
    username: entry.username,
    password: entry.password,
    url: entry.url,
    notes: entry.notes,
    tags: [],
    extra: [],
    files: entry.binaryData && entry.binaryName ? [{ name: entry.binaryName, bytes: entry.binaryData }] : [],
  }
}

export async function importKdb(options: ImportOptions): Promise<ImportResult> {
  const { file, password, keyFile, rootFolderId, now, newId } = options
  const header = parseHeader(file)
  const fileKey = keyFile ? keyFileKey(keyFile) : null

  // KeePass 1 hashed the password in the Windows code page, so try that first.
  let plaintext: Uint8Array | null = null
  for (const passwordBytes of passwordEncodings(password)) {
    const composite = compositeKey(passwordBytes, fileKey)
    plaintext = decryptPayload(file, header, finalKey(composite, header))
    composite.fill(0)
    if (plaintext) break
  }
  if (!plaintext) {
    throw new ImportError(
      'WRONG_PASSWORD',
      'That password or key file does not open this KeePass 1 database. KeePass 1 files cannot tell a wrong password from a damaged file, so if you are certain the password is right, the file may be damaged.',
    )
  }

  const { groups, entries: rawEntries } = parsePayload(plaintext, header)
  plaintext.fill(0)

  const folders: StoredFolder[] = []
  const folderIdByGroupId = new Map<number, string>()
  const idByIndex: string[] = []
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const parentIndex = parentOf(groups, i)
    const id = newId()
    idByIndex[i] = id
    folderIdByGroupId.set(group.groupId, id)
    folders.push({
      id,
      name: clip(group.name || 'Group', 200),
      parentId: parentIndex === null ? rootFolderId : (idByIndex[parentIndex] ?? rootFolderId),
      createdAt: group.createdAt ?? now,
      updatedAt: group.updatedAt ?? group.createdAt ?? now,
    })
  }

  const entries: StoredEntry[] = []
  const report = { folders: folders.length, entries: 0, ssh: 0, totp: 0, skipped: 0, attachmentsSkipped: 0 }

  for (const raw of rawEntries) {
    if (isMetaStream(raw)) continue
    const data = mapEntry(toRaw(raw), newId)
    report.attachmentsSkipped += data.droppedFiles
    if (isEmptyEntry(data)) {
      report.skipped++
      continue
    }
    const created = raw.createdAt ?? now
    const updated = raw.updatedAt ?? created
    entries.push({
      id: newId(),
      type: data.type,
      title: data.title,
      // An entry pointing at a group that is not in the file lands at the top.
      folderId: folderIdByGroupId.get(raw.groupId) ?? rootFolderId,
      tags: data.tags,
      favorite: false,
      fields: data.fields,
      custom: data.custom,
      notes: data.notes,
      createdAt: created,
      updatedAt: Math.max(updated, created),
      trashedAt: null,
      // KeePass 1 has no per-entry history; old copies live in its Backup group.
      history: [],
    })
    report.entries++
    if (data.type === 'ssh') report.ssh++
    if (data.hasTotp) report.totp++
  }

  return { folders, entries, report }
}
