import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import zlib from 'zlib'
import { log } from './logger'

let tray: Tray | null = null
let getWindowRef: (() => BrowserWindow | null) | null = null

// ── PNG generation ────────────────────────────────────────────────────────────
// A solid-color 16×16 PNG built at startup so we always have a visible tray
// icon even when the build doesn't ship a real one. If a real icon exists at
// `<resources>/icon-tray.png` we prefer that.
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
function makeSolidPng(size: number, r: number, g: number, b: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  // One scanline = 1 filter byte + size*3 RGB bytes. Filter type 0 (None).
  const scanline = Buffer.alloc(1 + size * 3)
  for (let x = 0; x < size; x++) {
    scanline[1 + x * 3] = r
    scanline[1 + x * 3 + 1] = g
    scanline[1 + x * 3 + 2] = b
  }
  const raw = Buffer.alloc(scanline.length * size)
  for (let y = 0; y < size; y++) scanline.copy(raw, y * scanline.length)
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function buildIcon(): Electron.NativeImage {
  // Prefer a real icon if the build dropped one alongside the resources.
  const candidates = [
    join(process.resourcesPath || '', 'icon-tray.png'),
    join(app.getAppPath(), 'build', 'icon-tray.png')
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
  }
  // Amber square — visible on both light and dark Windows tray themes.
  const png = makeSolidPng(16, 0xfb, 0xbf, 0x24)
  return nativeImage.createFromBuffer(png)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setupTray(getWindow: () => BrowserWindow | null) {
  if (tray) return tray
  getWindowRef = getWindow
  try {
    tray = new Tray(buildIcon())
  } catch (e) {
    log.error('tray.create-failed', { error: e })
    return null
  }
  tray.setToolTip('Zap')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Zap', click: () => showWindow() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          ;(app as unknown as { isQuitting: boolean }).isQuitting = true
          app.quit()
        }
      }
    ])
  )
  // Single click toggles visibility (Windows convention).
  tray.on('click', () => toggleWindow())
  log.info('tray.ready')
  return tray
}

export function showWindow() {
  const w = getWindowRef?.() ?? null
  if (!w) return
  if (!w.isVisible()) w.show()
  if (w.isMinimized()) w.restore()
  w.focus()
}

export function toggleWindow() {
  const w = getWindowRef?.() ?? null
  if (!w) return
  if (w.isVisible() && !w.isMinimized()) w.hide()
  else showWindow()
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
