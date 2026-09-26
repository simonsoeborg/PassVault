// Exercises the real ssh-add / ssh-agent path against a throwaway agent, never the
// developer's own. Skips itself where OpenSSH is not installed, and on Windows.

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addKeyToAgent } from '../src/main/ssh/agent'
import { launchSsh } from '../src/main/ssh/terminal'
import { findExecutable, run } from '../src/main/exec'

const KEYGEN = findExecutable('ssh-keygen')
const AGENT = findExecutable('ssh-agent')
const SSH_ADD = findExecutable('ssh-add')
// Windows' ssh-agent is a system service on a named pipe; `ssh-agent -s` cannot
// start a throwaway one, so this suite only runs where agents are per-process.
const available = Boolean(KEYGEN && AGENT && SSH_ADD) && process.platform !== 'win32'

describe.skipIf(!available)('ssh agent', () => {
  let dir: string
  let agentPid: string | undefined
  let authSock: string | undefined
  let keyText = ''
  const originalSock = process.env.SSH_AUTH_SOCK

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'passvault-agent-'))
    await run(KEYGEN!, ['-q', '-t', 'ed25519', '-N', 'key-passphrase', '-C', 'passvault-test', '-f', join(dir, 'id')], { timeoutMs: 20_000 })
    keyText = await readFile(join(dir, 'id'), 'utf8')

    const started = await run(AGENT!, ['-s'], { timeoutMs: 10_000 })
    authSock = started.stdout.match(/SSH_AUTH_SOCK=([^;]+);/)?.[1]
    agentPid = started.stdout.match(/SSH_AGENT_PID=(\d+);/)?.[1]
    process.env.SSH_AUTH_SOCK = authSock
  }, 40_000)

  afterAll(async () => {
    if (agentPid) spawn('kill', [agentPid], { stdio: 'ignore' }).unref()
    if (originalSock === undefined) delete process.env.SSH_AUTH_SOCK
    else process.env.SSH_AUTH_SOCK = originalSock
    await rm(dir, { recursive: true, force: true })
  })

  it('loads an encrypted key into the agent without writing it to disk', async () => {
    expect(authSock).toBeTruthy()
    await addKeyToAgent(keyText, 'key-passphrase', 5)
    const listed = await run(SSH_ADD!, ['-l'], { timeoutMs: 10_000, env: { ...process.env, SSH_AUTH_SOCK: authSock } })
    expect(listed.stdout).toContain('passvault-test')
  }, 30_000)

  it('reports a wrong passphrase in plain words', async () => {
    await expect(addKeyToAgent(keyText, 'not the passphrase', 5)).rejects.toThrow(/passphrase is wrong/i)
  }, 20_000)

  it('asks for the passphrase rather than failing obscurely when none is stored', async () => {
    await expect(addKeyToAgent(keyText, undefined, 5)).rejects.toThrow(/encrypted|passphrase/i)
  }, 20_000)

  it('explains a missing agent instead of leaking ssh-add output', async () => {
    process.env.SSH_AUTH_SOCK = join(dir, 'no-such-agent.sock')
    try {
      await expect(addKeyToAgent(keyText, 'key-passphrase', 5)).rejects.toThrow(/No SSH agent is running/i)
    } finally {
      process.env.SSH_AUTH_SOCK = authSock
    }
  }, 20_000)
})

describe('terminal launch guard', () => {
  it('refuses arguments that did not come from buildSsh', async () => {
    await expect(launchSsh(['-p', '22; rm -rf /', '--', 'example.com'], 'auto')).rejects.toThrow(/unvalidated/i)
    await expect(launchSsh(['--', 'example.com "; do shell script "x'], 'auto')).rejects.toThrow(/unvalidated/i)
  })
})
