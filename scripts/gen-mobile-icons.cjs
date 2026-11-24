/*
 * Generate the Cogpit Android launcher icons (brass gear on the amber-phosphor
 * plate) at every density — pure Node (zlib), no image deps, no sharp. Writes
 * directly into mobile/android/app/src/main/res/mipmap-* and a 1024 source into
 * mobile/resources/icon.png. Re-run: node scripts/gen-mobile-icons.cjs
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const DARK = [23, 19, 13] // #17130d
const BRASS_HI = [255, 196, 90]
const BRASS_LO = [200, 125, 20]

const clamp = (v) => Math.min(1, Math.max(0, v))
const lerp = (a, b, t) => Math.round(a + (b - a) * t)
const brassAt = (y, size) => {
  const t = clamp(y / size)
  return [lerp(BRASS_HI[0], BRASS_LO[0], t), lerp(BRASS_HI[1], BRASS_LO[1], t), lerp(BRASS_HI[2], BRASS_LO[2], t)]
}

function isGear(x, y, size, gscale) {
  const cx = size / 2
  const cy = size / 2
  const dx = x - cx
  const dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ang = Math.atan2(dy, dx)
  const R_OUT = size * 0.406 * gscale
  const R_TOOTH = size * 0.0625 * gscale
  const R_IN = size * 0.234 * gscale
  const R_HUB = size * 0.133 * gscale
  const R_HOLE = size * 0.0586 * gscale
  const tooth = Math.cos(ang * 10) > 0.4 ? R_TOOTH : 0
  const ring = dist >= R_IN && dist <= R_OUT + tooth
  const hub = dist <= R_HUB && dist >= R_HOLE
  const spoke = dist < R_IN && dist > R_HUB && Math.abs(Math.cos(ang * 3)) > 0.86
  return ring || hub || spoke
}

/** mode: 'launcher' (dark square + gear) | 'round' (dark circle + gear) | 'foreground' (transparent + smaller gear) */
function genPng(size, mode) {
  const gscale = mode === 'foreground' ? 0.62 : 0.86
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let o = 0
  const cx = size / 2
  const r2 = (size / 2) * (size / 2)
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filter: none
    const brass = brassAt(y, size)
    for (let x = 0; x < size; x++) {
      if (isGear(x, y, size, gscale)) {
        raw[o++] = brass[0]
        raw[o++] = brass[1]
        raw[o++] = brass[2]
        raw[o++] = 255
      } else {
        let dark = mode === 'launcher'
        if (mode === 'round') {
          const dx = x - cx
          const dy = y - cx
          dark = dx * dx + dy * dy <= r2
        }
        if (dark) {
          raw[o++] = DARK[0]
          raw[o++] = DARK[1]
          raw[o++] = DARK[2]
          raw[o++] = 255
        } else {
          raw[o++] = 0
          raw[o++] = 0
          raw[o++] = 0
          raw[o++] = 0
        }
      }
    }
  }
  return encodePng(size, raw)
}

// --- PNG plumbing (same as scripts/gen-icon.cjs) ---
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
function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// --- write ---
const RES = path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'res')
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

let count = 0
for (const [d, s] of Object.entries(LAUNCHER)) {
  const dir = path.join(RES, `mipmap-${d}`)
  if (!fs.existsSync(dir)) continue
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), genPng(s, 'launcher'))
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), genPng(s, 'round'))
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), genPng(FOREGROUND[d], 'foreground'))
  count += 3
}
// 1024 source for future @capacitor/assets use
const resDir = path.join(__dirname, '..', 'mobile', 'resources')
fs.mkdirSync(resDir, { recursive: true })
fs.writeFileSync(path.join(resDir, 'icon.png'), genPng(1024, 'launcher'))
count++
console.log(`wrote ${count} icon files into ${RES} (+ mobile/resources/icon.png)`)
