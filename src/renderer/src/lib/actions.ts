import type { EntrySummary, EntryType, FieldRef } from '../../../shared/types'
import { api, notify } from '../store'

export async function copyField(id: string, ref: FieldRef): Promise<void> {
  const result = await api().entries.copy(id, ref)
  if (!result.ok) notify(result.error.message, 'alert')
}

export async function connectSsh(id: string): Promise<void> {
  const result = await api().ssh.connect(id)
  if (!result.ok) {
    notify(result.error.message, 'alert')
    return
  }
  const parts = [`Opened in ${result.value.terminal}`]
  if (result.value.addedKey) parts.push('key loaded into the SSH agent')
  if (result.value.copiedPassword) parts.push('password copied')
  notify(parts.join(' · '))
}

export async function copySshCommand(id: string): Promise<void> {
  const result = await api().ssh.copyCommand(id)
  if (!result.ok) notify(result.error.message, 'alert')
}

export async function addSshKey(id: string): Promise<void> {
  const result = await api().ssh.addKey(id)
  if (!result.ok) {
    notify(result.error.message, 'alert')
    return
  }
  notify(`Key loaded into the SSH agent for ${result.value.lifetimeMinutes} minutes`)
}

export async function openUrl(url: string): Promise<void> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
  await api().window.openExternal(target)
}

/** What Enter does on a row of this type. */
export function primaryFieldFor(type: EntryType): FieldRef | null {
  switch (type) {
    case 'login':
      return 'password'
    case 'ssh':
      return null
    case 'apiKey':
      return 'secret'
    case 'note':
      return 'body'
    case 'card':
      return 'number'
    case 'identity':
      return 'documentNumber'
  }
}

export async function runPrimary(entry: EntrySummary): Promise<void> {
  if (entry.type === 'ssh') {
    await connectSsh(entry.id)
    return
  }
  const field = primaryFieldFor(entry.type)
  if (field) await copyField(entry.id, field)
}
