import { app, globalShortcut, nativeTheme } from 'electron'
import type { Settings } from '../shared/types'
import { startAutoLock } from './autolock'
import { AppController } from './controller'
import { registerIpc } from './ipc'
import { buildMenu } from './menu'
import { hardenApp, hardenSession } from './security'
import { WindowManager } from './windows'

// Every renderer runs sandboxed, including ones created by future code.
app.enableSandbox()

const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  hardenApp(devUrl)
  let controller: AppController
  let windows: WindowManager

  const registerShortcut = (accelerator: string) => {
    globalShortcut.unregisterAll()
    try {
      globalShortcut.register(accelerator, () => windows.toggleQuick())
    } catch {
      // An invalid or taken shortcut leaves quick search reachable from the menu.
    }
  }

  const onSettings = (next: Settings, previous: Settings) => {
    if (next.quickShortcut !== previous.quickShortcut) registerShortcut(next.quickShortcut)
    if (next.theme !== previous.theme) {
      nativeTheme.themeSource = next.theme
      windows.applyTheme()
    }
    if (next.hideFromScreenCapture !== previous.hideFromScreenCapture) windows.applyContentProtection(next.hideFromScreenCapture)
  }

  app.whenReady().then(() => {
    hardenSession(devUrl)
    windows = new WindowManager({
      devUrl,
      contentProtection: () => controller.settings.settings.hideFromScreenCapture,
      onMinimize: () => {
        if (controller.settings.settings.lockOnMinimize) void controller.lock('minimized')
      },
    })
    controller = new AppController(
      (event) => windows.broadcast(event),
      () => windows.reloadAll(),
    )
    nativeTheme.themeSource = controller.settings.settings.theme
    nativeTheme.on('updated', () => windows.applyTheme())

    registerIpc(controller, windows, devUrl, onSettings)
    buildMenu({
      devTools: !app.isPackaged,
      command: (command) => {
        windows.showMain()
        windows.broadcast({ type: 'command', command })
      },
      lock: () => void controller.lock('manual'),
    })

    windows.createMain()
    windows.createQuick()
    registerShortcut(controller.settings.settings.quickShortcut)
    startAutoLock({
      settings: () => controller.settings.settings,
      isUnlocked: () => controller.unlocked,
      lock: (reason) => void controller.lock(reason),
    })

    app.on('activate', () => windows.showMain())
  })

  app.on('second-instance', () => windows?.showMain())

  // Quick search keeps working with no window open on macOS.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting || !controller?.unlocked) return
    event.preventDefault()
    quitting = true
    controller
      .lock('manual')
      .catch(() => undefined)
      .finally(() => app.quit())
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    controller?.quick.wipeSessionKeys()
  })
}
