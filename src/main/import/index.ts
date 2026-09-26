// Which KeePass format a file is, is decided by its bytes rather than its name:
// people rename databases, and a wrong guess would produce a misleading error.

import { ImportError } from './errors'
import { looksLikeKdb } from './kdb/format'
import { importKdb } from './kdb'
import { importKdbx } from './kdbx'
import type { ImportOptions, ImportResult } from './mapping'

export type DatabaseFormat = 'kdbx' | 'kdb'

/** KDBX 2, 3 and 4 all share the first signature with KeePass 1 and differ in the second. */
const SIGNATURE_1 = 0x9aa2d903
const SIGNATURE_2_KDBX = 0xb54bfb67
const SIGNATURE_2_KDBX_ALPHA = 0xb54bfb66

export function detectFormat(file: Uint8Array): DatabaseFormat | null {
  if (looksLikeKdb(file)) return 'kdb'
  if (file.length < 8) return null
  const view = new DataView(file.buffer, file.byteOffset, 8)
  if (view.getUint32(0, true) !== SIGNATURE_1) return null
  const second = view.getUint32(4, true)
  return second === SIGNATURE_2_KDBX || second === SIGNATURE_2_KDBX_ALPHA ? 'kdbx' : null
}

export async function importDatabase(options: ImportOptions): Promise<ImportResult & { format: DatabaseFormat }> {
  const format = detectFormat(options.file)
  if (!format) {
    throw new ImportError('NOT_A_DATABASE', 'This file is not a KeePass database. PassVault reads .kdbx from KeePass 2 and .kdb from KeePass 1.')
  }
  const result = format === 'kdb' ? await importKdb(options) : await importKdbx(options)
  return { ...result, format }
}

export { ImportError } from './errors'
