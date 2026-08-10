import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile, rm, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
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

// ── EPUB ─────────────────────────────────────────────────────────────────────
// EPUB — это zip с xhtml-главами. Распаковываем CLI-unzip'ом (busybox есть в
// образе), порядок глав берём из spine в *.opf. XML/HTML разбираем регулярками —
// для стандартных издательских EPUB этого достаточно, зависимостей не тянем.

// Минимальный декодер HTML-сущностей (+ числовые &#NNN; / &#xHH;)
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' }
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
}

// xhtml-глава → плоский текст: убираем head/style/script, блочные теги = границы абзацев
function xhtmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(head|style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(?:\/(?:p|div|h[1-6]|li|blockquote|tr|section|article)|br\s*\/?|hr\s*\/?)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
  )
}

async function extractEpubText(buffer) {
  const id = randomUUID()
  const tmpEpub = join(config.uploadDir, `${id}.epub`)
  const tmpDir = join(config.uploadDir, id)
  await mkdir(tmpDir, { recursive: true })
  await writeFile(tmpEpub, buffer)
  try {
    await execFileP('unzip', ['-o', '-q', tmpEpub, '-d', tmpDir], { timeout: 60000 })
    // container.xml → путь к .opf (описанию книги)
    const container = await readFile(join(tmpDir, 'META-INF/container.xml'), 'utf8')
    const opfPath = container.match(/full-path="([^"]+)"/)?.[1]
    if (!opfPath) throw new Error('EPUB: не найден content.opf')
    const opf = await readFile(join(tmpDir, opfPath), 'utf8')
    const opfDir = dirname(opfPath)
    const title = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/)?.[1]?.trim() || ''

    // manifest: id → href; spine: порядок глав
    const items = {}
    for (const m of opf.matchAll(/<item\s[^>]*>/g)) {
      const tag = m[0]
      const itemId = tag.match(/\bid="([^"]+)"/)?.[1]
      const href = tag.match(/\bhref="([^"]+)"/)?.[1]
      const type = tag.match(/media-type="([^"]+)"/)?.[1] || ''
      if (itemId && href && /xhtml|html/.test(type)) items[itemId] = href
    }
    let hrefs = [...opf.matchAll(/<itemref\s[^>]*idref="([^"]+)"/g)].map(m => items[m[1]]).filter(Boolean)
    if (!hrefs.length) hrefs = Object.values(items) // фолбэк: все главы в порядке manifest

    const chapters = []
    for (const href of hrefs) {
      const raw = await readFile(join(tmpDir, opfDir, decodeURIComponent(href)), 'utf8').catch(() => '')
      const t = xhtmlToText(raw).trim()
      if (t) chapters.push(t)
    }
    return { text: normalize(chapters.join('\n\n')), sourceType: 'epub', title }
  } finally {
    await unlink(tmpEpub).catch(() => {})
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

// Извлекает читаемый текст из загруженного файла книги.
// PDF → pdftotext (poppler, текстовый слой). EPUB → unzip + разбор xhtml-глав.
// TXT/прочее → как UTF-8. Возвращает { text, sourceType, title? }.
// Для сканов без текстового слоя pdftotext вернёт пусто.
export async function extractBookText(buffer, filename = '') {
  const isZip = buffer.slice(0, 2).toString('latin1') === 'PK'
  const isEpub = /\.epub$/i.test(filename) ||
    (isZip && buffer.slice(0, 100).toString('latin1').includes('application/epub+zip'))
  if (isEpub) return extractEpubText(buffer)

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
