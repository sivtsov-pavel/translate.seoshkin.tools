import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { config } from '../config.js'

const execFileP = promisify(execFile)
const MAX_PAGES = 60 // защита от гигантских PDF (каждая страница = vision-вызов)

// Конвертирует PDF (буфер) в PNG-страницы в uploadDir через pdftoppm (poppler).
// Возвращает [{ filename }] — как обычные загруженные фото, дальше обрабатываются как страницы.
export async function pdfToImages(buffer) {
  const id = randomUUID()
  const tmpPdf = join(config.uploadDir, `${id}.pdf`)
  await writeFile(tmpPdf, buffer)
  const prefix = join(config.uploadDir, id) // pdftoppm добавит -1.png, -2.png…
  try {
    await execFileP('pdftoppm', ['-png', '-r', '150', '-l', String(MAX_PAGES), tmpPdf, prefix], { timeout: 180000 })
  } finally {
    await unlink(tmpPdf).catch(() => {})
  }
  const all = await readdir(config.uploadDir)
  const pages = all
    .filter(f => f.startsWith(`${id}-`) && f.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return pages.map(f => ({ filename: f }))
}
