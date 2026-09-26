// Captures the built app's windows into .impeccable/review/ for design review.
// The vault it fills is synthetic sample content in a throwaway folder.
//
//   npm run build && node scripts/capture.mjs

import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const OUT = '.impeccable/review'
const PASSWORD = 'capture correct horse battery staple'

const userData = await mkdtemp(join(tmpdir(), 'passvault-capture-ud-'))
const vaultDir = await mkdtemp(join(tmpdir(), 'passvault-capture-vault-'))
await mkdir(OUT, { recursive: true })

const folders = [
  { name: 'Infrastructure', parentId: null },
  { name: 'Work', parentId: null },
  { name: 'Personal', parentId: null },
]

const entries = (folderIds) => [
  { type: 'ssh', title: 'db-primary', folderId: folderIds[0], tags: ['postgres'], favorite: true, fields: { host: '10.0.4.12', port: '2222', username: 'deploy', auth: 'key', privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nc2FtcGxlIGNhcHR1cmUga2V5IC0gbm90IGEgcmVhbCBrZXkgYXQgYWxsLCBzYW1wbGU=\n-----END OPENSSH PRIVATE KEY-----', keyPassphrase: 'sample-passphrase', jumpHost: 'ops@bastion.example.net:22' } },
  { type: 'ssh', title: 'bastion', folderId: folderIds[0], fields: { host: 'bastion.example.net', username: 'ops', auth: 'agent' } },
  { type: 'ssh', title: 'k8s-control-1', folderId: folderIds[0], fields: { host: '10.0.8.3', username: 'core', auth: 'agent' } },
  { type: 'ssh', title: 'build-runner', folderId: folderIds[0], fields: { host: 'runner.staging.example.net', port: '2200', username: 'ci', auth: 'password', password: 'summer2024' } },
  { type: 'login', title: 'GitHub', folderId: folderIds[1], favorite: true, fields: { username: 'simon', password: 'qF7-vtRm2-Wkx4-Ld9pN', url: 'https://github.com', totp: 'otpauth://totp/GitHub:simon?secret=JBSWY3DPEHPK3PXP&issuer=GitHub' } },
  { type: 'login', title: 'AWS root account', folderId: folderIds[0], tags: ['break-glass'], fields: { username: 'root@example.net', password: 'Hx4-pLm9-Qr2v-Tz7B', url: 'https://console.aws.amazon.com', totp: 'otpauth://totp/AWS:root?secret=JBSWY3DPEHPK3PXP' } },
  { type: 'login', title: 'Cloudflare', folderId: folderIds[0], fields: { username: 'simon@example.net', password: 'Vb8-kQt3-Zm6x-Rp1D', url: 'https://dash.cloudflare.com' } },
  { type: 'login', title: 'Grafana', folderId: folderIds[0], fields: { username: 'admin', password: 'shared-sample-password', url: 'https://grafana.example.net' } },
  { type: 'login', title: 'Sentry', folderId: folderIds[1], fields: { username: 'simon@example.net', password: 'shared-sample-password', url: 'https://sentry.io' } },
  { type: 'login', title: 'Fastmail', folderId: folderIds[2], fields: { username: 'simon@example.net', password: 'Jd5-wNc8-Yh3q-Bk9M', url: 'https://app.fastmail.com' } },
  { type: 'apiKey', title: 'Stripe live key', folderId: folderIds[1], tags: ['billing'], fields: { keyId: 'pk_live_51SampleOnly', secret: 'sk_live_sample_only_not_real', environment: 'production', endpoint: 'https://api.stripe.com', expiresAt: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10) } },
  { type: 'apiKey', title: 'npm publish token', folderId: folderIds[1], fields: { keyId: 'npm_SampleOnly', secret: 'npm_sample_only_not_real', environment: 'production', expiresAt: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) } },
  { type: 'note', title: 'AWS break-glass runbook', folderId: folderIds[0], tags: ['runbook'], fields: { body: 'Sample note body for capture.' } },
  { type: 'note', title: 'GitHub recovery codes', folderId: folderIds[1], fields: { body: 'Sample recovery codes for capture.' } },
  { type: 'card', title: 'Company Visa', folderId: folderIds[1], fields: { cardholder: 'S. Soborg', number: '4242424242424242', expiry: '11/27', cvv: '123' } },
  { type: 'identity', title: 'Passport', folderId: folderIds[2], fields: { fullName: 'Simon Soborg', email: 'simon@example.net', phone: '+45 00 00 00 00', documentType: 'Passport', documentNumber: '000000000', issuer: 'Denmark', documentExpiry: new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10) } },
]

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const shot = async (page, name) => {
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(OUT, name) })
  console.log(`captured ${name}`)
}
const resize = (width, height) =>
  app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isAlwaysOnTop())
    win?.setSize(size.width, size.height)
  }, { width, height })

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => window.passvault.settings.update({ theme: 'dark', autoLockMinutes: 0 }))
  await resize(1280, 820)

  const created = await page.evaluate(
    ({ path, password }) => window.passvault.vault.create({ path, name: 'Personal', password, kdf: 'standard' }),
    { path: join(vaultDir, 'Personal.pvault'), password: PASSWORD },
  )
  if (!created.ok) throw new Error(`create failed: ${created.error.message}`)
  await shot(page, 'empty-1280.png')

  const folderIds = await page.evaluate(async (list) => {
    const ids = []
    for (const folder of list) {
      const result = await window.passvault.folders.create(folder)
      ids.push(result.ok ? result.value : null)
    }
    return ids
  }, folders)

  await page.evaluate(async (list) => {
    for (const entry of list) {
      await window.passvault.entries.create({ tags: [], custom: [], notes: '', ...entry })
    }
  }, entries(folderIds))
  await page.waitForTimeout(900)

  // Give one entry a history so the revision list and its in-register compare have something to show.
  await page.evaluate(async () => {
    const index = await window.passvault.vault.index()
    const github = index.ok ? index.value.entries.find((entry) => entry.title === 'GitHub') : undefined
    if (!github) return
    const base = { type: 'login', title: 'GitHub', folderId: github.folderId, tags: [], custom: [], notes: '' }
    await window.passvault.entries.update(github.id, { ...base, fields: { username: 'simon', password: 'Kp3-rXm7-Qw2t-Vn8L', url: 'https://github.com' } })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await window.passvault.entries.update(github.id, {
      ...base,
      fields: { username: 'simon', password: 'qF7-vtRm2-Wkx4-Ld9pN', url: 'https://github.com', totp: 'otpauth://totp/GitHub:simon?secret=JBSWY3DPEHPK3PXP&issuer=GitHub' },
    })
  })
  await page.waitForTimeout(700)

  await page.getByRole('option', { name: /db-primary/ }).click()
  await shot(page, 'window-1280.png')

  await resize(1440, 900)
  await page.getByRole('option', { name: /GitHub/ }).first().click()
  await page.getByRole('button', { name: 'Show', exact: true }).first().click()
  await shot(page, 'desktop.png')

  // The copy receipt and its clearing countdown: the story's trust anchor.
  await page.getByRole('button', { name: 'Copy password' }).click()
  await shot(page, 'receipt-1440.png')

  // A past revision printed in the same register as the current values.
  await page.getByRole('button', { name: 'Compare' }).first().click()
  await shot(page, 'revisions-1440.png')
  await page.getByRole('button', { name: 'Hide' }).last().click()

  await resize(900, 620)
  await shot(page, 'narrow-900.png')

  // A 16-digit card number is the widest thing the field grid ever has to hold.
  await page.getByRole('option', { name: /Company Visa/ }).click()
  await page.getByRole('button', { name: 'Show', exact: true }).first().click()
  await shot(page, 'card-900.png')

  await resize(1440, 900)
  await page.evaluate(() => window.passvault.settings.update({ theme: 'light' }))
  await shot(page, 'light-1440.png')
  await page.evaluate(() => window.passvault.settings.update({ theme: 'dark' }))

  // The import panel, run against a real KeePass 1 database with the file
  // chooser stubbed, so the result panel shows figures from an actual import.
  await resize(1280, 820)
  await app.evaluate(({ BrowserWindow, dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isAlwaysOnTop())
    win?.webContents.send('pv:event', { type: 'command', command: 'import' })
  }, join(process.cwd(), 'tests', 'fixtures', 'keepass1', 'basic.kdb'))
  await page.getByRole('button', { name: /Choose database file/ }).click()
  await page.getByLabel(/Its password/i).fill('masterpw')
  await page.getByRole('button', { name: /^Import$/ }).click()
  await page.waitForSelector('.import-done', { timeout: 15_000 })
  await shot(page, 'import-1280.png')

  // Quick search lives in its own always-on-top window.
  await app.evaluate(({ BrowserWindow }) => {
    const quick = BrowserWindow.getAllWindows().find((candidate) => candidate.isAlwaysOnTop())
    quick?.show()
  })
  const quickPage = app.windows().find((candidate) => candidate.url().includes('quick'))
  if (quickPage) {
    await quickPage.waitForLoadState('domcontentloaded')
    await quickPage.evaluate(() => window.dispatchEvent(new Event('focus')))
    await shot(quickPage, 'quick-700.png')
  } else {
    console.log('quick window not found')
  }

  await page.evaluate(() => window.passvault.vault.lock()).catch(() => undefined)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => typeof window.passvault === 'object')
  await shot(page, 'unlock-1440.png')
} finally {
  await app.close()
  await rm(userData, { recursive: true, force: true })
  await rm(vaultDir, { recursive: true, force: true })
}
