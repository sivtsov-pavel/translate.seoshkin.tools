import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { config } from '../config.js'

const execFileP = promisify(execFile)

// Приводит текст к чистому виду для чтения: единые переводы строк, схлопнутые тройные+ пустые
// строки до двойных (разделитель абзацев), page-break (\f от pdftotext) → пустая строка.
function normalize(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')      // разрыв страницы PDF → граница абзаца
    .replace(/[ \t]+\n/g, '\n')  // хвостовые пробелы
    .replace(/\n{3,}/g, '\n\n')  // не больше одной пустой строки подряд
    .trim()
}

// Бьёт текст книги на абзацы ДЕТЕРМИНИРОВАННО (на сервере) — чтобы индекс абзаца-закладки
// был одинаков при каждом открытии. Предпочитаем деление по пустым строкам (проза);
// если их почти нет (pdftotext построчно) — делим по одиночным переносам.
const PARA_MAX = 450 // целевой размер блока-абзаца (символов) — баланс чтения и гранулярности закладки

export function splitBookParagraphs(text) {
  const t = normalize(text)
  if (!t) return []
  let paras = t.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  if (paras.length < 5 && t.split('\n').length > 20) {
    paras = t.split('\n').map(s => s.trim()).filter(Boolean)          // построчный фолбэк
  }
  // Внутри абзаца одиночные переносы → пробел (текст течёт, удобно читать с телефона)
  paras = paras.map(p => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()).filter(Boolean)

  // Слишком длинные абзацы (или один сплошной блок из PDF) дробим по границам предложений
  // на читаемые куски ~PARA_MAX — так и закладке есть за что зацепиться, и глазу удобнее.
  const out = []
  for (const p of paras) {
    if (p.length <= PARA_MAX) { out.push(p); continue }
    const sentences = p.match(/[^.!?…]+[.!?…]+["»)]?\s*|[^.!?…]+$/g) || [p]
    let cur = ''
    for (const s of sentences) {
      if (cur && (cur + s).length > PARA_MAX) { out.push(cur.trim()); cur = s }
      else cur += s
    }
    if (cur.trim()) out.push(cur.trim())
  }
  return out
}

// Извлекает читаемый текст из загруженного файла книги.
// PDF → pdftotext (poppler, текстовый слой). TXT/прочее → как UTF-8.
// Возвращает { text, sourceType }. Для сканов без текстового слоя pdftotext вернёт пусто.
export async function extractBookText(buffer, filename = '') {
  const isPdf = /\.pdf$/i.test(filename) || buffer.slice(0, 5).toString('latin1') === '%PDF-'
  if (!isPdf) {
    return { text: normalize(buffer.toString('utf8')), sourceType: 'txt' }
  }
  const id = randomUUID()
  const tmpPdf = join(config.uploadDir, `${id}.pdf`)
  const tmpTxt = join(config.uploadDir, `${id}.txt`)
  await writeFile(tmpPdf, buffer)
  try {
    // Без -layout: pdftotext переносит текст в естественный поток (лучше для чтения с телефона)
    await execFileP('pdftotext', ['-enc', 'UTF-8', tmpPdf, tmpTxt], { timeout: 120000 })
    const raw = await readFile(tmpTxt, 'utf8')
    return { text: normalize(raw), sourceType: 'pdf' }
  } finally {
    await unlink(tmpPdf).catch(() => {})
    await unlink(tmpTxt).catch(() => {})
  }
}
