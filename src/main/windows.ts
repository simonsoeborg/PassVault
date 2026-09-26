import { app, BrowserWindow, nativeTheme, screen, type WebPreferences } from 'electron'
import { join } from 'node:path'
import { EVENT_CHANNEL } from '../shared/api'
import type { AppEvent } from '../shared/types'

const GROUND = { dark: '#0c1418', light: '#eef2ef' }
const SYMBOLS = { dark: '#c6d0ce', light: '#243039' }

interface WindowOptions {
  devUrl?: string
  contentProtection: () => boolean
  onMinimize: () => void
}

export class WindowManager {
  main: BrowserWindow | null = null
  quick: BrowserWindow | null = null
  private summonedFromOutside = false

  constructor(private readonly options: WindowOptions) {}

  private webPreferences(): WebPreferences {
    return {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      devTools: !app.isPackaged,
    }
  }

  private get tone(): 'dark' | 'light' {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  private load(win: BrowserWindow, page: 'index' | 'quick'): void {
    if (this.options.devUrl) void win.loadURL(page === 'index' ? this.options.devUrl : `${this.options.devUrl}/quick.html`)
    else void win.loadFile(join(__dirname, '..', 'renderer', `${page}.html`))
  }

  createMain(): BrowserWindow {
    const mac = process.platform === 'darwin'
    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 880,
      minHeight: 580,
      show: false,
      title: 'PassVault',
      backgroundColor: GROUND[this.tone],
      titleBarStyle: mac ? 'hiddenInset' : 'hidden',
      ...(mac
        ? { trafficLightPosition: { x: 18, y: 18 } }
        : { titleBarOverlay: { color: GROUND[this.tone], symbolColor: SYMBOLS[this.tone], height: 44 } }),
      webPreferences: this.webPreferences(),
    })
    win.setContentProtection(this.options.contentProtection())
    win.once('ready-to-show', () => win.show())
    win.on('minimize', () => this.options.onMinimize())
    win.on('closed', () => {
      this.main = null
    })
    this.load(win, 'index')
    this.main = win
    return win
  }

  createQuick(): BrowserWindow {
    const win = new BrowserWindow({
      width: 700,
      height: 480,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: GROUND[this.tone],
      roundedCorners: true,
      webPreferences: this.webPreferences(),
    })
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setContentProtection(this.options.contentProtection())
    win.on('blur', () => {
      if (!win.webContents.isDevToolsOpened()) this.hideQuick()
    })
    win.on('closed', () => {
      this.quick = null
    })
    this.load(win, 'quick')
    this.quick = win
    return win
  }

  toggleQuick(): void {
    const win = this.quick ?? this.createQuick()
    if (win.isVisible()) {
      this.hideQuick()
      return
    }
    this.summonedFromOutside = BrowserWindow.getFocusedWindow() === null
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const [width] = win.getSize()
    win.setPosition(Math.round(workArea.x + (workArea.width - width) / 2), Math.round(workArea.y + workArea.height * 0.18))
    const show = () => {
      win.show()
      win.focus()
      win.webContents.send(EVENT_CHANNEL, { type: 'quick-shown' } satisfies AppEvent)
    }
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', show)
    else show()
  }

  hideQuick(): void {
    if (!this.quick?.isVisible()) return
    this.quick.hide()
    // Hand focus back to the app the user summoned the search from.
    if (process.platform === 'darwin' && this.summonedFromOutside) app.hide()
  }

  showMain(entryId?: string): void {
    this.quick?.hide()
    const win = this.main ?? this.createMain()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (!entryId) return
    const send = () => win.webContents.send(EVENT_CHANNEL, { type: 'focus-entry', id: entryId } satisfies AppEvent)
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
  }

  broadcast(event: AppEvent): void {
    for (const win of [this.main, this.quick]) {
      if (win && !win.isDestroyed()) win.webContents.send(EVENT_CHANNEL, event)
    }
  }

  /** Reloading drops any secret a renderer revealed from its memory. */
  reloadAll(): void {
    for (const win of [this.main, this.quick]) {
      if (win && !win.isDestroyed()) win.webContents.reload()
    }
  }

  applyContentProtection(enabled: boolean): void {
    for (const win of [this.main, this.quick]) {
      if (win && !win.isDestroyed()) win.setContentProtection(enabled)
    }
  }

  applyTheme(): void {
    for (const win of [this.main, this.quick]) {
      if (!win || win.isDestroyed()) continue
      win.setBackgroundColor(GROUND[this.tone])
      if (process.platform !== 'darwin' && win === this.main) {
        win.setTitleBarOverlay({ color: GROUND[this.tone], symbolColor: SYMBOLS[this.tone], height: 44 })
      }
    }
  }
}
