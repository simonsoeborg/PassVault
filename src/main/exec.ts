import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Finds an executable on PATH (plus extra directories) without invoking a shell. */
export function findExecutable(name: string, extraDirs: string[] = []): string | null {
  const dirs = [...extraDirs, ...(process.env.PATH ?? '').split(delimiter)].filter(Boolean)
  const names = process.platform === 'win32' && !/\.(exe|cmd|bat)$/i.test(name) ? [`${name}.exe`, name] : [name]
  for (const dir of dirs) {
    for (const candidate of names) {
      const full = join(dir, candidate)
      try {
        accessSync(full, constants.X_OK)
        return full
      } catch {
        // keep looking
      }
    }
  }
  return null
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export function run(
  command: string,
  args: string[],
  options: { input?: Uint8Array | string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, options.timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
    child.stdin.on('error', () => {
      // The child may exit before reading stdin; the exit code tells the story.
    })
    if (options.input !== undefined) child.stdin.end(options.input)
    else child.stdin.end()
  })
}

/** Starts a GUI program that outlives this process. */
export function launchDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
