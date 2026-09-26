// Loads a private key into the running ssh-agent for a limited time. The key is
// handed to `ssh-add -t <seconds> -` over stdin, so it never touches the disk.

import { join } from 'node:path'
import sshpk from 'sshpk'
import { findExecutable, run } from '../exec'

function sshAdd(): string | null {
  const extra = process.platform === 'win32' ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'OpenSSH')] : ['/usr/bin']
  return findExecutable('ssh-add', extra)
}

export async function addKeyToAgent(privateKey: string, passphrase: string | undefined, lifetimeMinutes: number): Promise<void> {
  const binary = sshAdd()
  if (!binary) throw new Error('ssh-add was not found. Install OpenSSH to load keys into an agent.')

  let key: sshpk.PrivateKey
  try {
    key = sshpk.parsePrivateKey(privateKey, 'auto', passphrase ? { passphrase } : undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/encrypted|passphrase/i.test(message)) {
      throw new Error(passphrase ? 'The key passphrase is wrong.' : 'This key is encrypted. Add its passphrase to the entry.')
    }
    throw new Error('The private key could not be read. PassVault accepts OpenSSH and PEM keys.')
  }

  const minutes = Math.min(1440, Math.max(1, Math.round(lifetimeMinutes)))
  const material = Buffer.from(key.toString('openssh'), 'utf8')
  try {
    const result = await run(binary, ['-t', String(minutes * 60), '-'], { input: material, timeoutMs: 20_000 })
    if (result.code === 0) return
    const output = `${result.stderr}${result.stdout}`
    if (/Could not open a connection|Error connecting to agent|agent refused|communication with agent failed/i.test(output)) {
      throw new Error('No SSH agent is running. Start ssh-agent — on Windows, enable the "OpenSSH Authentication Agent" service.')
    }
    throw new Error(output.trim().split('\n')[0] || 'ssh-add could not load the key.')
  } finally {
    material.fill(0)
  }
}
