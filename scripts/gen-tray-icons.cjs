// Generates resources/tray-open.png and resources/tray-quit.png — small monochrome
// glyphs for the tray context-menu items. Pure Node (zlib), no image deps, so it runs
// anywhere. Re-run with `npm run gen:tray-icons`.
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 32
// Neutral gray: legible on both light and dark system menus (Electron scales to ~16px).
const FG = [138, 138, 138]

// An app window: rectangle outline with a filled title bar.
function isWindow(x, y) {
  const L = 7,
    R = 25,
    T = 8,
    B = 24,
    th = 2
  if (x < L || x > R || y < T || y > B) return false
  const border = x <= L + th - 1 || x >= R - th + 1 || y <= T + th - 1 || y >= B - th + 1
  const titleBar = y <= T + 3
  return border || titleBar
}

// A power symbol: broken ring (gap at top) with a vertical stem.
function isPower(x, y) {
  const cx = 16,
    cy = 18,
    R = 8,
    th = 2
  const dx = x - cx
  const dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ang = Math.atan2(dy, dx)
  const gapTop = ang < -Math.PI / 2 + 0.45 && ang > -Math.PI / 2 - 0.45
  const ring = dist >= R - th && dist <= R && !gapTop
  const stem = x >= cx - 1 && x <= cx + 1 && y >= 5 && y <= cy
  return ring || stem
}

function render(draw) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
  let o = 0
  for (let y = 0; y < SIZE; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < SIZE; x++) {
      if (draw(x, y)) {
        raw[o++] = FG[0]
        raw[o++] = FG[1]
        raw[o++] = FG[2]
        raw[o++] = 255
      } else {
        raw[o++] = 0
        raw[o++] = 0
        raw[o++] = 0
        raw[o++] = 0 // transparent
      }
    }
  }
  return raw
}

// --- PNG chunk plumbing (same technique as gen-icon.cjs) ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function png(raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const outDir = path.join(__dirname, '..', 'resources')
fs.mkdirSync(outDir, { recursive: true })
for (const [name, draw] of [
  ['tray-open.png', isWindow],
  ['tray-quit.png', isPower]
]) {
  const out = path.join(outDir, name)
  fs.writeFileSync(out, png(render(draw)))
  console.log('wrote', out)
}
