#!/usr/bin/env node
// Переводчик недостающих ключей i18n через gpt-4o-mini (дёшево, батчами).
// Находит ключи, которые есть в ru.js (эталон) и отсутствуют в целевых локалях,
// переводит и аккуратно вписывает в файлы (функции-ключи и эмодзи сохраняются).
//
// Запуск:  OPENAI_API_KEY=... node scripts/translate-i18n-keys.mjs [--dry] [--langs en,de]
//   --dry   только посчитать объём и оценить цену, без вызовов OpenAI
//
// ⚠️ Правило проекта: перед реальным запуском объём/цена согласуются с Павлом.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const I18N_DIR = path.join(__dirname, '..', 'frontend', 'src', 'i18n')
const ALL_LANGS = ['en', 'de', 'uk', 'es', 'fr', 'bg', 'tr', 'ar', 'sq']
const LANG_NAMES = {
  en: 'English', de: 'German', uk: 'Ukrainian', es: 'Spanish', fr: 'French',
  bg: 'Bulgarian', tr: 'Turkish', ar: 'Arabic (MSA)', sq: 'Albanian',
}
const MODEL = 'gpt-4o-mini'
const BATCH = 30

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const langsArg = argv.find(a => a.startsWith('--langs'))
const LANGS = langsArg ? langsArg.split('=')[1].split(',') : ALL_LANGS

// ── сбор листьев (строки/функции/массивы) ────────────────────────────────────
function leaves(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string' || typeof v === 'function' || Array.isArray(v)) out.set(p, v)
    else if (v && typeof v === 'object') leaves(v, p, out)
  }
  return out
}

// Сериализация значения в JS-исходник для вставки в файл локали
function serialize(v) {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
  if (Array.isArray(v)) return `[${v.map(serialize).join(', ')}]`
  return String(v) // функция — уже исходник
}

// ── OpenAI ───────────────────────────────────────────────────────────────────
async function translateBatch(items, langName) {
  const sys = `You are a professional UI localizer for a language-learning app.
Translate the Russian source values into ${langName}. Warm, friendly tutoring tone (informal "you").
Rules:
- Keep ALL emojis and leading symbols (✓, ⚠️, 📷, 💡, →, ⏳ …) exactly as in the source.
- If the source is a JS arrow function, return the SAME arrow function (same parameters,
  same \${...} placeholders untouched) with only the human text translated. Return valid JS.
- If the source is a JSON array, return a JSON array of the same length (translate each element).
- German/Spanish example words (Bach, Schule, llave, der/die/das …) stay unchanged.
- Do not add quotes/formatting beyond the translation itself.
Return JSON: {"items":[{"path":"...","translation":"..."}]} — translation is a plain string,
or the full arrow-function source, or a JSON array (as matching the source type).`
  const user = JSON.stringify({ items: items.map(([p, v]) => ({ path: p, source: typeof v === 'function' ? v.toString() : v })) })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0.2, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  const usage = data.usage || {}
  return { items: parsed.items || [], usage }
}

// Валидация перевода по типу источника
function validate(source, tr) {
  if (typeof source === 'function') {
    if (typeof tr !== 'string') return null
    try {
      const fn = new Function(`return (${tr})`)()
      if (typeof fn !== 'function' || fn.length !== source.length) return null
      return tr.trim()
    } catch { return null }
  }
  if (Array.isArray(source)) {
    const arr = typeof tr === 'string' ? JSON.parse(tr) : tr
    if (!Array.isArray(arr) || arr.length !== source.length) return null
    return arr
  }
  return typeof tr === 'string' && tr.trim() ? tr.trim() : null
}

// ── вставка в файл локали ────────────────────────────────────────────────────
// Секции — на отступе 2 (`  name: {` … `  },`). Ключи вставляем перед закрывающей.
function insertKeys(fileText, sectionPath, entries) {
  // sectionPath: 'vocabulary' или 'lessons.processing' (вложенная — вставляем в родителя целиком)
  const [top] = sectionPath.split('.')
  const secRe = new RegExp(`^  (?:'${top}'|${top}):\\s*\\{`, 'm')
  const m = fileText.match(secRe)
  const body = entries.map(([key, val]) => `    ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`}: ${serialize(val)},`).join('\n')
  if (!m) {
    // секции нет — добавить целиком перед финальной `}`
    const block = `  ${top}: {\n${body}\n  },\n`
    return fileText.replace(/\n\}\s*$/, `\n${block}}\n`)
  }
  // найти закрывающую `  },` этой секции (баланс скобок от начала секции)
  let i = m.index + m[0].length, depth = 1
  while (i < fileText.length && depth > 0) {
    const ch = fileText[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    i++
  }
  const insertAt = fileText.lastIndexOf('\n', i - 1) + 1 // строка с `  },`
  return fileText.slice(0, insertAt) + body + '\n' + fileText.slice(insertAt)
}

// ── main ─────────────────────────────────────────────────────────────────────
const { ru } = await import(pathToFileURL(path.join(I18N_DIR, 'ru.js')).href)
const ruLeaves = leaves(ru)
let totalMissing = 0
const plan = {}
for (const lang of LANGS) {
  const mod = await import(pathToFileURL(path.join(I18N_DIR, `${lang}.js`)).href + `?v=${Date.now()}`)
  const tgtLeaves = leaves(mod[lang])
  const missing = [...ruLeaves].filter(([p]) => !tgtLeaves.has(p))
  plan[lang] = missing
  totalMissing += missing.length
}
console.log(`Недостающих ключей всего: ${totalMissing} (${LANGS.map(l => `${l}:${plan[l].length}`).join(', ')})`)
const estTokens = totalMissing * 120 // ~вход+выход на ключ
console.log(`Оценка: ~${Math.round(estTokens / 1000)}k токенов gpt-4o-mini ≈ $${(estTokens * 0.4 / 1e6).toFixed(2)}–$${(estTokens * 0.8 / 1e6).toFixed(2)}`)
if (DRY) process.exit(0)
if (!process.env.OPENAI_API_KEY) { console.error('Нет OPENAI_API_KEY'); process.exit(1) }

let usedPrompt = 0, usedCompletion = 0
for (const lang of LANGS) {
  const missing = plan[lang]
  if (!missing.length) { console.log(`${lang}: пропусков нет ✓`); continue }
  console.log(`\n=== ${lang} (${LANG_NAMES[lang]}): ${missing.length} ключей ===`)
  const translations = new Map()
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH)
    let attempt = 0, res
    while (attempt < 3) {
      try { res = await translateBatch(chunk, LANG_NAMES[lang]); break }
      catch (e) { attempt++; console.warn(`  батч ${i / BATCH}: попытка ${attempt} — ${e.message}`); await new Promise(r => setTimeout(r, 1500 * attempt)) }
    }
    if (!res) { console.error(`  батч ${i / BATCH} провален — пропускаю`); continue }
    usedPrompt += res.usage.prompt_tokens || 0
    usedCompletion += res.usage.completion_tokens || 0
    const byPath = new Map(chunk)
    for (const it of res.items) {
      const src = byPath.get(it.path)
      if (src === undefined) continue
      const val = validate(src, it.translation)
      if (val !== null) translations.set(it.path, val)
      else console.warn(`  ⚠️ невалидный перевод: ${it.path}`)
    }
    process.stdout.write(`  ${Math.min(i + BATCH, missing.length)}/${missing.length}\r`)
  }
  // недостающие после валидации — фолбэк: русский оригинал (лучше, чем undefined)
  for (const [p, v] of missing) if (!translations.has(p)) translations.set(p, typeof v === 'function' ? v.toString() : v)

  // группировка по секциям и вставка
  const file = path.join(I18N_DIR, `${lang}.js`)
  let text = fs.readFileSync(file, 'utf8')
  const bySection = {}
  for (const [p, v] of translations) {
    const idx = p.indexOf('.')
    const top = p.slice(0, idx)
    const rest = p.slice(idx + 1)
    if (rest.includes('.')) {
      // вложенный объект (напр. lessons.processing.extracting) — вставляем как вложенную секцию не умеем,
      // кладём объект целиком в родителя: key 'processing' уже существует? тогда пропуск с предупреждением.
      console.warn(`  ⚠️ вложенный путь ${p} — вставь вручную`)
      continue
    }
    ;(bySection[top] ||= []).push([rest, typeof v === 'string' && translations.get(p) === v && typeof ruLeaves.get(p) === 'function' ? v : v])
  }
  for (const [sec, entries] of Object.entries(bySection)) {
    // функции: значение — исходник, пометить как "функция" через obj wrapper
    const prepared = entries.map(([k, v]) => {
      const src = ruLeaves.get(`${sec}.${k}`)
      if (typeof src === 'function') return [k, { toString: () => (typeof v === 'string' ? v : String(v)) }]
      return [k, v]
    })
    text = insertKeys(text, sec, prepared.map(([k, v]) => [k, typeof v === 'object' && !Array.isArray(v) ? v : v]))
  }
  fs.writeFileSync(file, text)
  console.log(`\n${lang}: записано ${translations.size} ключей`)
}
const cost = (usedPrompt * 0.15 + usedCompletion * 0.6) / 1e6
console.log(`\nИтого токенов: prompt=${usedPrompt}, completion=${usedCompletion} → ~$${cost.toFixed(3)}`)
console.log('Проверь: node --input-type=module --check < frontend/src/i18n/<lang>.js и npm run build')
