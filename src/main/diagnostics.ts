// Keeps the main process alive when there is nowhere to print, and leaves a
// record of warnings and crashes in the OS log folder (~/Library/Logs/PassVault
// on macOS) so a blank window can be diagnosed without a terminal attached.
// Only Node warnings and error stacks are written: never vault data.

import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function record(kind: string, error: Error): void {
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'main.log'), `${new Date().toISOString()} ${kind} ${error.stack ?? `${error.name}: ${error.message}`}\n`)
  } catch {
    // Logging is best-effort.
  }
}

export function installDiagnostics(): void {
  // Started from Finder, macOS can hand the app a stdout/stderr pipe nobody
  // reads. A write to it fails asynchronously (EIO, EPIPE) after console has
  // stopped listening, and the unhandled 'error' event surfaces as a modal
  // "Uncaught Exception" box that blocks the main process, leaving every
  // window blank. Printing is optional, so a broken stream is ignored.
  for (const stream of [process.stdout, process.stderr]) stream.on('error', () => undefined)

  // That alone was not enough on macOS: rc.7 still raised the box from Node's
  // own warning printer (writeOut in node:internal/process/warning). Replace
  // the printer, so a warning goes to the log file and never to a stream.
  process.removeAllListeners('warning')
  process.on('warning', (warning) => record('warning', warning))
  process.on('uncaughtExceptionMonitor', (error) => record('uncaught', error))
}
