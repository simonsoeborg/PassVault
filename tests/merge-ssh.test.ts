import { describe, expect, it } from 'vitest'
import { baseHashes, mergeVaults } from '../src/main/vault/merge'
import { applyInput } from '../src/main/vault/model'
import { buildSsh, isSafeSshArg } from '../src/main/ssh/command'
import { fprintdOutcome, helloVerification, parseIntegerOutput } from '../src/main/biometrics/parse'
import type { StoredEntry, VaultData } from '../src/shared/types'

const T0 = 1_700_000_000_000

function entry(id: string, title: string, updatedAt: number, password = 'pw'): StoredEntry {
  return {
    id,
    type: 'login',
    title,
    folderId: null,
    tags: [],
    favorite: false,
    fields: { username: 'simon', password },
    custom: [],
    notes: '',
    createdAt: T0,
    updatedAt,
    trashedAt: null,
    history: [],
  }
}

function vault(entries: StoredEntry[], extra: Partial<VaultData> = {}): VaultData {
  return { schema: 1, name: 'V', nameUpdatedAt: T0, createdAt: T0, folders: [], entries, tombstones: [], ...extra }
}

describe('merge', () => {
  it('adds entries created on another device', () => {
    const local = vault([entry('a', 'A', T0)])
    const remote = vault([entry('a', 'A', T0), entry('b', 'B', T0 + 5)])
    const result = mergeVaults(local, remote, baseHashes(local), T0 + 10)
    expect(result.data.entries.map((e) => e.id).sort()).toEqual(['a', 'b'])
    expect(result.added).toBe(1)
    expect(result.conflicts).toBe(0)
  })

  it('takes a remote edit without calling it a conflict when the local copy is untouched', () => {
    const local = vault([entry('a', 'A', T0)])
    const base = baseHashes(local)
    const remote = vault([entry('a', 'A renamed', T0 + 100)])
    const result = mergeVaults(local, remote, base, T0 + 200)
    expect(result.data.entries[0].title).toBe('A renamed')
    expect(result.updated).toBe(1)
    expect(result.conflicts).toBe(0)
  })

  it('keeps the losing side of a real conflict in history', () => {
    const original = vault([entry('a', 'A', T0)])
    const base = baseHashes(original)
    const local = vault([entry('a', 'A', T0 + 100, 'local-password')])
    const remote = vault([entry('a', 'A', T0 + 200, 'remote-password')])
    const result = mergeVaults(local, remote, base, T0 + 300)
    const merged = result.data.entries[0]
    expect(merged.fields.password).toBe('remote-password')
    expect(merged.history.some((snap) => snap.fields.password === 'local-password')).toBe(true)
    expect(result.conflicts).toBe(1)
  })

  it('honours deletions from another device, but not over a newer edit', () => {
    const local = vault([entry('a', 'A', T0), entry('b', 'B', T0 + 500)])
    const remote = vault([], {
      tombstones: [
        { id: 'a', kind: 'entry', deletedAt: T0 + 100 },
        { id: 'b', kind: 'entry', deletedAt: T0 + 100 },
      ],
    })
    const result = mergeVaults(local, remote, baseHashes(local), T0 + 1000)
    expect(result.data.entries.map((e) => e.id)).toEqual(['b'])
    expect(result.removed).toBe(1)
  })

  it('repairs folder cycles created by two devices', () => {
    const local = vault([], { folders: [{ id: 'x', name: 'X', parentId: 'y', createdAt: T0, updatedAt: T0 + 2 }, { id: 'y', name: 'Y', parentId: null, createdAt: T0, updatedAt: T0 }] })
    const remote = vault([], { folders: [{ id: 'x', name: 'X', parentId: null, createdAt: T0, updatedAt: T0 }, { id: 'y', name: 'Y', parentId: 'x', createdAt: T0, updatedAt: T0 + 3 }] })
    const result = mergeVaults(local, remote, null, T0 + 10)
    const parents = new Map(result.data.folders.map((f) => [f.id, f.parentId]))
    expect(parents.get('x') === 'y' && parents.get('y') === 'x').toBe(false)
  })
})

describe('entry edits', () => {
  it('keeps secret fields the renderer did not send, and records history', () => {
    const existing = entry('a', 'GitHub', T0, 'original-secret')
    const next = applyInput(existing, { type: 'login', title: 'GitHub (work)', folderId: null, tags: [], fields: { username: 'simon' }, custom: [], notes: '' }, T0 + 50)
    expect(next.fields.password).toBe('original-secret')
    expect(next.history).toHaveLength(1)
    expect(next.history[0].title).toBe('GitHub')
  })

  it('does not create history for a no-op save', () => {
    const existing = entry('a', 'GitHub', T0)
    const next = applyInput(existing, { type: 'login', title: 'GitHub', folderId: null, tags: [], fields: { username: 'simon' }, custom: [], notes: '' }, T0 + 50)
    expect(next).toBe(existing)
  })
})

describe('ssh command', () => {
  it('builds arguments and a pasteable command', () => {
    const result = buildSsh({ host: '10.0.4.12', port: '2222', username: 'deploy', jumpHost: 'ops@bastion.example.com:2200' })
    expect(result).toEqual({
      ok: true,
      args: ['-p', '2222', '-J', 'ops@bastion.example.com:2200', '-l', 'deploy', '--', '10.0.4.12'],
      display: 'ssh -p 2222 -J ops@bastion.example.com:2200 deploy@10.0.4.12',
    })
  })

  it('omits the default port', () => {
    const result = buildSsh({ host: 'example.com', port: '22', username: 'root' })
    expect(result.ok && result.display).toBe('ssh root@example.com')
  })

  it('handles IPv6', () => {
    const plain = buildSsh({ host: 'fe80::1', username: 'pi' })
    expect(plain.ok && plain.args).toEqual(['-l', 'pi', '--', 'fe80::1'])
    expect(plain.ok && plain.display).toBe('ssh -l pi fe80::1')
    expect(buildSsh({ host: '[2001:db8::1]' }).ok).toBe(true)
    expect(buildSsh({ host: 'fe80::1%en0' }).ok).toBe(false)
    expect(buildSsh({ host: 'a', jumpHost: '[2001:db8::1]:22' }).ok).toBe(true)
  })

  it.each([
    [{ host: '-oProxyCommand=evil' }],
    [{ host: 'a;rm -rf /' }],
    [{ host: 'host name' }],
    [{ host: '$(whoami)' }],
    [{ host: 'example.com', username: 'root@x' }],
    [{ host: 'example.com', username: '-oFoo' }],
    [{ host: 'example.com', port: '0' }],
    [{ host: 'example.com', port: '65536' }],
    [{ host: 'example.com', port: '22 ' + 'x' }],
    [{ host: 'example.com', port: '+22' }],
    [{ host: 'example.com', port: '022' }],
    [{ host: 'example.com', jumpHost: 'a;b' }],
    [{ host: 'example.com', jumpHost: '-oProxyCommand=x' }],
    [{ host: 'example.com', jumpHost: 'a,b,c,d' }],
    [{ host: 'example.com"; do shell script "x' }],
  ])('rejects unsafe input %j', (target) => {
    expect(buildSsh(target).ok).toBe(false)
  })

  it('only ever emits launch-safe arguments', () => {
    const result = buildSsh({ host: '10.0.0.1', port: '2200', username: 'a.b-c', jumpHost: 'x@[::1]:22,y' })
    expect(result.ok && result.args.every(isSafeSshArg)).toBe(true)
    expect(isSafeSshArg('a b')).toBe(false)
    expect(isSafeSshArg('"')).toBe(false)
  })
})

describe('biometric bridges', () => {
  it('maps Windows Hello results', () => {
    expect(helloVerification(0)).toBe('verified')
    expect(helloVerification(6)).toBe('cancelled')
    expect(helloVerification(5)).toBe('failed')
    expect(parseIntegerOutput('\r\n0\r\n')).toBe(0)
  })

  it('maps fprintd output', () => {
    expect(fprintdOutcome('Verify started!\nVerify result: verify-match (done)', false)).toBe('verified')
    expect(fprintdOutcome('Verify result: verify-no-match (done)', false)).toBe('failed')
    expect(fprintdOutcome('', true)).toBe('cancelled')
  })
})
