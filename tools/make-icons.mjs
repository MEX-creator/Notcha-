import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function roundedRectSdf(x, y, left, top, right, bottom, radius) {
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const halfW = (right - left) / 2 - radius
  const halfH = (bottom - top) / 2 - radius
  const dx = Math.abs(x - cx) - halfW
  const dy = Math.abs(y - cy) - halfH
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  const inside = Math.min(Math.max(dx, dy), 0)
  return outside + inside - radius
}

function makePng(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = size / 256
  // notch silhouette: flat top, rounded bottom corners, light gradient fill
  const left = 26 * scale
  const right = 230 * scale
  const top = -30 * scale
  const bottom = 148 * scale
  const radius = 58 * scale
  const inset = 2.4 * scale

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5
      const py = y + 0.5
      const distance = roundedRectSdf(px, py, left, top, right, bottom, radius)
      const coverage = Math.max(0, Math.min(1, 0.5 - distance / Math.max(0.8, 1.4 * scale)))
      if (coverage <= 0) continue

      const t = Math.min(1, Math.max(0, (py - top) / (bottom - top)))
      const r = Math.round(232 - t * 74)
      const g = Math.round(238 - t * 62)
      const b = 255
      const index = (y * size + x) * 4
      pixels[index] = r
      pixels[index + 1] = g
      pixels[index + 2] = b
      pixels[index + 3] = Math.round(coverage * 255)

      // soft inner cut-out so the glyph reads as a notch, not a blob
      const inner = roundedRectSdf(
        px,
        py,
        left + 30 * scale,
        top,
        right - 30 * scale,
        bottom - 34 * scale,
        Math.max(2, radius - 22 * scale)
      )
      const innerCoverage = Math.max(0, Math.min(1, 0.5 - inner / Math.max(0.8, 1.4 * scale)))
      if (innerCoverage > 0) {
        pixels[index] = 12
        pixels[index + 1] = 14
        pixels[index + 2] = 20
        pixels[index + 3] = Math.round(coverage * innerCoverage * 255)
      }
      void inset
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function makeIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

const root = process.cwd()
mkdirSync(path.join(root, 'resources'), { recursive: true })
mkdirSync(path.join(root, 'build'), { recursive: true })

writeFileSync(path.join(root, 'resources', 'tray.png'), makePng(64))
const icon = makePng(256)
writeFileSync(path.join(root, 'build', 'icon.png'), icon)
writeFileSync(path.join(root, 'build', 'icon.ico'), makeIco(icon))
console.log('icons written')
