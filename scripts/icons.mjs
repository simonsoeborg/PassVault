// Draws the PassVault app icon from the same generator as the in-app rosette:
// the plate the app prints for itself, seeded with 'passvault' (the fallback
// seed a vault without an id gets). Writes build/icon.svg, build/icon.png,
// build/icon.icns, build/icon.ico and build/icons/<n>x<n>.png.
//
//   npm run icons          (needs a display; on a headless box use xvfb-run)
//
// Run under Node it builds the drawings and packs the icon files; it starts
// Electron on itself only to rasterise, since Chromium understands oklch().

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// No top-level await under Electron: in an ESM entry it holds back app 'ready'.
if (process.versions.electron)
  rasterise().catch((error) => {
    console.error(error)
    process.exit(1)
  })
else await main()

async function main() {
  const { rosetteFor } = await import('../src/renderer/src/lib/rosette.ts')
  const root = join(here, '..')
  const build = join(root, 'build')
  const work = mkdtempSync(join(tmpdir(), 'passvault-icons-'))

  // Plate inks are the dark rendition's tokens (DESIGN.md), fixed here because an
  // icon has no theme: the icon is always printed on the ink plate.
  const INK = {
    plate: 'oklch(0.145 0.014 222)',
    lineStrong: 'oklch(0.375 0.02 216)',
    ring: 'oklch(0.56 0.045 200)',
    a: 'oklch(0.78 0.03 195)',
    control: 'oklch(0.82 0.13 165)',
    controlShift: 'oklch(0.8 0.115 205)',
  }

  // A superellipse close to Apple's continuous-corner icon shape.
  function squircle(x, y, size) {
    const n = 5
    const half = size / 2
    let d = ''
    for (let i = 0; i <= 256; i++) {
      const t = (i / 256) * Math.PI * 2
      const c = Math.cos(t)
      const s = Math.sin(t)
      const px = x + half + half * Math.sign(c) * Math.abs(c) ** (2 / n)
      const py = y + half + half * Math.sign(s) * Math.abs(s) ** (2 / n)
      d += `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`
    }
    return `${d}Z`
  }

  /**
   * One icon at `size` px. `inset` is the empty margin around the plate as a share
   * of the canvas: macOS icons keep Apple's 100/1024 grid so they sit with the
   * system's own; Windows and Linux small sizes use the whole square.
   */
  function drawing(size, inset) {
    const plateSize = size * (1 - 2 * inset)
    const origin = size * inset
    const center = size / 2
    // Below ~200px of plate the full interlace fills in to a solid disc, so the
    // icon switches to the rosette's own small format, as the app's badge does.
    const small = plateSize < 200
    const g = rosetteFor('passvault', small ? 'small' : 'full')
    const diameter = plateSize * (small ? 0.9 : 0.86)
    const scale = diameter / 200
    const px = (value) => Math.max(value, 0.7).toFixed(2)
    const stroke = small
      ? plateSize < 40
        ? { ring: px(plateSize / 26), a: px(plateSize / 22) }
        : { ring: px(plateSize / 40), a: px(plateSize / 34) }
      : { ring: px(size / 680), a: px(size / 720), b: px(size / 620) }
    const frame = plateSize >= 128
    const frameInset = plateSize * 0.045

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <!-- Optically variable ink: the control ink shifting from emerald to blue across the plate. -->
    <linearGradient id="ovi" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.2" stop-color="${INK.control}"/>
      <stop offset="0.8" stop-color="${INK.controlShift}"/>
    </linearGradient>
    <clipPath id="plate"><path d="${squircle(origin, origin, plateSize)}"/></clipPath>
  </defs>
  <path d="${squircle(origin, origin, plateSize)}" fill="${INK.plate}"/>
  ${frame ? `<path d="${squircle(origin + frameInset, origin + frameInset, plateSize - 2 * frameInset)}" fill="none" stroke="${INK.lineStrong}" stroke-width="${px(size / 512)}"/>` : ''}
  <g clip-path="url(#plate)"><g fill="none" stroke-linejoin="round" transform="translate(${center} ${center}) scale(${scale})">
    <g stroke="${INK.ring}" opacity="${small ? 0.9 : 0.7}">${g.ring.map((d) => `<path d="${d}" stroke-width="${stroke.ring}" vector-effect="non-scaling-stroke"/>`).join('')}</g>
    ${small ? '' : `<path d="${g.b}" stroke="url(#ovi)" stroke-width="${stroke.b}" opacity="0.85" vector-effect="non-scaling-stroke"/>`}
    <path d="${g.a}" stroke="${small ? 'url(#ovi)' : INK.a}" stroke-width="${stroke.a}" opacity="${small ? 1 : 0.85}" vector-effect="non-scaling-stroke"/>
  </g></g>
</svg>`
  }

  const MAC = 100 / 1024
  const jobs = []
  const add = (name, size, inset) => jobs.push({ name, size, svg: drawing(size, inset) })

  // macOS: every icns slot, on Apple's grid.
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) add(`mac-${size}`, size, MAC)
  // Windows and Linux: small sizes fill the square, larger ones share the macOS plate.
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) add(`os-${size}`, size, size <= 48 ? 0.03 : MAC)

  writeFileSync(join(work, 'jobs.json'), JSON.stringify(jobs))
  const electron = (await import('electron')).default
  // The window only ever loads the drawings above from local files, and Linux
  // hosts often lack the setuid sandbox helper, so run it without the sandbox.
  const result = spawnSync(electron, ['--no-sandbox', fileURLToPath(import.meta.url), work], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`Electron exited with ${result.status}`)

  const png = (name) => readFileSync(join(work, `${name}.png`))

  mkdirSync(join(build, 'icons'), { recursive: true })
  writeFileSync(join(build, 'icon.svg'), jobs.find((job) => job.name === 'mac-1024').svg)
  writeFileSync(join(build, 'icon.png'), png('mac-1024'))
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    writeFileSync(join(build, 'icons', `${size}x${size}.png`), png(`os-${size}`))
  }

  // ICO: PNG-compressed entries, which Windows has read since Vista.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoImages = icoSizes.map((size) => png(`os-${size}`))
  const header = Buffer.alloc(6 + 16 * icoSizes.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(icoSizes.length, 4)
  let offset = header.length
  icoSizes.forEach((size, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(icoImages[i].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += icoImages[i].length
  })
  writeFileSync(join(build, 'icon.ico'), Buffer.concat([header, ...icoImages]))

  // ICNS: PNG entries for every 1x and 2x slot.
  const icnsSlots = [
    ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
    ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
  ]
  const chunks = icnsSlots.map(([type, size]) => {
    const data = png(`mac-${size}`)
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([head, data])
  })
  const icnsHead = Buffer.alloc(8)
  icnsHead.write('icns', 0, 'ascii')
  icnsHead.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
  writeFileSync(join(build, 'icon.icns'), Buffer.concat([icnsHead, ...chunks]))

  rmSync(work, { recursive: true, force: true })
  console.log(`Wrote build/icon.{svg,png,icns,ico} and 9 sizes in build/icons`)
}

async function rasterise() {
  const { app, BrowserWindow } = await import('electron')
  const work = process.argv.at(-1)
  const jobs = JSON.parse(readFileSync(join(work, 'jobs.json'), 'utf8'))
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  app.disableHardwareAcceleration()
  // One window per size, closed as it goes: do not quit when the last one closes.
  app.on('window-all-closed', () => {})
  await app.whenReady()
  for (const job of jobs) {
    const win = new BrowserWindow({
      width: job.size,
      height: job.size,
      useContentSize: true,
      show: false,
      transparent: true,
      frame: false,
      webPreferences: { offscreen: true },
    })
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${job.svg}`
    const page = join(work, `${job.name}.html`)
    writeFileSync(page, html)
    await win.loadFile(page)
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: job.size, height: job.size })
    writeFileSync(join(work, `${job.name}.png`), image.resize({ width: job.size, height: job.size, quality: 'best' }).toPNG())
    win.destroy()
  }
  app.quit()
}
