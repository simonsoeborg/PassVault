import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '../shared/types'

export function buildMenu(options: { devTools: boolean; command: (command: AppCommand) => void; lock: () => void }): void {
  const mac = process.platform === 'darwin'
  const separator: MenuItemConstructorOptions = { type: 'separator' }

  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              separator,
              { label: 'Settings…', accelerator: 'Cmd+,', click: () => options.command('settings') },
              separator,
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              separator,
              { role: 'quit' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'Vault',
      submenu: [
        { label: 'New Entry', accelerator: 'CmdOrCtrl+N', click: () => options.command('new-entry') },
        { label: 'Search', accelerator: 'CmdOrCtrl+F', click: () => options.command('search') },
        separator,
        { label: 'Import from KeePass…', click: () => options.command('import') },
        { label: 'Vault Security', click: () => options.command('security') },
        separator,
        { label: 'Lock', accelerator: 'CmdOrCtrl+L', click: () => options.lock() },
        ...(mac
          ? []
          : [separator, { label: 'Settings', accelerator: 'Ctrl+,', click: () => options.command('settings') }, separator, { role: 'quit' } as const]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(options.devTools ? ([{ role: 'reload' }, { role: 'toggleDevTools' }, separator] as MenuItemConstructorOptions[]) : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        separator,
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
