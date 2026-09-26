import type { EntryType } from '../../../shared/types'

export interface TypeMeta {
  label: string
  plural: string
  /** The denomination word printed in the type's ink. */
  mark: string
  newLabel: string
}

export const TYPE_META: Record<EntryType, TypeMeta> = {
  login: { label: 'Login', plural: 'Logins', mark: 'LOGIN', newLabel: 'Login' },
  ssh: { label: 'SSH host', plural: 'SSH hosts', mark: 'SSH', newLabel: 'SSH host' },
  apiKey: { label: 'API key', plural: 'API keys', mark: 'API', newLabel: 'API key' },
  note: { label: 'Secure note', plural: 'Secure notes', mark: 'NOTE', newLabel: 'Secure note' },
  card: { label: 'Card', plural: 'Cards', mark: 'CARD', newLabel: 'Card' },
  identity: { label: 'Identity', plural: 'Identities', mark: 'ID', newLabel: 'Identity' },
}

export const TYPE_ORDER: EntryType[] = ['login', 'ssh', 'apiKey', 'note', 'card', 'identity']

export type FieldKind = 'text' | 'mono' | 'multiline' | 'url' | 'email' | 'tel' | 'date' | 'port' | 'expiry' | 'select' | 'segmented' | 'totp' | 'secret' | 'cardNumber'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  secret?: boolean
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  generator?: boolean
  /** Only shown when this returns true for the current field values. */
  when?: (fields: Record<string, string>, secrets: Record<string, boolean>) => boolean
  /** Digits rendered in fixed cells (ports, card numbers). */
  cells?: boolean
}

export function sshAuth(fields: Record<string, string>, secrets: Record<string, boolean>): string {
  if (fields.auth) return fields.auth
  if (secrets.privateKey) return 'key'
  if (secrets.password) return 'password'
  return 'key'
}

export const FIELD_DEFS: Record<EntryType, FieldDef[]> = {
  login: [
    { key: 'username', label: 'Username', kind: 'mono', placeholder: 'name@example.com' },
    { key: 'password', label: 'Password', kind: 'secret', secret: true, generator: true },
    { key: 'url', label: 'Website', kind: 'url', placeholder: 'https://example.com' },
    { key: 'totp', label: 'One-time code', kind: 'totp', secret: true, placeholder: 'otpauth:// link or setup key' },
  ],
  ssh: [
    { key: 'host', label: 'Host', kind: 'mono', placeholder: 'db.example.com or 10.0.4.12' },
    { key: 'port', label: 'Port', kind: 'port', placeholder: '22', cells: true },
    { key: 'username', label: 'User', kind: 'mono', placeholder: 'deploy' },
    {
      key: 'auth',
      label: 'Sign in with',
      kind: 'segmented',
      options: [
        { value: 'key', label: 'Private key' },
        { value: 'password', label: 'Password' },
        { value: 'agent', label: 'Agent only' },
      ],
    },
    { key: 'privateKey', label: 'Private key', kind: 'multiline', secret: true, placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----', when: (f, s) => sshAuth(f, s) === 'key' },
    { key: 'keyPassphrase', label: 'Key passphrase', kind: 'secret', secret: true, when: (f, s) => sshAuth(f, s) === 'key' },
    { key: 'password', label: 'Password', kind: 'secret', secret: true, generator: true, when: (f, s) => sshAuth(f, s) === 'password' },
    { key: 'jumpHost', label: 'Jump host', kind: 'mono', placeholder: 'ops@bastion.example.com:22' },
  ],
  apiKey: [
    { key: 'keyId', label: 'Key ID', kind: 'mono', placeholder: 'Public key or client ID' },
    { key: 'secret', label: 'Secret', kind: 'secret', secret: true, generator: true },
    {
      key: 'environment',
      label: 'Environment',
      kind: 'segmented',
      options: [
        { value: 'production', label: 'Production' },
        { value: 'staging', label: 'Staging' },
        { value: 'development', label: 'Development' },
        { value: 'other', label: 'Other' },
      ],
    },
    { key: 'endpoint', label: 'Endpoint', kind: 'url', placeholder: 'https://api.example.com' },
    { key: 'expiresAt', label: 'Expires', kind: 'date' },
  ],
  note: [{ key: 'body', label: 'Note', kind: 'multiline', secret: true, placeholder: 'Recovery codes, licence keys, runbooks…' }],
  card: [
    { key: 'cardholder', label: 'Cardholder', kind: 'text', placeholder: 'Name on card' },
    { key: 'number', label: 'Number', kind: 'cardNumber', secret: true, placeholder: '0000 0000 0000 0000' },
    { key: 'expiry', label: 'Expires', kind: 'expiry', placeholder: 'MM/YY', cells: true },
    { key: 'cvv', label: 'Security code', kind: 'secret', secret: true, placeholder: '3–4 digits' },
    { key: 'pin', label: 'PIN', kind: 'secret', secret: true },
  ],
  identity: [
    { key: 'fullName', label: 'Name', kind: 'text' },
    { key: 'email', label: 'Email', kind: 'email' },
    { key: 'phone', label: 'Phone', kind: 'tel' },
    { key: 'address', label: 'Address', kind: 'multiline' },
    { key: 'birthDate', label: 'Born', kind: 'date' },
    {
      key: 'documentType',
      label: 'Document',
      kind: 'select',
      options: [
        { value: '', label: 'None' },
        { value: 'Passport', label: 'Passport' },
        { value: 'ID card', label: 'ID card' },
        { value: "Driver's licence", label: "Driver's licence" },
        { value: 'Other', label: 'Other' },
      ],
    },
    { key: 'documentNumber', label: 'Document no.', kind: 'secret', secret: true },
    { key: 'issuer', label: 'Issued by', kind: 'text', placeholder: 'Country or authority' },
    { key: 'documentExpiry', label: 'Valid until', kind: 'date' },
  ],
}

export interface PrimaryAction {
  label: string
  kind: 'copy' | 'connect' | 'reveal' | 'edit'
  field?: string
}

export function primaryAction(type: EntryType, secrets: Record<string, boolean>, fields: Record<string, string>): PrimaryAction {
  switch (type) {
    case 'login':
      if (secrets.password) return { label: 'Copy password', kind: 'copy', field: 'password' }
      if (fields.username) return { label: 'Copy username', kind: 'copy', field: 'username' }
      return { label: 'Edit', kind: 'edit' }
    case 'ssh':
      return { label: 'Connect', kind: 'connect' }
    case 'apiKey':
      return secrets.secret ? { label: 'Copy secret', kind: 'copy', field: 'secret' } : { label: 'Edit', kind: 'edit' }
    case 'note':
      return secrets.body ? { label: 'Copy note', kind: 'copy', field: 'body' } : { label: 'Edit', kind: 'edit' }
    case 'card':
      return secrets.number ? { label: 'Copy number', kind: 'copy', field: 'number' } : { label: 'Edit', kind: 'edit' }
    case 'identity':
      return secrets.documentNumber ? { label: 'Copy document no.', kind: 'copy', field: 'documentNumber' } : { label: 'Edit', kind: 'edit' }
  }
}
