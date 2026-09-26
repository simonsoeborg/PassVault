import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TerminalPref } from '../../shared/types'
import { findExecutable, launchDetached } from '../exec'
import { isSafeSshArg } from './command'

interface Launcher {
  pref: TerminalPref
  name: string
  available: () => boolean
  launch: (command: string, args: string[]) => Promise<void>
}

function appleScript(lines: string[]): Promise<void> {
  return launchDetached('/usr/bin/osascript', lines.flatMap((line) => ['-e', line]))
}

const macWezterm = () => findExecutable('wezterm', ['/Applications/WezTerm.app/Contents/MacOS'])

const MAC: Launcher[] = [
  {
    pref: 'terminal',
    name: 'Terminal',
    available: () => true,
    launch: (command) => appleScript([`tell application "Terminal" to do script "${command}"`, 'tell application "Terminal" to activate']),
  },
  {
    pref: 'iterm',
    name: 'iTerm',
    available: () => existsSync('/Applications/iTerm.app'),
    launch: (command) =>
      appleScript([
        'tell application "iTerm"',
        `create window with default profile command "${command}"`,
        'activate',
        'end tell',
      ]),
  },
  {
    pref: 'ghostty',
    name: 'Ghostty',
    available: () => existsSync('/Applications/Ghostty.app'),
    launch: (_command, args) => launchDetached('/usr/bin/open', ['-na', 'Ghostty.app', '--args', '-e', 'ssh', ...args]),
  },
  {
    pref: 'wezterm',
    name: 'WezTerm',
    available: () => macWezterm() !== null,
    launch: (_command, args) => launchDetached(macWezterm()!, ['start', '--', 'ssh', ...args]),
  },
]

function windowsTerminal(): string | null {
  const apps = process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps')] : []
  return findExecutable('wt', apps)
}

const WINDOWS: Launcher[] = [
  {
    pref: 'windows-terminal',
    name: 'Windows Terminal',
    available: () => windowsTerminal() !== null,
    launch: (_command, args) => launchDetached(windowsTerminal()!, ['ssh', ...args]),
  },
  {
    pref: 'terminal',
    name: 'Command Prompt',
    available: () => true,
    launch: (_command, args) => launchDetached(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'start', '""', 'ssh.exe', ...args]),
  },
]

function linuxLauncher(pref: TerminalPref, name: string, binary: string, prefix: string[]): Launcher {
  return {
    pref,
    name,
    available: () => findExecutable(binary) !== null,
    launch: (_command, args) => launchDetached(findExecutable(binary)!, [...prefix, 'ssh', ...args]),
  }
}

const LINUX: Launcher[] = [
  linuxLauncher('gnome-terminal', 'GNOME Terminal', 'gnome-terminal', ['--']),
  linuxLauncher('konsole', 'Konsole', 'konsole', ['-e']),
  linuxLauncher('wezterm', 'WezTerm', 'wezterm', ['start', '--']),
  linuxLauncher('auto', 'Terminal', 'x-terminal-emulator', ['-e']),
  linuxLauncher('auto', 'Xfce Terminal', 'xfce4-terminal', ['-x']),
  linuxLauncher('auto', 'kitty', 'kitty', []),
  linuxLauncher('auto', 'Alacritty', 'alacritty', ['-e']),
  linuxLauncher('auto', 'foot', 'foot', []),
  linuxLauncher('auto', 'XTerm', 'xterm', ['-e']),
]

function launchers(): Launcher[] {
  if (process.platform === 'darwin') return MAC
  if (process.platform === 'win32') return WINDOWS
  return LINUX
}

export function detectTerminals(): TerminalPref[] {
  const found = launchers()
    .filter((launcher) => launcher.pref !== 'auto' && launcher.available())
    .map((launcher) => launcher.pref)
  return ['auto', ...new Set(found)]
}

export async function launchSsh(args: string[], pref: TerminalPref): Promise<{ terminal: string }> {
  if (!args.every(isSafeSshArg)) throw new Error('Refusing to launch an unvalidated ssh command.')
  const available = launchers().filter((launcher) => launcher.available())
  const chosen = available.find((launcher) => launcher.pref === pref) ?? available[0]
  if (!chosen) throw new Error('No terminal app was found. Choose one in Settings → SSH.')
  const command = ['ssh', ...args.filter((arg) => arg !== '--')].join(' ')
  await chosen.launch(command, args)
  return { terminal: chosen.name }
}
