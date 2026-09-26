import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as kdbxweb from 'kdbxweb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importKdbx, registerArgon2 } from '../src/main/import/kdbx'
import { newId } from '../src/main/vault/model'
import { VaultSession, type SessionListener } from '../src/main/vault/session'
import type { SyncStatus } from '../src/shared/types'

function listener() {
  const events = { index: 0, sync: [] as SyncStatus[], keyChanged: 0 }
  const l: SessionListener = {
    indexChanged: () => events.index++,
    entryChanged: () => undefined,
    sync: (status) => events.sync.push(status),
    keyChanged: () => events.keyChanged++,
  }
  return { l, events }
}

const login = (title: string, password: string) => ({
  type: 'login' as const,
  title,
  folderId: null,
  tags: [],
  fields: { username: 'simon', password },
  custom: [],
  notes: '',
})

describe('vault session', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'passvault-test-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates, saves and reopens a vault', async () => {
    const path = join(dir, 'Personal.pvault')
    const a = await VaultSession.create({ path, name: 'Personal', password: 'correct horse battery', preset: 'standard', listener: listener().l, recoveryDir: dir })
    const id = a.createEntry(login('GitHub', 'gh-secret-123'))
    await a.flush()
    await a.close()

    const raw = await readFile(path)
    expect(raw.includes(Buffer.from('gh-secret-123'))).toBe(false)

    const b = await VaultSession.open({ path, password: 'correct horse battery', listener: listener().l, recoveryDir: dir })
    expect(b.readField(id, 'password')).toBe('gh-secret-123')
    expect(b.index().entries[0].title).toBe('GitHub')
    await b.close()
  })

  it('rejects the wrong password', async () => {
    const path = join(dir, 'V.pvault')
    const a = await VaultSession.create({ path, name: 'V', password: 'right password', preset: 'standard', listener: listener().l, recoveryDir: dir })
    await a.close()
    await expect(VaultSession.open({ path, password: 'wrong password', listener: listener().l, recoveryDir: dir })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('merges changes written by another device instead of overwriting them', async () => {
    const path = join(dir, 'Shared.pvault')
    const deviceA = listener()
    const a = await VaultSession.create({ path, name: 'Shared', password: 'shared password', preset: 'standard', listener: deviceA.l, recoveryDir: dir })
    const github = a.createEntry(login('GitHub', 'one'))
    await a.flush()

    const b = await VaultSession.open({ path, password: 'shared password', listener: listener().l, recoveryDir: dir })
    b.createEntry(login('AWS', 'from-device-b'))
    b.updateEntry(github, login('GitHub', 'changed-on-b'))
    await b.flush()

    // Device A edits something else, then saves: its save must absorb B's work first.
    await new Promise((resolve) => setTimeout(resolve, 20))
    a.createEntry(login('Stripe', 'from-device-a'))
    await a.flush()

    const titles = a.index().entries.map((e) => e.title).sort()
    expect(titles).toEqual(['AWS', 'GitHub', 'Stripe'])
    expect(a.readField(github, 'password')).toBe('changed-on-b')
    expect(deviceA.events.sync.some((s) => s.state === 'merged')).toBe(true)

    await a.close()
    await b.close()
    const c = await VaultSession.open({ path, password: 'shared password', listener: listener().l, recoveryDir: dir })
    expect(c.index().entries.map((e) => e.title).sort()).toEqual(['AWS', 'GitHub', 'Stripe'])
    await c.close()
  })

  it('changes the master password and locks out the old one', async () => {
    const path = join(dir, 'Keys.pvault')
    const a = await VaultSession.create({ path, name: 'Keys', password: 'old password', preset: 'standard', listener: listener().l, recoveryDir: dir })
    a.createEntry(login('X', 'y'))
    await a.changeKey('old password', 'new password')
    await a.close()
    await expect(VaultSession.open({ path, password: 'old password', listener: listener().l, recoveryDir: dir })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
    const b = await VaultSession.open({ path, password: 'new password', listener: listener().l, recoveryDir: dir })
    expect(b.index().entries).toHaveLength(1)
    await b.close()
  })
})

describe('KeePass import', () => {
  it('maps groups, logins with TOTP, ssh:// entries and the recycle bin', async () => {
    registerArgon2()
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('demo-pass'))
    const db = kdbxweb.Kdbx.create(credentials, 'Demo')
    db.setKdf(kdbxweb.Consts.KdfId.Argon2id)
    const root = db.getDefaultGroup()
    const servers = db.createGroup(root, 'Servers')
    const prod = db.createGroup(servers, 'Prod')

    const github = db.createEntry(root)
    github.fields.set('Title', 'GitHub')
    github.fields.set('UserName', 'simon')
    github.fields.set('Password', kdbxweb.ProtectedValue.fromString('gh-pass'))
    github.fields.set('URL', 'https://github.com')
    github.fields.set('otp', 'otpauth://totp/GitHub:simon?secret=JBSWY3DPEHPK3PXP&issuer=GitHub')
    github.fields.set('Recovery codes', kdbxweb.ProtectedValue.fromString('aaaa-bbbb'))
    github.tags = ['dev']

    const db1 = db.createEntry(prod)
    db1.fields.set('Title', 'db-primary')
    db1.fields.set('URL', 'ssh://deploy@10.0.4.12:2222')
    db1.fields.set('Password', kdbxweb.ProtectedValue.fromString('ssh-pass'))

    db.createRecycleBin()
    const bin = db.getGroup(db.meta.recycleBinUuid!)!
    const old = db.createEntry(bin)
    old.fields.set('Title', 'Old thing')
    old.fields.set('Password', kdbxweb.ProtectedValue.fromString('old'))

    const bytes = new Uint8Array(await db.save())
    const result = await importKdbx({ file: bytes, password: 'demo-pass', rootFolderId: 'root', now: 1000, newId })

    expect(result.folders.map((f) => f.name).sort()).toEqual(['Prod', 'Servers'])
    const byTitle = new Map(result.entries.map((e) => [e.title, e]))
    const gh = byTitle.get('GitHub')!
    expect(gh.type).toBe('login')
    expect(gh.fields.totp).toContain('otpauth://totp/')
    expect(gh.custom).toEqual([expect.objectContaining({ label: 'Recovery codes', value: 'aaaa-bbbb', secret: true })])
    expect(gh.tags).toEqual(['dev'])

    const ssh = byTitle.get('db-primary')!
    expect(ssh.type).toBe('ssh')
    expect(ssh.fields).toMatchObject({ host: '10.0.4.12', port: '2222', username: 'deploy', password: 'ssh-pass', auth: 'password' })
    expect(ssh.folderId).toBe(result.folders.find((f) => f.name === 'Prod')!.id)

    expect(byTitle.get('Old thing')!.trashedAt).toBe(1000)
    expect(result.report).toMatchObject({ entries: 3, ssh: 1, totp: 1 })

    await expect(importKdbx({ file: bytes, password: 'nope', rootFolderId: 'root', now: 1000, newId })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('reads an older KDBX 3.1 database too', async () => {
    registerArgon2()
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('legacy-pass'))
    const db = kdbxweb.Kdbx.create(credentials, 'Legacy')
    db.setVersion(3)
    const entry = db.createEntry(db.getDefaultGroup())
    entry.fields.set('Title', 'Old router')
    entry.fields.set('UserName', 'admin')
    entry.fields.set('Password', kdbxweb.ProtectedValue.fromString('legacy-secret'))
    entry.fields.set('TOTP Seed', 'JBSWY3DPEHPK3PXP')
    entry.fields.set('TOTP Settings', '30;6')

    const bytes = new Uint8Array(await db.save())
    const result = await importKdbx({ file: bytes, password: 'legacy-pass', rootFolderId: 'root', now: 2000, newId })
    const imported = result.entries[0]
    expect(imported.title).toBe('Old router')
    expect(imported.fields.password).toBe('legacy-secret')
    expect(imported.fields.totp).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(result.report.totp).toBe(1)
  })
})
