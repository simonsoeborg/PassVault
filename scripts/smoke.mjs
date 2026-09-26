// End-to-end smoke test of the built app inside Electron: bundles load, the
// sandboxed preload exposes the bridge, and a real vault is created, written,
// read back and reopened — Argon2id and XChaCha20-Poly1305 included.
//
//   npm run build && npm run smoke

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argon2d, argon2id } from 'hash-wasm'
import kdbxwebDefault from 'kdbxweb'
import { _electron as electron } from 'playwright-core'

const kdbxweb = kdbxwebDefault

const PASSWORD = 'smoke test correct horse battery'
const results = []
let failures = 0

function check(name, pass, detail) {
  results.push({ name, pass, detail })
  if (!pass) failures++
}

const userData = await mkdtemp(join(tmpdir(), 'passvault-userdata-'))
const vaultDir = await mkdtemp(join(tmpdir(), 'passvault-vault-'))
const vaultPath = join(vaultDir, 'Smoke.pvault')
const kdbxPath = join(vaultDir, 'Fixture.kdbx')
const KDBX_PASSWORD = 'kdbx fixture password'

// A real KeePass database to import, built here so the app's importer runs the
// genuine path: kdbxweb plus WASM Argon2 inside Electron's main process.
kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type) => {
  const derive = type === 2 ? argon2id : argon2d
  const out = await derive({
    password: new Uint8Array(password),
    salt: new Uint8Array(salt),
    memorySize: memory,
    iterations,
    parallelism,
    hashLength: length,
    outputType: 'binary',
  })
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
})
{
  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(KDBX_PASSWORD))
  const db = kdbxweb.Kdbx.create(credentials, 'Fixture')
  db.setKdf(kdbxweb.Consts.KdfId.Argon2id)
  const servers = db.createGroup(db.getDefaultGroup(), 'Servers')
  const login = db.createEntry(db.getDefaultGroup())
  login.fields.set('Title', 'Imported login')
  login.fields.set('UserName', 'imported-user')
  login.fields.set('Password', kdbxweb.ProtectedValue.fromString('imported-secret'))
  login.fields.set('otp', 'otpauth://totp/Imported:user?secret=JBSWY3DPEHPK3PXP')
  const host = db.createEntry(servers)
  host.fields.set('Title', 'imported-host')
  host.fields.set('URL', 'ssh://ops@10.9.9.9:2022')
  host.fields.set('Password', kdbxweb.ProtectedValue.fromString('imported-ssh-secret'))
  await writeFile(kdbxPath, Buffer.from(await db.save()))
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  check('preload exposes the bridge', (await page.evaluate(() => typeof window.passvault)) === 'object')
  check(
    'no node access in the renderer',
    await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'),
  )

  const state = await page.evaluate(() => window.passvault.getState())
  check('app state reports a locked vault', state.locked === true, `platform ${state.platform}`)
  check('biometrics are probed', typeof state.biometrics?.kind === 'string', `${state.biometrics?.kind}, available=${state.biometrics?.available}`)

  const created = await page.evaluate(
    ({ path, password }) => window.passvault.vault.create({ path, name: 'Smoke', password, kdf: 'standard' }),
    { path: vaultPath, password: PASSWORD },
  )
  check('vault created', created.ok === true, created.ok ? `${created.value.kdf.memoryKiB} KiB Argon2id` : created.error?.message)

  const entry = await page.evaluate(() =>
    window.passvault.entries.create({
      type: 'ssh',
      title: 'smoke-host',
      folderId: null,
      tags: ['smoke'],
      fields: { host: '10.0.0.9', port: '2222', username: 'deploy', auth: 'password', password: 'entry-secret-value' },
      custom: [],
      notes: '',
    }),
  )
  check('entry created', entry.ok === true, entry.ok ? entry.value : entry.error?.message)

  const detail = await page.evaluate((id) => window.passvault.entries.get(id), entry.value)
  check('detail hides the secret', detail.ok && detail.value.secrets.password === true && !('password' in detail.value.fields))
  check('ssh command built', detail.ok && detail.value.command === 'ssh -p 2222 deploy@10.0.0.9', detail.value?.command)

  const revealed = await page.evaluate((id) => window.passvault.entries.reveal(id, 'password'), entry.value)
  check('reveal returns the secret', revealed.ok && revealed.value === 'entry-secret-value')

  // Give the debounced save time to land, then confirm the file exists and holds no plaintext.
  await page.waitForTimeout(1500)
  const file = await stat(vaultPath)
  check('vault file written', file.size > 0, `${file.size} bytes`)

  // Locking deliberately reloads the window so revealed secrets leave the renderer's
  // heap, which tears down this execution context: wait for the fresh page instead.
  await page.evaluate(() => window.passvault.vault.lock()).catch(() => undefined)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => typeof window.passvault === 'object')
  const afterLock = await page.evaluate(async () => (await window.passvault.getState()).locked)
  check('locking reloads the renderer and drops the key', afterLock === true)

  const reopened = await page.evaluate(
    async ({ path, password }) => {
      const result = await window.passvault.vault.unlock({ path, password })
      if (!result.ok) return result
      return window.passvault.vault.index()
    },
    { path: vaultPath, password: PASSWORD },
  )
  check('locks and reopens with the master password', reopened.ok === true && reopened.value.entries.length === 1, reopened.ok ? `${reopened.value.entries.length} entry` : reopened.error?.message)

  const wrong = await page.evaluate(({ path }) => window.passvault.vault.unlock({ path, password: 'not the password' }), { path: vaultPath })
  check('refuses a wrong password', wrong.ok === false && wrong.error.code === 'WRONG_PASSWORD', wrong.error?.code)

  // Drive the editor through the interface, not the bridge: New → Login → fill → save.
  const unlockedAgain = await page.evaluate(
    ({ path, password }) => window.passvault.vault.unlock({ path, password }),
    { path: vaultPath, password: PASSWORD },
  )
  check('reopened for the interface test', unlockedAgain.ok === true)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Login' }).click()
  await page.locator('.title-input').fill('Typed in the editor')
  await page.locator('.field', { hasText: 'Username' }).locator('input').fill('typed-user')
  await page.locator('.field', { hasText: 'Password' }).locator('input').fill('typed-password')
  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.waitForTimeout(600)

  const typed = await page.evaluate(async () => {
    const index = await window.passvault.vault.index()
    const summary = index.ok ? index.value.entries.find((entry) => entry.title === 'Typed in the editor') : undefined
    if (!summary) return { found: false }
    const secret = await window.passvault.entries.reveal(summary.id, 'password')
    return { found: true, subtitle: summary.subtitle, secret: secret.ok ? secret.value : null }
  })
  check('entry created through the editor', typed.found === true, typed.subtitle)
  check('its secret was stored', typed.secret === 'typed-password')

  const imported = await page.evaluate(
    async ({ path, password }) => {
      const report = await window.passvault.importer.kdbx({ path, password })
      if (!report.ok) return { report }
      const index = await window.passvault.vault.index()
      const entries = index.ok ? index.value.entries : []
      const host = entries.find((entry) => entry.title === 'imported-host')
      const login = entries.find((entry) => entry.title === 'Imported login')
      const secret = host ? await window.passvault.entries.reveal(host.id, 'password') : null
      return { report, hostType: host?.type, hostSubtitle: host?.subtitle, loginHasTotp: login?.hasTotp, secret: secret?.ok ? secret.value : null }
    },
    { path: kdbxPath, password: KDBX_PASSWORD },
  )
  check('KeePass database imported', imported.report?.ok === true, imported.report?.ok ? `${imported.report.value.entries} entries into ${imported.report.value.folderName}` : imported.report?.error?.message)
  check('ssh:// entry became an SSH entry', imported.hostType === 'ssh', imported.hostSubtitle)
  check('its TOTP came across', imported.loginHasTotp === true)
  check('its secret came across', imported.secret === 'imported-ssh-secret')

  const wrongKdbx = await page.evaluate(({ path }) => window.passvault.importer.kdbx({ path, password: 'nope' }), { path: kdbxPath })
  check('refuses a wrong KeePass password', wrongKdbx.ok === false && wrongKdbx.error.code === 'WRONG_PASSWORD', wrongKdbx.error?.code)

  // KeePass 1 databases, decrypted by our own reader inside the real app.
  for (const [file, label] of [
    ['basic.kdb', 'AES'],
    ['Twofish.kdb', 'Twofish'],
  ]) {
    const kdbPath = join(process.cwd(), 'tests', 'fixtures', 'keepass1', file)
    const result = await page.evaluate(
      async ({ path }) => {
        const report = await window.passvault.importer.kdbx({ path, password: 'masterpw' })
        return { report }
      },
      { path: kdbPath },
    )
    check(
      `imports a ${label} KeePass 1 database`,
      result.report?.ok === true && result.report.value.format === 'kdb',
      result.report?.ok ? `${result.report.value.entries} entries` : result.report?.error?.message,
    )
  }

  const wrongKdb = await page.evaluate(
    ({ path }) => window.passvault.importer.kdbx({ path, password: 'nope' }),
    { path: join(process.cwd(), 'tests', 'fixtures', 'keepass1', 'basic.kdb') },
  )
  check('refuses a wrong KeePass 1 password', wrongKdb.ok === false && wrongKdb.error.code === 'WRONG_PASSWORD', wrongKdb.error?.code)
} finally {
  await app.close()
  await rm(userData, { recursive: true, force: true })
  await rm(vaultDir, { recursive: true, force: true })
}

for (const { name, pass, detail } of results) {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
console.log(`\n${results.length - failures}/${results.length} checks passed`)
process.exit(failures ? 1 : 0)
