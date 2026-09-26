// Builds ssh invocations from entry fields. Every value is validated against a
// strict character set so nothing typed into an entry can become an ssh option
// (e.g. a host of "-oProxyCommand=…") or shell syntax once pasted.

export interface SshTarget {
  host: string
  port?: string
  username?: string
  jumpHost?: string
}

export type SshValidation = { ok: true; args: string[]; display: string } | { ok: false; error: string }

const HOSTNAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,252}$/
const IPV6 = /^[0-9A-Fa-f:.]{2,45}$/
const USER = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,63}$/
const PORT = /^[1-9]\d{0,4}$/

interface Host {
  host: string
  v6: boolean
}

function parseHost(raw: string): Host | null {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1)
    return IPV6.test(inner) && inner.split(':').length > 2 ? { host: inner, v6: true } : null
  }
  if (raw.includes(':')) return IPV6.test(raw) && raw.split(':').length > 2 ? { host: raw, v6: true } : null
  return HOSTNAME.test(raw) ? { host: raw, v6: false } : null
}

function validPort(port: string): boolean {
  return PORT.test(port) && Number(port) <= 65535
}

function parseHop(raw: string): string | null {
  let rest = raw
  let user = ''
  const at = raw.indexOf('@')
  if (at !== -1) {
    user = raw.slice(0, at)
    rest = raw.slice(at + 1)
    if (!USER.test(user)) return null
  }
  let hostPart = rest
  let port = ''
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (close === -1) return null
    hostPart = rest.slice(0, close + 1)
    const after = rest.slice(close + 1)
    if (after) {
      if (!after.startsWith(':')) return null
      port = after.slice(1)
    }
  } else if (rest.split(':').length === 2) {
    ;[hostPart, port] = rest.split(':')
  }
  const host = parseHost(hostPart)
  if (!host || (port && !validPort(port))) return null
  const shownHost = host.v6 ? `[${host.host}]` : host.host
  return `${user ? `${user}@` : ''}${shownHost}${port ? `:${port}` : ''}`
}

export function buildSsh(target: SshTarget): SshValidation {
  const rawHost = target.host.trim()
  const port = (target.port ?? '').trim()
  const username = (target.username ?? '').trim()
  const jump = (target.jumpHost ?? '').trim()

  if (!rawHost) return { ok: false, error: 'Add a host to connect.' }
  const host = parseHost(rawHost)
  if (!host) return { ok: false, error: 'The host contains characters ssh would not accept.' }
  if (port && !validPort(port)) return { ok: false, error: 'The port must be a number from 1 to 65535.' }
  if (username && !USER.test(username)) return { ok: false, error: 'The username contains characters ssh would not accept.' }

  let hops: string[] = []
  if (jump) {
    hops = jump.split(',').map((hop) => hop.trim())
    if (hops.length > 3) return { ok: false, error: 'Use at most three jump hosts.' }
    const parsed = hops.map(parseHop)
    if (parsed.some((hop) => hop === null)) return { ok: false, error: 'A jump host is not in user@host:port form.' }
    hops = parsed as string[]
  }

  const args: string[] = []
  const display: string[] = ['ssh']
  if (port && port !== '22') {
    args.push('-p', port)
    display.push('-p', port)
  }
  if (hops.length) {
    args.push('-J', hops.join(','))
    display.push('-J', hops.join(','))
  }
  if (username) args.push('-l', username)
  args.push('--', host.host)

  if (username && !host.v6) display.push(`${username}@${host.host}`)
  else if (username) display.push('-l', username, host.host)
  else display.push(host.host)

  return { ok: true, args, display: display.join(' ') }
}

/** Arguments are re-checked right before launch, so only buildSsh output can reach a terminal. */
export function isSafeSshArg(arg: string): boolean {
  return arg === '--' || /^[A-Za-z0-9.:_@,\-[\]]+$/.test(arg)
}
