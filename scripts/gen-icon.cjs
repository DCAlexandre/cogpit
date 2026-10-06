// Generates resources/icon.png — a brass gear on a dark plate. Pure Node (zlib),
// no image deps, so it runs anywhere. Re-run with `npm run gen:icon`.
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 256
const CX = SIZE / 2
const CY = SIZE / 2
const TEETH = 10
const R_OUT = 104
const R_TOOTH = 16
const R_IN = 60
const R_HUB = 34
const R_HOLE = 15

const BG = [15, 17, 23]
const BRASS_HI = [224, 185, 104]
const BRASS_LO = [150, 105, 40]

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function brassAt(y) {
  const t = Math.min(1, Math.max(0, y / SIZE))
  return [lerp(BRASS_HI[0], BRASS_LO[0], t), lerp(BRASS_HI[1], BRASS_LO[1], t), lerp(BRASS_HI[2], BRASS_LO[2], t)]
}

function isGear(x, y) {
  const dx = x - CX
  const dy = y - CY
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ang = Math.atan2(dy, dx)
  const tooth = Math.cos(ang * TEETH) > 0.4 ? R_TOOTH : 0
  const ring = dist >= R_IN && dist <= R_OUT + tooth
  const hub = dist <= R_HUB && dist >= R_HOLE
  const spoke = dist < R_IN && dist > R_HUB && Math.abs(Math.cos(ang * 3)) > 0.86
  return ring || hub || spoke
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
let o = 0
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0 // filter: none
  const brass = brassAt(y)
  for (let x = 0; x < SIZE; x++) {
    if (isGear(x, y)) {
      raw[o++] = brass[0]
      raw[o++] = brass[1]
      raw[o++] = brass[2]
      raw[o++] = 255
    } else {
      raw[o++] = BG[0]
      raw[o++] = BG[1]
      raw[o++] = BG[2]
      raw[o++] = 255
    }
  }
}

// --- PNG chunk plumbing ---
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
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = path.join(__dirname, '..', 'resources', 'icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log('icon written:', out, `(${png.length} bytes)`)
