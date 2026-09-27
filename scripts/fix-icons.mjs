// Task 20-a: иконки приложений.
// 1) Вырезать 8 системных иконок из фирменного листа юзера (upload/logos_grid.png):
//    weather, music, gallery, phone, calc, clock, calendar, notes.
// 2) У 10 существующих PNG убрать «впечатанные» тёмные углы: кроп по альфе +
//    скруглённая маска (dest-in) → прозрачные углы, как у настоящих иконок ОС.
// Запуск: bun scripts/fix-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const OUT = 'public/img/apps'
mkdirSync(OUT, { recursive: true })

/** Маска скруглённого квадрата (dest-in): обрезает углы в прозрачность. */
async function maskRounded(buf, radiusPx) {
  const meta = await sharp(buf).metadata()
  const { width, height } = meta
  const r = Math.round(radiusPx)
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  )
  return sharp(buf).composite([{ input: svg, blend: 'dest-in' }]).png().toBuffer()
}

/** Bbox пикселей, отличных от фона (или непрозрачных при hasAlpha). */
async function bbox(buf, { bgColor = null, alphaMin = 12, step = 2 } = {}) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let minX = width, minY = height, maxX = -1, maxY = -1
  const bg = bgColor ?? [data[0], data[1], data[2]]
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * channels
      const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2]
      const diff = Math.abs(dr) + Math.abs(dg) + Math.abs(db)
      const alpha = data[i + 3]
      const hit = bgColor != null ? diff > 60 : alpha > alphaMin
      if (hit) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

// ─── 1. Лист юзера: сетка 4×2 ───────────────────────────────────────────────
const SHEET_MAP = [
  // [row, col, appKey] — порядок как на листе (погода, музыка, галерея, телефон / крон, часы? нет: калькулятор, часы, календарь, заметки)
  ['weather', 0, 0],
  ['music', 0, 1],
  ['gallery', 0, 2],
  ['phone', 0, 3],
  ['calc', 1, 0],
  ['clock', 1, 1],
  ['calendar', 1, 2],
  ['notes', 1, 3],
]

async function cropSheet() {
  const sheet = 'upload/logos_grid.png'
  const meta = await sharp(sheet).metadata()
  const W = meta.width, H = meta.height
  // Цвет фона — угол листа
  const { data } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const bg = [data[0], data[1], data[2]]
  console.log('sheet:', W, 'x', H, 'bg:', bg.join(','))

  for (const [key, row, col] of SHEET_MAP) {
    const cellW = Math.floor(W / 4), cellH = Math.floor(H / 2)
    const left = col * cellW, top = row * cellH
    const cell = await sharp(sheet)
      .extract({ left, top, width: cellW, height: cellH })
      .png().toBuffer()
    const box = await bbox(cell, { bgColor: bg, step: 2 })
    if (!box) { console.error('!! пустая ячейка', key); continue }
    const pad = 2
    const cx = Math.max(0, box.left - pad), cy = Math.max(0, box.top - pad)
    const cw = Math.min(cellW - cx, box.width + pad * 2), ch = Math.min(cellH - cy, box.height + pad * 2)
    const icon = await sharp(cell).extract({ left: cx, top: cy, width: cw, height: ch }).png().toBuffer()
    // Скругление под пропорцию самой иконки (iOS ≈ 22.4%) + квадрат 192×192
    const side = Math.max(cw, ch)
    const masked = await maskRounded(icon, side * 0.224)
    const out = await sharp(masked)
      .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer()
    await sharp(out).toFile(`${OUT}/${key}.png`)
    console.log('✓', key, `${cw}x${ch} → 192x192`)
  }
}

// ─── 2. Существующие 10: убрать тёмные углы ────────────────────────────────
const EXISTING = ['avito', 'bank', 'taxes', 'browser', 'settings', 'repair', 'auction', 'career', 'delivery', 'leaderboard']

async function fixExisting() {
  for (const key of EXISTING) {
    const p = `${OUT}/${key}.png`
    const box = await bbox(p, { alphaMin: 12, step: 1 })
    if (!box) { console.error('!! пустой', key); continue }
    // Иконка должна занимать весь холст; если есть прозрачные поля — кропаем
    const base = box.width >= 190 && box.height >= 190
      ? await sharp(p).png().toBuffer()
      : await sharp(p).extract(box).png().toBuffer()
    const side = Math.max(box.width, box.height)
    const masked = await maskRounded(base, side * 0.225)
    const out = await sharp(masked)
      .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer()
    await sharp(out).toFile(p)
    console.log('✓ fix', key, `bbox ${box.width}x${box.height}`)
  }
}

await cropSheet()
await fixExisting()
console.log('done')
