// Own one headless browser per capture, including browsers whose launcher exits early.
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function launchCaptureBrowser(exe, args, dir, log = () => {}) {
  const parent = path.resolve(dir)
  fs.mkdirSync(parent, { recursive: true })
  const profile = fs.mkdtempSync(path.join(parent, 'shot-profile-'))
  const child = spawn(exe, [...args, `--user-data-dir=${profile}`, '--remote-debugging-port=0'], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = '', error = null, closed = false
  child.stderr.on('data', (buf) => { stderr = (stderr + buf.toString()).slice(-3000) })
  child.on('error', (e) => { error = e })
  async function close() {
    if (closed) return
    closed = true
    // Edge can hand work to a child and exit its launcher. Close the actual browser
    // through its own random localhost DevTools port, not just the launcher PID.
    try {
      const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0])
      if (Number.isInteger(port) && port > 0 && port < 65536) {
        const info = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) })).json()
        await new Promise((resolve) => {
          const ws = new WebSocket(info.webSocketDebuggerUrl)
          const finish = () => { clearTimeout(timer); try { ws.close() } catch {}; resolve() }
          const timer = setTimeout(finish, 2500)
          ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
          ws.addEventListener('close', finish, { once: true })
          ws.addEventListener('error', finish, { once: true })
        })
      }
    } catch {} // Browser may already have exited after --screenshot.
    await delay(300)
    if (child.pid && child.exitCode == null && child.signalCode == null) {
      if (process.platform === 'win32') {
        await new Promise((resolve) => execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()))
      } else { try { child.kill('SIGKILL') } catch {} }
      await delay(300)
    }
    // Only remove the specific directory mkdtemp created below our data directory.
    const resolved = path.resolve(profile)
    if (path.dirname(resolved) === parent && path.basename(resolved).startsWith('shot-profile-')) {
      try { await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }) }
      catch (e) { log('snapshot profile cleanup: ' + e.message) }
    }
  }
  return {
    child, profile, close,
    get error() { return error },
    diagnostic() { return error?.message || `exit=${child.exitCode ?? 'running'} ${stderr.trim().slice(-600)}` },
  }
}

export async function waitForCaptureFile(file, browser, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    // File completion is authoritative: the Edge launcher may exit before rendering.
    try {
      const b = fs.readFileSync(file)
      if (b.length > 60000 && b.readUInt32BE(0) === 0x89504e47 && b.subarray(-8, -4).toString() === 'IEND') return true
    } catch {}
    if (browser.error) throw browser.error
    await delay(150)
  }
  throw new Error('截图文件未生成：' + browser.diagnostic())
}
